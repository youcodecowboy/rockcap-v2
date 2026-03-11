// =============================================================================
// V4 PIPELINE ORCHESTRATOR
// =============================================================================
// Main entry point for the V4 document processing pipeline.
//
// Architecture (7 stages):
// 1. Pre-process documents (truncation, hints, tag generation) — no LLM
// 2. Load references from shared library (cached, 1-hour TTL)
// 3. Select relevant references based on batch document hints
// 4. Load skill instructions (SKILL.md) — includes intelligence extraction
// 5. Chunk batch & call API for classification + intelligence extraction (single call)
// 6. Apply deterministic placement rules (post-processing)
// 7. Assemble and return structured results
//
// Key features:
// - Batch processing: 15 docs = 2 API calls instead of 15
// - Mock mode: Full pipeline without API key (for development/testing)
// - Placement rules: Deterministic folder routing overrides model suggestion
// - Auto-detects mock mode when ANTHROPIC_API_KEY is missing

import type {
  BatchDocument,
  BatchClassifyResult,
  DocumentClassification,
  IntelligenceField,
  ChecklistItem,
  FolderInfo,
  CorrectionContext,
  ClientContext,
  V4PipelineConfig,
  ReferenceDocument,
} from '../types';
import { DEFAULT_V4_CONFIG, BATCH_LIMITS } from '../types';
import { loadSkill } from './skill-loader';
import { loadReferencesWithMeta } from './reference-library';
import { formatForPrompt, getAllReferences } from '../../lib/references';
import { preprocessDocument, chunkBatch } from './document-preprocessor';
import { buildSystemPrompt, buildBatchUserMessage, callAnthropicBatch, type SystemPromptBlocks } from './anthropic-client';
import { callMockBatch } from './mock-client';
import { resolvePlacement, getTypeAbbreviation } from './placement-rules';
import type { PlacementResult } from './placement-rules';

// =============================================================================
// MAIN PIPELINE FUNCTION
// =============================================================================

export interface PipelineInput {
  /** Raw files to process */
  files: Array<{
    file: File | { name: string; size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> };
    /** Pre-extracted text content (if available from existing extraction) */
    extractedText?: string;
  }>;
  /** Full extracted text per document index (untruncated, for intelligence extraction) */
  fullTexts?: Map<number, string>;
  /** Client/project context */
  clientContext: ClientContext;
  /** Available folders */
  availableFolders: FolderInfo[];
  /** Missing checklist items */
  checklistItems: ChecklistItem[];
  /** Past corrections for learning */
  corrections?: CorrectionContext[];
  /** User-provided instructions for this batch (e.g., "These are all KYC documents") */
  instructions?: string;
  /** Pipeline configuration */
  config: V4PipelineConfig;
  /** Folder hints from webkitRelativePath — maps file index to subfolder name */
  folderHints?: Map<number, string>;
}

/** Extended result that includes placement decisions and intelligence */
export interface V4PipelineResult extends BatchClassifyResult {
  /** Per-document placement decisions (deterministic, post-classification) */
  placements: Record<number, PlacementResult>;
  /** Per-document intelligence fields from dedicated extraction call */
  intelligence: Record<number, IntelligenceField[]>;
  /** Whether mock mode was used */
  isMock: boolean;
}

/**
 * Run the V4 batch classification pipeline.
 *
 * This is the main entry point. It:
 * 1. Pre-processes all documents (no LLM)
 * 2. Loads relevant references (cached)
 * 3. Batches documents into optimal API call groups
 * 4. Calls Claude (or mock) for batch classification
 * 5. Applies deterministic placement rules
 * 6. Returns structured results for all documents
 */
