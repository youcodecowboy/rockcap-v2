# Mobile global Activity stream page

Created: 2026-04-17
Status: done
Tags: #mobile #feature
Source:
  - 2026-04-17 — mobile: global Activity stream page (counterpart to desktop /activity) — merged feed of in-app + HubSpot activity across the whole org, not client-scoped; activities.listRecentGlobal query already exists on the backend
Priority: medium

## Notes

Shipped 2026-04-17 — commit 435aa58: new mobile-app/app/activity/index.tsx reusing activities.listRecentGlobal + ActivityCard. Filter chips + date buckets + inbound/outbound badges. 'Activity' entry added to MobileNavDrawer.
