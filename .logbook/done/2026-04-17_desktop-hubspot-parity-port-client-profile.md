# Desktop HubSpot parity port (client profile)

Created: 2026-04-17
Status: done
Tags: #desktop #feature #ux
Source:
  - 2026-04-17 — desktop client profile: port mobile DealsTab — summary strip + DealCard list + slide-up detail sheet (uses existing deals.listForClient query)
  - 2026-04-17 — desktop client profile: port mobile ActivityTab (per-client) — filter chips + date-bucket grouping (uses existing activities.listForClient query); note the global /activity page already exists but is org-wide, not client-scoped
  - 2026-04-17 — desktop client profile header: HubSpot chip strip (lifecycle / type / industry / owner) — port of the mobile client header chips (Task I)
  - 2026-04-17 — desktop Intelligence tab: full Beauhurst cards (Identity, Financials, Signals) — port from mobile; current desktop only shows the 4-KPI mini in the Overview section
  - 2026-04-17 — desktop client profile: "+ Link contact" modal on Key Contacts — port of the mobile LinkContactModal (contacts.linkToClient mutation already exists)
  - 2026-04-17 — desktop: new-client creation flow with HubSpot company autocomplete — port of the mobile CompanyAutocomplete + /clients/new screen (companies.searchByName + clients.createWithPromotion already exist)
  - 2026-04-17 — desktop client profile: Recent Activity is now duplicated (existing section + new ClientHubSpotSection recent-activity card) — merge into one nicer component
Priority: medium

## Notes

Shipped 2026-04-17 — 7 sub-items across 4 commits (d2ded02, 6ba4da3, b479991, 614f00c):
- Sub 7 (Recent Activity dedup): renamed internal 'Recent Activity' to 'Recent work'.
- Sub 3 (header HubSpot chips): lifecycle/type/industry/owner chips next to existing badges.
- Sub 5 (Link contact dialog): new LinkContactDialog component wired into ClientContactsTab.
- Sub 4 (Beauhurst Identity/Financials/Signals): new ClientBeauhurstCards component above IntelligenceTab content.
- Sub 1 (DealsTab): new ClientDealsTab with summary strip + Open/Won/Lost sections + DealDetailDialog with edit mode.
- Sub 2 (ActivityTab per-client): new ClientActivityTab with filter chips + date buckets + expandable rows.
- Sub 6 (new-client HubSpot autocomplete): CreateClientDrawer Client Name field now shows HubSpot matches; picking one pre-fills the form + uses createWithPromotion.
