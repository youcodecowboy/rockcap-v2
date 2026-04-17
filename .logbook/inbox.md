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
