# Logbook Inbox

- 2026-04-17 — missing rockcap header in the client profiles, need a better header hierarchy
- 2026-04-17 — "view activity for this deal" on the deal card popup in the mobile app is not linking anywhere
- 2026-04-17 — explore how a gmail integration could work now that we have contacts set up, how could we flag inbound e-mails and tag them to clients/companies to improve the power of the application overall
- 2026-04-17 — desktop client profile: port mobile DealsTab — summary strip + DealCard list + slide-up detail sheet (uses existing deals.listForClient query)
- 2026-04-17 — desktop client profile: port mobile ActivityTab (per-client) — filter chips + date-bucket grouping (uses existing activities.listForClient query); note the global /activity page already exists but is org-wide, not client-scoped
- 2026-04-17 — desktop client profile header: HubSpot chip strip (lifecycle / type / industry / owner) — port of the mobile client header chips (Task I)
- 2026-04-17 — desktop Intelligence tab: full Beauhurst cards (Identity, Financials, Signals) — port from mobile; current desktop only shows the 4-KPI mini in the Overview section
- 2026-04-17 — desktop client profile: "+ Link contact" modal on Key Contacts — port of the mobile LinkContactModal (contacts.linkToClient mutation already exists)
- 2026-04-17 — desktop: new-client creation flow with HubSpot company autocomplete — port of the mobile CompanyAutocomplete + /clients/new screen (companies.searchByName + clients.createWithPromotion already exist)
- 2026-04-17 — [bug] Next.js hydration error on desktop clients page: "In HTML, <button> cannot be a descendant of <button>" — SelectTrigger (src/components/ui/select.tsx:36) inside EditableClientTypeBadge (src/components/EditableClientTypeBadge.tsx:127) is rendered inside the ClientList row <button> at src/app/(desktop)/clients/components/ClientsSidebar.tsx:395 (Next 16.0.7 / Webpack)
- 2026-04-17 — [bug] Second console error on desktop clients page: "<button> cannot contain a nested <button>" — stack points at the outer row <button> at src/app/(desktop)/clients/components/ClientsSidebar.tsx:348 inside ClientList (same root cause as the SelectTrigger-in-button bug; row button wraps nested interactive controls). Next 16.0.7 / Webpack
- 2026-04-17 — desktop: rework the Contacts section overall (list, detail, linkage) — the current UI is dated relative to the mobile rework + back-link work; audit and bring up to parity with clearer contact↔client/company affordances
