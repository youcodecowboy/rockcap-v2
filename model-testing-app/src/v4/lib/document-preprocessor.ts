// =============================================================================
// V4 DOCUMENT PRE-PROCESSOR
// =============================================================================
// Lightweight pre-processing before sending documents to Claude.
// Responsibilities:
// 1. Smart truncation (large PDFs → first 2-3 pages + last page)
// 2. Filename analysis (heuristic hints, no LLM)
// 3. Document characteristics detection (financial, legal, etc.)
// 4. Spreadsheet preview extraction
// 5. Tag generation for reference library matching

import type {
  BatchDocument,
  DocumentContent,
  DocumentHints,
  SpreadsheetSummary,
} from '../types';

// =============================================================================
// FILENAME PATTERNS (heuristic, no LLM)
// =============================================================================

const FILENAME_PATTERNS: Array<{
  pattern: RegExp;
  fileType: string;
  category: string;
  tags: string[];
}> = [
  // KYC
  { pattern: /passport|biodata|bio.?data/i, fileType: 'Passport', category: 'KYC', tags: ['kyc', 'identity'] },
  { pattern: /driv(?:ing|er).?lic/i, fileType: 'Driving License', category: 'KYC', tags: ['kyc', 'identity'] },
  { pattern: /bank.?statement/i, fileType: 'Bank Statement', category: 'KYC', tags: ['kyc', 'financial'] },
  { pattern: /utility.?bill/i, fileType: 'Utility Bill', category: 'KYC', tags: ['kyc', 'proof-of-address'] },
  { pattern: /cert(?:ificate)?.?of.?inc/i, fileType: 'Certificate of Incorporation', category: 'KYC', tags: ['kyc', 'corporate'] },
  { pattern: /tax.?return/i, fileType: 'Tax Return', category: 'KYC', tags: ['kyc', 'financial'] },
  { pattern: /company.?search/i, fileType: 'Company Search', category: 'KYC', tags: ['kyc', 'corporate'] },
  { pattern: /application.?form/i, fileType: 'Application Form', category: 'KYC', tags: ['kyc'] },

  // Appraisals
  { pattern: /red.?book|rics.?val/i, fileType: 'RedBook Valuation', category: 'Appraisals', tags: ['appraisals', 'valuation'] },
  { pattern: /valuation/i, fileType: 'RedBook Valuation', category: 'Appraisals', tags: ['appraisals', 'valuation'] },
  { pattern: /appraisal|development.?appraisal/i, fileType: 'Appraisal', category: 'Appraisals', tags: ['appraisals', 'financial'] },
  { pattern: /cashflow|cash.?flow/i, fileType: 'Cashflow', category: 'Appraisals', tags: ['appraisals', 'financial'] },

  // Legal
  { pattern: /facility.?(?:letter|agreement)/i, fileType: 'Facility Letter', category: 'Legal Documents', tags: ['legal', 'loan'] },
  { pattern: /personal.?guarantee/i, fileType: 'Personal Guarantee', category: 'Legal Documents', tags: ['legal', 'guarantee'] },
  { pattern: /title.?deed/i, fileType: 'Title Deed', category: 'Legal Documents', tags: ['legal', 'property'] },
  { pattern: /lease/i, fileType: 'Lease', category: 'Legal Documents', tags: ['legal', 'property'] },
  { pattern: /debenture/i, fileType: 'Debenture', category: 'Legal Documents', tags: ['legal', 'security'] },

  // Loan Terms
  { pattern: /indicative.?terms|term.?sheet|heads.?of.?terms/i, fileType: 'Indicative Terms', category: 'Loan Terms', tags: ['loan', 'terms'] },
  { pattern: /credit.?(?:backed|approved)/i, fileType: 'Credit Backed Terms', category: 'Loan Terms', tags: ['loan', 'terms', 'credit'] },

  // Inspections
  { pattern: /monitor(?:ing)?.?report/i, fileType: 'Initial Monitoring Report', category: 'Inspections', tags: ['inspections', 'monitoring'] },
  { pattern: /inspection/i, fileType: 'Initial Monitoring Report', category: 'Inspections', tags: ['inspections'] },

  // Plans
  { pattern: /floor.?plan/i, fileType: 'Floor Plans', category: 'Plans', tags: ['plans', 'design'] },
  { pattern: /site.?plan/i, fileType: 'Site Plans', category: 'Plans', tags: ['plans', 'design'] },
  { pattern: /elevation/i, fileType: 'Elevations', category: 'Plans', tags: ['plans', 'design'] },
  { pattern: /section.?drawing/i, fileType: 'Sections', category: 'Plans', tags: ['plans', 'design'] },

  // Insurance
  { pattern: /insurance.?polic/i, fileType: 'Insurance Policy', category: 'Insurance', tags: ['insurance'] },
  { pattern: /insurance.?cert/i, fileType: 'Insurance Certificate', category: 'Insurance', tags: ['insurance'] },

  // Professional Reports
  { pattern: /building.?survey/i, fileType: 'Building Survey', category: 'Professional Reports', tags: ['reports', 'survey'] },
  { pattern: /report.?on.?title/i, fileType: 'Report on Title', category: 'Professional Reports', tags: ['reports', 'legal'] },
  { pattern: /environmental/i, fileType: 'Environmental Report', category: 'Professional Reports', tags: ['reports', 'environment'] },

  // Financial
  { pattern: /invoice/i, fileType: 'Invoice', category: 'Financial Documents', tags: ['financial'] },
  { pattern: /receipt/i, fileType: 'Receipt', category: 'Financial Documents', tags: ['financial'] },

  // Communications
  { pattern: /email|correspondence|letter/i, fileType: 'Email/Correspondence', category: 'Communications', tags: ['communications'] },
  { pattern: /meeting.?minutes/i, fileType: 'Meeting Minutes', category: 'Communications', tags: ['communications'] },
];

