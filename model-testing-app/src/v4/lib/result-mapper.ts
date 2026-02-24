// =============================================================================
// V4 RESULT MAPPER
// =============================================================================
// Maps V4 pipeline output to the Convex bulkUploadItems format.
//
// This is the bridge between V4's classification output and the existing
// Convex storage schema. The BulkReviewTable and filing flow don't need
// to change — they consume the same fields they always have.
//
// V4 Classification → Convex bulkUploadItem fields:
//   fileType           → fileTypeDetected
//   category           → category
//   suggestedFolder    → targetFolder
//   confidence         → confidence
//   executiveSummary   → summary
//   intelligenceFields → extractedData (stored as JSON)
//
// This mapper also:
// - Generates document codes (naming convention)
// - Prepares knowledge bank entry data
// - Computes overall batch statistics

import type { DocumentClassification } from '../types';
import type { PlacementResult } from './placement-rules';
import { getTypeAbbreviation } from './placement-rules';

// =============================================================================
// TYPES
// =============================================================================

/** Format expected by Convex bulkUpload.updateItemAnalysis mutation */
export interface ConvexItemAnalysis {
  summary: string;
  fileTypeDetected: string;
  category: string;
  targetFolder: string;
  confidence: number;
  generatedDocumentCode: string;
  version: string;
  extractedData?: Record<string, any>;
}

/** Knowledge bank entry to be created when document is filed */
export interface KnowledgeBankEntryData {
  title: string;
  content: string;
  entryType: 'document_summary';
  keyPoints: string[];
  tags: string[];
  sourceType: 'document';
}

/** Complete mapped result for a single document */
export interface MappedDocumentResult {
  /** Original document index (matches V4 classification.documentIndex) */
  documentIndex: number;
  /** Original file name */
  fileName: string;
  /** Fields for Convex bulkUpload.updateItemAnalysis */
  itemAnalysis: ConvexItemAnalysis;
  /** Placement decision */
  placement: PlacementResult;
  /** Knowledge bank entry data (created when document is filed) */
  knowledgeBankEntry: KnowledgeBankEntryData;
  /** Classification confidence */
  confidence: number;
  /** Whether the model was uncertain (confidence < 0.60) */
  isLowConfidence: boolean;
  /** Alternative types the model considered */
  alternativeTypes: Array<{ fileType: string; category: string; confidence: number }>;
}

/** Batch-level statistics */
export interface BatchMappingStats {
  totalDocuments: number;
  classified: number;
  errors: number;
  lowConfidenceCount: number;
  placementOverrides: number;
  categoryCounts: Record<string, number>;
  folderCounts: Record<string, number>;
}

// =============================================================================
// MAIN MAPPER
// =============================================================================

/**
 * Map a single V4 classification + placement to Convex-ready format.
 */
export function mapClassificationToConvex(
  classification: DocumentClassification,
  placement: PlacementResult,
  context: {
    projectShortcode?: string;
    clientName?: string;
    isInternal?: boolean;
    uploaderInitials?: string;
  },
): MappedDocumentResult {
  const { fileType, category, confidence, alternativeTypes } = classification.classification;

  // Generate document code
  const documentCode = generateDocumentCode({
    shortcode: context.projectShortcode || deriveShortcode(context.clientName || 'DOC'),
    typeAbbreviation: getTypeAbbreviation(fileType),
    isInternal: context.isInternal ?? false,
    uploaderInitials: context.uploaderInitials || 'SYS',
    version: 'V1.0',
    date: new Date(),
  });

  // Build summary from V4 output
  const summary = classification.summary?.executiveSummary || `${fileType} document`;

  // Build extracted data from intelligence fields
  const extractedData = buildExtractedData(classification);

  // Build knowledge bank entry
  const knowledgeBankEntry = buildKnowledgeBankEntry(classification, placement);

  return {
    documentIndex: classification.documentIndex,
    fileName: classification.fileName,
    itemAnalysis: {
      summary,
      fileTypeDetected: fileType,
      category,
      targetFolder: placement.folderKey,
      confidence,
      generatedDocumentCode: documentCode,
      version: 'V1.0',
      extractedData: Object.keys(extractedData).length > 0 ? extractedData : undefined,
    },
    placement,
    knowledgeBankEntry,
    confidence,
    isLowConfidence: confidence < 0.60,
    alternativeTypes: alternativeTypes || [],
  };
}

/**
 * Map an entire batch of V4 results to Convex-ready format.
 */
