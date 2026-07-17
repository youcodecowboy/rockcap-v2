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
import filenameSchema from './naming/filename_schema.json';

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

// ── V1.2 file-naming-standard parser ─────────────────────────────
//
// Implements the client-confirmed standard
// (docs/classification/RockCap_FileNamingStandard_RC_INTERNAL_V1.2_20260708.md),
// driven entirely by src/lib/naming/filename_schema.json — the machine-
// readable single source of truth (grammar, DocType enum + dualDate flags,
// origin roles, statuses, version/reissue rules, alias maps).
//
//   Standard    [Scheme]_[DocType]_[Origin]_[Status]_[Version]_[FilingDate].ext
//   Dual-date   [Scheme]_[DocType]_[DocumentDate]_[Origin]_[Status]_[Version]_[FilingDate].ext
//
// This parser is SEPARATE from parseDocumentName below: parseDocumentName
// keeps its tolerant legacy contract (underscore convention + legacy hyphen
// names, null for anything else) for existing callers; parseStandardName is
// the strict V1.2 grammar with a full/partial confidence verdict, consumed
// by the classification layer (convex/knowledge/harnessClassify.ts imports
// it directly — same idiom as its placement-rules import).

type SchemaDocTypeEntry = {
  group: string;
  dualDate: boolean;
  appFileType: string | null;
  appFileTypeAlt?: string;
  note?: string;
};

const SCHEMA_DOC_TYPES = filenameSchema.docTypes as unknown as Record<
  string,
  SchemaDocTypeEntry
>;
const DOC_TYPE_ALIASES = filenameSchema.aliases.docTypes as Record<
  string,
  string
>;
const LENDER_ALIASES = filenameSchema.aliases.lenders as Record<string, string>;
const STATUS_VALUES = new Set<string>([
  ...filenameSchema.statuses.advisory,
  ...filenameSchema.statuses.draftLegal,
]);
/** Origin role prefixes (CLIENT, LENDER, VALUER, QS, …) — the '-'-suffixed
 * keys of schema.origins plus the reserved set. 'RC' is matched literally. */
const ORIGIN_ROLES = new Set<string>(
  [
    ...Object.keys(filenameSchema.origins).filter((k) => k.endsWith('-')),
    ...filenameSchema.origins._reserved,
  ].map((r) => r.replace(/-$/, '')),
);

export interface ParsedStandardName {
  /** First token — PascalCase scheme name (e.g. "LintonLane"). */
  scheme: string;
  /** Canonical DocType from the schema enum (alias-resolved, e.g.
   * LenderNote → LenderBrief). On a partial parse this may be a raw token
   * that is not in the enum. */
  docType: string;
  /** Hyphen-joined sub-part qualifier on the DocType
   * (InterimMonitoringReport-No2 → "No2"). */
  docTypeQualifier?: string;
  /** YYYYMMDD — the document's OWN date (dual-date DocTypes only): the
   * vintage printed on / effective for the document itself. */
  documentDate?: string;
  /** Who RockCap received the file from. role "RC" has no party;
   * role-prefixed origins carry the party (LENDER-Avamore → role "LENDER",
   * party "Avamore", lender aliases resolved: F365 → Funding365). */
  origin?: { role: string; party?: string };
  /** §8 status word (INTERNAL/EXTERNAL/DRAFT/FINAL/UNSIGNED/SIGNED/EXECUTED/SUPERSEDED). */
  status?: string;
  /** Canonical "V<maj>.<min>". */
  version?: string;
  /** Terms reissue ordinal (R2 → 2). */
  reissue?: number;
  /** YYYYMMDD — always the final token; when the file entered our filing. */
  filingDate: string;
  /** "full" = every token accounted for and grammar-conformant (DocType in
   * the enum, origin present, document date present iff the DocType is
   * dual-date). "partial" = the standard's shape matched (trailing filing
   * date + Scheme_DocType structure) but some field failed validation or a
   * token went unrecognised. */
  confidence: 'full' | 'partial';
}

const YMD_TOKEN_RE = /^\d{8}$/;

function isValidYmdToken(t: string): boolean {
  if (!YMD_TOKEN_RE.test(t)) return false;
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(4, 6));
  const d = Number(t.slice(6, 8));
  return y >= 1990 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/**
 * Parse a V1.2 standard-convention filename, right-to-left per schema
 * parseOrder (§9): extension → trailing filing date → optional document
 * date (dual-date DocTypes, immediately after the DocType) → version /
 * reissue / status tokens → origin → DocType → Scheme.
 *
 * Returns null when the name doesn't carry the standard's spine (underscore
 * tokens ending in a valid YYYYMMDD filing date); "partial" confidence when
 * the spine matches but a field fails validation; "full" only for a
 * completely grammar-conformant name.
 */
