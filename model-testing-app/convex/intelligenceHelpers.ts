/**
 * Intelligence Extraction Helpers for Convex
 *
 * Simplified extraction utilities for processing documentAnalysis data
 * into structured intelligence when documents are filed.
 *
 * Based on canonicalFields.ts but adapted for Convex environment.
 */

// =============================================================================
// TYPES
// =============================================================================

export type FieldType = 'string' | 'number' | 'currency' | 'date' | 'percentage' | 'array' | 'text' | 'boolean';

export interface ExtractedField {
  fieldPath: string;
  label: string;
  value: any;
  valueType: FieldType;
  isCanonical: boolean;
  confidence: number;
  sourceText?: string;
  scope: 'client' | 'project';
  category: string;
}

// =============================================================================
// COMMON CANONICAL FIELD MAPPINGS
// =============================================================================

// Maps common labels to canonical field paths
const LABEL_TO_CANONICAL: Record<string, { path: string; scope: 'client' | 'project' | 'context' }> = {
  // Financial fields (project-level)
  'gdv': { path: 'financials.gdv', scope: 'project' },
  'gross development value': { path: 'financials.gdv', scope: 'project' },
  'loan amount': { path: 'financials.loanAmount', scope: 'project' },
  'loan': { path: 'financials.loanAmount', scope: 'project' },
  'facility': { path: 'financials.loanAmount', scope: 'project' },
  'ltv': { path: 'financials.ltv', scope: 'project' },
  'loan to value': { path: 'financials.ltv', scope: 'project' },
  'ltc': { path: 'financials.ltc', scope: 'project' },
  'loan to cost': { path: 'financials.ltc', scope: 'project' },
  'purchase price': { path: 'financials.purchasePrice', scope: 'project' },
  'acquisition price': { path: 'financials.purchasePrice', scope: 'project' },
  'total development cost': { path: 'financials.totalDevelopmentCost', scope: 'project' },
  'tdc': { path: 'financials.totalDevelopmentCost', scope: 'project' },
  'construction cost': { path: 'financials.constructionCost', scope: 'project' },
  'build cost': { path: 'financials.constructionCost', scope: 'project' },
  'profit margin': { path: 'financials.profitMargin', scope: 'project' },
  'profit': { path: 'financials.profitMargin', scope: 'project' },
  'equity': { path: 'financials.equityContribution', scope: 'project' },
  'equity contribution': { path: 'financials.equityContribution', scope: 'project' },
  'current value': { path: 'financials.currentValue', scope: 'project' },
  'market value': { path: 'financials.currentValue', scope: 'project' },

  // Timeline fields (project-level)
  'completion': { path: 'timeline.practicalCompletion', scope: 'project' },
  'practical completion': { path: 'timeline.practicalCompletion', scope: 'project' },
  'pc date': { path: 'timeline.practicalCompletion', scope: 'project' },
  'start date': { path: 'timeline.constructionStart', scope: 'project' },
  'construction start': { path: 'timeline.constructionStart', scope: 'project' },
  'acquisition date': { path: 'timeline.acquisitionDate', scope: 'project' },
  'exchange': { path: 'timeline.acquisitionDate', scope: 'project' },
  'duration': { path: 'timeline.projectDuration', scope: 'project' },
  'project duration': { path: 'timeline.projectDuration', scope: 'project' },
  'term': { path: 'timeline.projectDuration', scope: 'project' },

  // Location fields (project-level)
  'site address': { path: 'location.siteAddress', scope: 'project' },
  'address': { path: 'location.siteAddress', scope: 'project' },
  'property address': { path: 'location.siteAddress', scope: 'project' },
  'postcode': { path: 'location.postcode', scope: 'project' },
  'title number': { path: 'location.titleNumber', scope: 'project' },
  'local authority': { path: 'location.localAuthority', scope: 'project' },

  // Overview fields (project-level)
  'project name': { path: 'overview.projectName', scope: 'project' },
  'scheme': { path: 'overview.projectName', scope: 'project' },
  'development': { path: 'overview.projectName', scope: 'project' },
  'unit count': { path: 'overview.unitCount', scope: 'project' },
  'units': { path: 'overview.unitCount', scope: 'project' },
  'number of units': { path: 'overview.unitCount', scope: 'project' },
  'total sqft': { path: 'overview.totalSqft', scope: 'project' },
  'square footage': { path: 'overview.totalSqft', scope: 'project' },
  'gifa': { path: 'overview.totalSqft', scope: 'project' },

  // Company fields (client-level)
  'company name': { path: 'company.name', scope: 'client' },
  'company': { path: 'company.name', scope: 'client' },
  'borrower': { path: 'company.name', scope: 'client' },
  'registration number': { path: 'company.registrationNumber', scope: 'client' },
  'company number': { path: 'company.registrationNumber', scope: 'client' },
  'crn': { path: 'company.registrationNumber', scope: 'client' },
  'registered address': { path: 'company.registeredAddress', scope: 'client' },
  'incorporation date': { path: 'company.incorporationDate', scope: 'client' },

  // Contact fields (client-level)
  'contact name': { path: 'contact.primaryName', scope: 'client' },
  'contact': { path: 'contact.primaryName', scope: 'client' },
  'name': { path: 'contact.primaryName', scope: 'client' },
  'email': { path: 'contact.email', scope: 'client' },
  'phone': { path: 'contact.phone', scope: 'client' },
  'telephone': { path: 'contact.phone', scope: 'client' },

  // Financial (client-level)
  'net worth': { path: 'financial.netWorth', scope: 'client' },
  'liquid assets': { path: 'financial.liquidAssets', scope: 'client' },
  'annual income': { path: 'financial.annualIncome', scope: 'client' },
  'portfolio value': { path: 'financial.propertyPortfolioValue', scope: 'client' },
};

