# Mobile dashboard small fixes (client list count + Overdue section styling)

Created: 2026-04-17
Status: done
Tags: #mobile #ux #bug
Source:
  - - 2026-04-17 — mobile app client list: all clients show "0 projects" (project count broken)
  - - 2026-04-17 — mobile dashboard Overdue section: plain text and unstyled — match Up Next card styling and make each row tappable → task detail
Priority: medium

## Notes

Shipped 2026-04-17 — commit 037fe11: fixed projectCountMap to iterate clientRoles (not flat p.clientId). Rebuilt Overdue section with UpNextCard-style rows + deep-link to /tasks?taskId=<id>. Added taskId query-param handler in app/tasks/index.tsx.