const FINANCIAL_KEYWORDS = /(?:£|GBP|amount|total|balance|payment|invoice|statement|fee|interest|loan|mortgage|valuation|appraisal|GDV|cost)/i;
const LEGAL_KEYWORDS = /(?:agreement|contract|deed|guarantee|clause|party|parties|hereby|covenant|obligation|lender|borrower)/i;
const IDENTITY_KEYWORDS = /(?:passport|licence|license|date of birth|nationality|ID|identification)/i;

// =============================================================================
// MAIN PRE-PROCESSOR
// =============================================================================

/**
 * Pre-process a raw file into a BatchDocument ready for the API call.
 * This does NOT call any LLM — pure heuristics and truncation.
 */
export async function preprocessDocument(
  file: File | { name: string; size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> },
  index: number,
  extractedText?: string,
): Promise<BatchDocument> {
  const fileName = file.name;
  const fileSize = file.size;
  const mediaType = file.type || 'application/octet-stream';

  // Generate hints from filename
  const hints = analyzeFilename(fileName, extractedText);

  // Process content based on type
  let processedContent: DocumentContent;

  if (mediaType === 'application/pdf') {
    processedContent = await preprocessPdf(file, extractedText);
  } else if (mediaType.startsWith('image/')) {
    processedContent = await preprocessImage(file);
  } else if (isSpreadsheet(mediaType, fileName)) {
    processedContent = preprocessSpreadsheet(extractedText);
  } else {
    // Text/other — use extracted text or read as text
    processedContent = preprocessText(extractedText || '', fileName);
  }

  return {
    index,
    fileName,
    fileSize,
    mediaType,
    processedContent,
    hints,
  };
}

// =============================================================================
// FILENAME ANALYSIS (heuristic hints)
// =============================================================================

/**
 * Analyze a filename to generate lightweight hints.
 * No LLM call — pure pattern matching.
 */
export function analyzeFilename(fileName: string, textContent?: string): DocumentHints {
  const hints: DocumentHints = {
    matchedTags: [],
    isFinancial: false,
    isLegal: false,
    isIdentity: false,
    isSpreadsheet: false,
    isImage: false,
  };

  // Match filename against known patterns
  for (const pattern of FILENAME_PATTERNS) {
    if (pattern.pattern.test(fileName)) {
      hints.filenameTypeHint = pattern.fileType;
      hints.filenameCategoryHint = pattern.category;
      hints.matchedTags.push(...pattern.tags);
      break; // Take first match
    }
  }

  // Detect document characteristics from filename + text
  const searchText = `${fileName} ${(textContent || '').slice(0, 2000)}`;

  hints.isFinancial = FINANCIAL_KEYWORDS.test(searchText);
  hints.isLegal = LEGAL_KEYWORDS.test(searchText);
  hints.isIdentity = IDENTITY_KEYWORDS.test(searchText);
  hints.isSpreadsheet = /\.(xlsx?|csv|ods)$/i.test(fileName);
  hints.isImage = /\.(jpe?g|png|gif|webp|tiff?|bmp)$/i.test(fileName);

  // Add characteristic-based tags
  if (hints.isFinancial) hints.matchedTags.push('financial');
  if (hints.isLegal) hints.matchedTags.push('legal');
  if (hints.isIdentity) hints.matchedTags.push('kyc', 'identity');
  if (hints.isSpreadsheet) hints.matchedTags.push('spreadsheet', 'data');
  if (hints.isImage) hints.matchedTags.push('images', 'photographs');

  // Deduplicate tags
  hints.matchedTags = [...new Set(hints.matchedTags)];

  return hints;
}

// =============================================================================
// CONTENT PRE-PROCESSORS
// =============================================================================

/**
 * Pre-process a PDF for the API call.
 * Strategy: If text available, use truncated text. If multimodal, send first pages as images.
 * For now, we use text content since PDF-to-image conversion requires server-side processing.
 */
async function preprocessPdf(
  file: { arrayBuffer: () => Promise<ArrayBuffer> },
  extractedText?: string,
): Promise<DocumentContent> {
  if (extractedText && extractedText.length > 0) {
    return preprocessText(extractedText, '');
  }

  // If no text extraction, send raw PDF pages as base64
  // This path requires the Anthropic PDF document support
  try {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // For large PDFs, we rely on Anthropic's built-in page handling
    // The API will extract pages internally
    return {
      type: 'pdf_pages',
      pages: [{
        pageNumber: 1,
        base64,
        mediaType: 'application/pdf',
      }],
    };
  } catch {
    return { type: 'text', text: '[PDF content could not be extracted]' };
  }
}

