# App-Wide Facelift & UI Polish — Implementation Plan

**Date:** 2026-05-31
**Status:** Draft (pending operator approval)
**Author:** Kristian + Claude
**Base:** `main` @ `9a4597e` (shared layout layer merged from `claude/clients-frontend-revamp`)
**Initiative branch:** `facelift/app-wide` (this plan lives here; per-unit work branches off `main`)

---

## 0. Context & current state

The prospects section established the RockCap frontend canon (`docs/frontend-standards/`). The `clients-frontend-revamp` work (now on `main`) extracted that canon into a **reusable shared layout layer** at `src/components/layouts/` and migrated the three client/project **shells** onto it. What it deliberately deferred — per its "shell first, contents iterate" decision — is the **deep rework of tab contents**, which still carry a light token pass (shadcn `Card`/`Badge`/`Button` themed via aligned CSS vars, not yet on canon primitives).

This plan finishes that deferred work (the client side first) and then rolls the same canon across every remaining desktop section.

### What already exists (do not rebuild)

`src/components/layouts/` (barrel `index.ts`):

| Primitive | Role |
| --- | --- |
| `SHELL`, `EntityType` | shell offset constants + entity-type union |
| `TopAccent` | 2px entity-color top bar |
| `Breadcrumbs` (`Crumb`) | dotted breadcrumb row |
| `EntityIconTile` | 32×32 entity-color icon tile |
| `KpiRow` (`Kpi`) | header KPI grid |
| `TabStrip` (`TabDef`) | in-page tab strip with count badges |
| `Section`, `Row` (`DetailAside`) | 320px aside building blocks |
| `Panel` | flat hairline container — **canon replacement for shadcn `<Card>`** |
| `StatTile` | single metric cell — **canon replacement for `CompactMetricCard`** |
| `StatusPill` | generic tone-driven status pill |
| `clientStatusTone`, `projectStatusTone` | status→tone maps |
| `Skeleton`, `SkeletonText`, `SkeletonTable` | loading skeletons (canon: skeletons over spinners) |
| `EntityListScaffold`, `EntityDetailScaffold` | the two page scaffolds |

`Panel` and `StatTile` were added during in-progress deep rework of `ClientOverviewTab` + `ClientDetailAside`.

### Canon, in one paragraph

`useColors()` hook + inline `style={}` (never hardcoded Tailwind color classes). Light default, dark supported. Entity colors: client=green `#22c55e`, project=indigo `#6366f1`, prospect=amber `#eab308`, lender=teal `#14b8a6`. Depth via 1px hairline borders + bg layering (`bg.base`/`light`/`card`/`cardAlt`), never shadows. Mono for numbers/IDs/labels, sans for prose. Dense type scale (9–24px), large values at weight 300. Sharp corners (radius 2–4). Linear motion 100–250ms. Imperative voice, no emoji, no exclamation. Full reference: `docs/frontend-standards/{branding,tokens,patterns,page-templates}.md`; reference implementation: `src/app/(desktop)/prospects/` + `src/components/prospects/`.

### "Deep rework" definition (the light-pass → canon mapping)

A tab is **done** when it has zero `@/components/ui/*` color-bearing components and zero hardcoded Tailwind color classes, replaced as:

| Light-pass (current) | Canon (target) |
| --- | --- |
| `<Card>` / `CardHeader` / `CardContent` | `<Panel title accent>` |
| `CompactMetricCard` | `<StatTile>` (in a 1px-gap grid) |
| `<Badge>` (status) | `<StatusPill tone>` |
| `<Badge>` (flag/severity) | `FlagChip` (promote from prospects → layouts) |
| ad-hoc `<table>` / card grids of rows | `<DataTable>` (new primitive, §Phase 0) |
| "No X yet" empty blocks | `<EmptyState>` (new primitive, §Phase 0) |
| spinners / `loading…` text | `<Skeleton*>` |
| `<Button>` / `<Input>` / `<Select>` / `<Dialog>` | canon `Button`/`Field`/`Select`/`Modal` (new, §Phase 0) |
| `className="text-gray-500"` etc. | `style={{ color: colors.text.muted }}` |
| section headings | 9px mono-uppercase `text.muted` label |

Modals and forms keep their **logic**; only their chrome is restyled.

---

## 1. Goals & non-goals

