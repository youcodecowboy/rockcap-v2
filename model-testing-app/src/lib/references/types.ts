// =============================================================================
// SHARED REFERENCE LIBRARY — TYPE DEFINITIONS
// =============================================================================
// These types define the structure of document references used across all AI
// features: classification, summarization, extraction, chat, filing, checklists.

/**
 * AI contexts where references can be consumed.
 * Each context gets different formatting depth from the formatter.
 */
export type AIContext =
  | 'classification'   // V4 pipeline, bulk-analyze — needs full detail
  | 'summarization'    // Summary agent — needs description + key indicators
  | 'filing'           // Folder assignment — needs filing rules + disambiguation
  | 'extraction'       // Intelligence extraction — needs fields + terminology
  | 'chat'             // Chat assistant — needs compact description
  | 'checklist'        // Checklist matching — needs type + category context
  | 'meeting';         // Meeting extraction — needs document type awareness

/**
 * Document categories matching the application taxonomy.
 */
export type DocumentCategory =
  | 'Appraisals'
  | 'Plans'
  | 'Inspections'
  | 'Professional Reports'
  | 'KYC'
  | 'Loan Terms'
  | 'Legal Documents'
  | 'Project Documents'
  | 'Financial Documents'
  | 'Insurance'
  | 'Communications'
  | 'Warranties'
  | 'Photographs'
  | 'Other';

/**
 * Tag namespaces forming the discovery taxonomy.
 * Namespaced tags enable the resolver to weight different tag types
 * differently and prevent false matches.
 */
export type TagNamespace =
  | 'context'    // What AI operation: classification, summarization, filing, etc.
  | 'signal'     // Document indicators: rics-branding, financial-tables, legal-clauses
  | 'domain'     // Industry area: property-finance, construction, legal, kyc
  | 'type'       // Direct type match: redbook-valuation, facility-letter (most specific)
  | 'trigger';   // Compound signals: financial+legal, identity+corporate

/**
 * A namespaced tag for reference discovery.
 */
export interface ReferenceTag {
  namespace: TagNamespace;
  value: string;
  /** Optional weight boost for scoring (default 1.0) */
  weight?: number;
}

/**
 * Structured "IF signal THEN action" decision rule.
 * These tell the resolver WHEN to include this reference.
 */
export interface DecisionRule {
  /** Human-readable condition description */
  condition: string;
  /** Machine-evaluable signal keys that trigger this rule */
  signals: string[];
  /** Priority: higher = check first (1-10 scale) */
  priority: number;
  /** What to do when matched */
  action: 'include' | 'boost' | 'require';
}

/**
 * A complete reference document for one document type.
 * This is the "rich reference" format — 200-400 words of guidance content
 * plus structured metadata for tag-based discovery.
 */
export interface DocumentReference {
  /** Unique stable identifier (kebab-case, e.g., "redbook-valuation") */
  id: string;

  /** Display name (e.g., "RedBook Valuation") */
  fileType: string;

  /** Parent category */
  category: DocumentCategory;

  /** Filing destination */
  filing: {
    targetFolder: string;
    targetLevel: 'client' | 'project';
  };

  // === RICH CONTENT ===

  /**
   * Comprehensive description (200-400 words).
   * Covers purpose, typical contents, and significance in property finance.
   * This is the primary content injected into system prompts.
   */
  description: string;

  /**
   * Ordered identification rules (8-12 rules).
   * Strongest diagnostic indicators first.
   * Prefixed with PRIMARY: or CRITICAL: for the most important ones.
   */
  identificationRules: string[];

  /**
   * Disambiguation guidance.
   * "This is X, NOT Y because..." to prevent confusion with similar types.
   */
  disambiguation: string[];

  /**
   * Domain terminology glossary.
   * Industry-specific terms that appear in this document type.
   */
  terminology: Record<string, string>;

  // === TAGGING SYSTEM ===

  /** Namespaced tags for resolver scoring */
  tags: ReferenceTag[];

  /** Keywords for text-based matching (15-25 per type) */
  keywords: string[];

  /** Filename patterns (regex strings) for deterministic matching */
  filenamePatterns: string[];

  /** Patterns to exclude (prevent false positives) */
  excludePatterns: string[];

  // === DECISION RULES ===

  /**
   * Structured "IF signal THEN action" rules.
   * The resolver evaluates these to determine when to include this reference.
   */
  decisionRules: DecisionRule[];

  /**
   * Which AI contexts this reference is relevant for.
   */
  applicableContexts: AIContext[];

  /**
   * Canonical field paths this document type typically contains.
   * Links to the canonicalFields system for intelligence extraction.
   */
  expectedFields?: string[];

  // === METADATA ===

  source: 'system' | 'user';
  isActive: boolean;
  version: number;
  updatedAt: string;
}

// =============================================================================
// RESOLVER TYPES
// =============================================================================

export interface ResolveOptions {
  /** Which AI feature is requesting references */
  context: AIContext;

  /** Detected signals from the document/conversation */
  signals?: string[];

  /** If document type is already known */
  documentType?: string;

  /** If category is already known */
  category?: string;

  /** Raw text sample for keyword matching */
  textSample?: string;

  /** Filename for pattern matching */
  fileName?: string;

  /** Maximum references to return (default 12) */
  maxResults?: number;

  /** Output format */
  format?: 'full' | 'compact' | 'minimal';
}

export interface ResolvedReference {
  reference: DocumentReference;
  score: number;
  matchReasons: string[];
}

export interface ResolvedResult {
  /** Selected references sorted by relevance score */
  references: DocumentReference[];

  /** Detailed scoring for debugging/logging */
  scores: ResolvedReference[];

  /** Whether results came from cache */
  cacheHit: boolean;

  /** Pre-formatted prompt text (when format != 'full') */
  promptText?: string;
}

export interface BatchDocumentInput {
  fileName: string;
  textSample?: string;
  signals?: string[];
}
