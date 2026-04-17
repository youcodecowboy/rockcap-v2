import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * List activities for a client, resolved via the companies promoted to this client.
 * Sorted by activityDate descending.
 */
export const listForClient = query({
  args: {
    clientId: v.id("clients"),
    typeFilter: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const all = await ctx.db.query("activities").collect();
    const filtered = all
      .filter((a) => a.companyId && companyIds.has(a.companyId))
      .filter((a) => (args.typeFilter ? a.activityType === args.typeFilter : true))
      .sort((a, b) => (b.activityDate ?? "").localeCompare(a.activityDate ?? ""));
    return args.limit ? filtered.slice(0, args.limit) : filtered;
  },
});

/**
 * Count activities for a client (used for tab-badge display).
 */
export const countForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return 0;
    const companyIds = new Set(companies.map((c) => c._id));
    const all = await ctx.db.query("activities").collect();
    return all.filter((a) => a.companyId && companyIds.has(a.companyId)).length;
  },
});

/**
 * Most recent N activities for a client (Overview hero card — default 2).
 */
export const listRecentForClient = query({
  args: { clientId: v.id("clients"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 2;
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const all = await ctx.db.query("activities").collect();
    return all
      .filter((a) => a.companyId && companyIds.has(a.companyId))
      .sort((a, b) => (b.activityDate ?? "").localeCompare(a.activityDate ?? ""))
      .slice(0, n);
  },
});
