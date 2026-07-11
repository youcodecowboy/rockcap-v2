import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { FACILITY_MINT_PREDICATES, FACILITY_SHAPED_PREDICATES } from "./vocabulary";

// Facilities minting — Spec 2 §3.3 (docs/spec-2-knowledge-layer.md).
//
// A loan facility (lender × borrower × project × tranche × terms) is the
// single most connection-bearing object in the domain. Minting is
// DETERMINISTIC, no LLM judgment: when facility-shaped predicates arrive
// (`lends_to`, `has_loan_amount`, `has_interest_rate`, `matures_on`,
// `granted_security_over` — the spec's `secured_by` shorthand), the
// pipeline upserts by dedupeKey and re-materializes columns from active
// atoms. Columns are mirrors of winning atoms, rebuildable at any time.
//
// Facility creation with an onboarded lender also fires the already-
// idempotent `projects.addLenderRole` (native edge write-back, spec §2.3).
// Mutations can't call mutations directly in Convex, so it fires via
// `ctx.scheduler.runAfter(0, …)` — transactionally enqueued, and the
// target mutation is sessionless + idempotent, so replays are no-ops.
// `clientRoles` remains what the UI/skills read for "who's on this deal";
// `facilities` is what the graph traverses for terms and cross-client
// lender queries.

/** Identity of a minted/rebuilt facility, returned through createBatch so
 * the atomizing agent can map "my Downing senior quote" → facilityId and
 * anchor the quote's economics (has_loan_amount / has_interest_rate /
 * matures_on / has_loan_term_months / has_guarantee) to subjectType
 * "facility" in a follow-up batch — never to the project, where rival
 * lenders' numbers contest each other (2026-07 Donnington pilot). */
export type FacilityRef = {
  facilityId: Id<"facilities">;
  projectId: Id<"projects">;
  lenderClientId?: Id<"clients">;
  lenderCompanyId?: Id<"companiesHouseCompanies">;
  tranche?: string;
};

type MintResult = {
  minted: FacilityRef[];
  rebuilt: FacilityRef[];
  skipped: Array<{ atomId: Id<"atoms">; reason: string }>;
};

/** Local numeric parse (kept local — atomsCore imports this module, so
 * importing back from atomsCore would create a cycle). */
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

// ── Tranche enum (2026-07 lender-DB hardening) ──
// `qualifier` is free text on the atom — agents put variant descriptors there
// ("indicative terms 2026-07-02", "0.75% fee variant"), which the previous
// lowercase-only normalizer turned into DISTINCT dedupeKeys, minting one
// facility per quote revision (Allica Bank: 8 rows on one project). The
// tranche axis of a facility's identity is a CLOSED enum — senior / mezzanine
// / bridge / equity — so anything that is not one of those (with two accepted
// spelling aliases) collapses to `undefined`, and the dedupeKey falls back to
// `"single"`. Successive quote revisions on the same project+lender now hit
// ONE facility row.
const TRANCHE_ENUM = new Set(["senior", "mezzanine", "bridge", "equity"]);

export function normalizeTranche(qualifier: string | undefined): string | undefined {
  let t = qualifier?.trim().toLowerCase();
  if (!t) return undefined;
  if (t === "mezz") t = "mezzanine";
  else if (t === "bridging") t = "bridge";
  return TRANCHE_ENUM.has(t) ? t : undefined;
}

// ── Facility lifecycle status (2026-07) ──
// Stamped at mint/attach time from the triggering atom's source document.
// Rank encodes the lifecycle order so status is NEVER DOWNGRADED: once a
// facility is "live" (an executed agreement was seen), a later indicative doc
// (a fresh term sheet / quote) must not reset it to "indicative".
const FACILITY_STATUS_RANK: Record<string, number> = {
  indicative: 1,
  live: 2,
  repaid: 3,
  defaulted: 3,
};

function facilityStatusRank(status: string | undefined): number {
  return status ? (FACILITY_STATUS_RANK[status] ?? 0) : 0;
}

/** Map a source-document descriptor (fileTypeDetected / fileName) to a
 * facility lifecycle status. Case-insensitive. Executed-agreement phrases are
 * checked FIRST so "facility agreement" resolves to "live" rather than being
 * mistaken for an indicative "facility letter"-style doc. Unknown → undefined
 * (leave the column unset). */
