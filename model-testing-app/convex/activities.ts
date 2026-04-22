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

/**
 * Global recent activity feed — used by the /activity "pulse of the company"
 * page (Task F). Returns the most recent N activities across the whole org,
 * each hydrated with its linked company's name for display.
 *
 * IMPORTANT: uses indexed reads with `.take()` so we only materialize the
 * N rows we actually need. A full-table `.collect()` blows the 16MB
 * per-function read limit on the activities table (emails have bodyHtml
 * blobs that add up fast over 5k+ rows).
 *
 * - Default path: `by_activity_date` index, order desc, take N directly.
 * - typeFilter path: `by_activity_type` with eq(type), take N * 3
 *   (oversampled because this index orders by _creationTime within a type,
 *   not activityDate — we re-sort in memory and slice down to N).
 */
export const listRecentGlobal = query({
  args: {
    limit: v.optional(v.number()),
    typeFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    let rows: any[];
    if (args.typeFilter) {
      const typeFilter = args.typeFilter;
      rows = await ctx.db
        .query("activities")
        .withIndex("by_activity_type", (q) => q.eq("activityType", typeFilter))
        .order("desc")
        .take(limit * 3);
    } else {
      rows = await ctx.db
        .query("activities")
        .withIndex("by_activity_date")
        .order("desc")
        .take(limit);
    }

    // In-memory sort by activityDate (ISO strings compare lexicographically
    // for dates, so localeCompare-desc gives newest-first).
    rows.sort((a, b) =>
      (b.activityDate ?? "").localeCompare(a.activityDate ?? ""),
    );
    rows = rows.slice(0, limit);

    // Batch-fetch the linked companies so the UI can show the client/company
    // name for each row without N+1 queries from the client.
    const companyIds = Array.from(
      new Set(rows.map((r) => r.companyId).filter(Boolean) as any[]),
    );
    const companyMap = new Map<string, any>();
    await Promise.all(
      companyIds.map(async (cid) => {
        const c = await ctx.db.get(cid);
        if (c) companyMap.set(String(cid), c);
      }),
    );

    return rows.map((r) => {
      const company = r.companyId ? companyMap.get(String(r.companyId)) : null;
      return {
        ...r,
        companyName: company?.name ?? null,
        // Promoted client id if the linked company has been promoted — so
        // the UI can deep-link directly to the client profile instead of
        // the raw company page.
        clientId: company?.promotedToClientId ?? null,
      };
    });
  },
});

/**
 * Fetch a single activity by _id. Used by the mobile transcript detail
 * screen to load a Fireflies meeting-note's full body.
 *
 * Returns null if the id doesn't resolve (invalid id or doc deleted).
 */
export const getById = query({
  args: { id: v.id("activities") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
