import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthenticatedUserOrNull } from "./authHelpers";
import { resolveEmailToContactClient } from "./contacts";

// Google sends event status as a free string; the events schema declares a
// literal union. Anything unrecognised collapses to "confirmed".
function normalizeEventStatus(s?: string): "confirmed" | "tentative" | "cancelled" {
  return s === "tentative" || s === "cancelled" ? s : "confirmed";
}

// Attendee shape fix (2026-07-17). The sync callers pass {email, name,
// status} but the events schema declares {email?, name?, responseStatus?}
// with a literal union — writing `status` failed schema validation, so
// EVERY event with attendees was silently dropped by the per-event
// try/catch in syncForUser. Normalize into the schema shape here.
type SchemaAttendee = {
  email?: string;
  name?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
};
function normalizeAttendees(
  attendees?: Array<{ email: string; name?: string; status?: string }>,
): SchemaAttendee[] | undefined {
  if (!attendees) return undefined;
  return attendees.map((a) => ({
    email: a.email || undefined,
    name: a.name,
    responseStatus:
      a.status === "needsAction" ||
      a.status === "declined" ||
      a.status === "tentative" ||
      a.status === "accepted"
        ? a.status
        : undefined,
  }));
}

// Prospect attribution (2026-07-17): match external attendees against the
// contacts book. Operators (any email on the users table) are excluded, so
// internal-only meetings never link. Returns every matched contact plus the
// primary client (first attendee that resolves to one) — the signal that
// makes a calendar event COUNT for a prospect in KPIs and on the profile.
async function matchAttendees(
  ctx: any,
  attendees: SchemaAttendee[] | undefined,
): Promise<{ contactIds: any[]; clientId: any | undefined }> {
  const contactIds: any[] = [];
  let clientId: any | undefined;
  if (!attendees || attendees.length === 0) return { contactIds, clientId };
  const users = await ctx.db.query("users").collect();
  const internalEmails = new Set(
    users.map((u: any) => u.email?.toLowerCase()).filter(Boolean),
  );
  for (const a of attendees) {
    const email = a.email?.trim().toLowerCase();
    if (!email || internalEmails.has(email)) continue;
    const resolved = await resolveEmailToContactClient(ctx, email);
    if (!resolved) continue;
    if (!contactIds.some((id) => String(id) === String(resolved.contactId))) {
      contactIds.push(resolved.contactId);
    }
    if (!clientId && resolved.clientId) clientId = resolved.clientId;
  }
  return { contactIds, clientId };
}

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
    // Inserting a new row without needsReconnect effectively clears the flag
    // on re-connect — the old row (including any lingering flag) was deleted
    // above and the new one omits the field.
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
    token: v.string(),  // per-channel auth token (32-byte hex)
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
      token: args.token,
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
    // Always-on UI query (desktop homepage, calendar, mobile brief): it can
    // fire before Clerk's token reaches Convex on a cold page load, so a
    // missing identity must render as "not connected", not crash the page.
    // See authHelpers.getAuthenticatedUserOrNull for the full rationale.
    const user = await getAuthenticatedUserOrNull(ctx);
    if (!user) {
      return {
        isConnected: false,
        connectedEmail: null,
        connectedAt: null,
        needsReconnect: false,
      };
    }
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (!tokens) {
      return {
        isConnected: false,
        connectedEmail: null,
        connectedAt: null,
        needsReconnect: false,
      };
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
      needsReconnect: tokens.needsReconnect === true,
    };
  },
});

// ── Internal: Token lookup by userId (for webhook — no user auth) ─

