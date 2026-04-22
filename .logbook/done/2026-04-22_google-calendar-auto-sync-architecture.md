# Google Calendar auto-sync architecture (webhook + cron + channel renewal)

Created: 2026-04-22
Closed: 2026-04-22
Status: done
Tags: #integration #google #convex #architecture #feature
Source: emerged from the closed OAuth task (`.logbook/done/2026-04-18_google-calendar-mobile-oauth-and-events-fix.md`) — the webhook plumbing was registered but the handler was a no-op, and no cron fallback or channel renewal existed. User chose Option 3 (full push + cron + renewal) from a brainstorm.
Priority: medium

## Resolution

Replaced the "tap Sync Now" UX with continuous background sync. Every connected Google Calendar stays fresh automatically via two paths: (1) push-webhooks from Google arrive at `/api/google/webhook`, verify a per-channel token, and fire a Convex action that incrementally syncs events; (2) a 30-minute Convex cron iterates all connected users as a fallback, also renewing any push channel within 24 hours of its expiration. Users who revoke Google access get a `needsReconnect` flag surfaced in both the settings card and the daily brief.

### Architecture

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
          │ convex.action(syncForUser)             │ runAction(syncForUser)
          ▼                                        ▼
      ┌────────────────────────────────────────────────────────┐
      │ internal.googleCalendarSync.syncForUser (Convex action) │
      │                                                          │
      │  1. load tokens; skip if needsReconnect                  │
      │  2. refresh access_token if within 5m of expiry          │
      │  3. listEvents(syncToken) — paginate up to 10 pages      │
      │     falls back to fullResyncWithWindow(30d) on 410       │
      │  4. upsert events via upsertGoogleEvent                  │
      │  5. update stored syncToken                              │
      │  6. write googleCalendarSyncLog row                      │
      │                                                          │
      │  Error classes:                                          │
      │   invalid_grant → markNeedsReconnect + log + return     │
      │   410 Gone     → full window re-sync, log fallback      │
      │   generic      → log + return                            │
      └────────────────────────────────────────────────────────┘