export function statusFromDocDescriptor(
  descriptor: string,
): "indicative" | "live" | undefined {
  const d = descriptor.toLowerCase();
  if (/facility agreement|loan agreement|facility letter|completion/.test(d)) {
    return "live";
  }
  if (
    /term sheet|heads of terms|\bhots?\b|\bdip\b|decision in principle|agreement in principle|indicative|\bquote\b/.test(
      d,
    )
  ) {
    return "indicative";
  }
  return undefined;
}

/** Resolve the lifecycle status implied by the atom that triggered a
 * mint/attach: find a document-sourced observation, read the document's
 * detected type + filename, and map it. Returns undefined when there is no
 * document source or the descriptor is unrecognised. */
async function statusFromAtom(
  ctx: MutationCtx,
  atom: Doc<"atoms">,
): Promise<"indicative" | "live" | undefined> {
  const observations = await ctx.db
    .query("atomObservations")
    .withIndex("by_atom", (q) => q.eq("atomId", atom._id))
    .collect();
  const docObs = observations.find((o) => o.documentId);
  if (!docObs?.documentId) return undefined;
  const doc = await ctx.db.get(docObs.documentId);
  if (!doc) return undefined;
  return statusFromDocDescriptor(
    `${doc.fileTypeDetected ?? ""} ${doc.fileName ?? ""}`,
  );
}

/** Apply a proposed status to a facility, honouring the never-downgrade rule.
 * No-op when the proposal is undefined or ranks no higher than the current
 * value. */
async function applyFacilityStatus(
  ctx: MutationCtx,
  facilityId: Id<"facilities">,
  proposed: "indicative" | "live" | undefined,
): Promise<void> {
  if (!proposed) return;
  const facility = await ctx.db.get(facilityId);
  if (!facility) return;
  if (facilityStatusRank(proposed) > facilityStatusRank(facility.status)) {
    await ctx.db.patch(facilityId, { status: proposed });
  }
}

/** dedupeKey for a facility under the CURRENT normalized-tranche scheme. The
 * stored `tranche` is re-normalized so a row minted before the enum change
 * (free-text tranche) recomputes to its enum/`single` bucket. Returns both the
 * normalized tranche and the key so callers can patch the row coherently. */
export function recomputeFacilityDedupeKey(
  facility: Pick<
    Doc<"facilities">,
    "projectId" | "lenderClientId" | "lenderCompanyId" | "tranche"
  >,
): { tranche: string | undefined; dedupeKey: string } {
  const tranche = normalizeTranche(facility.tranche);
  const lenderKey = facility.lenderClientId ?? facility.lenderCompanyId;
  return {
    tranche,
    dedupeKey: `${facility.projectId}:${lenderKey}:${tranche ?? "single"}`,
  };
}

const FACILITY_MIRROR_COLUMNS = [
  "lenderClientId",
  "lenderCompanyId",
  "borrowerClientId",
  "amountGBP",
  "interestRate",
  "maturityDate",
  "securitySummary",
] as const;

/** Complete the collapse of a duplicate/fragment facility into `toId`: repoint
 * any atoms still pointing at the from-row (a no-op when the caller already ran
 * the atom-identity repoint — e.g. mergeEntities step 1), fill missing mirror
 * columns on the target, take the higher-ranked status (never downgrade),
 * recompute the target's dedupeKey under the enum scheme, DELETE the from-row,
 * and rematerialize the target from active atoms. Idempotent: a missing
 * from/to row short-circuits. */
