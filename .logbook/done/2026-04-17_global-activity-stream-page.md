# Global activity stream page (merged app + HubSpot feed)

Created: 2026-04-17
Status: done
Tags: #feature
Source:
  - - 2026-04-17 — global activity stream page: merged feed of in-app + HubSpot activity across the org (a "pulse of the company" view) — desktop and mobile
Priority: medium

## Notes

Shipped 2026-04-17 — commit 2edf29f (desktop MVP). New activities.listRecentGlobal query (full scan + batch-fetch linked companies). New /activity page under (desktop) with filter chips, date buckets, deep-links to client profiles. Sidebar entry added. Mobile counterpart deferred (client-scoped Activity tab already exists per-profile).
