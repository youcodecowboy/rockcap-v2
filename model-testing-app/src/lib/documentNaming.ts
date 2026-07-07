/**
 * Document Naming — the single canonical implementation.
 *
 * Convention (client-approved, docs/classification/dark-mills-exemplar-pack.md §5):
 *   <Project>_<DocType>_<Initials>_<AUDIENCE>_V<maj.min>_<YYYYMMDD>
 *
 * Example: DarkMills_CreditChecklist_RS_INTERNAL_V1.0_20260707
 *
 * - Underscore delimiters, FULL WORDS in compact PascalCase — no abbreviation maps.
 * - Project: projectShortcode if set, else compacted project name, else compacted
 *   client name for client-scoped docs.
 * - Initials: uploader initials; multi-initial runs joined by _ (RS_AL).
 * - AUDIENCE: INTERNAL | EXTERNAL — included only when known; omitted for neutral docs.
 * - Lender-terms variant: <Lender>Terms_<Project>_<YYYYMMDD>
 *   (e.g. HTBTerms_DarkMills_20260306) when the lender name is known.
 *
 * The parser also tolerates the legacy hyphen formats
 * (<SHORTCODE>-<TYPE>-<INT|EXT>-<II>-<Vx.y>-<YYYY-MM-DD>) still present on
 * existing rows — existing documentCodes are never regenerated (forward-only).
 */

import {
  assembleDocumentCode,
  getBuiltInTokenValues,
  resolveNamingConfig,
  toCompactPascalCase,
  type DocumentNamingConfig,
} from './namingConfig';

