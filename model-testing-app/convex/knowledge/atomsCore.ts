import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  isValidPredicate,
  isAtomStorablePredicate,
  PREDICATES,
  FACILITY_SHAPED_PREDICATES,
} from "./vocabulary";
import { mintFacilitiesForAtoms } from "./facilities";
import { versionPrecedenceWinner } from "./versionPrecedence";

// Knowledge-layer core engine — Spec 2 Phase 2a.1
// (docs/spec-2-knowledge-layer.md §6.1 gates, §7 dedup/corroboration/
// supersession). Internal mutations only; the public/MCP surfaces arrive in
// 2a.3/2a.4 and everything they persist routes through here, so the
// persistence gates are machine-checked server-side and cannot be bypassed
// by either atomization lane (§14b.1).
//
// ── Identity model ──
// ONE canonical atom per identity (subjectType, subjectId, predicate,
// qualifier ?? null, object-kind). Every source occurrence is an
// atomObservations row. Five documents restating the same GDV converge on
// one atom with five observations — near-duplicate rows would dilute vector
// search and multiply maintenance (§3.1).
//
// ── Contested representation (implementation decision) ──
// Spec §3.1 has no contest pointer field and the schema is locked, so a
// contest is represented as `status: "contested"` on BOTH rows. The two
// rows share the identity key, so the counterpart is discoverable via
// by_subject (same subjectType/subjectId, filter predicate + qualifier +
// object-kind). Retrieval returns the contest rather than silently picking
// one (§7 layer 3); contests are internal data quality — no approvals row.
//
// ── Conflict resolution (spec §7, layered) ──
// 1. asOf materially newer wins — a temporal update, not a contradiction.
// 2. Comparable/absent asOf → document-type authority tier (see
//    AUTHORITY_TIERS), then confidence. (The spec's "recency" tie-break is
//    degenerate for an incoming-vs-incumbent comparison — the incoming
//    observation is always newer by observedAt — so recency participates
//    only through asOf in layer 1.)
// 3. Same tier, no asOf resolution, values beyond tolerance → contested.
//
// ── Corroboration ──
// Independent live observations bump confidence by +0.05 each, capped at
// 0.98 — the incremental form of the spec's min(0.98, base + 0.05·(n−1))
// with base = the first observation's extraction confidence. A re-assertion
// from the SAME source (same document at a new revision, same externalRef)
// refreshes the existing observation instead: no bump, no observation bloat.

// ── Policy constants ──

/** Document-type authority tiers (spec §7). Higher = more authoritative. */
export const AUTHORITY_TIERS = {
  executed_legal: 5, // executed legal documents
  facility_letter: 4, // facility letters / term sheets
  valuation: 3, // valuations / appraisals
  internal_brief: 2, // internal briefs
  email: 1, // emails / everything else
} as const;

/** Relative tolerance under which two numeric values are the SAME fact
 * (rounding / presentation differences), not a contradiction. */
export const VALUE_TOLERANCE = 0.005;

/** Per-independent-observation confidence bump, and its ceiling (spec §7). */
export const CORROBORATION_BUMP = 0.05;
export const CONFIDENCE_CAP = 0.98;

/** Same-tier conflicts resolve on confidence only when the gap is material;
 * otherwise the sources are genuinely contemporaneous-equal → contested. */
export const CONFIDENCE_TIEBREAK_GAP = 0.2;

/** asOf differences beyond this window are a temporal update (newer wins,
 * spec §7 layer 1); within it the sources are "comparable" — deal-pack
 * documents dated days/weeks apart contradict, they don't update — and
 * resolution falls through to authority tier. */
export const MATERIAL_ASOF_MS = 30 * 24 * 60 * 60 * 1000;

/** Max candidates per batch call — keeps each mutation comfortably inside
 * Convex write limits (~4 writes per candidate worst case). Callers chunk. */
export const MAX_BATCH = 100;
const MAX_CHUNKS = 300;

// ── Entity resolution (spec §6.1 gate 1: anchored, machine-checked) ──

const ENTITY_TABLES = {
  client: "clients",
  project: "projects",
  contact: "contacts",
  company: "companiesHouseCompanies",
  facility: "facilities",
  candidate: "entityCandidates",
} as const;

type EntityType = keyof typeof ENTITY_TABLES;

async function entityExists(
  ctx: MutationCtx | QueryCtx,
  type: EntityType,
  id: string,
): Promise<boolean> {
  const table = ENTITY_TABLES[type];
  const normalized = ctx.db.normalizeId(table, id);
  if (!normalized) return false;
  return (await ctx.db.get(normalized)) !== null;
}

// ── Validators ──

const entityTypeValidator = v.union(
  v.literal("client"),
  v.literal("project"),
  v.literal("contact"),
  v.literal("company"),
  v.literal("facility"),
  v.literal("candidate"),
);

