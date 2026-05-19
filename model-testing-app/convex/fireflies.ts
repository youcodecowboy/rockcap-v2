import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// Fireflies integration: per-user API token paste model (no OAuth).
// Per docs/INTEGRATIONS/fireflies-scoping.md confirmed decisions:
// - Auth: per-user API token paste
// - Scope: per-user (each user connects own Fireflies account)
// - Backfill: 365 days on first connection
// - Transcripts: full ingestion, stored in Convex file storage
//
// This module covers credential management only. The sync action,
// transcript fetcher, and Fireflies API client live in separate modules
// to be added in subsequent commits.

// ── Auth helper ──────────────────────────────────────────────
async function getAuthenticatedUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return user;
}

// ── Token CRUD ───────────────────────────────────────────────

export const connectToken = mutation({
  args: {
    apiToken: v.string(),
    connectedEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("firefliesTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return ctx.db.insert("firefliesTokens", {
      userId: user._id,
      apiToken: args.apiToken,
      connectedEmail: args.connectedEmail,
      connectedAt: new Date().toISOString(),
    });
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("firefliesTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { disconnected: true };
  },
});

export const getConnectionStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const row = await ctx.db
      .query("firefliesTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (!row) {
      return { connected: false } as const;
    }
    return {
      connected: true,
      connectedEmail: row.connectedEmail,
      connectedAt: row.connectedAt,
      lastSyncAt: row.lastSyncAt,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncError: row.lastSyncError,
      needsReconnect: row.needsReconnect === true,
    } as const;
  },
});

// ── Internal helpers used by sync action (to be added in BL-3.3) ─────

export const flagNeedsReconnect = internalMutation({
  args: { userId: v.id("users"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("firefliesTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      needsReconnect: true,
      lastSyncStatus: "error",
      lastSyncError: args.error,
    });
  },
});

export const recordSyncRun = internalMutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("success"), v.literal("error"), v.literal("in_progress")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("firefliesTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      lastSyncStatus: args.status,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: args.error,
    });
  },
});

// ── Global config (kill switch) ──────────────────────────────

export const getSyncConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("firefliesSyncConfig")
      .withIndex("by_enabled")
      .first();
    if (!config) {
      // Default: disabled, 365-day backfill, 30-minute sync interval.
      return {
        isEnabled: false,
        defaultBackfillDays: 365,
        syncIntervalMinutes: 30,
        exists: false,
      } as const;
    }
    return {
      isEnabled: config.isEnabled,
      defaultBackfillDays: config.defaultBackfillDays ?? 365,
      syncIntervalMinutes: config.syncIntervalMinutes ?? 30,
      updatedAt: config.updatedAt,
      exists: true,
    } as const;
  },
});

export const updateSyncConfig = mutation({
  args: {
    isEnabled: v.boolean(),
    defaultBackfillDays: v.optional(v.number()),
    syncIntervalMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("firefliesSyncConfig")
      .withIndex("by_enabled")
      .first();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        isEnabled: args.isEnabled,
        defaultBackfillDays: args.defaultBackfillDays ?? existing.defaultBackfillDays,
        syncIntervalMinutes: args.syncIntervalMinutes ?? existing.syncIntervalMinutes,
        updatedAt: now,
        updatedBy: user._id,
      });
      return existing._id;
    }
    return ctx.db.insert("firefliesSyncConfig", {
      isEnabled: args.isEnabled,
      defaultBackfillDays: args.defaultBackfillDays ?? 365,
      syncIntervalMinutes: args.syncIntervalMinutes ?? 30,
      updatedAt: now,
      updatedBy: user._id,
    });
  },
});
