/**
 * Document Code Generation Utilities
 *
 * Generation delegates to the canonical convention in ./documentNaming:
 * - Client docs: <Project>_<DocType>_<Initials>_<AUDIENCE>_V<maj.min>_<YYYYMMDD>
 * - Internal docs: RockCap_<Topic>_<YYYYMMDD>
 *
 * The abbreviate/legacy-format helpers below are kept ONLY for editing/parsing
 * codes on existing rows (forward-only migration: legacy codes are never
 * regenerated) — do not use them for new names.
 */

import { type DocumentNamingConfig } from './namingConfig';
import { buildDocumentName, buildInternalDocumentName } from './documentNaming';

/**
 * Abbreviates text by removing spaces, special characters, and optionally vowels
 * @param text - Text to abbreviate
 * @param maxLength - Maximum length for abbreviation
 * @param removeVowels - Whether to remove vowels after first character
 * @returns Abbreviated uppercase string
 * @deprecated Legacy-format helper — kept for legacy code editors only.
 */
export function abbreviateText(
  text: string,
  maxLength: number,
  removeVowels: boolean = false
): string {
  if (!text) return '';

  // Remove special characters and spaces, convert to uppercase
  let cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // If still too long and removeVowels is true, remove vowels after first char
  if (removeVowels && cleaned.length > maxLength) {
    const firstChar = cleaned[0];
    const rest = cleaned.slice(1).replace(/[AEIOU]/g, '');
    cleaned = firstChar + rest;
  }

  // Truncate to max length
  return cleaned.slice(0, maxLength);
}

/**
 * Abbreviates category to document type code
 * @param category - Document category (e.g., "Valuation", "Operating Statement")
 * @returns Abbreviated type code (e.g., "VAL", "OPR")
 * @deprecated Legacy-format helper — new names use the full-word DocType token.
 */
export function abbreviateCategory(category: string): string {
  if (!category) return 'DOC';

  const categoryMap: Record<string, string> = {
    'valuation': 'VAL',
    'operating': 'OPR',
    'operating statement': 'OPR',
    'appraisal': 'APP',
    'financial': 'FIN',
    'contract': 'CNT',
    'agreement': 'AGR',
    'invoice': 'INV',
    'report': 'RPT',
    'letter': 'LTR',
    'email': 'EML',
    'note': 'NTE',
    'memo': 'MEM',
    'proposal': 'PRP',
    'quote': 'QTE',
    'receipt': 'RCP',
  };

  const categoryLower = category.toLowerCase();

  // Check for exact matches first
  for (const [key, value] of Object.entries(categoryMap)) {
    if (categoryLower.includes(key)) {
      return value;
    }
  }

  // Fallback: abbreviate first 3 chars
  return abbreviateText(category, 3);
}

/**
 * Formats date to DDMMYY format
 * @param dateString - ISO date string or Date object
 * @returns Date string in DDMMYY format
 * @deprecated Legacy-format helper — the convention's date token is YYYYMMDD.
 */
export function formatDateDDMMYY(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);

  return `${day}${month}${year}`;
}

/**
 * Generates a document code for client/project documents
 * @param clientName - Client name
 * @param category - Document category/type (full words)
 * @param projectName - Project name (optional)
 * @param uploadedAt - Upload date (ISO string or Date)
 * @returns Document code (e.g., "DarkMills_CreditChecklist_V1.0_20260707")
 */
export function generateDocumentCode(
  clientName: string,
  category: string,
  projectName: string | undefined,
  uploadedAt: string | Date,
  namingConfig?: DocumentNamingConfig,
  customFieldValues?: Record<string, string>
): string {
  return buildDocumentName({
    fileType: category,
    clientName,
    projectName,
    date: uploadedAt,
    namingConfig,
    customFieldValues,
  });
}

/**
 * Generates a document code for internal documents
 * @param category - Document category or topic
 * @param uploadedAt - Upload date (ISO string or Date)
 * @returns Document code (e.g., "RockCap_LendingPolicy_20260707")
 */
export function generateInternalDocumentCode(
  category: string,
  uploadedAt: string | Date
): string {
  return buildInternalDocumentName(category, uploadedAt);
}

/**
 * Validates document code format — accepts BOTH the current underscore
 * convention and the legacy hyphen formats still present on existing rows.
 * @param code - Document code to validate
 * @returns true if valid format
 */
export function validateDocumentCode(code: string): boolean {
  if (!code) return false;

  // Current convention: underscore-delimited tokens ending in YYYYMMDD,
  // e.g. DarkMills_CreditChecklist_RS_INTERNAL_V1.0_20260707 (optional -N uniqueness suffix)
  const underscorePattern = /^[A-Za-z0-9][A-Za-z0-9.\-]*(_[A-Za-z0-9][A-Za-z0-9.\-]*)+$/;

  // Legacy: ALPHANUMERIC-ALPHANUMERIC-ALPHANUMERIC-DDMMYY
  // Or: ROCK-INT-ALPHANUMERIC-DDMMYY for internal
  const clientDocPattern = /^[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?-\d{6}$/;
  const internalDocPattern = /^ROCK-INT-[A-Z0-9]+-\d{6}$/;

  return underscorePattern.test(code) || clientDocPattern.test(code) || internalDocPattern.test(code);
}

/**
 * Parses a LEGACY document code into its components.
 * New underscore-convention codes return null — use
 * parseDocumentName from ./documentNaming for those.
 * @param code - Document code to parse
 * @returns Parsed components or null if invalid
 */
export function parseDocumentCode(code: string): {
  type: 'client' | 'internal';
  clientCode?: string;
  typeCode?: string;
  projectCode?: string;
  topicCode?: string;
  date: string;
} | null {
  if (!code || code.includes('_')) {
    return null;
  }

  // Internal document format: ROCK-INT-TOPIC-DDMMYY
  if (code.startsWith('ROCK-INT-')) {
    const parts = code.split('-');
    if (parts.length === 4) {
      return {
        type: 'internal',
        topicCode: parts[2],
        date: parts[3],
      };
    }
  }

  // Client document format: CLIENT-TYPE-PROJECT-DDMMYY or CLIENT-TYPE-DDMMYY
  const legacyClientPattern = /^[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?-\d{6}$/;
  if (!legacyClientPattern.test(code)) {
    return null;
  }

  const parts = code.split('-');
  if (parts.length >= 3) {
    const date = parts[parts.length - 1];
    const clientCode = parts[0];
    const typeCode = parts[1];
    const projectCode = parts.length === 4 ? parts[2] : undefined;

    return {
      type: 'client',
      clientCode,
      typeCode,
      projectCode,
      date,
    };
  }

  return null;
}
