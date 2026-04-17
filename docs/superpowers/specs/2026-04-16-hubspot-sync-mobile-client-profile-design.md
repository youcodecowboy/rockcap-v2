# HubSpot Sync + Mobile Client Profile — Design

**Date:** 2026-04-16
**Status:** Design approved, ready for implementation plan
**Scope:** Mobile (React Native) — desktop deferred to a follow-up spec
**Related specs:** [2026-04-15 React Native Mobile App Design](./2026-04-15-react-native-mobile-app-design.md)

## 1. Context

RockCap V2 already has a half-built HubSpot integration in `model-testing-app/src/lib/hubspot/` and `model-testing-app/convex/hubspotSync/`. It was run once months ago and has sat dormant. This spec resurrects it, extends the data it captures, fixes bugs surfaced during discovery, and designs the mobile UI where the synced data surfaces.

The HubSpot portal (EU1, portalId 146182077) is the CRM source of truth. RockCap's team uses it daily — 1000+ companies, rich custom enrichment (Beauhurst third-party intelligence, Hublead LinkedIn automation), active deal pipelines with SPV-structured property-finance deals. Pulling this into the app unlocks two product outcomes:

1. **A populated shared contact book** across web + React Native, auto-linked to the client/project model the app already has.
2. **Rich client profiles** — deals, engagement history, company intelligence, signals — visible inside the app rather than requiring a tab-switch to HubSpot.

Auth runs on a HubSpot Service Key (public beta, created 2026-04-16) with 107 granted scopes including `sales-email-read`, `crm.objects.{contacts,companies,deals,appointments}.read/write`, `crm.objects.owners.read`, `crm.schemas.*.read`.

## 2. Goals

- **Populate the mobile contact book** — contacts from HubSpot, deduplicated, with rich per-contact data (email, phone, title, LinkedIn profile, last activity, lifecycle stage).
- **Surface HubSpot deal-flow on the client profile** — pipeline, amounts, close dates, recent activity.
- **Surface third-party company intelligence** — Beauhurst financials + signals + Companies House linkout on the Intelligence tab.
- **Enable client ↔ HubSpot company back-linking** via `companies.promotedToClientId` so that all future HubSpot contacts automatically flow into the correct client on sync.
- **Lay groundwork for autocomplete on new-client creation** — typing a name searches the synced companies pool, one tap pre-fills the link.

## 3. Scope

**In scope:**

- Convex schema additions (one new table, extensions to existing tables).
- Sync rewrites: bug fixes (dedupe associations, remove 500-cap), v1 engagements endpoint for activity timeline, full custom-property harvest.
- One-time client cleanup: merge three duplicate client records.
- One-time back-link script: writes `promotedToClientId` for 30 STRONG + 5 weak-confirmed company matches.
- Mobile UI: new Deals + Activity tabs, extended Intelligence tab with Beauhurst, Overview tab with hero zone, enriched Contacts section.
- New-client creation autocomplete from synced companies.

**Out of scope (explicit V2):**

- Bidirectional sync / write-back from mobile to HubSpot.
- Desktop client profile UI changes (separate spec later).
- Cron-based recurring sync (deferred per user call — manual trigger for now).
- Email engagement scope expansion (the 5 truly-blocked scopes in Service Keys beta; meetings + notes + emails via v1 endpoint all work today).
- Migration or deprecation of the existing `clients.hubspotCompanyId` column (stays for backward compatibility — new code reads through `companies.promotedToClientId`).

## 4. Data Model Changes

### 4.1 New table: `activities`

Unified engagement timeline. One row per HubSpot engagement (email, call, meeting, note, task), pulled via the legacy v1 engagements endpoint which returns all types in one response.

