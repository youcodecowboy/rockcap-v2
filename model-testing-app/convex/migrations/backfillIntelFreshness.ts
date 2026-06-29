// One-off backfill + diagnostics for prospecting v3 intel freshness.
//
// `clients.lastFullIntelAt` was added in v3 and is only stamped on NEW
// prospect-intel completions (skillRuns.completeInternal). Prospects that were
// researched before v3 therefore read "Full intel: never" even though a
// completed run exists. backfillIntelFreshness walks the completed prospect-intel
// runs and stamps each linked client's lastFullIntelAt with its latest run time.
//
// Run once (idempotent — skips clients that already have lastFullIntelAt):
//   npx convex run migrations/backfillIntelFreshness:backfillIntelFreshness
//
// Diagnose the "intel but no outreach/cadence" backlog (read-only):
//   npx convex run migrations/backfillIntelFreshness:intelWithoutCadence

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

async function latestIntelByClient(ctx: any): Promise<Map<string, string>> {
  const complete = await ctx.db
    .query("skillRuns")
    .withIndex("by_skill_and_status", (q: any) =>
      q.eq("skillName", "prospect-intel").eq("status", "complete"),
    )
    .collect();
  const gappy = await ctx.db
    .query("skillRuns")
    .withIndex("by_skill_and_status", (q: any) =>
      q.eq("skillName", "prospect-intel").eq("status", "complete_with_gaps"),
    )
    .collect();
  const latest = new Map<string, string>();
  for (const r of [...complete, ...gappy]) {
    if (!r.linkedClientId) continue;
    const ts = r.completedAt ?? new Date(r._creationTime).toISOString();
    const cur = latest.get(String(r.linkedClientId));
    if (!cur || ts > cur) latest.set(String(r.linkedClientId), ts);
  }
  return latest;
}

export const backfillIntelFreshness = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const latest = await latestIntelByClient(ctx);
    let patched = 0;
    let skippedHasValue = 0;
    let missingClient = 0;
    for (const [clientId, ts] of latest) {
      const c = await ctx.db.get(clientId as Id<"clients">);
      if (!c) {
        missingClient++;
        continue;
      }
      if ((c as any).lastFullIntelAt) {
        skippedHasValue++;
        continue;
      }
      if (!args.dryRun) {
        await ctx.db.patch(clientId as Id<"clients">, { lastFullIntelAt: ts });
      }
      patched++;
    }
    return {
      dryRun: !!args.dryRun,
      clientsWithCompletedIntel: latest.size,
      patched,
      skippedHasValue,
      missingClient,
    };
  },
});

// Read-only: prospects that have completed intel but ZERO cadences — the
// "intel but no outreach" backlog from before the unified flow.
export const intelWithoutCadence = internalQuery({
  args: {},
  handler: async (ctx) => {
    const latest = await latestIntelByClient(ctx);
    const rows: { clientId: string; name: string; status: string; lastFullIntelAt: string }[] = [];
    for (const [clientId, ts] of latest) {
      const c = await ctx.db.get(clientId as Id<"clients">);
      if (!c) continue;
      if ((c as any).status !== "prospect") continue; // ignore graduated/active
      const cadences = await ctx.db
        .query("cadences")
        .withIndex("by_related_client", (q: any) => q.eq("relatedClientId", clientId as Id<"clients">))
        .collect();
      if (cadences.length === 0) {
        rows.push({
          clientId,
          name: (c as any).name ?? (c as any).companyName ?? "Unknown",
          status: (c as any).status,
          lastFullIntelAt: ts,
        });
      }
    }
    return { count: rows.length, prospects: rows };
  },
});
