import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

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

// ── Internal helpers used by the sync action ─────────────────
// These live behind internalQuery / internalMutation so the cron-driven
// action can read tokens, list connected users, and write meeting
// records without the per-user Clerk-auth path.

export const listConnectedUserIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("firefliesTokens").collect();
    return rows
      .filter((row: any) => row.needsReconnect !== true)
      .map((row: any) => ({
        userId: row.userId,
        lastSyncAt: row.lastSyncAt,
      }));
  },
});

export const getTokenForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("firefliesTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row || row.needsReconnect === true) return null;
    return {
      apiToken: row.apiToken,
      lastSyncAt: row.lastSyncAt,
      connectedEmail: row.connectedEmail,
    };
  },
});

export const getSyncConfigInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("firefliesSyncConfig")
      .withIndex("by_enabled")
      .first();
    if (!config) {
      return {
        isEnabled: false,
        defaultBackfillDays: 365,
        syncIntervalMinutes: 30,
      };
    }
    return {
      isEnabled: config.isEnabled,
      defaultBackfillDays: config.defaultBackfillDays ?? 365,
      syncIntervalMinutes: config.syncIntervalMinutes ?? 30,
    };
  },
});

// Upsert a meeting from a Fireflies record. Returns the meetingId
// (whether newly inserted or already existing). Idempotent on firefliesId.
export const upsertFirefliesMeeting = internalMutation({
  args: {
    firefliesId: v.string(),
    title: v.string(),
    meetingDate: v.string(),
    durationMs: v.optional(v.number()),
    attendees: v.array(v.object({
      name: v.string(),
      role: v.optional(v.string()),
      company: v.optional(v.string()),
    })),
    summary: v.string(),
    keyPoints: v.array(v.string()),
    decisions: v.array(v.string()),
    actionItems: v.array(v.object({
      id: v.string(),
      description: v.string(),
      assignee: v.optional(v.string()),
      dueDate: v.optional(v.string()),
    })),
    capturedByUserId: v.id("users"),
    // Optional context: if a Fireflies meeting can be tied to an existing
    // client/project (by participant email match), the caller resolves
    // that ID and passes it. Otherwise these stay undefined and the
    // meeting waits for manual attribution.
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("meetings")
      .withIndex("by_fireflies_id", (q: any) => q.eq("firefliesId", args.firefliesId))
      .first();

    const now = new Date().toISOString();
    const actionItemsWithMetadata = args.actionItems.map((item) => ({
      ...item,
      status: "pending" as const,
      createdAt: now,
    }));

    if (existing) {
      // Already synced. Patch fidelity flags but do not overwrite
      // operator edits to summary/keyPoints/decisions. Action items
      // need their own merge logic in a future hardening pass.
      await ctx.db.patch(existing._id, {
        transcriptFetchedAt: existing.transcriptFetchedAt,
        actionItemsSourceFidelity: "api_synced",
        sourceIntegration: "fireflies_api",
      });
      return existing._id;
    }

    // New meeting. The clientId is required by the existing meetings
    // schema; if attribution failed upstream, we cannot insert. Caller
    // should pass a "holding" client for unattributed meetings, or we
    // can defer by recording the work to do (out of scope for v1).
    if (!args.clientId) {
      throw new Error(
        "Fireflies meeting could not be attributed to a client. Manual attribution required.",
      );
    }

    return ctx.db.insert("meetings", {
      clientId: args.clientId,
      projectId: args.projectId,
      title: args.title,
      meetingDate: args.meetingDate,
      meetingType: "call",
      attendees: args.attendees,
      summary: args.summary,
      keyPoints: args.keyPoints,
      decisions: args.decisions,
      actionItems: actionItemsWithMetadata,
      verified: false,
      createdBy: args.capturedByUserId,
      createdAt: now,
      updatedAt: now,
      firefliesId: args.firefliesId,
      sourceIntegration: "fireflies_api",
      actionItemsSourceFidelity: "api_synced",
    });
  },
});

export const recordTranscript = internalMutation({
  args: {
    meetingId: v.id("meetings"),
    fileStorageId: v.optional(v.id("_storage")),
    speakerSegments: v.optional(v.array(v.object({
      speaker: v.string(),
      startMs: v.number(),
      endMs: v.number(),
      text: v.string(),
    }))),
    fullTextSummary: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    language: v.optional(v.string()),
    capturedByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Idempotent: do not duplicate a transcript for the same meeting.
    const existing = await ctx.db
      .query("meetingTranscripts")
      .withIndex("by_meeting", (q: any) => q.eq("meetingId", args.meetingId))
      .first();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        speakerSegments: args.speakerSegments ?? existing.speakerSegments,
        fullTextSummary: args.fullTextSummary ?? existing.fullTextSummary,
        durationMs: args.durationMs ?? existing.durationMs,
        language: args.language ?? existing.language,
        fetchedAt: now,
      });
      return existing._id;
    }
    const transcriptId = await ctx.db.insert("meetingTranscripts", {
      meetingId: args.meetingId,
      fileStorageId: args.fileStorageId,
      source: "fireflies",
      speakerSegments: args.speakerSegments,
      fullTextSummary: args.fullTextSummary,
      durationMs: args.durationMs,
      language: args.language,
      fetchedAt: now,
      createdBy: args.capturedByUserId,
    });
    // Stamp the meetings row so UI can show "transcript synced" without
    // a second query.
    await ctx.db.patch(args.meetingId, { transcriptFetchedAt: now });
    return transcriptId;
  },
});