/**
 * Pre-process an image for the API call.
 */
async function preprocessImage(
  file: { arrayBuffer: () => Promise<ArrayBuffer>; type: string },
): Promise<DocumentContent> {
  try {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return {
      type: 'image',
      base64,
      mediaType: file.type,
    };
  } catch {
    return { type: 'text', text: '[Image content could not be processed]' };
  }
}

/**
 * Pre-process a spreadsheet. Uses extracted text/summary since we can't
 * parse Excel files on the client side easily.
 */
function preprocessSpreadsheet(extractedText?: string): DocumentContent {
  if (!extractedText) {
    return { type: 'text', text: '[Spreadsheet content requires server-side extraction]' };
  }

  // Try to parse as spreadsheet summary if structured
  // Otherwise fall back to text
  return preprocessText(extractedText, '');
}

/**
 * Smart text truncation for large documents.
 * Strategy: Keep first ~3000 chars + last ~1000 chars to capture
 * document header/intro and conclusion/signatures.
 */
function preprocessText(text: string, fileName: string): DocumentContent {
  const MAX_TEXT_LENGTH = 4000;

  if (text.length <= MAX_TEXT_LENGTH) {
    return { type: 'text', text };
  }

  // Smart truncation: beginning + end
  const headLength = Math.floor(MAX_TEXT_LENGTH * 0.75); // 3000 chars
  const tailLength = MAX_TEXT_LENGTH - headLength;         // 1000 chars

  const head = text.slice(0, headLength);
  const tail = text.slice(-tailLength);

  const truncated = `${head}\n\n[... ${text.length - MAX_TEXT_LENGTH} characters truncated ...]\n\n${tail}`;

  return { type: 'text', text: truncated };
}

// =============================================================================
// UTILS
// =============================================================================

function isSpreadsheet(mediaType: string, fileName: string): boolean {
  return (
    mediaType.includes('spreadsheet') ||
    mediaType.includes('excel') ||
    /\.(xlsx?|csv|ods)$/i.test(fileName)
  );
}

// =============================================================================
// BATCH CHUNKING
// =============================================================================

/**
 * Split a list of BatchDocuments into chunks for API calls.
 * Each chunk stays within token and document count limits.
 */
export function chunkBatch(
  documents: BatchDocument[],
  maxDocsPerCall: number = 8,
  maxTokensPerCall: number = 80_000,
  tokensPerDoc: number = 3_000,
  tokensForSystem: number = 8_000,
): BatchDocument[][] {
  const chunks: BatchDocument[][] = [];
  let currentChunk: BatchDocument[] = [];
  let currentTokens = tokensForSystem; // Start with system prompt overhead

  for (const doc of documents) {
    const docTokens = estimateDocumentTokens(doc);

    // Check if adding this doc would exceed limits
    if (
      currentChunk.length >= maxDocsPerCall ||
      currentTokens + docTokens > maxTokensPerCall
    ) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = [];
      currentTokens = tokensForSystem;
    }

    currentChunk.push(doc);
    currentTokens += docTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Chunk documents for batch intelligence extraction.
 * Groups by count (text is truncated per-doc in the API call itself).
 *
 * @param documents — Array of { index, textLength } for each document
 * @param maxDocsPerCall — Maximum documents per intelligence API call (default: 5)
 * @returns Array of arrays of document indices, each array is one batch
 */
export function chunkIntelligenceBatch(
  documents: Array<{ index: number; textLength: number }>,
  maxDocsPerCall: number = 5,
): number[][] {
  const chunks: number[][] = [];
  let currentChunk: number[] = [];

  for (const doc of documents) {
    if (currentChunk.length >= maxDocsPerCall) {
      chunks.push(currentChunk);
      currentChunk = [];
    }
    currentChunk.push(doc.index);
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Rough token estimate for a document.
 * ~4 chars per token for English text, images are ~85 tokens per tile.
 */
function estimateDocumentTokens(doc: BatchDocument): number {
  switch (doc.processedContent.type) {
    case 'text':
      return Math.ceil(doc.processedContent.text.length / 4);
    case 'pdf_pages':
      // Estimate from actual base64 data size, not page count.
      // base64 chars * 0.75 (decode to bytes) / 6 (avg chars per token for binary/PDF content)
      const totalBase64Chars = doc.processedContent.pages.reduce((acc, p) => acc + p.base64.length, 0);
      return Math.max(1000, Math.ceil(totalBase64Chars * 0.75 / 6));
    case 'image':
      // Images are ~600-1600 tokens depending on size
      return 1200;
    case 'spreadsheet':
      const ss = doc.processedContent.summary;
      const textLength = ss.sheetPreviews.reduce(
        (acc, p) => acc + p.headers.join('').length + p.sampleRows.flat().join('').length,
        0
      );
      return Math.ceil(textLength / 4) + 200; // overhead
    default:
      return 3000; // conservative default
  }
}
