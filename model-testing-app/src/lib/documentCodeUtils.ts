/**
 * Document Code Generation Utilities
 * 
 * Generates standardized document codes in the format:
 * - Client docs: [CLIENT]-[TYPE]-[PROJECT]-[DDMMYY]
 * - Internal docs: ROCK-INT-[TOPIC]-[DDMMYY]
 */

/**
 * Abbreviates text by removing spaces, special characters, and optionally vowels
 * @param text - Text to abbreviate
 * @param maxLength - Maximum length for abbreviation
 * @param removeVowels - Whether to remove vowels after first character
 * @returns Abbreviated uppercase string
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
 * @param category - Document category
 * @param projectName - Project name (optional)
 * @param uploadedAt - Upload date (ISO string or Date)
 * @returns Document code (e.g., "FIRESIDE-VAL-WELLINGTON-201125")
 */
export function generateDocumentCode(
  clientName: string,
  category: string,
  projectName: string | undefined,
  uploadedAt: string | Date
): string {
  const clientCode = abbreviateText(clientName, 8);
  const typeCode = abbreviateCategory(category);
  const projectCode = projectName ? abbreviateText(projectName, 10) : '';
  const dateCode = formatDateDDMMYY(uploadedAt);
  
  if (projectCode) {
    return `${clientCode}-${typeCode}-${projectCode}-${dateCode}`;
  } else {
    return `${clientCode}-${typeCode}-${dateCode}`;
  }
}

/**
 * Generates a document code for internal documents
 * @param category - Document category or topic
 * @param uploadedAt - Upload date (ISO string or Date)
 * @returns Document code (e.g., "ROCK-INT-TOPIC-251120")
 */
export function generateInternalDocumentCode(
  category: string,
  uploadedAt: string | Date
): string {
  const topicCode = abbreviateText(category || 'DOC', 8);
  const dateCode = formatDateDDMMYY(uploadedAt);
  
  return `ROCK-INT-${topicCode}-${dateCode}`;
}

/**
 * Validates document code format
 * @param code - Document code to validate
 * @returns true if valid format
 */
export function validateDocumentCode(code: string): boolean {
  if (!code) return false;
  
  // Pattern: ALPHANUMERIC-ALPHANUMERIC-ALPHANUMERIC-DDMMYY
  // Or: ROCK-INT-ALPHANUMERIC-DDMMYY for internal
  const clientDocPattern = /^[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?-\d{6}$/;
  const internalDocPattern = /^ROCK-INT-[A-Z0-9]+-\d{6}$/;
  
  return clientDocPattern.test(code) || internalDocPattern.test(code);
}

/**
 * Parses a document code into its components
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
  if (!validateDocumentCode(code)) {
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

