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
// 1. FULL-NAME containment: the lender client's name (or its companyName
//    alias) — minus trailing corporate suffixes (Ltd/Limited/PLC/LLP/LP/Inc)
//    — appears in the text as a whole-word, case-insensitive substring.
//    "United Trust Bank's facility" matches client "United Trust Bank";
//    "Paragons" does NOT match "Paragon Bank".
// 2. INITIALS ACRONYM: the initials of the suffix-stripped name (>= 3 letters,
//    e.g. "UTB" → "United Trust Bank", "QDF" → "Quantum Development Finance
//    Ltd") appear as a standalone CASE-SENSITIVE uppercase token. Two-letter
//    initials ("Triple Point" → "TP") never acronym-match — full name only.
// 3. BRAND STEM (post-wave, 2026-07): the client name minus corporate
//    suffixes AND generic finance words (Bank/Finance/Capital/Property/
//    Development/Bridging/Lending/Group/…) appears as a whole word —
//    "Allica Bridging Finance" in text matches roster "Allica Bank" (stem
//    "Allica"); bare "Pivot" matches "Pivot Finance". Only stems >= 5 chars
//    or multi-word stems fire, so short/generic stems ("West") never do.
// 4. AMBIGUITY: two or more DISTINCT lender clients matching (e.g. "QDF
//    Funding 2 Ltd …" full-name-matches QDF Funding 2 Ltd AND
//    acronym-matches Quantum Development Finance) means the caller SKIPS and
//    logs. Never guess. One client matching via several routes (name AND
//    companyName, name AND acronym) is a SINGLE match — the 2026-07 live
//    wave skipped every "Funding 365" / "Downing" mention because a
//    self-duplicate was miscounted as ambiguity.
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
  /** Optional registered-company alias (clients.companyName) — matched with
   * the same full-name rule as `name`. */
  companyName?: string;
  /** Additional known names (clients.aliases) — brand/registered/historical
   * variants and the names of any rows merged in via lender.merge. Each is
   * matched with the same name/acronym/stem rules as `name`. */
  aliases?: string[];
}

