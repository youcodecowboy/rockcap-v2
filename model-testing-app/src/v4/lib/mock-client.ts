// =============================================================================
// V4 MOCK ANTHROPIC CLIENT
// =============================================================================
// Drop-in replacement for callAnthropicBatch when no API key is available.
// Returns realistic classification results based on document hints and
// filename analysis. Simulates latency and token usage.
//
// Usage: Set V4PipelineConfig.useMock = true (or omit anthropicApiKey)
//
// This allows full end-to-end testing of the pipeline without API access:
//   Upload → Preprocess → References → Mock Classify → Placement → Store

import type {
  BatchDocument,
  DocumentClassification,
  V4PipelineConfig,
  ReferenceDocument,
  ChecklistItem,
} from '../types';

// =============================================================================
// MOCK RESPONSE GENERATOR
// =============================================================================

/**
 * Generate realistic mock classification results for a batch of documents.
 * Uses filename hints, matched tags, and reference library to produce
 * plausible results — NOT random data.
 */
export async function callMockBatch(
  documents: BatchDocument[],
  references: ReferenceDocument[],
  checklistItems: ChecklistItem[],
  config: V4PipelineConfig,
): Promise<{
  classifications: DocumentClassification[];
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}> {
  const startTime = Date.now();

  // Simulate API latency (50-200ms per doc, faster than real API)
  const simulatedLatency = Math.min(200, 50 * documents.length);
  await new Promise(resolve => setTimeout(resolve, simulatedLatency));

  const classifications: DocumentClassification[] = documents.map(doc => {
    return generateMockClassification(doc, references, checklistItems);
  });

  const latencyMs = Date.now() - startTime;

  // Simulate realistic token usage
  const inputTokensPerDoc = 1200;
  const outputTokensPerDoc = 800;

  return {
    classifications,
    usage: {
      inputTokens: documents.length * inputTokensPerDoc + 3000, // docs + system prompt
      outputTokens: documents.length * outputTokensPerDoc,
    },
    latencyMs,
  };
}

// =============================================================================
// PER-DOCUMENT MOCK GENERATION
// =============================================================================

function generateMockClassification(
  doc: BatchDocument,
  references: ReferenceDocument[],
  checklistItems: ChecklistItem[],
): DocumentClassification {
  // Step 1: Determine file type from hints or reference matching
  const { fileType, category, confidence } = resolveFileType(doc, references);

  // Step 2: Determine folder from category
  const suggestedFolder = resolveFolder(category);

  // Step 3: Determine target level
  const targetLevel = resolveTargetLevel(category);

  // Step 4: Generate mock summary
  const summary = generateMockSummary(doc, fileType, category);

  // Step 5: Match to checklist items
  const checklistMatches = matchToChecklist(fileType, category, checklistItems);

  // Step 6: Generate mock intelligence fields
  const intelligenceFields = generateMockIntelligence(doc, fileType, category);

  return {
    documentIndex: doc.index,
    fileName: doc.fileName,
    classification: {
      fileType,
      category,
      suggestedFolder,
      targetLevel,
      confidence,
      reasoning: `[MOCK] Classified as "${fileType}" based on filename analysis and tag matching. ` +
        (doc.hints.filenameTypeHint
          ? `Filename strongly suggests "${doc.hints.filenameTypeHint}". `
          : 'No strong filename hint. ') +
        `Matched tags: [${doc.hints.matchedTags.join(', ')}].`,
      alternativeTypes: generateAlternatives(fileType, category, references),
    },
    summary,
    checklistMatches,
    intelligenceFields,
  };
}

// =============================================================================
// FILE TYPE RESOLUTION
// =============================================================================

