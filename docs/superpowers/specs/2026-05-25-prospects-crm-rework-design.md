# Prospects CRM Rework + Frontend Standards Adoption — Design

**Date**: 2026-05-25
**Status**: Approved, awaiting implementation plan
**Author**: Brainstormed in Claude Code session
**Related**:
- `docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md` — the v1/v1.1 substrate this builds on
- `docs/frontend-standards/` — the design canon adopted in this work (saved earlier in this brainstorm)
- `/Users/cowboy/groovy/front-end/docs/` — the upstream source of the frontend canon (adapted for RockCap)

## Context

The cadence-fire v1.1 work landed the autonomy substrate (skillRuns + cadences + composer + meeting-prep responder) and the end-to-end test against Mccarthy Property Developments Ltd proved the autonomous loop fires correctly — but exposed a structural gap on the operator side: there is no UI surface to **review the intel + draft package before it fires**. Touches were created with `isActive: true` immediately and the 5-min cron fired Touch 1 within 25 seconds of staging. That's the right autonomy machinery; it's the wrong approval semantic.

The operator's review surface today is the Convex dashboard plus the per-touch `/approvals` queue. Both work for plumbing but neither is the CRM-style operating surface the gauntlet vision needs. The client deliverable described in the brief (drop XLSX of 25 prospects → see intel briefs + cadence packages → approve / edit / reject in the UI) requires a richer first-class surface.

This spec covers the **prospects CRM rework** — a meaningful redesign of `/prospects/page.tsx` and `/prospects/[prospectId]/page.tsx` plus a small package of supporting infrastructure (theme-aware shell, new MCP tools, schema additions, the package-level approval gate). It also formalises the **frontend standards adoption** — RockCap inherits the Groovy frontend canon (dense, semantic-color, sharp-corner, dual-theme) as its design system, saved to `docs/frontend-standards/`.

The work is scoped so the prospects CRM lands as the **first surface in the new design language**. Other pages migrate incrementally as they're touched — no big-bang facelift.

---

## 1. Goal and Success Criteria

### Goal

Rebuild the `/prospects` section as the RockCap-side CRM operating surface for the gauntlet: a stacked-table home page where prospects are grouped by state, and a tabbed detail page where the operator reviews intel + edits drafts + approves the package as a single unit. Adopt the Groovy frontend canon as RockCap's design system. Add a Candidates section so freshly-synced HubSpot companies are visible and triggerable via Claude Code. Add visual NEW/RUNNING/STUCK tags so two operators don't run prospect-intel on the same company.

### Success Criteria

The work is complete when all of the following are true:

1. **The home page renders the CRM stacked-table view.** Eight status sections (Candidates / Needs Review / Needs Revision / Active Cadence / Replied / Engaged / Promoted / Parked / Lost — total nine including Candidates), each with collapsible header showing count, expanded by default for the top 4 (Candidates / Needs Review / Needs Revision / Active Cadence). Real rows from real data — no roll-up tiles per the granularity rule.

2. **The detail page renders Template 3 layout** (per `docs/frontend-standards/page-templates.md`). Sticky header with TopAccent (amber), breadcrumbs, identity row with 32×32 icon tile, 5-KPI strip, in-page tabs (Overview / Intel / Outreach / Activity). Two-pane body (main + 320px aside). Sticky footer with ← → arrow nav, position indicator, and Skip / Deny / Request Revision / Approve buttons.

3. **The package-level approval gate works end-to-end.** Cadences created by prospect-intel start in `pending_package_approval` state. Operator clicks "Approve & Schedule" on the detail page → all cadences in the package release (`isActive: true`) and the dispatcher fires them on schedule. Operator can pause/edit/cancel any unfired touch from the CRM at any time.

4. **The revision flow works.** Operator clicks "Request Revision", writes a note, prospect moves to `needs_revision` state. Re-running prospect-intel with the note produces a new package; diff view shows original vs new per-touch; operator picks per-touch (accept new / keep original).

5. **The Candidates section auto-populates from HubSpot.** Companies synced from HubSpot that don't have a prospect-intel skillRun yet appear in the top section. NEW tag on never-run rows; RUNNING tag (with owner + age) on in-flight rows; checkbox disabled for RUNNING.

6. **`skillRun.start` detects in-flight duplicates.** Calling with a dedupKey of a company that already has a running skillRun returns `status: "already_running"` with prior owner and runId.

7. **Theme toggle works.** Light is default. Header button toggles to dark. `useColors()` hook is the canonical color access pattern, used by all new components. Sidebar.tsx + NavigationBar.tsx migrated to theme-aware colors.