export { toCompactPascalCase };
export type { DocumentNamingConfig };

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
 * Format date as YYYYMMDD (the convention's date token)
 */
export function formatDateForNaming(date: string | Date = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/** Is this fileType a lender terms document (eligible for the <Lender>Terms variant)? */
function isLenderTermsType(fileType: string): boolean {
  return /\bterms?\b/i.test(fileType);
}

export interface BuildDocumentNameOptions {
  /** Classified fileType, full words (e.g. "Credit Checklist", "Lender Comparison") */
  fileType: string;
  projectName?: string;
  projectShortcode?: string;
  /** Fallback for the Project token on client-scoped docs */
  clientName?: string;
  /** Uploader initials (e.g. "RS" or "RS_AL"); token omitted when unknown */
  initials?: string;
  /** Included only when known/applicable */
  audience?: 'INTERNAL' | 'EXTERNAL';
  /** Defaults to V1.0 */
  version?: string;
  /** Defaults to now */
  date?: string | Date;
  /** When set and fileType is a terms doc → <Lender>Terms_<Project>_<YYYYMMDD> */
  lenderName?: string;
  /** Per-client/project pattern override (metadata.documentNaming) */
  namingConfig?: DocumentNamingConfig;
  customFieldValues?: Record<string, string>;
}

/**
 * Build a document name following the canonical convention.
 * Format: <Project>_<DocType>_<Initials>_<AUDIENCE>_V<maj.min>_<YYYYMMDD>
 * e.g. DarkMills_LenderComparison_RS_AL_EXTERNAL_V1.2_20260210
 */
export function buildDocumentName(options: BuildDocumentNameOptions): string {
  // Lender-terms variant: <Lender>Terms_<Project>_<YYYYMMDD>
  if (options.lenderName && isLenderTermsType(options.fileType)) {
    const lender = toCompactPascalCase(options.lenderName);
    const project =
      (options.projectShortcode && toCompactPascalCase(options.projectShortcode)) ||
      (options.projectName && toCompactPascalCase(options.projectName)) ||
      (options.clientName && toCompactPascalCase(options.clientName)) ||
      'Project';
    return `${lender}Terms_${project}_${formatDateForNaming(options.date)}`;
  }

  const config = options.namingConfig && options.namingConfig.pattern.length > 0
    ? options.namingConfig
    : resolveNamingConfig(); // default PROJECT/TYPE/INITIALS/AUDIENCE/VERSION/DATE

  const builtIn = getBuiltInTokenValues({
    clientName: options.clientName,
    projectName: options.projectName,
    projectShortcode: options.projectShortcode,
    fileType: options.fileType,
    initials: options.initials,
    audience: options.audience,
    version: options.version,
    date: options.date,
  });

  const allValues = { ...builtIn, ...(options.customFieldValues || {}) };
  return assembleDocumentCode(config, allValues);
}

/**
 * Build an internal (RockCap) document name.
 * Format: RockCap_<Topic>_<YYYYMMDD> — e.g. RockCap_LendingPolicy_20260707
 * Replaces the legacy ROCK-INT-<TOPIC>-<DDMMYY> convention (forward-only:
 * existing codes are never regenerated).
 */
export function buildInternalDocumentName(topic: string, date?: string | Date): string {
  const topicToken = toCompactPascalCase(topic) || 'Document';
  return `RockCap_${topicToken}_${formatDateForNaming(date)}`;
}

export interface ParsedDocumentName {
  /** Which convention the name matched */
  format: 'underscore' | 'legacy-hyphen';
  /** Project token (new format) or project shortcode (legacy) */
  project: string;
  /** DocType token (new format) or type abbreviation (legacy) */
  type: string;
  initials?: string;
  audience?: 'INTERNAL' | 'EXTERNAL';
  isInternal?: boolean;
  version?: string;
  /** YYYYMMDD (new format) or YYYY-MM-DD (legacy) */
  date?: string;
}

/**
 * Parse a document name. Tolerant of BOTH the new underscore convention and
 * the legacy hyphen convention (existing rows keep their legacy codes).
 * Per the exemplar pack, underscore tokens are recognised by SHAPE
 * (V?\d[._]\d version, \d{8} date, ALL-CAPS audience), not by position.
 * Returns null when the name matches neither convention.
 */
export function parseDocumentName(documentName: string): ParsedDocumentName | null {
  if (!documentName) return null;

  const underscore = parseUnderscoreName(documentName);
  if (underscore) return underscore;

  return parseLegacyHyphenName(documentName);
}

function parseUnderscoreName(name: string): ParsedDocumentName | null {
  const tokens = name.split('_').filter(Boolean);
  if (tokens.length < 3) return null;

  let project = '';
  let type = '';
  let audience: 'INTERNAL' | 'EXTERNAL' | undefined;
  let version: string | undefined;
  let date: string | undefined;
  const initialsRun: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Date token: YYYYMMDD
    if (/^\d{8}$/.test(token)) {
      date = token;
      continue;
    }
    // Audience token
    if (token === 'INTERNAL' || token === 'EXTERNAL') {
      audience = token;
      continue;
    }
    // Version token: V1.0 (dot style is canonical)
    if (/^V\d+\.\d+$/i.test(token)) {
      version = token.toUpperCase();
      continue;
    }
    // Version drift: "V1_1" arrives split as "V1" + "1"
    if (/^V\d+$/i.test(token) && i + 1 < tokens.length && /^\d+$/.test(tokens[i + 1])) {
      version = `${token.toUpperCase()}.${tokens[i + 1]}`;
      i++;
      continue;
    }
    // Positional tokens: first = Project, second = DocType
    if (!project) {
      project = token;
      continue;
    }
    if (!type) {
      type = token;
      continue;
    }
    // Short ALL-CAPS runs after the type are initials (RS, AL, JP…)
    if (/^[A-Z]{1,4}$/.test(token)) {
      initialsRun.push(token);
      continue;
    }
    // Anything else (scenario qualifiers etc.) — tolerated, not captured
  }

  // Require at least project + type and one shaped token to avoid false positives
  if (!project || !type || (!date && !version && !audience)) return null;

  return {
    format: 'underscore',
    project,
    type,
    initials: initialsRun.length > 0 ? initialsRun.join('_') : undefined,
    audience,
    isInternal: audience ? audience === 'INTERNAL' : undefined,
    version,
    date,
  };
}

/** Legacy: SHORTCODE-TYPE-INT/EXT-INITIALS-VERSION-YYYY-MM-DD */
function parseLegacyHyphenName(name: string): ParsedDocumentName | null {
  const parts = name.split('-');
  if (parts.length < 6) return null;

  // The date is the last 3 parts (YYYY-MM-DD)
  const dateParts = parts.slice(-3);
  const date = dateParts.join('-');

  // Version is before the date
  const version = parts[parts.length - 4];
  if (!version?.startsWith('V')) return null;

  // Initials are before version
  const initials = parts[parts.length - 5];

  // INT/EXT is before initials
  const internalExternal = parts[parts.length - 6];
  if (internalExternal !== 'INT' && internalExternal !== 'EXT') return null;

  const project = parts[0];
  // Type is everything between shortcode and INT/EXT
  const typeEndIndex = parts.length - 6;
  const type = parts.slice(1, typeEndIndex).join('-');

  return {
    format: 'legacy-hyphen',
    project,
    type,
    initials,
    audience: internalExternal === 'INT' ? 'INTERNAL' : 'EXTERNAL',
    isInternal: internalExternal === 'INT',
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
 * Used for duplicate detection.
 * Base pattern: <Project>_<DocType>[_<AUDIENCE>] (works for both conventions
 * via the tolerant parser).
 */
export function getDocumentBasePattern(documentName: string): string | null {
  const parsed = parseDocumentName(documentName);
  if (!parsed) return null;

  const base = `${parsed.project}_${parsed.type}`;
  return parsed.audience ? `${base}_${parsed.audience}` : base;
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

