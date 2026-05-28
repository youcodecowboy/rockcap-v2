# Clients Frontend Revamp — Design

**Date:** 2026-05-28
**Status:** Approved (design); pending implementation plan
**Author:** Kristian + Claude
**Scope:** Desktop `clients` section (list + client profile + project profile) restyled to the RockCap frontend canon established by the prospects section.

---

## 1. Goal & motivation

Revamp the desktop **clients** section to match the visual + structural standard set by the recently-shipped **prospects** section (the de-facto reference implementation of `docs/frontend-standards/`). This is the first of several entity sections to be brought onto the canon; **projects** and **lenders** follow, so the work deliberately produces a reusable shared layer rather than a one-off restyle.

The clients section is the largest rework target: a list page, a 618-line profile shell with 14 tabs, a near-identical project-detail page with 8 tabs, and ~6,500 lines of tab components.

### The gap (current → target)

| Aspect | Prospects (target standard) | Current clients |
| --- | --- | --- |
| Color | `useColors()` + inline styles, tokens from `src/lib/colors.ts` | Tailwind hardcoded classes (`bg-green-100`) + shadcn |
| Detail header | Sticky `top:64`: 2px TopAccent → breadcrumbs → 32px icon tile → light-weight title → KPI grid → in-page tab strip | Back-link + badges + HubSpot chips + action buttons, shadcn `<Tabs>` |
| Detail layout | `1fr / 320px` two-pane with generic `Section`/`Row` aside | Flat 14-tab `<Tabs>`, slim metrics row on Overview only |
| List page | Full-width, no sidebar | 320px virtualized `ClientsSidebar` + router outlet (master-detail) |

The revamp is fundamentally a **styling-architecture migration** (Tailwind-hardcoded → token hook + inline styles) layered with **visual-pattern adoption** (TopAccent, breadcrumbs, icon tile, KPI header, in-page tab strip, `1fr / 320px` layout, generic aside).

---

## 2. Decisions (locked during brainstorming)

1. **Scope of first pass:** *shell first, contents iterate.* Rebuild the chrome (list page, profile header, tab strip, layout, aside) to canon; tab **contents** get only a light token/color pass. Deep per-tab rework is deferred to subsequent tab-by-tab passes.
2. **Reuse strategy:** *extract a shared layout layer.* Promote the generic shapes into `src/components/layouts/`, parameterized by entity color/data.
3. **List page shape:** *full-width, match prospects.* Drop the persistent sidebar; `/clients` becomes full-width, row click → `/clients/[id]`.
4. **Project-detail page:** *included this pass.* Adopt the same shared shell (indigo accent) so the client → project drill-down is coherent.
5. **Shared-layer shape:** *primitives + a thin scaffold.* Build small primitives **and** an `<EntityDetailScaffold>` / `<EntityListScaffold>` that wire the common arrangement; pages drop to raw primitives when bespoke.
6. **Prospects is OFF-LIMITS.** Prospects is under active overhaul for unique requirements. The shared layer is **sourced by copying** the good shapes out of prospects, but prospects is **not** refactored onto it and remains free to diverge. The shared layer serves **client / project / lender** only. Re-point prospects later only if the sections converge.

---

## 3. Existing infrastructure to build on

- **`src/lib/colors.ts`** — `LIGHT` / `DARK` token objects: `bg` (base/light/card/cardAlt), `border` (default/mid/light), `text` (primary/secondary/muted/dim), `accent`, `entityTypes`, `status`. `DARK` reuses `accent`/`entityTypes`/`status` from `LIGHT`.
  - `entityTypes.client = #22c55e` (green), `entityTypes.project = #6366f1` (indigo), `entityTypes.prospect = #eab308` (amber) — already mapped, no new colors needed.
- **`src/lib/useColors.ts`** — `useColors()` hook returns the active `ColorPalette`. Used inside `<ThemeProvider>` (`src/components/ThemeProvider.tsx`), mounted in `src/app/(desktop)/layout.tsx`.
- **App shell offsets** (from `src/app/(desktop)/layout.tsx` — `<main className="ml-20 pt-16">`): fixed **64px nav** (`NavigationBar`) + fixed **80px sidebar** (`Sidebar`). Detail headers stick at `top:64`; any sticky footer clears at `left:80`.
- **Backend note:** prospects and clients are the **same Convex table** (`Id<"clients">`); a prospect is a client in an early state. The client profile already shares data plumbing with the prospect profile.
- **Data layer:** Convex `useQuery` via custom hooks (`useClient`, `useProjectsByClient`, `useDocumentsByClient`, `useContactsByClient`, …). Unchanged by this work.

---

## 4. Architecture — the shared layout layer

New directory: **`src/components/layouts/`**. All components are theme-aware: `useColors()` + inline `style={}` objects (matching the prospects approach; **not** Tailwind utility classes for semantic color).

### 4.1 Constants

A small module centralizing the shell magic numbers currently hardcoded in prospects:

```ts
export const SHELL = { navHeight: 64, sidebarWidth: 80, asideWidth: 320 } as const;
```

