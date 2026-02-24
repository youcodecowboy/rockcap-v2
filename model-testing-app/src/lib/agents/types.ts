// =============================================================================
// SHARED TYPES FOR DOCUMENT ANALYSIS AGENTS
// =============================================================================

import { Id } from '../../../convex/_generated/dataModel';

// =============================================================================
// DOCUMENT SUMMARY (Output of Summary Agent)
// =============================================================================

export interface DocumentCharacteristics {
  isFinancial: boolean;
  isLegal: boolean;
  isIdentity: boolean;
  isReport: boolean;
  isDesign: boolean;
  isCorrespondence: boolean;
  hasMultipleProjects: boolean;
  isInternal: boolean;
}

export interface DocumentEntities {
  people: string[];
  companies: string[];
  locations: string[];
  projects: string[];
}

export interface DocumentSummary {
  documentDescription: string;
  documentPurpose: string;
  entities: DocumentEntities;
  keyTerms: string[];
  keyDates: string[];
  keyAmounts: string[];
  executiveSummary: string;
  detailedSummary: string;
  sectionBreakdown?: string[];
  documentCharacteristics: DocumentCharacteristics;
  rawContentType: string;
  confidenceInAnalysis: number;
}

// =============================================================================
// CLASSIFICATION (Output of Classification Agent)
// =============================================================================

export interface ClassificationDecision {
  fileType: string;
  category: string;
  suggestedFolder: string;
  confidence: number;
  reasoning: string;
  alternativeTypes?: Array<{
    type: string;
    confidence: number;
    reason: string;
  }>;
}

// =============================================================================
// VERIFICATION (Output of Verification Agent)
// =============================================================================

export interface VerificationResult {
  verified: boolean;
  adjustedClassification?: Partial<BulkAnalysisResult>;
  notes: string;
}

// =============================================================================
// CHECKLIST MATCHING
// =============================================================================

export interface ChecklistMatch {
  itemId: string;
  itemName: string;
  category: string;
  confidence: number;
  reasoning?: string;
}

export interface EnrichedChecklistItem {
  _id: string;
  name: string;
  category: string;
  status: 'missing' | 'pending_review' | 'fulfilled';
  linkedDocumentCount: number;
  description?: string;
  matchingDocumentTypes?: string[];
  // Added during pipeline for filename match context
  filenameMatchScore?: number;
  filenameMatchReason?: string;
}

// =============================================================================
// FILENAME MATCHING
// =============================================================================

export interface FilenameTypeHint {
  fileType: string;
  category: string;
  folder: string;
  confidence: number;
  reason: string;
}

export interface FilenameMatchResult {
  itemId: string;
  score: number;
  reason: string;
}

// =============================================================================
// FOLDER INFO
// =============================================================================

export interface FolderInfo {
  folderKey: string;
  name: string;
  level: 'client' | 'project';
}

// =============================================================================
// CLIENT INTELLIGENCE CONTEXT
// =============================================================================

export interface ClientIntelligenceContext {
  clientType?: string;
  clientName?: string;
  legalName?: string;
  tradingName?: string;
  recentDocumentTypes?: string[];
  preferredFolders?: string[];
}

// =============================================================================
// FILE TYPE DEFINITIONS
// =============================================================================

export interface FileTypeDefinition {
  fileType: string;
  category: string;
  keywords: string[];
  description: string;
  identificationRules: string[];
  categoryRules?: string;
  // Deterministic verification fields
  targetFolderKey?: string;
  targetLevel?: 'client' | 'project';
  filenamePatterns?: string[];
  excludePatterns?: string[];
  // Auto-learned keywords from corrections
  learnedKeywords?: Array<{
    keyword: string;
    source: 'correction' | 'manual';
    addedAt: string;
    correctionCount?: number;
  }>;
  isActive?: boolean;
}

// =============================================================================
// BULK ANALYSIS RESULT (Final Output)
// =============================================================================

export interface BulkAnalysisResult {
  summary: string;
  fileType: string;
  category: string;
  confidence: number;
  suggestedFolder: string;
  targetLevel: 'client' | 'project';
  suggestedChecklistItems?: ChecklistMatch[];
  confidenceFlag?: 'high' | 'medium' | 'low';
  requiresReview?: boolean;
  verificationPassed?: boolean;
  verificationNotes?: string | string[];
}

