# Prospect Track Record + Scheme-Level Charge Intelligence — Design

Date: 2026-05-28
Status: approved (brainstorm); pending implementation plan
Related backlog: `.logbook/queued/2026-05-28_prospect-track-record-scheme-charge-intelligence.md`
Origin: prospect-intel gauntlet on Mackenzie Miller Homes (CH 09840954)

## Motivation

UK developers borrow through per-scheme SPVs, so the trading parent often shows zero charges while the real lending sits across sibling SPVs. The current group rollup `companies.getGroupCharges` returns lender/company **counts** only, which is too thin to show schemes scheme-by-scheme and recently allowed an unsupported inference about which schemes a lender funded. This work surfaces the per-scheme picture as first-class on the prospect detail view, grounded in the charge registers we already sync, plus a deep operator-confirmable estimate of what each live scheme is building.

## Goals

1. A group **charges chronology** on the Companies House tab that includes a chronology **for each funded group company (SPV)**, not just the anchor. (Explicitly important.)
2. A new **Track Record tab**: curated top 5-7 schemes, split Live vs Past, each in depth, with address and a "what they're building" estimate.
3. Deep, operator-confirmable enrichment per live scheme (address from charge particulars -> planning/web research -> what they're building), persisted durably so it is not recomputed each visit.

## Non-goals

- No external planning-API integration; enrichment uses skill-driven web/planning search.
- No autonomous send and no fabrication; "what they're building" is a draft estimate the operator confirms.
- Does not create `clients`/`companies` rows for discovered SPVs (surface-only, consistent with the resolve-related-entities sub-skill).

## Data model — `prospectSchemes` (new Convex table)

Chosen over storing enrichment in `knowledgeItems` (approach A1): the Track Record tab is fundamentally a table of schemes, so one structured row per scheme is the natural, queryable, operator-editable home and keeps the expensive deep-research output durable.

Fields:
- `clientId: v.id("clients")` (indexed)
- `companyNumber: v.string()` (the SPV's CH number; upsert key with clientId)
- `companyName: v.string()`
- `schemeName: v.optional(v.string())`
- `address: v.optional(v.string())`
- `planningRefs: v.optional(v.array(v.string()))`
- `estimatedUnits: v.optional(v.number())`
- `schemeType: v.optional(v.string())` (e.g. "bespoke detached", "barn conversion", "strategic land")
- `whatBuilding: v.optional(v.string())` (prose estimate)
- `gdvEstimate: v.optional(v.string())` (range string, never a naked number)
- `confidence: v.optional(v.string())` ("high" | "med" | "low")
- `status: v.optional(v.string())` ("live" | "past")
- `sourceUrls: v.optional(v.array(v.string()))`
- `operatorConfirmed: v.boolean()` (default false; true once a human confirms/edits)
- `updatedBy: v.optional(v.string())`, `createdAt: v.string()`, `updatedAt: v.string()`

Indexes: `by_client ["clientId"]`, `by_client_company ["clientId","companyNumber"]` (upsert key).

Discoverability (explicit requirement): clear table name + a schema comment pointing at this spec and the prospect-intel skill; documented in `skills/CATALOGUE.md`; referenced in the prospect-intel `SKILL.md` outputs so future sessions know the skill feeds this table and the Track Record tab.

## Queries / mutations / MCP tools (`model-testing-app/convex/companies.ts` + `convex/mcp.ts`)

1. **Extend `companies.getGroupCharges`** to additionally return `charges`: an array of `{ companyNumber, companyName, companyStatus, chargeId, lender (chargeeName), date (chargeDate), status (chargeStatus), description (chargeDescription) }`, sorted newest-first. Additive and backward-compatible (the per-charge loop already exists; it currently discards the rows). Powers both the flat group chronology and the per-SPV chronology.
2. **New `companies.getProspectSchemes(clientId)`** -> `{ live: SchemeRow[], past: SchemeRow[] }`. One row per SPV, merging that SPV's charges (lender(s), date(s)) with its `prospectSchemes` enrichment row. `status` live = SPV has at least one outstanding charge (or active company with charges); past = all charges satisfied or company dissolved. Each list ranked by most-recent charge date. Powers the Track Record tab and the CH-tab per-scheme rows.
3. **New mutation `companies.upsertProspectScheme({ clientId, companyNumber, ...enrichment, operatorConfirmed? })`** -> upsert by (clientId, companyNumber). The skill writes drafts (`operatorConfirmed=false`); operator confirm/edit sets it true and never gets overwritten silently by a re-run.
4. **MCP wrappers** in `convex/mcp.ts` for `companies.getProspectSchemes` (query) and `companies.upsertProspectScheme` (mutation), following the existing tool pattern. Update the `getGroupCharges` tool description to mention the new `charges` array. Add all three to `skills/CATALOGUE.md` in the same commit.

## UI (`model-testing-app/src/components/prospects/tabs/`)

### Companies House tab (enhance `CompaniesHouseTab.tsx`)
- Keep the anchor company profile + its existing charges chronology.
- Group section:
  - Existing group summary counts (the current rollup).
  - **Per-SPV charges chronology** (important): for every group company with at least one charge, a chronology table (Date / Lender / Status / Description-with-address) like the anchor's, under the SPV name + CH link, newest-first. Collapsible, since a group can have ~11+ funded SPVs; sorted by most-recent charge.
  - A flat aggregate group chronology (all charges newest-first, with an SPV column) for the "most recent across the whole group" view.

### Track Record tab (new)
- Add `"track-record"` to the `activeTab` union + tab nav in `prospects/[prospectId]/page.tsx`; new `TrackRecordTab.tsx`.
- Reads `getProspectSchemes`. Two sections: **Live schemes** and **Past schemes**, top 5-7 each by recency, with "Show all" to expand.
- Each scheme in depth: SPV (+CH link), lender(s) + when lent, address, status, and **what they're building** (estimate + confidence chip + planning/source links). Operator can confirm/edit inline (calls `upsertProspectScheme`; shows a confirmed badge).

## Skill capability — prospect-intel

- New reference `skills/skills/prospect-intel/references/scheme-from-charges.md` + a workflow step (after the corporate-group walk / lender DNA).
- For each **live** scheme (SPV with an outstanding charge): take the address from the charge particulars (`chargeDescription`), run deep web + planning research (planning portal, local press, the developer's own site, property listings) to estimate units / scheme type / GDV / what-they're-building, with a confidence label and cited `sourceUrls`, then write a draft via `upsertProspectScheme` (`operatorConfirmed=false`).
- "As deep as possible" = multiple queries per scheme; persisted so a re-run skips already-enriched schemes unless stale (default refresh if older than 30 days or a new charge appears). Estimates only, evidence-cited, never asserted (CONVENTIONS no-fabrication).
- Update `SKILL.md` (workflow steps, tool dependencies, references) and the skills README if status changes.

## Build order

1. Extend `getGroupCharges` (+ MCP tool, + CATALOGUE).
2. `prospectSchemes` schema + `getProspectSchemes` + `upsertProspectScheme` (+ MCP, + CATALOGUE).
3. CH tab: per-SPV + aggregate group charges chronology.
4. Track Record tab.
5. prospect-intel `scheme-from-charges` step (+ SKILL.md / references).
6. `npx next build` from `model-testing-app/` + commit.

## Testing

- Convex: tests for `getGroupCharges` (charges array shape + newest-first ordering), `getProspectSchemes` (live/past split, ranking, charge+enrichment merge), `upsertProspectScheme` (upsert by key, operatorConfirmed not clobbered).
- UI: verify in the running app on Mackenzie Miller (CH tab renders per-SPV chronology for the ~11 funded SPVs; Track Record live/past sections populate).
- Skill: dry-run `scheme-from-charges` on 1-2 Mackenzie Miller live schemes (Leighterton/Poole 16027708, Temple Guiting 14032704) where data is already synced.

## Open questions

- None blocking. Stale-refresh window for scheme enrichment defaults to 30 days or "new charge since last research"; confirm during planning.
