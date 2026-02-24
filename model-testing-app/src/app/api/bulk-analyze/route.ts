// =============================================================================
// BULK ANALYZE API ROUTE
// =============================================================================
// Document analysis endpoint using the modular agent pipeline.
// Slimmed down from 3100 lines to use the reusable agent modules.

import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile, validateFile } from '@/lib/fileProcessor';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';
import { getTypeAbbreviation } from '@/lib/documentNaming';
import { getFieldHintsForDocument } from '@/lib/canonicalFields';
import { api } from '../../../../convex/_generated/api';

// Import the modular pipeline
import {
  runDocumentAnalysisPipeline,
  PipelineConfig,
  PipelineInput,
  FolderInfo,
  FileTypeDefinition,
  EnrichedChecklistItem,
  PastCorrection,
} from '@/lib/agents';

export const runtime = 'nodejs';
export const maxDuration = 60;

// =============================================================================
// HELPER: Smart summarization for very long documents
// =============================================================================

import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';
import { fetchWithRetry } from '@/lib/agents/utils/retry';

async function summarizeForClassification(
  fullText: string,
  fileName: string,
  apiKey: string
): Promise<string> {
  const maxSummaryInput = 50000;
  const truncatedForSummary = fullText.slice(0, maxSummaryInput);

  const summaryPrompt = `You are a document summarizer. Create a concise summary that preserves:
1. Document type and purpose
2. Key identifiers (names, dates, amounts, addresses)
3. Main topics and sections
4. Any classification-relevant information

File: ${fileName}

Content:
${truncatedForSummary}

Provide a summary in 2000-3000 words that captures ALL classification-relevant information.`;

  try {
    const response = await fetchWithRetry(
      TOGETHER_API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL_CONFIG.analysis.model,
          messages: [{ role: 'user', content: summaryPrompt }],
          temperature: 0.2,
          max_tokens: 4000,
        }),
      },
      'Summarization'
    );

    if (!response.ok) {
      console.warn('[Bulk Analyze] Summarization failed, using truncation fallback');
      return fullText.slice(0, 32000);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content;

    if (summary) {
      return `[SUMMARIZED FROM ${fullText.length} CHARS]\n\n${summary}`;
    }
  } catch (error) {
    console.warn('[Bulk Analyze] Summarization error:', error);
  }

  return fullText.slice(0, 32000);
}

