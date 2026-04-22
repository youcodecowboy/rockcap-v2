# Backfill clientFolders for legacy mobile-created clients

Created: 2026-04-22
Status: done
Tags: #mobile #data #backfill
Source:
  - 2026-04-20 — [backfill] write one-off script to find clients with no entries in `clientFolders` (likely mobile-created before 0b52853) and run the bootstrap helper for each — include idempotency check so re-runs are safe. See commit 0b52853 for the helper.
Priority: medium

## Notes

Shipped 2026-04-22 in commit 4948948.

Added two new internals in `convex/clients.ts`:

- `internal.clients.listMissingFolders` (query): joins all live clients
  against `clientFolders` and returns those without any folder rows.
- `internal.clients.backfillClientBootstrap` (mutation): idempotently
  re-runs `bootstrapNewClient` for one client, guarded by a per-call
  check that folders still don't exist.

Plus `model-testing-app/scripts/backfill-client-folders.ts`:

    # dry-run
    npx tsx --env-file=.env.local scripts/backfill-client-folders.ts

    # execute
    npx tsx --env-file=.env.local scripts/backfill-client-folders.ts apply

Requires `CONVEX_DEPLOY_KEY` in `.env.local` because both new Convex
entries are internal. Serial mutation calls isolate per-client
failures; the mutation's own idempotency guard means interrupted runs
resume cleanly.

Not run against any deployment yet — ships the tool so it can be
invoked against dev first, then prod, with dry-run gating.
