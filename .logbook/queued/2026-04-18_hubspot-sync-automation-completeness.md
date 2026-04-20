# HubSpot sync automation + completeness (cron + activities since-filter)

Created: 2026-04-18
Status: queued
Tags: #hubspot #backend #feature
Source:
  - - 2026-04-18 — wire HubSpot recurring sync cron — all pieces exist (incremental mode + rate-limit retry + config fields isRecurringSyncEnabled/syncIntervalHours). Add a cronJobs.interval entry calling an internal action that honours the config flag + triggers sync-all with mode='incremental'. UI toggle already has the backing mutation.
  - - 2026-04-18 — HubSpot activities fetcher (src/lib/hubspot/activities.ts, v1 engagements endpoint) isn't `since`-filtered — it pages all engagements per company. Add a `since` timestamp so incremental syncs don't re-read engagement history from the beginning every run.
Priority: medium

## Notes