export async function mergeFacilityInto(
  ctx: MutationCtx,
  fromId: Id<"facilities">,
  toId: Id<"facilities">,
  opts?: { skipRematerialize?: boolean },
): Promise<void> {
  if (fromId === toId) return;
  const from = await ctx.db.get(fromId);
  const to = await ctx.db.get(toId);
  if (!from || !to) return;

  // Repoint any atoms whose subject/object is still the from-facility. When
  // invoked from mergeEntities (after repointAndMergeAtoms) these queries are
  // empty; when invoked directly (auditFragmentation) they do the repoint.
  const subjectAtoms = await ctx.db
    .query("atoms")
    .withIndex("by_subject", (q) =>
      q.eq("subjectType", "facility").eq("subjectId", fromId as string),
    )
    .collect();
  for (const a of subjectAtoms) {
    await ctx.db.patch(a._id, { subjectId: toId as string });
  }
  const objectAtoms = await ctx.db
    .query("atoms")
    .withIndex("by_object", (q) =>
      q.eq("objectEntityType", "facility").eq("objectEntityId", fromId as string),
    )
    .collect();
  for (const a of objectAtoms) {
    await ctx.db.patch(a._id, { objectEntityId: toId as string });
  }

  const patch: Partial<Doc<"facilities">> = {};
  for (const col of FACILITY_MIRROR_COLUMNS) {
    if (to[col] === undefined && from[col] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[col] = from[col];
    }
  }
  if (facilityStatusRank(from.status) > facilityStatusRank(to.status)) {
    patch.status = from.status;
  }
  const merged = { ...to, ...patch };
  const { tranche, dedupeKey } = recomputeFacilityDedupeKey(merged);
  patch.tranche = tranche;
  patch.dedupeKey = dedupeKey;

  await ctx.db.patch(toId, patch);
  await ctx.db.delete(fromId);
  if (!opts?.skipRematerialize) {
    await rematerializeFacility(ctx, toId);
  }
}

/** Winning atom for a materialized column: highest confidence, then most
 * recently observed. (Authority already shaped atom lifecycle upstream —
 * only ACTIVE atoms reach this point.) */
function pickWinner(atoms: Doc<"atoms">[]): Doc<"atoms"> | undefined {
  return [...atoms].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.observedAt.localeCompare(a.observedAt),
  )[0];
}

/** All active atoms that belong to this facility: subject IS the facility,
 * or owned by its project with a matching tranche qualifier. Loaded ONCE per
 * rebuild and shared by every materialized column.
 *
 * BYTE-READ LIMIT (2026-07 live wave): the previous implementation ran a
 * per-predicate `.withIndex("by_predicate")` collect — every active
 * `has_loan_amount` / `has_interest_rate` / … atom in the ENTIRE database
 * (all clients, all projects), filtered to the project in JS, four times per
 * facility. An 11-atom financing createBatch rebuilding a handful of
 * facilities blew Convex's per-transaction byte-read cap (the agent had to
 * resubmit in 4-atom chunks). Both reads are now index-bounded to the
 * facility itself (`by_subject`) and its own project (`by_project`), so the
 * read volume scales with one project's atoms, not the corpus — a 100-atom
 * batch stays within the transaction budget. */
async function loadFacilityAtoms(
  ctx: MutationCtx,
  facility: Doc<"facilities">,
): Promise<Doc<"atoms">[]> {
  const bySubject = (
    await ctx.db
      .query("atoms")
      .withIndex("by_subject", (q) =>
        q
          .eq("subjectType", "facility")
          .eq("subjectId", facility._id as string)
          .eq("status", "active"),
      )
      .collect()
  ).filter((a) => FACILITY_SHAPED_PREDICATES.has(a.predicate));

  // Cross-lender guard (2026-07 Donnington pilot): the byProject lane lets a
  // SINGLE-lender project anchor terms at project scope. When several
  // facilities share this (project, tranche) — a live lender run with
  // competing quotes — project-anchored numbers are ambiguous between
  // lenders, and materializing them would bleed one lender's amount onto
  // every rival's facility row. Facility-subject atoms only, in that case.
  const siblingCount = (
    await ctx.db
      .query("facilities")
      .withIndex("by_project", (q) => q.eq("projectId", facility.projectId))
      .collect()
  ).filter((f) => (f.tranche ?? null) === (facility.tranche ?? null)).length;
  if (siblingCount > 1) return bySubject;

  const byProject = (
    await ctx.db
      .query("atoms")
      .withIndex("by_project", (q) => q.eq("projectId", facility.projectId))
      .collect()
  ).filter(
    (a) =>
      a.status === "active" &&
      FACILITY_SHAPED_PREDICATES.has(a.predicate) &&
      (normalizeTranche(a.qualifier) ?? null) === (facility.tranche ?? null) &&
      a.subjectType !== "facility", // already covered above
  );

  return [...bySubject, ...byProject];
}