function resolveFileType(
  doc: BatchDocument,
  references: ReferenceDocument[],
): { fileType: string; category: string; confidence: number } {
  // Priority 1: Direct filename hint match
  if (doc.hints.filenameTypeHint) {
    const matchedRef = references.find(
      r => r.fileType.toLowerCase() === doc.hints.filenameTypeHint!.toLowerCase()
    );
    if (matchedRef) {
      return {
        fileType: matchedRef.fileType,
        category: matchedRef.category,
        confidence: 0.92,
      };
    }
    // Hint exists but no reference match — use hint anyway
    return {
      fileType: doc.hints.filenameTypeHint,
      category: doc.hints.filenameCategoryHint || 'Other',
      confidence: 0.78,
    };
  }

  // Priority 2: Tag-based matching against references
  if (doc.hints.matchedTags.length > 0) {
    const scored = references.map(ref => {
      let score = 0;
      for (const tag of ref.tags) {
        if (doc.hints.matchedTags.includes(tag.toLowerCase())) {
          score += 1;
        }
      }
      return { ref, score };
    }).filter(s => s.score > 0);

    scored.sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score >= 2) {
      return {
        fileType: scored[0].ref.fileType,
        category: scored[0].ref.category,
        confidence: Math.min(0.85, 0.60 + scored[0].score * 0.08),
      };
    }
  }

  // Priority 3: Characteristic-based guessing
  if (doc.hints.isIdentity) {
    return { fileType: 'KYC Document', category: 'KYC', confidence: 0.65 };
  }
  if (doc.hints.isFinancial && doc.hints.isSpreadsheet) {
    return { fileType: 'Cashflow', category: 'Appraisals', confidence: 0.60 };
  }
  if (doc.hints.isLegal) {
    return { fileType: 'Legal Document', category: 'Legal Documents', confidence: 0.55 };
  }
  if (doc.hints.isFinancial) {
    return { fileType: 'Financial Document', category: 'Financial Documents', confidence: 0.55 };
  }
  if (doc.hints.isImage) {
    return { fileType: 'Site Photographs', category: 'Photographs', confidence: 0.60 };
  }

  // Fallback
  return { fileType: 'Other', category: 'Other', confidence: 0.40 };
}

// =============================================================================
// FOLDER & LEVEL RESOLUTION
// =============================================================================

/** Map category to standard folder key */
function resolveFolder(category: string): string {
  const CATEGORY_TO_FOLDER: Record<string, string> = {
    'Appraisals': 'appraisals',
    'KYC': 'kyc',
    'Legal Documents': 'terms_comparison',
    'Loan Terms': 'terms_comparison',
    'Inspections': 'operational_model',
    'Professional Reports': 'appraisals',
    'Plans': 'appraisals',
    'Insurance': 'post_completion',
    'Financial Documents': 'background',
    'Communications': 'notes',
    'Photographs': 'appraisals',
    'Other': 'miscellaneous',
  };
  return CATEGORY_TO_FOLDER[category] || 'miscellaneous';
}

/** Determine if document belongs at client or project level */
function resolveTargetLevel(category: string): 'client' | 'project' {
  const CLIENT_LEVEL_CATEGORIES = new Set([
    'KYC',
    'Communications',
  ]);
  return CLIENT_LEVEL_CATEGORIES.has(category) ? 'client' : 'project';
}

// =============================================================================
// MOCK SUMMARY GENERATION
// =============================================================================

function generateMockSummary(
  doc: BatchDocument,
  fileType: string,
  category: string,
): DocumentClassification['summary'] {
  const textPreview = doc.processedContent.type === 'text'
    ? doc.processedContent.text.slice(0, 200)
    : '';

  return {
    executiveSummary: `[MOCK] ${fileType} document "${doc.fileName}". ` +
      `This ${category.toLowerCase()} document was uploaded for processing. ` +
      (textPreview ? `Content begins: "${textPreview.slice(0, 100)}..."` : 'Content not available as text.'),
    documentPurpose: `${fileType} — ${CATEGORY_PURPOSES[category] || 'General document for filing'}`,
    keyEntities: {
      people: [],
      companies: [],
      locations: [],
      projects: [],
    },
    keyTerms: doc.hints.matchedTags.slice(0, 5),
    keyDates: [],
    keyAmounts: [],
  };
}

