# Deal Book / Case-Study Index — Design

**Date:** 2026-06-10
**Author:** Kristian (with Claude)
**Source:** `RockCap-BD-cold-outreach-gap-analysis-2026-06-09.md` — **Gap 5** (case-study / recent-deal index), the doc's highest-priority migration.
**Scope:** Sub-project A of the BD gap portfolio. One spec → one plan → one build cycle. Other gaps (HubSpot triage, drafting fold-ins, ledgers) are separate sub-projects, out of scope here.

---

## Problems this solves

- **The strongest cold hook can't be used in-app.** Hook-ladder **rung 9** ("we've done a couple of similar [TYPE] schemes in [REGION]") is the single most persuasive opener, but the data behind it isn't structured — `hook-ladder.md` itself marks the rung *"future reference to build — not yet structured."*
- **RockCap's track record lives only in an old file repo.** The curated closed-deal material (`references/rockcap-case-studies.md`, CS1–CS6) sits outside the app, isn't synced to working machines, and goes stale.
- **There's no place to see the firm's deal portfolio.** Operators have no single view of open business, closed deals, or lost deals — or the stats over them.

---

## What we deliver (requirement → delivery)

| The ask (Gap 5) | What delivers it |
|---|---|
| Structured, sector/region-tagged closed-deal data | New `caseStudies` table — sector, region, size band, headline per closed deal |
| Make rung 9 usable in-app (today: "not yet built") | `caseStudy.matchForProspect` tool + flip rung 9 in `hook-ladder.md` to live, wired into `compose-outreach-hook` |
| Stop it "living only in the old repo" | Entries are derived from the app's own closed `projects` — in-system, self-maintaining |
| Alex's "surface for review" rule | draft → operator-confirm curation; `referenceable` gate before any hook use |
| (added in design) see/manage the track record | the **Deal Book** nav page: portfolio dashboard over all deals |

**Net:** rung 9 goes from *"Manual until built"* to *a query the drafting skill runs automatically*, sourced from live deal data and gated by human review.

