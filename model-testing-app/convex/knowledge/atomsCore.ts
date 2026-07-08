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

// ── repointCandidateAtoms — Phase 2b candidate resolution (spec §3.5) ──
//
// A candidate resolved to a real entity: re-point every atom that references
// the candidate (subject OR object side) to the resolved entity, THROUGH the
// identity machinery — after re-pointing, an atom may share canonical
// identity with an existing live atom (the fact was already known against
// the real entity). In that case MERGE: move the re-pointed atom's
// observations to the survivor (same-source duplicates land superseded, no
// bump), bump corroboration per independent moved observation, and supersede
// the duplicate pointing at the survivor. The schema's supersessionReason
// union has no dedicated merge value, so the machine merge records "revised"
// (the closest existing reason; "operator" would misattribute an automated
// action). Identity clash with a DIFFERENT literal value → both rows go
// contested, exactly like a §7 layer-3 conflict.
//
// Non-live (superseded / retired) candidate atoms are re-pointed too — the
// history stays coherent — but never merged (they're already out of the
// live graph). Statements are left untouched: they name the mention, which
// remains what the source said.
//
// Finally the candidate row itself becomes the tombstone: status "resolved"
// + resolvedToType/resolvedToId, so re-extraction of the same mention
// resolves instantly via createCandidate's reuse path.

const resolvedEntityTypeValidator = v.union(
  v.literal("client"),
  v.literal("project"),
  v.literal("contact"),
  v.literal("company"),
  v.literal("facility"),
);

/** Re-point every atom referencing (fromType, fromId) — subject side AND
 * object side, ALL statuses — to (toType, toId), routing each LIVE atom
 * through the identity machinery. After re-pointing, an atom may share
 * canonical identity with an existing live atom against the target:
 *   • same value → MERGE — move the re-pointed atom's observations to the
 *     pre-existing survivor (same-source dupes land superseded with no bump,
 *     independent ones corroboration-bump), then supersede the duplicate;
 *   • different value → CONTEST — both rows go "contested" (a §7 layer-3
 *     conflict surfaced by the re-point). Never a silent double.
 * Non-live (superseded / retired) atoms are re-pointed for history coherence
 * but never merged. Statements are left untouched — they record what the
 * source said. Merges record supersessionReason "revised" (the union has no
 * dedicated merge value; "operator" would misattribute an automated dedup).
 *
 * Shared by candidate resolution (repointCandidateAtoms, fromType
 * "candidate") and duplicate-entity merge (mergeEntities, fromType ===
 * toType). */