/** Re-materialize a facility's term columns from active atoms (spec §3.3:
 * mirrors of winning atoms, rebuildable at any time). Columns without a
 * winning atom keep their current value — operator-entered facilities are
 * never blanked by an atomizer pass. */
export async function rematerializeFacility(
  ctx: MutationCtx,
  facilityId: Id<"facilities">,
): Promise<void> {
  const facility = await ctx.db.get(facilityId);
  if (!facility) return;

  const patch: Partial<Doc<"facilities">> = {
    lastRebuiltAt: new Date().toISOString(),
  };

  const atoms = await loadFacilityAtoms(ctx, facility);
  const forPredicate = (predicate: string) =>
    atoms.filter((a) => a.predicate === predicate);

  const amount = pickWinner(forPredicate("has_loan_amount"));
  const amountValue = amount && numericValue(amount.objectLiteral?.value);
  if (amountValue !== null && amountValue !== undefined) {
    patch.amountGBP = amountValue;
  }

  const rate = pickWinner(forPredicate("has_interest_rate"));
  const rateValue = rate && numericValue(rate.objectLiteral?.value);
  if (rateValue !== null && rateValue !== undefined) {
    patch.interestRate = rateValue;
  }

  const maturity = pickWinner(forPredicate("matures_on"));
  if (maturity?.objectLiteral?.value !== undefined) {
    patch.maturityDate = String(maturity.objectLiteral.value);
  }

  const security = pickWinner(forPredicate("granted_security_over"));
  if (security) {
    patch.securitySummary = security.statement;
  }

  await ctx.db.patch(facilityId, patch);
}

/**
 * Deterministic facility upsert from a batch of facility-shaped ACTIVE
 * atoms. Called in-transaction by atomsCore.createAtomsBatch /
 * reatomizeDiff after inserts; also exposed as the `mintFromAtoms`
 * internalMutation below for hygiene / rebuild use.
 *
 * Resolution per atom:
 * - subject IS a facility → re-materialize that facility.
 * - `lends_to` → lender from the subject (client → lenderClientId,
 *   company → lenderCompanyId), project from atom scope; upsert by
 *   dedupeKey `${projectId}:${lenderKey}:${tranche ?? "single"}`.
 * - attribute atoms (loan amount / rate / maturity / security) → attach to
 *   the project's unambiguous facility for that tranche; if none or
 *   ambiguous, skip — they materialize when the `lends_to` edge arrives.
 */
