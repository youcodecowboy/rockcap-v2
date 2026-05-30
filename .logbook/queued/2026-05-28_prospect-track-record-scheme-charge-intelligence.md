# Prospect Track Record tab + scheme-level charge intelligence

Created: 2026-05-28
Status: queued
Tags: #prospects #feature #ui #skill #companies-house #intelligence
Source: operator feedback during prospect-intel gauntlet test (Mackenzie Miller Homes)
Priority: medium

## Context

Surfaced while running the prospect-intel gauntlet on Mackenzie Miller Homes (CH 09840954), a per-scheme-SPV developer: the trading parent carried 0 charges, but the corporate group held 19 charges across 20 active SPVs. The group rollup `companies.getGroupCharges` returns lender COUNTS only (`lendersByCount` + per-company `byCompany`), which is too thin to show schemes scheme-by-scheme. These notes make the per-scheme picture first-class on the prospect detail view.

Directly related: the logged gap that `companies.getGroupCharges` does not return per-charge rows or the lender-to-company mapping. All four scope items below need that per-charge data, which is already persisted in `companiesHouseCharges` by `companies.syncCompaniesHouse` (including the brief particulars that carry the property address).

## Scope

### 1. Track Record tab (new tab on /prospects/[id])
- A table of the last 5-7 schemes in depth, split into **Live schemes** and **Past schemes** (live = outstanding charge; past = satisfied charge or dissolved SPV).
- Each row is one scheme: SPV name + CH number, lender, charge date, status, property address, and an estimate of what they are building.
- "Last 5-7" = most recent by charge date.

### 2. Per-scheme enrichment (feeds the Track Record tab and the CH tab)
- **Address:** parse the charge brief particulars/description for the property address. Already synced; real examples from this run: "land at poole..." (Leighterton/Poole SPV), "Foxwood, Grevel Lane, Chipping Campden..." (Foxwood single house), "1, 2 & 3 The Arrows, Little Rissington...".
- **Planning + "what are they building":** for live schemes, search the extracted address (planning portal / web) to find planning docs and estimate unit count / scheme type. New prospect-intel skill capability; persist the estimate as structured scheme facts, not free text.

### 3. Companies House tab — per-scheme rows
- For each scheme show: SPV, lender (persons-entitled), date lent (charge created), address (from particulars), and what we estimate they are building (from #2).

### 4. Group-level "Charges chronology" table
- Roll the existing single-company "charges chronology" table up to the **group** (anchor `companiesHouseNumber` + `relatedCompaniesHouseNumbers`).
- Most recent first; columns: lender (persons-entitled), charge date, satisfied/outstanding status (+ satisfied date), SPV, address.

## Enabling work
- **Backend/MCP:** extend `companies.getGroupCharges` (or add a `...Detailed` variant) to return per-charge rows across the group: `{ companyNumber, companyName, lender, createdOn, status, satisfiedOn, particulars }`. One query powers #1, #3, #4 and the address parsing for #2.
- **Skill (prospect-intel):** add an address-extraction + planning-lookup step (e.g. a new `references/scheme-from-charges.md`) turning charge particulars into `{ address, planningRef, estimatedUnits, whatTheyAreBuilding }` per live scheme, persisted as structured scheme facts.
- **UI:** Track Record tab component; CH-tab per-scheme columns; group charges chronology table (reuse the existing single-company chronology component).

## Open questions
- Where to persist per-scheme enrichment (a new schemes shape vs `knowledgeItems` vs project facts)?
- Confirm live/past split definition (outstanding vs satisfied charge; treat dissolved SPVs as past).
- Cap of 5-7: rank by charge date (recency) rather than incorporation date.
- Planning lookup source: national planning portal vs per-LPA vs web-search fallback.

## References
- Skill: `skills/skills/prospect-intel/` (SKILL.md steps 4, 8b; `references/lender-dna-from-charges.md` — already carries the "counts != lender-to-scheme mapping" guardrail).
- Worked example (this run): Quantum on Leighterton/Poole (16027708), Temple Guiting (14032704), Upper Townhouse Longborough (13097295); Investec on Foxwood (13893947, single house) + Little Rissington (13394322, 3 units, alongside Paragon); Paragon on the Nether Westcote schemes (13948769, 14003911); Neslo + Security Trustee on older/satisfied charges.