```typescript
activities: defineTable({
  // Source identity
  hubspotEngagementId: v.string(),          // indexed, dedupe key
  type: v.union(                            // v1 endpoint types
    v.literal("EMAIL"),
    v.literal("INCOMING_EMAIL"),
    v.literal("MEETING"),
    v.literal("CALL"),
    v.literal("NOTE"),
    v.literal("TASK"),
  ),
  timestamp: v.string(),                    // ISO, from engagement.timestamp

  // Content (shape varies per type; unified under a single `metadata`)
  subject: v.optional(v.string()),          // email subject, meeting title, etc.
  bodyPreview: v.optional(v.string()),      // first ~400 chars, HTML stripped
  bodyHtml: v.optional(v.string()),         // full body when we want it (lazy)
  direction: v.optional(v.string()),        // "outbound" | "inbound" (emails)
  status: v.optional(v.string()),           // "SENT" | "OPENED" | etc.
  duration: v.optional(v.number()),         // meetings/calls, in ms
  fromEmail: v.optional(v.string()),
  toEmails: v.optional(v.array(v.string())),
  outcome: v.optional(v.string()),          // meetings
  metadata: v.optional(v.any()),            // everything else as JSON

  // Associations (resolved to Convex IDs during sync)
  linkedCompanyId: v.optional(v.id("companies")),
  linkedContactIds: v.optional(v.array(v.id("contacts"))),
  linkedDealIds: v.optional(v.array(v.id("deals"))),

  // Owner
  hubspotOwnerId: v.optional(v.string()),
  lastHubSpotSync: v.string(),
  createdAt: v.string(),
})
  .index("by_hubspot_id", ["hubspotEngagementId"])
  .index("by_company", ["linkedCompanyId"])
  .index("by_timestamp", ["timestamp"]);
```

### 4.2 Extended: `companies` table

The existing `companies` table gets one field addition and one convention change. No destructive changes.

- **Keep:** `metadata: v.optional(v.any())` already exists — this becomes the home for all HubSpot custom properties (Beauhurst 28 fields, Hublead 5 fields, custom business fields like `spv_name`, `company_type`, `lead_source`).
- **Add:** `ownerName: v.optional(v.string())` — resolved owner display name, cached at sync time to avoid re-calling `/crm/v3/owners/{id}` on every read.
- **Use:** `lastContactedDate` ← `notes_last_contacted` (not `hs_last_contacted_date` which is empty in this tenant), `lastActivityDate` ← `notes_last_updated`.

### 4.3 Extended: `contacts` table

- **Add:** `linkedinUrl: v.optional(v.string())` — computed from `hublead_linkedin_public_identifier` (`https://www.linkedin.com/in/<id>`).
- **Use:** same activity-date convention (`notes_last_contacted` / `notes_last_updated`).
- **Dedupe fix:** when writing `linkedCompanyIds` and `hubspotCompanyIds`, run through `Array.from(new Set(...))` to collapse HubSpot's dual-association-type duplicates.

### 4.4 Extended: `deals` table

The existing `deals` table already has `stageName`, `pipelineName`, `dealType`, `linkedContactIds`, `linkedCompanyIds` (plural — many-to-many), `metadata`. Minor additions only:

- **Add:** `probability: v.optional(v.number())` — from `hs_deal_stage_probability`, used by the pipeline progress bar in the deal detail sheet.
- **Add:** `spvName: v.optional(v.string())` — from custom `spv_name` property; surfaced on deal cards and detail sheet.
- **Add:** `isClosed: v.optional(v.boolean())` — from `hs_is_closed`; avoids re-parsing at read time.
- **Add:** `isClosedWon: v.optional(v.boolean())` — from `hs_is_closed_won`; used for Won/Lost grouping in the Deals tab.
- **Add:** `linkedProjectId: v.optional(v.id("projects"))` — placeholder for the deferred "link deal to project" feature; leave null for now.

Sync code (Phase 2) must populate `stageName` and `pipelineName` consistently via the existing `pipelines.ts` resolution (it caches stage-id → name).

### 4.5 No schema changes (but behaviour change)