### 4.2 Primitives

| Primitive | Responsibility |
| --- | --- |
| `<TopAccent type>` | 2px full-width bar in the entity color (`colors.entityTypes[type]`). |
| `<Breadcrumbs items>` | Crumb row; each crumb has a colored leading dot (entity color), `›` separators, last crumb inert (no `onClick`). |
| `<EntityIconTile type icon>` | 32×32 tile, `{color}15` background / `{color}40` border, entity icon glyph in entity color. |
| `<KpiRow items>` | N-column grid, 1px gaps filled by `border.default`, each cell on `bg.card` with `borderTop: 2px {accent}`, light-weight value, label, optional meta. |
| `<TabStrip tabs activeTab onChange>` | Horizontal in-page tabs; active tab `borderBottom: 2px {entity color}`; inactive `text.muted`; optional count badge per tab. |
| `<DetailAside>` + exported `Section` / `Row` | The 320px right-panel building blocks (lifted/generalized from `ProspectDetailAside`). `Section` = titled collapsible block; `Row` = label/value pair with optional pill. |
| `<StatusPill label tone>` | Generic status pill. Takes a **semantic tone** (a palette color), NOT a raw `colors.status[x]` lookup — see §4.4. |
| `<Skeleton>` family | `Skeleton`, `SkeletonText`, `SkeletonTable`, `SkeletonCard` — minimal, canon-mandated (skeletons over spinners). Net-new; prospects has none. |

### 4.3 Scaffolds

- **`<EntityDetailScaffold>`** — wires: `TopAccent` → sticky header (`top: SHELL.navHeight`) containing `Breadcrumbs` + `EntityIconTile` + light-weight title + `StatusPill` + `actions` slot + `KpiRow` → `TabStrip` → body grid `1fr / SHELL.asideWidth` (gap 1px on `border.default`) with `children` (main, on `bg.card`) + `aside` slot (on `bg.light`, `borderLeft`).
  Props: `entityType, breadcrumbs, title, status, actions, kpis, tabs, activeTab, onTabChange, aside, children`.
- **`<EntityListScaffold>`** — full-width list template: header (entity dot + title + count `Badge` + search input + `actions`) → optional filter strip → body slot (table or grouped sections). Row click navigates via the consumer's handler.

Escape hatch: a page needing something bespoke composes the primitives directly instead of the scaffold.

### 4.4 `StatusPill` tone mapping

`colors.status.*` is oriented to prospect/cadence state (`status.active` is **blue** = "in flight"). Client states carry different meaning, so `<StatusPill>` is generic and each section provides its own status→tone map:

| Client status | Tone | Rationale |
| --- | --- | --- |
| active | `accent.green` (#22c55e) | engaged borrower (matches client entity color) |
| prospect | `accent.yellow` (#eab308) | top-of-funnel (matches prospect entity color) |
| archived | `text.dim` / grey (#9a9a9a) | dormant |

The prospect `StatePill` color map stays in `src/components/prospects/` (untouched, per decision 6).

---

## 5. The three pages

### 5.1 `/clients` list — `clients/page.tsx`

- `<EntityListScaffold entityType="client">`: green dot + "Clients" + count `Badge` + search + actions (`New Client`, `Import CSV`).
- Body = **tokenized table**. Columns: Name · Type · `StatusPill` · Projects · Docs · Last activity. Client-side search + a type/status filter strip. Row click → `/clients/[id]`.
  - Chosen over prospects-style grouped sections because clients are a "look one up" book, not a state funnel. Grouped sections remain a low-cost future swap if desired.
- Carry the existing **TanStack Virtual** virtualization into the table body so a long book stays fast.
- `ClientsSidebar` is retired. It is referenced **only** by `clients/page.tsx`, so after migration the file is dead code → delete it.

### 5.2 `/clients/[clientId]` client profile — `clients/[clientId]/page.tsx`

- `<EntityDetailScaffold entityType="client">` (green). Breadcrumbs: `Dashboard › Clients › {client.name}`.
- Header: green icon tile + name + `<StatusPill>` (active/prospect/archived) + `actions` slot carrying over existing actions (Settings · New Project · Flag · Archive). HubSpot chips relocate into the aside.
- KPI row (5 cells): Projects · Documents · Contacts · Open deal value · Last activity. These are numeric facts/sums → granularity-rule-safe; the underlying **lists** remain as tabs.
- `<TabStrip>` renders the existing 14 tabs (Overview, Deals, Activity, Documents, Projects, Contacts, Tasks, Threads, Communications, Meetings, Data, Intelligence, Checklist, Notes) with `?tab=` URL sync preserved + cheap count badges where data is already loaded. The shadcn `<Tabs>` wrapper is replaced by `TabStrip` + conditional render (prospects pattern).
- Body `1fr / 320px`: main = active tab (light token pass only); aside = `<DetailAside>` `Section`/`Row` with persistent client metadata (HubSpot summary, owner, key contacts, recent activity). This absorbs today's Overview-only slim-metrics row into a panel visible on every tab.
- All existing modals (archive dialog, settings panel, flag modal, meeting-create) carried over verbatim.

### 5.3 `/clients/[clientId]/projects/[projectId]` project profile

- Same `<EntityDetailScaffold>`, `entityType="project"` (indigo). Breadcrumbs: `Dashboard › Clients › {client.name} › {project.name}` (full clickable parent chain).
- Indigo icon tile + project name + status pill + actions; project-appropriate KPI row (loan amount · LTV · stage · docs · days-in-stage); existing 8 tabs (Overview, Documents, Intelligence, Checklist, Threads, Data, Notes, Tasks) via `<TabStrip>`; `1fr / 320px` with a project-metadata aside.

---

## 6. Migration mechanics

- **"Light token pass" (tab contents) — definition.** Swap hardcoded Tailwind color classes (`bg-green-100`, `text-blue-500`, …) for token-aligned values so contents read correctly on the new token surfaces. **No** internal restructure, **no** de-shadcn-ing, **no** granularity-rule rework — those belong to the per-tab follow-up passes.
- **shadcn coexistence.** The shell + primitives are inline-styles + `useColors()`. Tab contents keep shadcn for now. Because shadcn themes via CSS variables (not `useColors()`), do a **one-time alignment of shadcn's CSS vars** in `globals.css` to the token palette (both light + dark) so shadcn cards/badges/borders inside tabs sit harmoniously on token surfaces — rather than editing every shadcn instance.
- **States (canon-compliant, minimal).** Loading → `<Skeleton>` shapes matching the header/table/tab layout (replaces today's `Loading…` text); empty → centered `text.dim` line + optional action; error → quiet card + Retry. No spinners.
- **Data layer.** Unchanged: Convex `useQuery` via existing hooks. Scaffolds are presentational; pages keep their queries.
- **Routing.** `/clients` becomes full-width (master-detail outlet removed). `?tab=` deep-linking preserved on profile + project pages.
- **Theming.** Light default; dark comes free via `useColors()` in the shell + primitives. The shadcn var alignment must not break light mode.

---

## 7. File change map

**New** (`src/components/layouts/`):
- `constants.ts` (`SHELL`)
- `TopAccent.tsx`, `Breadcrumbs.tsx`, `EntityIconTile.tsx`, `KpiRow.tsx`, `TabStrip.tsx`, `DetailAside.tsx` (+ `Section`/`Row`), `StatusPill.tsx`, `Skeleton.tsx`
- `EntityDetailScaffold.tsx`, `EntityListScaffold.tsx`

**Modified:**
- `src/app/(desktop)/clients/page.tsx` → list scaffold + tokenized virtualized table
- `src/app/(desktop)/clients/[clientId]/page.tsx` → detail scaffold (preserve modals, `?tab=`, actions, aside)
- `src/app/(desktop)/clients/[clientId]/projects/[projectId]/page.tsx` → detail scaffold (indigo)
- the 14 client tab components + 8 project tab components → light token pass
- `globals.css` → shadcn CSS-var alignment to token palette

**Deleted:**
- `src/app/(desktop)/clients/components/ClientsSidebar.tsx` (dead once list migrates — confirmed only referenced by `clients/page.tsx`)

---

## 8. Phasing (feeds the implementation plan)

1. Shared layer: constants, primitives, `StatusPill`, `Skeleton`, both scaffolds + shadcn CSS-var alignment.
2. `/clients` list page → list scaffold + table.
3. Client profile shell → detail scaffold (modals/`?tab=`/actions/aside preserved).
4. Light token pass on the 14 client tabs.
5. Project profile shell → detail scaffold (indigo).
6. Light token pass on the 8 project tabs.
7. `npx next build` from `model-testing-app/`, fix errors; commit + push.

---

## 9. Verification (CLAUDE.md mandated finish)

- `npx next build` from `model-testing-app/` (the Next app root) and fix any errors.
- User launches the dev server to eyeball the result (operator drives the browser; agent does not).
- Commit changes and push to GitHub.

---

## 10. Out of scope

- **Prospects** section — untouched (decision 6).
- **Deep per-tab internal rework** — the tab-by-tab follow-up passes (granularity-rule fixes, de-shadcn-ing, layout of tab internals).
- **Mobile** `(mobile)/m-clients` — separate canon.
- **Lenders** section — a later application of the same shared layer.

---

## 11. Risks & open questions

- **shadcn/token visual seams** during the light pass: the CSS-var alignment should minimize clashing grays/borders, but some tab internals may need touch-ups discovered during verification.
- **Virtualized table**: porting TanStack Virtual from a list-of-rows sidebar into a multi-column table is slightly more involved than a plain `<table>`; confirm row-height/measurement behavior.
- **618-line profile glue**: the profile page holds substantial modal/state orchestration; the scaffold swap must preserve every existing modal and the `?tab=` behavior exactly.
- **KPI selection** for the client + project headers is a first proposal; refine against what operators actually scan for during verification.