const objectLiteralValidator = v.object({
  value: v.any(),
  valueType: v.union(
    v.literal("currency"),
    v.literal("number"),
    v.literal("percentage"),
    v.literal("date"),
    v.literal("string"),
    v.literal("range"),
  ),
  currency: v.optional(v.string()),
  unit: v.optional(v.string()),
});

const locatorValidator = v.object({
  page: v.optional(v.number()),
  sheet: v.optional(v.string()),
  row: v.optional(v.number()),
  cellRange: v.optional(v.string()),
  section: v.optional(v.string()),
});

const observationInputValidator = v.object({
  sourceType: v.union(
    v.literal("document"),
    v.literal("companies_house"),
    v.literal("apollo"),
    v.literal("operator"),
    v.literal("skill"),
    v.literal("migration"),
  ),
  documentId: v.optional(v.id("documents")),
  contentChecksum: v.optional(v.string()),
  locator: v.optional(locatorValidator),
  sourceText: v.optional(v.string()),
  externalRef: v.optional(v.string()),
  authorityTier: v.number(),
});

const candidateValidator = v.object({
  statement: v.string(),
  subjectType: entityTypeValidator,
  subjectId: v.string(),
  predicate: v.string(),
  objectEntityType: v.optional(entityTypeValidator),
  objectEntityId: v.optional(v.string()),
  objectLiteral: v.optional(objectLiteralValidator),
  qualifier: v.optional(v.string()),
  clientId: v.optional(v.id("clients")),
  projectId: v.optional(v.id("projects")),
  asOf: v.optional(v.string()),
  confidence: v.number(),
  observation: observationInputValidator,
});

type ObservationInput = {
  sourceType: Doc<"atomObservations">["sourceType"];
  documentId?: Id<"documents">;
  contentChecksum?: string;
  locator?: Doc<"atomObservations">["locator"];
  sourceText?: string;
  externalRef?: string;
  authorityTier: number;
};

type Candidate = {
  statement: string;
  subjectType: EntityType;
  subjectId: string;
  predicate: string;
  objectEntityType?: EntityType;
  objectEntityId?: string;
  objectLiteral?: Doc<"atoms">["objectLiteral"];
  qualifier?: string;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  asOf?: string;
  confidence: number;
  observation: ObservationInput;
};

// ── Canonical value comparison (spec §7 "canonical compare") ──

function objectKind(x: {
  objectEntityId?: string | undefined;
  objectLiteral?: unknown;
}): "edge" | "literal" {
  return x.objectEntityId !== undefined ? "edge" : "literal";
}

/** Best-effort numeric read: raw numbers pass through; strings shed
 * currency symbols / commas / percent signs before parsing. */
function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[£$€,\s%]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function canonicalizeLiteral(
  lit: NonNullable<Doc<"atoms">["objectLiteral"]>,
): string {
  switch (lit.valueType) {
    case "currency":
    case "number":
    case "percentage": {
      const n = numericValue(lit.value);
      return n !== null ? String(n) : String(lit.value).trim().toLowerCase();
    }
    case "date": {
      const s = String(lit.value).trim();
      // ISO date-times reduce to the calendar date
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s.toLowerCase();
    }
    case "string":
      return String(lit.value).trim().replace(/\s+/g, " ").toLowerCase();
    case "range":
    default:
      return JSON.stringify(lit.value);
  }
}

/** Same-fact test. Numeric literals within VALUE_TOLERANCE (relative) are
 * the same fact stated with rounding differences, not a contradiction. */
function valuesEqual(
  a: { objectEntityId?: string; objectLiteral?: Doc<"atoms">["objectLiteral"] },
  b: { objectEntityId?: string; objectLiteral?: Doc<"atoms">["objectLiteral"] },
): boolean {
  const kindA = objectKind(a);
  if (kindA !== objectKind(b)) return false;
  if (kindA === "edge") return a.objectEntityId === b.objectEntityId;
  const litA = a.objectLiteral!;
  const litB = b.objectLiteral!;
  const numA = numericValue(litA.value);
  const numB = numericValue(litB.value);
  if (numA !== null && numB !== null) {
    if (numA === numB) return true;
    const scale = Math.max(Math.abs(numA), Math.abs(numB));
    return scale > 0 && Math.abs(numA - numB) / scale <= VALUE_TOLERANCE;
  }
  return canonicalizeLiteral(litA) === canonicalizeLiteral(litB);
}

function parseAsOf(asOf: string | undefined): number | null {
  if (!asOf) return null;
  const t = Date.parse(asOf);
  return Number.isNaN(t) ? null : t;
}

// ── Persistence gates (spec §6.1 gate 1, machine-checked) ──