- `clients.hubspotCompanyId` — stays for backward compatibility. Going forward, the canonical link is `companies.promotedToClientId`. Never write to `clients.hubspotCompanyId` from new code; read tolerates both.

## 5. Sync Pipeline

### 5.1 Endpoints used

| Purpose | Endpoint | Why this one |
|---|---|---|
| Company list | `GET /crm/v3/objects/companies?limit=100&associations=contacts,deals` | Paginated, includes associations |
| Company search (for autocomplete) | `POST /crm/v3/objects/companies/search` | Token-based search; 200 max per page |
| Contact list | `GET /crm/v3/objects/contacts?limit=100&associations=companies,deals` | Standard |
| Deal list | `GET /crm/v3/objects/deals?limit=100` | Standard |
| Engagement timeline | `GET /engagements/v1/engagements/associated/company/{id}?limit=100` | Works with `sales-email-read`; unified types; v3 search blocked by missing granular scope |
| Property discovery | `GET /crm/v3/properties/{type}` | Enumerates tenant schema at sync start |
| Owner resolution | `GET /crm/v3/owners/{id}` | Resolves owner IDs to names |
| Pipeline stage resolution | existing `src/lib/hubspot/pipelines.ts` | Caches stage-id → name mapping |

### 5.2 Bug fixes vs current code

1. **Dedupe associations.** HubSpot returns both `HUBSPOT_DEFINED` and `USER_DEFINED` association entries for the same company-contact pair. Every `linkedCompanyIds`/`linkedDealIds`/`linkedContactIds` write must run through `Array.from(new Set(...))`.
2. **Remove 500-record cap.** `fetchAllContactsFromHubSpot` in `src/lib/hubspot/contacts.ts` hardcodes `maxRecords=500`. Remove cap; paginate until `nextAfter` is undefined.
3. **Correct activity-date fields.** Replace `hs_last_contacted_date` / `hs_last_activity_date` (empty in this tenant) with `notes_last_contacted` / `notes_last_updated` (populated).

### 5.3 Custom-property harvest

At sync start, call `GET /crm/v3/properties/companies` and `GET /crm/v3/properties/contacts`. Cache the full property name list for this run. When fetching company/contact records, request **all** properties via `POST /crm/v3/objects/{type}/batch/read` (body-based, not query-string, to avoid URL-length limit).

Store the full property payload as JSON on `companies.metadata` / `contacts.metadata`. First-class columns get populated from the subset of properties that have dedicated schema fields. This keeps schema stable while capturing arbitrary tenant customization.

### 5.4 Engagement sync

For each synced company, call the v1 engagements endpoint once per company, paginating via `offset` param until exhausted. Parse each engagement:

- `engagement.type` → our `type` field
- `engagement.timestamp` → our `timestamp`
- `metadata.subject/title/text/html` → subject + bodyPreview (strip HTML, truncate)
- `metadata.from/to/direction` → our `fromEmail`/`toEmails`/`direction`
- `associations.{companyIds,contactIds,dealIds}` → resolved via Convex indexes to internal IDs

Upsert by `hubspotEngagementId`. Existing rows update; new rows insert. This gives us idempotent, re-runnable sync.

### 5.5 Back-link strategy

**Canonical direction:** `companies.promotedToClientId` is the link. Many-to-one (a client can have multiple HubSpot companies pointing at it — real case: "Forays Limited" + "Forays Homes & Arcadia" both for client "Forays").

**One-time back-link script** — runs after first full sync completes. For each of the 30 STRONG exact-name matches from the dry-run + 5 weak matches the user confirmed (Donnington→Donnington New Homes Limited, Huntsmere→Huntsmere Gro, Kinspire merge→Kinspire Homes, Capstone Quinn→Creeland - Capstone Quinn, Glover Investments→Lakewood - Glover Investments):

```typescript
// Per confirmed match
await ctx.db.patch(companyId, { promotedToClientId: clientId });
```

Script is idempotent (safe re-runs). Separate from the sync itself so the sync stays focused on pulling data.

