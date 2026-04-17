# Desktop client profile — HubSpot parity with mobile

Created: 2026-04-17
Status: done
Tags: #desktop #feature #ux
Source:
  - - 2026-04-17 — audit desktop (web) UI for client profile — React Native side is now ahead UI-wise, desktop needs to catch up
  - - 2026-04-17 — desktop web client pages don't surface HubSpot data (no deals/activity/Beauhurst) — port the mobile hero components to desktop
Priority: medium

## Notes

Shipped 2026-04-17 — commit 63b105e: new ClientHubSpotSection component (sync strip + open deals card + recent activity card + Beauhurst KPIs mini) wired into ClientOverviewTab above Main Content grid. Conditional on promoted HubSpot company.
