# Calendar sync scale — indexed listActiveSyncUserIds

Created: 2026-04-22
Status: queued
Tags: #calendar #perf #debt #scale
Source:
  - 2026-04-22 — [scale] `listActiveSyncUserIds` does `.collect()` across all `googleCalendarTokens`. Fine up to ~1-2K connected calendars; if we approach 5K+, add a `by_needsReconnect` index and filter at the DB layer.
Priority: low

## Notes

Deferred: execute when telemetry shows approach to scale ceiling (~5K connected calendars). Not a pre-emptive fix.