async function validateCandidate(
  ctx: MutationCtx,
  cand: Candidate,
): Promise<string | null> {
  if (!isValidPredicate(cand.predicate)) {
    return `unknown_predicate: "${cand.predicate}" is not in the vocabulary (convex/knowledge/vocabulary.ts)`;
  }
  if (!isAtomStorablePredicate(cand.predicate)) {
    return `native_predicate: "${cand.predicate}" lives in structural tables and is never stored as an atom (spec §2.1/§5)`;
  }
  const hasEdge = cand.objectEntityId !== undefined;
  const hasLiteral = cand.objectLiteral !== undefined;
  if (hasEdge && hasLiteral) return "object_both: exactly one of objectEntityId / objectLiteral must be set";
  if (!hasEdge && !hasLiteral) return "object_missing: exactly one of objectEntityId / objectLiteral must be set";
  const kind = PREDICATES[cand.predicate].kind;
  if (kind === "edge" && hasLiteral) {
    return `predicate_kind_mismatch: "${cand.predicate}" is an edge predicate but got an objectLiteral`;
  }
  if (kind === "attribute" && hasEdge) {
    return `predicate_kind_mismatch: "${cand.predicate}" is an attribute predicate but got an objectEntityId`;
  }
  if (hasEdge && cand.objectEntityType === undefined) {
    return "object_type_missing: objectEntityId requires objectEntityType";
  }
  if (!(cand.confidence >= 0 && cand.confidence <= 1)) {
    return `invalid_confidence: ${cand.confidence} (must be 0..1)`;
  }
  if (!(await entityExists(ctx, cand.subjectType, cand.subjectId))) {
    return `unresolved_subject: no ${ENTITY_TABLES[cand.subjectType]} row for "${cand.subjectId}"`;
  }
  if (hasEdge && !(await entityExists(ctx, cand.objectEntityType!, cand.objectEntityId!))) {
    return `unresolved_object: no ${ENTITY_TABLES[cand.objectEntityType!]} row for "${cand.objectEntityId}"`;
  }
  return null;
}

// ── Identity lookup & write helpers ──

/** All live (active or contested) atoms sharing the candidate's canonical
 * identity.
 *
 * ATTRIBUTES: (subjectType, subjectId, predicate, qualifier??null) — one
 * canonical value per key; a different literal is a revision/contest.
 *
 * EDGES: identity ALSO includes objectEntityId. An edge to a DIFFERENT
 * object is a different fact, never a revision — a lender lends_to many
 * borrowers, a person guarantees many facilities. (Bug fix 2026-07-07:
 * without this, Quantum's Temple Guiting lends_to superseded its
 * Leighterton lends_to — multi-valued relations were collapsing to one.) */
async function findLiveAtomsByIdentity(
  ctx: MutationCtx,
  cand: Candidate,
): Promise<Doc<"atoms">[]> {
  const out: Doc<"atoms">[] = [];
  const candIsEdge = objectKind(cand) === "edge";
  for (const status of ["active", "contested"] as const) {
    const rows = await ctx.db
      .query("atoms")
      .withIndex("by_subject", (q) =>
        q
          .eq("subjectType", cand.subjectType)
          .eq("subjectId", cand.subjectId)
          .eq("status", status),
      )
      .collect();
    for (const row of rows) {
      if (
        row.predicate === cand.predicate &&
        (row.qualifier ?? null) === (cand.qualifier ?? null) &&
        objectKind(row) === objectKind(cand) &&
        (!candIsEdge || row.objectEntityId === cand.objectEntityId)
      ) {
        out.push(row);
      }
    }
  }
  return out;
}

async function insertObservation(
  ctx: MutationCtx,
  atomId: Id<"atoms">,
  cand: Candidate,
  now: string,
): Promise<Id<"atomObservations">> {
  return await ctx.db.insert("atomObservations", {
    atomId,
    sourceType: cand.observation.sourceType,
    documentId: cand.observation.documentId,
    contentChecksum: cand.observation.contentChecksum,
    locator: cand.observation.locator,
    sourceText: cand.observation.sourceText,
    externalRef: cand.observation.externalRef,
    extractedValue: cand.objectLiteral?.value,
    observedAt: now,
    authorityTier: cand.observation.authorityTier,
  });
}

async function insertAtomWithObservation(
  ctx: MutationCtx,
  cand: Candidate,
  status: Doc<"atoms">["status"],
  now: string,
  extra?: {
    supersededBy?: Id<"atoms">;
    supersessionReason?: Doc<"atoms">["supersessionReason"];
  },
): Promise<Id<"atoms">> {
  const atomId = await ctx.db.insert("atoms", {
    statement: cand.statement,
    subjectType: cand.subjectType,
    subjectId: cand.subjectId,
    predicate: cand.predicate,
    objectEntityType: cand.objectEntityType,
    objectEntityId: cand.objectEntityId,
    objectLiteral: cand.objectLiteral,
    qualifier: cand.qualifier,
    clientId: cand.clientId,
    projectId: cand.projectId,
    asOf: cand.asOf,
    observedAt: now,
    status,
    supersededBy: extra?.supersededBy,
    supersessionReason: extra?.supersessionReason,
    confidence: cand.confidence,
    primarySourceType: cand.observation.sourceType,
    // embedding intentionally absent — the 2a.2 embeddings lane backfills;
    // rows without vectors are simply excluded from the vector index.
  });
  await insertObservation(ctx, atomId, cand, now);
  return atomId;
}

