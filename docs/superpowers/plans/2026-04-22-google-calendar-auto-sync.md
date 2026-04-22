# Google Calendar Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connected Google Calendar events stay fresh for every user with no manual action — push-webhook fast path + 30-minute Convex cron fallback + automatic channel renewal.

**Architecture:** One shared Convex action (`internal.googleCalendarSync.syncForUser`) contains all sync logic. The existing `/api/google/webhook` Next.js route verifies the Google-supplied channel token and fires the action. A new Convex cron (`autoSyncAll`) invokes the same action for every connected user every 30 minutes and renews any channel whose expiration is within 24 hours. `invalid_grant` on refresh sets a `needsReconnect` flag that the card reads and the daily brief surfaces. Every run writes one row to a new `googleCalendarSyncLog` table with a daily prune keeping it bounded.

**Tech Stack:** Convex (actions, crons, mutations), Next.js 16 App Router (webhook route only — the cron lives in Convex), Google Calendar API v3 (`events.list` with `syncToken`, `channels.watch` / `channels.stop`), Clerk (auth context for the action).

**Reference spec:** `docs/superpowers/specs/2026-04-22-google-calendar-auto-sync-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `model-testing-app/convex/googleCalendarSync.ts` | Sync logic: `syncForUser` (action), `autoSyncAll` (action), `fullResyncWithWindow` helper, `renewChannelIfExpiring` helper |
| `model-testing-app/convex/googleCalendarLog.ts` | Log table I/O: `insertSyncLog` (internalMutation), `pruneSyncLog` (internalAction) |

### Edited files

| Path | What changes |
|------|--------------|
| `model-testing-app/convex/schema.ts` | Add `needsReconnect` to `googleCalendarTokens`, add `token` to `googleCalendarChannels`, add new `googleCalendarSyncLog` table |
| `model-testing-app/convex/googleCalendar.ts` | Add `markNeedsReconnect` internalMutation; `saveTokens` clears flag; `getSyncStatus` returns flag; `saveChannel` accepts/stores `token`; split `disconnect` into action + internal mutation that also calls Google's `channels.stop` |
| `model-testing-app/convex/crons.ts` | Register `google-calendar-auto-sync` (30 min) and `google-calendar-sync-log-prune` (daily) |
| `model-testing-app/src/lib/google/calendar.ts` | `watchCalendar(...)` signature takes `token: string` and forwards to Google |
| `model-testing-app/src/app/api/google/setup-sync/route.ts` | Generate per-channel token with `crypto.randomBytes(32).toString('hex')`, pass to `watchCalendar`, include in `saveChannel` args |
| `model-testing-app/src/app/api/google/webhook/route.ts` | Replace stub: look up channel, verify `x-goog-channel-token`, fire the Convex action via deploy-key client |
| `mobile-app/components/settings/GoogleCalendarCard.tsx` | Read `syncStatus.needsReconnect`; render reconnect warning state; switch `disconnect` from `useMutation` to `useAction` |
| `model-testing-app/src/app/(mobile)/m-settings/components/GoogleCalendarCard.tsx` | Mirror: read `needsReconnect`, render reconnect state (web jsx), keep existing `fetch('/api/google/disconnect')` path or switch to `useAction(api.googleCalendar.disconnect)` |
| `model-testing-app/src/app/api/daily-brief/generate/route.ts` | If current user has `needsReconnect === true`, include a `warnings` entry in the Claude prompt and surface in output JSON |
| `model-testing-app/src/app/api/mobile/daily-brief/generate/route.ts` | Same treatment as web daily-brief route |

### Env var additions (platform side, not code)

| Variable | Where | Value |
|----------|-------|-------|
| `CONVEX_DEPLOY_KEY` | Vercel (prod + preview), read by webhook route | Copy from Convex dashboard → Settings → Deploy Keys (already standard for Convex+Vercel projects — likely present) |

### Not touched

| Path | Why it's stable |
|------|-----------------|
| `mobile-app/app/settings/*` | Settings screen shell is unchanged — only the card contents shift |
| `mobile-app/lib/googleCalendarAuth.ts` | OAuth hook unchanged — reconnect reuses existing flow |
| `model-testing-app/src/app/api/google/auth/route.ts`, `callback/route.ts`, `setup-sync/route.ts` (beyond the `watchCalendar` call site in setup-sync) | Connect flow untouched |

---

## Task 1: Schema changes

**Goal:** Extend two existing tables and create one new table. No logic changes; just schema and index adds.

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (lines ~3419-3439 region for Google Calendar tables)

- [ ] **Step 1.1: Add `needsReconnect` to `googleCalendarTokens`**

In `model-testing-app/convex/schema.ts`, the existing `googleCalendarTokens` block:

```ts
googleCalendarTokens: defineTable({
  userId: v.id("users"),
  accessToken: v.string(),
  refreshToken: v.string(),
  expiresAt: v.string(),
  scope: v.string(),
  connectedAt: v.string(),
  connectedEmail: v.string(),
})
  .index("by_user", ["userId"]),
```

Change to:

```ts
googleCalendarTokens: defineTable({
  userId: v.id("users"),
  accessToken: v.string(),
  refreshToken: v.string(),
  expiresAt: v.string(),
  scope: v.string(),
  connectedAt: v.string(),
  connectedEmail: v.string(),
  // Set to true when a refresh returns invalid_grant. Sync skips the user;
  // card surfaces a "Reconnect Google Calendar" state. Cleared on next
  // successful saveTokens (i.e., on re-connect).
  needsReconnect: v.optional(v.boolean()),
})
  .index("by_user", ["userId"]),
```

- [ ] **Step 1.2: Add `token` to `googleCalendarChannels`**

Change:

```ts
googleCalendarChannels: defineTable({
  userId: v.id("users"),
  channelId: v.string(),
  resourceId: v.string(),
  expiration: v.string(),
  syncToken: v.string(),
})
  .index("by_user", ["userId"])
  .index("by_channel", ["channelId"]),
```

To:

```ts
googleCalendarChannels: defineTable({
  userId: v.id("users"),
  channelId: v.string(),
  resourceId: v.string(),
  expiration: v.string(),
  syncToken: v.string(),
  // Per-channel opaque token (32-byte hex). Generated at watchCalendar
  // time and passed to Google's channels.watch `token` field. Google
  // returns it in every webhook as `x-goog-channel-token`. The webhook
  // route compares the incoming header to this stored value to
  // authenticate the callback. Optional so existing channels registered
  // pre-change keep reading; those users just need to reconnect (or wait
  // for the natural ~7-day expiration) to gain auth.
  token: v.optional(v.string()),
})
  .index("by_user", ["userId"])
  .index("by_channel", ["channelId"]),
```

- [ ] **Step 1.3: Add `googleCalendarSyncLog` table**

Insert this block just after `googleCalendarChannels`:

```ts
// Auto-sync run log — one row per sync invocation (webhook, cron, or manual).
// Pruned daily by internal.googleCalendarLog.pruneSyncLog (rows > 14 days).
googleCalendarSyncLog: defineTable({
  userId: v.id("users"),
  ranAt: v.string(),     // ISO timestamp
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
})
  .index("by_user_ran_at", ["userId", "ranAt"])
  .index("by_ran_at", ["ranAt"]),
```

- [ ] **Step 1.4: Regenerate Convex types**

Run: `cd model-testing-app && npx convex codegen`
Expected: finishes with no type errors. If `Convex CLI says schema change requires a push, this is fine — codegen works without a deploy.

- [ ] **Step 1.5: TypeScript sanity check**

Run: `cd model-testing-app && npx tsc --noEmit 2>&1 | grep -E "schema\.ts|googleCalendar"`
Expected: no new errors in `schema.ts`. The existing `convex/googleCalendar.ts` may show pre-existing errors on unrelated lines — ignore those.

- [ ] **Step 1.6: Commit**

```bash
git add model-testing-app/convex/schema.ts
git commit -m "feat(convex): schema — needsReconnect, channel token, syncLog table"
```

---

## Task 2: Log table module

**Goal:** A focused file for the new log table's writes. Isolating keeps `googleCalendar.ts` from growing. Contains the `insertSyncLog` internalMutation (called by syncForUser) and the `pruneSyncLog` internalAction (called by daily cron).

**Files:**
- Create: `model-testing-app/convex/googleCalendarLog.ts`

- [ ] **Step 2.1: Create the file**

```ts
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";

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
    return ctx.db.insert("googleCalendarSyncLog", args);
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

export const pruneSyncLog = internalAction({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    // Keep 14 days. Anything older goes.
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = await ctx.runMutation(
      api.googleCalendarLog.pruneOlderThan,
      { cutoff },
    );
    console.log(`[googleCalendarLog.pruneSyncLog] deleted ${result.deleted} rows older than ${cutoff}`);
    return result;
  },
});
```

Note: `pruneOlderThan` is exported as an `internalMutation` so the action can call it. Keep it internal — there's no reason for mobile or the UI to call it directly.

- [ ] **Step 2.2: Regenerate Convex types**

Run: `cd model-testing-app && npx convex codegen`
Expected: success; `_generated/api.d.ts` now includes `googleCalendarLog`.

- [ ] **Step 2.3: Type-check**

Run: `cd model-testing-app && npx tsc --noEmit 2>&1 | grep googleCalendarLog`
Expected: no errors mentioning the new file.

- [ ] **Step 2.4: Commit**

```bash
git add model-testing-app/convex/googleCalendarLog.ts
git commit -m "feat(convex): googleCalendarLog module — insertSyncLog, pruneSyncLog"
```

---

## Task 3: Tokens module updates (needsReconnect + saveChannel token)

**Goal:** Small edits to `convex/googleCalendar.ts`. Five changes:
1. Add `markNeedsReconnect` internalMutation.
2. `saveTokens` clears `needsReconnect` on insert (fresh re-connect).
3. `getSyncStatus` returns `needsReconnect` so the card can render reconnect state.
4. `saveChannel` accepts and stores `token`.
5. Internal query for "list users whose calendar is connected and not broken" used by autoSyncAll.

**Files:**
- Modify: `model-testing-app/convex/googleCalendar.ts`

- [ ] **Step 3.1: Add `markNeedsReconnect` internalMutation**

Append to the end of the file (after the existing `disconnect` mutation at line ~349):

```ts
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
```

Also at the top of the file, change this import:
```ts
import { mutation, query, internalMutation, action } from "./_generated/server";
```
to:
```ts
import { mutation, query, internalMutation, internalQuery, action } from "./_generated/server";
```

- [ ] **Step 3.2: `saveTokens` clears the flag on re-connect**

Find the existing `saveTokens` mutation (lines ~18-45). Replace its body's insert with a version that explicitly omits `needsReconnect`:

Change this block:
```ts
return ctx.db.insert("googleCalendarTokens", {
  userId: user._id,
  accessToken: args.accessToken,
  refreshToken: args.refreshToken,
  expiresAt: args.expiresAt,
  scope: args.scope,
  connectedAt: new Date().toISOString(),
  connectedEmail: args.connectedEmail,
});
```

To:
```ts
// Inserting a new row without needsReconnect effectively clears the flag
// on re-connect — the old row is deleted above and the new one omits the
// field.
return ctx.db.insert("googleCalendarTokens", {
  userId: user._id,
  accessToken: args.accessToken,
  refreshToken: args.refreshToken,
  expiresAt: args.expiresAt,
  scope: args.scope,
  connectedAt: new Date().toISOString(),
  connectedEmail: args.connectedEmail,
});
```

(No functional change — the `delete(existing._id)` above already wiped the old row and its flag. The comment documents why `needsReconnect` is absent here.)

- [ ] **Step 3.3: `getSyncStatus` returns `needsReconnect`**

Find the existing `getSyncStatus` query (lines ~160-182). Change:

```ts
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
```

To:

```ts
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
```

- [ ] **Step 3.4 (NEW): Add `updateAccessTokenByUserId` internal mutation**

The existing `updateAccessToken` (line ~58) uses `getAuthenticatedUser(ctx)` which requires Clerk identity. When `syncForUser` runs from the cron there's no identity, so the action can't call it. Add an internal sibling that takes userId explicitly:

```ts
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
```

Append this next to the other internal mutations you added in Step 3.1.

- [ ] **Step 3.5: `saveChannel` accepts `token`**

Find `saveChannel` (lines ~93-117). Change args to include `token`, and persist it in the insert:

Existing args block:
```ts
args: {
  channelId: v.string(),
  resourceId: v.string(),
  expiration: v.string(),
  syncToken: v.string(),
},
```

Change to:
```ts
args: {
  channelId: v.string(),
  resourceId: v.string(),
  expiration: v.string(),
  syncToken: v.string(),
  token: v.string(),  // per-channel auth token (32-byte hex)
},
```

Existing insert block:
```ts
return ctx.db.insert("googleCalendarChannels", {
  userId: user._id,
  channelId: args.channelId,
  resourceId: args.resourceId,
  expiration: args.expiration,
  syncToken: args.syncToken,
});
```

Change to:
```ts
return ctx.db.insert("googleCalendarChannels", {
  userId: user._id,
  channelId: args.channelId,
  resourceId: args.resourceId,
  expiration: args.expiration,
  syncToken: args.syncToken,
  token: args.token,
});
```

- [ ] **Step 3.6: Regenerate Convex types and type-check**

Run: `cd model-testing-app && npx convex codegen && npx tsc --noEmit 2>&1 | grep -E "googleCalendar\.ts"`
Expected: no new errors from `googleCalendar.ts`. Calls to `saveChannel` in `/api/google/setup-sync/route.ts` will be flagged as missing the `token` arg — THAT is expected and will be fixed in Task 4.

- [ ] **Step 3.7: Commit**

```bash
git add model-testing-app/convex/googleCalendar.ts
git commit -m "feat(convex): tokens module — needsReconnect flag, channel.token, listActiveSyncUserIds"
```

---

## Task 4: Channel token plumbing (setup-sync route + watchCalendar helper)

**Goal:** Generate a 32-byte hex token at channel registration time, forward it to Google via `channels.watch`, and store it so the webhook can verify.

**Files:**
- Modify: `model-testing-app/src/lib/google/calendar.ts`
- Modify: `model-testing-app/src/app/api/google/setup-sync/route.ts`

- [ ] **Step 4.1: Update `watchCalendar` signature**

Find in `model-testing-app/src/lib/google/calendar.ts` (lines 104-118):

```ts
export async function watchCalendar(
  accessToken: string,
  webhookUrl: string,
  channelId: string,
): Promise<WatchResponse> {
  const res = await calendarFetch('/calendars/primary/events/watch', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
    }),
  });
  return res.json();
}
```

Change to:

```ts
export async function watchCalendar(
  accessToken: string,
  webhookUrl: string,
  channelId: string,
  token: string,
): Promise<WatchResponse> {
  const res = await calendarFetch('/calendars/primary/events/watch', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token,  // Google passes this back as `x-goog-channel-token` on every webhook
    }),
  });
  return res.json();
}
```

- [ ] **Step 4.2: Update `setup-sync` route to generate and use the token**

In `model-testing-app/src/app/api/google/setup-sync/route.ts`, find this region (around lines 67-86):

```ts
const channelId = crypto.randomUUID();
const webhookUrl = `${process.env.GOOGLE_OAUTH_REDIRECT_URI?.replace('/api/google/callback', '')}/api/google/webhook`;

let resourceId = '';
let expiration = '';
try {
  const watchResponse = await watchCalendar(accessToken, webhookUrl, channelId);
  resourceId = watchResponse.resourceId;
  expiration = watchResponse.expiration;
} catch (err) {
  console.warn('Webhook setup failed (may need public URL):', err);
}

if (resourceId) {
  await convex.mutation(api.googleCalendar.saveChannel, {
    channelId,
    resourceId,
    expiration,
    syncToken,
  });
}
```

Change to:

```ts
const channelId = crypto.randomUUID();
const channelToken = crypto.randomBytes(32).toString('hex');
const webhookUrl = `${process.env.GOOGLE_OAUTH_REDIRECT_URI?.replace('/api/google/callback', '')}/api/google/webhook`;

let resourceId = '';
let expiration = '';
try {
  const watchResponse = await watchCalendar(accessToken, webhookUrl, channelId, channelToken);
  resourceId = watchResponse.resourceId;
  expiration = watchResponse.expiration;
} catch (err) {
  console.warn('Webhook setup failed (may need public URL):', err);
}

if (resourceId) {
  await convex.mutation(api.googleCalendar.saveChannel, {
    channelId,
    resourceId,
    expiration,
    syncToken,
    token: channelToken,
  });
}
```

- [ ] **Step 4.3: Type-check**

Run: `cd model-testing-app && npx tsc --noEmit 2>&1 | grep -E "calendar\.ts|setup-sync/route\.ts"`
Expected: no errors from these two files.

- [ ] **Step 4.4: Commit**

```bash
git add model-testing-app/src/lib/google/calendar.ts model-testing-app/src/app/api/google/setup-sync/route.ts
git commit -m "feat(google): per-channel token for webhook authentication"
```

---

## Task 5: `syncForUser` action

**Goal:** The canonical sync body, called from webhook / cron / manual. Incremental via `syncToken`; falls back to full 30-day window on 410 or missing token; handles `invalid_grant` by flagging `needsReconnect`; writes one log row per run.

**Files:**
- Create: `model-testing-app/convex/googleCalendarSync.ts`

- [ ] **Step 5.1: Create the file with `syncForUser`**

```ts
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
    const tokens = await ctx.runMutation(
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
    const channel = await loadChannelForUser(ctx, args.userId);
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

async function loadChannelForUser(ctx: any, userId: Id<"users">) {
  return ctx.runQuery(internal.googleCalendar.getChannelByUserIdInternal, {
    userId,
  });
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
```

- [ ] **Step 5.2: Add the two missing internal query/mutation helpers in `googleCalendar.ts`**

The action references `internal.googleCalendar.getChannelByUserIdInternal` and `internal.googleCalendar.updateChannelSyncToken` — neither exists today. Append to `model-testing-app/convex/googleCalendar.ts`:

```ts
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

// Internal update for the sync action — bypasses per-user identity
// check (which the existing updateSyncToken mutation doesn't do
// either, but at least this version makes the intent explicit).
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
```

Note: `getTokensByUserId` already exists in the file (line 186) but is declared as `internalMutation` — that's wrong (reads are queries, not mutations). Fix it:

Find:
```ts
export const getTokensByUserId = internalMutation({
```
Change to:
```ts
export const getTokensByUserId = internalQuery({
```

- [ ] **Step 5.3: Codegen and type-check**

Run: `cd model-testing-app && npx convex codegen && npx tsc --noEmit 2>&1 | grep -E "googleCalendarSync\.ts|googleCalendar\.ts"`
Expected: no new errors.

- [ ] **Step 5.4: Smoke-run via CLI**

Run: `cd model-testing-app && npx convex run googleCalendarSync:syncForUser '{"userId":"<USE-A-REAL-USER-ID>","trigger":"manual"}'`
(Grab a real user id via `npx convex run users:getCurrent` after authenticating in the Convex dashboard, OR `npx convex data | head` to list rows in `users` table.)

Expected outcomes depending on state:
- User has no tokens → `{ ok: false, skipped: true, error: "no tokens row" }`, log row with status skipped
- User has tokens, valid syncToken → `{ ok: true, eventsSynced: <N> }`, log row with status ok
- User has `needsReconnect: true` → `{ ok: false, skipped: true, error: "needsReconnect" }`

Any of these prove the action is wired.

If the CLI environment is unable to run Convex actions (no CONVEX_DEPLOY_KEY, no linked deployment), document that as a concern and proceed — TypeScript compilation is enough proof for this step.

- [ ] **Step 5.5: Commit**

```bash
git add model-testing-app/convex/googleCalendarSync.ts model-testing-app/convex/googleCalendar.ts
git commit -m "feat(convex): syncForUser action — incremental, 410 fallback, needsReconnect on invalid_grant"
```

---

## Task 6: `autoSyncAll` action + channel renewal

**Goal:** Iterate all connected users serially, invoke `syncForUser` for each, and renew any channel whose expiration is within 24 hours of now.

**Files:**
- Modify: `model-testing-app/convex/googleCalendarSync.ts` (append)

- [ ] **Step 6.1: Append `autoSyncAll` action**

Add to the bottom of `model-testing-app/convex/googleCalendarSync.ts`:

```ts
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
```

Note: uses Web Crypto (`crypto.randomUUID`, `crypto.getRandomValues`) which is available globally in Convex's V8 action runtime. No `"use node";` directive needed.

- [ ] **Step 6.2: Add `replaceChannel` internal mutation to `googleCalendar.ts`**

Append:

```ts
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
```

- [ ] **Step 6.3: Codegen + type-check**

Run: `cd model-testing-app && npx convex codegen && npx tsc --noEmit 2>&1 | grep -E "googleCalendarSync\.ts|googleCalendar\.ts"`

If codegen or `tsc` flags `crypto.randomUUID` / `crypto.getRandomValues` as not found (type-only complaint — the runtime supports them), add `/// <reference lib="dom" />` at the top of `googleCalendarSync.ts` to pull the DOM library types (which include Web Crypto).

- [ ] **Step 6.4: Smoke test the cron entry point via CLI**

Run: `cd model-testing-app && npx convex run googleCalendarSync:autoSyncAll '{}'`
Expected: returns `{ processed: <N>, errors: 0 }` where N is the number of connected users in your Convex deployment. Log rows appear in `googleCalendarSyncLog` for each user.

- [ ] **Step 6.5: Commit**

```bash
git add model-testing-app/convex/googleCalendarSync.ts model-testing-app/convex/googleCalendar.ts
git commit -m "feat(convex): autoSyncAll action with 24h channel-renewal window"
```

---

## Task 7: Register cron jobs

**Goal:** Hook `autoSyncAll` into Convex's every-30-min scheduler and `pruneSyncLog` into a daily 3:30 UTC tick.

**Files:**
- Modify: `model-testing-app/convex/crons.ts`

- [ ] **Step 7.1: Append two cron entries**

Existing file has this shape (lines 1-30 roughly):
```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("daily-brief-trigger", { hourUTC: 5, minuteUTC: 0 }, internal.dailyBriefs.cronTrigger);
crons.interval("hubspot-recurring-sync", { hours: 6 }, internal.hubspotSync.recurringSync.runRecurringSync);
crons.daily("hubspot-webhook-log-prune", { hourUTC: 3, minuteUTC: 15 }, internal.hubspotSync.webhook.pruneWebhookEventLog);

export default crons;
```

Add between the last `crons.daily` and `export default crons`:

```ts
// Google Calendar auto-sync — every 30 minutes. Iterates connected users
// serially, falls back to cron-delivery when push webhooks are unreachable
// (localhost dev, brief outages) and renews push channels within 24h of
// expiration so push delivery never silently lapses.
crons.interval(
  "google-calendar-auto-sync",
  { minutes: 30 },
  internal.googleCalendarSync.autoSyncAll,
);

crons.daily(
  "google-calendar-sync-log-prune",
  { hourUTC: 3, minuteUTC: 30 },  // after HubSpot's prune at 3:15
  internal.googleCalendarLog.pruneSyncLog,
);
```

- [ ] **Step 7.2: Codegen + type-check**

Run: `cd model-testing-app && npx convex codegen && npx tsc --noEmit 2>&1 | grep "crons\.ts"`
Expected: no errors. The new entries reference `internal.googleCalendarSync.autoSyncAll` and `internal.googleCalendarLog.pruneSyncLog` — both exist from Tasks 2 and 6.

- [ ] **Step 7.3: Verify registered via Convex CLI**

Run: `cd model-testing-app && npx convex dashboard` (opens browser). Confirm in the "Crons" tab:
- `google-calendar-auto-sync` every 30 minutes
- `google-calendar-sync-log-prune` daily at 03:30 UTC

If the CLI can't open a browser in this environment, run `npx convex run --help` to confirm the CLI is wired up and trust the type-check.

- [ ] **Step 7.4: Commit**

```bash
git add model-testing-app/convex/crons.ts
git commit -m "feat(convex): register Google Calendar auto-sync + log-prune crons"
```

---

## Task 8: Webhook route — real sync invocation

**Goal:** Replace the no-op webhook handler with one that verifies Google's channel token, then fires `syncForUser` via a deploy-key-authenticated Convex client.

**Files:**
- Modify: `model-testing-app/src/app/api/google/webhook/route.ts`

- [ ] **Step 8.1: Rewrite the route**

Replace the full contents of `model-testing-app/src/app/api/google/webhook/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api, internal } from '../../../../../convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const deployKey = process.env.CONVEX_DEPLOY_KEY;

// One long-lived client for queries. The internal-action invocation
// constructs its own client below so the auth surface is explicit.
const convex = new ConvexHttpClient(convexUrl);

export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id');
  const channelToken = request.headers.get('x-goog-channel-token');
  const resourceState = request.headers.get('x-goog-resource-state');

  // Initial handshake ping — Google sends this right after watchCalendar.
  // Return 200 immediately; nothing to sync yet.
  if (resourceState === 'sync') {
    return NextResponse.json({ ok: true });
  }

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channel ID' }, { status: 400 });
  }

  try {
    const channel = await convex.query(
      api.googleCalendar.getChannelByChannelId,
      { channelId },
    );
    if (!channel) {
      // Channel row has been deleted (e.g., user disconnected). Return 404
      // so Google stops retrying.
      return NextResponse.json({ error: 'Unknown channel' }, { status: 404 });
    }

    // Per-channel token authentication. Channels registered before this
    // change won't have a `token` field; accept them for a grace period
    // but log so we can track the migration.
    if (channel.token) {
      if (!channelToken || channelToken !== channel.token) {
        console.warn(
          `[google/webhook] channel-token mismatch for ${channelId}`,
        );
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      console.warn(
        `[google/webhook] channel ${channelId} has no stored token — pre-migration channel, allowing`,
      );
    }

    // Fire-and-forget: build a deploy-key client and invoke the internal
    // sync action. Don't await — Google's webhook has a 10s timeout, and
    // our action can take longer. The action writes its own log row so
    // failures are still visible.
    if (!deployKey) {
      console.error('[google/webhook] CONVEX_DEPLOY_KEY is not set');
      // Fall through to 200 — returning 5xx would cause Google to retry;
      // we'd rather drop the event and let the next cron tick catch up.
      return NextResponse.json({ ok: true });
    }
    const authedClient = new ConvexHttpClient(convexUrl);
    authedClient.setAuth(deployKey);

    // Fire without await. Any throw here is logged by the catch below.
    authedClient
      .action(internal.googleCalendarSync.syncForUser, {
        userId: channel.userId,
        trigger: 'webhook' as const,
      })
      .catch((err) =>
        console.error('[google/webhook] syncForUser rejected:', err),
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[google/webhook] error:', err);
    // Still return 200 so Google doesn't retry — the cron will catch up.
    return NextResponse.json({ ok: true });
  }
}
```

- [ ] **Step 8.2: Type-check**

Run: `cd model-testing-app && npx tsc --noEmit 2>&1 | grep "webhook/route\.ts"`
Expected: no errors. If `internal` cannot be imported this way, adjust the import path (Next.js/Convex type paths can differ; try `../../../../../convex/_generated/api` or `@/convex/_generated/api` depending on aliases).

- [ ] **Step 8.3: Next.js build sanity**

Run: `cd model-testing-app && npx next build 2>&1 | grep -E "Failed|Error|webhook"`
Expected: no errors.

- [ ] **Step 8.4: Commit**

```bash
git add model-testing-app/src/app/api/google/webhook/route.ts
git commit -m "feat(api): webhook — verify channel token, fire syncForUser action"
```

---

## Task 9: Disconnect as an action (with `channels.stop`)

**Goal:** Turn `disconnect` into an action so we can call Google's `channels.stop` (an HTTP call) before deleting local rows. Also adds `disconnectCleanup` internal mutation. Mobile and web cards switch from `useMutation` to `useAction` with no argument-shape change.

**Files:**
- Modify: `model-testing-app/convex/googleCalendar.ts`

- [ ] **Step 9.1: Add a new internal mutation for row cleanup**

Append to `model-testing-app/convex/googleCalendar.ts`:

```ts
// Internal mutation used by the disconnect action after the Google
// channels.stop call. Deletes both token and channel rows for the user.
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
```

- [ ] **Step 9.2: Replace the existing `disconnect` mutation with an action**

Find the existing `disconnect` mutation (lines ~333-349):

```ts
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
```

Replace with:

```ts
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
        await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
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
      } catch (err) {
        console.warn("[disconnect] channels.stop failed:", err);
      }
    }

    await ctx.runMutation(internal.googleCalendar.disconnectCleanup, {
      userId,
    });
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
```

Also ensure `internal` is in the import (it may already be from previous tasks). Check the top of the file has:
```ts
import { api, internal } from "./_generated/api";
```

- [ ] **Step 9.3: Update the web `/api/google/disconnect` route**

Check existing: `model-testing-app/src/app/api/google/disconnect/route.ts`. If it calls `api.googleCalendar.disconnect` as a mutation via `convex.mutation()`, switch to `convex.action()`. Read the file first to find the call site.

Run: `cat model-testing-app/src/app/api/google/disconnect/route.ts`

If it uses `convex.mutation(api.googleCalendar.disconnect, ...)`, change that single line to `convex.action(api.googleCalendar.disconnect, ...)`. No other changes.

- [ ] **Step 9.4: Codegen + type-check**

Run: `cd model-testing-app && npx convex codegen && npx tsc --noEmit 2>&1 | grep -E "googleCalendar\.ts|disconnect/route\.ts"`
Expected: no errors. Callers referencing `api.googleCalendar.disconnect` still type-check — the signature shape is unchanged, just the kind (action vs mutation).

- [ ] **Step 9.5: Commit**

```bash
git add model-testing-app/convex/googleCalendar.ts model-testing-app/src/app/api/google/disconnect/route.ts
git commit -m "feat(convex): disconnect becomes an action, calls Google channels.stop"
```

---

## Task 10: Card updates (mobile + web)

**Goal:** Both cards now:
1. Read `syncStatus.needsReconnect` and render a warning state when true.
2. Call `disconnect` via `useAction` (mobile) or equivalent for web.

**Files:**
- Modify: `mobile-app/components/settings/GoogleCalendarCard.tsx`
- Modify: `model-testing-app/src/app/(mobile)/m-settings/components/GoogleCalendarCard.tsx`

- [ ] **Step 10.1: Mobile card — switch `disconnect` to `useAction`**

Find in `mobile-app/components/settings/GoogleCalendarCard.tsx` (near the top, around line 13):
```ts
const disconnect = useMutation(api.googleCalendar.disconnect);
```
Change to:
```ts
const disconnect = useAction(api.googleCalendar.disconnect);
```

And remove `useMutation` from the import on line 2 if nothing else uses it. Verify by searching for `useMutation` in the file — there should be no other callers.

- [ ] **Step 10.2: Mobile card — render `needsReconnect` state**

In the same file, find the connected-state render block (the `<>` fragment with Sync Now + Disconnect, around line 200). Add a conditional branch BEFORE that fragment:

After:
```tsx
<View className="mt-3 gap-2">
  {syncStatus.isConnected ? (
```

Change the conditional to a three-way:
```tsx
<View className="mt-3 gap-2">
  {syncStatus.isConnected && syncStatus.needsReconnect ? (
    <>
      <View className="px-3 py-2 rounded-lg bg-orange-50">
        <Text className="text-[12px] font-medium text-orange-800">
          Google Calendar disconnected — events no longer update. Tap
          Reconnect to restore.
        </Text>
      </View>
      <TouchableOpacity
        onPress={handleConnect}
        disabled={connecting || !request}
        className="py-2 px-3 rounded-lg items-center bg-m-bg-brand active:opacity-80"
        style={connecting || !request ? { opacity: 0.5 } : undefined}
      >
        <Text className="text-[13px] font-medium text-m-text-on-brand">
          {connecting ? 'Reconnecting...' : 'Reconnect Google Calendar'}
        </Text>
      </TouchableOpacity>
    </>
  ) : syncStatus.isConnected ? (
    <>
      {/* existing Sync Now + Disconnect buttons go here unchanged */}
      <TouchableOpacity
        onPress={handleSyncNow}
        disabled={syncing}
        className="py-2 px-3 border border-m-border rounded-lg items-center active:bg-m-bg-subtle"
        style={syncing ? { opacity: 0.5 } : undefined}
      >
        <Text className="text-[13px] font-medium text-m-text-primary">
          {syncing ? 'Syncing...' : 'Sync Now'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleDisconnect}
        disabled={disconnecting}
        className="py-2 px-3 rounded-lg items-center bg-red-50 active:bg-red-100"
        style={disconnecting ? { opacity: 0.5 } : undefined}
      >
        <Text className="text-[13px] font-medium text-m-error">
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </Text>
      </TouchableOpacity>
    </>
  ) : (
    <TouchableOpacity
      onPress={handleConnect}
      disabled={connecting || !request}
      className="py-2 px-3 rounded-lg items-center bg-m-bg-brand active:opacity-80"
      style={connecting || !request ? { opacity: 0.5 } : undefined}
    >
      <Text className="text-[13px] font-medium text-m-text-on-brand">
        {connecting ? 'Connecting...' : 'Connect Google Calendar'}
      </Text>
    </TouchableOpacity>
  )}
