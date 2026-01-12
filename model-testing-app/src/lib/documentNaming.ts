/**
 * Document Naming Utilities
 * 
 * Implements the standardized document naming convention:
 * <ProjectShortcode>-<Type>-<Internal/External>-<Initials>-<Version>-<Date>
 * 
 * Example: WIMBPARK28-APPRAISAL-EXT-JS-V1.0-2026-01-12
 */

// Type abbreviations for document naming
export const TYPE_ABBREVIATIONS: Record<string, string> = {
  // Appraisals & Valuations
  "appraisal": "APPRAISAL",
  "valuation": "APPRAISAL",
  "red book valuation": "APPRAISAL",
  "rics valuation": "APPRAISAL",
  "red book": "APPRAISAL",
  
  // Term Sheets
  "term sheet": "TERMSHEET",
  "termsheet": "TERMSHEET",
  "loan terms": "TERMSHEET",
  "terms comparison": "TERMSHEET",
  "term request": "TERMREQ",
  "terms request": "TERMREQ",
  
  // Credit
  "credit memo": "CREDIT",
  "credit submission": "CREDIT",
  "credit application": "CREDIT",
  
  // Financial/Operating
  "operating statement": "OPERATING",
  "operating model": "OPERATING",
  "financial model": "FINMODEL",
  "cash flow": "CASHFLOW",
  "pro forma": "PROFORMA",
  
  // Legal
  "contract": "CONTRACT",
  "agreement": "AGREEMENT",
  "legal document": "LEGAL",
  
  // Business
  "invoice": "INVOICE",
  "receipt": "RECEIPT",
  
  // Communications
  "correspondence": "CORRESP",
  "email": "EMAIL",
  "letter": "LETTER",
  
  // KYC/Identity
  "kyc": "KYC",
  "kyc document": "KYC",
  "identity verification": "KYC",
  
  // Notes/Memos
  "note": "NOTE",
  "notes": "NOTE",
  "memo": "MEMO",
  "internal memo": "MEMO",
  
  // Reports
  "report": "REPORT",
  "inspection": "INSPECT",
  "survey": "SURVEY",
  
  // Default
  "other": "DOC",
  "document": "DOC",
};

/**
 * Get the type abbreviation for a document category
 */
export function getTypeAbbreviation(category: string): string {
  const categoryLower = category.toLowerCase().trim();
  
  // Check for exact match
  if (TYPE_ABBREVIATIONS[categoryLower]) {
    return TYPE_ABBREVIATIONS[categoryLower];
  }
  
  // Check for partial matches
  for (const [key, abbrev] of Object.entries(TYPE_ABBREVIATIONS)) {
    if (categoryLower.includes(key) || key.includes(categoryLower)) {
      return abbrev;
    }
  }
  
  // Default: uppercase first 8 chars, alphanumeric only
  return categoryLower.replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 8) || "DOC";
}

/**
 * Extract initials from a user's full name
 * Examples:
 * - "John Smith" → "JS"
 * - "Mary Jane Watson" → "MJW"
 * - "john" → "J"
 */