**Ongoing (new clients created in app):** the New-Client autocomplete flow writes `promotedToClientId` at creation time (see §6.6).

## 6. Mobile UI Design

### 6.1 Tab structure

Mobile client profile goes from 9 tabs to **11 tabs**, horizontal-scroll:

```
Overview · Activity (new) · Deals (new) · Projects · Docs · Intelligence (extended) · Notes · Tasks · Checklist · Meetings · Flags
```

- **Activity** is a new tab (no "Communications" on mobile to rename).
- **Deals** is a new tab with a count badge (e.g. "Deals 13").
- **Intelligence** gets a new section on top; existing doc-derived intel below divider.
- **Meetings** and **Notes** stay as-is for app-native content (HubSpot engagements of those types appear in Activity tab, not here).

### 6.2 Overview tab

Scroll order, top to bottom (mockup: [mobile-overview-v2.html](../../.superpowers/brainstorm/39151-1776381589/content/mobile-overview-v2.html)):

1. **StageNoteBanner** (existing) — blue left-border strip, editable "Status: X" text.
2. **Sync strip** (new) — owner pill + "Synced Nm ago" + "HubSpot ↗" external link.
3. **Open Deals card** (new) — uppercase label with green TrendingUp icon, "View all N ›" right, hero number (£ sum), 2 deal teasers (name, stage, amount), footer: Won/Lost totals. Click card → Deals tab.
4. **Recent Activity card** (new) — 2 most recent engagements with type icon tile + timestamp + subject + attribution. "See all ›" → Activity tab. Footer: last contacted date + total touch count.
5. **MetricTile 2×2** (existing, unchanged) — Projects, Docs, Tasks, Meetings counts.
6. **Beauhurst Intel mini** (new) — 4 KPI grid (Turnover, Headcount, EBITDA, Stage), signal pills, "Full intel ›" → Intelligence tab.
7. **Contacts section** (existing, enhanced) — HubSpot-synced contacts with email + LinkedIn icons, "Last contact Nd" shown when <30 days.
8. **Classification card** (new) — Company Type, Lead Source, Industry from custom properties.
9. **Company Info card** (existing, enriched) — Website / Address / Phone icons + values, populated from HubSpot sync.

"NEW" ribbons stay in the mockup as signalling during rollout; they are visual decorations only (may drop after launch).

### 6.3 Deals tab

Mockup: [mobile-deals-tab.html](../../.superpowers/brainstorm/39151-1776381589/content/mobile-deals-tab.html).

- **Summary strip** — 3 mini tiles: Open (neutral), Won (green), Lost (grey). Each shows £ total + deal count.
- **Search + Filter row** — search input + filter button (sheet opens with stage/close-window/amount-range filters).
- **Grouped sections** — Open expanded by default. Won/Lost collapsed; collapsed button shows total + count.
- **Deal card** — Name (truncated) + SPV, amount (right-aligned), stage pill (color-coded by stage category), close date (amber if near, red if past), last-activity indicator.
- **Tap a deal** → slide-up detail sheet (see §6.4).

**Stage colour categories:**

- Amber — Contract Sent, Appointment
- Blue — Proposal, Initial Contact
- Purple — Negotiation, Qualification
- Green — Closed Won (only in Won section)
- Grey — Closed Lost (only in Lost section)

Stage-id → category mapping lives in a small lookup table next to `pipelines.ts`.

### 6.4 Deal detail sheet

Mockup: [mobile-deal-detail-sheet.html](../../.superpowers/brainstorm/39151-1776381589/content/mobile-deal-detail-sheet.html). Slide-up sheet ~90% screen height, scrollable, dismissable via drag-down handle or close button.

Content order:

1. Deal name (big title).
2. Amount + stage pill + pipeline progress bar (6-segment visual, fills to current stage).
3. **Details grid** — Close date, Probability, Pipeline name, Deal type, SPV name.
4. **Owner strip** — avatar + name + "HubSpot ↗" link.
5. **Linked contacts** — 1 tap per contact opens the existing `ContactDetailModal` over the top.
6. **Recent activity (filtered to this deal)** — 3 items + "View all" → Activity tab filtered by deal id.
7. **Description** — deal notes from HubSpot `description` property.
8. **Project link slot** — if `linkedProjectId` null, shows "Link" button (deferred feature); if linked, shows Project card inline.

V1 is read-only. V2 will add inline stage-picker, tap-to-edit on amount/close-date/description, and a "+" FAB for log-note/log-call engagement creation.

### 6.5 Activity tab

Mockup: [mobile-remaining-screens.html](../../.superpowers/brainstorm/39151-1776381589/content/mobile-remaining-screens.html) (leftmost phone).

- **Header** — "Activity · N engagements".
- **Filter chips** — All (default, black) / Emails / Meetings / Notes / Calls. Count on each.
- **Date dividers** — Today / Yesterday / This week / Older, generated from engagement timestamps.
- **Engagement card** — Type icon in colored tile (note=purple, email out=orange, email in=green, meeting=blue, call=amber), type label + attribution, subject, 2-line body preview. Inbound emails get a small "↙" badge on the icon; outbound get "↗".
- **Tap** — expand inline (email body, meeting attendees) or open a detail sheet. V1 = expand inline is simpler. V2 can evolve.

### 6.6 Intelligence tab (extended)

Mockup: [mobile-remaining-screens.html](../../.superpowers/brainstorm/39151-1776381589/content/mobile-remaining-screens.html) (middle phone).

**Top half (new — Beauhurst CRM intel):**

1. **Identity card** — Company name, type, stage, industry, + link rows:
   - Companies House ID → `https://find-and-update.company-information.service.gov.uk/company/{id}`
   - LinkedIn → from `beauhurst_data_linkedin_page`
   - Beauhurst profile → from `beauhurst_data_beauhurst_url`
2. **Financials card** — Turnover, EBITDA, Headcount, Total Funding Received (from Beauhurst `beauhurst_data_*`). Footer: "Accounts filed <date>" from `beauhurst_data_date_of_accounts`.
3. **Signals card** — Growth / Risk / Innovation / Environmental / Social-Governance signal chips from the respective Beauhurst multi-value enumerations.

**Divider** — "AI intel from docs"

**Bottom half (existing — unchanged):** the current document-derived intelligence section remains. This spec does not touch it; the Beauhurst addition is purely prepended.

### 6.7 Contacts section enhancement

No new tab; existing Overview section gets richer:

- Each row shows avatar + name + role/title/email + email button + LinkedIn button.
- "Last contact Nd" shown under name when `lastContactedDate` is < 30 days.
- Adding new contacts still writes to local `contacts` table; doesn't push to HubSpot in V1.

### 6.8 New-client creation autocomplete

Mockup: [mobile-remaining-screens.html](../../.superpowers/brainstorm/39151-1776381589/content/mobile-remaining-screens.html) (rightmost phone).

- Name input on "New client" screen becomes live-searching.
- As user types 2+ characters, `api.companies.search` Convex query runs: fuzzy match on `name` against the synced companies pool. Client-side filter is fine for the first pass; switch to Convex `searchIndex` if performance suffers at scale.
- Each match shows: company name, domain, deal count, lifecycle stage. Exact-name matches get a green "MATCH" badge.
- Tap match → new client created with:
  - Client fields pre-filled from company (name, website, address, industry)
  - `companies.promotedToClientId` set to the new client
  - (Implicitly: all contacts already linked to that company now surface under this client)
- "Create 'X' from scratch" option at bottom — creates client without HubSpot link.

## 7. Phase Sequencing

Phases are ordered by dependency. Each phase is independently verifiable.

### Phase 0 — Client cleanup (~30 min, manual on desktop)

Before anything else, user resolves 3 duplicate client records on desktop:

- Merge two "Halo Living" client records (whichever has projects/docs is kept; other merged in).
- Merge "Kinspire" into "Kinspire Homes" (same logic).
- Leave "Kristian Hansen" ×2 as dev-zone.

Must happen before Phase 3 so back-links don't land on stale duplicates.

### Phase 1 — Schema additions

- New `activities` table.
- Extend `companies` (add `ownerName`).
- Extend `contacts` (add `linkedinUrl`).
- Extend `deals` (add `dealStageName`, `probability`, `dealType`, `spvName`, `isClosed`, `isClosedWon`, `linkedProjectId` optional).
- Regenerate Convex types (`npx convex codegen`).
- No UI changes yet.

### Phase 2 — Sync code rewrites

- Fix bugs: dedupe associations, remove 500-cap, use `notes_last_*` for activity fields.
- Add property discovery step at sync start.
- Switch to batch-read for full property payload on companies + contacts.
- Add engagement sync (v1 endpoints → new `activities` table).
- Add owner resolution + cache.
- Extend deal sync with new fields + stage name resolution.

Verify by running a full sync against EU1 portal. Inspect Convex tables. Confirm Talbot Homes row has:

- 87+ populated HubSpot properties in `metadata`
- Beauhurst fields accessible at `metadata.beauhurst_data_turnover` etc.
- `linkedContactIds` length > 0, no duplicates
- 13 associated deals in `deals` table with `dealStageName` resolved
- 100+ engagements in `activities` table

### Phase 3 — Back-link script

One-shot TypeScript script (similar to the dry-run scripts) that writes `companies.promotedToClientId` for the 30 STRONG + 5 user-confirmed weak matches. Safe to re-run; idempotent.

After running: verify on desktop web that Bayfield Homes' client page now shows the synced HubSpot contacts + deals. (Desktop UI not being redesigned yet, but the data must flow correctly.)

### Phase 4 — Mobile Overview tab

Implement the hero zone + enhanced sections per §6.2.

- New components: `OpenDealsCard`, `RecentActivityCard`, `BeauhurstMiniCard`, `ClassificationCard`.
- Enhance existing `ContactsSection` to show email/LinkedIn icons + last-contact date.
- Sync strip + HubSpot external link.
- "NEW" ribbons on net-new sections for rollout signalling (remove later).

### Phase 5 — Mobile Deals tab + detail sheet

- New screen: `DealsTab` — summary strip, search/filter, grouped sections.
- New component: `DealCard`, `DealDetailSheet`.
- Stage-category lookup table.
- Navigate from Overview's Open Deals "View all" → this tab.

### Phase 6 — Mobile Activity tab

- New screen: `ActivityTab` — filter chips, date dividers, engagement cards.
- Inbound/outbound badge on email icons.
- Deep-link from deal detail "View all (filtered to this deal)".

### Phase 7 — Mobile Intelligence tab extension

- Prepend Beauhurst section (identity + financials + signals cards).
- Divider + label.
- Existing doc-derived intel section remains untouched below.

### Phase 8 — New-client autocomplete

- New Convex query: `api.companies.search` (name prefix match, optional domain substring).
- Update new-client creation form to show live matches.
- On select: create client with pre-filled fields + write `promotedToClientId` back to the company row.

### Final step (per CLAUDE.md workflow rule)

After each phase where code lands, run `npx next build` from `model-testing-app/` and commit + push.

## 8. Known data-quality issues flagged