</View>
```

Also update the card's subtitle (around line 68-70) to mention the reconnect state:

Existing:
```tsx
<Text className="text-[12px] text-m-text-tertiary mt-0.5">
  {syncStatus.isConnected
    ? `Connected as ${syncStatus.connectedEmail}`
    : 'Sync your calendar events and add tasks to your schedule'}
</Text>
```

Change to:
```tsx
<Text className="text-[12px] text-m-text-tertiary mt-0.5">
  {syncStatus.isConnected && syncStatus.needsReconnect
    ? `Reconnect ${syncStatus.connectedEmail} to resume sync`
    : syncStatus.isConnected
    ? `Connected as ${syncStatus.connectedEmail}`
    : 'Sync your calendar events and add tasks to your schedule'}
</Text>
```

- [ ] **Step 10.3: Web card — mirror `needsReconnect` state**

Find `model-testing-app/src/app/(mobile)/m-settings/components/GoogleCalendarCard.tsx`. Near the top (around line 10), `syncStatus` is a `useQuery(api.googleCalendar.getSyncStatus, {})` — it will now include `needsReconnect: boolean`.

Find the button-rendering block (around line 86-125). Add a top branch for `needsReconnect`:

Insert before the existing `{syncStatus.isConnected ? (...) : (...)}`:

```tsx
{syncStatus.isConnected && syncStatus.needsReconnect ? (
  <>
    <div className="mb-2 px-3 py-2 rounded-lg text-[12px] font-medium bg-orange-50 text-orange-800">
      Google Calendar disconnected — events no longer update. Reconnect
      to resume sync.
    </div>
    <button
      onClick={handleConnect}
      className="w-full py-2 px-3 text-[13px] font-medium text-[var(--m-text-on-brand)] bg-[var(--m-bg-brand)] rounded-lg active:opacity-80"
    >
      Reconnect Google Calendar
    </button>
  </>
) : syncStatus.isConnected ? (
  // ... existing Sync Now + Disconnect block unchanged ...
) : (
  // ... existing Connect block unchanged ...
)}
```

Keep the existing two-branch ternary exactly as it was inside the `: syncStatus.isConnected ? (...) : (...)` — just wrapping it in the outer conditional.

- [ ] **Step 10.4: Type-check both**

Run: `cd mobile-app && npx tsc --noEmit 2>&1 | grep "GoogleCalendarCard\.tsx"`
Expected: no new errors from the mobile card.

Run: `cd model-testing-app && npx tsc --noEmit 2>&1 | grep "m-settings.*GoogleCalendarCard"`
Expected: no new errors from the web card.

- [ ] **Step 10.5: Commit**

```bash
git add mobile-app/components/settings/GoogleCalendarCard.tsx model-testing-app/src/app/\(mobile\)/m-settings/components/GoogleCalendarCard.tsx
git commit -m "feat(ui): Google Calendar cards — render needsReconnect state + useAction for disconnect"
```

---

## Task 11: Daily brief — surface `needsReconnect`

**Goal:** When the signed-in user's calendar is flagged `needsReconnect`, the daily brief includes a top-level warning item.

**Files:**
- Modify: `model-testing-app/src/app/api/daily-brief/generate/route.ts` (web)
- Modify: `model-testing-app/src/app/api/mobile/daily-brief/generate/route.ts` (mobile)

- [ ] **Step 11.1: Read the existing generate route to understand output shape**

Run: `cat model-testing-app/src/app/api/daily-brief/generate/route.ts | head -200`

Find the spot where the output JSON is assembled (the Claude prompt specifies the shape). Look for lines that define the JSON structure (strings like `"context":`, `"type":`).

- [ ] **Step 11.2: Add a `calendarStatus` query block to the generate route**

After the existing `convex.query(...)` block (around line 25 in the web route):

```ts
// ... existing queries ...
convex.query(api.googleCalendar.getSyncStatus, {}),
```

Add this to the Promise.all destructure. Then, below the destructure, read the returned `calendarStatus`:

```ts
const calendarNeedsReconnect = calendarStatus?.isConnected === true
  && calendarStatus?.needsReconnect === true;