// =============================================================================
// MAIN POST HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check for internal Convex call (background processing)
    const internalSecret = request.headers.get('x-convex-internal-secret');
    const isInternalCall = internalSecret === process.env.CONVEX_INTERNAL_SECRET;

    // Get authenticated client
    const client = await getAuthenticatedConvexClient();

    // Check authentication (skip for internal Convex calls)
    if (!isInternalCall) {
      try {
        await requireAuth(client);
      } catch (authError) {
        return ErrorResponses.unauthenticated();
      }
    }

    // Get API keys
    const togetherApiKey = process.env.TOGETHER_API_KEY;
    if (!togetherApiKey) {
      return ErrorResponses.internalError('TOGETHER_API_KEY not configured');
    }
    const openaiApiKey = process.env.OPENAI_API_KEY;

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const instructions = formData.get('instructions') as string | null;
    const clientType = (formData.get('clientType') as string | null) || 'borrower';
    const clientId = formData.get('clientId') as string | null;
    const projectId = formData.get('projectId') as string | null;
    const bypassCache = formData.get('bypassCache') === 'true';

    if (!file) {
      return ErrorResponses.badRequest('No file provided');
    }

    // ==========================================================================
    // FETCH CONTEXT DATA FROM DATABASE
    // ==========================================================================

    // Fetch file type definitions
    let fileTypeDefinitions: FileTypeDefinition[] = [];
    try {
      const definitions = await client.query(api.fileTypeDefinitions.getAll, {});
      fileTypeDefinitions = definitions.map((def: any) => ({
        fileType: def.fileType,
        category: def.category,
        keywords: def.keywords || [],
        description: def.description || '',
        identificationRules: def.identificationRules || [],
        categoryRules: def.categoryRules,
      }));
    } catch (error) {
      console.warn('[Bulk Analyze] Failed to fetch file type definitions:', error);
    }

    // Fetch checklist items
    let checklistItems: EnrichedChecklistItem[] = [];
    if (clientId) {
      try {
        const items = await client.query(api.knowledgeLibrary.getAllChecklistItemsForClient, {
          clientId: clientId as any,
          projectId: projectId ? projectId as any : undefined,
        });
        checklistItems = items.map((item: any) => ({
          _id: item._id,
          name: item.name,
          category: item.category,
          status: item.status,
          linkedDocumentCount: item.linkedDocumentCount || 0,
          description: item.description,
          matchingDocumentTypes: item.matchingDocumentTypes || [],
        }));
      } catch (error) {
        console.warn('[Bulk Analyze] Failed to fetch checklist items:', error);
      }
    }

    // Fetch folder structure
    let availableFolders: FolderInfo[] = [];
    if (clientId) {
      try {
        const clientFolders = await client.query(api.clients.getClientFolders, {
          clientId: clientId as any,
        });
        availableFolders.push(...clientFolders.map((f: any) => ({
          folderKey: f.folderType,
          name: f.name,
          level: 'client' as const,
        })));

        if (projectId) {
          const projectFolders = await client.query(api.projects.getProjectFolders, {
            projectId: projectId as any,
          });
          availableFolders.push(...projectFolders.map((f: any) => ({
            folderKey: f.folderType,
            name: f.name,
            level: 'project' as const,
          })));
        }
      } catch (error) {
        console.warn('[Bulk Analyze] Failed to fetch folders:', error);
      }
    }

    // Use default folders if none fetched
    if (availableFolders.length === 0) {
      availableFolders = [
        { folderKey: 'background', name: 'Background', level: 'project' },
        { folderKey: 'terms_comparison', name: 'Terms Comparison', level: 'project' },
        { folderKey: 'credit_submission', name: 'Credit Submission', level: 'project' },
        { folderKey: 'appraisals', name: 'Appraisals', level: 'project' },
        { folderKey: 'notes', name: 'Notes', level: 'project' },
        { folderKey: 'operational_model', name: 'Operational Model', level: 'project' },
        { folderKey: 'kyc', name: 'KYC', level: 'client' },
        { folderKey: 'background_docs', name: 'Background Docs', level: 'client' },
        { folderKey: 'miscellaneous', name: 'Miscellaneous', level: 'client' },
      ];
    }

    // Build file types and categories from definitions
    const fileTypes = fileTypeDefinitions.length > 0
      ? [...new Set(fileTypeDefinitions.map(d => d.fileType)), 'Other']
      : getDefaultFileTypes();

    const categories = fileTypeDefinitions.length > 0
      ? [...new Set(fileTypeDefinitions.map(d => d.category)), 'Other']
      : getDefaultCategories();

    // ==========================================================================
    // VALIDATE AND PROCESS FILE
    // ==========================================================================

    const validation = validateFile(file);
    if (!validation.valid) {
      return ErrorResponses.badRequest(validation.error || 'Invalid file');
    }

    // Handle image files separately (no text extraction possible)
    if (file.type.startsWith('image/')) {
      const typeAbbreviation = getTypeAbbreviation('Other');
      return NextResponse.json({
        success: true,
        result: {
          summary: `Image file: ${file.name}`,
          fileType: 'Image',
          category: 'Other',
          confidence: 0.5,
          suggestedFolder: 'miscellaneous',
          targetLevel: 'project' as const,
          typeAbbreviation,
          originalFileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          suggestedChecklistItems: undefined,
        },
        availableFolders,
      });
    }

    // Extract text from file
    let textContent: string;
    try {
      textContent = await extractTextFromFile(file);
      if (!textContent || textContent.trim().length === 0) {
        return ErrorResponses.badRequest('File appears to be empty or could not extract text');
      }
    } catch (error) {
      return ErrorResponses.badRequest(
        error instanceof Error ? error.message : 'Failed to extract text from file'
      );
    }

    // Process text (summarize if very long)
    const maxTextLength = 32000;
    const summarizationThreshold = 40000;

    let processedText: string;
    if (textContent.length > summarizationThreshold) {
      console.log(`[Bulk Analyze] Document is ${textContent.length} chars, using smart summarization`);
      processedText = await summarizeForClassification(textContent, file.name, togetherApiKey);
    } else if (textContent.length > maxTextLength) {
      processedText = textContent.slice(0, maxTextLength) + '\n\n[Content truncated for analysis...]';
    } else {
      processedText = textContent;
    }

    // Handle minimal text documents (likely scanned)
    const isMinimalText = textContent.trim().length < 200;
    if (isMinimalText) {
      processedText = `[NOTE: Limited text extracted - this may be a scanned/image-based document.]\n\nFilename: "${file.name}"\n\nExtracted content:\n${processedText}`;
    }

    // ==========================================================================
    // BUILD PIPELINE CONFIG
    // ==========================================================================

    const pipelineConfig: PipelineConfig = {
      togetherApiKey,
      openaiApiKey,
      fileTypes,
      categories,
      availableFolders,
      fileTypeDefinitions,
      checklistItems,
      clientType,
      bypassCache,

      // Cache check function
      checkCache: async (contentHash: string) => {
        try {
          const result = await client.query(api.filingFeedback.checkCache, {
            contentHash,
            clientType: undefined,
          });
          if (!result) return null;
          // Map the result to the expected CacheResult type
          return {
            hit: result.hit,
            classification: result.classification ? {
              fileType: result.classification.fileType,
              category: result.classification.category,
              targetFolder: result.classification.targetFolder,
              confidence: result.classification.confidence,
              suggestedChecklistItems: result.classification.suggestedChecklistItems?.map((item: any) => ({
                itemId: item.itemId,
                itemName: item.itemName,
                category: item.category || 'Unknown',
                confidence: item.confidence,
              })),
            } : undefined,
            hitCount: result.hitCount,
            cacheId: result.cacheId?.toString(),
          };
        } catch (error) {
          console.warn('[Cache] Check failed:', error);
          return null;
        }
      },

      // Cache save function
      saveToCache: async (params) => {
        try {
          await client.mutation(api.filingFeedback.cacheClassification, {
            contentHash: params.contentHash,
            fileNamePattern: params.fileNamePattern,
            classification: params.classification,
            clientType: undefined,
          });
        } catch (error) {
          console.warn('[Cache] Save failed:', error);
        }
      },

      // Fetch corrections for self-teaching (full context - for very low confidence)
      fetchCorrections: async (params): Promise<PastCorrection[]> => {
        try {
          const corrections = await client.query(
            api.filingFeedback.getRelevantCorrections,
            {
              fileType: params.fileType,
              category: params.category,
              fileName: params.fileName,
              clientType: undefined,
              limit: params.limit,
            }
          );

          return corrections.map((c: any) => ({
            aiPrediction: c.aiPrediction,
            userCorrection: c.userCorrection,
            fileName: c.fileName,
            matchReason: c.matchReason,
            relevanceScore: c.relevanceScore,
          }));
        } catch (error) {
          console.warn('[Corrections] Fetch failed:', error);
          return [];
        }
      },

      // Fetch consolidated rules (compact context - for medium confidence)
      fetchConsolidatedRules: async (params) => {
        try {
          const result = await client.query(
            api.filingFeedback.getConsolidatedRules,
            {
              fileType: params.fileType,
              category: params.category,
              limit: params.limit || 5,
            }
          );

          // Transform the response into ConsolidatedRule format
          const rules: Array<{
            field: 'fileType' | 'category' | 'folder';
            fromValue: string;
            toValue: string;
            correctionCount: number;
            averageConfidence: number;
            exampleFileName?: string;
          }> = [];

          // Add file type rules
          for (const r of result.fileTypeRules || []) {
            rules.push({
              field: 'fileType',
              fromValue: r.from,
              toValue: r.to,
              correctionCount: r.count,
              averageConfidence: r.avgConfidence || 0.75,
              exampleFileName: r.examples?.[0],
            });
          }

          // Add category rules
          for (const r of result.categoryRules || []) {
            rules.push({
              field: 'category',
              fromValue: r.from,
              toValue: r.to,
              correctionCount: r.count,
              averageConfidence: 0.75, // Category rules don't track confidence
              exampleFileName: r.examples?.[0],
            });
          }

          return rules;
        } catch (error) {
          console.warn('[ConsolidatedRules] Fetch failed:', error);
          return [];
        }
      },

      // Fetch targeted corrections (for specific confusion pairs - for low confidence)
      fetchTargetedCorrections: async (params): Promise<PastCorrection[]> => {
        try {
          const corrections = await client.query(
            api.filingFeedback.getTargetedCorrections,
            {
              confusedBetween: params.confusionPairs.map(p => ({
                field: p.field,
                options: p.options,
              })),
              currentClassification: {
                fileType: params.currentClassification.fileType,
                category: params.currentClassification.category,
                confidence: params.currentClassification.confidence,
              },
              fileName: params.fileName,
              limit: params.limit || 3,
            }
          );

          return corrections.map((c: any) => ({
            aiPrediction: c.aiPrediction,
            userCorrection: c.userCorrection,
            fileName: c.fileName,
            matchReason: c.matchReason,
            relevanceScore: c.relevanceScore,
          }));
        } catch (error) {
          console.warn('[TargetedCorrections] Fetch failed:', error);
          return [];
        }
      },
    };

    // ==========================================================================
    // RUN THE PIPELINE
    // ==========================================================================

    const pipelineInput: PipelineInput = {
      file,
      textContent: processedText,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      instructions: instructions || undefined,
      clientId: clientId || undefined,
      projectId: projectId || undefined,
      clientType,
      bypassCache,
    };

    const pipelineOutput = await runDocumentAnalysisPipeline(pipelineInput, pipelineConfig);

    // ==========================================================================
    // POST-PIPELINE: Check placement rules
    // ==========================================================================

    // Try to look up placement rule from database for better folder suggestion
    try {
      const placementRule = await client.query(api.placementRules.findPlacementRule, {
        clientType: clientType.toLowerCase(),
        documentType: pipelineOutput.result.fileType,
        category: pipelineOutput.result.category,
      });

      if (placementRule) {
        const folderExists = availableFolders.some(f => f.folderKey === placementRule.targetFolderKey);
        if (folderExists) {
          pipelineOutput.result.suggestedFolder = placementRule.targetFolderKey;
          pipelineOutput.result.targetLevel = placementRule.targetLevel;
        }
      }
    } catch (error) {
      console.warn('[Bulk Analyze] Failed to lookup placement rule:', error);
    }

    // ==========================================================================
    // ADD CANONICAL FIELD HINTS
    // ==========================================================================

    const fileTypeHints = getFieldHintsForDocument(pipelineOutput.result.fileType);
    const categoryHints = getFieldHintsForDocument(pipelineOutput.result.category);
    const checklistHints = pipelineOutput.result.suggestedChecklistItems
      ?.flatMap(item => getFieldHintsForDocument(item.itemName)) || [];

    const canonicalFieldHints = [...new Set([...fileTypeHints, ...categoryHints, ...checklistHints])];

    // ==========================================================================
    // RETURN RESPONSE
    // ==========================================================================

    return NextResponse.json({
      success: true,
      result: {
        ...pipelineOutput.result,
        canonicalFieldHints: canonicalFieldHints.length > 0 ? canonicalFieldHints : undefined,
      },
      documentAnalysis: pipelineOutput.documentAnalysis,
      classificationReasoning: pipelineOutput.classificationReasoning,
      availableChecklistItems: pipelineOutput.availableChecklistItems,
      availableFolders: pipelineOutput.availableFolders,
    });
  } catch (error) {
    console.error('[Bulk Analyze] Error:', error);
    return ErrorResponses.internalError(
      error instanceof Error ? error.message : 'Analysis failed'
    );
  }
}