async function repointAndMergeAtoms(
  ctx: MutationCtx,
  fromType: EntityType,
  fromId: string,
  toType: EntityType,
  toId: string,
  now: string,
): Promise<{ repointed: number; merged: number; contested: number }> {
  // Referencing atoms — subject side + object side, ALL statuses (index
  // prefix without the status component). An atom could reference the source
  // on both sides; dedupe by id.
  const subjectSide = await ctx.db
    .query("atoms")
    .withIndex("by_subject", (q) =>
      q.eq("subjectType", fromType).eq("subjectId", fromId),
    )
    .collect();
  const objectSide = await ctx.db
    .query("atoms")
    .withIndex("by_object", (q) =>
      q.eq("objectEntityType", fromType).eq("objectEntityId", fromId),
    )
    .collect();
  const byId = new Map<Id<"atoms">, Doc<"atoms">>();
  for (const a of [...subjectSide, ...objectSide]) byId.set(a._id, a);

  let repointed = 0;
  let merged = 0;
  let contested = 0;

  for (const atom of byId.values()) {
    // 1. Re-point the source reference(s) to the target entity.
    const patch: Partial<Doc<"atoms">> = {};
    if (atom.subjectType === fromType && atom.subjectId === fromId) {
      patch.subjectType = toType;
      patch.subjectId = toId;
    }
    if (atom.objectEntityType === fromType && atom.objectEntityId === fromId) {
      patch.objectEntityType = toType;
      patch.objectEntityId = toId;
    }
    await ctx.db.patch(atom._id, patch);
    repointed++;

    // 2. Only LIVE atoms participate in identity merging.
    if (atom.status !== "active" && atom.status !== "contested") continue;

    const updated = (await ctx.db.get(atom._id))!;
    const liveSameSubject = await ctx.db
      .query("atoms")
      .withIndex("by_subject", (q) =>
        q
          .eq("subjectType", updated.subjectType)
          .eq("subjectId", updated.subjectId),
      )
      .collect();
    const dupes = liveSameSubject.filter(
      (a) =>
        a._id !== updated._id &&
        (a.status === "active" || a.status === "contested") &&
        atomsShareIdentity(a, updated),
    );
    if (dupes.length === 0) continue;

    const sameValue = dupes.find((d) => valuesEqual(d, updated));
    if (sameValue) {
      // ── MERGE: the fact was already known against the target entity. ──
      // Survivor = the pre-existing atom; move the re-pointed atom's
      // observations across, corroboration-bump per independent live
      // observation, supersede the duplicate.
      const survivor = sameValue;
      const survivorObs = await liveObservations(ctx, survivor._id);
      const movingObs = await ctx.db
        .query("atomObservations")
        .withIndex("by_atom", (q) => q.eq("atomId", updated._id))
        .collect();
      let confidence = survivor.confidence;
      for (const obs of movingObs) {
        const isLiveObs = obs.superseded !== true;
        const sameSource = isLiveObs
          ? findSameSourceObservation(survivorObs, {
              sourceType: obs.sourceType,
              documentId: obs.documentId,
              externalRef: obs.externalRef,
              authorityTier: obs.authorityTier,
            })
          : undefined;
        await ctx.db.patch(obs._id, {
          atomId: survivor._id,
          ...(sameSource ? { superseded: true } : {}),
        });
        if (isLiveObs && !sameSource) {
          confidence = Math.min(CONFIDENCE_CAP, confidence + CORROBORATION_BUMP);
        }
      }
      await ctx.db.patch(survivor._id, { confidence, observedAt: now });
      await ctx.db.patch(updated._id, {
        status: "superseded",
        supersededBy: survivor._id,
        supersessionReason: "revised",
      });
      merged++;
      console.log(
        `[repointAndMergeAtoms] merged atom ${updated._id} into ${survivor._id} (${fromType}:${fromId} → ${toType}:${toId})`,
      );
    } else {
      // Identity clash, different value → a genuine §7 layer-3 conflict
      // surfaced by the re-point. Both sides go contested; retrieval returns
      // the contest instead of silently picking one.
      await ctx.db.patch(updated._id, { status: "contested" });
      for (const d of dupes) {
        if (d.status !== "contested") {
          await ctx.db.patch(d._id, { status: "contested" });
        }
      }
      contested++;
      console.log(
        `[repointAndMergeAtoms] contest: atom ${updated._id} vs ${dupes.map((d) => d._id).join(",")} after re-point (${fromType}:${fromId} → ${toType}:${toId})`,
      );
    }
  }

  return { repointed, merged, contested };
}

/** repointCandidateAtoms' body as a plain function so mergeEntities can reuse
 * the candidate-resolution path without a mutation→mutation call. */
async function repointCandidateAtomsCore(
  ctx: MutationCtx,
  candidateId: Id<"entityCandidates">,
  toType: EntityType,
  toId: string,
): Promise<{
  repointed: number;
  merged: number;
  contested: number;
  candidateId: Id<"entityCandidates">;
}> {
  const candidate = await ctx.db.get(candidateId);
  if (!candidate) throw new Error("candidate_not_found");
  if (!(await entityExists(ctx, toType, toId))) {
    throw new Error(
      `target_not_found: no ${ENTITY_TABLES[toType]} row for "${toId}"`,
    );
  }

  const now = new Date().toISOString();
  const { repointed, merged, contested } = await repointAndMergeAtoms(
    ctx,
    "candidate",
    String(candidateId),
    toType,
    toId,
    now,
  );

  // Tombstone the candidate — createCandidate's reuse path returns the real
  // entity directly from here on.
  await ctx.db.patch(candidateId, {
    status: "resolved",
    resolvedToType: toType,
    resolvedToId: toId,
  });

  console.log(
    `[repointCandidateAtoms] candidate ${String(candidateId)} resolved → ${toType}:${toId}; repointed=${repointed} merged=${merged} contested=${contested}`,
  );
  return { repointed, merged, contested, candidateId };
}

