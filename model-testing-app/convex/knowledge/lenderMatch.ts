// Rostered-lender name matcher — companion funds_project edge emission.
//
// PROBLEM (live eval, 2026-07): lender indicative-terms atoms anchor at the
// PROJECT with the lender named only in free text (qualifier "UTB indicative",
// statement "United Trust Bank's 2026-03-09 indicative Dark Mills facility…"),
// so no graph EDGE exists between the lender client and the project —
// graph.sharedNeighbors returns 0 for Kinspire × UTB even after group
// expansion. This module is the CONSERVATIVE matcher that decides whether a
// financing attribute atom's text names exactly one rostered lender client
// (clients row with type="lender"), so the atoms engine can emit / corroborate
// a lender —funds_project→ project companion edge.
//
// ── Matching rules (conservative by design; never guess) ──
// 1. FULL-NAME containment: the lender client's name — minus trailing
//    corporate suffixes (Ltd/Limited/PLC/LLP/LP/Inc) — appears in the text as
//    a whole-word, case-insensitive substring. "United Trust Bank's facility"
//    matches client "United Trust Bank"; "Paragons" does NOT match "Paragon
//    Bank".
// 2. INITIALS ACRONYM: the initials of the suffix-stripped name (>= 3 letters,
//    e.g. "UTB" → "United Trust Bank", "QDF" → "Quantum Development Finance
//    Ltd") appear as a standalone CASE-SENSITIVE uppercase token. Two-letter
//    initials ("Triple Point" → "TP") never acronym-match — full name only.
// 3. AMBIGUITY: two or more distinct lenders matching (e.g. "QDF Funding 2
//    Ltd …" full-name-matches QDF Funding 2 Ltd AND acronym-matches Quantum
//    Development Finance) means the caller SKIPS and logs. Never guess.
//
// Pure module (no Convex imports beyond the vocabulary) so the matcher is
// unit-testable and shared verbatim by the write-path hook
// (atomsCore.emitLenderCompanionEdges) and the backfill
// (knowledge/lenderEdges.backfillLenderEdges).

import { PREDICATES } from "./vocabulary";

export interface RosteredLender {
  /** Stringified clients._id. */
  clientId: string;
  name: string;
}

export interface LenderMatch extends RosteredLender {
  via: "name" | "acronym";
}

/** Financing ATTRIBUTE predicates (atom-storable) — the source atoms whose
 * text may name a lender: has_loan_amount, has_interest_rate, matures_on,
 * has_total_development_cost today; derived from the vocabulary so future
 * financing attributes (e.g. an arrangement-fee predicate) gate in
 * automatically. Edge predicates are excluded — they already carry the
 * relation. */
export const LENDER_EDGE_SOURCE_PREDICATES: ReadonlySet<string> = new Set(
  Object.entries(PREDICATES)
    .filter(
      ([, def]) =>
        def.kind === "attribute" &&
        def.family === "financing" &&
        (def.store ?? "atom") !== "native",
    )
    .map(([name]) => name),
);

/** Gate for companion-edge emission: PROJECT-anchored financing attribute
 * atoms only. subjectType=client atoms (borrower-side facts) never fire. */
export function isLenderEdgeSource(
  subjectType: string,
  predicate: string,
): boolean {
  return subjectType === "project" && LENDER_EDGE_SOURCE_PREDICATES.has(predicate);
}

const CORPORATE_SUFFIXES = new Set([
  "ltd",
  "limited",
  "plc",
  "llp",
  "lp",
  "inc",
]);

const MIN_ACRONYM_LENGTH = 3;
const MIN_NAME_LENGTH = 4;

/** Lender name minus trailing corporate suffix words ("Quantum Development
 * Finance Ltd" → "Quantum Development Finance"). Never strips down to
 * nothing — at least one word survives. */
export function coreLenderName(name: string): string {
  const words = name.trim().split(/\s+/);
  while (
    words.length > 1 &&
    CORPORATE_SUFFIXES.has(words[words.length - 1].toLowerCase().replace(/[.,]+$/, ""))
  ) {
    words.pop();
  }
  return words.join(" ");
}

/** Initials acronym of the suffix-stripped name, or null when it would be
 * shorter than MIN_ACRONYM_LENGTH ("Triple Point" → null). Only words that
 * start with a letter contribute ("QDF Funding 2 Ltd" → 2 letter-words →
 * null, so the bare token "QDF" can only mean Quantum Development Finance). */
export function lenderAcronym(name: string): string | null {
  const words = coreLenderName(name)
    .split(/[\s\-&/]+/)
    .filter((w) => /^[A-Za-z]/.test(w));
  if (words.length < MIN_ACRONYM_LENGTH) return null;
  return words.map((w) => w[0].toUpperCase()).join("");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word boundary: the hit may not touch an adjacent letter or digit on
 * either side (possessives — "UTB's" — still match; "SUTB" does not). */
function boundary(pattern: string, flags: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${pattern}(?![A-Za-z0-9])`, flags);
}

/** All rostered lenders the text names, deduped by clientId (full-name match
 * reported in preference to acronym). Callers act ONLY on exactly one match:
 * zero → nothing to emit; two-plus → ambiguous, skip and log. */
export function matchRosteredLenders(
  text: string,
  lenders: RosteredLender[],
): LenderMatch[] {
  const matches: LenderMatch[] = [];
  for (const lender of lenders) {
    const core = coreLenderName(lender.name);
    if (
      core.length >= MIN_NAME_LENGTH &&
      boundary(escapeRegExp(core).replace(/\s+/g, "\\s+"), "i").test(text)
    ) {
      matches.push({ ...lender, via: "name" });
      continue;
    }
    const acronym = lenderAcronym(lender.name);
    if (acronym && boundary(escapeRegExp(acronym), "").test(text)) {
      matches.push({ ...lender, via: "acronym" });
    }
  }
  return matches;
}