export const getTokensByUserId = internalQuery({
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
    const attendees = normalizeAttendees(args.attendees);
    const match = await matchAttendees(ctx, attendees);
    const existing = await ctx.db
      .query("events")
      .withIndex("by_google_event_id", (q: any) => q.eq("googleEventId", args.googleEventId))
      .first();
    if (existing) {
      const matcherOwnsClient = !existing.clientId || existing.attendeeMatchedAt !== undefined;
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        location: args.location,
        startTime: args.startTime,
        endTime: args.endTime,
        allDay: args.allDay ?? false,
        status: normalizeEventStatus(args.status),
        attendees,
        linkedContactIds: match.contactIds.length > 0 ? match.contactIds : undefined,
        ...(matcherOwnsClient ? { clientId: match.clientId } : {}),
        attendeeMatchedAt: now,
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
      status: normalizeEventStatus(args.status),
      attendees,
      linkedContactIds: match.contactIds.length > 0 ? match.contactIds : undefined,
      clientId: match.clientId,
      attendeeMatchedAt: now,
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
    const attendees = normalizeAttendees(args.attendees);
    const match = await matchAttendees(ctx, attendees);
    const existing = await ctx.db
      .query("events")
      .withIndex("by_google_event_id", (q: any) => q.eq("googleEventId", args.googleEventId))
      .first();
    if (existing) {
      // The matcher only owns clientId when it set it (attendeeMatchedAt
      // present) or nothing was set — a manually-assigned client survives.
      const matcherOwnsClient = !existing.clientId || existing.attendeeMatchedAt !== undefined;
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        location: args.location,
        startTime: args.startTime,
        endTime: args.endTime,
        allDay: args.allDay ?? false,
        status: normalizeEventStatus(args.status),
        attendees,
        linkedContactIds: match.contactIds.length > 0 ? match.contactIds : undefined,
        ...(matcherOwnsClient ? { clientId: match.clientId } : {}),
        attendeeMatchedAt: now,
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
      status: normalizeEventStatus(args.status),
      attendees,
      linkedContactIds: match.contactIds.length > 0 ? match.contactIds : undefined,
      clientId: match.clientId,
      attendeeMatchedAt: now,
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

// Internal — called from syncForUser when Google signals an event was
// cancelled. Converted from a public mutation (2026-04-22) to reflect
// the actual call surface; no external callers existed.
export const deleteByGoogleEventId = internalMutation({
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

// Disconnect is an action (not a mutation) so it can call Google's
// channels.stop HTTP endpoint before deleting local rows. Tells Google to
// stop pushing webhooks to our endpoint; prevents the week-long tail of
// rejected-by-401 webhook deliveries that the old mutation-only version
// leaked.
export const disconnect = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Resolve userId + load tokens + channel BEFORE delete (so we can
    // hit Google's channels.stop).
    const lookup = await ctx.runQuery(
      internal.googleCalendar.loadDisconnectContext,
      {},
    );
    if (!lookup) {
      return { success: true };
    }
    const { userId, tokens, channel } = lookup;

    // Best-effort stop of the push channel — fire-and-forget. If it fails
    // (network, 410, token expired) we still want the local disconnect to
    // succeed.
    if (tokens && channel) {
      try {
        const res = await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: channel.channelId,
            resourceId: channel.resourceId,
          }),
        });
        if (!res.ok) {
          console.warn(`[disconnect] channels.stop returned ${res.status}`);
        }
      } catch (err) {
        console.warn("[disconnect] channels.stop failed (network):", err);
      }
    }

    await ctx.runMutation(internal.googleCalendar.disconnectCleanup, {
      userId,
    });
    return { success: true };
  },
});

// ── Mobile OAuth: server-side code exchange ──────────────────

export const exchangeMobileCode = action({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; email: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth env vars missing in Convex");
    }

    // Exchange authorization code for tokens (PKCE)
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: args.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: args.redirectUri,
        grant_type: "authorization_code",
        code_verifier: args.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Google token exchange failed:", errText);
      let message = "Google token exchange failed";
      try {
        const errJson = JSON.parse(errText) as { error?: string; error_description?: string };
        if (errJson.error_description) message = `Google token exchange failed: ${errJson.error_description}`;
        else if (errJson.error) message = `Google token exchange failed: ${errJson.error}`;
      } catch {
        // non-JSON body — keep the generic message
      }
      throw new Error(message);
    }

    const tokens: {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      token_type: string;
    } = await tokenRes.json();

    // Google only returns refresh_token on first consent (prompt=consent forces it).
    // If missing (re-consent by same account), look up existing and preserve it.
    let refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      const existing = await ctx.runQuery(api.googleCalendar.getTokens, {});
      refreshToken = existing?.refreshToken;
      if (!refreshToken) {
        throw new Error(
          "Google did not return a refresh_token. Revoke app access in Google account settings and retry.",
        );
      }
    }

    // Fetch the connected email
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!userRes.ok) throw new Error("Failed to fetch Google user info");
    const { email } = (await userRes.json()) as { email: string };

    // Persist to Convex via existing mutation
    await ctx.runMutation(api.googleCalendar.saveTokens, {
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      connectedEmail: email,
    });

    return { success: true, email };
  },
});

// Flag a user's tokens row as needing reconnect. Called by the sync action
// when a refresh_token exchange returns invalid_grant.
export const markNeedsReconnect = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!tokens) return;
    await ctx.db.patch(tokens._id, { needsReconnect: true });
  },
});