**Goals**
1. Every desktop tab/section on the canon — visually coherent with prospects/clients shells.
2. A **complete** shared primitive set so no agent reinvents a `Card`/`Table`/`Modal`.
3. Parallelizable: each unit is an independent worktree off `main`, minimal cross-conflict.
4. No behavioural regressions — restyle only; data plumbing and logic untouched.

**Non-goals**
- Prospects section is **off-limits** (volatile; canon source, not a consumer). Do not refactor it onto the shared layer.
- Mobile (`(mobile)/m-*`) is out of scope for this initiative.
- No new features, no schema changes, no data-layer changes.
- `test/` page is cosmetic-low-priority (internal/dev surface) — last or skipped.

---

## 2. Sequencing strategy (why Phase 0 is a hard gate)

Parallel worktrees only stay conflict-free if they all import a **stable, complete** primitive set from `main`. If two agents each invent a `DataTable`, we get drift and merge pain. Therefore:

```
Phase 0 (primitives)  ──merge to main──►  Phase 1 (client tabs, parallel)  ──►  Phase 2 (app-wide, parallel)
   single worktree                          N worktrees off main                  N worktrees off main
   blocks everything                        each = 1 tab-group                     each = 1 section
```

Phase 0 is **serial and small**; it must land on `main` before fan-out. Phases 1 and 2 fan out: one branch/worktree per unit, each rebased on the latest `main`, each touching a disjoint file set (its own tab/section files), so merges are clean.

---

## Phase 0 — Complete the shared primitive set  *(serial; blocks fan-out)*

**Worktree:** `facelift/app-wide` (this one). **Land on `main` before Phase 1.**

Add the missing canon primitives to `src/components/layouts/` (+ barrel + a pure-logic vitest where logic exists). Each is theme-aware (`useColors()` + inline styles), mirrors `Panel`/`StatTile` conventions.