8. **`docs/frontend-standards/` is the canonical reference** for new RockCap frontend work. New components built for the prospects rework follow the canon (sharp corners, dense typography scale, semantic color use, the entity color set, granularity rule).

9. **`npx next build` passes.** Smoke test: drop a real HubSpot company into Candidates, run prospect-intel from a Claude Code session, see it move to Needs Review, open the detail page, edit a touch, approve the package, watch the 5-min cron fire the touch on schedule.

### Explicitly NOT Success Criteria

- App-wide facelift complete. Only the prospects pages + theme infrastructure ship; other pages migrate incrementally as touched.
- Server-side batch trigger of prospect-intel (operator clicks "Run on N selected"). Deferred to v1.3. Operator triggers via Claude Code in v1.2.
- meeting-prep responder hardening against a real `book_meeting` reply. Separate session.
- qualify-and-draft hardening. Separate session.
- Live Google Calendar free/busy lookup for the meeting-prep responder slot proposal. Deferred to v1.2.1 or later.
- New atomic tools for the composer (touchpoint, CH charges, appetite). Tracked from cadence-fire v1.1 gaps; separate session.
- Workspace tab bar (multiple prospects open in tabs simultaneously). Out of scope per operator direction.
- Mission Control / Newton drawer. RockCap doesn't have it; not adding.

### Done Condition

All nine success criteria met, plus a real end-to-end smoke test against a fresh HubSpot company in the Candidates section. Any unmet criterion documented in the commit message or as an entry in the run's `gaps[]`.

---

## 2. Architecture

### 2.1 The prospect state machine

Eight states aligned to HubSpot's `lifecycleStage` + `hs_lead_status` so bidirectional sync stays clean:

| State | Trigger to enter | HubSpot mapping | Operator surface |
|---|---|---|---|
| `(candidate)` | HubSpot company sync, no prospect-intel run yet | `lifecycleStage: lead`, `hs_lead_status: new` | Candidates section (top of home page) |
| `drafted` | prospect-intel completes successfully | `lifecycleStage: lead`, `hs_lead_status: open` | Needs Review section |
| `needs_revision` | Operator clicks "Request Revision" with note | `lifecycleStage: lead`, `hs_lead_status: open` (no HubSpot change) | Needs Revision section |
| `active` | Operator approves package; cadences release | `lifecycleStage: marketingqualifiedlead`, `hs_lead_status: contacted` | Active Cadence section |
| `replied` | Reply event ingested, intent classified, awaiting routing | `lifecycleStage: marketingqualifiedlead` or `salesqualifiedlead`, `hs_lead_status: contacted` | Replied section |
| `engaged` | Meeting booked (book_meeting fired) or info_question replied substantively | `lifecycleStage: salesqualifiedlead`, `hs_lead_status: qualified` | Engaged section |
| `promoted` | Operator promotes to active client | `lifecycleStage: customer`, `hs_lead_status: connected` | Promoted section |
| `parked` | defer_long_term intent classified; long-term cadences queued | `lifecycleStage: lead`, `hs_lead_status: nurturing` | Parked section |
| `lost` | not_interested intent OR cadence exhausted with no reply | `lifecycleStage: lead`, `hs_lead_status: bad_fit` (or `lost`) | Lost section |

`(candidate)` is in parentheses because it's a *derived* state — a company is "candidate" iff it has no prospect-intel skillRuns row. The other 8 states live on a `clients.prospectState` field (extending the existing clients table — see Section 2.12).

Transitions:
- `(candidate)` → `drafted` on skillRun.complete with status='complete' or 'complete_with_gaps'
- `drafted` → `needs_revision` on operator action (request revision)
- `needs_revision` → `drafted` on operator action (accept new draft after revision diff)
- `drafted` → `active` on operator action (approve package)
- `active` → `replied` on inbound reply detected
- `replied` → `engaged` | `parked` | `lost` based on intent classifier
- Any state → `lost` on operator manual close
- Any state → `promoted` on operator promote-to-client

### 2.2 Page 1: /prospects (home — CRM list view)