/** Live (non-superseded) observations for an atom. */
async function liveObservations(
  ctx: MutationCtx,
  atomId: Id<"atoms">,
): Promise<Doc<"atomObservations">[]> {
  const all = await ctx.db
    .query("atomObservations")
    .withIndex("by_atom", (q) => q.eq("atomId", atomId))
    .collect();
  return all.filter((o) => o.superseded !== true);
}

/** An observation on this atom from the SAME source — same document (any
 * revision) or same non-document externalRef. Re-assertions from the same
 * source refresh rather than append (and never bump confidence). */
function findSameSourceObservation(
  observations: Doc<"atomObservations">[],
  obs: ObservationInput,
): Doc<"atomObservations"> | undefined {
  return observations.find((o) => {
    if (o.sourceType !== obs.sourceType) return false;
    if (obs.documentId !== undefined) return o.documentId === obs.documentId;
    if (obs.externalRef !== undefined) return o.externalRef === obs.externalRef;
    return false;
  });
}

// ── Per-candidate outcome (shared by createAtomsBatch & reatomizeDiff) ──

type Outcome =
  | { type: "created"; atomId: Id<"atoms"> }
  | { type: "corroborated"; atomId: Id<"atoms">; refreshed: boolean }
  | {
      type: "superseded";
      atomId: Id<"atoms">; // the NEW atom (winner or preserved loser)
      supersededAtomId: Id<"atoms">;
      winner: "new" | "incumbent";
    }
  | { type: "contested"; atomId: Id<"atoms">; contestedWith: Id<"atoms">[] };

async function processCandidate(
  ctx: MutationCtx,
  cand: Candidate,
  now: string,
): Promise<Outcome> {
  const liveAtoms = await findLiveAtomsByIdentity(ctx, cand);

  // ── No live atom with this identity → create ──
  if (liveAtoms.length === 0) {
    const atomId = await insertAtomWithObservation(ctx, cand, "active", now);
    return { type: "created", atomId };
  }

  // ── Same value as a live atom → corroborate it ──
  const match = liveAtoms.find((a) => valuesEqual(a, cand));
  if (match) {
    const obs = await ctx.db
      .query("atomObservations")
      .withIndex("by_atom", (q) => q.eq("atomId", match._id))
      .collect();
    const sameSource = findSameSourceObservation(obs, cand.observation);
    let refreshed = false;
    if (sameSource) {
      // Same source re-asserting (e.g. a new revision of the same document):
      // refresh the observation in place. Not independent → no bump.
      await ctx.db.patch(sameSource._id, {
        contentChecksum: cand.observation.contentChecksum,
        locator: cand.observation.locator,
        sourceText: cand.observation.sourceText,
        externalRef: cand.observation.externalRef,
        extractedValue: cand.objectLiteral?.value,
        observedAt: now,
        authorityTier: cand.observation.authorityTier,
        superseded: false,
      });
      refreshed = true;
    } else {
      await insertObservation(ctx, match._id, cand, now);
    }

    const liveTiers = obs
      .filter((o) => o.superseded !== true && o._id !== sameSource?._id)
      .map((o) => o.authorityTier);
    const maxExistingTier = liveTiers.length > 0 ? Math.max(...liveTiers) : -Infinity;

    const patch: Partial<Doc<"atoms">> = { observedAt: now };
    if (!refreshed) {
      patch.confidence = Math.min(
        CONFIDENCE_CAP,
        match.confidence + CORROBORATION_BUMP,
      );
    }
    const candAsOf = parseAsOf(cand.asOf);
    const atomAsOf = parseAsOf(match.asOf);
    if (candAsOf !== null && (atomAsOf === null || candAsOf > atomAsOf)) {
      patch.asOf = cand.asOf;
    }
    if (cand.observation.authorityTier > maxExistingTier) {
      // The most-authoritative source now speaks for the atom.
      patch.statement = cand.statement;
      patch.primarySourceType = cand.observation.sourceType;
    }
    await ctx.db.patch(match._id, patch);
    return { type: "corroborated", atomId: match._id, refreshed };
  }

  // ── Value differs from every live atom → layered resolution (spec §7) ──
  // Against an already-contested set, a third distinct value simply joins
  // the contest (hygiene / Phase 2c ages contests out).
  if (liveAtoms.length > 1 || liveAtoms[0].status === "contested") {
    const atomId = await insertAtomWithObservation(ctx, cand, "contested", now);
    return {
      type: "contested",
      atomId,
      contestedWith: liveAtoms.map((a) => a._id),
    };
  }

  const incumbent = liveAtoms[0];
  const incumbentObs = await liveObservations(ctx, incumbent._id);
  const incumbentTier =
    incumbentObs.length > 0
      ? Math.max(...incumbentObs.map((o) => o.authorityTier))
      : -Infinity;

  let winner: "new" | "incumbent" | null = null;

  // Layer 0 — an incumbent with no live observations has no standing to
  // defend its value (same-lineage path: the sole source just revised
  // itself, so its old assertion was superseded up front).
  if (incumbentObs.length === 0) {
    winner = "new";
  }

  // Layer 0.5 — VERSION PRECEDENCE (knowledge/versionPrecedence.ts): when
  // the incoming value and every live incumbent observation come from
  // different VERSIONS OF THE SAME DOCUMENT SERIES, the later version wins
  // automatically — never a contest. "new" = the incoming doc is the newer
  // version (incumbent superseded); "incumbent" = the incoming doc is a
  // backfilled OLDER version (its value lands born-superseded, incumbent
  // stays active). Cross-series / cross-source conflicts return null and
  // fall through to the existing layers unchanged.
  let viaVersionPrecedence = false;
  if (winner === null) {
    const precedence = await versionPrecedenceWinner(
      ctx,
      cand.observation,
      incumbentObs,
    );
    if (precedence !== null) {
      winner = precedence;
      viaVersionPrecedence = true;
    }
  }

  // Layer 1 — asOf materially newer wins: a temporal update, not a
  // contradiction (a newer valuation replaces an older one).
  const candAsOf = parseAsOf(cand.asOf);
  const incumbentAsOf = parseAsOf(incumbent.asOf);
  if (
    winner === null &&
    candAsOf !== null &&
    incumbentAsOf !== null &&
    Math.abs(candAsOf - incumbentAsOf) > MATERIAL_ASOF_MS
  ) {
    winner = candAsOf > incumbentAsOf ? "new" : "incumbent";
  }

  // Layer 2 — document-type authority tier, then confidence.
  if (winner === null && cand.observation.authorityTier !== incumbentTier) {
    winner = cand.observation.authorityTier > incumbentTier ? "new" : "incumbent";
  }
  if (
    winner === null &&
    Math.abs(cand.confidence - incumbent.confidence) > CONFIDENCE_TIEBREAK_GAP
  ) {
    winner = cand.confidence > incumbent.confidence ? "new" : "incumbent";
  }

  // Layer 3 — contemporaneous, equal-authority, beyond tolerance → contested:
  // both atoms live, both flagged; retrieval returns the contest.
  if (winner === null) {
    const atomId = await insertAtomWithObservation(ctx, cand, "contested", now);
    await ctx.db.patch(incumbent._id, { status: "contested" });
    return { type: "contested", atomId, contestedWith: [incumbent._id] };
  }

  if (winner === "new") {
    const atomId = await insertAtomWithObservation(ctx, cand, "active", now);
    await ctx.db.patch(incumbent._id, {
      status: "superseded",
      supersededBy: atomId,
      supersessionReason: viaVersionPrecedence ? "version_precedence" : "revised",
    });
    return { type: "superseded", atomId, supersededAtomId: incumbent._id, winner };
  }

  // Incumbent wins: the losing value still gets a full provenance trail —
  // it lands as a NEW atom born superseded, pointing at the incumbent.
  const atomId = await insertAtomWithObservation(ctx, cand, "superseded", now, {
    supersededBy: incumbent._id,
    supersessionReason: viaVersionPrecedence ? "version_precedence" : "revised",
  });
  return { type: "superseded", atomId, supersededAtomId: atomId, winner };
}