- [ ] **0.1 `DataTable`** — tokenized table: 9px mono-uppercase column headers, 1px `border.light` row dividers, `bg.card` rows, hover `bg.cardAlt`, optional row `onClick`, optional sticky header, right-align for numeric/mono cells, empty → renders `EmptyState`. Carry over TanStack Virtual option for long lists (the clients list already uses it). This is the highest-leverage primitive — used by nearly every tab.
- [ ] **0.2 `EmptyState`** — icon + 13px title + 11px `text.muted` body + optional action button. Replaces every "No X yet" block.
- [ ] **0.3 `Button` family** — `Button` (primary/secondary/ghost/danger tones via `useColors`), `IconButton`. Sharp corners, mono-or-sans per canon, 100ms linear hover. Canon replacement for shadcn `<Button>`.
- [ ] **0.4 Form `Field` set** — `Field` (label + control + hint/error), `Input`, `Textarea`, `Select`. Hairline border, `bg.card`, focus ring in entity/accent color. Replaces shadcn `Input`/`Textarea`/`Select`.
- [ ] **0.5 `Modal`** — backdrop (`bg.light` overlay), centered card (`bg.card`, hairline, radius 4), mono-uppercase title, footer action slot. Canon replacement for shadcn `Dialog`/`AlertDialog`. (Keep shadcn dialog *behavior* primitives if needed for focus-trap, but skin to canon — or wrap Radix.)
- [ ] **0.6 Promote `FlagChip`** from `src/components/prospects/FlagChip.tsx` into `layouts/` (it's already generic + `useColors`-based). Re-export from prospects to avoid churn there.
- [ ] **0.7 `SkeletonCard`** — add to the `Skeleton` family (Panel-shaped skeleton) for tab-level loading.
- [ ] **0.8 Barrel + a `primitives.md` cheat-sheet** under `docs/frontend-standards/` showing each primitive with a 3-line usage snippet, so Phase 1/2 agents copy not invent.

**Verify:** `npx tsc --noEmit`; `npm run test:run` (tone/logic units); `npm run build` (`next build --webpack`). Operator visual check on a scratch page.
**Land:** PR `facelift/app-wide` → `main`. **Gate: do not start Phase 1 until merged.**

> **Worktree build note:** Turbopack rejects a symlinked `node_modules` ("points out of filesystem root"). Each worktree needs either its own `npm install` **or** build/dev via `next build --webpack` / `next dev --webpack`. Document the team's choice in the worktree bootstrap.

---

## Phase 1 — Finish the client side (deep rework, all tabs)  *(parallel after Phase 0)*

Deep-rework **all 14 client tabs + 8 project tabs**. Decomposed into parallel **units** — each a worktree branch off `main`, touching only its own files. `ClientOverviewTab` + `ClientDetailAside` are mid-rework on `clients-frontend-revamp`'s worktree; reconcile that WIP into Unit 1A first (cherry-pick / finish it) rather than duplicating.

### Client profile tabs (`clients/[clientId]/components/`)

- [ ] **Unit 1A — Overview + Aside** *(reconcile existing WIP)*: `ClientOverviewTab`, `ClientDetailAside`, `ClientBeauhurstCards`, `MissingDocumentsCard`. Finish the in-flight `Panel`/`StatTile` rework; land it.
- [ ] **Unit 1B — Deals + Activity**: `ClientDealsTab`, `ClientActivityTab` → `DataTable` + `StatusPill` + timeline rows.
- [ ] **Unit 1C — Documents**: `ClientDocumentLibrary` → `DataTable`/grid on canon (already shadcn-free; tokenize + `Panel`/`EmptyState`).
- [ ] **Unit 1D — Contacts**: `ClientContactsTab`, `LinkContactDialog` → `Panel` cards/`DataTable`, `Modal`, `Field` set, `EmptyState`.
- [ ] **Unit 1E — Projects + Tasks**: `ClientProjectsTab`, `ClientTasksTab` → `DataTable` + `StatusPill`.
- [ ] **Unit 1F — Threads + Communications + Meetings**: `ClientThreadsTab`, `ClientCommunicationsTab`, `ClientMeetingsTab`, `MeetingCard`, `MeetingDetailView`, `CreateMeetingModal`, `EmailRequestModal`.
- [ ] **Unit 1G — Data + Intelligence + Checklist + Notes**: `ClientDataTab`, `ClientKnowledgeTab`, `KnowledgeChecklistPanel`, `DynamicChecklistInput`, `ClientNotesTab`, `NoteUploadModal`, `ClientHubSpotSection`. (`IntelligenceTab` is shared `@/components/` — coordinate; it also serves projects.)

### Project profile tabs (`clients/[clientId]/projects/[projectId]/components/`)

- [ ] **Unit 1H — Project Overview + Data**: `ProjectOverviewTab`, `ProjectDataTab` → `StatTile` KPI grid + `Panel` + `DataTable`.
- [ ] **Unit 1I — Project Documents + Notes + Tasks**: `ProjectDocumentsTab`, `ProjectNotesTab`, `ProjectTasksTab`.
- [ ] **Unit 1J — Project Intelligence + Checklist + Threads**: `ProjectKnowledgeTab`, `ProjectThreadsTab` (+ shared `IntelligenceTab`).

### Shared components touched (coordinate — single owner)

- [ ] **Unit 1K — Shared client/project components**: `@/components/IntelligenceTab`, `CompactMetricCard` (deprecate → `StatTile`), `FlagCreationModal`, `FlagIndicator`, `RestorationBanner`, `EditableStatusBadge`, `EditableClientTypeBadge`, `ClientSettingsPanel`. These are imported by both shells; assign one agent to avoid double-edits.

**Per-unit checklist:** branch off latest `main` → restyle files per the §0 mapping → `npx tsc --noEmit` → `next build --webpack` → operator visual check → PR to `main`. Keep units small enough to review in one sitting.

**Phase 1 exit:** every client + project tab renders with zero shadcn color components and zero hardcoded Tailwind color classes; loading states use `Skeleton*`; empty states use `EmptyState`.

---

## Phase 2 — App-wide rollout  *(parallel after Phase 1; ordered by operator value)*

Each section = one worktree/branch off `main`. Some sections (`docs`, `modeling`, `settings`) are large enough to sub-divide into units like Phase 1. Suggested order by daily-operator value + size:

| Wave | Section | Size | Notes |
| --- | --- | --- | --- |
| **2.1** | `rolodex` / `contacts` | small | contact book; align to client-list table pattern. Lender/contact entity colors. |
| **2.1** | `deals/[dealId]`, `companies/[companyId]` | small | detail pages → `EntityDetailScaffold` (deal=blue, lender/company=teal). |
| **2.1** | `inbox` | small | custom components; tokenize sidebar + detail panels. |
| **2.2** | `tasks` | medium | custom task components → `DataTable`/`StatTile`. |
| **2.2** | `approvals` | medium | approval queue → `Panel` + `StatusPill` + sticky footer pattern (copy prospects `StickyApprovalFooter`). |
| **2.2** | `calendar` | medium | react-big-calendar wrapper; theme via tokens + canon chrome around it. |
| **2.2** | `activity` | medium | timeline → canon rows + `StatTile`. |
| **2.3** | `filing`, `uploads/[jobId]`, `templates` | small–med | filing/upload flows + template CRUD → canon forms/`Modal`. |
| **2.3** | `notes` (+ `notes/templates`) | large | rich editor; coordinate with `feature/notes-overhaul` branch to avoid clashing. |
| **2.4** | `settings` (12 sub-pages) | large | sub-divide: one unit per logical group (folders, hubspot/-sync, gmail, fireflies, modeling-codes/-templates, category-settings, mcp-token, changelog, file-summary-agent). Settings shares a left-rail pattern → build a `SettingsLayout` once. |
| **2.4** | `docs` (27 files, ~10.7k lines) | very large | multi-panel doc browser; sub-divide: sidebar/breadcrumb, file list/grid, detail panel, the modals (upload/move/version). Highest-effort section. |
| **2.4** | `modeling` (~1.7k-line page + modals) | very large | monolithic; extract panels first, then restyle. Spreadsheet/grid surfaces need bespoke token work. |
| **2.5** | `test` | n/a | internal dev page — restyle last or leave. |

**Shared chrome:** `NavigationBar` + `Sidebar` are already canon (`useColors`). Confirm `(desktop)/layout.tsx` and any global `dashboard` landing match before declaring app-wide done.

**Per-section checklist:** same as Phase 1 per-unit. Large sections decompose into sub-units (one PR each).

---

## 3. Worktree execution model (parallel agents)

1. **One branch per unit**, named `facelift/<area>-<unit>` (e.g. `facelift/client-deals`, `facelift/settings-folders`), each off the **latest `main`**.
2. **One worktree per active agent**: `git worktree add .worktrees/<name> -b facelift/<area>-<unit> main`. Bootstrap node_modules per the worktree build note (own install, or `--webpack`).
3. **Disjoint file ownership** — units are carved so two agents never edit the same file. The shared-component units (1A's aside, 1K, `IntelligenceTab`, `SettingsLayout`) are explicitly single-owner; sequence them before the units that depend on them.
4. **Land small, rebase often** — short-lived branches → PR → squash to `main`. After each merge, in-flight worktrees `git rebase main` to pick up new primitives.
5. **Phase gates** — Phase 0 fully merged before Phase 1 fan-out; Phase 1 substantially merged before Phase 2 (so app-wide agents copy finished tab patterns).

---

## 4. Verification

- **Type gate (every change):** `npx tsc --noEmit` — no errors.
- **Logic units:** `npm run test:run` — tone maps + any new pure logic (TDD where logic exists).
- **Build gate (phase/PR boundary):** `cd model-testing-app && npx next build --webpack` — compiles clean. (Per CLAUDE.md the final step of any plan is a build + commit + push.)
- **Visual gate:** operator launches the dev server and drives the browser (do not auto-drive a preview). Light + dark mode both checked.
- **Regression guard:** restyle-only — confirm each modal/form still submits, each query still renders, tab `?tab=` URL sync intact.

---

## 5. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Primitive drift across parallel agents | Phase 0 hard gate + `primitives.md` cheat-sheet; no new shared primitives invented in Phase 1/2 without landing in `layouts/` first. |
| Merge conflicts between worktrees | Disjoint file ownership; single-owner shared-component units; rebase-on-main discipline. |
| `IntelligenceTab` / shared components edited twice | Assigned to single units (1G/1J coordinate via 1K). |
| Turbopack symlink-node_modules build failure | Use `next build --webpack` in worktrees, or per-worktree install. |
| Clashing with live branches (`feature/notes-overhaul`, `clients-frontend-revamp` WIP) | Reconcile notes section with that branch owner; finish the Overview/Aside WIP as Unit 1A rather than re-doing. |
| Scope creep into behaviour/features | Restyle-only rule; logic untouched; no schema/data changes. |

---

## 6. Open questions for operator

1. Confirm Phase 2 wave ordering (above is by operator-value × size) — any section you want pulled forward?
2. `test/` page — restyle or leave?
3. Notes section: coordinate with `feature/notes-overhaul`, or wait for it to land first?
4. How many parallel agents/worktrees do you want running per wave (drives unit granularity)?