export async function mintFacilitiesForAtoms(
  ctx: MutationCtx,
  atoms: Doc<"atoms">[],
): Promise<MintResult> {
  const result: MintResult = { minted: [], rebuilt: [], skipped: [] };
  const toRebuild = new Set<Id<"facilities">>();

  // Highest-ranked lifecycle status proposed by any triggering atom, per
  // facility. Resolved from each atom's source document (see statusFromAtom)
  // and applied AFTER the rebuild loop, honouring never-downgrade.
  const statusProposals = new Map<Id<"facilities">, "indicative" | "live">();
  const proposeStatus = async (
    facilityId: Id<"facilities">,
    atom: Doc<"atoms">,
  ) => {
    const proposed = await statusFromAtom(ctx, atom);
    if (!proposed) return;
    const prev = statusProposals.get(facilityId);
    if (!prev || facilityStatusRank(proposed) > facilityStatusRank(prev)) {
      statusProposals.set(facilityId, proposed);
    }
  };

  const mintedIds = new Set<Id<"facilities">>();

  /** Shared quote-edge upsert: `lends_to` (project from atom scope) and
   * `funds_project` (project IS the object) both resolve to the same
   * (project, lender, tranche) facility identity. */
  const upsertQuoteFacility = async (
    atom: Doc<"atoms">,
    projectId: Id<"projects">,
    tranche: string | undefined,
  ) => {
    let lenderClientId: Id<"clients"> | undefined;
    let lenderCompanyId: Id<"companiesHouseCompanies"> | undefined;
    if (atom.subjectType === "client") {
      lenderClientId = ctx.db.normalizeId("clients", atom.subjectId) ?? undefined;
    } else if (atom.subjectType === "company") {
      lenderCompanyId =
        ctx.db.normalizeId("companiesHouseCompanies", atom.subjectId) ?? undefined;
    }
    const lenderKey = lenderClientId ?? lenderCompanyId;
    if (!lenderKey) {
      result.skipped.push({
        atomId: atom._id,
        reason: "lender_not_client_or_company",
      });
      return;
    }

    const dedupeKey = `${projectId}:${lenderKey}:${tranche ?? "single"}`;
    const existing = await ctx.db
      .query("facilities")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (existing) {
      toRebuild.add(existing._id);
      await proposeStatus(existing._id, atom);
    } else {
      const facilityId = await ctx.db.insert("facilities", {
        projectId,
        lenderClientId,
        lenderCompanyId,
        borrowerClientId: atom.clientId, // owning scope = the borrower side
        tranche,
        dedupeKey,
        createdFrom: "atomizer",
        lastRebuiltAt: new Date().toISOString(),
      });
      mintedIds.add(facilityId);
      toRebuild.add(facilityId);
      await proposeStatus(facilityId, atom);
      if (lenderClientId) {
        // Native edge write-back (spec §3.3): idempotent, sessionless.
        // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
        await ctx.scheduler.runAfter(0, api.projects.addLenderRole, {
          projectId,
          clientId: lenderClientId,
        });
      }
    }
  };

  for (const atom of atoms) {
    if (!FACILITY_MINT_PREDICATES.has(atom.predicate)) continue;
    const tranche = normalizeTranche(atom.qualifier);

    // Subject is already a facility → straight re-materialization.
    if (atom.subjectType === "facility") {
      const facilityId = ctx.db.normalizeId("facilities", atom.subjectId);
      if (facilityId && (await ctx.db.get(facilityId))) {
        toRebuild.add(facilityId);
        await proposeStatus(facilityId, atom);
      } else {
        result.skipped.push({ atomId: atom._id, reason: "facility_subject_missing" });
      }
      continue;
    }

    if (atom.predicate === "lends_to") {
      const projectId = atom.projectId;
      if (!projectId) {
        result.skipped.push({ atomId: atom._id, reason: "no_project_scope" });
        continue;
      }
      await upsertQuoteFacility(atom, projectId, tranche);
      continue;
    }

    if (atom.predicate === "funds_project") {
      // 2026-07 Donnington pilot fix: indicative quotes are lender → PROJECT
      // edges (term sheets often never name the borrower SPV), so they mint
      // the same (project, lender, tranche) facility lends_to does — status
      // stamps from the source document class (term sheet → indicative).
      const projectId =
        atom.objectEntityType === "project" && atom.objectEntityId
          ? ctx.db.normalizeId("projects", atom.objectEntityId)
          : null;
      if (!projectId) {
        result.skipped.push({
          atomId: atom._id,
          reason: "funds_project_object_not_project",
        });
        continue;
      }
      await upsertQuoteFacility(atom, projectId, tranche);
      continue;
    }

    // Attribute atom → find the project's unambiguous facility for the tranche.
    const projectId = atom.projectId;
    if (!projectId) {
      result.skipped.push({ atomId: atom._id, reason: "no_project_scope" });
      continue;
    }
    const projectFacilities = await ctx.db
      .query("facilities")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const matching = projectFacilities.filter(
      (f) => (f.tranche ?? null) === (tranche ?? null),
    );
    if (matching.length === 1) {
      toRebuild.add(matching[0]._id);
      await proposeStatus(matching[0]._id, atom);
    } else {
      result.skipped.push({
        atomId: atom._id,
        reason:
          matching.length === 0
            ? "no_facility_yet_for_project_tranche"
            : "ambiguous_facility_for_project_tranche",
      });
    }
  }

  for (const facilityId of toRebuild) {
    await rematerializeFacility(ctx, facilityId);
    const row = await ctx.db.get(facilityId);
    if (!row) continue;
    const ref: FacilityRef = {
      facilityId,
      projectId: row.projectId,
      lenderClientId: row.lenderClientId ?? undefined,
      lenderCompanyId: row.lenderCompanyId ?? undefined,
      tranche: row.tranche ?? undefined,
    };
    if (mintedIds.has(facilityId)) result.minted.push(ref);
    else result.rebuilt.push(ref);
  }
  // Stamp lifecycle status after materialization (never-downgrade enforced in
  // applyFacilityStatus).
  for (const [facilityId, proposed] of statusProposals) {
    await applyFacilityStatus(ctx, facilityId, proposed);
  }
  return result;
}

