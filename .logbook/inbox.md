# Logbook Inbox

- 2026-04-20 — [backfill] write one-off script to find clients with no entries in `clientFolders` (likely mobile-created before 0b52853) and run the bootstrap helper for each — include idempotency check so re-runs are safe. See commit 0b52853 for the helper.

- 2026-04-18 — [bug] new homepage: clicking a task opens the edit modal instead of the view/detail modal — tap should default to view, with edit as a secondary action (Pencil/MoreVertical)

- 2026-04-22 — [hygiene] Google Calendar disconnect should also call Google's `channels.stop` to release the push-webhook channel server-side. Currently `disconnect` mutation only deletes Convex rows; Google keeps firing webhooks to `/api/google/webhook` until the channel expires (up to 7 days). Silent waste, not a functional bug. See `model-testing-app/convex/googleCalendar.ts` `disconnect` mutation (lines ~334-350)

- 2026-04-22 — [docs] `mobile-app/.env.local.example` should either include the required Convex/Clerk vars (`EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`) or add a header comment noting "assumes Convex + Clerk vars already configured — these add Google Calendar OAuth"
