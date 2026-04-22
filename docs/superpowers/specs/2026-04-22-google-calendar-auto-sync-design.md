# Google Calendar Auto-Sync — Design

Created: 2026-04-22
Status: approved (brainstorming → plan next)
Related completed task: `.logbook/done/2026-04-18_google-calendar-mobile-oauth-and-events-fix.md` (OAuth connect flow)

## Goal

Every connected Google Calendar user's events stay fresh in Convex without them needing to tap "Sync Now". Webhook-driven when reachable (seconds of latency), cron-driven otherwise (≤30 min latency). Channel expiration handled automatically.

## Context

The OAuth task (closed 2026-04-22) built the connect flow and token storage. It also happens to register a push-channel with Google during `/api/google/setup-sync` — Google promises to POST to `/api/google/webhook` when the user's calendar changes. But the webhook handler today is a stub that only logs and acknowledges; it does not trigger any sync work. So the only way to get fresh events is to manually trigger `setup-sync` again.

Four related gaps need to close for auto-sync to actually work:

1. **Webhook handler is a no-op** — `model-testing-app/src/app/api/google/webhook/route.ts` logs the channel-id and returns 200. It does not fetch new events.
2. **No channel renewal** — Google push channels expire after ~7 days. Without renewal, push delivery silently stops.
3. **No fallback** — if webhook delivery fails, is blocked, or is unreachable (localhost dev), events never update.
4. **Disconnect leaks channels** — the `disconnect` mutation deletes local rows but does not call Google's `channels.stop`; Google keeps firing webhooks to the dead endpoint for up to 7 days.

## Non-goals

- Multi-calendar support. We still sync the primary calendar only.
- Parallel per-user syncing in the cron. Serial is fine up to a few hundred users; we'll revisit at scale.
- Alerts / paging on sync failures. The sync log table is queryable ad-hoc; that's enough observability for this size of team.
- Client-side optimistic updates. Convex live queries handle this for free.
- Custom sync granularity (e.g., "sync only next 7 days"). Incremental via Google's `syncToken` gives us everything Google knows about.
- Migration of existing channels. We keep the existing `/api/google/webhook` Next.js endpoint so channels registered during the OAuth task keep working without re-registration.

## Approach

A single shared Convex action (`internal.googleCalendarSync.syncForUser`) does the sync work. It is invoked from three places:

- **Push webhook** — `/api/google/webhook` (Next.js route) looks up which user the incoming channel belongs to and calls the action.
- **Cron** — `internal.googleCalendarSync.autoSyncAll` runs every 30 min, iterates connected users serially, calls the shared action for each. Also renews any channel whose expiration is within 24 hours.
- **Manual** — future entry points (e.g., a "resync after error" button) call the same action with `trigger: 'manual'`.

The action uses Google's `syncToken` for incremental reads (cheap, idempotent, exact). If the stored `syncToken` is invalid (Google returns 410), the action falls back to a full 30-day window re-sync and stores the new `syncToken`.

Why this shape:

- **One implementation of sync, many callers.** Deduplication concerns (webhook and cron firing around the same time for the same user) reduce to "Google returns the same events for the same syncToken" + "upsert is idempotent by `googleEventId`". No locking needed.
- **Webhook route stays Next.js for migration safety.** Existing channels are registered with `/api/google/webhook`. Switching to a Convex HTTP action would require either re-registering all channels or running both endpoints. Not worth the hop-count saving.
- **Channel renewal in the same cron tick as sync.** Avoids a second cron job. 99% of ticks skip renewal because `expiration - now > 24h` — essentially free.
- **Refresh-token failures are first-class state, not a silent log line.** A `needsReconnect` flag on the tokens row lets the UI render a reconnect CTA and lets the daily brief mention the disconnect without modeling error states ad-hoc.

## Architecture