export interface LenderMatch extends RosteredLender {
  via: "name" | "acronym" | "stem";
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
/** Single-word brand stems shorter than this never fire ("West" at 4 must
 * not; "Pivot" at 5 and "Downing" at 7 do). Multi-word stems always may. */
const MIN_STEM_LENGTH = 5;

/** Generic finance words stripped (alongside corporate suffixes) to derive a
 * lender's brand stem — "Allica Bank" → "Allica", "Pivot Finance" →
 * "Pivot". Conservative: only unmistakably generic sector words belong
 * here; a word in this list can never be the distinctive part of a brand. */
const GENERIC_FINANCE_WORDS = new Set([
  "bank",
  "finance",
  "financial",
  "capital",
  "property",
  "development",
  "bridging",
  "lending",
  "group",
]);

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

/** Canonical dedup key for a lender name — for CONSERVATIVE EQUALITY only (no
 * fuzzy / substring). Lowercase, strip punctuation, collapse whitespace, and
 * drop trailing corporate-suffix words. "Downing LLP" and "Downing" both key
 * to "downing"; "Paragon Bank" and "Paragon" do NOT collapse (only legal
 * suffixes are stripped, not sector words) — that distinction is deliberately
 * left to the operator via lender.merge. Used by lender.create's upsert to
 * recognise a lender arriving under a punctuation/suffix variant. */
export function normalizeLenderName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // strip punctuation to spaces
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  while (
    words.length > 1 &&
    CORPORATE_SUFFIXES.has(words[words.length - 1])
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

/** Brand stem of a lender name: corporate suffixes and generic finance
 * words removed wherever they occur ("Allica Bank" → "Allica", "Pivot
 * Finance" → "Pivot", "Quantum Development Finance Ltd" → "Quantum").
 * Returns null when nothing distinctive survives, when the stem equals the
 * suffix-stripped core name (the full-name rule already covers it), or when
 * a single-word stem is shorter than MIN_STEM_LENGTH — short/generic stems
 * ("West") must never fire. */
export function lenderBrandStem(name: string): string | null {
  const core = coreLenderName(name);
  const words = core
    .split(/\s+/)
    .filter((w) => {
      const bare = w.toLowerCase().replace(/[.,]+$/, "");
      return !CORPORATE_SUFFIXES.has(bare) && !GENERIC_FINANCE_WORDS.has(bare);
    });
  if (words.length === 0) return null;
  const stem = words.join(" ");
  if (stem === core) return null; // nothing stripped — full-name rule covers it
  if (words.length === 1 && stem.length < MIN_STEM_LENGTH) return null;
  return stem;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word boundary: the hit may not touch an adjacent letter or digit on
 * either side (possessives — "UTB's" — still match; "SUTB" does not). */
function boundary(pattern: string, flags: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${pattern}(?![A-Za-z0-9])`, flags);
}

/** Case-insensitive whole-word containment of a (possibly multi-word)
 * name fragment. */
function containsName(text: string, fragment: string): boolean {
  return boundary(escapeRegExp(fragment).replace(/\s+/g, "\\s+"), "i").test(
    text,
  );
}

/** Case-sensitive proper-noun containment: every word must appear as written,
 * ALL-CAPS, or Title-Case. Brand stems can be ordinary English words
 * ("Quantum", "Pivot"), so a lowercase prose hit ("the quantum of the claim")
 * must never count as a lender mention. */
function containsProperName(text: string, fragment: string): boolean {
  const pattern = fragment
    .split(/\s+/)
    .map((word) => {
      const rest = word.slice(1);
      const variants = new Set([
        escapeRegExp(word),
        escapeRegExp(word.toUpperCase()),
        escapeRegExp(word[0].toUpperCase() + rest.toLowerCase()),
      ]);
      return `(?:${[...variants].join("|")})`;
    })
    .join("\\s+");
  return boundary(pattern, "").test(text);
}

/** Best matching route for ONE lender client, or null. Route preference:
 * full name (name or companyName alias) > acronym > brand stem. */
function matchOneLender(
  text: string,
  lender: RosteredLender,
): LenderMatch["via"] | null {
  const aliases = [lender.name, lender.companyName, ...(lender.aliases ?? [])].filter(
    (a): a is string => !!a && a.trim() !== "",
  );
  for (const alias of aliases) {
    const core = coreLenderName(alias);
    if (core.length >= MIN_NAME_LENGTH && containsName(text, core)) {
      return "name";
    }
  }
  for (const alias of aliases) {
    const acronym = lenderAcronym(alias);
    if (acronym && boundary(escapeRegExp(acronym), "").test(text)) {
      return "acronym";
    }
  }
  for (const alias of aliases) {
    const stem = lenderBrandStem(alias);
    if (stem && containsProperName(text, stem)) {
      return "stem";
    }
  }
  return null;
}

/** All DISTINCT rostered lender clients the text names, deduped by clientId
 * (full-name match reported in preference to acronym, acronym to brand
 * stem). Callers act ONLY on exactly one match: zero → nothing to emit;
 * two-plus → ambiguous, skip and log.
 *
 * Dedup is by clientId BEFORE the caller's ambiguity check — 2026-07 live
 * wave: one client row matching via two routes (name + companyName) was
 * counted as two hits, so "Funding 365" self-ambiguated and every Downing
 * mention was skipped. Ambiguity means 2+ DISTINCT lender clients. */
export function matchRosteredLenders(
  text: string,
  lenders: RosteredLender[],
): LenderMatch[] {
  const VIA_RANK: Record<LenderMatch["via"], number> = {
    name: 0,
    acronym: 1,
    stem: 2,
  };
  const byClient = new Map<string, LenderMatch>();
  for (const lender of lenders) {
    const via = matchOneLender(text, lender);
    if (!via) continue;
    const prev = byClient.get(lender.clientId);
    if (!prev || VIA_RANK[via] < VIA_RANK[prev.via]) {
      byClient.set(lender.clientId, { ...lender, via });
    }
  }
  return [...byClient.values()];
}