// ── Internal mutation wrappers ──

export const mintFromAtoms = internalMutation({
  args: { atomIds: v.array(v.id("atoms")) },
  handler: async (ctx, args) => {
    const atoms: Doc<"atoms">[] = [];
    for (const id of args.atomIds) {
      const atom = await ctx.db.get(id);
      if (atom && atom.status === "active") atoms.push(atom);
    }
    return await mintFacilitiesForAtoms(ctx, atoms);
  },
});

export const rebuildFacility = internalMutation({
  args: { facilityId: v.id("facilities") },
  handler: async (ctx, args) => {
    await rematerializeFacility(ctx, args.facilityId);
    return { ok: true as const, facilityId: args.facilityId };
  },
});

/** Operator-hygiene wrapper over mergeFacilityInto — collapse a stray
 * facility row (e.g. one minted from a mis-qualified edge that has since
 * been retired) into its correct sibling. auditFragmentation only merges
 * within one (project, lender, tranche) cluster; this handles the
 * cross-tranche stray case.
 *   npx convex run knowledge/facilities:mergeInto \
 *     '{"fromFacilityId":"<stray>","toFacilityId":"<survivor>"}' */
export const mergeInto = internalMutation({
  args: {
    fromFacilityId: v.id("facilities"),
    toFacilityId: v.id("facilities"),
  },
  handler: async (ctx, args) => {
    await mergeFacilityInto(ctx, args.fromFacilityId, args.toFacilityId);
    return { ok: true as const, survivor: args.toFacilityId };
  },
});

