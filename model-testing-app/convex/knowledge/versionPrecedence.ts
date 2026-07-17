import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

// VERSION PRECEDENCE — same-series conflict auto-resolution.
//
// RULE: when two conflicting observations of the same atom come from
// different VERSIONS OF THE SAME DOCUMENT SERIES, the later version's
// observation wins automatically; the earlier one is archived as
// superseded (reason "version_precedence" — kept for audit, never
// deleted) instead of leaving the atom contested. CROSS-SOURCE conflicts
// (different series / different source types, e.g. client appraisal vs
// lender terms) REMAIN contested for human adjudication — this module
// never touches those.
//
// SERIES IDENTITY: two documents belong to the same series when they share
// projectId (or clientId when both are project-unlinked), the same
// fileTypeDetected, and the same normalized filename stem — the filename
// with version tokens (V1.2 / V1_2 / bare 3.0), date tokens (YYYYMMDD,
// DD-MM-YYYY, DD.MM.YYYY, ddmmyy, MonthYYYY), audience tokens
// (INTERNAL/EXTERNAL), initials runs (RS_AL_JP), download artifacts
// (" (1)", " - 2", ".pdf.pdf", %20/_20 URL-mangling) and the extension
// stripped.
//
// ORDERING within a series (docs/classification/dark-mills-exemplar-pack.md
// §5): date token first — version numbers are NOT reliable across filename
// variants (two name-forms of one series can carry the same V-token at
// different dates; exemplar trap §4.6). Version token is only a tie-break
// when the date is equal or missing on either side; when both are missing
// the document's _creationTime decides. A full tie is unorderable and the
// conflict stays contested.
//
// V1.2 NAMING-STANDARD REFINEMENT (docs/classification/
// RockCap_FileNamingStandard_RC_INTERNAL_V1.2_20260708.md §5/§9): dual-date
// names carry TWO \d{8} tokens — a DOCUMENT date immediately after the
// DocType (the vintage printed on the document) and the trailing FILING
// date (recency). Ordering prefers the DOCUMENT date: a 2024 planning
// permission can be RECEIVED after a 2026 one, and filing-date ordering
// would make the older look newer. The filing date remains a tie-break
// between equal vintages, and R\d+ reissue tokens (Terms R1/R2/R3…) order
// same-date reissues (R2 > R1 > unnumbered first issue). Both shapes are
// detected purely by token position in the underscore grammar — see
// extractStandardTokens below.
//
// The token-shape rules (V?\d[._]\d version, \d{8} date, ALL-CAPS audience,
// 1–4-cap initials runs) are adapted from parseDocumentName in
// src/lib/documentNaming.ts. They are re-implemented here rather than
// imported because that parser deliberately returns null for
// non-convention names (client space-named files, legacy hyphen-date
// names, download artifacts) — which are exactly the series members this
// rule must still recognise (exemplar pack §4/§5 traps).

// ── Pure filename-series helpers ──

export type SeriesKey = {
  /** Normalized stem: lowercase remaining tokens joined by single spaces.
   * Empty stem ⇒ the name was all shaped tokens; never treated as a series. */
  stem: string;
  /** Canonical YYYYMMDD (month-only dates canonicalise to day 01). For a
   * V1.2 dual-date name this is the DOCUMENT date — the ordering key. */
  dateToken?: string;
  /** Canonical YYYYMMDD trailing FILING date — set only when the name is a
   * V1.2 dual-date shape (dateToken then holds the document date); kept as
   * the recency tie-break between equal vintages. */
  filingDateToken?: string;
  /** Canonical "V<maj>.<min>". */
  versionToken?: string;
  /** Reissue ordinal from a standalone R\d+ token in the V1.2 underscore
   * grammar (Terms R2 → 2). Ordering tie-break after dates. */
  reissueToken?: number;
};