export const repointCandidateAtoms = internalMutation({
  args: {
    candidateId: v.id("entityCandidates"),
    toType: resolvedEntityTypeValidator,
    toId: v.string(),
  },
  handler: async (ctx, args) =>
    repointCandidateAtomsCore(ctx, args.candidateId, args.toType, args.toId),
});

// ── mergeEntities — operator hygiene: collapse a DUPLICATE existing entity ──
//
// Twin clients ("Kinspire" created twice via HubSpot/promotion), "(175)"-
// suffixed duplicate contacts, a company synced under two CH rows: the
// knowledge graph had no merge path for these — atoms, facilities and scope
// tags pile up against BOTH ids. This re-points every knowledge-side
// reference from `fromId` to `toId` (same entityType) and routes each atom
// through the SAME identity machinery Phase 2b uses, so duplicates MERGE
// (observations move, corroboration bumps) or CONTEST on a value clash —
// never doubling a fact.
//
// It is the atom-graph twin of migrations/mergeDuplicateClients.ts, which
// owns the CRM-table side (contacts/documents/tasks/… clientId reassignment +
// client soft-delete) and is ATOM-BLIND. This tool is the mirror image: it is
// CRM-BLIND — it never touches CRM tables and never deletes/soft-deletes the
// `from` entity row. Run the CRM merge (for clients) or remove the duplicate
// row as a separate step; keeping the source row makes the collapse
// inspectable.
//
// Denormalized knowledge-side refs the subject/object re-point does NOT catch
// are re-scoped too: atoms.clientId/projectId (owning scope), the facilities
// mirror columns (lender/borrower/company/project — rebuildable, kept
// coherent), documentChunks scope tags, and appetiteSignals.lenderClientId
// (lender-intel, which the CRM merge is also blind to).
//
// entityType "candidate" delegates to the candidate-resolution path
// (repointCandidateAtomsCore): a candidate resolves to a REAL entity, so
// `toType` (the resolved entity's type) is required.

