/**
 * Normalization and dedup helpers for HubSpot sync.
 * Pure functions only — no I/O, no side effects.
 */

const LEGAL_SUFFIX_RE =
  /\b(ltd|limited|llc|l\.l\.c\.|inc|incorporated|corp|corporation|plc|gmbh|srl|pty|s\.a\.|sa|ag|co|company|holdings?|group|services|international|intl|partners?|associates?)\b/gi;

/**
 * Lowercase + strip legal suffixes + collapse punctuation/whitespace.
 * Makes "Funding 365 Ltd" match "Funding 365 Limited" match "funding 365".
 * Idempotent.
 */
export function normalizeCompanyName(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(LEGAL_SUFFIX_RE, '')
    .replace(/[.,&'"/\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dedupe HubSpot association results by ID while preserving first-occurrence order.
 * HubSpot returns both HUBSPOT_DEFINED and USER_DEFINED associations for the same
 * company-contact pair, causing duplicates like [{id:"123"}, {id:"123"}].
 */
export function dedupeAssociationIds(
  results: { id: string }[] | undefined | null,
): string[] {
  if (!results) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of results) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r.id);
    }
  }
  return out;
}

/**
 * Extract the root domain from a URL, email, or bare-domain string.
 * Returns null if input is empty or can't be parsed.
 */
export function extractRootDomain(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  try {
    if (s.includes('://')) {
      return new URL(s).hostname.replace(/^www\./, '').toLowerCase();
    }
    if (s.includes('@')) {
      const after = s.split('@')[1];
      return after ? after.toLowerCase() : null;
    }
    if (s.includes(' ') || !s.includes('.')) return null;
    return s.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}