// Categories that indicate client-level intelligence
const CLIENT_LEVEL_CATEGORIES = [
  'KYC',
  'Background',
  'Corporate',
  'Identity',
  'Financial Statement',
  'Bank Statement',
  'Tax',
  'CV',
  'Track Record',
];

// =============================================================================
// VALUE PARSING FUNCTIONS
// =============================================================================

/**
 * Parse currency strings into numeric values
 * Examples: "£12.5m" → 12500000, "£2,500,000" → 2500000
 */
export function parseCurrencyValue(value: string): number | null {
  if (!value || typeof value !== 'string') return null;

  let cleaned = value.replace(/[£$€,\s]/g, '').toLowerCase();

  let multiplier = 1;
  if (cleaned.includes('m') || cleaned.includes('million')) {
    multiplier = 1000000;
    cleaned = cleaned.replace(/m(illion)?/g, '');
  } else if (cleaned.includes('k') || cleaned.includes('thousand')) {
    multiplier = 1000;
    cleaned = cleaned.replace(/k|thousand/g, '');
  } else if (cleaned.includes('bn') || cleaned.includes('b') || cleaned.includes('billion')) {
    multiplier = 1000000000;
    cleaned = cleaned.replace(/bn|b(illion)?/g, '');
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  return Math.round(num * multiplier);
}

/**
 * Parse percentage strings into numeric values
 */
export function parsePercentageValue(value: string): number | null {
  if (!value || typeof value !== 'string') return null;

  let cleaned = value.replace(/[%\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  // If it's a decimal less than 1, convert to percentage
  if (num > 0 && num < 1) {
    return Math.round(num * 100);
  }

  return num;
}

/**
 * Parse date strings into ISO format
 */
export function parseDateValue(value: string): string | null {
  if (!value || typeof value !== 'string') return null;

  // Try native Date parsing first
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  // Handle UK format DD/MM/YYYY
  const ukMatch = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Handle "Month Year" format
  const monthYearMatch = value.match(/([A-Za-z]+)\s+(\d{4})/);
  if (monthYearMatch) {
    const [, monthStr, year] = monthYearMatch;
    const monthIndex = new Date(`${monthStr} 1, 2000`).getMonth();
    if (!isNaN(monthIndex)) {
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    }
  }

  return null;
}

// =============================================================================
// FIELD MAPPING FUNCTIONS
// =============================================================================

/**
 * Normalize a label to a canonical field path
 */
function normalizeLabel(label: string): {
  path: string;
  isCanonical: boolean;
  scope: 'client' | 'project' | 'context';
  confidence: number;
} {
  const normalized = label.toLowerCase().trim();

  // Check for exact match
  if (LABEL_TO_CANONICAL[normalized]) {
    const match = LABEL_TO_CANONICAL[normalized];
    return { path: match.path, isCanonical: true, scope: match.scope, confidence: 0.95 };
  }

  // Check for partial match
  for (const [key, mapping] of Object.entries(LABEL_TO_CANONICAL)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return { path: mapping.path, isCanonical: true, scope: mapping.scope, confidence: 0.8 };
    }
  }

  // Create custom field path
  const customKey = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 50);

  return {
    path: `extracted.${customKey}`,
    isCanonical: false,
    scope: 'context',
    confidence: 0.5
  };
}

/**
 * Determine the scope for a field
 */
function determineScope(
  fieldScope: 'client' | 'project' | 'context',
  hasProjectContext: boolean,
  documentCategory?: string
): 'client' | 'project' {
  if (fieldScope === 'client') return 'client';
  if (fieldScope === 'project') return hasProjectContext ? 'project' : 'client';

  // For context-dependent fields, check document category
  if (documentCategory) {
    const isClientCategory = CLIENT_LEVEL_CATEGORIES.some(
      cat => documentCategory.toLowerCase().includes(cat.toLowerCase())
    );
    if (isClientCategory) return 'client';
  }

  return hasProjectContext ? 'project' : 'client';
}

/**
 * Get category from field path
 */
function getCategoryFromPath(path: string): string {
  return path.split('.')[0];
}

// =============================================================================
// MAIN EXTRACTION FUNCTIONS
// =============================================================================

/**
 * Parse a keyAmount string into a structured field
 */
export function parseKeyAmount(
  amountString: string,
  hasProjectContext: boolean,
  documentCategory?: string
): ExtractedField | null {
  const colonIndex = amountString.indexOf(':');

  if (colonIndex <= 0) return null;

  const label = amountString.substring(0, colonIndex).trim();
  const rawValue = amountString.substring(colonIndex + 1).trim();

  const normResult = normalizeLabel(label);
  const scope = determineScope(normResult.scope, hasProjectContext, documentCategory);

  // Determine value type and parse
  let value: any = rawValue;
  let valueType: FieldType = 'string';

  // Check if it's a percentage
  if (rawValue.includes('%') || ['ltv', 'ltc', 'profit', 'margin', 'yield', 'return'].some(p => label.toLowerCase().includes(p))) {
    const parsed = parsePercentageValue(rawValue);
    if (parsed !== null) {
      value = parsed;
      valueType = 'percentage';
    }
  }
  // Check if it's a currency
  else if (rawValue.match(/[£$€]/) || rawValue.match(/\d.*[mk]/i)) {
    const parsed = parseCurrencyValue(rawValue);
    if (parsed !== null) {
      value = parsed;
      valueType = 'currency';
    }
  }
  // Check if it's a number
  else {
    const num = parseFloat(rawValue.replace(/,/g, ''));
    if (!isNaN(num)) {
      value = num;
      valueType = 'number';
    }
  }

  return {
    fieldPath: normResult.path,
    label: label,
    value,
    valueType,
    isCanonical: normResult.isCanonical,
    confidence: normResult.confidence,
    sourceText: amountString,
    scope,
    category: getCategoryFromPath(normResult.path),
  };
}

/**
 * Parse a keyDate string into a structured field
 */
export function parseKeyDate(
  dateString: string,
  hasProjectContext: boolean,
  documentCategory?: string
): ExtractedField | null {
  const colonIndex = dateString.indexOf(':');

  if (colonIndex <= 0) return null;

  const label = dateString.substring(0, colonIndex).trim();
  const rawValue = dateString.substring(colonIndex + 1).trim();

  const normResult = normalizeLabel(label);
  const scope = determineScope(normResult.scope, hasProjectContext, documentCategory);

  const parsedDate = parseDateValue(rawValue);
  const value = parsedDate || rawValue;
  const valueType: FieldType = parsedDate ? 'date' : 'string';

  return {
    fieldPath: normResult.path,
    label: label,
    value,
    valueType,
    isCanonical: normResult.isCanonical,
    confidence: normResult.confidence,
    sourceText: dateString,
    scope,
    category: getCategoryFromPath(normResult.path),
  };
}

/**
 * Parse entities into structured fields
 */
export function parseEntities(
  entities: {
    companies?: string[];
    people?: string[];
    locations?: string[];
    projects?: string[];
  },
  hasProjectContext: boolean,
  documentCategory?: string
): ExtractedField[] {
  const fields: ExtractedField[] = [];

  // Companies - typically client-level
  if (entities.companies && entities.companies.length > 0) {
    fields.push({
      fieldPath: 'company.name',
      label: 'Company Name',
      value: entities.companies[0],
      valueType: 'string',
      isCanonical: true,
      confidence: 0.7,
      sourceText: `Entities: ${entities.companies.join(', ')}`,
      scope: 'client',
      category: 'company',
    });
  }

  // People - primary contact
  if (entities.people && entities.people.length > 0) {
    fields.push({
      fieldPath: 'contact.primaryName',
      label: 'Primary Contact',
      value: entities.people[0],
      valueType: 'string',
      isCanonical: true,
      confidence: 0.6,
      sourceText: `Entities: ${entities.people.join(', ')}`,
      scope: 'client',
      category: 'contact',
    });
  }

  // Locations - site address if project context
  if (entities.locations && entities.locations.length > 0 && hasProjectContext) {
    fields.push({
      fieldPath: 'location.siteAddress',
      label: 'Site Address',
      value: entities.locations[0],
      valueType: 'string',
      isCanonical: true,
      confidence: 0.6,
      sourceText: `Entities: ${entities.locations.join(', ')}`,
      scope: 'project',
      category: 'location',
    });
  }

  return fields;
}

/**
 * Parse key findings/insights
 */
export function parseKeyFindings(
  executiveSummary: string,
  keyTerms: string[],
  hasProjectContext: boolean
): ExtractedField[] {
  const fields: ExtractedField[] = [];

  if (executiveSummary && executiveSummary.length > 50) {
    fields.push({
      fieldPath: 'insights.executive_summary',
      label: 'Executive Summary',
      value: executiveSummary,
      valueType: 'text',
      isCanonical: false,
      confidence: 0.9,
      scope: hasProjectContext ? 'project' : 'client',
      category: 'insights',
    });
  }

  if (keyTerms && keyTerms.length > 0) {
    fields.push({
      fieldPath: 'insights.key_terms',
      label: 'Key Terms',
      value: keyTerms,
      valueType: 'array',
      isCanonical: false,
      confidence: 0.8,
      scope: hasProjectContext ? 'project' : 'client',
      category: 'insights',
    });
  }

  return fields;
}

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Extract intelligence from documentAnalysis on confirmed filing
 *
 * This is the main function called during the filing process to extract
 * structured intelligence from the document's analysis data.
 */
export function extractIntelligenceFromDocumentAnalysis(
  documentAnalysis: {
    keyAmounts?: string[];
    keyDates?: string[];
    keyTerms?: string[];
    entities?: {
      companies?: string[];
      people?: string[];
      locations?: string[];
      projects?: string[];
    };
    executiveSummary?: string;
    detailedSummary?: string;
  },
  hasProjectContext: boolean,
  documentCategory?: string
): ExtractedField[] {
  const allFields: ExtractedField[] = [];

  // 1. Parse key amounts (GDV, loan amount, etc.)
  if (documentAnalysis.keyAmounts) {
    for (const amount of documentAnalysis.keyAmounts) {
      const parsed = parseKeyAmount(amount, hasProjectContext, documentCategory);
      if (parsed) {
        allFields.push(parsed);
      }
    }
  }

  // 2. Parse key dates
  if (documentAnalysis.keyDates) {
    for (const dateStr of documentAnalysis.keyDates) {
      const parsed = parseKeyDate(dateStr, hasProjectContext, documentCategory);
      if (parsed) {
        allFields.push(parsed);
      }
    }
  }

  // 3. Parse entities
  if (documentAnalysis.entities) {
    const entityFields = parseEntities(
      documentAnalysis.entities,
      hasProjectContext,
      documentCategory
    );
    allFields.push(...entityFields);
  }

  // 4. Parse key findings (summary and terms)
  if (documentAnalysis.executiveSummary || documentAnalysis.keyTerms) {
    const findingsFields = parseKeyFindings(
      documentAnalysis.executiveSummary || '',
      documentAnalysis.keyTerms || [],
      hasProjectContext
    );
    allFields.push(...findingsFields);
  }

  // Deduplicate by fieldPath, keeping highest confidence
  const fieldMap = new Map<string, ExtractedField>();
  for (const field of allFields) {
    const existing = fieldMap.get(field.fieldPath);
    if (!existing || field.confidence > existing.confidence) {
      fieldMap.set(field.fieldPath, field);
    }
  }

  return Array.from(fieldMap.values());
}
