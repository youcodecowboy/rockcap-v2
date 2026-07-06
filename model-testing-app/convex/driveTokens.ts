import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthenticatedUserOrNull } from "./authHelpers";

// Google Drive integration: independent OAuth client from Gmail and
// Calendar (see docs / CLAUDE.md — dedicated client, dedicated tokens,
// dedicated disconnect). Unlike Gmail, Drive is NOT per-user: exactly ONE
// org-wide connection (app@rockcap.uk) mirrors into the app. The single
// googleDriveTokens row records which app user connected it.
//
// This module covers token management, connection status, root-folder
// configuration, and the internal sync-watermark plumbing. The changes
// poller, mirror tables, and file UI are later phases.

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

// ── Token refresh (module-level; Drive's own OAuth client) ───────
// The refreshed-token writer lives HERE in the tokens module rather than
// scattered into a send/sync file. Only fetch is needed, so this runs in
// the default Convex runtime (no "use node"), same as gmailInbound.ts.
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.DRIVE_CLIENT_ID;
  const clientSecret = process.env.DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("DRIVE_CLIENT_ID / DRIVE_CLIENT_SECRET not set");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ── Token CRUD (OAuth-issued tokens; not user-paste) ─────────

// Single org-wide connection. On reconnect we PATCH the existing row and
// PRESERVE the sync watermark + root folder so a reconnect never resets the
// mirror (this is the deliberate fix vs Gmail, which delete+recreates and
// wipes its watermark). If a DIFFERENT Google account connects, the watermark
// is reset (startPageToken is account-specific) but the root folder is kept.
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
    // Single row app-wide — find any existing connection, not just this user's.
    const existing = await ctx.db.query("googleDriveTokens").first();
    const now = new Date().toISOString();

    if (existing) {
      const sameAccount =
        existing.connectedEmail?.toLowerCase() ===
        args.connectedEmail.toLowerCase();
      await ctx.db.patch(existing._id, {
        userId: user._id,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        scope: args.scope,
        connectedEmail: args.connectedEmail,
        connectedAt: now,
        needsReconnect: false,
        // Preserve the watermark only for the same Google account. A different
        // account has an unrelated startPageToken, so reset it (and lastSyncAt).
        // rootFolderId/rootFolderName are kept regardless — same folder path.
        ...(sameAccount
          ? {}
          : { startPageToken: undefined, lastSyncAt: undefined }),
      });
      return existing._id;
    }

    return ctx.db.insert("googleDriveTokens", {
      userId: user._id,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scope: args.scope,
      connectedEmail: args.connectedEmail,
      connectedAt: now,
    });
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthenticatedUser(ctx);
    // Single org-wide row.
    const existing = await ctx.db.query("googleDriveTokens").first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { disconnected: true };
  },
});

export const getConnectionStatus = query({
  args: {},
  handler: async (ctx) => {
    // Always-on UI query (settings): can fire before Clerk's token reaches
    // Convex on a cold page load. A missing identity must render as "not
    // connected", not crash the page via useQuery.
    const user = await getAuthenticatedUserOrNull(ctx);
    if (!user) {
      return { connected: false } as const;
    }
    // Org-wide single connection — return it regardless of which user connected.
    const row = await ctx.db.query("googleDriveTokens").first();
    if (!row) {
      return { connected: false } as const;
    }
    return {
      connected: true,
      connectedEmail: row.connectedEmail,
      connectedAt: row.connectedAt,
      lastSyncAt: row.lastSyncAt,
      needsReconnect: row.needsReconnect === true,
      scope: row.scope,
      rootFolderId: row.rootFolderId,
      rootFolderName: row.rootFolderName,
    } as const;
  },
});

// ── Internal plumbing (changes poller — later phase) ─────────

// Full token row for the sync worker. Single org-wide row, so no args.
export const getForSyncInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("googleDriveTokens").first();
    if (!row) return null;
    return {
      _id: row._id,
      userId: row.userId,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt: row.expiresAt,
      connectedEmail: row.connectedEmail,
      startPageToken: row.startPageToken,
      rootFolderId: row.rootFolderId,
      rootFolderName: row.rootFolderName,
      needsReconnect: row.needsReconnect === true,
    };
  },
});

// Flag the connection as needing re-consent (refresh token revoked/expired).
export const flagNeedsReconnect = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("googleDriveTokens").first();
    if (!row) return;
    await ctx.db.patch(row._id, { needsReconnect: true });
  },
});

// Advance the changes.list watermark after a successful poll.
export const updateSyncWatermark = internalMutation({
  args: { startPageToken: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleDriveTokens").first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      startPageToken: args.startPageToken,
      lastSyncAt: new Date().toISOString(),
    });
  },
});

// Persist a refreshed access token. Lives in the tokens module (not a
// send/sync file) so all writes to the token row are in one place.
export const writeRefreshedToken = internalMutation({
  args: { accessToken: v.string(), expiresAt: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleDriveTokens").first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
    });
  },
});

// Store the validated root folder. Internal — only the validation action
// (which verifies the folder exists and is a folder) may set it.
export const setRootFolderInternal = internalMutation({
  args: { rootFolderId: v.string(), rootFolderName: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleDriveTokens").first();
    if (!row) throw new Error("No Drive connection found");
    await ctx.db.patch(row._id, {
      rootFolderId: args.rootFolderId,
      rootFolderName: args.rootFolderName,
    });
  },
});

// ── Root-folder validation (public action) ───────────────────
//
// The operator pastes the ROCKCAP Historic Drive folder URL/ID; the page
// parses the id and calls this action. We verify the id server-side against
// Drive's files.get (folder must exist and be a folder), refreshing the
// access token first if it is within 60s of expiry, then persist it.
export const validateAndSetRootFolder = action({
  args: { folderId: v.string() },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    rootFolderId?: string;
    rootFolderName?: string;
    error?: string;
  }> => {
    // Gate on an authenticated caller.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const token = await ctx.runQuery(internal.driveTokens.getForSyncInternal, {});
    if (!token) {
      return { ok: false, error: "Connect Google Drive before setting a root folder." };
    }
    if (token.needsReconnect) {
      return { ok: false, error: "Reconnect Google Drive before setting a root folder." };
    }

    // Refresh the access token if it is within 60s of expiry.
    let accessToken = token.accessToken;
    const expiresMs = Date.parse(token.expiresAt);
    if (!Number.isNaN(expiresMs) && expiresMs - Date.now() < 60_000) {
      try {
        const refreshed = await refreshAccessToken(token.refreshToken);
        accessToken = refreshed.access_token;
        await ctx.runMutation(internal.driveTokens.writeRefreshedToken, {
          accessToken: refreshed.access_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        });
      } catch (err) {
        await ctx.runMutation(internal.driveTokens.flagNeedsReconnect, {});
        return {
          ok: false,
          error: "Drive token could not be refreshed. Reconnect and try again.",
        };
      }
    }

    const folderId = args.folderId.trim();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404) {
        return { ok: false, error: "No folder found for that ID. Check the link and that app@rockcap.uk can access it." };
      }
      return { ok: false, error: `Drive lookup failed (${res.status}). ${text}`.trim() };
    }
    const data = await res.json();
    if (data.mimeType !== "application/vnd.google-apps.folder") {
      return { ok: false, error: "That ID is a file, not a folder. Paste the folder link." };
    }

    await ctx.runMutation(internal.driveTokens.setRootFolderInternal, {
      rootFolderId: data.id,
      rootFolderName: data.name,
    });
    return { ok: true, rootFolderId: data.id, rootFolderName: data.name };
  },
});