// =============================================================================
// CRITIC AGENT
// =============================================================================

export interface CriticAgentInput {
  fileName: string;
  summary: string;
  documentSummary?: DocumentSummary;
  classificationReasoning?: string;
  initialClassification: {
    fileType: string;
    category: string;
    suggestedFolder: string;
    confidence: number;
    alternativeTypes?: Array<{
      type: string;
      confidence: number;
      reason: string;
    }>;
  };
  filenameHint?: FilenameTypeHint;
  checklistMatches: Array<{
    itemId: string;
    itemName: string;
    confidence: number;
    reasoning?: string;
  }>;
  availableFileTypes: string[];
  availableFolders: FolderInfo[];
  availableChecklistItems: EnrichedChecklistItem[];
  // Smart correction retrieval - tiered approach
  pastCorrections?: PastCorrection[];           // Full corrections (for low confidence)
  consolidatedRules?: ConsolidatedRule[];       // Aggregated rules (for medium confidence)
  confusionPairs?: ConfusionPair[];             // What the AI is uncertain about
  correctionTier?: CorrectionContextTier;       // Which tier we're using
}

export interface CriticAgentOutput {
  fileType: string;
  category: string;
  suggestedFolder: string;
  confidence: number;
  reasoning: string;
  checklistMatches: Array<{
    itemId: string;
    confidence: number;
    reasoning: string;
  }>;
  correctionInfluence?: {
    appliedCorrections: string[];
    reasoning: string;
  };
}

export interface PastCorrection {
  aiPrediction: {
    fileType: string;
    category: string;
    targetFolder: string;
    suggestedChecklistItems?: Array<{
      itemId: string;
      itemName: string;
      category: string;
      confidence: number;
    }>;
  };
  userCorrection: {
    fileType?: string;
    category?: string;
    targetFolder?: string;
    checklistItems?: Array<{ itemId: string; itemName: string }>;
  };
  fileName: string;
  matchReason: string;
  relevanceScore: number;
}

// =============================================================================
// SMART CORRECTION RETRIEVAL TYPES
// =============================================================================

/**
 * Consolidated rule from aggregated corrections
 * e.g., "Other → Track Record (12 corrections)"
 */
export interface ConsolidatedRule {
  field: 'fileType' | 'category' | 'folder';
  fromValue: string;
  toValue: string;
  correctionCount: number;
  averageConfidence: number;
  exampleFileName?: string;
}

/**
 * Targeted correction for specific confusion pair
 */
export interface TargetedCorrection {
  correction: PastCorrection;
  confusionPair: {
    field: 'fileType' | 'category' | 'folder';
    aiPredicted: string;
    userCorrected: string;
  };
}

/**
 * Confusion pair for targeted query
 */
export interface ConfusionPair {
  field: 'fileType' | 'category' | 'folder';
  options: string[];  // e.g., ["Track Record", "Other"]
}

/**
 * Tiered correction context based on confidence level
 */
export type CorrectionContextTier =
  | 'none'           // High confidence (>0.85): No corrections needed
  | 'consolidated'   // Medium confidence (0.65-0.85): Just aggregated rules
  | 'targeted'       // Low confidence (<0.65): Specific confusion pairs
  | 'full';          // Very low confidence (<0.5): Full correction context

// =============================================================================
// PIPELINE CONTEXT (Runtime dependencies)
// =============================================================================

export interface PipelineContext {
  togetherApiKey: string;
  openaiApiKey?: string;
  convexClient: any; // ConvexHttpClient type
  clientType?: string;
  clientId?: string;
  projectId?: string;
}

// =============================================================================
// PIPELINE INPUT/OUTPUT
// =============================================================================

export interface PipelineInput {
  file: File;
  textContent: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  instructions?: string;
  clientId?: string;
  projectId?: string;
  clientType?: string;
  bypassCache?: boolean;
}

export interface PipelineOutput {
  success: boolean;
  result: BulkAnalysisResult & {
    typeAbbreviation: string;
    originalFileName: string;
    fileSize: number;
    mimeType: string;
    canonicalFieldHints?: string[];
    fromCache?: boolean;
    cacheHitCount?: number;
  };
  documentAnalysis?: DocumentSummary;
  classificationReasoning?: string;
  availableChecklistItems?: EnrichedChecklistItem[];
  availableFolders: FolderInfo[];
}
