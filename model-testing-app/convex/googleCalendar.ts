import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

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

export const saveTokens = mutation({
  args: {
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.string(),
    scope: v.string(),
    connectedEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return ctx.db.insert("googleCalendarTokens", {
      userId: user._id,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scope: args.scope,
      connectedAt: new Date().toISOString(),
      connectedEmail: args.connectedEmail,
    });
  },
});

export const getTokens = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    return ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
  },
});

export const updateAccessToken = mutation({
  args: {
    accessToken: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (!tokens) throw new Error("No Google Calendar connection found");
    await ctx.db.patch(tokens._id, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
    });
  },
});

export const deleteTokens = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (tokens) {
      await ctx.db.delete(tokens._id);
    }
  },
});

// ── Channel CRUD ─────────────────────────────────────────────

export const saveChannel = mutation({
  args: {
    channelId: v.string(),
    resourceId: v.string(),
    expiration: v.string(),
    syncToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return ctx.db.insert("googleCalendarChannels", {
      userId: user._id,
      channelId: args.channelId,
      resourceId: args.resourceId,
      expiration: args.expiration,
      syncToken: args.syncToken,
    });
  },
});

export const getChannelByChannelId = query({
  args: { channelId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_channel", (q: any) => q.eq("channelId", args.channelId))
      .first();
  },
});

export const updateSyncToken = mutation({
  args: {
    channelId: v.string(),
    syncToken: v.string(),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_channel", (q: any) => q.eq("channelId", args.channelId))
      .first();
    if (!channel) throw new Error("Channel not found");
    await ctx.db.patch(channel._id, { syncToken: args.syncToken });
  },
});

export const deleteChannel = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (channel) {
      await ctx.db.delete(channel._id);
    }
  },
});

// ── Sync Status ──────────────────────────────────────────────

export const getSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (!tokens) {
      return { isConnected: false, connectedEmail: null, connectedAt: null };
    }
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    return {
      isConnected: true,
      connectedEmail: tokens.connectedEmail,
      connectedAt: tokens.connectedAt,
      channelExpiration: channel?.expiration ?? null,
    };
  },
});

// ── Internal: Token lookup by userId (for webhook — no user auth) ─

export const getTokensByUserId = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
  },
});

// ── Event Upsert (public — called by setup-sync with user auth) ─

export const syncGoogleEvent = mutation({
  args: {
    googleEventId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.optional(v.boolean()),
    status: v.optional(v.string()),
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      status: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("events")
      .withIndex("by_google_event_id", (q: any) => q.eq("googleEventId", args.googleEventId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        location: args.location,
        startTime: args.startTime,
        endTime: args.endTime,
        allDay: args.allDay ?? false,
        status: args.status || "confirmed",
        attendees: args.attendees,
        syncStatus: "synced",
        lastGoogleSync: now,
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("events", {
      title: args.title,
      description: args.description,
      location: args.location,
      startTime: args.startTime,
      endTime: args.endTime,
      allDay: args.allDay ?? false,
      status: args.status || "confirmed",
      attendees: args.attendees,
      googleEventId: args.googleEventId,
      syncStatus: "synced",
      lastGoogleSync: now,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Event Upsert (internal — called by webhook, no user auth) ─

export const upsertGoogleEvent = internalMutation({
  args: {
    userId: v.id("users"),
    googleEventId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.optional(v.boolean()),
    status: v.optional(v.string()),
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      status: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("events")
      .withIndex("by_google_event_id", (q: any) => q.eq("googleEventId", args.googleEventId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        location: args.location,
        startTime: args.startTime,
        endTime: args.endTime,
        allDay: args.allDay ?? false,
        status: args.status || "confirmed",
        attendees: args.attendees,
        syncStatus: "synced",
        lastGoogleSync: now,
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("events", {
      title: args.title,
      description: args.description,
      location: args.location,
      startTime: args.startTime,
      endTime: args.endTime,
      allDay: args.allDay ?? false,
      status: args.status || "confirmed",
      attendees: args.attendees,
      googleEventId: args.googleEventId,
      syncStatus: "synced",
      lastGoogleSync: now,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Delete synced event (cancelled on Google) ────────────────

export const deleteByGoogleEventId = mutation({
  args: { googleEventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_google_event_id", (q: any) => q.eq("googleEventId", args.googleEventId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// ── Disconnect ───────────────────────────────────────────────

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (tokens) await ctx.db.delete(tokens._id);
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (channel) await ctx.db.delete(channel._id);
    return { success: true };
  },
});
