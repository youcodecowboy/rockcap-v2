import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Shared sync body. Safe to call from webhook route, cron, or CLI.
// Returns a structured result so callers (and tests) can verify outcome.
export const syncForUser = internalAction({
  args: {
    userId: v.id("users"),
    trigger: v.union(
      v.literal("webhook"),
      v.literal("cron"),
      v.literal("manual"),
    ),
  },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    eventsSynced?: number;
    error?: string;
    skipped?: boolean;
  }> => {
    const startedAt = Date.now();
    const ranAt = new Date(startedAt).toISOString();

    // Load tokens via internal-by-user lookup. Skip if flagged.
    const tokens = await ctx.runQuery(
      internal.googleCalendar.getTokensByUserId,
      { userId: args.userId },
    );
    if (!tokens) {
      await ctx.runMutation(internal.googleCalendarLog.insertSyncLog, {
        userId: args.userId,
        ranAt,
        trigger: args.trigger,
        status: "skipped",
        error: "no tokens row",
      });
      return { ok: false, skipped: true, error: "no tokens row" };
    }
    if (tokens.needsReconnect === true) {
      await ctx.runMutation(internal.googleCalendarLog.insertSyncLog, {
        userId: args.userId,
        ranAt,
        trigger: args.trigger,
        status: "skipped",
        error: "needsReconnect",
      });
      return { ok: false, skipped: true, error: "needsReconnect" };
    }

    // Refresh access token if within 5 minutes of expiry.
    let accessToken = tokens.accessToken;
    const expiresAt = new Date(tokens.expiresAt).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const refreshed = await refreshAccessTokenOrFlag(
        ctx,
        args.userId,
        args.trigger,
        tokens.refreshToken,
      );
      if (refreshed === null) {
        // refreshAccessTokenOrFlag already wrote the flag + log row
        return { ok: false, error: "invalid_grant" };
      }
      accessToken = refreshed.access_token;
      // Update stored access token via the internal variant (no identity
      // needed — we're in a cron/webhook context without a Clerk session).
      await ctx.runMutation(internal.googleCalendar.updateAccessTokenByUserId, {
        userId: args.userId,
        accessToken: refreshed.access_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      });
    }

    // Load channel (for syncToken + channel-renewal decision)
    const channel = await ctx.runQuery(
      internal.googleCalendar.getChannelByUserIdInternal,
      { userId: args.userId },
    );
    let syncToken = channel?.syncToken || "";

    // Incremental fetch (or full window if no syncToken)
    let eventsResponse: ListEventsResult | null = null;
    let fallbackReason: string | undefined = undefined;
    try {
      eventsResponse = await listEventsSafe(accessToken, syncToken);
      if (eventsResponse === null) {
        fallbackReason = "fallback: no syncToken stored, using 30-day window";
        eventsResponse = await fullResyncWithWindow(accessToken);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("(410)")) {
        fallbackReason = "fallback: syncToken invalid (410), using 30-day window";
        eventsResponse = await fullResyncWithWindow(accessToken);
      } else {
        await ctx.runMutation(internal.googleCalendarLog.insertSyncLog, {
          userId: args.userId,
          ranAt,
          trigger: args.trigger,
          status: "error",
          error: msg.slice(0, 500),
          durationMs: Date.now() - startedAt,
        });
        return { ok: false, error: msg };
      }
    }

    // Upsert events (idempotent by googleEventId)
    let syncedCount = 0;
    const now = new Date();
    for (const gEvent of eventsResponse.items ?? []) {
      if (!gEvent.id || !gEvent.summary) continue;
      try {
        await ctx.runMutation(internal.googleCalendar.upsertGoogleEvent, {
          userId: args.userId,
          googleEventId: gEvent.id,
          title: gEvent.summary,
          description: gEvent.description,
          location: gEvent.location,
          startTime: gEvent.start?.dateTime || gEvent.start?.date || now.toISOString(),
          endTime: gEvent.end?.dateTime || gEvent.end?.date || now.toISOString(),
          allDay: !gEvent.start?.dateTime,
          status: gEvent.status || "confirmed",
          attendees: gEvent.attendees?.map((a: any) => ({
            email: a.email || "",
            name: a.displayName,
            status: a.responseStatus,
          })),
        });
        syncedCount++;
      } catch (err) {
        console.warn(`[syncForUser] upsert failed for event ${gEvent.id}:`, err);
      }
    }

    // Update syncToken on channel row
    const newSyncToken = eventsResponse.nextSyncToken || syncToken;
    if (channel && newSyncToken !== channel.syncToken) {
      await ctx.runMutation(internal.googleCalendar.updateChannelSyncToken, {
        channelId: channel.channelId,
        syncToken: newSyncToken,
      });
    }

    await ctx.runMutation(internal.googleCalendarLog.insertSyncLog, {
      userId: args.userId,
      ranAt,
      trigger: args.trigger,
      status: "ok",
      eventsSynced: syncedCount,
      durationMs: Date.now() - startedAt,
      error: fallbackReason,
    });
    return { ok: true, eventsSynced: syncedCount };
  },
});