export async function runV4Pipeline(input: PipelineInput): Promise<V4PipelineResult> {
  const startTime = Date.now();
  const config = { ...DEFAULT_V4_CONFIG, ...input.config };

  // Auto-detect mock mode: use mock if no API key or explicitly requested
  const isMock = config.useMock || !config.anthropicApiKey;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[V4 PIPELINE] Processing ${input.files.length} document(s)`);
  console.log(`[V4 PIPELINE] Mode: ${isMock ? 'MOCK (no API key)' : `LIVE (${config.primaryModel})`}`);
  console.log(`${'='.repeat(70)}`);

  // ──────────────────────────────────────────────────────────
  // STAGE 1: PRE-PROCESS DOCUMENTS (no LLM, pure heuristics)
  // ──────────────────────────────────────────────────────────
  console.log(`\n[STAGE 1] Pre-processing ${input.files.length} documents...`);
  const preprocessStart = Date.now();

  const batchDocuments: BatchDocument[] = await Promise.all(
    input.files.map((f, i) => preprocessDocument(f.file, i, f.extractedText))
  );

  // Attach folder hints from webkitRelativePath
  if (input.folderHints) {
    for (const doc of batchDocuments) {
      const hint = input.folderHints.get(doc.index);
      if (hint) {
        doc.hints.folderHint = hint;
      }
    }
  }

  console.log(`[STAGE 1] Pre-processed in ${Date.now() - preprocessStart}ms`);
  for (const doc of batchDocuments) {
    console.log(`  - "${doc.fileName}": hint=${doc.hints.filenameTypeHint || 'none'}, tags=[${doc.hints.matchedTags.join(',')}]`);
  }

  // ──────────────────────────────────────────────────────────
  // STAGE 2+3: RESOLVE REFERENCES (smart scoring from shared library)
  // ──────────────────────────────────────────────────────────
  console.log(`\n[STAGE 2] Resolving references from shared library...`);
  const refStart = Date.now();

  let selectedReferences: ReferenceDocument[] = [];
  let referencePromptText = '';
  let cachedHit = false;

  if (config.loadReferences) {
    // Load ALL references (not per-document selection) so the system prompt is
    // identical across API calls. This enables Anthropic prompt caching — the first
    // call writes ~18K tokens to cache, all subsequent calls read at 10% cost.
    // Trade-off: larger prompt (~18K vs ~5K) but massive cache savings in bulk uploads.
    const allRefs = getAllReferences();

    // Format with full classification detail (descriptions, identification rules, disambiguation)
    referencePromptText = formatForPrompt(allRefs, 'classification');

    // Load Convex user-created definitions (merge any custom types not in shared library)
    if (config.convexClient) {
      const userRefResult = await loadReferencesWithMeta(config.convexClient, config.referenceCacheTtlMs);
      cachedHit = userRefResult.cacheHit;
      const systemFileTypes = new Set(allRefs.map(r => r.fileType.toLowerCase()));
      const extraUserRefs = userRefResult.references.filter(
        r => r.source === 'user' && !systemFileTypes.has(r.fileType.toLowerCase())
      );
      if (extraUserRefs.length > 0) {
        referencePromptText += '\n\n## Additional User-Defined References\n';
        referencePromptText += extraUserRefs.map(ref =>
          `### ${ref.fileType} (${ref.category})\nTags: ${ref.tags.join(', ')}\nKeywords: ${ref.keywords.join(', ')}\n${ref.content}`
        ).join('\n\n');
      }
    }

    // Map to V4 simplified format for mock client and metadata
    selectedReferences = allRefs.map(ref => ({
      id: ref.id,
      fileType: ref.fileType,
      category: ref.category,
      tags: ref.tags.map(t => t.value),
      content: ref.description,
      keywords: ref.keywords,
      source: ref.source,
      isActive: ref.isActive,
      updatedAt: ref.updatedAt,
    }));

    console.log(`[STAGE 2] Loaded all ${allRefs.length} references for caching in ${Date.now() - refStart}ms`);
  }

  // ──────────────────────────────────────────────────────────
  // STAGE 4: LOAD SKILL INSTRUCTIONS
  // ──────────────────────────────────────────────────────────
  console.log(`\n[STAGE 4] Loading classification skill...`);

  let skillInstructions: string;
  try {
    const skill = loadSkill('document-classify');
    skillInstructions = skill.instructions;
    console.log(`[STAGE 4] Loaded skill: ${skill.metadata.name}`);
  } catch (error) {
    console.warn(`[STAGE 4] Could not load SKILL.md, using inline fallback`);
    skillInstructions = getInlineSkillInstructions();
  }

  // ──────────────────────────────────────────────────────────
  // STAGE 5: CHUNK BATCH & CALL API (or MOCK)
  // ──────────────────────────────────────────────────────────
  console.log(`\n[STAGE 5] ${isMock ? 'Running mock classification' : 'Building API calls'}...`);

  const allClassifications: DocumentClassification[] = [];
  const allErrors: Array<{ documentIndex: number; fileName: string; error: string }> = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalApiCalls = 0;

  if (isMock) {
    // ── MOCK PATH: Use heuristic classifier ──
    try {
      const mockResult = await callMockBatch(
        batchDocuments,
        selectedReferences,
        input.checklistItems,
        config,
      );

      allClassifications.push(...mockResult.classifications);
      totalInputTokens += mockResult.usage.inputTokens;
      totalOutputTokens += mockResult.usage.outputTokens;
      totalApiCalls = 1;

      console.log(`[STAGE 5] Mock classification completed in ${mockResult.latencyMs}ms`);
      for (const cls of mockResult.classifications) {
        console.log(`  - [${cls.documentIndex}] "${cls.fileName}": ${cls.classification.fileType} (${cls.classification.category}) @ ${(cls.classification.confidence * 100).toFixed(0)}%`);
      }
    } catch (error) {
      console.error(`[STAGE 5] Mock classification failed:`, error);
      for (const doc of batchDocuments) {
        allErrors.push({
          documentIndex: doc.index,
          fileName: doc.fileName,
          error: (error as Error).message,
        });
      }
    }
  } else {
    // ── LIVE PATH: Chunk and call Anthropic API ──
    const chunks = chunkBatch(
      batchDocuments,
      BATCH_LIMITS.MAX_DOCS_PER_CALL,
      BATCH_LIMITS.MAX_INPUT_TOKENS_PER_CALL,
    );

    console.log(`[STAGE 5] Split into ${chunks.length} API call(s): ${chunks.map(c => c.length).join(' + ')} docs`);

    const systemPrompt = buildSystemPrompt(
      skillInstructions,
      referencePromptText,
      input.availableFolders,
    );

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(`\n[STAGE 5.${chunkIndex + 1}] Calling API for chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} docs)...`);

      try {
        const userBlocks = buildBatchUserMessage(
          chunk,
          input.checklistItems,
          input.clientContext,
          input.corrections || [],
          input.instructions,
        );

        const result = await callAnthropicBatch(systemPrompt, userBlocks, config);

        allClassifications.push(...result.classifications);
        totalInputTokens += result.usage.inputTokens;
        totalOutputTokens += result.usage.outputTokens;
        totalApiCalls++;

        console.log(`[STAGE 5.${chunkIndex + 1}] Completed in ${result.latencyMs}ms (${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens)`);

        for (const cls of result.classifications) {
          console.log(`  - [${cls.documentIndex}] "${cls.fileName}": ${cls.classification.fileType} (${cls.classification.category}) @ ${(cls.classification.confidence * 100).toFixed(0)}%`);
        }
      } catch (error) {
        console.error(`[STAGE 5.${chunkIndex + 1}] API call failed:`, error);

        for (const doc of chunk) {
          allErrors.push({
            documentIndex: doc.index,
            fileName: doc.fileName,
            error: (error as Error).message,
          });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // STAGE 6: APPLY DETERMINISTIC PLACEMENT RULES
  // ──────────────────────────────────────────────────────────
  console.log(`\n[STAGE 6] Applying placement rules...`);

  const placements: Record<number, PlacementResult> = {};

  for (const cls of allClassifications) {
    const placement = resolvePlacement(cls, input.clientContext);
    placements[cls.documentIndex] = placement;

    // Update the classification with the resolved folder
    cls.classification.suggestedFolder = placement.folderKey;
    cls.classification.targetLevel = placement.targetLevel;

    if (placement.wasOverridden) {
      console.log(`  - [${cls.documentIndex}] OVERRIDE: "${cls.fileName}" → ${placement.folderKey} (${placement.reason})`);
    } else {
      console.log(`  - [${cls.documentIndex}] "${cls.fileName}" → ${placement.folderKey}`);
    }
  }

  // ──────────────────────────────────────────────────────────
  // STAGE 7: ASSEMBLE RESULTS
  // ──────────────────────────────────────────────────────────
  const totalLatencyMs = Date.now() - startTime;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[V4 PIPELINE] Completed in ${totalLatencyMs}ms${isMock ? ' (MOCK)' : ''}`);
  console.log(`[V4 PIPELINE] ${allClassifications.length} classified, ${allErrors.length} errors`);
  console.log(`[V4 PIPELINE] API calls: ${totalApiCalls}, Tokens: ${totalInputTokens} in / ${totalOutputTokens} out`);
  console.log(`${'='.repeat(70)}\n`);

  return {
    success: allErrors.length === 0,
    documents: allClassifications,
    placements,
    intelligence: Object.fromEntries(
      allClassifications.map(cls => [
        cls.documentIndex,
        cls.intelligenceFields || [],
      ])
    ),
    isMock,
    metadata: {
      model: isMock ? 'mock' : config.primaryModel,
      batchSize: input.files.length,
      apiCallsMade: totalApiCalls,
      totalInputTokens,
      totalOutputTokens,
      totalLatencyMs,
      referencesLoaded: selectedReferences.map(r => r.fileType),
      cachedReferenceHit: cachedHit,
    },
    errors: allErrors,
  };
}

// =============================================================================
// INLINE FALLBACK INSTRUCTIONS
// =============================================================================

function getInlineSkillInstructions(): string {
  return `# Document Classification

You are classifying documents for a real estate financing company.

For each document:
1. Identify the document type using the Reference Library
2. Assign a category
3. Suggest a target folder
4. Match to missing checklist items
5. Extract intelligence fields (amounts, dates, entities)

Confidence scoring:
- 0.90+ = Very high, clear match
- 0.75-0.89 = High, strong indicators
- 0.60-0.74 = Medium, some ambiguity
- Below 0.60 = Low, weak match

Tag intelligence fields for template use: lenders_note, perspective, credit_submission.

Return ONLY a JSON array matching the output schema.`;
}

// =============================================================================
// CONVENIENCE: SINGLE DOCUMENT CLASSIFICATION
// =============================================================================

/**
 * Classify a single document. Wraps the batch pipeline for API compatibility.
 */
export async function classifySingleDocument(
  file: File | { name: string; size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> },
  extractedText: string | undefined,
  clientContext: ClientContext,
  availableFolders: FolderInfo[],
  checklistItems: ChecklistItem[],
  config: V4PipelineConfig,
  corrections?: CorrectionContext[],
): Promise<DocumentClassification | null> {
  const result = await runV4Pipeline({
    files: [{ file, extractedText }],
    clientContext,
    availableFolders,
    checklistItems,
    corrections,
    config,
  });

  if (result.documents.length > 0) {
    return result.documents[0];
  }

  return null;
}