export function getUserInitials(fullName: string): string {
  if (!fullName || fullName.trim().length === 0) {
    return "XX"; // Default if no name
  }
  
  const parts = fullName.trim().split(/\s+/);
  const initials = parts
    .map(part => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 3); // Max 3 initials
  
  return initials || "XX";
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateForNaming(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generate a document name following the new convention
 * Format: <ProjectShortcode>-<Type>-<Internal/External>-<Initials>-<Version>-<Date>
 */
export function generateDocumentName(options: {
  projectShortcode: string;
  category: string;
  isInternal: boolean;
  uploaderInitials: string;
  version?: string;
  date?: Date;
}): string {
  const {
    projectShortcode,
    category,
    isInternal,
    uploaderInitials,
    version = "V1.0",
    date = new Date(),
  } = options;
  
  const typeAbbrev = getTypeAbbreviation(category);
  const internalExternal = isInternal ? "INT" : "EXT";
  const initials = uploaderInitials.toUpperCase().slice(0, 3);
  const dateStr = formatDateForNaming(date);
  
  // Ensure shortcode is uppercase and max 10 chars
  const shortcode = projectShortcode.toUpperCase().slice(0, 10);
  
  return `${shortcode}-${typeAbbrev}-${internalExternal}-${initials}-${version}-${dateStr}`;
}

/**
 * Parse an existing document name to extract components
 * Returns null if the name doesn't match the expected format
 */
export function parseDocumentName(documentName: string): {
  projectShortcode: string;
  type: string;
  isInternal: boolean;
  initials: string;
  version: string;
  date: string;
} | null {
  // Expected format: SHORTCODE-TYPE-INT/EXT-INITIALS-VERSION-DATE
  const parts = documentName.split('-');
  
  if (parts.length < 6) {
    return null;
  }
  
  // The date is the last 3 parts (YYYY-MM-DD)
  const dateParts = parts.slice(-3);
  const date = dateParts.join('-');
  
  // Version is before the date
  const version = parts[parts.length - 4];
  if (!version?.startsWith('V')) {
    return null;
  }
  
  // Initials are before version
  const initials = parts[parts.length - 5];
  
  // INT/EXT is before initials
  const internalExternal = parts[parts.length - 6];
  if (internalExternal !== 'INT' && internalExternal !== 'EXT') {
    return null;
  }
  
  // Type is before INT/EXT (could be multiple parts if type has dash)
  // Shortcode is the first part
  const projectShortcode = parts[0];
  
  // Type is everything between shortcode and INT/EXT
  const typeEndIndex = parts.length - 6;
  const type = parts.slice(1, typeEndIndex).join('-');
  
  return {
    projectShortcode,
    type,
    isInternal: internalExternal === 'INT',
    initials,
    version,
    date,
  };
}

/**
 * Increment version number
 * @param currentVersion Current version (e.g., "V1.0")
 * @param isSignificant If true, increment major version (V1.0 → V2.0), else minor (V1.0 → V1.1)
 */
export function incrementVersion(currentVersion: string, isSignificant: boolean): string {
  // Parse current version
  const match = currentVersion.match(/^V(\d+)\.(\d+)$/);
  if (!match) {
    return isSignificant ? "V2.0" : "V1.1";
  }
  
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  
  if (isSignificant) {
    return `V${major + 1}.0`;
  } else {
    return `V${major}.${minor + 1}`;
  }
}

/**
 * Get the next version for a document
 * Checks existing versions and returns the next appropriate version
 */
export function getNextVersion(existingVersions: string[], isSignificant: boolean): string {
  if (existingVersions.length === 0) {
    return "V1.0";
  }
  
  // Parse all versions and find the highest
  let maxMajor = 1;
  let maxMinor = 0;
  
  for (const ver of existingVersions) {
    const match = ver.match(/^V(\d+)\.(\d+)$/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      
      if (major > maxMajor || (major === maxMajor && minor > maxMinor)) {
        maxMajor = major;
        maxMinor = minor;
      }
    }
  }
  
  if (isSignificant) {
    return `V${maxMajor + 1}.0`;
  } else {
    return `V${maxMajor}.${maxMinor + 1}`;
  }
}

/**
 * Check if a document name matches the base pattern of another
 * Used for duplicate detection
 * Base pattern: <ProjectShortcode>-<Type>-<Internal/External>
 */
export function getDocumentBasePattern(documentName: string): string | null {
  const parsed = parseDocumentName(documentName);
  if (!parsed) return null;
  
  const internalExternal = parsed.isInternal ? "INT" : "EXT";
  return `${parsed.projectShortcode}-${parsed.type}-${internalExternal}`;
}

/**
 * Check if two documents are versions of each other
 */
export function areDocumentVersions(name1: string, name2: string): boolean {
  const pattern1 = getDocumentBasePattern(name1);
  const pattern2 = getDocumentBasePattern(name2);
  
  if (!pattern1 || !pattern2) return false;
  return pattern1 === pattern2;
}

/**
 * Generate a document base pattern for duplicate checking
 * Pattern: <ProjectShortcode>-<Type>-<Internal/External>
 */
export function generateBasePattern(options: {
  projectShortcode: string;
  category: string;
  isInternal: boolean;
}): string {
  const { projectShortcode, category, isInternal } = options;
  const typeAbbrev = getTypeAbbreviation(category);
  const internalExternal = isInternal ? "INT" : "EXT";
  const shortcode = projectShortcode.toUpperCase().slice(0, 10);
  
  return `${shortcode}-${typeAbbrev}-${internalExternal}`;
}