// Internal query for the cron — returns all userIds with a connected calendar
// that is NOT flagged needsReconnect. Called from autoSyncAll.
export const listActiveSyncUserIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("googleCalendarTokens").collect();
    return rows
      .filter((r: any) => r.needsReconnect !== true)
      .map((r: any) => r.userId as any);
  },
});

// Internal variant of updateAccessToken that accepts userId directly.
// Used by syncForUser — the action runs from cron/webhook contexts
// without a Clerk identity, so the identity-based variant can't be used.
export const updateAccessTokenByUserId = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!tokens) throw new Error("No Google Calendar connection found");
    await ctx.db.patch(tokens._id, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
    });
  },
});

// Internal channel lookup by userId — sync action uses this because
// it already has userId from the iteration, and the public
// getSyncStatus does identity-lookup work we don't need here.
export const getChannelByUserIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
  },
});

// Internal update for the sync action — runs in cron/webhook contexts
// where no Clerk session exists, so uses internalMutation rather than
// mutation + identity check.
// Force a full re-sync for every connected calendar: clearing syncTokens
// makes the next syncForUser fall back to the 30-day full-window fetch,
// which (post attendee-shape fix) re-upserts every event WITH attendees and
// runs prospect matching. One-shot backfill lever:
//   npx convex run googleCalendar:clearAllSyncTokensInternal
export const clearAllSyncTokensInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    // syncToken is a REQUIRED field on the channels schema, so clear to ""
    // (syncForUser reads `channel?.syncToken || ""` — empty means full fetch).
    const channels = await ctx.db.query("googleCalendarChannels").collect();
    for (const ch of channels) {
      await ctx.db.patch(ch._id, { syncToken: "" });
    }
    return { cleared: channels.length };
  },
});

// Per-client calendar read — the prospect profile Calendar section + the
// meetings side of prospecting KPIs. Events land here via the attendee
// matcher (clientId stamped when an attendee resolves to the client's
// contacts). Sorted by startTime descending; the UI splits upcoming/past.
export const listByClient = query({
  args: { clientId: v.id("clients"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!(await getAuthenticatedUserOrNull(ctx))) return [];
    const limit = Math.min(args.limit ?? 60, 200);
    const rows = await ctx.db
      .query("events")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
    rows.sort((a: any, b: any) => (a.startTime < b.startTime ? 1 : -1));
    return rows.slice(0, limit).map((e: any) => ({
      _id: e._id,
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      allDay: e.allDay,
      status: e.status,
      location: e.location,
      attendees: (e.attendees ?? []).map((a: any) => ({
        email: a.email,
        name: a.name,
        responseStatus: a.responseStatus,
      })),
      linkedContactIds: e.linkedContactIds ?? [],
    }));
  },
});

export const updateChannelSyncToken = internalMutation({
  args: {
    channelId: v.string(),
    syncToken: v.string(),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_channel", (q: any) => q.eq("channelId", args.channelId))
      .first();
    if (!channel) throw new Error("channel not found");
    await ctx.db.patch(channel._id, { syncToken: args.syncToken });
  },
});

// Internal mutation used by channel renewal — atomically delete existing
// channel row for user and insert replacement with provided fields.
export const replaceChannel = internalMutation({
  args: {
    userId: v.id("users"),
    channelId: v.string(),
    resourceId: v.string(),
    expiration: v.string(),
    syncToken: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return ctx.db.insert("googleCalendarChannels", {
      userId: args.userId,
      channelId: args.channelId,
      resourceId: args.resourceId,
      expiration: args.expiration,
      syncToken: args.syncToken,
      token: args.token,
    });
  },
});

// Internal mutation used by the disconnect action after the Google
// channels.stop call. Deletes both token and channel rows for the user.
//
// TRUST CONTRACT: userId is trusted here — the caller (disconnect action)
// must validate identity and resolve the Clerk user BEFORE invoking this.
// Do not expose publicly; do not call from contexts where userId comes
// from untrusted input.
export const disconnectCleanup = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (tokens) await ctx.db.delete(tokens._id);
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (channel) await ctx.db.delete(channel._id);
    return { success: true };
  },
});

// Internal query used ONLY by the disconnect action to grab everything
// it needs in one hop (identity + tokens + channel).
export const loadDisconnectContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return null;
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    return { userId: user._id, tokens, channel };
  },
});