Following Template 2 (List/Index) from `docs/frontend-standards/page-templates.md`, adapted for stacked-tables-by-status rather than a single flat list.

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  ● Prospects [847]    [⌕ search] [Import XLSX] [+ New]   │  page header
├──────────────────────────────────────────────────────────┤
│  ● Candidates [N new]                                ▾   │  collapsible
│  ┌────────────────────────────────────────────────────┐  │
│  │ row per HubSpot company without skillRun           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ● Needs Review [N drafted]                          ▾   │  expanded
│  ┌────────────────────────────────────────────────────┐  │
│  │ row per prospect in drafted state                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ● Needs Revision [N]                                ▾   │  expanded
│  ● Active Cadence [N]                                ▾   │  expanded
│  ● Replied [N]                                       ▾   │  expanded
│  ● Engaged [N]                                       ▸   │  collapsed
│  ● Parked [N]                                        ▸   │  collapsed
│  ● Promoted [N]                                      ▸   │  collapsed
│  ● Lost [N]                                          ▸   │  collapsed
└──────────────────────────────────────────────────────────┘
```

**Section behaviour:**
- Each section header: status dot (entity color), uppercase mono title, count, expand/collapse chevron
- Default expanded: Candidates / Needs Review / Needs Revision / Active Cadence / Replied
- Default collapsed: Engaged / Parked / Promoted / Lost
- Collapse state persists per user in localStorage

**Row format (varies per section):**

Common to most sections: checkbox (left), Company name + sublabel, plus section-specific columns.

| Section | Columns |
|---|---|
| Candidates | check / Company + sublabel / HubSpot ID / Industry / Lifecycle stage / **NEW/RUNNING/STUCK pill** / Synced |
| Needs Review | check / Company + sublabel / CH / Source / Tier (HOT/WARM/SPECULATIVE) / Cadence draft (N touches · Xd) / Drafted at / Owner |
| Needs Revision | check / Company / Revision note / Asked at / Owner |
| Active Cadence | Company + sublabel / Touches sent (N/M) / Next due / Last sent / Owner |
| Replied | Company / Intent pill / Evidence / Drafted reply / Received at |
| Engaged | Company / Meeting at / Project link (if any) / Owner |
| Parked | Company / Reason / Next wakeup / Owner |
| Promoted | Company → Client link / Promoted at / Owner |
| Lost | Company / Closed reason / Closed at |

**Bulk actions** appear when any checkbox is checked. The bar at the bottom of the section (NOT the page footer) shows: "N selected" + relevant actions (Approve / Request Revision / Cancel / Run prospect-intel via Claude / Promote). Different sections expose different actions.

**Row click** opens the prospect detail page (`/prospects/[prospectId]`) in-page (no workspace tab bar — single-page nav per operator direction).

**Search** filters across all sections by company name, CH number, HubSpot ID, contact name. Active filter shows as a chip below the header (clickable to clear).

**Live updates** via Convex `useQuery` — new HubSpot companies appearing in the 6h sync trigger reactive UI refresh without page reload.

### 2.3 Page 2: /prospects/[prospectId] (detail)

Following Template 3 (Detail) from `docs/frontend-standards/page-templates.md` exactly.

**Sticky header** (per pattern 4b — Detail Page Header):
- TopAccent: 2px amber bar at the very top
- Breadcrumbs row: `[● Dashboard] › [● Prospects] › [● {company name}]`
- Identity row: 32×32 amber icon tile + `<h1>` company name + subtitle (location · sublabel · tier) + CH/run id (mono) + status pill (8 states, color-coded per Section 2.1)
- 5-KPI strip: Tier / Cadence (N touches · Xd) / Intel coverage (%) / Last touch / Replies
- In-page tabs strip: **Overview** (active default) · **Intel** · **Outreach** (N) · **Activity**

**Body** — two-pane grid: main column (flex) + 320px right aside, separated by 1px border.

**Main column content** varies per tab:

| Tab | Content |
|---|---|
| Overview (default landing) | Action callout panel ("Package awaiting approval", "Reply received — needs routing", "Cadence active — N/M touches sent" — varies by state); Intel summary panel (excerpt + "Full intel →" link); Outreach package panel (all touches inline as cards with subject + scheduled-at + body preview + Edit link); Gaps panel (if skillRun produced gaps) |
| Intel | Full markdown intel report rendered + edit mode toggle (markdown editor — see Section 2.7) |
| Outreach (N) | Per-touch editable card. Subject (text input). Body (textarea with auto-resize). Scheduled-at (datetime picker). Per-touch actions: Reset (revert operator edits to skill-drafted). Cadence aggressiveness preset picker at top of tab (Light / Moderate / Aggressive / Custom) — switching preset adjusts all touch dates per Section 2.9 |
| Activity | Chronological event log: skillRun started/complete, cadences queued/fired/skipped, replies received, state transitions, operator actions (edits, revisions, approvals) |

**Right aside (320px)** — five grouped panels:
- **Identity** — Companies House (mono link), HubSpot (mono link → HubSpot URL), Convex id, Location, Industry
- **Pipeline** — Source, Tier, HubSpot stage, Lead status, Owner
- **Cadence** — Package id (mono), Touches count, Total duration, Aggressiveness preset (clickable to change)
- **Linked** — Contact (purple dot, clickable), SkillRun (cyan dot), Approval if active (red dot), HubSpot company (link)
- **Activity** — Last 4 events (mono timestamps) with "Full activity →" link to the Activity tab

**Sticky footer** (custom — not in Groovy canon today; may promote to pattern after second use):
- Left side: ← → arrow buttons + position indicator ("3 / 12 drafted") + keyboard hint ("↑↓ navigate · Esc to return")
- Right side: action buttons varying by state:
  - drafted: Skip · Deny · Request Revision · **Approve & Schedule** (primary, green)
  - needs_revision: View diff → ... · Skip
  - active: Pause cadence · Cancel remaining · Override next touch
  - replied: View reply · Approve drafted response (primary)
  - engaged: Promote to client · Mark engaged · Pause
  - parked: Wake now · Cancel parking
  - promoted: View client → · Reactivate (rare)
  - lost: Reopen · (most actions hidden)

Arrow keys (← / →) cycle through prospects in the **same status filter the operator entered the detail from** — if they clicked into Needs Review, arrows cycle the 12 drafted prospects; if they clicked from Replied, arrows cycle replied prospects. Position indicator updates. Esc returns to the home page with scroll position restored.

### 2.4 The revision flow

When the operator clicks "Request Revision" on a `drafted` prospect:

1. A modal appears asking for the revision note (textarea, required). Examples surface as placeholder hints: "Reword Touch 2 — too aggressive on rates", "Tighten intel — irrelevant CH charge cited", "Re-run after Companies House sync".
2. Operator types the note + clicks Submit.
3. Prospect moves to `needs_revision` state. Cadence rows remain (paused). The skillRun row gets a `revisionRequestedAt`, `revisionNote`, `revisionRequestedBy` fields.
4. The new MCP tool `cadence.requestRevision` (Section 2.11) is the API surface. Either operator's Claude Code session picks up the revision and re-runs prospect-intel, OR (v1.3) a server-side job does it automatically.
5. On re-run: prospect-intel reads the original skillRun + revision note as context. Produces a new package. The new touches are written to NEW cadence rows (keeping originals for diff). Prospect moves back to `drafted` with a `revisionDiffPending: true` flag.
6. The detail page's Outreach tab now shows the diff view: per-touch original ↔ new side-by-side, with "Accept new" or "Keep original" buttons. Operator goes through, picks per-touch.
7. After diff resolution, the original-and-rejected cadences are deleted; the kept ones become the active package. Operator can then approve as usual.

Edit-locking: when operator manually edits a touch via the Outreach tab, that touch's row gets `editedByOperator: true` + `editedAt`. A future revision re-run skips overwriting operator-edited touches unless the operator's revision note specifically calls them out (Claude makes the judgement based on the note text).

### 2.5 Candidates section + NEW / RUNNING / STUCK tags

**Candidates** is a derived view: companies in the `companies` table that don't have a prospect-intel skillRun (or have only failed/cancelled runs).

Visual tags per row:
| Pill | Meaning | Selectable? |
|---|---|---|
| **NEW** (green) | No skillRuns row for this company exists | yes |
| **RUNNING** (blue + pulse animation) | skillRuns.status='running' AND `_creationTime` within 2h | **no** — checkbox disabled; hover shows owner + age |
| **STUCK** (amber) | skillRuns.status='running' AND `_creationTime` > 2h ago | yes (after a "Reset stuck run" admin action) |

**The `skillRun-staleness-sweep` cron** (daily) auto-marks runs older than 6h as `failed` with `errors: [{step: "stale_runtime", message: "runtime exceeded threshold; auto-marked failed"}]`. Once auto-failed, the company is back in NEW state (no in-flight run). The STUCK pill is a transient state between 2h and 6h where the operator has the option to manually reset before the cron does it.

**Race prevention** has three layers:
1. UI: RUNNING rows have disabled checkboxes — operators can't select them for bulk actions
2. MCP: `skillRun.start` returns `status: "already_running"` when called with a dedupKey that has an in-flight run (Section 2.11)
3. Convex: the same query that powers (1) and (2) is the source of truth — no separate lock needed

### 2.6 Approval gate model (single package gate)

When prospect-intel writes cadence rows, they are created with a new field `packageApprovalStatus: "pending"`. The dispatcher's `findDueInternal` query filters on this — pending rows are ignored.

When the operator clicks "Approve & Schedule" on the detail page:
1. New mutation `cadences.approvePackage(packageId)` patches all rows in the package with `packageApprovalStatus: "approved"` + `approvedBy: userId` + `approvedAt: now`
2. The first touch (packageOrder=1) typically has `nextDueAt` already in the past, so the next cron tick fires it
3. Subsequent touches fire on their scheduled `nextDueAt`
4. Operator can edit/pause/cancel any unfired touch via the CRM — the dispatcher's existing skip checks (pauseUntil, opt-out, idempotency) cover those cases

When the operator clicks "Deny":
- All cadence rows in the package get `isActive: false` + `cancelledReason: "operator_denied_package"`
- skillRun gets `status: "cancelled"` (if not already complete)
- Prospect moves to `lost` state with closed reason "operator denied at draft"

When operator clicks "Skip":
- No state change. Returns to home page. Prospect stays in `drafted` for later review.

### 2.7 Storage shape

| Content | Where it lives | Edit shape |
|---|---|---|
| 2-paragraph brief (existing) | `skillRuns.brief` (text) | Markdown editor — small surface |
| Full intel report (new) | `skillRuns.intelMarkdown` (text, optional) | Markdown editor — full surface in Intel tab |
| Touch subject | `cadences.preDraftedTouch.subject` (existing) | Text input |
| Touch body (plain text) | `cadences.preDraftedTouch.bodyText` (existing) | Textarea, auto-resize |
| Touch body (HTML) | `cadences.preDraftedTouch.bodyHtml` (existing) | Auto-generated from bodyText on save (no separate editor) |
| Touch scheduled-at | `cadences.nextDueAt` (existing) | Datetime picker |
| Cadence dynamic vars | `cadences.preDraftedTouch.dynamicVars` (existing, optional) | Not user-editable in v1.2 |

When operator edits a touch field in the Outreach tab, the change writes immediately to Convex via `cadence.update` mutation (Section 2.11). Auto-save debounced 500ms after last keystroke.

`skillRuns.intelMarkdown` is **new**. It's a richer expansion of the existing 2-paragraph `brief`. prospect-intel produces both: `brief` is the executive summary; `intelMarkdown` is the full report (sections for Identity, Key People, Lender DNA, Classification, Trigger context, Operator notes from any prior revision). Both are markdown strings stored as text on the skillRuns row.

### 2.8 HubSpot bidirectional sync

State transitions in RockCap push back to HubSpot via the existing `hubspotSync` write surface.

| RockCap state | HubSpot lifecycleStage | HubSpot hs_lead_status |
|---|---|---|
| (candidate) | lead | new |
| drafted | lead | open |
| needs_revision | lead | open (unchanged) |
| active | marketingqualifiedlead | contacted |
| replied | marketingqualifiedlead OR salesqualifiedlead | contacted |
| engaged | salesqualifiedlead | qualified |
| promoted | customer | connected |
| parked | lead | nurturing |
| lost | lead | bad_fit |

Push direction: RockCap → HubSpot only. The 6h HubSpot sync continues to pull company-level fields (lifecycleStage, hs_lead_status, custom properties) from HubSpot → RockCap, but state-machine-relevant fields are governed by RockCap's prospectState. If HubSpot's lifecycleStage advances independently (e.g., a HubSpot user manually marks a prospect as customer), the sync detects the divergence and surfaces a conflict for operator resolution (a chip on the prospect detail page; deferred to v1.2.1 if implementation is heavy).

### 2.9 Cadence aggressiveness presets

Three presets, picker in the Outreach tab + Cadence aside panel:

| Preset | Touches | Total duration | Offset pattern (days from approval) |
|---|---|---|---|
| Light | 4 | 60 days | 0 / +14 / +30 / +60 |
| Moderate (default) | 4 | 30 days | 0 / +5 / +12 / +30 |
| Aggressive | 5 | 21 days | 0 / +2 / +5 / +10 / +21 |
| Custom | N | (operator-defined) | Per-touch datetime picker — any value |

Switching preset: a confirmation modal appears showing "This will update Touch 2 from May 28 → May 30 (Light)". Touches the operator has edited keep their edits; only dates change. If a touch has already fired (Touch 1 always fires fast), switching preset doesn't reset its state.

prospect-intel writes the default Moderate preset. Operator can switch in the detail page Outreach tab before approval.

### 2.10 Theme system (light default + dark toggle)

Light is the canonical default per `docs/frontend-standards/branding.md`. Dark mode is supported via toggle for operator preference.

**Implementation:**
- New `ThemeProvider` component at `src/components/ThemeProvider.tsx` wraps the desktop layout root
- New `useColors()` hook returns the active theme's color object
- Color tokens in `src/lib/tokens/colors.ts` — light and dark palettes per `docs/frontend-standards/tokens.md`
- Theme preference persists in localStorage under `'rockcap-theme-mode'`
- Respects `prefers-color-scheme` on first load
- Theme toggle button added to `NavigationBar.tsx` — minimal addition, doesn't replace any existing chrome

**Scope of theme-aware migration in v1.2:**
- New components built for /prospects rework → fully theme-aware
- `Sidebar.tsx` + `NavigationBar.tsx` → migrated to use `useColors()` (so the chrome respects the toggle)
- All other pages → out of scope; migrate incrementally as touched (per `docs/frontend-standards/README.md` migration nudge)

### 2.11 New MCP tools

Five new tools added to `convex/mcp.ts`:

1. **`cadence.update`** — update fields on an existing cadence row. Args: cadenceId + any of (preDraftedTouch.subject, preDraftedTouch.bodyText, preDraftedTouch.bodyHtml, nextDueAt). Sets `editedByOperator: true` + `editedAt: now`. Returns updated row.

2. **`cadence.requestRevision`** — mark a package for revision. Args: packageId + revisionNote. Patches all cadences in the package with `revisionRequested: true` + `revisionNote` + `revisionRequestedBy: userId` + `revisionRequestedAt: now`. Sets the parent skillRun fields too. Patches `clients.prospectState: "needs_revision"` for the linked client (if any).

3. **`prospect.transitionState`** — explicit state transition for the prospect (operator-driven). Args: prospectId + newState ("approve_package" | "deny" | "promote" | "lose" | "reopen" | "park" | "engage"). Handles the state-specific side effects (cadence approvals, HubSpot push-back, linked entity updates).

4. **`companies.listUnprocessed`** — query candidates from Claude Code. Args: `limit?` (default 25), `sinceDays?` (default 30), `excludeWithSkillRun?` (default true), `excludePromoted?` (default true), `lifecycleStage?`, `states?` (default `["new"]`). Returns array of company rows with a `state: "new" | "running" | "stuck"` field per row.

5. **`approval.get`** — read an approval row by id (read-only). Closes the v1.1-flagged gap where the operator couldn't audit the approval row from the skill side without Clerk auth. Args: approvalId. Returns full row + linked entity ids. (Bonus gap closure — not strictly required for v1.2 but cheap to add since we're in the file.)

`skillRun.start` gets a 3-line update to its existing dedup logic: relax the status filter in `findRecentByDedupKeyInternal` to also match in-flight runs (status='running'), and on a hit, return a new `status: "already_running"` response shape with prior runId, owner, and age.

### 2.12 Schema additions

Modify existing tables. No new tables.

**`clients` table** (existing):
- Add `prospectState: v.optional(v.union(...))` — the 8-literal state enum. Optional because `clients` rows also include active clients that aren't in the prospect funnel. When null, the client is not a tracked prospect (or was never one). Added index: `by_prospect_state` on `["prospectState"]`.

**`cadences` table** (existing):
- Add `packageApprovalStatus: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")))` — defaults to `"pending"` on create; dispatcher's findDueInternal filters on `"approved"` only.
- Add `editedByOperator: v.optional(v.boolean())` + `editedAt: v.optional(v.string())` — set by `cadence.update`. Revision re-runs respect these flags.
- Add `revisionRequested: v.optional(v.boolean())` + `revisionNote: v.optional(v.string())` + `revisionRequestedBy: v.optional(v.id("users"))` + `revisionRequestedAt: v.optional(v.string())` — populated by `cadence.requestRevision`.
- Add `approvedBy: v.optional(v.id("users"))` + `approvedAt: v.optional(v.string())` — populated by `prospect.transitionState("approve_package")`.

