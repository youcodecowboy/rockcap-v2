import { v } from "convex/values";
import { internalAction, internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Cap error strings at this length before write — guards against 1 MiB
// Convex document limit if a stack trace is huge, and keeps the log
// table scan-friendly.
const ERROR_TRUNCATE_AT = 500;

export const insertSyncLog = internalMutation({
  args: {
    userId: v.id("users"),
    ranAt: v.string(),
    trigger: v.union(
      v.literal("webhook"),
      v.literal("cron"),
      v.literal("manual"),
    ),
    status: v.union(
      v.literal("ok"),
      v.literal("error"),
      v.literal("skipped"),
    ),
    eventsSynced: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("googleCalendarSyncLog", {
      ...args,
      error: args.error ? args.error.slice(0, ERROR_TRUNCATE_AT) : undefined,
    });
  },
});

// Internal mutation used by the prune action. Deletes rows older than the
// given ISO cutoff. Uses the by_ran_at index for efficient range scan.
export const pruneOlderThan = internalMutation({
  args: { cutoff: v.string() },
  handler: async (ctx, args) => {
    const stale = await ctx.db
      .query("googleCalendarSyncLog")
      .withIndex("by_ran_at", (q: any) => q.lt("ranAt", args.cutoff))
      .collect();
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return { deleted: stale.length };
  },
});

// Tick-summary row written by autoSyncAll at the end of each cron tick.
// Distinguishable from per-user rows by absence of userId + presence of
// usersProcessed/userErrors. One row per tick gives operators quick
// top-level health without scanning all per-user rows.
export const insertTickSummaryLog = internalMutation({
  args: {
    ranAt: v.string(),
    usersProcessed: v.number(),
    userErrors: v.number(),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("googleCalendarSyncLog", {
      ranAt: args.ranAt,
      trigger: "cron" as const,
      status: args.userErrors > 0 ? ("error" as const) : ("ok" as const),
      usersProcessed: args.usersProcessed,
      userErrors: args.userErrors,
      durationMs: args.durationMs,
      error:
        args.userErrors > 0
          ? `${args.userErrors} of ${args.usersProcessed} user(s) errored this tick`
          : undefined,
    });
  },
});

// Public mutation the webhook route calls when it can't reach internal
// mutations — specifically the CONVEX_DEPLOY_KEY-missing branch, where
// the webhook uses an unauthenticated ConvexHttpClient. Gated on
// channelId existing in our DB; channelIds are 128-bit random UUIDs
// known only to Google + us, which gives weak-but-sufficient abuse
// protection without requiring a proper auth surface from a Next route
// that by definition can't hold a Convex auth token in this branch.
export const recordWebhookBootstrapError = mutation({
  args: {
    channelId: v.string(),
    ranAt: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_channel", (q: any) => q.eq("channelId", args.channelId))
      .first();
    if (!channel) return null; // silently drop unknown channelIds
    return ctx.db.insert("googleCalendarSyncLog", {
      userId: channel.userId,
      ranAt: args.ranAt,
      trigger: "webhook" as const,
      status: "error" as const,
      error: args.error.slice(0, ERROR_TRUNCATE_AT),
    });
  },
});

export const pruneSyncLog = internalAction({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    // Keep 14 days. Anything older goes.
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    // TS2589 ("Type instantiation is excessively deep") fires on this call
    // because TS resolves `internal.googleCalendarLog.pruneOlderThan` —
    // a FunctionReference drawn from the full generated api graph — while
    // simultaneously inferring this handler's return type. Other same-file
    // self-references in the repo (e.g. bulkBackgroundProcessor) avoid the
    // limit by chance of smaller surrounding type complexity. Suppressing
    // with `@ts-ignore` is a known, documented escape for this exact
    // Convex + TS interaction; runtime behavior is unaffected.
    const result: { deleted: number } = await ctx.runMutation(
      // @ts-ignore TS2589 — see comment above
      internal.googleCalendarLog.pruneOlderThan,
      { cutoff },
    );
    console.log(`[googleCalendarLog.pruneSyncLog] deleted ${result.deleted} rows older than ${cutoff}`);
    return result;
  },
});
