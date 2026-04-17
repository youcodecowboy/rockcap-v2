# HubSpot sync: incremental syncing + rate limiting

Created: 2026-04-17
Status: queued
Tags: #hubspot #backend #perf
Source:
  - - 2026-04-17 — ensure HubSpot sync job does not resync the entire library, only recents — original sync took 3+ hours and huge compute
  - - 2026-04-17 — build a rate limitation system for HubSpot sync
Priority: high

## Notes