// ── Fragmentation audit (2026-07 lender-DB hardening) ──
//
// Before the tranche-enum change, free-text `qualifier` descriptors minted a
// fresh facility per quote revision (Allica Bank: 8 rows on one project). This
// finds the fragments left behind: facilities that share projectId + lender +
// normalized tranche (i.e. the SAME identity under the enum scheme) but live
// in more than one row. Dry-run (default) reports the clusters and a suggested
// canonical row; `execute: true` collapses each fragment into the canonical
// via the same row-merge primitive `mergeEntities` uses (mergeFacilityInto),
// which fills mirrors, recomputes the dedupeKey, deletes the fragment, and
// rematerializes. Scope to one project with `projectId`, or audit the whole
// corpus. Groups with no resolvable lender key (external, unrostered) are
// EXCLUDED — without a lender identity two rows can't be confirmed duplicates.
export const auditFragmentation = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    // Chunking seam: rematerialize scans the project's atoms, so executing
    // many groups in one transaction can cross the 16MiB read cap. Scope an
    // execute run to one lender and invoke per lender.
    lenderClientId: v.optional(v.id("clients")),
    execute: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const execute = args.execute === true;
    let facilities = args.projectId
      ? await ctx.db
          .query("facilities")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("facilities").collect();
    if (args.lenderClientId) {
      facilities = facilities.filter(
        (f) => f.lenderClientId === args.lenderClientId,
      );
    }

    // Cluster key = projectId + lenderKey + normalized tranche. Rows sharing a
    // key are fragments of one facility; distinct enum tranches (senior vs
    // mezzanine) land in different keys and are left untouched.
    const groups = new Map<string, Doc<"facilities">[]>();
    for (const f of facilities) {
      const lenderKey = f.lenderClientId ?? f.lenderCompanyId;
      if (!lenderKey) continue; // external/unrostered — can't confirm duplicate
      const tranche = normalizeTranche(f.tranche) ?? "single";
      const key = `${f.projectId}::${lenderKey}::${tranche}`;
      const arr = groups.get(key) ?? [];
      arr.push(f);
      groups.set(key, arr);
    }

    const subjectAtomCount = async (id: Id<"facilities">): Promise<number> =>
      (
        await ctx.db
          .query("atoms")
          .withIndex("by_subject", (q) =>
            q.eq("subjectType", "facility").eq("subjectId", id as string),
          )
          .collect()
      ).length;
    const mirrorRichness = (f: Doc<"facilities">): number =>
      FACILITY_MIRROR_COLUMNS.filter((c) => f[c] !== undefined).length +
      (f.status ? 1 : 0);

    const fragmentGroups: Array<{
      projectId: Id<"projects">;
      lenderClientId?: Id<"clients">;
      lenderCompanyId?: Id<"companiesHouseCompanies">;
      tranche: string | null;
      canonicalId: Id<"facilities">;
      rows: Array<{
        id: Id<"facilities">;
        tranche: string | null;
        amountGBP: number | null;
        status: string | null;
        atomCount: number;
      }>;
    }> = [];
    let fragmentsMerged = 0;

    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      const enriched = [];
      for (const f of rows) {
        enriched.push({
          f,
          atoms: await subjectAtomCount(f._id),
          richness: mirrorRichness(f),
        });
      }
      // Canonical = most attached atoms, then richest mirrors, then oldest row.
      enriched.sort(
        (a, b) =>
          b.atoms - a.atoms ||
          b.richness - a.richness ||
          a.f._creationTime - b.f._creationTime,
      );
      const canonical = enriched[0];
      fragmentGroups.push({
        projectId: canonical.f.projectId,
        lenderClientId: canonical.f.lenderClientId,
        lenderCompanyId: canonical.f.lenderCompanyId,
        tranche: normalizeTranche(canonical.f.tranche) ?? null,
        canonicalId: canonical.f._id,
        rows: enriched.map((e) => ({
          id: e.f._id,
          tranche: e.f.tranche ?? null,
          amountGBP: e.f.amountGBP ?? null,
          status: e.f.status ?? null,
          atomCount: e.atoms,
        })),
      });
      if (execute) {
        // Rematerialize ONCE per group, not per fragment: rematerialize scans
        // the project's atoms (by_project), so per-fragment rebuilds of the
        // same canonical row multiply reads past the 16MiB transaction cap
        // when one project holds several fragmented groups.
        for (const frag of enriched.slice(1)) {
          await mergeFacilityInto(ctx, frag.f._id, canonical.f._id, {
            skipRematerialize: true,
          });
          fragmentsMerged++;
        }
        await rematerializeFacility(ctx, canonical.f._id);
      }
    }

    return {
      dryRun: !execute,
      groupsWithFragmentation: fragmentGroups.length,
      fragmentsMerged,
      fragmentGroups,
    };
  },
});

// ── Read side: the lender's observed book (2026-07 Lenders tab) ────────────
//
// Everything above is write-side (deterministic minting/merge). This is the
// one read query: a lender's full facility book with project/borrower names
// resolved, plus observed-behaviour stats. Average deal size is COMPUTED here
// at read time — never stored — so it updates itself with every ingestion
// wave. It prefers the executed book (live/repaid/defaulted) and falls back
// to all priced rows (incl. indicative quotes) when nothing has executed yet;
// `avgDealSizeBasis` says which basis was used so the UI can label
// "stated appetite vs observed behaviour" honestly.
export const listByLender = query({
  args: { lenderClientId: v.id("clients") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("facilities")
      .withIndex("by_lender", (q) => q.eq("lenderClientId", args.lenderClientId))
      .collect();

    const facilities = await Promise.all(
      rows.map(async (f) => {
        const project = await ctx.db.get(f.projectId);
        const borrower = f.borrowerClientId ? await ctx.db.get(f.borrowerClientId) : null;
        return {
          ...f,
          projectName: (project as Doc<"projects"> | null)?.name ?? "Unknown project",
          projectClientId: (project as Doc<"projects"> | null)?.clientId,
          borrowerName: (borrower as Doc<"clients"> | null)?.name,
        };
      }),
    );
    facilities.sort((a, b) => b.lastRebuiltAt.localeCompare(a.lastRebuiltAt));

    const priced = facilities.filter((f) => typeof f.amountGBP === "number");
    const executed = priced.filter(
      (f) => facilityStatusRank(f.status) >= FACILITY_STATUS_RANK.live,
    );
    const basisRows = executed.length > 0 ? executed : priced;
    const sum = (xs: typeof priced) =>
      xs.reduce((s, f) => s + (f.amountGBP as number), 0);

    return {
      facilities,
      stats: {
        total: facilities.length,
        live: facilities.filter((f) => f.status === "live").length,
        indicative: facilities.filter((f) => f.status === "indicative").length,
        distinctProjects: new Set(facilities.map((f) => f.projectId)).size,
        avgDealSizeGBP: basisRows.length > 0 ? sum(basisRows) / basisRows.length : null,
        avgDealSizeBasis: (executed.length > 0 ? "executed" : "all") as "executed" | "all",
        avgDealSizeSampleSize: basisRows.length,
        totalExecutedGBP: sum(executed),
      },
    };
  },
});