export function mapBatchToConvex(
  classifications: DocumentClassification[],
  placements: Record<number, PlacementResult>,
  errors: Array<{ documentIndex: number; fileName: string; error: string }>,
  context: {
    projectShortcode?: string;
    clientName?: string;
    isInternal?: boolean;
    uploaderInitials?: string;
  },
): {
  documents: MappedDocumentResult[];
  stats: BatchMappingStats;
} {
  const documents: MappedDocumentResult[] = [];
  const stats: BatchMappingStats = {
    totalDocuments: classifications.length + errors.length,
    classified: classifications.length,
    errors: errors.length,
    lowConfidenceCount: 0,
    placementOverrides: 0,
    categoryCounts: {},
    folderCounts: {},
  };

  for (const cls of classifications) {
    const placement = placements[cls.documentIndex];
    if (!placement) continue;

    const mapped = mapClassificationToConvex(cls, placement, context);
    documents.push(mapped);

    // Update stats
    if (mapped.isLowConfidence) stats.lowConfidenceCount++;
    if (placement.wasOverridden) stats.placementOverrides++;
    stats.categoryCounts[cls.classification.category] =
      (stats.categoryCounts[cls.classification.category] || 0) + 1;
    stats.folderCounts[placement.folderKey] =
      (stats.folderCounts[placement.folderKey] || 0) + 1;
  }

  return { documents, stats };
}

// =============================================================================
// DOCUMENT CODE GENERATION
// =============================================================================

interface DocumentCodeInput {
  shortcode: string;
  typeAbbreviation: string;
  isInternal: boolean;
  uploaderInitials: string;
  version: string;
  date: Date;
}

function generateDocumentCode(input: DocumentCodeInput): string {
  const { shortcode, typeAbbreviation, isInternal, uploaderInitials, version, date } = input;

  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const intExt = isInternal ? 'INT' : 'EXT';

  return `${shortcode}-${typeAbbreviation}-${intExt}-${uploaderInitials}-${version}-${dateStr}`;
}

/** Derive a project shortcode from a name (max 10 chars, uppercase) */
function deriveShortcode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10) || 'DOC';
}

// =============================================================================
// EXTRACTED DATA BUILDER
// =============================================================================

function buildExtractedData(
  classification: DocumentClassification,
): Record<string, any> {
  const data: Record<string, any> = {};

  if (!classification.intelligenceFields || classification.intelligenceFields.length === 0) {
    return data;
  }

  for (const field of classification.intelligenceFields) {
    // Nest by fieldPath: "financials.propertyValue" → { financials: { propertyValue: value } }
    const parts = field.fieldPath.split('.');
    let current = data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = {
      value: field.value,
      type: field.valueType,
      confidence: field.confidence,
      label: field.label,
    };
  }

  return data;
}

// =============================================================================
// KNOWLEDGE BANK ENTRY BUILDER
// =============================================================================

function buildKnowledgeBankEntry(
  classification: DocumentClassification,
  placement: PlacementResult,
): KnowledgeBankEntryData {
  const { fileType, category } = classification.classification;
  const summary = classification.summary;

  // Build key points from summary fields
  const keyPoints: string[] = [];
  if (summary?.documentPurpose) {
    keyPoints.push(summary.documentPurpose);
  }
  if (summary?.keyAmounts && summary.keyAmounts.length > 0) {
    keyPoints.push(`Key amounts: ${summary.keyAmounts.join(', ')}`);
  }
  if (summary?.keyDates && summary.keyDates.length > 0) {
    keyPoints.push(`Key dates: ${summary.keyDates.join(', ')}`);
  }
  if (summary?.keyEntities) {
    const entities = [
      ...(summary.keyEntities.people || []),
      ...(summary.keyEntities.companies || []),
    ].filter(Boolean);
    if (entities.length > 0) {
      keyPoints.push(`Key parties: ${entities.join(', ')}`);
    }
  }

  // Build tags
  const tags: string[] = [
    category.toLowerCase().replace(/\s+/g, '_'),
    fileType.toLowerCase().replace(/\s+/g, '_'),
    placement.folderKey,
  ];
  if (summary?.keyTerms) {
    tags.push(...summary.keyTerms.slice(0, 5));
  }

  return {
    title: `${fileType}: ${classification.fileName}`,
    content: summary?.executiveSummary || `${fileType} document filed to ${placement.folderName}.`,
    entryType: 'document_summary',
    keyPoints,
    tags: [...new Set(tags)], // Deduplicate
    sourceType: 'document',
  };
}
