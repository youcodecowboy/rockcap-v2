# Logbook Inbox

- 2026-04-20 — [backfill] write one-off script to find clients with no entries in `clientFolders` (likely mobile-created before 0b52853) and run the bootstrap helper for each — include idempotency check so re-runs are safe. See commit 0b52853 for the helper.

- 2026-04-18 — [bug] new homepage: clicking a task opens the edit modal instead of the view/detail modal — tap should default to view, with edit as a secondary action (Pencil/MoreVertical)

- 2026-04-22 — [docs] `mobile-app/.env.local.example` should either include the required Convex/Clerk vars (`EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`) or add a header comment noting "assumes Convex + Clerk vars already configured — these add Google Calendar OAuth"

- 2026-04-22 — [cleanup] `convex/googleCalendar.ts` has both `updateSyncToken` (public mutation, no identity check — the comment acknowledges this) and the newer `updateChannelSyncToken` (internal mutation). They do the same thing. Either delete `updateSyncToken` if unused, or add an identity check. Grep for callers first.

- 2026-04-22 — [feature] `syncForUser` in `convex/googleCalendarSync.ts` upserts cancelled events via `upsertGoogleEvent` without branching — so events cancelled on Google's side linger in Convex (marked `status: 'cancelled'`, filtered by queries, but taking up rows). The existing `deleteByGoogleEventId` helper could be wired in: branch on `gEvent.status === 'cancelled'` to hard-delete instead of upsert.

- 2026-04-22 — [observability] `/api/google/webhook` returns 200 without a sync-log row when `CONVEX_DEPLOY_KEY` is missing — operators have zero visibility that webhooks are silently no-op'ing. Add a log-row write in that branch.

- 2026-04-22 — [observability] `autoSyncAll` in `convex/googleCalendarSync.ts` returns `{processed, errors}` but doesn't write a tick-level log row — only per-user rows. Consider a cron-summary row for tick visibility.

- 2026-04-22 — [scale] `listActiveSyncUserIds` does `.collect()` across all `googleCalendarTokens`. Fine up to ~1-2K connected calendars; if we approach 5K+, add a `by_needsReconnect` index and filter at the DB layer.
