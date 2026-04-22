# Backfill clientFolders for legacy mobile-created clients

Created: 2026-04-22
Status: queued
Tags: #mobile #data #backfill
Source:
  - 2026-04-20 — [backfill] write one-off script to find clients with no entries in `clientFolders` (likely mobile-created before 0b52853) and run the bootstrap helper for each — include idempotency check so re-runs are safe. See commit 0b52853 for the helper.
Priority: medium

## Notes

Helper lives in commit 0b52853. Script should dry-run first and require explicit confirmation before mutating.