**`skillRuns` table** (existing):
- Add `intelMarkdown: v.optional(v.string())` — the full intel report (richer than `brief`).
- Add `revisionRequestedAt: v.optional(v.string())` + `revisionNote: v.optional(v.string())` + `revisionRequestedBy: v.optional(v.id("users"))` + `parentRunId: v.optional(v.id("skillRuns"))` — links a revision re-run back to the original skillRun for diff context.

**No `companies` table changes.** The Candidates query is a derived JOIN.

**Index additions:**
- `clients.by_prospect_state` for the home page status sections
- `cadences.by_package_id_approval_status` for package-level operations
- `companies.by_lastHubSpotSync` for the Candidates section's sort-by-recent (likely already exists; verify)

---

## 3. Frontend Standards Adoption

### 3.1 What was saved to `docs/frontend-standards/`

Five files, copied from the Groovy upstream with RockCap-specific adaptations:

| File | Status |
|---|---|
| `README.md` | Adapted — RockCap-specific intro, repo layout reference |
| `branding.md` | Adapted — RockCap entity color table (Prospect / Client / Lender / Project / Deal / Contact / Cadence / Approval / SkillRun / Analytics), light-default posture, voice rules |
| `tokens.md` | Verbatim from Groovy — color/typography/spacing/transitions tokens are domain-neutral and transfer cleanly |
| `patterns.md` | Verbatim from Groovy — app shell, sidebar nav, in-page tabs, granularity rule, breadcrumbs, theming. Domain-neutral. |
| `page-templates.md` | Verbatim from Groovy — list / detail / builder / form templates. Domain-neutral. |