const CATEGORY_PURPOSES: Record<string, string> = {
  'Appraisals': 'Property valuation or development appraisal for lending assessment',
  'KYC': 'Identity verification or know-your-customer compliance document',
  'Legal Documents': 'Legal agreement, deed, or guarantee related to the transaction',
  'Loan Terms': 'Loan terms, term sheet, or credit approval documentation',
  'Inspections': 'Site inspection or monitoring report for construction progress',
  'Professional Reports': 'Professional survey, report, or assessment',
  'Plans': 'Architectural plans, site plans, or design drawings',
  'Insurance': 'Insurance policy or certificate for the property/project',
  'Financial Documents': 'Financial document such as invoice or receipt',
  'Communications': 'Email correspondence or meeting notes',
  'Photographs': 'Site photographs documenting property or construction',
};

// =============================================================================
// CHECKLIST MATCHING
// =============================================================================

function matchToChecklist(
  fileType: string,
  category: string,
  checklistItems: ChecklistItem[],
): DocumentClassification['checklistMatches'] {
  const missingItems = checklistItems.filter(i => i.status === 'missing');

  return missingItems
    .map(item => {
      let confidence = 0;

      // Direct type match
      if (item.matchingDocumentTypes?.some(t =>
        t.toLowerCase() === fileType.toLowerCase()
      )) {
        confidence = 0.92;
      }
      // Category match
      else if (item.category.toLowerCase() === category.toLowerCase()) {
        confidence = 0.75;
      }
      // Name similarity
      else if (
        item.name.toLowerCase().includes(fileType.toLowerCase()) ||
        fileType.toLowerCase().includes(item.name.toLowerCase())
      ) {
        confidence = 0.70;
      }

      if (confidence < 0.60) return null;

      return {
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        confidence,
        reasoning: `[MOCK] "${fileType}" matches checklist requirement "${item.name}" (${item.category}).`,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
}

// =============================================================================
// MOCK INTELLIGENCE FIELDS
// =============================================================================

function generateMockIntelligence(
  doc: BatchDocument,
  fileType: string,
  category: string,
): DocumentClassification['intelligenceFields'] {
  // Only generate intelligence for certain categories
  const fields: DocumentClassification['intelligenceFields'] = [];

  if (category === 'Appraisals' || category === 'Financial Documents') {
    fields.push({
      fieldPath: 'document.type',
      label: 'Document Type',
      value: fileType,
      valueType: 'text',
      confidence: 0.95,
      templateTags: ['lenders_note', 'credit_submission'],
    });
  }

  if (category === 'Loan Terms') {
    fields.push({
      fieldPath: 'loan.facility_type',
      label: 'Facility Type',
      value: 'Development Finance',
      valueType: 'text',
      confidence: 0.70,
      templateTags: ['lenders_note', 'perspective', 'credit_submission'],
    });
  }

  if (category === 'KYC') {
    fields.push({
      fieldPath: 'kyc.document_type',
      label: 'KYC Document Type',
      value: fileType,
      valueType: 'text',
      confidence: 0.90,
    });
  }

  return fields;
}

// =============================================================================
// ALTERNATIVE TYPES
// =============================================================================

function generateAlternatives(
  primaryFileType: string,
  primaryCategory: string,
  references: ReferenceDocument[],
): Array<{ fileType: string; category: string; confidence: number }> {
  // Find references in the same category as alternatives
  const alternatives = references
    .filter(r =>
      r.category === primaryCategory &&
      r.fileType !== primaryFileType
    )
    .slice(0, 2)
    .map(r => ({
      fileType: r.fileType,
      category: r.category,
      confidence: 0.35 + Math.random() * 0.25,
    }));

  return alternatives;
}