```
           ┌────────────────┐
           │ Google Calendar│
           └───┬────────────┘
               │ push notification
               ▼
      ┌──────────────────┐                    ┌──────────────────┐
      │ /api/google/     │                    │  Convex cron     │
      │   webhook        │                    │  every 30 min    │
      │  (Next.js)       │                    │ (all users)      │
      └───┬──────────────┘                    └────┬─────────────┘
          │ convex.action(syncForUser)             │ iterates tokens,
          ▼                                        ▼ runAction(syncForUser)
      ┌────────────────────────────────────────────────────────┐
      │ internal.googleCalendarSync.syncForUser (Convex action) │
      │                                                          │
      │  1. load tokens + channel for user                       │
      │  2. refresh access_token if within 5m of expiry          │
      │  3. listEvents(syncToken) — incremental                  │
      │     falls back to fullResyncWithWindow(30d) on 410       │
      │  4. upsert into events via syncGoogleEvent               │
      │     (cancelled events just flip status; existing         │
      │      events queries already filter them out)             │
      │  5. write new syncToken to googleCalendarChannels        │
      │  6. insert googleCalendarSyncLog row                     │
      │                                                          │
      │  Error classes:                                          │
      │   invalid_grant  → markNeedsReconnect, log, return       │
      │   410 Gone       → fullResyncWithWindow, continue        │
      │   rate_limit     → backoff 1s/4s/16s, log final          │
      │   other          → log, return                           │
      └────────────────────────────────────────────────────────┘
```

## Components

### Schema changes

**`googleCalendarTokens`** (existing) — add optional field:
- `needsReconnect: v.optional(v.boolean())` — set `true` when token refresh fails with `invalid_grant`. Sync skips users with this flag until they reconnect (reconnect clears it via `saveTokens`).

**`googleCalendarChannels`** (existing) — add field:
- `token: v.string()` — 32-byte random opaque string generated at `watchCalendar` time. Passed to Google via the `channels.watch` `token` parameter. Google returns it in every webhook as `x-goog-channel-token`. Webhook route verifies it matches the stored value before invoking the sync action. Treated as a per-channel secret.

**`googleCalendarSyncLog`** (new) — one row per sync run:

```ts
defineTable({
  userId: v.id("users"),
  ranAt: v.string(),          // ISO
  trigger: v.union(v.literal("webhook"), v.literal("cron"), v.literal("manual")),
  status: v.union(v.literal("ok"), v.literal("error"), v.literal("skipped")),
  eventsSynced: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  error: v.optional(v.string()),
})
  .index("by_user_ran_at", ["userId", "ranAt"])
  .index("by_ran_at", ["ranAt"])
```

Rows older than 14 days are pruned by a daily cron at UTC 3:30.

### New Convex files

- **`convex/googleCalendarSync.ts`** — sync logic lives here so `googleCalendar.ts` (~430 lines already) doesn't balloon past the point of being easy to read. Contains:
  - `syncForUser` (internal action) — the canonical sync body.
  - `autoSyncAll` (internal action) — cron entry point; iterates connected users, calls `syncForUser`, handles channel renewal.
  - `fullResyncWithWindow` (helper, not exported) — called on 410 or missing syncToken.
  - `renewChannelIfExpiring` (helper) — called from `autoSyncAll` after each user sync.

- **`convex/googleCalendarLog.ts`** — small, focused. Contains:
  - `insertSyncLog` (internalMutation) — called from `syncForUser`.
  - `pruneSyncLog` (internalAction) — daily cron entry point.

### Modified Convex files

- **`convex/googleCalendar.ts`**
  - Add `markNeedsReconnect` (internalMutation) — sets the flag on the user's tokens row.
  - Modify `disconnect` — today it's a mutation. Split into a public `disconnect` **action** that first calls Google's `channels.stop` (HTTP call, must be in action) then calls a new internal `disconnectCleanup` mutation that deletes the rows. The existing mutation name is kept for backwards compatibility (mobile card and web card already call `api.googleCalendar.disconnect` via `useMutation`; they need to switch to `useAction`).
  - Modify `saveTokens` — when a reconnect happens, clear any lingering `needsReconnect: true`.
  - Modify `saveChannel` — accept and persist a new `token` arg.
  - Modify `getSyncStatus` — include `needsReconnect` in the returned object so both mobile and web cards can read it.

- **`convex/schema.ts`** — add `needsReconnect` to `googleCalendarTokens`, add `googleCalendarSyncLog` table.

### Modified Next.js files

- **`model-testing-app/src/lib/google/calendar.ts`** — modify `watchCalendar(accessToken, webhookUrl, channelId)` signature to accept an additional `token: string` parameter and forward it to Google in the request body (`{ id, type, address, token }`). Also modify `/api/google/setup-sync/route.ts` to generate a random 32-byte token, pass it to `watchCalendar`, and include it in the `saveChannel` mutation call.

