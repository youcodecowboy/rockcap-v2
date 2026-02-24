// =============================================================================
// V4 SKILLS ARCHITECTURE — PUBLIC API
// =============================================================================
// Main entry point for the V4 document processing system.
//
// Architecture:
// - Skills follow Anthropic Agent Skills standard (SKILL.md + references/)
// - Shared Reference Library with tagging (not per-skill)
// - Batch processing (multiple docs per API call)
// - 1-hour reference cache (small internal team)
// - Multimodal document processing (Claude sees PDFs/images directly)
//
// Usage:
//   import { runV4Pipeline, classifySingleDocument } from '@/v4';
//   import { loadReferences, clearReferenceCache } from '@/v4';
//   import { loadSkill, getAllSkillMetadata } from '@/v4';

// ── Pipeline ──
export { runV4Pipeline, classifySingleDocument } from './lib/pipeline';
export type { PipelineInput } from './lib/pipeline';

// ── Reference Library ──
export {
  loadReferences,
  selectReferencesForBatch,
  clearReferenceCache,
} from './lib/reference-library';

// ── Skill Loader ──
export {
  loadSkill,
  getAllSkillMetadata,
  clearSkillCache,
} from './lib/skill-loader';

// ── Document Pre-processor ──
export {
  preprocessDocument,
  analyzeFilename,
  chunkBatch,
} from './lib/document-preprocessor';

// ── Anthropic Client ──
export {
  buildSystemPrompt,
  buildBatchUserMessage,
  callAnthropicBatch,
} from './lib/anthropic-client';

// ── Types ──
export type {
  // Reference Library
  ReferenceDocument,
  ReferenceLibraryCache,
  // Batch Processing
  BatchDocument,
  DocumentContent,
  SpreadsheetSummary,
  DocumentHints,
  // Classification
  DocumentClassification,
  BatchClassifyResult,
  // Shared
  FolderInfo,
  ChecklistItem,
  CorrectionContext,
  ClientContext,
  // Config
  V4PipelineConfig,
  SkillMetadata,
  SkillDefinition,
} from './types';

export { DEFAULT_V4_CONFIG, BATCH_LIMITS, REFERENCE_CACHE_TTL_MS } from './types';