/** Atom ids to (re)embed after a batch (Phase 2a.2 write-path hook). Exactly
 * the outcomes that produce a NEW live row carrying a fresh statement: a
 * `created` atom, a value-changed `superseded` where the NEW value won, or a
 * `contested` arrival (born contested — still live, still vector-searchable).
 * Superseded LOSERS (winner "incumbent") and corroborations are deliberately
 * excluded: no new statement, so no re-embed (the embed action also skips any
 * row that already has a vector). */
function embedTargetIds(outcomes: Outcome[]): Id<"atoms">[] {
  const ids: Id<"atoms">[] = [];
  for (const o of outcomes) {
    if (o.type === "created") ids.push(o.atomId);
    else if (o.type === "contested") ids.push(o.atomId);
    else if (o.type === "superseded" && o.winner === "new") ids.push(o.atomId);
  }
  return ids;
}

/** Atoms relevant to facility minting from a batch's outcomes: any live
 * atom touched or created whose predicate is facility-shaped (spec §3.3). */
async function collectFacilityAtoms(
  ctx: MutationCtx,
  outcomes: Outcome[],
): Promise<Doc<"atoms">[]> {
  const ids = new Set<Id<"atoms">>();
  for (const o of outcomes) {
    if (o.type === "created" || o.type === "corroborated") ids.add(o.atomId);
    if (o.type === "superseded" && o.winner === "new") ids.add(o.atomId);
  }
  const atoms: Doc<"atoms">[] = [];
  for (const id of ids) {
    const atom = await ctx.db.get(id);
    if (
      atom &&
      atom.status === "active" &&
      FACILITY_SHAPED_PREDICATES.has(atom.predicate)
    ) {
      atoms.push(atom);
    }
  }
  return atoms;
}