// ── Operator write: facility lifecycle status (2026-07-11, Lenders tab) ────
//
// The pipeline stamps status from document class and NEVER downgrades
// (applyFacilityStatus). The operator, however, may know better than the
// paper trail — a facility the docs say is live may have repaid, a stale
// indicative quote may be dead. This mutation is the operator override: any
// enum value, any direction, Clerk-authed. Later pipeline stamps still only
// upgrade, so an operator downgrade sticks until a genuinely newer executed
// document arrives. Status is NOT an atom mirror — rematerialize never
// touches it — so operator edits survive rebuilds.
const FACILITY_STATUS_VALUES = new Set(["indicative", "live", "repaid", "defaulted"]);

export const operatorSetStatus = mutation({
  args: {
    facilityId: v.id("facilities"),
    status: v.string(), // "indicative" | "live" | "repaid" | "defaulted"
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    if (!FACILITY_STATUS_VALUES.has(args.status)) {
      throw new Error(`invalid_status: ${args.status}`);
    }
    const facility = await ctx.db.get(args.facilityId);
    if (!facility) throw new Error("facility_not_found");
    await ctx.db.patch(args.facilityId, { status: args.status });
    return { ok: true as const, previous: facility.status ?? null, status: args.status };
  },
});

// MCP lane twins (bearer-token callers have no Clerk identity — the same
// pattern as appetiteSignals.recordInternal, commit 40d07700). The MCP
// handler authenticates before calling; bodies mirror the public mutations.
export const operatorSetStatusInternal = internalMutation({
  args: { facilityId: v.id("facilities"), status: v.string() },
  handler: async (ctx, args) => {
    if (!FACILITY_STATUS_VALUES.has(args.status)) {
      throw new Error(`invalid_status: ${args.status}`);
    }
    const facility = await ctx.db.get(args.facilityId);
    if (!facility) throw new Error("facility_not_found");
    await ctx.db.patch(args.facilityId, { status: args.status });
    return { ok: true as const, previous: facility.status ?? null, status: args.status };
  },
});

export const operatorCreateInternal = internalMutation({
  args: {
    lenderClientId: v.id("clients"),
    projectId: v.id("projects"),
    borrowerClientId: v.optional(v.id("clients")),
    tranche: v.optional(v.string()),
    amountGBP: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    maturityDate: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.status && !FACILITY_STATUS_VALUES.has(args.status)) {
      throw new Error(`invalid_status: ${args.status}`);
    }
    const tranche = normalizeTranche(args.tranche);
    const dedupeKey = `${args.projectId}:${args.lenderClientId}:${tranche ?? "single"}`;
    const existing = await ctx.db
      .query("facilities")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .first();
    if (existing) {
      return {
        ok: false as const,
        error: "facility_exists" as const,
        facilityId: existing._id,
        message: "A facility for this project + lender + tranche already exists — update it instead.",
      };
    }
    const facilityId = await ctx.db.insert("facilities", {
      projectId: args.projectId,
      lenderClientId: args.lenderClientId,
      borrowerClientId: args.borrowerClientId,
      tranche,
      amountGBP: args.amountGBP,
      interestRate: args.interestRate,
      maturityDate: args.maturityDate,
      status: args.status,
      dedupeKey,
      createdFrom: "operator",
      lastRebuiltAt: new Date().toISOString(),
    });
    return { ok: true as const, facilityId };
  },
});
