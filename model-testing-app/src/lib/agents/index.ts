// =============================================================================
// DOCUMENT ANALYSIS PIPELINE ORCHESTRATOR
// =============================================================================
// Main entry point for the modular document analysis pipeline.
// Coordinates all agents: Summary → Classification → Verification → Checklist → Critic

import { ConvexHttpClient } from 'convex/browser';

// Import types
import {
  PipelineInput,
  PipelineOutput,
  DocumentSummary,
  ClassificationDecision,
  BulkAnalysisResult,
  FolderInfo,
  FileTypeDefinition,
  EnrichedChecklistItem,
  FilenameTypeHint,
  CriticAgentInput,
  PastCorrection,
  ChecklistMatch,
  ConsolidatedRule,
  ConfusionPair,
  CorrectionContextTier,
} from './types';

// Import agents
import { runSummaryAgent, createMinimalTextSummary } from './summary-agent';
import { runClassificationAgent } from './classification-agent';
import { runVerificationAgent, applyVerificationAdjustments } from './verification-agent';
import { runChecklistMatchingAgent, mergeChecklistMatches, ChecklistAgentMatch } from './checklist-agent';
import {
  runCriticAgent,
  shouldRunCriticAgent,
  determineCorrectionTier,
  extractConfusionPairs,
} from './critic-agent';
import {
  getFilenameTypeHints,
  checkFilenamePatterns,
  enrichChecklistItemsWithFilenameMatches,
} from './filename-matcher';
// Deterministic verification (replaces LLM-based verification agent)
import { runDeterministicVerification } from './deterministic-verifier';

// Import utilities
import { generateContentHash, normalizeFilenameForCache } from './utils/cache';
import { findBestTypeMatch, findBestCategoryMatch, matchCategoryToFolder } from './utils/validation';

// Import config
import {
  CONFIDENCE_THRESHOLDS,
  DEFAULT_FILE_TYPES,
  DEFAULT_CATEGORIES,
  DEFAULT_FOLDERS,
  TYPE_ABBREVIATIONS,
} from './config';

// Re-export types and agents for external use
export * from './types';
export { runSummaryAgent } from './summary-agent';
export { runClassificationAgent } from './classification-agent';
// Legacy LLM-based verification (kept for backwards compatibility)
export { runVerificationAgent, applyVerificationAdjustments } from './verification-agent';
// Deterministic verification (recommended - no LLM call)
export { runDeterministicVerification } from './deterministic-verifier';
export { runChecklistMatchingAgent, mergeChecklistMatches } from './checklist-agent';
export {
  runCriticAgent,
  shouldRunCriticAgent,
  determineCorrectionTier,
  extractConfusionPairs,
  buildConsolidatedRulesContext,
  buildTargetedCorrectionsContext,
} from './critic-agent';
export {
  getFilenameTypeHints,
  checkFilenamePatterns,
  enrichChecklistItemsWithFilenameMatches,
} from './filename-matcher';

// =============================================================================
// PIPELINE CONTEXT
// =============================================================================

export interface PipelineConfig {
  togetherApiKey: string;
  openaiApiKey?: string;
  fileTypes: string[];
  categories: string[];
  availableFolders: FolderInfo[];
  fileTypeDefinitions: FileTypeDefinition[];
  checklistItems: EnrichedChecklistItem[];
  clientType?: string;
  bypassCache?: boolean;
  // Convex client for cache operations
  convexClient?: ConvexHttpClient;
  // Function to fetch past corrections (full context - for very low confidence)
  fetchCorrections?: (params: {
    fileType: string;
    category: string;
    fileName: string;
    limit: number;
  }) => Promise<PastCorrection[]>;
  // Function to fetch consolidated rules (compact context - for medium confidence)
  fetchConsolidatedRules?: (params: {
    fileType?: string;
    category?: string;
    limit?: number;
  }) => Promise<ConsolidatedRule[]>;
  // Function to fetch targeted corrections (for specific confusion pairs - for low confidence)
  fetchTargetedCorrections?: (params: {
    confusionPairs: ConfusionPair[];
    currentClassification: {
      fileType: string;
      category: string;
      confidence: number;
    };
    fileName: string;
    limit?: number;
  }) => Promise<PastCorrection[]>;
  // Function to check cache
  checkCache?: (contentHash: string) => Promise<CacheResult | null>;
  // Function to save to cache
  saveToCache?: (params: {
    contentHash: string;
    fileNamePattern: string;
    classification: CachedClassification;
  }) => Promise<void>;
}

