import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Resolve the set of HubSpot companies linked to this client.
 * Shared helper — keeps the three public queries below consistent.
 */
async function companiesForClient(ctx: QueryCtx, clientId: Id<"clients">) {
  return await ctx.db
    .query("companies")
    .withIndex("by_promoted", (q) => q.eq("promotedToClientId", clientId))
    .collect();
}

/**
 * List activities for a client, resolved via the companies promoted to this client.
 * Sorted by activityDate descending.
 *
 * IMPORTANT: uses the `by_company` index to scan only activities belonging to the
 * linked companies, not a full-table scan. The activities table holds email HTML
 * bodies and can exceed the 16 MB per-function read limit otherwise.
 */
export const listForClient = query({
  args: {
    clientId: v.id("clients"),
    typeFilter: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const companies = await companiesForClient(ctx, args.clientId);
    if (companies.length === 0) return [];

    // Per-company indexed scan — bounded by how many activities each company has.
    const perCompany = await Promise.all(
      companies.map((c) =>
        ctx.db
          .query("activities")
          .withIndex("by_company", (q) => q.eq("companyId", c._id))
          .collect(),
      ),
    );
    const all = perCompany.flat();

    const filtered = all
      .filter((a) => (args.typeFilter ? a.activityType === args.typeFilter : true))
      .sort((a, b) => (b.activityDate ?? "").localeCompare(a.activityDate ?? ""));

    return args.limit ? filtered.slice(0, args.limit) : filtered;
  },
});

/**
 * Count activities for a client (used for tab-badge display).
 * Same per-company indexed scan as `listForClient`; length of the merged result.
 */
export const countForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const companies = await companiesForClient(ctx, args.clientId);
    if (companies.length === 0) return 0;

    const perCompany = await Promise.all(
      companies.map((c) =>
        ctx.db
          .query("activities")
          .withIndex("by_company", (q) => q.eq("companyId", c._id))
          .collect(),
      ),
    );
    return perCompany.reduce((sum, arr) => sum + arr.length, 0);
  },
});

/**
 * Most recent N activities for a client (Overview hero card — default 2).
 * Per-company indexed scan, merge, sort by date desc, slice.
 */
export const listRecentForClient = query({
  args: { clientId: v.id("clients"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 2;
    const companies = await companiesForClient(ctx, args.clientId);
    if (companies.length === 0) return [];

    const perCompany = await Promise.all(
      companies.map((c) =>
        ctx.db
          .query("activities")
          .withIndex("by_company", (q) => q.eq("companyId", c._id))
          .collect(),
      ),
    );
    return perCompany
      .flat()
      .sort((a, b) => (b.activityDate ?? "").localeCompare(a.activityDate ?? ""))
      .slice(0, n);
  },
});