Future changes to the docs are RockCap-owned; the Groovy source is not a maintained upstream dependency.

### 3.2 How it applies to v1.2

Every component built for the prospects rework follows the canon:
- Colors via `useColors()` from `ThemeProvider`, not hardcoded hex
- Spacing via `spacing[N]` tokens, not raw px
- Typography via `textStyles.*` or composed from `typography.*` tokens
- Borders via `border.default` token, 1px, sharp corners (4px default `borderRadius.md`)
- Mono font for IDs, timestamps, numbers, CH numbers
- Sans font for narrative
- Semantic entity colors (Prospect = amber `#eab308`)
- Granularity rule: render records, not roll-ups
- Detail pages use Template 3 with TopAccent + Breadcrumbs

### 3.3 Migration approach for the rest of the app

Out of scope for v1.2. Incremental migration as pages are touched:
- When a page is being modified for an unrelated reason, the migration is included in that PR (small overhead per page)
- Pages stuck on the old design language are noted in a tracking issue (`docs/frontend-standards/migration-status.md` — author when the v1.2 work lands)
- `Sidebar.tsx` + `NavigationBar.tsx` are migrated in v1.2 because they're shared chrome — keeping them on hardcoded colors would break the theme toggle for all pages

---

## 4. Definition of Done and Out of Scope