// ── Helpers ──────────────────────────────────────────────────

async function refreshAccessTokenOrFlag(
  ctx: any,
  userId: Id<"users">,
  trigger: "webhook" | "cron" | "manual",
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Specifically detect invalid_grant — user revoked app access
    let isInvalidGrant = false;
    try {
      const parsed = JSON.parse(body);
      isInvalidGrant = parsed?.error === "invalid_grant";
    } catch {
      // body isn't JSON — fall through, treat as generic error
    }
    if (isInvalidGrant) {
      await ctx.runMutation(internal.googleCalendar.markNeedsReconnect, { userId });
      await ctx.runMutation(internal.googleCalendarLog.insertSyncLog, {
        userId,
        ranAt: new Date().toISOString(),
        trigger,
        status: "error" as const,
        error: "invalid_grant — user revoked Google access",
      });
      return null;
    }
    throw new Error(`Google token refresh failed: ${body.slice(0, 300)}`);
  }
  return res.json();
}

interface ListEventsResult {
  items?: any[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

interface PageQueryOpts {
  syncToken?: string;
  timeMin?: string;
  timeMax?: string;
}

async function paginatedListEvents(
  accessToken: string,
  opts: PageQueryOpts,
): Promise<ListEventsResult> {
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const accumulated: any[] = [];
  let nextPageToken: string | undefined = undefined;
  let nextSyncToken: string | undefined = undefined;

  // Cap at 10 pages (2,500 events) to avoid runaway loops — realistic calendars
  // have far fewer changes in a 30-day window, and incremental sync should never
  // approach this. If we hit it, the next run's syncToken will pick up where we
  // left off.
  const MAX_PAGES = 10;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams();
    if (opts.syncToken && !nextPageToken) {
      params.set("syncToken", opts.syncToken);
    } else if (!opts.syncToken) {
      if (opts.timeMin) params.set("timeMin", opts.timeMin);
      if (opts.timeMax) params.set("timeMax", opts.timeMax);
      params.set("singleEvents", "true");
      params.set("orderBy", "startTime");
    }
    if (nextPageToken) params.set("pageToken", nextPageToken);
    params.set("maxResults", "250");

    const res = await fetch(`${base}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google Calendar API error (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as ListEventsResult;
    if (data.items) accumulated.push(...data.items);
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }

  if (nextPageToken) {
    console.warn(
      `[paginatedListEvents] hit MAX_PAGES cap; more events remain. nextPageToken=${nextPageToken.slice(0, 20)}...`,
    );
  }

  return { items: accumulated, nextSyncToken };
}

async function listEventsSafe(
  accessToken: string,
  syncToken: string,
): Promise<ListEventsResult | null> {
  if (!syncToken) {
    // No stored syncToken — caller should use fullResyncWithWindow instead.
    return null;
  }
  return paginatedListEvents(accessToken, { syncToken });
}

async function fullResyncWithWindow(
  accessToken: string,
): Promise<ListEventsResult> {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const result = await paginatedListEvents(accessToken, {
    timeMin: now.toISOString(),
    timeMax: thirtyDaysOut.toISOString(),
  });
  if (result === null) {
    throw new Error("paginatedListEvents returned null for window query");
  }
  return result;
}

// Cron entry point — runs every 30 minutes. Iterates users serially
// (simpler and safe up to a few hundred users; revisit if we scale up).
// Catches per-user errors so one bad user doesn't break the tick.
export const autoSyncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ processed: number; errors: number }> => {
    const userIds: Id<"users">[] = await ctx.runQuery(
      internal.googleCalendar.listActiveSyncUserIds,
      {},
    );
    let processed = 0;
    let errors = 0;
    for (const userId of userIds) {
      try {
        const result = await ctx.runAction(
          internal.googleCalendarSync.syncForUser,
          { userId, trigger: "cron" as const },
        );
        if (!result.ok) errors++;
        // Channel renewal check runs AFTER sync so we use the freshest
        // access_token written by syncForUser.
        await renewChannelIfExpiring(ctx, userId);
      } catch (err) {
        errors++;
        console.error(`[autoSyncAll] failed for userId ${userId}:`, err);
      }
      processed++;
    }
    console.log(`[autoSyncAll] done: processed=${processed}, errors=${errors}`);
    return { processed, errors };
  },
});

async function renewChannelIfExpiring(ctx: any, userId: Id<"users">) {
  const channel = await ctx.runQuery(
    internal.googleCalendar.getChannelByUserIdInternal,
    { userId },
  );
  if (!channel) return;

  // `expiration` from Google is a ms-since-epoch string (per channels.watch docs).
  // Our storage is v.string() so it's safe to Number(). Defensively handle ISO strings too.
  const expMs =
    /^\d+$/.test(channel.expiration)
      ? Number(channel.expiration)
      : new Date(channel.expiration).getTime();
  const msUntilExpiry = expMs - Date.now();
  if (msUntilExpiry > 24 * 60 * 60 * 1000) return;

  // Load tokens to call stopChannel + watchCalendar
  const tokens = await ctx.runQuery(
    internal.googleCalendar.getTokensByUserId,
    { userId },
  );
  if (!tokens) return;

  const accessToken = tokens.accessToken;
  // Best-effort stop of the expiring channel — ignore errors
  try {
    await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channel.channelId,
        resourceId: channel.resourceId,
      }),
    });
  } catch (err) {
    console.warn(`[renewChannel] stopChannel failed for user ${userId}:`, err);
  }

  // Register a fresh channel with a new token + uuid. Use Web Crypto
  // (available in Convex V8 runtime) rather than node:crypto so we don't
  // have to add `"use node";` to the whole file.
  const newChannelId = crypto.randomUUID();
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const newToken = Array.from(tokenBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const webhookUrl =
    process.env.GOOGLE_OAUTH_REDIRECT_URI?.replace(
      "/api/google/callback",
      "/api/google/webhook",
    ) ?? "";
  const watchRes = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: newChannelId,
        type: "web_hook",
        address: webhookUrl,
        token: newToken,
      }),
    },
  );
  if (!watchRes.ok) {
    console.warn(
      `[renewChannel] watchCalendar failed for user ${userId}: ${await watchRes.text()}`,
    );
    return;
  }
  const watch: { resourceId: string; expiration: string } = await watchRes.json();

  // Overwrite the channel row (delete old, insert new) while PRESERVING the
  // existing syncToken so we don't lose incremental-sync state.
  await ctx.runMutation(internal.googleCalendar.replaceChannel, {
    userId,
    channelId: newChannelId,
    resourceId: watch.resourceId,
    expiration: watch.expiration,
    syncToken: channel.syncToken,
    token: newToken,
  });
  console.log(`[renewChannel] renewed channel for user ${userId}`);
}
