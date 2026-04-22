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
    let eventsResponse;
    try {
      eventsResponse = await listEventsSafe(accessToken, syncToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("(410)")) {
        // syncToken invalid; fall back to full window
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
    if (body.includes("invalid_grant")) {
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

async function listEventsSafe(
  accessToken: string,
  syncToken: string,
): Promise<ListEventsResult> {
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const params = new URLSearchParams();
  if (syncToken) {
    params.set("syncToken", syncToken);
  } else {
    // No stored syncToken — defer to fullResyncWithWindow by throwing 410-like error
    // so the caller's 410 fallback path kicks in. Cleaner than duplicating the
    // window logic here.
    throw new Error("Google Calendar API error (410): no syncToken");
  }
  params.set("maxResults", "250");
  const res = await fetch(`${base}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Calendar API error (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function fullResyncWithWindow(
  accessToken: string,
): Promise<ListEventsResult> {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: thirtyDaysOut.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(`${base}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Calendar window sync failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}
