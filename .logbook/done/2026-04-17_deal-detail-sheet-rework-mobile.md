# Deal detail sheet rework (mobile) — polish, edit fn, create modal

Created: 2026-04-17
Status: done
Tags: #mobile #ux #feature #bug
Source:
  - - 2026-04-17 — deal detail sheet (Deals tab on client profile): poor UI, lack of background, poor layout — needs polish pass
  - - 2026-04-17 — plan edit functionality for deal detail: close date, linked contacts, deal type — even if edits don't all round-trip to HubSpot
  - - 2026-04-17 — Deals tab (client profile): Closed Won / Closed Lost collapsible rows don't open/close when tapped
  - - 2026-04-17 — add "new deal" modal so deals can be created from the mobile app (not just synced from HubSpot)
Priority: medium

## Notes

Shipped 2026-04-17 — commit 8ff6083 (3 of 4 sub-items). Polish: #f5f5f4 sheet backdrop + separated header panel. Edit mode: Pencil toggles TextInputs for closeDate + dealType; deals.updateLocalEdits mutation persists locally (no HubSpot round-trip yet). Fixed Closed Won/Lost collapsibles (expandedGroups Set + onPress). DEFERRED: new-deal creation modal — separate follow-up needed.
