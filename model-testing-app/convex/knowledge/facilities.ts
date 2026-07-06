import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { FACILITY_SHAPED_PREDICATES } from "./vocabulary";

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

type MintResult = {
  minted: Id<"facilities">[];
  rebuilt: Id<"facilities">[];
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

function normalizeTranche(qualifier: string | undefined): string | undefined {
  const t = qualifier?.trim().toLowerCase();
  return t === "" ? undefined : t;
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

/** Active atoms carrying `predicate` that belong to this facility: subject
 * IS the facility, or scoped to its project with a matching tranche
 * qualifier. */
async function facilityAtomsForPredicate(
  ctx: MutationCtx,
  facility: Doc<"facilities">,
  predicate: string,
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
  ).filter((a) => a.predicate === predicate);

  const byPredicate = (
    await ctx.db
      .query("atoms")
      .withIndex("by_predicate", (q) =>
        q.eq("predicate", predicate).eq("status", "active"),
      )
      .collect()
  ).filter(
    (a) =>
      a.projectId === facility.projectId &&
      (normalizeTranche(a.qualifier) ?? null) === (facility.tranche ?? null) &&
      a.subjectType !== "facility", // already covered above
  );

  return [...bySubject, ...byPredicate];
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

  const amount = pickWinner(
    await facilityAtomsForPredicate(ctx, facility, "has_loan_amount"),
  );
  const amountValue = amount && numericValue(amount.objectLiteral?.value);
  if (amountValue !== null && amountValue !== undefined) {
    patch.amountGBP = amountValue;
  }

  const rate = pickWinner(
    await facilityAtomsForPredicate(ctx, facility, "has_interest_rate"),
  );
  const rateValue = rate && numericValue(rate.objectLiteral?.value);
  if (rateValue !== null && rateValue !== undefined) {
    patch.interestRate = rateValue;
  }

  const maturity = pickWinner(
    await facilityAtomsForPredicate(ctx, facility, "matures_on"),
  );
  if (maturity?.objectLiteral?.value !== undefined) {
    patch.maturityDate = String(maturity.objectLiteral.value);
  }

  const security = pickWinner(
    await facilityAtomsForPredicate(ctx, facility, "granted_security_over"),
  );
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

  for (const atom of atoms) {
    if (!FACILITY_SHAPED_PREDICATES.has(atom.predicate)) continue;
    const tranche = normalizeTranche(atom.qualifier);

    // Subject is already a facility → straight re-materialization.
    if (atom.subjectType === "facility") {
      const facilityId = ctx.db.normalizeId("facilities", atom.subjectId);
      if (facilityId && (await ctx.db.get(facilityId))) {
        toRebuild.add(facilityId);
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
        continue;
      }

      const dedupeKey = `${projectId}:${lenderKey}:${tranche ?? "single"}`;
      const existing = await ctx.db
        .query("facilities")
        .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
        .unique();
      if (existing) {
        toRebuild.add(existing._id);
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
        result.minted.push(facilityId);
        toRebuild.add(facilityId);
        if (lenderClientId) {
          // Native edge write-back (spec §3.3): idempotent, sessionless.
          await ctx.scheduler.runAfter(0, api.projects.addLenderRole, {
            projectId,
            clientId: lenderClientId,
          });
        }
      }
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
    if (!result.minted.includes(facilityId)) {
      result.rebuilt.push(facilityId);
    }
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