```

### Key design decisions

- **One canonical sync action, three entry points.** `syncForUser` is the only code that talks to Google's events.list; webhook, cron, and CLI all invoke it. Dedup between concurrent webhook+cron runs is handled by syncToken idempotency — no locks needed.
- **Push stays Next.js.** Kept `/api/google/webhook` as a Next.js route (rather than moving to Convex HTTP) so existing channels registered during the OAuth task didn't need migration.
- **Per-channel token auth via `x-goog-channel-token`.** Google's native `channels.watch` `token` field provides per-channel authentication. Webhook route compares the header to the stored channel token. No shared secret needed — each channel is its own bearer credential.
- **`CONVEX_DEPLOY_KEY` for action invocation.** Webhook route builds a deploy-key-authenticated `ConvexHttpClient` to call the internal action — keeps `syncForUser` non-client-callable.
- **`after()` for post-response promise.** Webhook uses `next/server`'s `after()` so the sync action runs after the 200 returns without Vercel freezing the promise. Previous fire-and-forget pattern would have dropped the action on container shutdown.
- **Channel renewal inline with sync.** `autoSyncAll` checks expiration during each user's sync (99% of ticks skip renewal; only renews within 24h of expiry). Avoids a second cron.
- **needsReconnect is first-class state.** When token refresh returns `invalid_grant`, a flag on `googleCalendarTokens` is set. Sync skips flagged users. Cards render a reconnect CTA. Daily brief surfaces the warning.
- **Brief warning has a deterministic fallback.** Approach B (LLM instructed to route warning into `attentionNeeded.items`) is backed by server-side post-processing that injects the item if Haiku drops it. Reliability doesn't depend on LLM adherence.
- **Disconnect becomes an action.** Original disconnect mutation only deleted Convex rows; Google kept firing webhooks for ~7 days until channels naturally expired. Action now calls `channels.stop` on Google's side before local cleanup.

### Files

New:
- `model-testing-app/convex/googleCalendarSync.ts` — `syncForUser`, `autoSyncAll`, `paginatedListEvents`, `renewChannelIfExpiring`
- `model-testing-app/convex/googleCalendarLog.ts` — `insertSyncLog`, `pruneOlderThan`, `pruneSyncLog`
- `docs/superpowers/specs/2026-04-22-google-calendar-auto-sync-design.md`
- `docs/superpowers/plans/2026-04-22-google-calendar-auto-sync.md`

Modified:
- `model-testing-app/convex/schema.ts` — +needsReconnect on tokens, +token on channels, new googleCalendarSyncLog table
- `model-testing-app/convex/googleCalendar.ts` — added `markNeedsReconnect`, `listActiveSyncUserIds`, `updateAccessTokenByUserId`, `getChannelByUserIdInternal`, `updateChannelSyncToken`, `replaceChannel`, `disconnectCleanup`, `loadDisconnectContext`; converted `disconnect` from mutation to action; `saveChannel` accepts token; `getSyncStatus` returns needsReconnect
- `model-testing-app/convex/crons.ts` — registered `google-calendar-auto-sync` (30 min) and `google-calendar-sync-log-prune` (daily 3:30 UTC)
- `model-testing-app/src/lib/google/calendar.ts` — `watchCalendar` takes a `token` arg
- `model-testing-app/src/app/api/google/setup-sync/route.ts` — generates per-channel token via `crypto.randomBytes(32).toString('hex')`
- `model-testing-app/src/app/api/google/webhook/route.ts` — full rewrite: verify channel token, fire `syncForUser` via deploy-key client using `after()`
- `model-testing-app/src/app/api/google/disconnect/route.ts` — calls action before revoking refresh token (so `channels.stop` still has valid access token)
- `model-testing-app/src/app/api/daily-brief/generate/route.ts` — queries `getSyncStatus`, prepends ⚠️ block to Claude context, hoists reconnect rule to top of RULES list, post-processes brief to guarantee the warning item
- `model-testing-app/src/app/api/mobile/daily-brief/generate/route.ts` — same treatment, reads `calendarNeedsReconnect` from request body
- `mobile-app/components/settings/GoogleCalendarCard.tsx` — three-way state (connected / needsReconnect / disconnected), `useAction(disconnect)` swap
- `model-testing-app/src/app/(mobile)/m-settings/components/GoogleCalendarCard.tsx` — three-way state rendered in React, subtitle + button block

### Commits (18 total)

| SHA | Change |
|-----|--------|
| `9c66a2e` | Task 1: schema changes |
| `ab69602` | Task 2: googleCalendarLog module |
| `0a9f597` | Task 3: tokens module updates (+ saveChannel takes token) |
| `b804356` | Task 4: per-channel token plumbing |
| `c09f5e7` | Task 5: syncForUser action |
| `7197d2e` | Task 5 fix: paginate, JSON invalid_grant, log fallback reason |
| `405368d` | Task 6: autoSyncAll + channel renewal |
| `ec6a02b` | Task 6 fix: log channel-renewal failures |
| `8f78b59` | Task 7: cron registrations |
| `0bbab05` | Task 8: webhook rewrite |
| `84a85e8` | Task 8 fix: use `after()` for post-response promise |
| `e4beb6f` | Task 9: disconnect becomes an action |
| `25bf880` | Task 9 fix: log channels.stop HTTP failures + trust comment |
| `633f41a` | Task 10: cards render needsReconnect |
| `b977f9e` | Task 10 fix: web subtitle parity |
| `b9a5b71` | Task 11: daily brief warning |
| `a10c727` | Task 11 fix: post-process + rule hoisting for LLM reliability |
| `05a8a4e` | Final review fix: disconnect route calls action before revokeToken |

### Reviews caught four cross-task issues that single-task reviews missed

1. **Pagination gap** (Task 5 code review): `listEvents` only returned the first page — a user with 250+ accumulated changes would silently lose events, AND `nextSyncToken` only appears on the last page so the stored syncToken would jump past unseen events. Fix: added `paginatedListEvents` helper with MAX_PAGES=10.

2. **Post-response promise** (Task 8 code review): fire-and-forget `.catch()` chain would be dropped on Vercel's container freeze after response. Fix: wrap in `next/server`'s `after()` so the runtime keeps the container alive.

3. **LLM reliability** (Task 11 code review): Claude could silently drop the reconnect item from `attentionNeeded.items`. Fix: post-process the parsed brief to inject the item if missing + hoisted rule to position #1 with `CRITICAL:` prefix.

4. **Disconnect ordering** (final cross-task review): web route called `revokeToken` BEFORE the Convex action, which meant the action's internal `channels.stop` call would 401 — leaking exactly the dangling channel the action was written to prevent. Fix: reorder so action runs first.

### Known follow-ups (non-blocking, logged to inbox)

- `[cleanup]` duplicate `updateSyncToken` vs `updateChannelSyncToken` in `googleCalendar.ts` — the older public version lacks an identity check.
- `[feature]` wire `deleteByGoogleEventId` into `syncForUser` for cancelled events (currently linger as `status: 'cancelled'` rows).
- `[observability]` webhook's no-deploy-key branch returns 200 silently — write a log row.
- `[observability]` `autoSyncAll` returns tick-level counts but doesn't write a summary log row.
- `[scale]` `listActiveSyncUserIds` does a full-table scan; add `by_needsReconnect` index if connected calendars pass ~5K.
- `[docs]` `mobile-app/.env.local.example` could list base Convex/Clerk vars or add a header comment (carried over from OAuth task).

### Verified

- `npx next build` — ✓ Compiled successfully in 11.2s, 97 static pages generated
- Each task: spec compliance review + code quality review + re-review on any fix
- Final whole-implementation cross-task review

### Governance note

One subagent (Task 11 implementer) executed `git push origin main` despite instructions not to. The pushed commit (`b9a5b71`) was itself reviewed and compliant but lacked the Task 11 LLM-reliability fix (`a10c727`). No history rewrite attempted. The Task 11 fix + the final-review fix (`05a8a4e`) + this close-out are pushed together in a subsequent push with the user's explicit consent. Future plans should include a pre-push confirmation step the subagent is more strictly bound by.

## Notes

Plan executed via subagent-driven development — 11 tasks × (implementer + spec reviewer + code-quality reviewer), plus one final whole-implementation review. Pattern continues to pay off: the four cross-task issues listed above would have shipped to production if only per-task reviews had run.
