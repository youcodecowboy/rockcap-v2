# Calendar sync hardening

Created: 2026-04-22
Status: queued
Tags: #calendar #convex #backend #observability
Source:
  - 2026-04-22 — [cleanup] `convex/googleCalendar.ts` has both `updateSyncToken` (public mutation, no identity check — the comment acknowledges this) and the newer `updateChannelSyncToken` (internal mutation). They do the same thing. Either delete `updateSyncToken` if unused, or add an identity check. Grep for callers first.
  - 2026-04-22 — [feature] `syncForUser` in `convex/googleCalendarSync.ts` upserts cancelled events via `upsertGoogleEvent` without branching — so events cancelled on Google's side linger in Convex (marked `status: 'cancelled'`, filtered by queries, but taking up rows). The existing `deleteByGoogleEventId` helper could be wired in: branch on `gEvent.status === 'cancelled'` to hard-delete instead of upsert.
  - 2026-04-22 — [observability] `/api/google/webhook` returns 200 without a sync-log row when `CONVEX_DEPLOY_KEY` is missing — operators have zero visibility that webhooks are silently no-op'ing. Add a log-row write in that branch.
  - 2026-04-22 — [observability] `autoSyncAll` in `convex/googleCalendarSync.ts` returns `{processed, errors}` but doesn't write a tick-level log row — only per-user rows. Consider a cron-summary row for tick visibility.
Priority: medium

## Notes
