/**
 * Naming config resolver — handles inheritance, migration, and token assembly.
 * Reads from project/client metadata.documentNaming.
 *
 * Default convention (client-approved, see docs/classification/dark-mills-exemplar-pack.md §5):
 *   <Project>_<DocType>_<Initials>_<AUDIENCE>_V<maj.min>_<YYYYMMDD>
 *   e.g. DarkMills_CreditChecklist_RS_INTERNAL_V1.0_20260707
 *
 * Tokens are full words in compact PascalCase — no abbreviation maps.
 * Per-client/project overrides (pattern, separator, custom tokens) keep working.
 */

export interface CustomToken {
  id: string;
  label: string;
  type: "text";
  required: boolean;
}

export interface DocumentNamingConfig {
  code: string;
  pattern: string[];
  separator: string;
  customTokens: CustomToken[];
  inheritFromClient?: boolean;
}

// CLIENT is kept as a built-in for legacy per-client patterns that use it.
const BUILT_IN_TOKENS = ["PROJECT", "TYPE", "INITIALS", "AUDIENCE", "VERSION", "DATE", "CLIENT"] as const;
const DEFAULT_PATTERN: string[] = ["PROJECT", "TYPE", "INITIALS", "AUDIENCE", "VERSION", "DATE"];
const DEFAULT_SEPARATOR = "_";
const RESERVED_TOKEN_IDS = new Set(BUILT_IN_TOKENS.map((t) => t.toLowerCase()));
const MAX_CUSTOM_TOKENS = 8;

/**
 * Compact a name into PascalCase full words: "dark mills" → "DarkMills",
 * "Credit Checklist" → "CreditChecklist", "KYC Pack" → "KYCPack".
 * Preserves existing capitalization inside words (all-caps stays all-caps).
 */
export function toCompactPascalCase(text: string): string {
  if (!text) return "";
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/**
 * Resolve the active naming config for a document context.
 * Project overrides client if it has its own config.
 * Handles migration from old string-format pattern.
 */
export function resolveNamingConfig(
  projectMetadata?: any,
  clientMetadata?: any
): DocumentNamingConfig {
  const projectNaming = projectMetadata?.documentNaming;
  if (projectNaming && !projectNaming.inheritFromClient) {
    return normalizeConfig(projectNaming);
  }

  const clientNaming = clientMetadata?.documentNaming;
  if (clientNaming) {
    return normalizeConfig(clientNaming);
  }

  return {
    code: "",
    pattern: DEFAULT_PATTERN,
    separator: DEFAULT_SEPARATOR,
    customTokens: [],
  };
}

/**
 * Normalize a raw config from metadata — handles migration from string to array format.
 */
function normalizeConfig(raw: any): DocumentNamingConfig {
  let pattern: string[];

  if (Array.isArray(raw.pattern)) {
    pattern = raw.pattern;
  } else if (typeof raw.pattern === "string") {
    const sep = raw.separator || DEFAULT_SEPARATOR;
    pattern = raw.pattern
      .split(sep)
      .map((t: string) => t.replace(/[{}]/g, "").toUpperCase().trim())
      .filter(Boolean);
  } else {
    pattern = DEFAULT_PATTERN;
  }

  return {
    code: raw.code || "",
    pattern,
    separator: raw.separator || DEFAULT_SEPARATOR,
    customTokens: raw.customTokens || [],
    inheritFromClient: raw.inheritFromClient,
  };
}

/**
 * Sanitize a single token value for use in a document code.
 * Preserves case (PascalCase words, V1.0 dots, RS_AL initials runs);
 * compacts whitespace-separated words PascalCase-style and strips
 * anything outside [A-Za-z0-9._-].
 */
function sanitizeTokenValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const words = trimmed.split(/\s+/);
  const joined =
    words.length > 1
      ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("")
      : words[0];
  return joined.replace(/[^A-Za-z0-9._-]/g, "");
}

/**
 * Assemble a document code from a naming config and token values.
 * Tokens with no value (e.g. unknown AUDIENCE) are omitted entirely.
 */
export function assembleDocumentCode(
  config: DocumentNamingConfig,
  tokenValues: Record<string, string>
): string {
  const parts: string[] = [];

  for (const token of config.pattern) {
    const key = token.toLowerCase();
    const value = tokenValues[key];
    if (value) {
      const sanitized = sanitizeTokenValue(value);
      if (sanitized) parts.push(sanitized);
    }
  }

  return parts.join(config.separator);
}

/**
 * Get built-in token values for a document context.
 *
 * - project: projectShortcode if set, else compacted project name,
 *   else compacted client name (client-scoped docs).
 * - type: the classified fileType in compact PascalCase, full words.
 * - initials: uploader initials (omitted when unknown).
 * - audience: INTERNAL | EXTERNAL, only when known.
 * - version: V<maj.min>, defaults to V1.0.
 * - date: YYYYMMDD.
 */
export function getBuiltInTokenValues(options: {
  clientName?: string;
  projectName?: string;
  projectShortcode?: string;
  fileType?: string;
  initials?: string;
  audience?: "INTERNAL" | "EXTERNAL";
  version?: string;
  date?: string | Date;
}): Record<string, string> {
  const values: Record<string, string> = {};

  const project =
    (options.projectShortcode && toCompactPascalCase(options.projectShortcode)) ||
    (options.projectName && toCompactPascalCase(options.projectName)) ||
    (options.clientName && toCompactPascalCase(options.clientName)) ||
    "";
  if (project) values.project = project;

  if (options.clientName) values.client = toCompactPascalCase(options.clientName);
  if (options.fileType) values.type = toCompactPascalCase(options.fileType);
  if (options.initials) values.initials = options.initials.toUpperCase().replace(/[^A-Z0-9_]/g, "");
  if (options.audience) values.audience = options.audience;

  values.version = options.version || "V1.0";

  const d = options.date ? new Date(options.date) : new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  values.date = `${yyyy}${mm}${dd}`;

  return values;
}

/**
 * Validate a custom token ID against reserved names.
 */
export function validateTokenId(id: string): string {
  const normalized = id.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (RESERVED_TOKEN_IDS.has(normalized)) {
    return `${normalized}_custom`;
  }
  return normalized;
}

/**
 * Generate a token ID from a label.
 */
export function labelToTokenId(label: string): string {
  const raw = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return validateTokenId(raw);
}

export { BUILT_IN_TOKENS, DEFAULT_PATTERN, DEFAULT_SEPARATOR, MAX_CUSTOM_TOKENS };