- **`model-testing-app/src/app/api/google/webhook/route.ts`** — replace the no-op body with:
  - Short-circuit `x-goog-resource-state === 'sync'` (Google's initial handshake) with 200.
  - Look up channel via `api.googleCalendar.getChannelByChannelId(channelId)`.
  - Verify `x-goog-channel-token` header matches `channel.token` (stored at watch time). If not, return 401.
  - Invoke the internal action via a deploy-key-authenticated `ConvexHttpClient` (see "Env" below): `client.action(internal.googleCalendarSync.syncForUser, { userId: channel.userId, trigger: 'webhook' })`. Fire-and-forget — don't `await`; return 200 immediately so we stay within Google's 10s timeout.
  - Google will not let us attach custom headers to webhook POSTs, so we use its native `token` mechanism (set via `channels.watch`'s `token` field, returned as `x-goog-channel-token`) as our authentication.

### Modified mobile files

- **`mobile-app/components/settings/GoogleCalendarCard.tsx`**
  - Read `syncStatus.needsReconnect` (new field on query result — the query already returns the full tokens row, just need `getSyncStatus` to project the flag).
  - If true, render a warning-tinted connected state: orange card background, text "Google Calendar needs reconnecting", button "Reconnect Google Calendar" (same handler as the initial Connect — OAuth flow re-runs, `saveTokens` clears the flag).
  - Switch `disconnect` from `useMutation` to `useAction` (minimal code change — same argument shape, same return type).

### Modified web files

- **`model-testing-app/src/app/(mobile)/m-settings/components/GoogleCalendarCard.tsx`** — mirror the same `needsReconnect` state. Same logic, web JSX.
- **`convex/googleCalendar.ts::getSyncStatus`** — add `needsReconnect` to the returned object so both cards can read it.

### Modified daily brief

- **Daily brief assembly (location TBD — search `dailyBriefs.ts` in plan)** — if the current user's `googleCalendarTokens.needsReconnect` is true, prepend a warning item: "⚠️ Google Calendar needs reconnecting — tap Settings".

### New cron entries

**`convex/crons.ts`** — two additions:

```ts
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

### New env vars

- `CONVEX_DEPLOY_KEY` — on Vercel, scoped to the production Convex deployment (and a separate value on preview env for preview builds). Lets the webhook route call internal Convex actions via `ConvexHttpClient.setAuth(<deploy-key>)`. Already standard Convex setup; verify presence in `vercel env list`.
- No new shared secret needed for the webhook — Google's `x-goog-channel-token` mechanism (see **Risks**) provides per-channel authentication. The `channel.token` value is a random 32-byte string generated when we register the channel and stored on the `googleCalendarChannels` row.

## Data flow — sync tick detail

### Webhook path (fast)

1. Google POSTs to `/api/google/webhook` with headers `x-goog-channel-id`, `x-goog-channel-token`, `x-goog-resource-state`.
2. Route short-circuits `resource-state === 'sync'` (Google's initial handshake ping) with `{ ok: true }`.
3. Route queries `api.googleCalendar.getChannelByChannelId` — if no row, return 404 `{ error: 'Unknown channel' }` (benign during the window after a disconnect; Google stops retrying after a few 404s).
4. Route checks `channel.token === x-goog-channel-token`. Mismatch → 401.
5. Route calls `client.action(internal.googleCalendarSync.syncForUser, { userId: channel.userId, trigger: 'webhook' })` via a `ConvexHttpClient` authenticated with `CONVEX_DEPLOY_KEY`. Does NOT `await` — fire-and-forget so the action can exceed Google's 10s webhook timeout without Google retrying.
6. Return 200 `{ ok: true }` immediately.

### Cron path (reliable)

1. Convex cron fires every 30 min → `internal.googleCalendarSync.autoSyncAll`.
2. Action queries `googleCalendarTokens` where `!needsReconnect` — list of userIds.
3. Loop serially:
   - `await ctx.runAction(internal.googleCalendarSync.syncForUser, { userId, trigger: 'cron' })`
   - Inside `syncForUser`, after events are synced, call `renewChannelIfExpiring(userId)`.
4. Individual user failures don't break the loop (each iteration try/caught; log-and-continue).

### Channel renewal detail

Inside `renewChannelIfExpiring(userId)`:
1. Load `googleCalendarChannels` row for user.
2. If no row, return (user has no active channel — shouldn't happen but defensive).
3. Parse `expiration` (ISO or Google's ms-since-epoch string).
4. If `expiration - now > 24h`, return.
5. Otherwise:
   - Call `stopChannel(accessToken, existing.channelId, existing.resourceId)`.
   - Call `watchCalendar(accessToken, webhookUrl, newChannelId)`.
   - Upsert the new channel row with the new `channelId`, `resourceId`, `expiration`. Preserve `syncToken`.

### Disconnect flow (with channel cleanup)

1. Mobile/web card calls `api.googleCalendar.disconnect` (now an action, not a mutation).
2. Action loads tokens + channel.
3. Action calls `stopChannel(accessToken, channelId, resourceId)` — wrapped in try/catch, failure logged but not propagated (we want disconnect to succeed locally even if Google is unreachable).
4. Action calls internal mutation `disconnectCleanup` which deletes the token and channel rows.

### Full resync fallback

Inside `fullResyncWithWindow(userId, accessToken)`:
1. Call `listEvents(accessToken, { timeMin: now, timeMax: now+30d })` — no syncToken.
2. Upsert events.
3. Store the response's `nextSyncToken` on the channel row — future incremental syncs use it.
4. Log a `status: 'ok'` row with a note in `error` field: "fallback: full window resync after syncToken invalid".

## Error handling

| Error | Detected by | Response |
|-------|-------------|----------|
| `invalid_grant` on token refresh | `refreshAccessToken` throws | Call `markNeedsReconnect(userId)`. Log `status: 'error'` with `error: 'invalid_grant'`. Return from action. Daily brief surfaces this; card shows reconnect state. |
| 410 Gone on `listEvents(syncToken)` | HTTP status 410 | Call `fullResyncWithWindow`. Log `status: 'ok'` with explanatory note. Continue. |
| 403/429 rate limit | HTTP status in {403, 429} | Exponential backoff within the action: retry after 1s, 4s, 16s. If all 3 fail, log `status: 'error'` and return. |
| Generic network failure on any Google call | `fetch` throws | Log `status: 'error'` with the error message. Return — next tick retries. |
| Individual event upsert fails | `runMutation(syncGoogleEvent)` throws | Log per-event warning, continue syncing remainder. Do not fail the whole sync. |
| Webhook: unknown channel | `getChannelByChannelId` returns null | Return 404 to Google. (Google will stop retrying after a handful of 404s — correct behavior when a channel has been stopped.) |
| Webhook: channel token mismatch | `x-goog-channel-token` header doesn't match stored `channel.token` | Return 401. Do not invoke the action. Log the attempt (possible stale channel or spoofed request). |

All non-webhook errors write one row to `googleCalendarSyncLog`. Webhook errors log console-side via Next.js but don't touch the sync-log table (the webhook is just a trigger; the action writes the log).

## Environment

- **Dev (localhost):** webhook delivery is not possible (Google can't reach localhost). The cron-every-30-min path carries sync. Testing of the webhook path requires a public URL — Vercel preview works, as does `ngrok http 3000` pointed at the env var `GOOGLE_OAUTH_REDIRECT_URI`.
- **Prod (Vercel):** both webhook and cron work. Channel renewal ensures uninterrupted push delivery.
- **Env vars required:**
  - Existing: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `NEXT_PUBLIC_CONVEX_URL`
  - New: `GOOGLE_WEBHOOK_SECRET` — generate a random 32-byte string, set on Vercel (for the webhook route) and Convex (for the action's optional belt-and-braces check).

## Testing

### Convex CLI

```
npx convex run googleCalendarSync:syncForUser '{"userId":"<someId>","trigger":"manual"}'
```

Expected:
- Writes a row to `googleCalendarSyncLog`.
- Returns `{ ok: true, eventsSynced: <N> }`.

```
npx convex run googleCalendarSync:autoSyncAll '{}'
```

Expected:
- Iterates all non-needsReconnect users.
- Writes one log row per user.
- Completes in under 10 minutes (Convex action timeout).

### Manual on Vercel preview

1. Deploy branch to Vercel preview; set `GOOGLE_OAUTH_REDIRECT_URI` on the preview to match.
2. Connect a Google account on mobile pointed at the preview.
3. Edit an event in Google Calendar (change time).
4. Within ~60s: mobile Tasks screen shows the updated time. Check `googleCalendarSyncLog` — row with `trigger: 'webhook'`, `status: 'ok'`.
5. Create a new event in Google Calendar. Appears on mobile Tasks within ~60s.
6. Delete an event in Google Calendar. Disappears from Tasks within ~60s (via `status: 'cancelled'` flip + existing query filter).

### Cron fallback

1. Block the webhook route temporarily (e.g., return 500 from it).
2. Edit event on Google.
3. Webhook retries fail silently.
4. Within 30 min: the cron tick picks up the change. Log row has `trigger: 'cron'`.

### Channel renewal

1. Connect, then manually `UPDATE googleCalendarChannels` to set `expiration` to 23h from now.
2. Run `autoSyncAll` (via Convex CLI).
3. Check that the channel row is replaced with a new `channelId`, `resourceId`, and `expiration` ~7 days from now.

### Refresh-token failure

1. Manually revoke the app at myaccount.google.com → Security → Third-party apps.
2. Wait for next cron tick (or trigger manually).
3. Expected: `googleCalendarTokens.needsReconnect = true`, `googleCalendarSyncLog` row with `status: 'error'`, `error: 'invalid_grant'`.
4. Reopen mobile Settings: card shows "Reconnect Google Calendar" state.
5. Tap Reconnect: OAuth flow re-runs, `saveTokens` clears the flag, sync resumes.

### Web regression

- Existing web `/m-settings` card still works: shows Connected / Reconnect / Disconnect as appropriate.
- Web "Sync Now" button still works (it still hits `/api/google/setup-sync`, unchanged).

## Risks

1. **Webhook secret in the URL path vs header.** Google's `channels.watch` spec only sends the `address` (URL). It does not let us attach a custom header like `x-webhook-secret`. So the secret must be:
   - In the URL path, OR
   - Validated via the `x-goog-channel-token` header which Google WILL pass through if we set it during `watchCalendar`.
   Go with `x-goog-channel-token` — Google supports it (`channels.watch` has a `token` field). Store the token in `googleCalendarChannels.token`, verify it in the webhook route.

2. **Race between cron and webhook updating syncToken.** Both may read syncToken=X, fetch events, get nextSyncToken=Y, write it back. No harm: events are idempotent, final state is correct. Worst case a few duplicate API calls, which is why we use syncToken (cheap) instead of a full resync.

3. **Long cron tick blocking.** With 100+ users, serial sync could exceed 10 min action timeout. Mitigations: (a) serial but fast (each user ~1-2s); (b) if we hit the ceiling, switch to fan-out using `ctx.scheduler.runAfter(0, internal.googleCalendarSync.syncForUser, {...})` so each user runs in its own action. Mark this as "revisit at 100+ users" in the plan.

4. **Disconnect now returns a Promise (was fire-and-forget).** The mobile card currently calls `disconnect({})` without awaiting the channels.stop. Switching to an action means the UI briefly shows "Disconnecting..." while Google's stopChannel is called. If Google is slow/unreachable, the UI waits. Fix: make the action return immediately after deleting Convex rows, schedule the Google call via `ctx.scheduler.runAfter(0, internal.googleCalendar.stopGoogleChannel, {...})`. UX stays snappy; Google cleanup happens in the background.

5. **Webhook route invokes Convex action — blocking or fire-and-forget?** Google's webhook endpoint has a 10-second timeout. The action can take longer (a user with many events, with rate limits). Fire-and-forget via `scheduler.runAfter(0, ...)` from the route is the right shape. Route returns 200 within milliseconds; sync runs in the background.

## Completion criteria

- [ ] `googleCalendarSyncLog` table exists; rows written per sync run.
- [ ] `needsReconnect` flag exists; `markNeedsReconnect` internalMutation works.
- [ ] `internal.googleCalendarSync.syncForUser` runs end-to-end via `convex run`.
- [ ] `autoSyncAll` cron registered and visible in `npx convex dashboard`.
- [ ] Log-prune cron registered.
- [ ] Webhook route invokes the action; Google edit → mobile update within 60s on Vercel preview.
- [ ] Channel renewal verified by manual expiration override.
- [ ] Refresh-token failure path verified: card flips to reconnect state, daily brief mentions it, reconnect clears the flag.
- [ ] `npx next build` passes.
- [ ] Committed and pushed (with user consent).

## Open items deferred to the plan

- Exact file location of daily brief assembly and the shape of the `needsReconnect` surfacing there. Spec says "prepend a warning item" — plan step will read `dailyBriefs.ts` and insert the concrete code.
- Whether to keep `/api/google/setup-sync` as-is or extract its sync body into the new `syncForUser` action. Tempting to consolidate but risk is regressing web "Sync Now". Plan step will decide after reading the current route.
- Exact format of the `x-goog-channel-token` — at minimum a signed opaque string. Plan will specify.
