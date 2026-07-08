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
  /** Canonical YYYYMMDD (month-only dates canonicalise to day 01). */
  dateToken?: string;
  /** Canonical "V<maj>.<min>". */
  versionToken?: string;
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

/** Parse a filename into its series key: normalized stem + shaped tokens.
 * Pure and deterministic — safe to call from queries, mutations, tests. */
export function parseSeriesKey(fileName: string): SeriesKey {
  const normalized = normalizeRawName(fileName);
  const afterDate = extractDate(normalized);
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
    dateToken: afterDate.dateToken,
    versionToken: afterVersion.versionToken,
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
 * first; version token only when dates are equal or missing on either
 * side; _creationTime last (exemplar §4.6: order series members by the
 * date token, not the version token, across name variants). */
export function compareInSeries(a: SeriesDoc, b: SeriesDoc): number {
  const ka = parseSeriesKey(a.fileName);
  const kb = parseSeriesKey(b.fileName);
  if (ka.dateToken !== undefined && kb.dateToken !== undefined) {
    const cmp = Number(ka.dateToken) - Number(kb.dateToken);
    if (cmp !== 0) return cmp;
  }
  const va = versionOrdinal(ka);
  const vb = versionOrdinal(kb);
  if (va !== null && vb !== null && va !== vb) return va - vb;
  return a._creationTime - b._creationTime;
}

/** Series test + ordering in one call. "not_same_series" is ALSO returned
 * for same-series documents that are an exact ordering tie (same date,
 * same version, same _creationTime) — an unorderable pair must never
 * auto-resolve, so callers fall through to contested either way. */
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
  let sawOlder = false;
  for (const docId of incumbentDocIds) {
    const doc = await ctx.db.get(docId);
    if (!doc) return null; // can't verify series — do not auto-resolve
    if (!isSameSeries(newDoc, doc)) return null;
    const cmp = compareInSeries(newDoc, doc);
    if (cmp === 0) return null; // unorderable tie
    if (cmp < 0) {
      // A same-series document NEWER than the incoming one already backs
      // the incumbent: the incoming value is a backfilled old version.
      return "incumbent";
    }
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