### 4.1 Definition of Done (work-level)

All of:
1. The nine success criteria from Section 1 verified.
2. Schema migrations deployed (`cadences.packageApprovalStatus`, `clients.prospectState`, `skillRuns.intelMarkdown`, plus the edit / revision / approval tracking fields).
3. Five new MCP tools live + verified via `curl` against `tools/list`.
4. `skillRun.start` extended dedup logic returns `already_running` correctly for an in-flight smoke test.
5. `ThemeProvider` + `useColors()` infrastructure in place; theme toggle works in the header; localStorage persistence verified.
6. `Sidebar.tsx` + `NavigationBar.tsx` migrated to `useColors()`.
7. `/prospects` home page renders the 9 stacked sections with real Convex data.
8. `/prospects/[prospectId]` detail page renders Template 3 layout with Overview/Intel/Outreach/Activity tabs + sticky footer + arrow nav.
9. `npx next build` from `model-testing-app/` passes.
10. End-to-end smoke test: drop one HubSpot company into Candidates → run prospect-intel via Claude Code → company moves to Needs Review → operator opens detail page → edits Touch 2 body → clicks Approve → first touch fires within 5 minutes via cron → Touch 1's approval row visible in `/approvals`.
11. Commits pushed with appropriate `[app]` / `[skills]` / `[docs]` prefixes.

