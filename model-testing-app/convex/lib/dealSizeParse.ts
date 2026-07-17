// Pure parser for the prospect `dealSizeRange` AI estimate (no Convex imports,
// so it is unit-testable under vitest — same pattern as cadenceGating.ts).
//
// prospect-intel writes dealSizeRange as a human string, almost always led by a
// £ range, e.g.:
//   "£2-8m per scheme (Medium confidence) — schemes span ... ~60-65% LTGDV"
//   "c.£8.8m senior + £1.35m mezz development facility (high confidence ...)"
//   "£30-120m development facility per scheme (Medium confidence) — ..."
// The leading figure IS the deal/facility (loan) estimate — the intel already
// converts GDV → loan via LTGDV — so we parse the FIRST monetary range and treat
// its midpoint as that prospect's estimated deal size. Non-deals ("Unclassifiable
// from public data ...") carry no £ figure and return null (correctly excluded).

export type DealSizeConfidence = "high" | "med" | "low-med" | "low" | "unknown";

export interface ParsedDealSize {
  lowGBP: number;
  highGBP: number;
  midGBP: number;
  confidence: DealSizeConfidence;
}

const UNIT_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  bn: 1_000_000_000,
};

// First "£X[-Y]m/bn/k" (or "GBP X-Y m") figure in the string. Hyphen, en/em dash,
// or "to" all separate a range; a single figure (no separator) is also matched.
const RANGE_RE =
  /(?:£\s*|gbp\s*)(\d+(?:\.\d+)?)(?:\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?))?\s*(k|m|bn)\b/i;

function detectConfidence(lower: string): DealSizeConfidence {
  if (lower.includes("high confidence")) return "high";
  if (lower.includes("low-medium") || lower.includes("low-to-medium")) {
    return "low-med";
  }
  if (lower.includes("medium") || lower.includes("med confidence")) return "med";
  if (lower.includes("low confidence") || lower.includes("low-confidence")) {
    return "low";
  }
  return "unknown";
}

export function parseDealSizeRange(
  range: string | undefined | null,
): ParsedDealSize | null {
  if (!range) return null;
  const lower = range.toLowerCase();
  const m = RANGE_RE.exec(lower);
  if (!m) return null;
  const mult = UNIT_MULTIPLIER[m[3].toLowerCase()];
  if (!mult) return null;
  const lowGBP = parseFloat(m[1]) * mult;
  const highGBP = m[2] ? parseFloat(m[2]) * mult : lowGBP;
  // Guard against a parse that yields a degenerate value.
  if (!Number.isFinite(lowGBP) || lowGBP <= 0) return null;
  const midGBP = (lowGBP + highGBP) / 2;
  return { lowGBP, highGBP, midGBP, confidence: detectConfidence(lower) };
}

// Resolve a single estimated deal size (GBP) for a prospect: the operator-entered
// dealValueGBP is authoritative when present; otherwise fall back to the midpoint
// of the AI dealSizeRange. Returns null when neither is available.
export function resolveProspectDealSizeGBP(prospect: {
  dealValueGBP?: number | null;
  dealSizeRange?: string | null;
}): number | null {
  if (typeof prospect.dealValueGBP === "number" && prospect.dealValueGBP > 0) {
    return prospect.dealValueGBP;
  }
  return parseDealSizeRange(prospect.dealSizeRange)?.midGBP ?? null;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