### Honest reconciliations with the source doc
1. **"rungs 1 & 9" → we deliver rung 9 only.** Per the actual `hook-ladder.md`, rung 1 (architectural detail) is powered by website research (`scheme-from-charges`), not the deal index. Only rung 9 is the deal-index rung, and the one flagged "future." Rung 1 is untouched.
2. **"named RockCap deal" vs the anonymised rule.** Rung 9's structured note says *"regions/sectors, no client names"* and the hard rule is *"never name the prospect-side counterparty."* Default hook output is **anonymised** (sector/region/type). The RockCap-led deal name is stored internal-only and may be surfaced in a headline only when the operator clears it (rung 9 permits naming the RockCap-led deal).
3. **Seed source: closed deals, not the CS1–CS6 file.** The doc's source is the static file; we derive from the app's closed deals instead — same outcome, but self-maintaining. The original 6 curated studies are not auto-imported (they'd need project records first; see Out of Scope).

---

## Concept

A curated, firm-wide **track-record library**, surfaced as the **Deal Book** page and consumed by the drafting skill.

- The **Deal Book page** is a portfolio dashboard over the existing `projects` table, grouped Open / Closed / Lost, with a stats bar.
- The new **`caseStudies` table** holds only the closed-deal enrichment (1:1 with a `completed` project): the anonymised, sector/region-tagged payload that powers hook rung 9.
- "Deal Book" is the *page name*; `caseStudies` is the *table name* — deliberately distinct from the existing `deals` (HubSpot pipeline mirror) and `projects` (operational deal) tables.

---

## Data model

### New table: `caseStudies` (rockcap-v2 Convex)

Every entry is **always backed by a `completed` project** (1:1).

| Field | Type | Notes |
|---|---|---|
| `projectId` | `id("projects")` | **required**, the backing closed deal; unique per entry |
| `curationStatus` | `"draft" \| "confirmed"` | the draft→confirm gate |
| `sector` | `string` | inferred at derive time, operator-confirmed (taxonomy below) |
| `dealType` | `string` | e.g. development finance / bridge / senior+mezz |
| `region` | `string` | derived from project `city`/`state` |
| `sizeBand` | `string` | derived from `loanAmount` via `deal-type-size-bands.md` |
| `headline` | `string` | anonymised one-liner safe for hooks |
| `referenceable` | `boolean` | hard gate for hook eligibility; default `false` |
| `confirmedBy` | `id("users")` (opt) | set on confirm |
| `confirmedAt` | `string` (opt) | |
| `createdAt` / `updatedAt` | `string` | |
| soft-delete fields | | `isDeleted`, `deletedAt`, `deletedBy`, `deletedReason` |

Indexes: `by_project`, `by_curationStatus`, `by_sector`, `by_referenceable`.

**Live-joined, not duplicated:** deal name, address, dates, full detail come from the backing project at read time. `sector`/`region`/`sizeBand` are denormalised onto the entry for fast querying and ranking.

### Status mapping (page tabs ← project lifecycle)
- **Open** ← project `status: active` (+ `on-hold`)
- **Closed** ← project `status: completed`
- **Lost** ← project `status: cancelled`

Open and Lost tabs read `projects` directly (no `caseStudies` rows). Only Closed deals have case studies.

### Sector taxonomy
New `shared-references/deal-sectors.md` holding the canonical list, shared by the inference step and the prospect-intel side:
**residential (for-sale) · BTR/rental · student (PBSA) · co-living · mixed-use · commercial · industrial/logistics · hotel/leisure.**

---

## MCP tools (rockcap-v2 `mcp.ts`)

New `caseStudy` domain — the closed-deal index (5 tools):

1. `caseStudy.deriveDrafts` — scan `completed` projects with no entry; create `draft` entries with inferred sector/region/sizeBand; return for review.
2. `caseStudy.confirm` — operator edits + approves an entry (sector, dealType, headline, referenceable) → `confirmed`.
3. `caseStudy.matchForProspect` — query `confirmed` + `referenceable` by sector (+ optional region); returns **anonymised** hook material for rung 9.
4. `caseStudy.list` — filter by curationStatus / sector (page + ops).
5. `caseStudy.setReferenceable` — toggle the hook-eligibility gate.

Plus one portfolio aggregate tool for the page stats bar (separate concern — aggregates over `projects`, not `caseStudies`):

6. `dealBook.stats` — windowed portfolio aggregates (open count + value; closed in last 30/90/180/365d; total closed count + value).

Open/Lost tabs reuse existing project queries — no new tools.

**Discoverability (CLAUDE.md rule):** add the `caseStudy`/`dealBook` domain to `CATALOGUE.md` and `tools-manifest.json` in the same change, bumping counts.

---

## Web page — "Deal Book" nav item (rockcap-v2 Next.js app)

```
┌─ STATS BAR ─────────────────────────────────────────────┐
│  OPEN BUSINESS: 12 deals · £340m   │  Closed: 30/90/180/365d │
│  [filter: window ▾]                 │  Total closed: 48 · £1.2bn │
└─────────────────────────────────────────────────────────┘
[ Open ]  [ Closed ]  [ Lost ]          ← tabs
┌──────────────────────────────────────────────────────────┐
│ Deal            Sector   Region   Size   Date   Actions    │
│ Wimbledon Park  Resi     London   £28m   …   [Project]     │  open
│ Oak Wharf       BTR      Leeds    £45m   …   [Case study][Project] │ closed
│ Maple Court     Student  Bristol  £12m   …   [Project]     │  lost
└──────────────────────────────────────────────────────────┘
```

- **Stats bar:** Open business (count + total `loanAmount`); Closed in last 30/90/180/365d (windowed by completion date) with a window filter; total closed count + value. Lost/win-rate optional.
- **Tabs:** Open · Closed · Lost.
- **Row actions:** Closed → `[Case study]` (→ `caseStudies` detail) **+** `[Project]`. Open/Lost → `[Project]` only.
- **Curation surface:** a closed deal with no confirmed case study shows a `Draft` / `Needs review` badge → click to confirm. The draft→confirm flow lives in the Closed tab.
- Follows the app's existing nav/page conventions.

---

## Skill / reference wiring (canonical in RockCap-MCP → synced to `v2/skills`)

- `shared-references/hook-ladder.md` — flip rung 9 from "future" to live; cite `caseStudy.matchForProspect`.
- `sub-skills/compose-outreach-hook.md` — add the rung-9 step: call match, surface the anonymised result for review.
- `shared-references/deal-sectors.md` — new sector taxonomy.
- `CATALOGUE.md` + `tools-manifest.json` — add the new domain, bump counts.

---

## Confidentiality

Hook output is anonymised by construction: sector + region + type + size only. The deal name and project link are internal-only — visible on the Deal Book page, never emitted in a hook. The `referenceable` flag is the hard gate, default off until an operator confirms.

---

## Cross-repo commit split (operating model)

- **rockcap-v2 commit:** `caseStudies` schema, `mcp.ts` tools, Convex functions, the Deal Book web page (+ the synced `skills/` copy).
- **RockCap-MCP commit (canonical):** `hook-ladder.md`, `compose-outreach-hook.md`, `deal-sectors.md`, `CATALOGUE.md`, `tools-manifest.json` — then rsync down into `v2/skills/`.

---

## Out of scope (YAGNI — future work)

- The forward write-on-close auto-loop (wiring `case-study-author` to append a case study on deal close).
- Comps / document reuse of the index.
- External / anonymised case-study **document** generation.
- Importing historic CS1–CS6 (would need project stubs first, since entries are always project-backed).
- Lost-deal analytics beyond a basic count / win-rate.

---

## Verification (final step, per repo CLAUDE.md)

1. `npx next build` from `model-testing-app/` — fix any build errors.
2. Commit + push: rockcap-v2 (code) and RockCap-MCP (canonical skills), with parallel commit messages.