// =============================================================================
// DEFAULT TYPE/CATEGORY LISTS (fallback when DB is empty)
// =============================================================================

function getDefaultFileTypes(): string[] {
  return [
    'Appraisal', 'RedBook Valuation', 'Cashflow',
    'Floor Plans', 'Elevations', 'Sections', 'Site Plans', 'Location Plans',
    'Initial Monitoring Report', 'Interim Monitoring Report', 'Planning Documentation',
    'Contract Sum Analysis', 'Comparables', 'Building Survey', 'Report on Title',
    'Legal Opinion', 'Environmental Report', 'Local Authority Search',
    'Passport', 'Driving License', 'Utility Bill', 'Bank Statement',
    'Application Form', 'Assets & Liabilities Statement', 'Track Record',
    'Certificate of Incorporation', 'Company Search', 'Tax Return',
    'Indicative Terms', 'Credit Backed Terms', 'Term Sheet',
    'Facility Letter', 'Personal Guarantee', 'Corporate Guarantee',
    'Terms & Conditions', 'Shareholders Agreement', 'Share Charge',
    'Debenture', 'Corporate Authorisations', 'Building Contract',
    'Professional Appointment', 'Collateral Warranty', 'Title Deed', 'Lease',
    'Accommodation Schedule', 'Build Programme', 'Specification',
    'Loan Statement', 'Redemption Statement', 'Completion Statement',
    'Invoice', 'Receipt', 'Insurance Policy', 'Insurance Certificate',
    'Email/Correspondence', 'Meeting Minutes',
    'NHBC Warranty', 'Latent Defects Insurance', 'Site Photographs',
    'ID Document', 'Proof of Address', 'CGI/Renders',
    'Other',
  ];
}

function getDefaultCategories(): string[] {
  return [
    'Appraisals', 'Plans', 'Inspections', 'Professional Reports',
    'KYC', 'Loan Terms', 'Legal Documents', 'Project Documents',
    'Financial Documents', 'Insurance', 'Communications', 'Warranties',
    'Photographs', 'Other',
  ];
}
