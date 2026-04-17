# HubSpot sync: incremental syncing + rate limiting

Created: 2026-04-17
Status: done
Tags: #hubspot #backend #perf
Source:
  - - 2026-04-17 — ensure HubSpot sync job does not resync the entire library, only recents — original sync took 3+ hours and huge compute
  - - 2026-04-17 — build a rate limitation system for HubSpot sync
Priority: high

## Notes

Shipped 2026-04-17 — commit d2910c8: new src/lib/hubspot/{http,incremental}.ts (hubspotFetch with 429 retry, fetchModifiedIds + batchReadRecords via search API). Fetchers accept options.since; orchestrator reads config.lastSyncAt + mode='incremental'|'full'. UI: 'Force full resync' checkbox.