```

- [ ] **Step 11.3: Inject a warning into the Claude context**

Find the section where `context` is built for Claude (string concatenation with tasks/events/etc., around line 36-105 in the web route). After the last context section, add:

```ts
if (calendarNeedsReconnect) {
  // Prepend rather than append so it's prominent in the brief. We don't
  // rely on Claude to do anything with this — we just ensure the UI's
  // rendering of the brief contains the warning string verbatim.
  context = `⚠️ Google Calendar has been disconnected. The user needs to reconnect in Settings to resume event sync.\n\n${context}`;
}
```

Alternatively, if the brief's output JSON has an `alerts` or `warnings` array field, add a row there instead — prefer structured output over string prepending when the shape supports it. Read the prompt's `JSON schema:` section to decide.

- [ ] **Step 11.4: Mirror in the mobile daily-brief route**

Run: `diff model-testing-app/src/app/api/daily-brief/generate/route.ts model-testing-app/src/app/api/mobile/daily-brief/generate/route.ts | head -40`

Apply the same two changes (query + context injection) to the mobile route.

- [ ] **Step 11.5: Type-check + smoke**

Run: `cd model-testing-app && npx tsc --noEmit 2>&1 | grep -E "daily-brief/generate"`
Expected: no new errors from either route.

- [ ] **Step 11.6: Commit**

```bash
git add model-testing-app/src/app/api/daily-brief/generate/route.ts model-testing-app/src/app/api/mobile/daily-brief/generate/route.ts
git commit -m "feat(brief): surface Google Calendar needsReconnect warning"
```

---

## Task 12: Final build + push

**Goal:** Per CLAUDE.md, every plan ends with a production build and a push.

- [ ] **Step 12.1: Run Next.js production build**

Run: `cd model-testing-app && npx next build 2>&1 | tail -20`
Expected: ends with `✓ Compiled successfully` and generates all static pages.
If any errors surface from files we touched (`googleCalendar*.ts`, `crons.ts`, `webhook/route.ts`, `setup-sync/route.ts`, cards, brief routes), fix before proceeding. Pre-existing errors from unrelated files are fine to note and skip.

- [ ] **Step 12.2: Confirm mobile type-check**

Run: `cd mobile-app && npx tsc --noEmit 2>&1 | grep -E "GoogleCalendarCard"`
Expected: no errors from our files.

- [ ] **Step 12.3: Log close — move task (if this plan was tracked in `.logbook/queued/`)**

Check: `ls .logbook/queued/ | grep -i google-calendar-auto-sync` — if a task file exists, move it:

```bash
mv .logbook/queued/<file>.md .logbook/done/$(date +%Y-%m-%d)_<file>.md
```

(If nothing tracked yet, skip — this plan itself is the record.)

Update `.logbook/index.md` if moved. Commit the move:

```bash
git add .logbook/
git commit -m "chore(logbook): close Google Calendar auto-sync task"
```

- [ ] **Step 12.4: Ask controller before pushing**

Controller: before running `git push origin main`, confirm with user per repo git-safety rules. Expected prompt:

> "All 12 tasks landed locally. `npx next build` passes. Ready to push ~20 new commits to origin/main — confirm?"

Only after explicit user confirmation:

```bash
git push origin main
```

---

## Completion criteria

- [x] Schema updated with `needsReconnect`, `channel.token`, `googleCalendarSyncLog` ← Task 1
- [x] `insertSyncLog` + `pruneSyncLog` work ← Task 2
- [x] `markNeedsReconnect` + `getSyncStatus.needsReconnect` + `saveChannel(token)` wired ← Task 3
- [x] `watchCalendar(token)` + setup-sync generates and stores token ← Task 4
- [x] `syncForUser` handles incremental sync, 410 fallback, invalid_grant → needsReconnect ← Task 5
- [x] `autoSyncAll` iterates users + renews expiring channels ← Task 6
- [x] Both crons registered ← Task 7
- [x] Webhook verifies channel-token + fires action ← Task 8
- [x] `disconnect` action calls Google's `channels.stop` ← Task 9
- [x] Both cards render reconnect state + use `useAction` ← Task 10
- [x] Daily brief shows reconnect warning when flag set ← Task 11
- [x] `npx next build` passes; push confirmed with user ← Task 12

## Open items acknowledged in plan but deferred

- **Web Crypto types** — Task 6 uses `crypto.randomUUID` + `crypto.getRandomValues`. Convex V8 runtime supplies them; if `tsc` complains about missing types only, add `/// <reference lib="dom" />` to the file.
- **Disconnect route at `/api/google/disconnect`** — Task 9 step 9.3 reads and adjusts as-found. The route may not exist (web card may call the Convex function directly); skip that step if there's no file.
- **Daily brief output shape** — Task 11 step 11.3 decides between string-prepend and structured-field approach based on what the existing prompt looks like. Implementer reads and decides.
- **Parallelism in `autoSyncAll`** — current impl is serial. If the cron approaches the 10-min action timeout (~300 users), switch to `ctx.scheduler.runAfter(0, internal.googleCalendarSync.syncForUser, {...})` fan-out. Flagged as a future concern, not blocking.