// ── createAtomsBatch — the single write path for candidate atoms ──

export const createAtomsBatch = internalMutation({
  args: { candidates: v.array(candidateValidator) },
  handler: async (ctx, args) => {
    if (args.candidates.length > MAX_BATCH) {
      throw new Error(
        `batch_too_large: ${args.candidates.length} candidates (max ${MAX_BATCH}); chunk the batch`,
      );
    }
    const now = new Date().toISOString();

    const created: Array<{ index: number; atomId: Id<"atoms"> }> = [];
    const corroborated: Array<{
      index: number;
      atomId: Id<"atoms">;
      refreshed: boolean;
    }> = [];
    const superseded: Array<{
      index: number;
      atomId: Id<"atoms">;
      supersededAtomId: Id<"atoms">;
      winner: "new" | "incumbent";
    }> = [];
    const contested: Array<{
      index: number;
      atomId: Id<"atoms">;
      contestedWith: Id<"atoms">[];
    }> = [];
    const rejected: Array<{ index: number; statement: string; reason: string }> =
      [];
    const outcomes: Outcome[] = [];

    for (let i = 0; i < args.candidates.length; i++) {
      const cand = args.candidates[i] as Candidate;
      const reason = await validateCandidate(ctx, cand);
      if (reason !== null) {
        // Never throw for one bad atom — reject it and keep going.
        rejected.push({ index: i, statement: cand.statement, reason });
        continue;
      }
      const outcome = await processCandidate(ctx, cand, now);
      outcomes.push(outcome);
      switch (outcome.type) {
        case "created":
          created.push({ index: i, atomId: outcome.atomId });
          break;
        case "corroborated":
          corroborated.push({
            index: i,
            atomId: outcome.atomId,
            refreshed: outcome.refreshed,
          });
          break;
        case "superseded":
          superseded.push({
            index: i,
            atomId: outcome.atomId,
            supersededAtomId: outcome.supersededAtomId,
            winner: outcome.winner,
          });
          break;
        case "contested":
          contested.push({
            index: i,
            atomId: outcome.atomId,
            contestedWith: outcome.contestedWith,
          });
          break;
      }
    }

    // Deterministic facility minting (spec §3.3) — same transaction.
    const facilityAtoms = await collectFacilityAtoms(ctx, outcomes);
    const facilities =
      facilityAtoms.length > 0
        ? await mintFacilitiesForAtoms(ctx, facilityAtoms)
        : { minted: [], rebuilt: [], skipped: [] };

    // Embeddings write-path hook (Phase 2a.2): schedule Voyage embedding of the
    // new/value-changed atoms one scheduler hop later. Lane-disabled (no key)
    // → the action no-ops; failure here never blocks the write.
    const embedIds = embedTargetIds(outcomes);
    if (embedIds.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.knowledge.embeddings.embedAtoms,
        { atomIds: embedIds },
      );
    }

    return { created, corroborated, superseded, contested, rejected, facilities };
  },
});

// ── Operator / hygiene lane primitives ──