1. **Some HubSpot companies have metadata embedded in names** — e.g. `"Freshwater Estates (15 charges)"`. Leave as-is; not our problem to fix upstream.
2. **Some contacts have duplicated surnames** — e.g. `"Barrie Truelove (33 charges) Truelove"`. The `firstname` field includes the whole name with surname repeated in `lastname`. Display logic: if `lastname` is already a suffix of `firstname`, show `firstname` alone.
3. **Owner not always set** — Talbot Homes has no owner. Handle gracefully (show "No owner assigned" in UI, don't crash on null).
4. **HubSpot deal names often contain client + SPV** — e.g. `"Kelmscott (TALBOT HOMES LIMITED)"`. Display as-is; don't try to parse out SPV from name (SPV comes from the `spv_name` custom property directly).
5. **Joint-venture naming pattern** — `"Entity A - Entity B"` (e.g. "Creeland - Capstone Quinn"). These are valid HubSpot companies that might belong to one or both clients. Back-linking them is a human judgment call made during Phase 3.

## 9. Deferred (V2 candidates)

- **Bidirectional edits** — tap-to-edit deal stage/amount/close-date, "+ Log note/call" FAB, sync-back to HubSpot via `PATCH /crm/v3/objects/{type}/{id}`. Scopes already granted; needs conflict-resolution + failure UI design.
- **Cron-based recurring sync** — replace manual trigger with scheduled sync (every 15/30 min). Existing `recurring-sync/route.ts` is the skeleton.
- **Email engagement content via v3 search endpoint** — currently using v1 endpoints because `/crm/v3/objects/emails/search` requires `crm.objects.emails.read` not shown in Service Keys beta. When beta exposes it, swap endpoint.
- **Desktop client profile redesign** — this spec is mobile-first. Desktop has 12 existing tabs; the Beauhurst + Deals + Activity decisions apply analogously but desktop layout (multi-column) is a separate exercise.
- **Deal → Project linking** — `deals.linkedProjectId` schema field exists; UI "Link" button in deal sheet exists; the actual link flow (select or create project from deal) is V2.
- **Full contact/company editing from mobile** — mobile stays read-only for everything except V2 edits on deals.
- **Intelligent company merging** — today's 3 known dupes are handled manually. If more surface later, consider a dedicated dedupe UI.

## 10. Open questions (not blocking implementation)

- **Autocomplete scale:** at what company count does the client-side filter on all companies stop being acceptable? Assumption: fine up to ~5000 rows. Revisit with a Convex `searchIndex` if we cross that.
- **Engagement pagination cadence:** should the sync pull all historical engagements once, then only newer ones on subsequent runs? Or a fixed rolling window (e.g. last 90 days)? Leaning toward full-once + incremental-by-timestamp, but implementation detail for Phase 2.
- **Project→Deal inverse link:** if we add `deals.linkedProjectId`, do we also want `projects.linkedDealIds[]`? Probably yes for query symmetry, but can be added when the Link feature ships.

## 11. Success criteria

- A fresh sync against EU1 populates: 1000+ companies, 5000+ contacts, 100+ deals, 10000+ engagements (rough order-of-magnitude, observed during dry-runs).
- Back-link script leaves at least 35 clients with `promotedToClientId` set on at least one matching company.
- On mobile, opening Bayfield Homes shows: Open Deals card populated, Recent Activity card populated, contacts with LinkedIn buttons, Beauhurst mini with financials, Company Info auto-filled.
- Tapping a deal opens the detail sheet with pipeline progress bar, recent activity filtered to that deal.
- Creating a new client by typing "Talbot" surfaces Talbot Homes in autocomplete; tapping it creates a client linked to the HubSpot company.

## 12. Appendix — Related artifacts

- Dry-run scripts: `model-testing-app/scripts/hubspot-dry-run.ts`, `hubspot-match-clients.ts`, `hubspot-search-match.ts`, `hubspot-rich-probe.ts`, `hubspot-email-paths.ts`. Kept in-repo for future diagnostics.
- Existing HubSpot integration: `model-testing-app/src/lib/hubspot/`, `model-testing-app/convex/hubspotSync/`.
- Existing mobile client page: `mobile-app/app/(tabs)/clients/[clientId]/index.tsx`.
- Visual mockups (brainstorming session artifacts): `.superpowers/brainstorm/39151-1776381589/content/mobile-*.html`.