export const mergeEntities = internalMutation({
  args: {
    entityType: entityTypeValidator,
    fromId: v.string(),
    toId: v.string(),
    reason: v.string(),
    // Required ONLY when entityType === "candidate": the resolved entity's type.
    toType: v.optional(resolvedEntityTypeValidator),
  },
  handler: async (ctx, args) => {
    const { entityType, fromId, toId, reason } = args;
    const now = new Date().toISOString();

    const emptyScope = {
      atomsRescoped: 0,
      chunksRescoped: 0,
      facilitiesRescoped: 0,
      appetiteRescoped: 0,
    };

    const writeAudit = (
      counts: { repointed: number; merged: number; contested: number },
      scope: typeof emptyScope,
    ) =>
      ctx.db.insert("auditLog", {
        tableName: "atoms",
        recordId: toId,
        action: "update" as const,
        metadata: {
          operation: "mergeEntities",
          entityType,
          fromId,
          toId,
          reason,
          counts,
          scope,
        },
        timestamp: now,
      });

    // ── candidate → delegate to the candidate-resolution path ──
    if (entityType === "candidate") {
      if (!args.toType) {
        throw new Error(
          "candidate_needs_toType: merging a candidate RESOLVES it to a real entity — pass toType (client|project|contact|company|facility)",
        );
      }
      const candId = ctx.db.normalizeId("entityCandidates", fromId);
      if (!candId) throw new Error(`candidate_not_found: "${fromId}"`);
      const r = await repointCandidateAtomsCore(ctx, candId, args.toType, toId);
      const counts = {
        repointed: r.repointed,
        merged: r.merged,
        contested: r.contested,
      };
      await writeAudit(counts, emptyScope);
      return { entityType, fromId, toId, ...counts, scope: emptyScope };
    }

    // ── Guard rails (real entity types) ──
    if (fromId === toId) {
      throw new Error("same_entity: fromId and toId are identical");
    }
    if (!(await entityExists(ctx, entityType, fromId))) {
      throw new Error(
        `from_not_found: no ${ENTITY_TABLES[entityType]} row for "${fromId}"`,
      );
    }
    if (!(await entityExists(ctx, entityType, toId))) {
      throw new Error(
        `to_not_found: no ${ENTITY_TABLES[entityType]} row for "${toId}"`,
      );
    }

    // 1. Atom subject/object references → identity machinery.
    const counts = await repointAndMergeAtoms(
      ctx,
      entityType,
      fromId,
      entityType,
      toId,
      now,
    );

    // 2. Denormalized knowledge-side scope / mirror refs the re-point missed.
    const scope = { ...emptyScope };
    if (entityType === "client") {
      const from = fromId as Id<"clients">;
      const to = toId as Id<"clients">;
      const scopedAtoms = await ctx.db
        .query("atoms")
        .withIndex("by_client_status", (q) => q.eq("clientId", from))
        .collect();
      for (const a of scopedAtoms) {
        await ctx.db.patch(a._id, { clientId: to });
        scope.atomsRescoped++;
      }
      const chunks = await ctx.db
        .query("documentChunks")
        .withIndex("by_client", (q) => q.eq("clientId", from))
        .collect();
      for (const c of chunks) {
        await ctx.db.patch(c._id, { clientId: to });
        scope.chunksRescoped++;
      }
      const lenderFacs = await ctx.db
        .query("facilities")
        .withIndex("by_lender", (q) => q.eq("lenderClientId", from))
        .collect();
      for (const f of lenderFacs) {
        await ctx.db.patch(f._id, { lenderClientId: to });
        scope.facilitiesRescoped++;
      }
      const borrowerFacs = await ctx.db
        .query("facilities")
        .withIndex("by_borrower", (q) => q.eq("borrowerClientId", from))
        .collect();
      for (const f of borrowerFacs) {
        await ctx.db.patch(f._id, { borrowerClientId: to });
        scope.facilitiesRescoped++;
      }
      const appetite = await ctx.db
        .query("appetiteSignals")
        .withIndex("by_lender", (q) => q.eq("lenderClientId", from))
        .collect();
      for (const s of appetite) {
        await ctx.db.patch(s._id, { lenderClientId: to });
        scope.appetiteRescoped++;
      }
    } else if (entityType === "project") {
      const from = fromId as Id<"projects">;
      const to = toId as Id<"projects">;
      const scopedAtoms = await ctx.db
        .query("atoms")
        .withIndex("by_project", (q) => q.eq("projectId", from))
        .collect();
      for (const a of scopedAtoms) {
        await ctx.db.patch(a._id, { projectId: to });
        scope.atomsRescoped++;
      }
      const chunks = await ctx.db
        .query("documentChunks")
        .withIndex("by_project", (q) => q.eq("projectId", from))
        .collect();
      for (const c of chunks) {
        await ctx.db.patch(c._id, { projectId: to });
        scope.chunksRescoped++;
      }
      const facs = await ctx.db
        .query("facilities")
        .withIndex("by_project", (q) => q.eq("projectId", from))
        .collect();
      for (const f of facs) {
        await ctx.db.patch(f._id, { projectId: to });
        scope.facilitiesRescoped++;
      }
    } else if (entityType === "company") {
      const from = fromId as Id<"companiesHouseCompanies">;
      const to = toId as Id<"companiesHouseCompanies">;
      const facs = await ctx.db
        .query("facilities")
        .withIndex("by_lender_company", (q) => q.eq("lenderCompanyId", from))
        .collect();
      for (const f of facs) {
        await ctx.db.patch(f._id, { lenderCompanyId: to });
        scope.facilitiesRescoped++;
      }
    }
    // contact / facility: atoms are the only knowledge-side references.

    await writeAudit(counts, scope);
    console.log(
      `[mergeEntities] ${entityType} ${fromId} → ${toId}: repointed=${counts.repointed} merged=${counts.merged} contested=${counts.contested} ` +
        `atomsRescoped=${scope.atomsRescoped} chunksRescoped=${scope.chunksRescoped} facilitiesRescoped=${scope.facilitiesRescoped} appetiteRescoped=${scope.appetiteRescoped}`,
    );
    return { entityType, fromId, toId, ...counts, scope };
  },
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