export const supersedeAtom = internalMutation({
  args: {
    atomId: v.id("atoms"),
    supersededBy: v.optional(v.id("atoms")),
    reason: v.optional(
      v.union(
        v.literal("revised"),
        v.literal("removed_from_source"),
        v.literal("document_trashed"),
        v.literal("operator"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const atom = await ctx.db.get(args.atomId);
    if (!atom) throw new Error("atom_not_found");
    await ctx.db.patch(args.atomId, {
      status: "superseded",
      supersededBy: args.supersededBy,
      supersessionReason: args.reason ?? "operator",
    });
    return { ok: true as const, atomId: args.atomId };
  },
});

export const retireAtom = internalMutation({
  args: { atomId: v.id("atoms") },
  handler: async (ctx, args) => {
    const atom = await ctx.db.get(args.atomId);
    if (!atom) throw new Error("atom_not_found");
    await ctx.db.patch(args.atomId, {
      status: "retired",
      supersessionReason: "operator",
    });
    return { ok: true as const, atomId: args.atomId };
  },
});

// ── resolveContested — operator adjudication of a contest (spec §7 layer 3) ──
//
// A contest keeps every competing value live (status "contested") with its
// provenance rather than silently picking one. The operator resolves it by
// naming the winner: the winner returns to "active"; every OTHER member of its
// contested identity group is archived as "superseded" (supersededBy = winner,
// reason "operator"). Nothing is deleted — the losing values keep their full
// observation trail (this is the operator-hygiene lane; no approvals row).

/** Two atoms share a canonical identity iff they agree on
 * (subjectType, subjectId, predicate, qualifier ?? null, object-kind) — and,
 * for EDGES, also the objectEntityId (an edge to a different object is a
 * different fact, never a contest). Mirrors findLiveAtomsByIdentity's rule. */
function atomsShareIdentity(a: Doc<"atoms">, ref: Doc<"atoms">): boolean {
  const refIsEdge = objectKind(ref) === "edge";
  return (
    a.subjectType === ref.subjectType &&
    a.subjectId === ref.subjectId &&
    a.predicate === ref.predicate &&
    (a.qualifier ?? null) === (ref.qualifier ?? null) &&
    objectKind(a) === objectKind(ref) &&
    (!refIsEdge || a.objectEntityId === ref.objectEntityId)
  );
}

export async function resolveContestedCore(
  ctx: MutationCtx,
  args: { winnerAtomId: Id<"atoms"> },
): Promise<{ resolved: Id<"atoms">; archived: number }> {
  const winner = await ctx.db.get(args.winnerAtomId);
  if (!winner) throw new Error("atom_not_found");
  if (winner.status !== "contested") {
    throw new Error(
      `not_contested: atom ${args.winnerAtomId} has status "${winner.status}", not "contested"`,
    );
  }

  // The contested identity group: contested atoms sharing the winner's
  // canonical identity (by_subject index, contested only, then identity filter).
  const contestedRows = await ctx.db
    .query("atoms")
    .withIndex("by_subject", (q) =>
      q
        .eq("subjectType", winner.subjectType)
        .eq("subjectId", winner.subjectId)
        .eq("status", "contested"),
    )
    .collect();
  const group = contestedRows.filter((a) => atomsShareIdentity(a, winner));

  // Winner → active (clear any supersession pointer defensively).
  await ctx.db.patch(winner._id, {
    status: "active",
    supersededBy: undefined,
    supersessionReason: undefined,
  });

  // Every other group member → superseded by the winner, operator reason.
  let archived = 0;
  for (const member of group) {
    if (member._id === winner._id) continue;
    await ctx.db.patch(member._id, {
      status: "superseded",
      supersededBy: winner._id,
      supersessionReason: "operator",
    });
    archived++;
  }

  return { resolved: winner._id, archived };
}

export const resolveContested = internalMutation({
  args: { winnerAtomId: v.id("atoms") },
  handler: async (ctx, args) => resolveContestedCore(ctx, args),
});

// ── reatomizeDiff — same-lineage supersession (spec §7) ──
//
// Document D re-extracted at a new checksum. The prior revision's
// observations are superseded up front (spec: "new observations supersede
// D's old ones"); each candidate then flows through the shared resolution
// core, which — because the old revision's observations no longer count as
// live — lets a value D revised win cleanly when D was the sole source,
// while cross-document conflicts still resolve on the §7 layers. Prior
// atoms the new revision no longer asserts, and which no other live
// observation supports, close out as superseded/removed_from_source.

export const reatomizeDiff = internalMutation({
  args: {
    documentId: v.id("documents"),
    contentChecksum: v.string(),
    candidates: v.array(candidateValidator),
  },
  handler: async (ctx, args) => {
    if (args.candidates.length > MAX_BATCH) {
      throw new Error(
        `batch_too_large: ${args.candidates.length} candidates (max ${MAX_BATCH}); chunk the batch`,
      );
    }
    const now = new Date().toISOString();

    // 1. Supersede the prior revision's observations, grouped by atom.
    const priorObs = (
      await ctx.db
        .query("atomObservations")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect()
    ).filter(
      (o) => o.superseded !== true && o.contentChecksum !== args.contentChecksum,
    );
    const priorAtomIds = new Set<Id<"atoms">>();
    for (const obs of priorObs) {
      await ctx.db.patch(obs._id, { superseded: true });
      priorAtomIds.add(obs.atomId);
    }

    // 2. Run the new revision's candidates through the shared core, with
    //    this document/revision stamped on every observation.
    const outcomes: Outcome[] = [];
    const rejected: Array<{ index: number; statement: string; reason: string }> =
      [];
    for (let i = 0; i < args.candidates.length; i++) {
      const raw = args.candidates[i] as Candidate;
      const cand: Candidate = {
        ...raw,
        observation: {
          ...raw.observation,
          sourceType: "document",
          documentId: args.documentId,
          contentChecksum: args.contentChecksum,
        },
      };
      const reason = await validateCandidate(ctx, cand);
      if (reason !== null) {
        rejected.push({ index: i, statement: cand.statement, reason });
        continue;
      }
      outcomes.push(await processCandidate(ctx, cand, now));
    }

    // 3. Classify the prior revision's atoms.
    const keptIds = new Set<Id<"atoms">>();
    const changedIds = new Set<Id<"atoms">>();
    for (const o of outcomes) {
      if (o.type === "corroborated" && priorAtomIds.has(o.atomId)) {
        keptIds.add(o.atomId); // unchanged fact — identity preserved, no churn
      }
      if (o.type === "superseded" && priorAtomIds.has(o.supersededAtomId)) {
        changedIds.add(o.supersededAtomId);
      }
      if (o.type === "contested") {
        for (const id of o.contestedWith) {
          if (priorAtomIds.has(id)) changedIds.add(id);
        }
      }
    }

    // 4. Absent facts: prior atoms the new revision didn't re-assert.
    //    History survives — atoms are never hard-deleted (spec §7).
    const removed: Id<"atoms">[] = [];
    const keptByOtherSources: Id<"atoms">[] = [];
    for (const atomId of priorAtomIds) {
      if (keptIds.has(atomId) || changedIds.has(atomId)) continue;
      const atom = await ctx.db.get(atomId);
      if (!atom || (atom.status !== "active" && atom.status !== "contested")) {
        continue;
      }
      const remaining = await liveObservations(ctx, atomId);
      if (remaining.length === 0) {
        await ctx.db.patch(atomId, {
          status: "superseded",
          supersessionReason: "removed_from_source",
        });
        removed.push(atomId);
      } else {
        keptByOtherSources.push(atomId);
      }
    }

    // 5. Facility re-materialization for facility-shaped arrivals.
    const facilityAtoms = await collectFacilityAtoms(ctx, outcomes);
    const facilities =
      facilityAtoms.length > 0
        ? await mintFacilitiesForAtoms(ctx, facilityAtoms)
        : { minted: [], rebuilt: [], skipped: [] };

    // Embeddings write-path hook (Phase 2a.2) — same rule as createAtomsBatch:
    // embed the new/value-changed atoms this revision produced. Superseded
    // prior-revision rows keep their (now stale-context) embedding but are no
    // longer live, so retrieval's status filter excludes them.
    const embedIds = embedTargetIds(outcomes);
    if (embedIds.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.knowledge.embeddings.embedAtoms,
        { atomIds: embedIds },
      );
    }

    return {
      kept: [...keptIds],
      changed: [...changedIds],
      removed,
      keptByOtherSources,
      created: outcomes.flatMap((o) => (o.type === "created" ? [o.atomId] : [])),
      contested: outcomes.flatMap((o) =>
        o.type === "contested" ? [o.atomId] : [],
      ),
      rejected,
      facilities,
    };
  },
});

// ── upsertChunks — disposable narrative dual index (spec §3.4) ──

export const upsertChunks = internalMutation({
  args: {
    documentId: v.id("documents"),
    contentChecksum: v.string(),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    chunks: v.array(
      v.object({
        chunkIndex: v.number(),
        text: v.string(),
        tokenCount: v.optional(v.number()),
        locator: v.optional(
          v.object({
            page: v.optional(v.number()),
            sheet: v.optional(v.string()),
            section: v.optional(v.string()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.chunks.length > MAX_CHUNKS) {
      throw new Error(
        `too_many_chunks: ${args.chunks.length} (max ${MAX_CHUNKS}); chunk the call`,
      );
    }
    // Chunks are disposable derivatives of ONE revision: delete + recreate.
    const existing = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    for (const chunk of args.chunks) {
      await ctx.db.insert("documentChunks", {
        documentId: args.documentId,
        contentChecksum: args.contentChecksum,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        locator: chunk.locator,
        clientId: args.clientId,
        projectId: args.projectId,
        // embedding filled by the 2a.2 hook scheduled just below
      });
    }

    // Embeddings write-path hook (Phase 2a.2): the just-created chunks carry no
    // vectors — schedule Voyage embedding for this revision. Lane-disabled (no
    // key) → the action no-ops.
    if (args.chunks.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.knowledge.embeddings.embedChunks,
        { documentId: args.documentId, contentChecksum: args.contentChecksum },
      );
    }

    return { deleted: existing.length, inserted: args.chunks.length };
  },
});

// ── Read primitives (the MCP/tool surface arrives in 2a.4) ──

export const getAtomsForSubject = internalQuery({
  args: {
    subjectType: entityTypeValidator,
    subjectId: v.string(),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("contested"),
        v.literal("superseded"),
        v.literal("retired"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const atoms = args.status
      ? await ctx.db
          .query("atoms")
          .withIndex("by_subject", (q) =>
            q
              .eq("subjectType", args.subjectType)
              .eq("subjectId", args.subjectId)
              .eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("atoms")
          .withIndex("by_subject", (q) =>
            q.eq("subjectType", args.subjectType).eq("subjectId", args.subjectId),
          )
          .collect();
    const out = [];
    for (const atom of atoms) {
      const observations = await ctx.db
        .query("atomObservations")
        .withIndex("by_atom", (q) => q.eq("atomId", atom._id))
        .collect();
      out.push({
        ...atom,
        observationCount: observations.length,
        liveObservationCount: observations.filter((o) => o.superseded !== true)
          .length,
      });
    }
    return out;
  },
});

export const getAtomsByDocument = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const observations = await ctx.db
      .query("atomObservations")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    const byAtom = new Map<Id<"atoms">, Doc<"atomObservations">[]>();
    for (const obs of observations) {
      const list = byAtom.get(obs.atomId) ?? [];
      list.push(obs);
      byAtom.set(obs.atomId, list);
    }
    const out = [];
    for (const [atomId, obs] of byAtom) {
      const atom = await ctx.db.get(atomId);
      if (atom) out.push({ atom, observations: obs });
    }
    return out;
  },
});
