import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// Gmail integration: separate OAuth client from Google Calendar per
// confirmed decision in docs/INTEGRATIONS/gmail-scoping.md.
// Scope: send + modify. Send is approval-gated by default (BL-4.4).
//
// This module covers token management and send-enable kill switch only.
// OAuth flow routes, send action, read sync, and Pub/Sub webhook live
// in separate modules to be added in subsequent commits.

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

// ── Token CRUD (OAuth-issued tokens; not user-paste) ─────────

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
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    // sendEnabled defaults off; operator must explicitly enable per-user
    // before any skill-originated send can leave the building (BL-4.4).
    return ctx.db.insert("googleGmailTokens", {
      userId: user._id,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scope: args.scope,
      connectedEmail: args.connectedEmail,
      connectedAt: new Date().toISOString(),
    });
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
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (!tokens) throw new Error("No Gmail connection found");
    await ctx.db.patch(tokens._id, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
    });
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("googleGmailTokens")
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
      .query("googleGmailTokens")
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
      sendEnabled: row.sendEnabled === true,
      needsReconnect: row.needsReconnect === true,
      scope: row.scope,
    } as const;
  },
});

// Internal helper used by the OAuth refresh flow.
export const flagNeedsReconnect = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, { needsReconnect: true });
  },
});

// ── Inbound sync plumbing (gmailInbound poller) ──────────────
//
// Full token row (incl. historyId watermark) for one user, used by the
// poller before it calls Gmail's history.list. Distinct from
// gmailSend.getTokenForSend, which omits historyId.
export const getForSyncInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row) return null;
    return {
      userId: row.userId,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt: row.expiresAt,
      connectedEmail: row.connectedEmail,
      historyId: row.historyId,
      needsReconnect: row.needsReconnect === true,
    };
  },
});

// All connected, healthy Gmail accounts — the poll set. Table is tiny
// (one row per user) so a full collect is fine.
export const listConnectedInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("googleGmailTokens").collect();
    return rows
      .filter((r) => r.needsReconnect !== true)
      .map((r) => ({ userId: r.userId, connectedEmail: r.connectedEmail }));
  },
});

// Resolve a connected account to its owning user by email — used by the
// Pub/Sub push path (gmailWatch) to find whose mailbox changed.
export const getUserIdByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("googleGmailTokens").collect();
    const match = rows.find(
      (r) => r.connectedEmail?.toLowerCase() === args.email.toLowerCase(),
    );
    return match ? match.userId : null;
  },
});

// Clear the needsReconnect flag. Used to recover a token that was flagged
// because refresh failed for an environmental reason (e.g. GMAIL_CLIENT_ID
// not set on the deployment) rather than a genuinely revoked refresh token —
// once the env is fixed, the existing refresh token should work again.
export const clearNeedsReconnectInternal = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row) return { ok: false, reason: "no_token" };
    await ctx.db.patch(row._id, { needsReconnect: false });
    return { ok: true };
  },
});

export const updateHistoryId = internalMutation({
  args: { userId: v.id("users"), historyId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      historyId: args.historyId,
      lastSyncAt: new Date().toISOString(),
    });
  },
});

// ── Send enable: per-user opt-in for outbound Gmail ──────────
//
// BL-4.4 rule: every skill-originated Gmail send routes through the
// Approval table. Even with approval, the per-user sendEnabled flag
// AND the global gmailSendConfig.isEnabled flag must both be true.
// This is the kill-switch layer.

export const setSendEnabledForUser = mutation({
  args: { userId: v.id("users"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    // TODO: add admin role check. Today any authenticated user could
    // flip this flag for any other user. v1 of the settings UI uses
    // setMySendEnabled below for self-service. Admin-driven enable for
    // another user goes through this mutation; an admin-role guard
    // should be added before it is exposed to the UI.
    await getAuthenticatedUser(ctx);
    const row = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row) throw new Error("Target user has no Gmail connection");
    await ctx.db.patch(row._id, { sendEnabled: args.enabled });
  },
});

// Self-service toggle: the current user opts their own account in or
// out of skill-originated outbound send. The global gmailSendConfig
// must also be on for any send to actually leave the building.
export const setMySendEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const row = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (!row) throw new Error("Connect Gmail before toggling send");
    await ctx.db.patch(row._id, { sendEnabled: args.enabled });
  },
});

export const getSendConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("gmailSendConfig")
      .withIndex("by_enabled")
      .first();
    if (!config) {
      return { isEnabled: false, exists: false } as const;
    }
    return {
      isEnabled: config.isEnabled,
      updatedAt: config.updatedAt,
      exists: true,
    } as const;
  },
});

export const updateSendConfig = mutation({
  args: { isEnabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("gmailSendConfig")
      .withIndex("by_enabled")
      .first();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        isEnabled: args.isEnabled,
        updatedAt: now,
        updatedBy: user._id,
      });
      return existing._id;
    }
    return ctx.db.insert("gmailSendConfig", {
      isEnabled: args.isEnabled,
      updatedAt: now,
      updatedBy: user._id,
    });
  },
});

// Auth-free admin helper to flip the global send kill switch from the
// CLI / Convex dashboard, which carry no Clerk identity (so the public
// updateSendConfig mutation's getAuthenticatedUser check can't be met
// there). Internal-only: not callable from the browser client.
export const setGlobalSendEnabled = internalMutation({
  args: { isEnabled: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("gmailSendConfig")
      .withIndex("by_enabled")
      .first();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        isEnabled: args.isEnabled,
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("gmailSendConfig", {
      isEnabled: args.isEnabled,
      updatedAt: now,
    });
  },
});

// Composite check used by the send wrapper (to be added in BL-4.2).
// Returns true only if BOTH the global config and the per-user flag are
// enabled AND the user has a valid (non-needsReconnect) connection.
export const isUserSendReady = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!tokens) return { ready: false, reason: "not_connected" } as const;
    if (tokens.needsReconnect === true) {
      return { ready: false, reason: "needs_reconnect" } as const;
    }
    if (tokens.sendEnabled !== true) {
      return { ready: false, reason: "user_send_disabled" } as const;
    }
    const config = await ctx.db
      .query("gmailSendConfig")
      .withIndex("by_enabled")
      .first();
    if (!config || config.isEnabled !== true) {
      return { ready: false, reason: "global_send_disabled" } as const;
    }
    return { ready: true } as const;
  },
});