### 4.2 Out of Scope (Deferred)

| Item | Defer to |
|---|---|
| Server-side batch trigger of prospect-intel ("Run on N selected" button fires N skillRuns server-side without operator going to Claude Code) | v1.3 |
| meeting-prep responder Level-A hardening against a real book_meeting reply | Separate session |
| qualify-and-draft hardening | Separate session |
| Live Google Calendar free/busy lookup for meeting-prep responder slot proposal | v1.2.1 |
| New atomic tools (touchpoint, CH charges, appetite) for cadence-fire composer | Separate session (tracked from cadence-fire v1.1 gaps) |
| HubSpot push-back conflict resolution UI (when HubSpot state diverges from RockCap state) | v1.2.1 |
| App-wide facelift (other pages migrated to design canon) | Incremental as pages are touched |
| Workspace tab bar | Explicitly not building per operator direction |
| Mission Control / Newton drawer | Not part of RockCap product |
| `companies-house.fetchAndCache` MCP tool (was a gap from prospect-intel run) | Separate session |
| Intelligence write MCP tools (was a gap from prospect-intel run) | Separate session |
| HubSpot bidirectional contact sync gap fix (`hubspotContactIds` array population) | Separate session |
| Skill orchestrator (server-side autonomous batch firing of prospect-intel) | v1.3 — depends on composer pattern generalising |

### 4.3 Anti-scope-creep Rules