const EXTENSION_RE =
  /\.(pdf|docx?|xlsx?|xlsm|xls|pptx?|ppt|png|jpe?g|gif|bmp|tiff?|csv|tsv|txt|rtf|msg|eml|zip|heic|webp|dwg)$/i;

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function validYmd(y: number, m: number, d: number): boolean {
  return y >= 1990 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

function ymd(y: number, m: number, d: number): string {
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

/** Strip download/transport artifacts before token parsing (exemplar §4.7/4.8):
 * URL-encoding (%20 and its Drive-mangled "_20" form), doubled extensions
 * (".pdf.pdf"), browser duplicate suffixes (" (1)"), copy suffixes (" - 2"). */
function normalizeRawName(fileName: string): string {
  let s = fileName.trim();
  if (/%[0-9A-Fa-f]{2}/.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {
      // malformed encoding — keep the raw name
    }
  }
  // Drive-mangled "%20" → "_20": "_20" followed by a letter is a mangled
  // space, never a real token ("4868_20Dark_20Mills_…").
  s = s.replace(/_20(?=[A-Za-z])/g, " ");
  // Doubled / trailing extensions: strip repeatedly (".pdf.pdf").
  while (EXTENSION_RE.test(s)) s = s.replace(EXTENSION_RE, "");
  // Browser duplicate-download suffix " (1)" and copy suffix " - 2".
  s = s.replace(/\s*\(\d{1,2}\)\s*$/, "");
  s = s.replace(/\s-\s\d{1,2}$/, "");
  return s;
}

type TokenMatch = { index: number; length: number; canonical: string };

function lastValidMatch(
  s: string,
  re: RegExp,
  toCanonical: (m: RegExpMatchArray) => string | null,
): TokenMatch | null {
  let best: TokenMatch | null = null;
  for (const m of s.matchAll(re)) {
    const canonical = toCanonical(m);
    if (canonical !== null && m.index !== undefined) {
      best = { index: m.index, length: m[0].length, canonical };
    }
  }
  return best;
}

/** Extract the filename's date token (canonical YYYYMMDD) and remove it.
 * Patterns are tried most-specific-first; within a pattern the LAST valid
 * occurrence wins (the convention puts the date last). */
function extractDate(s: string): { rest: string; dateToken?: string } {
  const attempts: Array<() => TokenMatch | null> = [
    // 10-digit run starting "20": Drive-mangled "%20" + YYYYMMDD swallowed
    // together ("2020241217" = %20 + 20241217, exemplar §4.8).
    () =>
      lastValidMatch(s, /(?<!\d)20(\d{8})(?!\d)/g, (m) => {
        const y = Number(m[1].slice(0, 4));
        const mo = Number(m[1].slice(4, 6));
        const d = Number(m[1].slice(6, 8));
        return validYmd(y, mo, d) ? ymd(y, mo, d) : null;
      }),
    // 8-digit run: YYYYMMDD, else legacy DDMMYYYY prefix ("20012025 Dartmills").
    () =>
      lastValidMatch(s, /(?<!\d)(\d{8})(?!\d)/g, (m) => {
        const t = m[1];
        const y1 = Number(t.slice(0, 4));
        const mo1 = Number(t.slice(4, 6));
        const d1 = Number(t.slice(6, 8));
        if (validYmd(y1, mo1, d1)) return ymd(y1, mo1, d1);
        const d2 = Number(t.slice(0, 2));
        const mo2 = Number(t.slice(2, 4));
        const y2 = Number(t.slice(4, 8));
        if (validYmd(y2, mo2, d2)) return ymd(y2, mo2, d2);
        return null;
      }),
    // ISO-ish YYYY-MM-DD.
    () =>
      lastValidMatch(s, /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g, (m) => {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        return validYmd(y, mo, d) ? ymd(y, mo, d) : null;
      }),
    // D-M-YYYY / D.M.YYYY ("13-10-2004", "12.05.2021").
    () =>
      lastValidMatch(s, /(?<!\d)(\d{1,2})[-.](\d{1,2})[-.](\d{4})(?!\d)/g, (m) => {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const y = Number(m[3]);
        return validYmd(y, mo, d) ? ymd(y, mo, d) : null;
      }),
    // D-M-YY / D.M.YY ("9-6-10") → 20YY.
    () =>
      lastValidMatch(s, /(?<!\d)(\d{1,2})[-.](\d{1,2})[-.](\d{2})(?!\d)/g, (m) => {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const y = 2000 + Number(m[3]);
        return validYmd(y, mo, d) ? ymd(y, mo, d) : null;
      }),
    // Month-name + year ("March2026", "March 2026") → day 01.
    () =>
      lastValidMatch(
        s,
        // (?<![A-Za-z]) not \b — "_March2026" has no \b after the underscore
        /(?<![A-Za-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[-_ ]?\s*(\d{4})(?!\d)/gi,
        (m) => {
          const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1;
          const y = Number(m[2]);
          return validYmd(y, mo, 1) ? ymd(y, mo, 1) : null;
        },
      ),
    // 6-digit ddmmyy freetext date ("090126") — only when it validates.
    () =>
      lastValidMatch(s, /(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/g, (m) => {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const y = 2000 + Number(m[3]);
        return validYmd(y, mo, d) ? ymd(y, mo, d) : null;
      }),
  ];
  for (const attempt of attempts) {
    const match = attempt();
    if (match) {
      return {
        rest: s.slice(0, match.index) + " " + s.slice(match.index + match.length),
        dateToken: match.canonical,
      };
    }
  }
  return { rest: s };
}

/** Extract the version token (canonical "V<maj>.<min>") and remove it.
 * Handles dot form (V1.2), underscore drift (V1_2), major-only (V5) and
 * the model files' bare n.n (INTERNAL cuts use "3.0" with no V prefix —
 * exemplar §5). Run AFTER date extraction so "12.05.2021" can't be read
 * as a version. */
function extractVersion(s: string): { rest: string; versionToken?: string } {
  const attempts: Array<() => TokenMatch | null> = [
    () =>
      lastValidMatch(s, /(?<![A-Za-z0-9])V(\d{1,3})[._](\d{1,3})(?![\d.])/gi, (m) => {
        return `V${Number(m[1])}.${Number(m[2])}`;
      }),
    () =>
      lastValidMatch(s, /(?<![A-Za-z0-9])V(\d{1,3})(?![\d._])/gi, (m) => {
        return `V${Number(m[1])}.0`;
      }),
    () =>
      lastValidMatch(s, /(?<![\dV.])(\d{1,2})\.(\d{1,2})(?![\d.])/g, (m) => {
        return `V${Number(m[1])}.${Number(m[2])}`;
      }),
  ];
  for (const attempt of attempts) {
    const match = attempt();
    if (match) {
      return {
        rest: s.slice(0, match.index) + " " + s.slice(match.index + match.length),
        versionToken: match.canonical,
      };
    }
  }
  return { rest: s };
}

/** Strict YYYYMMDD underscore-token → canonical form (null otherwise). */
function ymdTokenValue(t: string): string | null {
  if (!/^\d{8}$/.test(t)) return null;
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(4, 6));
  const d = Number(t.slice(6, 8));
  return validYmd(y, m, d) ? ymd(y, m, d) : null;
}

/** V1.2 naming-standard tokens, detected purely by SHAPE in the underscore
 * grammar — this module deliberately stays DocType/schema-agnostic (it does
 * NOT import documentNaming.ts / filename_schema.json; this mirrors the
 * standard's §9 parse-order rules instead). Fires only on names with the
 * standard's spine: ≥4 underscore tokens ending in a valid \d{8} filing
 * date. It extracts and removes:
 *
 * - the DOCUMENT date of a dual-date name — the \d{8} token at position 2
 *   (immediately after the DocType token) that is NOT adjacent to the
 *   trailing filing token. Removed from the stem (two vintages of one
 *   dual-date series must share a stem) and returned so ordering can prefer
 *   the vintage over the filing date (standard §5: an old planning
 *   permission can be RECEIVED after a new one).
 * - a standalone R\d+ reissue token (Terms_LENDER-x_R2_date) — removed from
 *   the stem (Terms and Terms_R2 are the same series) and returned as an
 *   ordering tie-break (R2 > R1 > unnumbered first issue).
 *
 * Names without the shape pass through untouched, so legacy/freetext names
 * (where "R2" may be a block/plot label and any date layout is possible)
 * keep their existing behavior exactly. */
function extractStandardTokens(s: string): {
  rest: string;
  documentDate?: string;
  reissue?: number;
} {
  const tokens = s.split("_");
  if (tokens.length < 4) return { rest: s };
  if (ymdTokenValue(tokens[tokens.length - 1].trim()) === null) {
    return { rest: s };
  }
  let documentDate: string | undefined;
  let reissue: number | undefined;
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // Document date: position 2 only (right after Scheme_DocType), and never
    // adjacent to the trailing filing token (standard §1).
    if (i === 2 && i < tokens.length - 2 && documentDate === undefined) {
      const d = ymdTokenValue(t);
      if (d !== null) {
        documentDate = d;
        continue;
      }
    }
    // Reissue: a standalone R\d+ token between the DocType and the filing
    // date (LintonLane_Terms_LENDER-Avamore_R2_20260612).
    if (
      i >= 2 &&
      i < tokens.length - 1 &&
      reissue === undefined &&
      /^R\d{1,2}$/.test(t)
    ) {
      reissue = Number(t.slice(1));
      continue;
    }
    kept.push(t);
  }
  return { rest: kept.join("_"), documentDate, reissue };
}

/** Parse a filename into its series key: normalized stem + shaped tokens.
 * Pure and deterministic — safe to call from queries, mutations, tests. */
export function parseSeriesKey(fileName: string): SeriesKey {
  const normalized = normalizeRawName(fileName);
  const standard = extractStandardTokens(normalized);
  const afterDate = extractDate(standard.rest);
  const afterVersion = extractVersion(afterDate.rest);
  const tokens = afterVersion.rest
    .split(/[\s_\-.,+&()[\]]+/)
    .filter(Boolean)
    // Audience tokens (convention is uppercase) — never part of the stem.
    .filter((t) => t !== "INTERNAL" && t !== "EXTERNAL")
    // Initials runs / short ALL-CAPS tokens (RS, AL, JP, KT, INT, EXT…).
    // NOTE: this also drops standalone lender short-tokens (QDF, HTB) —
    // series identity still requires same fileTypeDetected + scope, and
    // welded forms ("QDFTerms") survive, so the residual over-merge risk
    // is confined to same-type same-project docs differing ONLY by a bare
    // lender token.
    .filter((t) => !/^[A-Z]{1,4}$/.test(t))
    .map((t) => t.toLowerCase());
  return {
    stem: tokens.join(" "),
    // Dual-date names order by the DOCUMENT date (true vintage); the trailing
    // filing date extracted by extractDate is kept as the recency tie-break.
    dateToken: standard.documentDate ?? afterDate.dateToken,
    ...(standard.documentDate !== undefined && afterDate.dateToken !== undefined
      ? { filingDateToken: afterDate.dateToken }
      : {}),
    versionToken: afterVersion.versionToken,
    ...(standard.reissue !== undefined ? { reissueToken: standard.reissue } : {}),
  };
}

/** The document fields series logic reads — structurally satisfied by
 * Doc<"documents">. */
export type SeriesDoc = Pick<
  Doc<"documents">,
  "_id" | "_creationTime" | "fileName" | "fileTypeDetected" | "clientId" | "projectId"
>;

function versionOrdinal(key: SeriesKey): number | null {
  if (!key.versionToken) return null;
  const m = key.versionToken.match(/^V(\d+)\.(\d+)$/);
  if (!m) return null;
  return Number(m[1]) * 1000 + Number(m[2]);
}

/** Same document series: same projectId (or same clientId when both are
 * project-unlinked), same fileTypeDetected, same normalized stem. */
export function isSameSeries(a: SeriesDoc, b: SeriesDoc): boolean {
  if (a._id === b._id) return true;
  if (a.projectId !== undefined && b.projectId !== undefined) {
    if (a.projectId !== b.projectId) return false;
  } else if (a.projectId === undefined && b.projectId === undefined) {
    if (a.clientId === undefined || a.clientId !== b.clientId) return false;
  } else {
    return false;
  }
  if ((a.fileTypeDetected ?? "") !== (b.fileTypeDetected ?? "")) return false;
  const ka = parseSeriesKey(a.fileName);
  const kb = parseSeriesKey(b.fileName);
  return ka.stem !== "" && ka.stem === kb.stem;
}

/** Ordering comparator for two documents ALREADY known to share a series.
 * Returns <0 (a older), >0 (a newer), 0 (unorderable tie). Date token
 * first (for V1.2 dual-date names that is the DOCUMENT date — the vintage,
 * not the filing recency); then the filing date as a tie-break between
 * equal vintages; then the reissue ordinal (Terms R2 > R1 > unnumbered);
 * version token only when dates are equal or missing on either side;
 * _creationTime last (exemplar §4.6: order series members by the date
 * token, not the version token, across name variants). */
export function compareInSeries(a: SeriesDoc, b: SeriesDoc): number {
  const ka = parseSeriesKey(a.fileName);
  const kb = parseSeriesKey(b.fileName);
  if (ka.dateToken !== undefined && kb.dateToken !== undefined) {
    const cmp = Number(ka.dateToken) - Number(kb.dateToken);
    if (cmp !== 0) return cmp;
  }
  // Filing-date tie-break — only meaningful when both sides are dual-date
  // names (the only shape that sets filingDateToken).
  if (ka.filingDateToken !== undefined && kb.filingDateToken !== undefined) {
    const cmp = Number(ka.filingDateToken) - Number(kb.filingDateToken);
    if (cmp !== 0) return cmp;
  }
  // Reissue tie-break: a member WITHOUT an R token is the unnumbered first
  // issue (ordinal 1), so Terms_R2 > Terms at the same date.
  if (ka.reissueToken !== undefined || kb.reissueToken !== undefined) {
    const cmp = (ka.reissueToken ?? 1) - (kb.reissueToken ?? 1);
    if (cmp !== 0) return cmp;
  }
  const va = versionOrdinal(ka);
  const vb = versionOrdinal(kb);
  if (va !== null && vb !== null && va !== vb) return va - vb;
  return a._creationTime - b._creationTime;
}

/** Series test + ordering in one call. "not_same_series" is ALSO returned
 * for same-series documents that are an exact ordering tie (same date,
 * same version, same _creationTime): an unorderable pair carries no
 * version-precedence signal, so this returns the same "no signal" verdict as
 * a genuine cross-series pair. It does NOT imply the conflict ends up
 * contested — it only means version precedence abstains. On the write path
 * that abstention returns null from versionPrecedenceWinner and falls through
 * to Layers 1-3 (asOf / authority / confidence), which may still auto-resolve
 * the conflict; contested is only the outcome when those layers also tie. */
export function sameSeriesAndOrder(
  docA: SeriesDoc,
  docB: SeriesDoc,
): "a_newer" | "b_newer" | "not_same_series" {
  if (!isSameSeries(docA, docB)) return "not_same_series";
  const cmp = compareInSeries(docA, docB);
  if (cmp > 0) return "a_newer";
  if (cmp < 0) return "b_newer";
  return "not_same_series";
}

// ── Write-path decision (called from atomsCore.processCandidate) ──

type ObservationSourceRef = {
  sourceType: Doc<"atomObservations">["sourceType"];
  documentId?: Id<"documents">;
};

/** Decide a value conflict on version precedence alone.
 *
 * Returns "new" when the incoming document is a strictly newer version of
 * the SAME series as every document backing the incumbent's live
 * observations; "incumbent" when a same-series document at least as new
 * as the incoming one already backs the incumbent (backfill of an old
 * version); null when the conflict is cross-series / cross-source /
 * unorderable — the caller's existing layers then apply unchanged. */
export async function versionPrecedenceWinner(
  ctx: MutationCtx,
  newObservation: ObservationSourceRef,
  incumbentLiveObs: ObservationSourceRef[],
): Promise<"new" | "incumbent" | null> {
  if (newObservation.sourceType !== "document" || newObservation.documentId === undefined) {
    return null;
  }
  if (incumbentLiveObs.length === 0) return null;
  const incumbentDocIds = new Set<Id<"documents">>();
  for (const obs of incumbentLiveObs) {
    // Any non-document support (Companies House, operator, …) makes this a
    // cross-source conflict — stays with the existing resolution layers.
    if (obs.sourceType !== "document" || obs.documentId === undefined) return null;
    incumbentDocIds.add(obs.documentId);
  }
  // The same document asserting both values is a same-lineage anomaly, not
  // a version conflict — leave it to the existing layers.
  if (incumbentDocIds.has(newObservation.documentId)) return null;

  const newDoc = await ctx.db.get(newObservation.documentId);
  if (!newDoc) return null;

  // Pass 1 — resolve EVERY backing doc and require the FULL set to share the
  // incoming doc's series before any version comparison. Corroboration can
  // leave an incumbent backed by MIXED-series documents (atomsCore.ts appends
  // an observation from any equal-value document, cross-series included), so a
  // single cross-series backer makes this a cross-source conflict — return
  // null and let the normal layers decide. Checking the whole set up front
  // (rather than short-circuiting on the first newer same-series doc) keeps
  // the outcome independent of observation insertion order; this mirrors the
  // retro pass's "ALL backing docs of every group member same-series" gate
  // (applyVersionPrecedenceRetro above). Regression: a mixed [same-series,
  // cross-series] incumbent must return null under BOTH orderings, never
  // land the incoming atom born-superseded on version precedence.
  const incumbentDocs: SeriesDoc[] = [];
  for (const docId of incumbentDocIds) {
    const doc = await ctx.db.get(docId);
    if (!doc) return null; // can't verify series — do not auto-resolve
    if (!isSameSeries(newDoc, doc)) return null;
    incumbentDocs.push(doc);
  }

  // Pass 2 — every backer is same-series; honor the version comparison. Any
  // same-series doc newer than the incoming one means the incoming value is a
  // backfilled old version (order-independent: all are same-series now).
  let sawOlder = false;
  for (const doc of incumbentDocs) {
    const cmp = compareInSeries(newDoc, doc);
    if (cmp === 0) return null; // unorderable tie
    if (cmp < 0) return "incumbent";
    sawOlder = true;
  }
  return sawOlder ? "new" : null;
}

// ── Retroactive pass over existing contested atoms ──

// Identity rule mirror of atomsCore.atomsShareIdentity (kept local to avoid
// an atomsCore ⇄ versionPrecedence import cycle; the rule is spec-frozen:
// subjectType, subjectId, predicate, qualifier ?? null, object-kind, and —
// for edges — objectEntityId).
function retroObjectKind(a: Doc<"atoms">): "edge" | "literal" {
  return a.objectEntityId !== undefined ? "edge" : "literal";
}

function retroShareIdentity(a: Doc<"atoms">, ref: Doc<"atoms">): boolean {
  const refIsEdge = retroObjectKind(ref) === "edge";
  return (
    a.subjectType === ref.subjectType &&
    a.subjectId === ref.subjectId &&
    a.predicate === ref.predicate &&
    (a.qualifier ?? null) === (ref.qualifier ?? null) &&
    retroObjectKind(a) === retroObjectKind(ref) &&
    (!refIsEdge || a.objectEntityId === ref.objectEntityId)
  );
}

/** Live (non-superseded) observations for an atom — mirror of
 * atomsCore.liveObservations (module-private there). */
async function retroLiveObservations(
  ctx: MutationCtx,
  atomId: Id<"atoms">,
): Promise<Doc<"atomObservations">[]> {
  const all = await ctx.db
    .query("atomObservations")
    .withIndex("by_atom", (q) => q.eq("atomId", atomId))
    .collect();
  return all.filter((o) => o.superseded !== true);
}

/**
 * applyVersionPrecedenceRetro — paginated retro pass over CONTESTED atoms.
 *
 * For each contested identity group whose competing values are ALL backed
 * exclusively by documents of ONE series, auto-resolves the contest: the
 * atom backed by the newest series member returns to "active"; every other
 * group member is archived as superseded (supersededBy = winner, reason
 * "version_precedence" — the audit trail's marker that the version-
 * precedence rule, not an operator, adjudicated). Mirrors how
 * atomsCore.resolveContestedCore marks losers. Groups whose conflicts span
 * series or source types, have non-document/zero live observations, or are
 * an ordering tie are left contested untouched.
 *
 * Run repeatedly with the returned continueCursor until isDone:
 *   npx convex run knowledge/versionPrecedence:applyVersionPrecedenceRetro '{"limit": 50}'
 *   npx convex run knowledge/versionPrecedence:applyVersionPrecedenceRetro '{"limit": 50, "cursor": "<continueCursor>"}'
 */
export const applyVersionPrecedenceRetro = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = Math.max(1, Math.min(args.limit ?? 50, 200));
    const page = await ctx.db
      .query("atoms")
      .filter((q) => q.eq(q.field("status"), "contested"))
      .paginate({ cursor: args.cursor ?? null, numItems });

    const processed = new Set<string>();
    const resolutions: Array<{
      winnerAtomId: Id<"atoms">;
      supersededAtomIds: Id<"atoms">[];
    }> = [];
    let skippedSingleton = 0;
    let skippedNonDocument = 0;
    let skippedCrossSeries = 0;
    let skippedUnorderable = 0;

    for (const seed of page.page) {
      if (processed.has(seed._id)) continue;

      // The contested identity group (same lookup as resolveContestedCore).
      const contestedRows = await ctx.db
        .query("atoms")
        .withIndex("by_subject", (q) =>
          q
            .eq("subjectType", seed.subjectType)
            .eq("subjectId", seed.subjectId)
            .eq("status", "contested"),
        )
        .collect();
      const group = contestedRows.filter((a) => retroShareIdentity(a, seed));
      for (const member of group) processed.add(member._id);

      if (group.length < 2) {
        // Orphan contested row (counterpart already resolved elsewhere) —
        // not this rule's call to make.
        skippedSingleton++;
        continue;
      }

      // Every group member must be backed exclusively by documents.
      const docsByAtom = new Map<Id<"atoms">, SeriesDoc[]>();
      const docCache = new Map<Id<"documents">, SeriesDoc | null>();
      let nonDocument = false;
      for (const member of group) {
        const obs = await retroLiveObservations(ctx, member._id);
        if (obs.length === 0) {
          nonDocument = true;
          break;
        }
        const docs: SeriesDoc[] = [];
        for (const o of obs) {
          if (o.sourceType !== "document" || o.documentId === undefined) {
            nonDocument = true;
            break;
          }
          if (!docCache.has(o.documentId)) {
            docCache.set(o.documentId, await ctx.db.get(o.documentId));
          }
          const doc = docCache.get(o.documentId);
          if (!doc) {
            nonDocument = true; // source document gone — cannot verify series
            break;
          }
          if (!docs.some((d) => d._id === doc._id)) docs.push(doc);
        }
        if (nonDocument) break;
        docsByAtom.set(member._id, docs);
      }
      if (nonDocument) {
        skippedNonDocument++;
        continue;
      }

      // ALL conflicting values must come from ONE series.
      const allDocs = [...docsByAtom.values()].flat();
      const ref = allDocs[0];
      if (!allDocs.every((d) => isSameSeries(ref, d))) {
        skippedCrossSeries++;
        continue;
      }

      // Each atom is represented by its newest series member; the group
      // winner is the atom whose representative is strictly newest.
      const represented = group.map((member) => {
        const docs = docsByAtom.get(member._id)!;
        const rep = docs.reduce((best, d) =>
          compareInSeries(d, best) > 0 ? d : best,
        );
        return { member, rep };
      });
      represented.sort((x, y) => compareInSeries(y.rep, x.rep));
      if (compareInSeries(represented[0].rep, represented[1].rep) === 0) {
        skippedUnorderable++; // ordering tie at the top — leave contested
        continue;
      }

      const winner = represented[0].member;
      const losers = represented.slice(1).map((r) => r.member);

      // Mirror resolveContestedCore's marking, attributed to the rule.
      await ctx.db.patch(winner._id, {
        status: "active",
        supersededBy: undefined,
        supersessionReason: undefined,
      });
      for (const loser of losers) {
        await ctx.db.patch(loser._id, {
          status: "superseded",
          supersededBy: winner._id,
          supersessionReason: "version_precedence",
        });
      }
      resolutions.push({
        winnerAtomId: winner._id,
        supersededAtomIds: losers.map((l) => l._id),
      });
    }

    return {
      scannedContested: page.page.length,
      resolvedGroups: resolutions.length,
      archivedAtoms: resolutions.reduce(
        (n, r) => n + r.supersededAtomIds.length,
        0,
      ),
      skippedSingleton,
      skippedNonDocument,
      skippedCrossSeries,
      skippedUnorderable,
      resolutions,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// TEMPORARY debug probe — sample contested groups with their backing source
// documents, to judge whether the series matcher is too strict. Remove after
// the retro-pass calibration session.
export const debugContestedSources = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("atoms")
      .filter((q) => q.eq(q.field("status"), "contested"))
      .take(args.limit ?? 12);
    const out: any[] = [];
    for (const a of rows) {
      const obs = await retroLiveObservations(ctx as unknown as MutationCtx, a._id);
      const sources: any[] = [];
      for (const o of obs) {
        let fileName: string | null = null;
        if (o.sourceType === "document" && o.documentId) {
          const d = await ctx.db.get(o.documentId);
          fileName = d ? (d as any).fileName ?? null : "(deleted)";
        }
        sources.push({ sourceType: o.sourceType, fileName });
      }
      out.push({
        atomId: a._id,
        predicate: (a as any).predicate,
        value: (a as any).value,
        sources,
      });
    }
    return out;
  },
});