export function parseStandardName(fileName: string): ParsedStandardName | null {
  if (!fileName) return null;

  // 1. Extension — after the final '.'.
  const base = fileName.trim().replace(/\.[A-Za-z0-9]{1,6}$/, '');
  const tokens = base.split('_');
  if (tokens.length < 3) return null;

  // 2. Filing date — the trailing \d{8} token. Without it this is not the
  //    standard at all (spaces / legacy names land here).
  const filingDate = tokens[tokens.length - 1];
  if (!isValidYmdToken(filingDate)) return null;

  // 7./6. Scheme = first token, DocType = the token after it. Both are word
  //       tokens — a date or shaped token in either slot is not the grammar.
  const scheme = tokens[0];
  const rawDocType = tokens[1];
  if (!scheme || !rawDocType) return null;
  if (!/^[A-Za-z]/.test(scheme) || !/^[A-Za-z]/.test(rawDocType)) return null;

  let fullyConformant = true;

  // DocType: hyphen joins sub-parts within the field
  // (InterimMonitoringReport-No2); the base is alias-resolved then validated
  // against the schema enum.
  const hyphenAt = rawDocType.indexOf('-');
  const docBaseRaw = hyphenAt === -1 ? rawDocType : rawDocType.slice(0, hyphenAt);
  const docTypeQualifier =
    hyphenAt === -1 ? undefined : rawDocType.slice(hyphenAt + 1);
  const docType = DOC_TYPE_ALIASES[docBaseRaw] ?? docBaseRaw;
  const docTypeEntry: SchemaDocTypeEntry | undefined = SCHEMA_DOC_TYPES[docType];
  if (!docTypeEntry) fullyConformant = false;

  const middle = tokens.slice(2, -1);
  let idx = 0;

  // 3. Document date — a \d{8} immediately after the DocType, only
  //    meaningful for dual-date DocTypes. A date in that slot on a
  //    non-dual-date name is consumed but demotes to partial.
  let documentDate: string | undefined;
  if (idx < middle.length && isValidYmdToken(middle[idx])) {
    if (docTypeEntry?.dualDate) {
      documentDate = middle[idx];
    } else {
      fullyConformant = false;
    }
    idx++;
  }

  // 4./5. Remaining middle tokens: origin / status / version / reissue by
  //       recognised shape. Anything else (and any duplicate) → partial.
  let origin: { role: string; party?: string } | undefined;
  let status: string | undefined;
  let version: string | undefined;
  let reissue: number | undefined;
  for (; idx < middle.length; idx++) {
    const t = middle[idx];
    if (t === 'RC') {
      if (origin) fullyConformant = false;
      else origin = { role: 'RC' };
      continue;
    }
    const roleMatch = t.match(/^([A-Z]+)-(.+)$/);
    if (roleMatch && ORIGIN_ROLES.has(roleMatch[1])) {
      if (origin) {
        fullyConformant = false;
      } else {
        const role = roleMatch[1];
        const party =
          role === 'LENDER'
            ? (LENDER_ALIASES[roleMatch[2]] ?? roleMatch[2])
            : roleMatch[2];
        origin = { role, party };
      }
      continue;
    }
    if (STATUS_VALUES.has(t)) {
      if (status) fullyConformant = false;
      else status = t;
      continue;
    }
    if (/^V\d+\.\d+$/i.test(t)) {
      if (version) fullyConformant = false;
      else version = t.toUpperCase();
      continue;
    }
    if (/^R\d+$/.test(t)) {
      if (reissue !== undefined) fullyConformant = false;
      else reissue = Number(t.slice(1));
      continue;
    }
    if (isValidYmdToken(t)) {
      // A second date adrift in the middle — never valid grammar.
      fullyConformant = false;
      continue;
    }
    fullyConformant = false; // unrecognised token
  }

  // Grammar requires an origin on every file, and a document date on every
  // dual-date DocType (§5: the vintage is what the dual date exists for).
  if (!origin) fullyConformant = false;
  if (docTypeEntry?.dualDate && documentDate === undefined) {
    fullyConformant = false;
  }

  return {
    scheme,
    docType,
    ...(docTypeQualifier !== undefined ? { docTypeQualifier } : {}),
    ...(documentDate !== undefined ? { documentDate } : {}),
    ...(origin !== undefined ? { origin } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(version !== undefined ? { version } : {}),
    ...(reissue !== undefined ? { reissue } : {}),
    filingDate,
    confidence: fullyConformant ? 'full' : 'partial',
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

