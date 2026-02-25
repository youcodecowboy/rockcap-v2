// =============================================================================
// V4 SKILLS ARCHITECTURE — TYPE DEFINITIONS
// =============================================================================
// Follows Anthropic Agent Skills standard (skills-2025-10-02)
// with adaptations for batch processing and shared reference library.
//
// Key design decisions:
// - References are SHARED across skills, not per-skill
// - Batch processing: multiple documents per API call
// - 1-hour cache TTL (small internal team)
// - Smart truncation for large documents (30-50+ pages)
// - Intelligence fields tagged for future template population

// =============================================================================
// REFERENCE LIBRARY (shared across all skills)
// =============================================================================

export interface ReferenceDocument {
  /** Unique identifier */
  id: string;
  /** File type this reference describes (e.g., "RedBook Valuation") */
  fileType: string;
  /** Category (e.g., "Appraisals") */
  category: string;
  /** Tags for lightweight matching by the orchestrator */
  tags: string[];
  /** Reference content — guidance text for Claude */
  content: string;
  /** Keywords for matching documents to this reference */
  keywords: string[];
  /** Source: system default or user-created */
  source: 'system' | 'user';
  /** Example file storage ID in Convex (optional visual reference) */
  exampleFileStorageId?: string;
  /** Whether this reference is active */
  isActive: boolean;
  /** Last updated timestamp (for cache invalidation) */
  updatedAt: string;
}

export interface ReferenceLibraryCache {
  /** All active references, loaded once and cached */
  references: ReferenceDocument[];
  /** When this cache was populated */
  cachedAt: number;
  /** Cache TTL in milliseconds (default: 1 hour) */
  ttlMs: number;
}

export const REFERENCE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// =============================================================================
// DOCUMENT BATCH PROCESSING
// =============================================================================

/** A single document in a batch, with pre-processed content */
export interface BatchDocument {
  /** Index in the batch (0-based) */
  index: number;
  /** Original filename */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mediaType: string;
  /** Convex storage ID */
  fileStorageId?: string;
  /**
   * Pre-processed content for Claude (NOT the full document).
   * For PDFs: first 2-3 pages + last page as images, OR extracted text summary.
   * For Excel: extracted sheet names + first 50 rows of key sheets.
   * For images: the image itself.
   * For text: first ~4000 chars + filename.
   */
  processedContent: DocumentContent;
  /** Hints from lightweight pre-processing (filename analysis, basic text scan) */
  hints: DocumentHints;
}

export type DocumentContent =
  | { type: 'text'; text: string }
  | { type: 'pdf_pages'; pages: Array<{ pageNumber: number; base64: string; mediaType: string }> }
  | { type: 'image'; base64: string; mediaType: string }
  | { type: 'spreadsheet'; summary: SpreadsheetSummary };

export interface SpreadsheetSummary {
  sheetNames: string[];
  /** Key data from first rows of each sheet */
  sheetPreviews: Array<{
    sheetName: string;
    headers: string[];
    sampleRows: string[][];
    totalRows: number;
  }>;
}

/** Lightweight hints from pre-processing (no LLM, pure heuristics) */
export interface DocumentHints {
  /** Possible file type from filename patterns */
  filenameTypeHint?: string;
  /** Possible category from filename */
  filenameCategoryHint?: string;
  /** Tags matched from filename/basic text scan */
  matchedTags: string[];
  /** Whether this looks like a financial document */
  isFinancial: boolean;
  /** Whether this looks like a legal document */
  isLegal: boolean;
  /** Whether this is an identity document */
  isIdentity: boolean;
  /** Whether this is a spreadsheet/data file */
  isSpreadsheet: boolean;
  /** Whether this is an image/scan */
  isImage: boolean;
}

// =============================================================================
// BATCH SIZING STRATEGY
// =============================================================================

export const BATCH_LIMITS = {
  /** Max documents per single API call */
  MAX_DOCS_PER_CALL: 8,
  /** Max total tokens estimate per call (leave room for response) */
  MAX_INPUT_TOKENS_PER_CALL: 80_000,
  /** Approximate tokens per truncated document */
  APPROX_TOKENS_PER_DOC: 3_000,
  /** Approximate tokens for reference library context */
  APPROX_TOKENS_FOR_REFERENCES: 5_000,
  /** Approximate tokens for system prompt + skill instructions */
  APPROX_TOKENS_FOR_SYSTEM: 3_000,
  /** Small batch threshold (foreground processing) */
  SMALL_BATCH_THRESHOLD: 5,
  /** Documents above this trigger background processing */
  BACKGROUND_THRESHOLD: 5,
  /** Intelligence extraction: max documents per call */
  INTEL_MAX_DOCS_PER_CALL: 5,
  /** Intelligence extraction: max text chars per document (truncated for batching) */
  INTEL_MAX_TEXT_PER_DOC: 8_000,
  /** Intelligence extraction: max output tokens per call */
  INTEL_MAX_OUTPUT_TOKENS: 8_192,
} as const;

// =============================================================================
// SKILL METADATA (from SKILL.md YAML frontmatter)
// =============================================================================

export interface SkillMetadata {
  /** Skill name: lowercase, hyphens, max 64 chars */
  name: string;
  /** What it does + when to use it, max 1024 chars */
  description: string;
}

// =============================================================================
// CLASSIFY OUTPUT (per document in a batch)
// =============================================================================

