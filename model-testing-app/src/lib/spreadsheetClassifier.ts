/**
 * Determines if a spreadsheet contains appraisal/construction cost data
 * that requires detailed extraction, or if it's just a regular spreadsheet
 * that should only be summarized and filed.
 */

export interface SpreadsheetClassification {
  requiresExtraction: boolean;
  reason: string;
  confidence: number;
  complexity: 'simple' | 'moderate' | 'complex';
  sheetCount?: number;
  hasSummarySheet?: boolean;
}

/**
 * Keywords that indicate appraisal/construction cost spreadsheets
 */
const EXTRACTION_KEYWORDS = [
  // Construction and build costs
  'construction cost',
  'build cost',
  'building cost',
  'site cost',
  'land cost',
  'development cost',
  'project cost',
  'build estimate',
  'construction estimate',
  
  // Cost breakdowns
  'cost breakdown',
  'cost analysis',
  'cost estimate',
  'cost summary',
  'cost schedule',
  
  // Professional fees and categories
  'professional fee',
  'prof fee',
  'disposal fee',
  'financing cost',
  'legal fee',
  'site purchase',
  'stamp duty',
  'sdlt',
  
  // Plot/development specific
  'plot cost',
  'plot price',
  'development cost',
  'unit cost',
  'house cost',
  'property cost',
  'number of units',
  'no. units',
  
  // Square footage and pricing
  'square feet',
  'sq ft',
  'sqft',
  'price per square',
  'cost per square',
  'per sq ft',
  'per sqft',
  
  // Totals and summaries
  'total development cost',
  'total construction cost',
  'total build cost',
  'net construction cost',
  'gross development value',
  'gdv',
  'total costs',
  
  // Revenue and profit
  'total sales',
  'sales value',
  'revenue',
  'profit',
  'profit margin',
  'developer profit',
  'net profit',
  
  // Appraisal specific
  'appraisal',
  'valuation breakdown',
  'property valuation',
  'cost estimate',
  'residual valuation',
  'development appraisal',
];

/**
 * Keywords that indicate summary sheets (preferred for extraction)
 */
const SUMMARY_SHEET_KEYWORDS = [
  'summary',
  'overview',
  'appraisal',
  'costs summary',
  'cost summary',
  'development summary',
  'project summary',
  'executive summary',
];

/**
 * Keywords that indicate NON-extraction spreadsheets (loan info, accounting, etc.)
 */
const NON_EXTRACTION_KEYWORDS = [
  // Loan comparison tables
  'lender',
  'loan comparison',
  'loan offer',
  'loan terms',
  'interest rate',
  'arrangement fee',
  'exit fee',
  'ltv',
  'ltgdv',
  'net advance',
  'gross loan',
  'monthly interest',
  
  // Accounting/financial statements
  'income statement',
  'balance sheet',
  'cash flow',
  'financial statement',
  'accounting',
  'ledger',
  'trial balance',
  
  // General data tables
  'comparison table',
  'comparison sheet',
  'data table',
  'information table',
];

/**
 * Detect the number of sheets in a workbook from the content
 */
