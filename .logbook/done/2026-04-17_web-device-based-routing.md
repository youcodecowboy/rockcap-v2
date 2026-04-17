# Device-based home routing middleware (web)

Created: 2026-04-17
Status: done
Tags: #web #routing #bug
Source:
  - - 2026-04-17 — web app home route always serves /m-dashboard — desktop traffic gets mobile layout; middleware needs to detect device type and route to desktop vs mobile dashboard accordingly
Priority: high

## Notes

Shipped 2026-04-17 — commit d8cfc12: deleted src/app/page.tsx (it unconditionally redirected to /m-dashboard, shadowing (desktop)/page.tsx). Middleware already handled mobile UA → rewrite; desktop now falls through correctly.