export interface DocumentClassification {
  /** Index matching the BatchDocument.index */
  documentIndex: number;
  /** Original filename (for correlation) */
  fileName: string;
  /** Classification result */
  classification: {
    fileType: string;
    category: string;
    suggestedFolder: string;
    targetLevel: 'client' | 'project';
    confidence: number;
    reasoning: string;
    alternativeTypes?: Array<{
      fileType: string;
      category: string;
      confidence: number;
    }>;
  };
  /** Brief summary */
  summary: {
    executiveSummary: string;
    documentPurpose: string;
    keyEntities: {
      people: string[];
      companies: string[];
      locations: string[];
      projects: string[];
    };
    keyTerms: string[];
    keyDates: string[];
    keyAmounts: string[];
  };
  /** Checklist matches */
  checklistMatches: Array<{
    itemId: string;
    itemName: string;
    category: string;
    confidence: number;
    reasoning: string;
  }>;
  /** Intelligence fields extracted (from classification call — lightweight) */
  intelligenceFields: Array<{
    fieldPath: string;
    label: string;
    value: string;
    valueType: 'text' | 'currency' | 'percentage' | 'date' | 'number' | 'boolean';
    confidence: number;
    sourceText: string;
    templateTags: string[];
    category: string;
    originalLabel: string;
    pageReference?: string;
  }>;
}

// =============================================================================
// INTELLIGENCE FIELD (from dedicated extraction call)
// =============================================================================

/** A single intelligence field extracted from a document */
export interface IntelligenceField {
  /** Canonical field path (e.g., "financials.gdv") or custom ("custom.planning_ref") */
  fieldPath: string;
  /** Human-readable label (may be normalized from originalLabel) */
  label: string;
  /** Extracted value (always string for serialization) */
  value: string;
  /** Value type for parsing/display */
  valueType: 'text' | 'currency' | 'percentage' | 'date' | 'number' | 'boolean';
  /** Extraction confidence (0-1), using document authority + value clarity framework */
  confidence: number;
  /** Evidence quote from the document */
  sourceText: string;
  /** Whether this maps to a known canonical field path */
  isCanonical: boolean;
  /** Whether this belongs at client or project level */
  scope: 'client' | 'project';
  /** Template tags for retrieval and output generation (min ["general"]) */
  templateTags: string[];
  /** Field category derived from fieldPath prefix (e.g., "financials", "legal") */
  category: string;
  /** AI's original label before normalization to canonical path */
  originalLabel: string;
  /** Page or section reference (e.g., "p.3", "Schedule 2", "pp.12-14") */
  pageReference?: string;
}

// =============================================================================
// BATCH RESULT
// =============================================================================

export interface BatchClassifyResult {
  success: boolean;
  /** Per-document results */
  documents: DocumentClassification[];
  /** Processing metadata */
  metadata: {
    model: string;
    batchSize: number;
    apiCallsMade: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalLatencyMs: number;
    referencesLoaded: string[];
    cachedReferenceHit: boolean;
  };
  /** Documents that failed individually */
  errors: Array<{
    documentIndex: number;
    fileName: string;
    error: string;
  }>;
}

// =============================================================================
// SHARED TYPES
// =============================================================================

export interface FolderInfo {
  folderKey: string;
  name: string;
  level: 'client' | 'project';
}

export interface ChecklistItem {
  id: string;
  name: string;
  category: string;
  status: 'missing' | 'pending_review' | 'fulfilled';
  matchingDocumentTypes?: string[];
  description?: string;
}

export interface CorrectionContext {
  aiPredicted: { fileType: string; category: string };
  userCorrected: { fileType: string; category: string };
  fileName: string;
  correctionCount: number;
}

export interface ClientContext {
  clientId?: string;
  projectId?: string;
  clientType?: string;
  clientName?: string;
}

// =============================================================================
// PIPELINE CONFIG
// =============================================================================

export interface V4PipelineConfig {
  /** Anthropic API key (optional if useMock is true) */
  anthropicApiKey: string;
  /** Use mock client instead of real Anthropic API */
  useMock: boolean;
  /** Model for primary classification (default: haiku) */
  primaryModel: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6';
  /** Model for critic/disambiguation (default: sonnet, rarely used) */
  criticModel: 'claude-sonnet-4-6' | 'claude-opus-4-6';
  /** Maximum tokens for response */
  maxTokens: number;
  /** Temperature for classification (lower = more deterministic) */
  temperature: number;
  /** Whether to send documents as multimodal (PDF pages/images) vs text-only */
  useMultimodal: boolean;
  /** Whether to load references from the shared library */
  loadReferences: boolean;
  /** Maximum references to include per batch call */
  maxReferencesPerCall: number;
  /** Reference cache TTL in ms (default: 1 hour) */
  referenceCacheTtlMs: number;
  /** Convex client for fetching user-created references and file type definitions */
  convexClient?: any;
}

export const DEFAULT_V4_CONFIG: Omit<V4PipelineConfig, 'anthropicApiKey'> = {
  useMock: false,
  primaryModel: 'claude-haiku-4-5-20251001',
  criticModel: 'claude-sonnet-4-6',
  maxTokens: 8192,
  temperature: 0.1,
  useMultimodal: true,
  loadReferences: true,
  maxReferencesPerCall: 12,
  referenceCacheTtlMs: REFERENCE_CACHE_TTL_MS,
};

// =============================================================================
// SKILL DEFINITION (runtime)
// =============================================================================

export interface SkillDefinition {
  metadata: SkillMetadata;
  /** Path to skill directory (contains SKILL.md) */
  skillPath: string;
  /** SKILL.md content (loaded on trigger) */
  instructions: string;
}
