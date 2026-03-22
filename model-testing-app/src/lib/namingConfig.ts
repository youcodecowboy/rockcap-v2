/**
 * Naming config resolver — handles inheritance, migration, and token assembly.
 * Reads from project/client metadata.documentNaming.
 */
import { abbreviateCategory } from './documentCodeUtils';

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

const BUILT_IN_TOKENS = ["CLIENT", "TYPE", "PROJECT", "DATE"] as const;
const DEFAULT_PATTERN: string[] = ["CLIENT", "TYPE", "PROJECT", "DATE"];
const DEFAULT_SEPARATOR = "-";
const RESERVED_TOKEN_IDS = new Set(BUILT_IN_TOKENS.map((t) => t.toLowerCase()));
const MAX_CUSTOM_TOKENS = 8;

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
 * Assemble a document code from a naming config and token values.
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
      parts.push(value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
    }
  }

  return parts.join(config.separator);
}

/**
 * Get built-in token values from document metadata.
 */
export function getBuiltInTokenValues(
  clientCode: string,
  category: string,
  projectCode?: string,
  date?: string | Date
): Record<string, string> {
  const values: Record<string, string> = {};

  if (clientCode) values.client = clientCode;
  if (category) values.type = abbreviateCategory(category);
  if (projectCode) values.project = projectCode;

  const d = date ? new Date(date) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  values.date = `${dd}${mm}${yy}`;

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