| Temptation | Correct action |
|---|---|
| "I see I need atomic tools for the composer, let me add them" | Out of scope. Note in gaps; ship without. |
| "Let me also harden meeting-prep against a real reply" | Out of scope. Separate session. |
| "Let me migrate the dashboard / clients / projects pages to the new canon while I'm here" | Out of scope. Incremental as touched, not big-bang. |
| "Let me build the server-side batch trigger so operators don't need Claude Code" | v1.3. v1.2 is operator-pastes-command. |
| "Let me add the workspace tab bar from the Groovy canon" | Explicitly rejected per operator direction. |
| "Let me fix the HubSpot bidirectional sync gap from the prospect-intel run" | Separate session. Note in gaps. |
| "Let me add the meeting-prep calendar integration" | v1.2.1 or later. |
| "Let me build the diff view UI with rich markdown side-by-side" | Plain text side-by-side acceptable for v1.2. Polish in v1.3 if used. |

---

## 5. Open Considerations (Acknowledged, Deferred)

These were raised and consciously deferred during the brainstorm:

- **Multi-operator state of in-flight approvals.** If User A is in the middle of editing Touch 2 and User B opens the same prospect, last-write-wins. v1.2 ships without optimistic locking. Probably fine at single-team scale; revisit if collisions surface in real use.
- **`packageApprovalStatus` default behaviour for existing data.** When the schema change deploys, existing cadences (none in production today other than smoke tests) get `packageApprovalStatus: undefined`. The dispatcher's filter must treat undefined as "approved" to avoid breaking existing rows OR a one-time migration patches all existing rows to `"approved"`. Recommend: migration script in the implementation plan. Cheap.
- **HubSpot lead status values.** The values in the mapping table (`new` / `open` / `contacted` / `qualified` / `connected` / `nurturing` / `bad_fit`) are HubSpot's defaults but operator may have custom values. Verify against the operator's actual HubSpot configuration in the implementation phase; adjust if needed.
- **Markdown editor choice.** Multiple options (Lexical, ProseMirror, simple textarea + preview, react-markdown for read-only). For v1.2: simple textarea with preview pane toggle. Richer editor if operator asks for it later.
- **Revision diff UI** — for v1.2 plain text side-by-side is acceptable. If usage grows and operators want richer diffs (intra-line highlights, word-level), upgrade to a proper diff library (jsdiff or similar) in v1.3.
- **Stuck-run threshold (2h for STUCK pill, 6h for auto-fail).** These are best-guess defaults. May need tuning based on real run durations once a few real prospect-intel runs complete in production.
- **Custom cadence preset persistence.** Operator can edit per-touch dates (Custom preset). For v1.2, custom is per-package; if operator builds the same custom shape repeatedly, deferred to v1.3 to save "operator's preset" as a 4th option in the picker.

If any of these become urgent before the implementation phase, they get their own spec.

---

## 6. References

- `docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md` — v1/v1.1 substrate this builds on
- `docs/superpowers/plans/2026-05-23-cadence-fire-autonomy-engine-v1.md` — v1 implementation plan
- `docs/superpowers/plans/2026-05-23-cadence-fire-v1.1-composer-and-meeting-prep.md` — v1.1 implementation plan
- `docs/frontend-standards/README.md` — design system canon (adopted in this work)
- `docs/frontend-standards/branding.md` — RockCap entity color table + voice rules
- `docs/frontend-standards/tokens.md` — color / typography / spacing tokens
- `docs/frontend-standards/patterns.md` — app shell, in-page tabs, granularity rule, theming, breadcrumbs
- `docs/frontend-standards/page-templates.md` — Template 3 (Detail) used by the prospect detail page
- `skills/skills/prospect-intel/SKILL.md` — the skill that produces the intel + cadence package this CRM reviews
- `skills/skills/cadence-fire/SKILL.md` — the dispatcher contract; prospects CRM provides the package-approval gate it now respects
- `model-testing-app/convex/schema.ts` — where the schema additions land
- `model-testing-app/convex/mcp.ts` — where the 5 new MCP tools land
- `model-testing-app/convex/cadences.ts` + `skillRuns.ts` + new `prospects.ts` mutations
- `model-testing-app/convex/crons.ts` — where the `skillRun-staleness-sweep` cron registers
- `model-testing-app/src/app/(desktop)/prospects/page.tsx` — rewritten as the CRM home
- `model-testing-app/src/app/(desktop)/prospects/[prospectId]/page.tsx` — rewritten as the tabbed detail
- `model-testing-app/src/components/Sidebar.tsx` + `NavigationBar.tsx` — migrated to `useColors()`
- New: `model-testing-app/src/components/ThemeProvider.tsx`, `src/lib/colors.ts`, `src/lib/useColors.ts`
- New: `model-testing-app/src/components/prospects/*` — the suite of components for the rework
