// =============================================================================
// V4 PIPELINE ORCHESTRATOR
// =============================================================================
// Main entry point for the V4 document processing pipeline.
//
// Architecture:
// 1. Pre-process documents (truncation, hints, tag generation)
// 2. Load references from shared library (cached, 1-hour TTL)
// 3. Select relevant references based on batch document hints
// 4. Chunk batch into API-call-sized groups (max 8 docs per call)
// 5. Build system prompt (skill instructions + selected references)
// 6. Build user message (batch documents + checklist + context)
// 7. Call Anthropic API (batch classification)
// 8. Parse and return structured results
//
// Key optimization: batch multiple documents into single API calls.
// 15 documents = ~2-3 API calls instead of 15.

import type {
  BatchDocument,
  BatchClassifyResult,
  DocumentClassification,
  ChecklistItem,
  FolderInfo,
  CorrectionContext,
  ClientContext,
  V4PipelineConfig,
  ReferenceDocument,
} from '../types';
import { DEFAULT_V4_CONFIG, BATCH_LIMITS } from '../types';
import { loadSkill } from './skill-loader';
import { loadReferences, selectReferencesForBatch } from './reference-library';
import { preprocessDocument, chunkBatch, analyzeFilename } from './document-preprocessor';
import { buildSystemPrompt, buildBatchUserMessage, callAnthropicBatch } from './anthropic-client';

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
  /** Client/project context */
  clientContext: ClientContext;
  /** Available folders */
  availableFolders: FolderInfo[];
  /** Missing checklist items */
  checklistItems: ChecklistItem[];
  /** Past corrections for learning */
  corrections?: CorrectionContext[];
  /** Pipeline configuration */
  config: V4PipelineConfig;
}

/**
 * Run the V4 batch classification pipeline.
 *
 * This is the main entry point. It:
 * 1. Pre-processes all documents (no LLM)
 * 2. Loads relevant references (cached)
 * 3. Batches documents into optimal API call groups
 * 4. Calls Claude for batch classification
 * 5. Returns structured results for all documents
 */
export async function runV4Pipeline(input: PipelineInput): Promise<BatchClassifyResult> {
  const startTime = Date.now();
  const config = { ...DEFAULT_V4_CONFIG, ...input.config };

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[V4 PIPELINE] Processing ${input.files.length} document(s)`);
  console.log(`[V4 PIPELINE] Model: ${config.primaryModel}`);
  console.log(`${'='.repeat(70)}`);

  // ──────────────────────────────────────────────────────────
  // STAGE 1: PRE-PROCESS DOCUMENTS (no LLM, pure heuristics)
  // ──────────────────────────────────────────────────────────
  console.log(`\n[STAGE 1] Pre-processing ${input.files.length} documents...`);
  const preprocessStart = Date.now();

  const batchDocuments: BatchDocument[] = await Promise.all(
    input.files.map((f, i) => preprocessDocument(f.file, i, f.extractedText))
  );

  console.log(`[STAGE 1] Pre-processed in ${Date.now() - preprocessStart}ms`);
  for (const doc of batchDocuments) {
    console.log(`  - "${doc.fileName}": hint=${doc.hints.filenameTypeHint || 'none'}, tags=[${doc.hints.matchedTags.join(',')}]`);
  }

  // ──────────────────────────────────────────────────────────
  // STAGE 2: LOAD REFERENCES (cached, 1-hour TTL)
  // ──────────────────────────────────────────────────────────
  console.log(`\n[STAGE 2] Loading reference library...`);
  const refStart = Date.now();

  let allReferences: ReferenceDocument[] = [];
  let cachedHit = false;

  if (config.loadReferences) {
    allReferences = await loadReferences(config.convexClient, config.referenceCacheTtlMs);
    cachedHit = Date.now() - refStart < 10; // If < 10ms, was cached
    console.log(`[STAGE 2] Loaded ${allReferences.length} references (cache ${cachedHit ? 'HIT' : 'MISS'}) in ${Date.now() - refStart}ms`);
  }

  // ──────────────────────────────────────────────────────────
  // STAGE 3: SELECT RELEVANT REFERENCES FOR THIS BATCH
  // ──────────────────────────────────────────────────────────
  console.log(`\n[STAGE 3] Selecting references for batch...`);

  const selectedReferences = selectReferencesForBatch(
    batchDocuments,
    allReferences,
    config.maxReferencesPerCall,
  );

  console.log(`[STAGE 3] Selected ${selectedReferences.length} references: ${selectedReferences.map(r => r.fileType).join(', ')}`);

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
    // Fallback: use inline instructions if SKILL.md not found
    // (e.g., when running from a different directory)
    console.warn(`[STAGE 4] Could not load SKILL.md, using inline fallback`);
    skillInstructions = getInlineSkillInstructions();
  }

  // ──────────────────────────────────────────────────────────
  // STAGE 5: CHUNK BATCH & CALL API
  // ──────────────────────────────────────────────────────────
  console.log(`\n[STAGE 5] Building API calls...`);

  const chunks = chunkBatch(
    batchDocuments,
    BATCH_LIMITS.MAX_DOCS_PER_CALL,
    BATCH_LIMITS.MAX_INPUT_TOKENS_PER_CALL,
  );

  console.log(`[STAGE 5] Split into ${chunks.length} API call(s): ${chunks.map(c => c.length).join(' + ')} docs`);

  // Build system prompt (same for all chunks — cached by Anthropic)
  const systemPrompt = buildSystemPrompt(
    skillInstructions,
    selectedReferences,
    input.availableFolders,
  );

  // Execute all chunks (sequentially for now, could parallelize)
  const allClassifications: DocumentClassification[] = [];
  const allErrors: Array<{ documentIndex: number; fileName: string; error: string }> = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalApiCalls = 0;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    console.log(`\n[STAGE 5.${chunkIndex + 1}] Calling API for chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} docs)...`);

    try {
      const userBlocks = buildBatchUserMessage(
        chunk,
        input.checklistItems,
        input.clientContext,
        input.corrections || [],
      );

      const result = await callAnthropicBatch(systemPrompt, userBlocks, config);

      allClassifications.push(...result.classifications);
      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;
      totalApiCalls++;

      console.log(`[STAGE 5.${chunkIndex + 1}] Completed in ${result.latencyMs}ms (${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens)`);

      // Log per-document results
      for (const cls of result.classifications) {
        console.log(`  - [${cls.documentIndex}] "${cls.fileName}": ${cls.classification.fileType} (${cls.classification.category}) @ ${(cls.classification.confidence * 100).toFixed(0)}%`);
      }
    } catch (error) {
      console.error(`[STAGE 5.${chunkIndex + 1}] API call failed:`, error);

      // Mark all docs in this chunk as failed
      for (const doc of chunk) {
        allErrors.push({
          documentIndex: doc.index,
          fileName: doc.fileName,
          error: (error as Error).message,
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // STAGE 6: ASSEMBLE RESULTS
  // ──────────────────────────────────────────────────────────
  const totalLatencyMs = Date.now() - startTime;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[V4 PIPELINE] Completed in ${totalLatencyMs}ms`);
  console.log(`[V4 PIPELINE] ${allClassifications.length} classified, ${allErrors.length} errors`);
  console.log(`[V4 PIPELINE] API calls: ${totalApiCalls}, Tokens: ${totalInputTokens} in / ${totalOutputTokens} out`);
  console.log(`${'='.repeat(70)}\n`);

  return {
    success: allErrors.length === 0,
    documents: allClassifications,
    metadata: {
      model: config.primaryModel,
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
