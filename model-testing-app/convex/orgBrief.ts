// Org-wide queries powering the Organization tab of the Daily Brief.
//
// These are read-only and deliberately unscoped from `userId` / `assignedTo`.
// There is currently no multi-tenancy in the schema, so "organization" simply
// means "all rows". If organizationId is introduced later, these queries are
// the single place that needs the filter added.
//
// All queries still require an authenticated Convex user — unauthenticated
// callers get an empty result so the mobile client behaves identically to
// the personal-scoped queries in that regard.

import { v } from "convex/values";
import { query } from "./_generated/server";

async function requireUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  return user ?? null;
}

// ----- Tasks --------------------------------------------------------------

// All active tasks across the organization, plus the last 24h of completed
// ones so the brief can build its "recap" section. Mirrors the superset that
// `tasks.getByUser` returns for a single user so the gateway's filter
// pipeline works unchanged.
export const getAllTasks = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return [];

    const tasks = await ctx.db.query("tasks").collect();

    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    return tasks
      .filter((t) => {
        // Keep everything except long-cancelled / long-completed items — those
        // would bloat the payload without adding brief value.
        if (t.status === "cancelled") return false;
        if (t.status === "completed") {
          // Only recently-completed (yesterday onward) for the activity recap.
          return t.updatedAt && t.updatedAt > yesterday;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? 0).getTime() -
          new Date(a.updatedAt ?? 0).getTime()
      );
  },
});

// Lightweight counts. Not strictly necessary — the client could derive these
// from getAllTasks — but mirroring tasks.getMetrics keeps the mobile code
// symmetric with the personal-tab path.
export const getTeamMetrics = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return { total: 0 };

    const tasks = await ctx.db.query("tasks").collect();
    const active = tasks.filter(
      (t) => t.status !== "completed" && t.status !== "cancelled"
    );

    return { total: active.length };
  },
});

// ----- Events -------------------------------------------------------------

// Events happening today across the whole team, regardless of organizer /
// attendee. The brief generator filters down to meetings; any event that
// overlaps today counts.
export const getTodayEvents = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return [];

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const startMs = start.getTime();
    const endMs = end.getTime();

    const events = await ctx.db.query("events").collect();

    return events
      .filter((e) => {
        if (e.status === "cancelled") return false;
        const s = new Date(e.startTime).getTime();
        const en = new Date(e.endTime).getTime();
        // Event overlaps today if it starts before end-of-day and ends after
        // start-of-day.
        return s <= endMs && en >= startMs;
      })
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
  },
});

// ----- Flags --------------------------------------------------------------

// All open flags across the team — used for "Open Flags" stat + attention
// section. The personal tab uses getMyFlags({ status: 'open' }) which only
// returns flags assigned TO the user; this sibling returns the full set.
export const getAllOpenFlags = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!user) return [];

    const limit = args.limit ?? 50;

    const flags = await ctx.db
      .query("flags")
      .withIndex("by_status", (q: any) => q.eq("status", "open"))
      .collect();

    return flags
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, limit);
  },
});
