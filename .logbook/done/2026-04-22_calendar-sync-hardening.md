# Calendar sync hardening

Created: 2026-04-22
Status: done
Tags: #calendar #convex #backend #observability
Source:
  - 2026-04-22 — [cleanup] `convex/googleCalendar.ts` has both `updateSyncToken` (public mutation, no identity check — the comment acknowledges this) and the newer `updateChannelSyncToken` (internal mutation). They do the same thing. Either delete `updateSyncToken` if unused, or add an identity check. Grep for callers first.
  - 2026-04-22 — [feature] `syncForUser` in `convex/googleCalendarSync.ts` upserts cancelled events via `upsertGoogleEvent` without branching — so events cancelled on Google's side linger in Convex (marked `status: 'cancelled'`, filtered by queries, but taking up rows). The existing `deleteByGoogleEventId` helper could be wired in: branch on `gEvent.status === 'cancelled'` to hard-delete instead of upsert.
  - 2026-04-22 — [observability] `/api/google/webhook` returns 200 without a sync-log row when `CONVEX_DEPLOY_KEY` is missing — operators have zero visibility that webhooks are silently no-op'ing. Add a log-row write in that branch.
  - 2026-04-22 — [observability] `autoSyncAll` in `convex/googleCalendarSync.ts` returns `{processed, errors}` but doesn't write a tick-level log row — only per-user rows. Consider a cron-summary row for tick visibility.
Priority: medium

## Notes

Shipped 2026-04-22 in commit 8b624fc. Four sub-items landed together:

1. **Dedup mutation** — deleted unused public `updateSyncToken` in
   `convex/googleCalendar.ts`. Zero runtime callers; the
   `updateChannelSyncToken` internal mutation was its proper
   replacement. Stale comment also removed.

2. **Cancelled events → hard-delete** — branched the event-upsert loop
   in `syncForUser` on `gEvent.status === "cancelled"`. Cancelled
   events arrive without a `summary` field, so the check runs BEFORE
   the `!summary` skip (otherwise deletions were silently dropped).
   Converted `deleteByGoogleEventId` from public mutation to
   `internalMutation` while wiring it in (no external callers).

3. **Webhook missing-deploy-key observability** — added narrow public
   `recordWebhookBootstrapError` mutation in `convex/googleCalendarLog.ts`,
   gated on channelId (128-bit UUID known only to Google + our DB).
   `/api/google/webhook` now writes a sync-log row in the
   `!CONVEX_DEPLOY_KEY` branch instead of silently 200-ing.

4. **Tick-summary log row** — `googleCalendarSyncLog` schema now has
   optional `userId` + new `usersProcessed` / `userErrors` fields.
   New `insertTickSummaryLog` internal mutation + `autoSyncAll` call
   at end of cron tick. Operators can scan `by_ran_at` for tick-level
   health without fanning out over per-user rows.