function detectSheetCount(textContent: string, markdownContent: string | null): number {
  const content = `${textContent} ${markdownContent || ''}`;
  // Look for sheet markers like "=== Sheet: Name ===" or "## Sheet: Name"
  const sheetPattern = /(?:===\s*Sheet:|##\s*Sheet:)/gi;
  const matches = content.match(sheetPattern);
  return matches ? matches.length : 1;
}

/**
 * Check if the workbook has a summary sheet
 */
function hasSummarySheet(textContent: string, markdownContent: string | null): boolean {
  const content = `${textContent} ${markdownContent || ''}`.toLowerCase();
  
  for (const keyword of SUMMARY_SHEET_KEYWORDS) {
    // Look for sheet headers containing summary keywords
    const pattern = new RegExp(`(?:sheet:|===\\s*).*${keyword}`, 'i');
    if (pattern.test(content)) {
      return true;
    }
  }
  return false;
}

/**
 * Determine workbook complexity based on sheet count and content patterns
 */
function determineComplexity(sheetCount: number, textContent: string): 'simple' | 'moderate' | 'complex' {
  const contentLength = textContent.length;
  
  if (sheetCount === 1 && contentLength < 10000) {
    return 'simple';
  } else if (sheetCount <= 3 && contentLength < 50000) {
    return 'moderate';
  } else {
    return 'complex';
  }
}

/**
 * Classifies a spreadsheet to determine if it requires detailed extraction
 * or should just be summarized and filed.
 * 
 * @param textContent - The text content of the spreadsheet
 * @param markdownContent - The markdown representation of the spreadsheet (if available)
 * @param fileName - The name of the file
 * @returns Classification result indicating if extraction is needed
 */
export function classifySpreadsheet(
  textContent: string,
  markdownContent: string | null,
  fileName: string
): SpreadsheetClassification {
  // Combine all content for analysis
  const combinedContent = `${textContent} ${markdownContent || ''} ${fileName}`.toLowerCase();
  
  // Detect workbook characteristics
  const sheetCount = detectSheetCount(textContent, markdownContent);
  const summarySheetPresent = hasSummarySheet(textContent, markdownContent);
  const complexity = determineComplexity(sheetCount, textContent);
  
  // Count extraction indicators
  let extractionScore = 0;
  const foundExtractionKeywords: string[] = [];
  
  for (const keyword of EXTRACTION_KEYWORDS) {
    if (combinedContent.includes(keyword.toLowerCase())) {
      extractionScore += 1;
      foundExtractionKeywords.push(keyword);
    }
  }
  
  // Count non-extraction indicators
  let nonExtractionScore = 0;
  const foundNonExtractionKeywords: string[] = [];
  
  for (const keyword of NON_EXTRACTION_KEYWORDS) {
    if (combinedContent.includes(keyword.toLowerCase())) {
      nonExtractionScore += 1;
      foundNonExtractionKeywords.push(keyword);
    }
  }
  
  // Check for specific patterns that indicate loan comparison tables
  const hasLoanComparisonPattern = 
    combinedContent.includes('lender') &&
    (combinedContent.includes('net ltv') || combinedContent.includes('gross ltv') || combinedContent.includes('arrangement fee'));
  
  // Check for cost breakdown patterns
  const hasCostBreakdownPattern =
    (combinedContent.includes('site cost') || combinedContent.includes('build cost') || combinedContent.includes('construction cost')) &&
    (combinedContent.includes('plot') || combinedContent.includes('square feet') || combinedContent.includes('sq ft'));
  
  // Decision logic
  if (hasLoanComparisonPattern && nonExtractionScore > extractionScore) {
    return {
      requiresExtraction: false,
      reason: `Loan comparison table detected (found keywords: ${foundNonExtractionKeywords.slice(0, 3).join(', ')})`,
      confidence: 0.9,
      complexity,
      sheetCount,
      hasSummarySheet: summarySheetPresent,
    };
  }
  
  if (hasCostBreakdownPattern && extractionScore >= 3) {
    return {
      requiresExtraction: true,
      reason: `Construction cost breakdown detected (found keywords: ${foundExtractionKeywords.slice(0, 5).join(', ')})`,
      confidence: 0.95,
      complexity,
      sheetCount,
      hasSummarySheet: summarySheetPresent,
    };
  }
  
  // Complex workbooks with summary sheets are likely development appraisals
  if (complexity === 'complex' && summarySheetPresent && extractionScore >= 2) {
    return {
      requiresExtraction: true,
      reason: `Complex workbook with summary sheet detected (${sheetCount} sheets, found keywords: ${foundExtractionKeywords.slice(0, 3).join(', ')})`,
      confidence: 0.85,
      complexity,
      sheetCount,
      hasSummarySheet: summarySheetPresent,
    };
  }
  
  // If extraction keywords significantly outweigh non-extraction keywords
  if (extractionScore >= 5 && extractionScore > nonExtractionScore * 2) {
    return {
      requiresExtraction: true,
      reason: `Multiple construction/appraisal indicators found (${extractionScore} extraction keywords vs ${nonExtractionScore} non-extraction keywords)`,
      confidence: 0.85,
      complexity,
      sheetCount,
      hasSummarySheet: summarySheetPresent,
    };
  }
  
  // If non-extraction keywords significantly outweigh extraction keywords
  if (nonExtractionScore >= 3 && nonExtractionScore > extractionScore * 2) {
    return {
      requiresExtraction: false,
      reason: `Loan/accounting spreadsheet detected (found keywords: ${foundNonExtractionKeywords.slice(0, 3).join(', ')})`,
      confidence: 0.85,
      complexity,
      sheetCount,
      hasSummarySheet: summarySheetPresent,
    };
  }
  
  // Default: if we have some extraction keywords but not strong non-extraction indicators
  if (extractionScore >= 3) {
    return {
      requiresExtraction: true,
      reason: `Construction/appraisal indicators found (${extractionScore} keywords)`,
      confidence: 0.7,
      complexity,
      sheetCount,
      hasSummarySheet: summarySheetPresent,
    };
  }
  
  // Default: don't extract if no clear indicators
  return {
    requiresExtraction: false,
    reason: `No clear construction/appraisal indicators found. This appears to be a regular spreadsheet (${extractionScore} extraction keywords, ${nonExtractionScore} non-extraction keywords)`,
    confidence: 0.6,
    complexity,
    sheetCount,
    hasSummarySheet: summarySheetPresent,
  };
}