export interface CacheResult {
  hit: boolean;
  classification?: CachedClassification;
  hitCount?: number;
  cacheId?: string;
}

export interface CachedClassification {
  fileType: string;
  category: string;
  targetFolder: string;
  confidence: number;
  suggestedChecklistItems?: Array<{
    itemId: string;
    itemName: string;
    category: string;
    confidence: number;
  }>;
}

// =============================================================================
// MAIN PIPELINE FUNCTION
// =============================================================================

/**
 * Run the complete document analysis pipeline
 *
 * Pipeline stages:
 * 1. Cache Check - Skip AI analysis if cached result exists
 * 2. Filename Analysis - Extract hints from filename patterns
 * 3. Summary Agent - Deep document analysis (Together AI)
 * 4. Classification Agent - Classify based on summary (Together AI)
 * 5. Verification Agent - Validate low-confidence results (Together AI)
 * 6. Checklist Agent - Match to checklist items (Together AI)
 * 7. Critic Agent - Final reasoning pass (OpenAI GPT-4o)
 * 8. Cache Save - Store result for future use
 */
export async function runDocumentAnalysisPipeline(
  input: PipelineInput,
  config: PipelineConfig
): Promise<PipelineOutput> {
  const startTime = Date.now();

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[PIPELINE] Starting document analysis for: ${input.fileName}`);
  console.log(`${'='.repeat(70)}`);

  // Generate content hash for caching
  const contentHash = generateContentHash(input.textContent.slice(0, 10000));

  // ========== STAGE 0: CACHE CHECK ==========
  if (!input.bypassCache && config.checkCache) {
    try {
      const cacheResult = await config.checkCache(contentHash);
      if (cacheResult?.hit && cacheResult.classification) {
        console.log(`[PIPELINE] CACHE HIT for ${input.fileName} (hits: ${cacheResult.hitCount})`);

        const cached = cacheResult.classification;
        const typeAbbreviation = getTypeAbbreviation(cached.fileType);

        return {
          success: true,
          result: {
            summary: '[Cached result - re-upload to refresh analysis]',
            fileType: cached.fileType,
            category: cached.category,
            suggestedFolder: cached.targetFolder,
            targetLevel: 'project',
            confidence: cached.confidence,
            confidenceFlag: cached.confidence >= CONFIDENCE_THRESHOLDS.high ? 'high' :
                           cached.confidence >= CONFIDENCE_THRESHOLDS.medium ? 'medium' : 'low',
            requiresReview: cached.confidence < 0.9,
            verificationNotes: 'Classification loaded from cache',
            suggestedChecklistItems: cached.suggestedChecklistItems?.map(item => ({
              ...item,
              reasoning: 'From cache',
            })),
            typeAbbreviation,
            originalFileName: input.fileName,
            fileSize: input.fileSize,
            mimeType: input.mimeType,
            fromCache: true,
            cacheHitCount: cacheResult.hitCount,
          },
          availableFolders: config.availableFolders,
          availableChecklistItems: config.checklistItems,
        };
      }
    } catch (cacheError) {
      console.warn('[PIPELINE] Cache check failed:', cacheError);
    }
  }

  // ========== STAGE 1: FILENAME ANALYSIS ==========
  console.log(`\n[STAGE 1] Running filename analysis...`);

  const filenameTypeHint = getFilenameTypeHints(input.fileName);
  const filenameMatches = checkFilenamePatterns(input.fileName, config.checklistItems);
  const enrichedChecklistItems = enrichChecklistItemsWithFilenameMatches(
    config.checklistItems,
    input.fileName
  );

  if (filenameTypeHint) {
    console.log(`[STAGE 1] Filename hint: ${filenameTypeHint.fileType} (${filenameTypeHint.category})`);
  }
  if (filenameMatches.length > 0) {
    console.log(`[STAGE 1] Filename matches: ${filenameMatches.slice(0, 3).map(m => `${m.itemId}:${m.score.toFixed(2)}`).join(', ')}`);
  }

  // ========== STAGE 2: SUMMARY AGENT ==========
  console.log(`\n[STAGE 2] Running Summary Agent...`);
  const stage2Start = Date.now();

  let documentSummary: DocumentSummary;
  try {
    // Check for minimal text (likely scanned document)
    const isMinimalText = input.textContent.trim().length < 200;
    if (isMinimalText) {
      console.log(`[STAGE 2] Minimal text detected - using fallback summary`);
      documentSummary = createMinimalTextSummary(input.fileName, input.textContent);
    } else {
      documentSummary = await runSummaryAgent(
        input.textContent,
        input.fileName,
        config.togetherApiKey
      );
    }

    console.log(`[STAGE 2] Completed in ${Date.now() - stage2Start}ms`);
    console.log(`[STAGE 2] Raw Content Type: "${documentSummary.rawContentType}"`);
    console.log(`[STAGE 2] Description: "${documentSummary.documentDescription.substring(0, 100)}..."`);
  } catch (summaryError) {
    console.error(`[STAGE 2] Error:`, summaryError);
    documentSummary = createMinimalTextSummary(input.fileName, input.textContent);
  }

  // ========== STAGE 3: CLASSIFICATION AGENT ==========
  console.log(`\n[STAGE 3] Running Classification Agent...`);
  const stage3Start = Date.now();

  let classificationResult: ClassificationDecision;
  try {
    classificationResult = await runClassificationAgent(
      documentSummary,
      input.fileName,
      config.fileTypes,
      config.categories,
      config.availableFolders,
      config.fileTypeDefinitions,
      filenameTypeHint,
      config.togetherApiKey
    );

    console.log(`[STAGE 3] Completed in ${Date.now() - stage3Start}ms`);
    console.log(`[STAGE 3] Result: ${classificationResult.fileType} (${classificationResult.category}) → ${classificationResult.suggestedFolder}`);
    console.log(`[STAGE 3] Confidence: ${(classificationResult.confidence * 100).toFixed(0)}%`);
  } catch (classificationError) {
    console.error(`[STAGE 3] Error:`, classificationError);
    classificationResult = {
      fileType: 'Other',
      category: 'Other',
      suggestedFolder: 'miscellaneous',
      confidence: 0.3,
      reasoning: 'Classification failed - using fallback',
    };
  }

  // ========== POST-CLASSIFICATION VALIDATION ==========
  console.log(`\n[VALIDATION] Validating classification results...`);

  // Validate file type
  let detectedType = classificationResult.fileType;
  if (!config.fileTypes.includes(detectedType)) {
    const typeMatch = findBestTypeMatch(
      detectedType,
      documentSummary.detailedSummary,
      config.fileTypes,
      config.fileTypeDefinitions
    );
    if (typeMatch.fileType !== 'Other') {
      console.log(`[VALIDATION] Type "${detectedType}" → "${typeMatch.fileType}"`);
      detectedType = typeMatch.fileType;
    }
  }

  // Validate category
  let detectedCategory = classificationResult.category;
  if (!config.categories.includes(detectedCategory)) {
    detectedCategory = findBestCategoryMatch(
      detectedCategory,
      documentSummary.detailedSummary,
      config.categories,
      config.fileTypeDefinitions
    );
    console.log(`[VALIDATION] Category validated to: "${detectedCategory}"`);
  }

  // Validate folder
  const allFolderKeys = config.availableFolders.map(f => f.folderKey);
  let folder = classificationResult.suggestedFolder;
  let targetLevel: 'client' | 'project' = 'project';

  if (!allFolderKeys.includes(folder)) {
    const matched = matchCategoryToFolder(detectedCategory, config.availableFolders);
    folder = matched.folderKey;
    targetLevel = matched.level;
    console.log(`[VALIDATION] Folder "${classificationResult.suggestedFolder}" → "${folder}"`);
  } else {
    const matchedFolder = config.availableFolders.find(f => f.folderKey === folder);
    if (matchedFolder) {
      targetLevel = matchedFolder.level;
    }
  }

  // Build initial analysis result
  let analysisResult: BulkAnalysisResult = {
    summary: documentSummary.executiveSummary || 'No summary available',
    fileType: detectedType,
    category: detectedCategory,
    confidence: classificationResult.confidence,
    suggestedFolder: folder,
    targetLevel,
    suggestedChecklistItems: undefined,
  };

  // Add confidence flag
  if (analysisResult.confidence >= CONFIDENCE_THRESHOLDS.high) {
    analysisResult.confidenceFlag = 'high';
    analysisResult.requiresReview = false;
  } else if (analysisResult.confidence >= CONFIDENCE_THRESHOLDS.medium) {
    analysisResult.confidenceFlag = 'medium';
    analysisResult.requiresReview = true;
  } else {
    analysisResult.confidenceFlag = 'low';
    analysisResult.requiresReview = true;
  }

  // ========== STAGE 4: DETERMINISTIC VERIFICATION ==========
  // Replaced LLM-based verification with deterministic keyword scoring
  const shouldVerify = analysisResult.confidence < CONFIDENCE_THRESHOLDS.high;
  if (shouldVerify) {
    console.log(`\n[STAGE 4] Running Deterministic Verification (confidence: ${(analysisResult.confidence * 100).toFixed(0)}%)...`);
    const stage4Start = Date.now();

    // Fetch consolidated rules for correction boost (if available)
    let consolidatedRules: ConsolidatedRule[] = [];
    if (config.fetchConsolidatedRules) {
      try {
        const rulesResult = await config.fetchConsolidatedRules({
          fileType: analysisResult.fileType,
          category: analysisResult.category,
          limit: 10,
        });
        consolidatedRules = rulesResult.fileTypeRules?.map((r: any) => ({
          field: 'fileType' as const,
          fromValue: r.from,
          toValue: r.to,
          correctionCount: r.count,
          averageConfidence: r.avgConfidence || 0.7,
          exampleFileName: r.examples?.[0],
        })) || [];
      } catch (e) {
        console.warn('[STAGE 4] Could not fetch consolidated rules:', e);
      }
    }

    // Run deterministic verification
    const verification = runDeterministicVerification({
      documentSummary,
      classificationResult: {
        fileType: analysisResult.fileType,
        category: analysisResult.category,
        suggestedFolder: analysisResult.suggestedFolder,
        confidence: analysisResult.confidence,
        reasoning: classificationResult.reasoning,
      },
      fileName: input.fileName,
      fileTypeDefinitions: config.fileTypeDefinitions,
      consolidatedRules,
      availableFolders: config.availableFolders,
    });

    // Apply verification adjustments using existing function
    analysisResult = applyVerificationAdjustments(
      analysisResult,
      verification,
      config.availableFolders
    );

    // Recalculate confidence flag after adjustments
    if (analysisResult.confidence >= CONFIDENCE_THRESHOLDS.high) {
      analysisResult.confidenceFlag = 'high';
      analysisResult.requiresReview = false;
    } else if (analysisResult.confidence >= CONFIDENCE_THRESHOLDS.medium) {
      analysisResult.confidenceFlag = 'medium';
    } else {
      analysisResult.confidenceFlag = 'low';
    }

    console.log(`[STAGE 4] Completed in ${Date.now() - stage4Start}ms (deterministic - no LLM call)`);
    console.log(`[STAGE 4] Verified: ${verification.verified}, Notes: ${verification.notes}`);
  } else {
    analysisResult.verificationPassed = true;
    analysisResult.verificationNotes = 'High confidence - verification skipped';
  }

  // Ensure folder is valid after verification
  const finalFolderValid = config.availableFolders.some(f => f.folderKey === analysisResult.suggestedFolder);
  if (!finalFolderValid) {
    console.warn(`[VALIDATION] Final folder ${analysisResult.suggestedFolder} not found, defaulting to miscellaneous`);
    analysisResult.suggestedFolder = 'miscellaneous';
    analysisResult.targetLevel = 'client';
  }

  // ========== STAGE 5: CHECKLIST AGENT ==========
  const hasInitialMatches = analysisResult.suggestedChecklistItems && analysisResult.suggestedChecklistItems.length > 0;
  const hasUnusedFilenameMatches = filenameMatches.some(fm =>
    fm.score >= 0.6 &&
    !analysisResult.suggestedChecklistItems?.some(sci => sci.itemId === fm.itemId)
  );

  if (enrichedChecklistItems.length > 0 && (!hasInitialMatches || hasUnusedFilenameMatches)) {
    console.log(`\n[STAGE 5] Running Checklist Matching Agent...`);
    const stage5Start = Date.now();

    const agentMatches = await runChecklistMatchingAgent(
      input.textContent,
      input.fileName,
      analysisResult.fileType,
      analysisResult.category,
      enrichedChecklistItems,
      filenameMatches,
      config.togetherApiKey
    );

    if (agentMatches.length > 0) {
      // Convert to ChecklistMatch format
      const existingMatches: ChecklistAgentMatch[] = (analysisResult.suggestedChecklistItems || [])
        .map(item => ({
          itemId: item.itemId,
          confidence: item.confidence,
          reasoning: item.reasoning || '',
        }));

      const mergedMatches = mergeChecklistMatches(
        existingMatches,
        agentMatches,
        enrichedChecklistItems
      );

      // Convert back to ChecklistMatch with full details
      analysisResult.suggestedChecklistItems = mergedMatches.map(m => {
        const checklistItem = enrichedChecklistItems.find(ci => ci._id === m.itemId);
        return {
          itemId: m.itemId,
          itemName: checklistItem?.name || 'Unknown',
          category: checklistItem?.category || 'Unknown',
          confidence: m.confidence,
          reasoning: m.reasoning,
        };
      });

      console.log(`[STAGE 5] Completed in ${Date.now() - stage5Start}ms`);
      console.log(`[STAGE 5] Found ${agentMatches.length} matches, merged to ${analysisResult.suggestedChecklistItems.length} total`);
    }
  }

  // ========== STAGE 6: CRITIC AGENT ==========
  const shouldRunCritic = shouldRunCriticAgent(
    {
      fileType: analysisResult.fileType,
      category: analysisResult.category,
      confidence: analysisResult.confidence,
    },
    filenameTypeHint || null
  );

  if (shouldRunCritic && config.openaiApiKey) {
    console.log(`\n[STAGE 6] Running Critic Agent...`);
    const stage6Start = Date.now();

    // ========== SMART CORRECTION RETRIEVAL ==========
    // Determine which tier of corrections to fetch based on confidence
    const hasAlternatives = !!classificationResult.alternativeTypes?.length;
    const correctionTier = determineCorrectionTier(analysisResult.confidence, hasAlternatives);

    console.log(`[STAGE 6] Correction tier: ${correctionTier} (confidence: ${(analysisResult.confidence * 100).toFixed(0)}%)`);

    let pastCorrections: PastCorrection[] = [];
    let consolidatedRules: ConsolidatedRule[] = [];
    let confusionPairs: ConfusionPair[] = [];

    try {
      switch (correctionTier) {
        case 'none':
          // High confidence - no corrections needed
          console.log(`[STAGE 6] High confidence - skipping correction fetch (saves tokens)`);
          break;

        case 'consolidated':
          // Medium confidence - just fetch aggregated rules (~100 tokens)
          if (config.fetchConsolidatedRules) {
            consolidatedRules = await config.fetchConsolidatedRules({
              fileType: analysisResult.fileType,
              category: analysisResult.category,
              limit: 5,
            });
            console.log(`[STAGE 6] Fetched ${consolidatedRules.length} consolidated rules`);
          }
          break;

        case 'targeted':
          // Low confidence - extract confusion pairs and fetch targeted corrections
          confusionPairs = extractConfusionPairs({
            fileType: analysisResult.fileType,
            category: analysisResult.category,
            alternativeTypes: classificationResult.alternativeTypes,
          });

          if (confusionPairs.length > 0 && config.fetchTargetedCorrections) {
            pastCorrections = await config.fetchTargetedCorrections({
              confusionPairs,
              currentClassification: {
                fileType: analysisResult.fileType,
                category: analysisResult.category,
                confidence: analysisResult.confidence,
              },
              fileName: input.fileName,
              limit: 3,
            });
            console.log(`[STAGE 6] Fetched ${pastCorrections.length} targeted corrections for: ${confusionPairs.map(p => p.options.join(' vs ')).join(', ')}`);
          }
          // Also fetch consolidated rules as backup
          if (config.fetchConsolidatedRules) {
            consolidatedRules = await config.fetchConsolidatedRules({
              fileType: analysisResult.fileType,
              limit: 3,
            });
          }
          break;

        case 'full':
        default:
          // Very low confidence - full correction context
          if (config.fetchCorrections) {
            pastCorrections = await config.fetchCorrections({
              fileType: analysisResult.fileType,
              category: analysisResult.category,
              fileName: input.fileName,
              limit: 5,
            });
            console.log(`[STAGE 6] Fetched ${pastCorrections.length} full corrections (low confidence mode)`);
          }
          break;
      }
    } catch (correctionError) {
      console.warn('[STAGE 6] Failed to fetch corrections:', correctionError);
    }

    const criticInput: CriticAgentInput = {
      fileName: input.fileName,
      summary: analysisResult.summary,
      documentSummary,
      classificationReasoning: classificationResult.reasoning,
      initialClassification: {
        fileType: analysisResult.fileType,
        category: analysisResult.category,
        suggestedFolder: analysisResult.suggestedFolder,
        confidence: analysisResult.confidence,
        alternativeTypes: classificationResult.alternativeTypes,
      },
      filenameHint: filenameTypeHint || undefined,
      checklistMatches: (analysisResult.suggestedChecklistItems || []).map(item => ({
        itemId: item.itemId,
        itemName: item.itemName,
        confidence: item.confidence,
        reasoning: item.reasoning,
      })),
      availableFileTypes: config.fileTypes,
      availableFolders: config.availableFolders,
      availableChecklistItems: enrichedChecklistItems,
      // Smart correction data - only include what's needed
      pastCorrections: pastCorrections.length > 0 ? pastCorrections : undefined,
      consolidatedRules: consolidatedRules.length > 0 ? consolidatedRules : undefined,
      confusionPairs: confusionPairs.length > 0 ? confusionPairs : undefined,
      correctionTier,
    };

    const criticResult = await runCriticAgent(criticInput, config.openaiApiKey);

    if (criticResult) {
      console.log(`[STAGE 6] Completed in ${Date.now() - stage6Start}ms`);

      const previousType = analysisResult.fileType;
      const previousCategory = analysisResult.category;

      // Apply critic's final decision
      analysisResult.fileType = criticResult.fileType;
      analysisResult.category = criticResult.category;
      analysisResult.suggestedFolder = criticResult.suggestedFolder;
      analysisResult.confidence = criticResult.confidence;

      // Validate and update folder
      const matchedFolder = config.availableFolders.find(f => f.folderKey === criticResult.suggestedFolder);
      if (matchedFolder) {
        analysisResult.targetLevel = matchedFolder.level;
      } else {
        // Apply category-based fallback
        const categoryFolderMap: Record<string, string> = {
          'KYC': 'kyc',
          'Appraisals': 'appraisals',
          'Plans': 'background',
          'Loan Terms': 'terms_comparison',
          'Legal Documents': 'background',
          'Financial Documents': 'operational_model',
          'Inspections': 'credit_submission',
        };
        const fallbackFolder = categoryFolderMap[analysisResult.category] || 'miscellaneous';
        const fallbackExists = config.availableFolders.find(f => f.folderKey === fallbackFolder);
        if (fallbackExists) {
          analysisResult.suggestedFolder = fallbackFolder;
          analysisResult.targetLevel = fallbackExists.level;
        }
      }

      // Recalculate confidence flag
      if (analysisResult.confidence >= CONFIDENCE_THRESHOLDS.high) {
        analysisResult.confidenceFlag = 'high';
        analysisResult.requiresReview = false;
      } else if (analysisResult.confidence >= CONFIDENCE_THRESHOLDS.medium) {
        analysisResult.confidenceFlag = 'medium';
        analysisResult.requiresReview = true;
      } else {
        analysisResult.confidenceFlag = 'low';
        analysisResult.requiresReview = true;
      }

      // Log changes
      if (previousType !== criticResult.fileType || previousCategory !== criticResult.category) {
        console.log(`[STAGE 6] Corrected: ${previousType} → ${criticResult.fileType}, ${previousCategory} → ${criticResult.category}`);
        analysisResult.verificationNotes = (analysisResult.verificationNotes || '') +
          ` | Critic corrected: ${previousType} → ${criticResult.fileType}. ${criticResult.reasoning}`;
      }

      // Update checklist matches with critic's decision
      if (criticResult.checklistMatches.length > 0) {
        const criticChecklistItems = criticResult.checklistMatches.map(m => {
          const checklistItem = enrichedChecklistItems.find(ci => ci._id === m.itemId);
          return {
            itemId: m.itemId,
            itemName: checklistItem?.name || 'Unknown',
            category: checklistItem?.category || 'Unknown',
            confidence: m.confidence,
            reasoning: m.reasoning,
          };
        });

        // Merge critic matches with existing
        const existingMatches = analysisResult.suggestedChecklistItems || [];
        const mergedMatches = [...criticChecklistItems];

        for (const existing of existingMatches) {
          if (!mergedMatches.some(m => m.itemId === existing.itemId)) {
            mergedMatches.push({
              ...existing,
              confidence: Math.min(existing.confidence * 0.8, 0.6),
              reasoning: (existing.reasoning || '') + ' (not confirmed by critic)',
            });
          }
        }

        analysisResult.suggestedChecklistItems = mergedMatches
          .filter(m => m.confidence >= 0.50)
          .sort((a, b) => b.confidence - a.confidence);
      }

      // Log correction influence
      if (criticResult.correctionInfluence?.appliedCorrections?.length) {
        console.log(`[STAGE 6] Applied corrections: ${criticResult.correctionInfluence.appliedCorrections.join(', ')}`);
      }
    }
  }

  // ========== CACHE SAVE ==========
  if (config.saveToCache && analysisResult.confidence >= 0.7) {
    try {
      await config.saveToCache({
        contentHash,
        fileNamePattern: normalizeFilenameForCache(input.fileName),
        classification: {
          fileType: analysisResult.fileType,
          category: analysisResult.category,
          targetFolder: analysisResult.suggestedFolder,
          confidence: analysisResult.confidence,
          suggestedChecklistItems: analysisResult.suggestedChecklistItems?.map(item => ({
            itemId: item.itemId,
            itemName: item.itemName,
            category: item.category,
            confidence: item.confidence,
          })),
        },
      });
      console.log(`[PIPELINE] Cached classification for ${input.fileName}`);
    } catch (cacheError) {
      console.warn('[PIPELINE] Failed to cache classification:', cacheError);
    }
  }

  // ========== FINAL OUTPUT ==========
  const typeAbbreviation = getTypeAbbreviation(analysisResult.fileType);
  const totalTime = Date.now() - startTime;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[PIPELINE] Completed in ${totalTime}ms`);
  console.log(`[PIPELINE] Final: ${analysisResult.fileType} (${analysisResult.category}) → ${analysisResult.suggestedFolder}`);
  console.log(`[PIPELINE] Confidence: ${(analysisResult.confidence * 100).toFixed(0)}% (${analysisResult.confidenceFlag})`);
  console.log(`${'='.repeat(70)}\n`);

  return {
    success: true,
    result: {
      ...analysisResult,
      typeAbbreviation,
      originalFileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
    },
    documentAnalysis: documentSummary,
    classificationReasoning: classificationResult.reasoning,
    availableChecklistItems: enrichedChecklistItems,
    availableFolders: config.availableFolders,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get type abbreviation for document naming
 */
export function getTypeAbbreviation(fileType: string): string {
  return TYPE_ABBREVIATIONS[fileType] || TYPE_ABBREVIATIONS['Other'] || 'DOC';
}

/**
 * Build default pipeline config when database values aren't available
 */
export function createDefaultPipelineConfig(
  togetherApiKey: string,
  openaiApiKey?: string
): PipelineConfig {
  return {
    togetherApiKey,
    openaiApiKey,
    fileTypes: DEFAULT_FILE_TYPES,
    categories: DEFAULT_CATEGORIES,
    availableFolders: DEFAULT_FOLDERS,
    fileTypeDefinitions: [],
    checklistItems: [],
  };
}
