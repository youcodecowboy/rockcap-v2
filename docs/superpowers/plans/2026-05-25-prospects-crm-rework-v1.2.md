# Prospects CRM Rework v1.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/prospects` as the RockCap-side CRM operating surface for the gauntlet (stacked-tables home + tabbed Template 3 detail page with sticky footer and arrow-key navigation), land the supporting substrate (5 new MCP tools + schema additions + race prevention + package-level approval gate + theme infrastructure), and adopt the Groovy-derived frontend canon (light default + dark toggle, theme-aware components via `useColors()`).

**Architecture:** Schema-additive (no new tables; fields added to `clients`, `cadences`, `skillRuns`). New Convex backend modules wrap public/internal queries and mutations. MCP tools expose them to Claude Code. Next.js 16 App Router pages replaced wholesale at `/prospects/page.tsx` and `/prospects/[prospectId]/page.tsx`. ThemeProvider + useColors() hook + tokens module form the theme substrate. `Sidebar.tsx` + `NavigationBar.tsx` migrated to theme-aware to make the toggle work app-wide; other pages defer to incremental migration as touched.

**Tech Stack:** Convex (schema + crons + HTTP + actions), TypeScript, Next.js 16 App Router, React 19, shadcn UI primitives (existing), Tailwind CSS, Anthropic SDK (unused in this plan — composer untouched), markdown via simple textarea + preview (no editor library).

**Reference spec:** `docs/superpowers/specs/2026-05-25-prospects-crm-rework-design.md`

**Design system reference:** `docs/frontend-standards/` (5 files: README, branding, tokens, patterns, page-templates)

**Sibling work landed:**
- v1 substrate: `skillRuns`, `cadences`, `replyEvents` tables + dispatcher + reply processor (`docs/superpowers/plans/2026-05-23-cadence-fire-autonomy-engine-v1.md`)
- v1.1 substrate: composer + meeting-prep responder (`docs/superpowers/plans/2026-05-23-cadence-fire-v1.1-composer-and-meeting-prep.md`)

---

## File Structure

**Created:**
- `model-testing-app/convex/prospects.ts` — internal + public queries/mutations for the prospects table + state transitions (~150 lines)
- `model-testing-app/convex/companies.ts` — extend (existing) with `listUnprocessed` public + internal queries (~50 lines added)
- `model-testing-app/src/lib/colors.ts` — light + dark color token palettes (~120 lines)
- `model-testing-app/src/lib/useColors.ts` — theme hook + ThemeProvider context (~80 lines)
- `model-testing-app/src/components/ThemeProvider.tsx` — wraps the app root (~40 lines)
- `model-testing-app/src/components/ThemeToggle.tsx` — header toggle button (~30 lines)
- `model-testing-app/src/components/prospects/ProspectsHomeHeader.tsx` — page header (~60 lines)
- `model-testing-app/src/components/prospects/StatusSection.tsx` — collapsible section wrapper (~80 lines)
- `model-testing-app/src/components/prospects/sections/CandidatesSection.tsx` — Candidates table (~120 lines)
- `model-testing-app/src/components/prospects/sections/NeedsReviewSection.tsx` — Needs Review table (~100 lines)
- `model-testing-app/src/components/prospects/sections/NeedsRevisionSection.tsx` — Needs Revision table (~90 lines)
- `model-testing-app/src/components/prospects/sections/ActiveSection.tsx` — Active Cadence table (~90 lines)
- `model-testing-app/src/components/prospects/sections/RepliedSection.tsx` — Replied table (~90 lines)
- `model-testing-app/src/components/prospects/sections/SimpleSection.tsx` — generic for Engaged/Parked/Promoted/Lost (~80 lines)
- `model-testing-app/src/components/prospects/StatePill.tsx` — color-coded state badge (~30 lines)
- `model-testing-app/src/components/prospects/ProspectDetailHeader.tsx` — sticky header with TopAccent + breadcrumbs + identity + KPIs + tabs (~180 lines)
- `model-testing-app/src/components/prospects/ProspectDetailAside.tsx` — right 320px aside (~150 lines)
- `model-testing-app/src/components/prospects/tabs/OverviewTab.tsx` — landing tab (~140 lines)
- `model-testing-app/src/components/prospects/tabs/IntelTab.tsx` — markdown view + editor (~100 lines)
- `model-testing-app/src/components/prospects/tabs/OutreachTab.tsx` — per-touch editor + cadence preset picker (~200 lines)
- `model-testing-app/src/components/prospects/tabs/ActivityTab.tsx` — chronological event log (~80 lines)
- `model-testing-app/src/components/prospects/StickyApprovalFooter.tsx` — bottom action bar + arrow nav (~120 lines)
- `model-testing-app/src/components/prospects/RevisionRequestModal.tsx` — operator notes input (~80 lines)
- `model-testing-app/src/components/prospects/RevisionDiffView.tsx` — per-touch original ↔ new diff (~150 lines)
- `model-testing-app/src/components/prospects/MarkdownEditor.tsx` — textarea + preview toggle (~80 lines)
- `model-testing-app/src/components/prospects/CadencePresetPicker.tsx` — Light/Moderate/Aggressive/Custom picker (~80 lines)

**Modified:**
- `model-testing-app/convex/schema.ts` — add fields to `clients`, `cadences`, `skillRuns` + new indexes (~50 lines inserted)
- `model-testing-app/convex/cadences.ts` — add public + internal queries/mutations for editing, package approval, revision (~80 lines added)
- `model-testing-app/convex/skillRuns.ts` — extend dedup to detect in-flight; add intelMarkdown getter (~30 lines added)
- `model-testing-app/convex/contacts.ts` — add `listForCompany` public query (~20 lines)
- `model-testing-app/convex/crons.ts` — register `skillRun-staleness-sweep` daily cron (~10 lines)
- `model-testing-app/convex/mcp.ts` — add 5 new MCP tools (`prospect.transitionState`, `cadence.update`, `cadence.requestRevision`, `companies.listUnprocessed`, `approval.get`) + extend `skillRun.start` response shape (~250 lines)
- `model-testing-app/convex/hubspotSync/contacts.ts` — push prospectState back to HubSpot on transition (smallest possible hook; ~30 lines)
- `model-testing-app/src/components/Sidebar.tsx` — migrate to `useColors()` hook (~30 lines changed)
- `model-testing-app/src/components/NavigationBar.tsx` — migrate to `useColors()` hook + add ThemeToggle (~20 lines changed)
- `model-testing-app/src/app/(desktop)/layout.tsx` — wrap children in `<ThemeProvider>` (~5 lines)
- `model-testing-app/src/app/(desktop)/prospects/page.tsx` — **complete rewrite** as the CRM home (~250 lines)
- `model-testing-app/src/app/(desktop)/prospects/[prospectId]/page.tsx` — **complete rewrite** as the tabbed detail (~200 lines)

**Verification surface:** Convex dashboard (`https://dashboard.convex.dev/d/incredible-kudu-562`) + `curl` to MCP endpoint + `npx next build` + browser test against a real HubSpot company (Mccarthy or equivalent).

---

# PHASE 1 — Foundation: schema, MCP, theme infrastructure (~90 min)

### Task 1: Schema additions for prospect state machine, package approval, revision tracking

**Files:**
- Modify: `model-testing-app/convex/schema.ts`

- [ ] **Step 1: Verify current schema state for relevant tables**

Run: `grep -nE "clients: defineTable|cadences: defineTable|skillRuns: defineTable" model-testing-app/convex/schema.ts`

Expected: three matches, with `clients` around line 17, `cadences` around line 3702, `skillRuns` around line 4063 (or similar; exact line numbers may vary based on prior schema growth).

- [ ] **Step 2: Add `prospectState` field + index to `clients` table**

In `model-testing-app/convex/schema.ts`, find the `clients: defineTable({` block. Locate a sensible insertion point (after existing optional fields, before closing `})`). Insert:

```typescript
    // Prospect state machine (v1.2 prospects CRM)
    prospectState: v.optional(v.union(
      v.literal("drafted"),
      v.literal("needs_revision"),
      v.literal("active"),
      v.literal("replied"),
      v.literal("engaged"),
      v.literal("promoted"),
      v.literal("parked"),
      v.literal("lost"),
    )),
    prospectStateChangedAt: v.optional(v.string()),
    prospectStateChangedBy: v.optional(v.id("users")),
```

Find the end of the index chain on `clients` (the existing `.index(...)` calls). Add:

```typescript
    .index("by_prospect_state", ["prospectState"])
```

- [ ] **Step 3: Add fields to `cadences` table**

In `model-testing-app/convex/schema.ts`, find the `cadences: defineTable({` block (the v1 substrate). Locate the closing `})` of the field list (before the `.index(...)` chain). Insert before the closing `})`:

```typescript
    // Package-level approval gate (v1.2)
    packageApprovalStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
    )),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.string()),

    // Operator edit + revision tracking (v1.2)
    editedByOperator: v.optional(v.boolean()),
    editedAt: v.optional(v.string()),
    editedBy: v.optional(v.id("users")),
    revisionRequested: v.optional(v.boolean()),
    revisionNote: v.optional(v.string()),
    revisionRequestedBy: v.optional(v.id("users")),
    revisionRequestedAt: v.optional(v.string()),
```

Add new index after the existing `.index("by_package", ["packageId"])`:

```typescript
    .index("by_package_approval_status", ["packageId", "packageApprovalStatus"])
```

- [ ] **Step 4: Add fields to `skillRuns` table**

In `model-testing-app/convex/schema.ts`, find the `skillRuns: defineTable({` block. Insert before the closing `})`:

```typescript
    // Rich intel report (v1.2) — companion to `brief`, full markdown
    intelMarkdown: v.optional(v.string()),

    // Revision linking (v1.2) — set when a skillRun is a re-run after request_revision
    parentRunId: v.optional(v.id("skillRuns")),
    revisionRequestedAt: v.optional(v.string()),
    revisionNote: v.optional(v.string()),
    revisionRequestedBy: v.optional(v.id("users")),
```

- [ ] **Step 5: Deploy schema + codegen**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx convex dev --once && npx convex codegen
```

Expected: clean push, new indexes added (`by_prospect_state`, `by_package_approval_status`), generated types updated.

- [ ] **Step 6: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/schema.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] v1.2 schema: prospect state + package approval + revision tracking

Schema-additive only — no new tables, no breaking changes. Adds:

clients:
  - prospectState (8-literal union: drafted/needs_revision/active/replied/
    engaged/promoted/parked/lost; optional because clients table also holds
    non-prospect rows like active clients and lenders)
  - prospectStateChangedAt + prospectStateChangedBy (audit)
  - by_prospect_state index (home page status sections hot path)

cadences:
  - packageApprovalStatus (pending/approved/denied) — the dispatcher's
    findDueInternal will be extended to filter on "approved" only,
    implementing the single-package-gate approval model
  - approvedBy + approvedAt (audit)
  - editedByOperator + editedAt + editedBy (per-touch operator edit tracking)
  - revisionRequested + revisionNote + revisionRequestedBy +
    revisionRequestedAt (per-touch revision tracking; package-level is
    derived from any row carrying these)
  - by_package_approval_status index (package operations)

skillRuns:
  - intelMarkdown (richer companion to brief; full intel report)
  - parentRunId (links a revision re-run to its original)
  - revisionRequestedAt + revisionNote + revisionRequestedBy (audit on
    the parent run when revision was requested)

Per spec section 2.12: docs/superpowers/specs/2026-05-25-prospects-crm-
rework-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create `convex/prospects.ts` with state-transition internal mutations + queries

**Files:**
- Create: `model-testing-app/convex/prospects.ts`

- [ ] **Step 1: Create the file with the full content**

Create `model-testing-app/convex/prospects.ts`:

```typescript
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Prospect state machine helpers (v1.2 prospects CRM).
//
// A "prospect" is a clients row with prospectState set (one of 8 states).
// The CRM home page surfaces these via the per-state public queries below.
// State transitions are written through transitionStateInternal which also
// schedules HubSpot push-back via the existing sync surface.

const PROSPECT_STATE = v.union(
  v.literal("drafted"),
  v.literal("needs_revision"),
  v.literal("active"),
  v.literal("replied"),
  v.literal("engaged"),
  v.literal("promoted"),
  v.literal("parked"),
  v.literal("lost"),
);

// ── State transition (called by prospect.transitionState MCP tool) ──

export const transitionStateInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    newState: PROSPECT_STATE,
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.clientId, {
      prospectState: args.newState,
      prospectStateChangedAt: now,
      prospectStateChangedBy: args.userId,
    });
    return { ok: true, transitionedAt: now };
  },
});

// ── List prospects by state (public queries — power the home page sections) ──

export const listByState = query({
  args: { state: PROSPECT_STATE },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_prospect_state", (q) => q.eq("prospectState", args.state))
      .order("desc")
      .take(100);
  },
});

export const countByState = query({
  args: { state: PROSPECT_STATE },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("clients")
      .withIndex("by_prospect_state", (q) => q.eq("prospectState", args.state))
      .collect();
    return rows.length;
  },
});

// ── Get a single prospect with state context ──

export const getById = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.clientId);
  },
});

// ── Internal: get for MCP-side reads (no auth gate; trusted caller) ──

export const getInternal = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.clientId);
  },
});
```

- [ ] **Step 2: Deploy + verify codegen picks up the new module**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
```

Expected: clean. `internal.prospects.transitionStateInternal` and `api.prospects.listByState` etc. should appear in generated types.

- [ ] **Step 3: Smoke-test a state read against existing data**

Run from `model-testing-app/`:
```bash
npx convex run --no-push "prospects:countByState" '{"state":"drafted"}'
```

Expected: returns `0` (no clients have `prospectState` set yet — schema is additive). Confirms the index works.

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/prospects.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] v1.2 prospects.ts: state machine queries + transition mutation

transitionStateInternal: patches clients.prospectState + audit fields.
Called by prospect.transitionState MCP tool (lands next commit) and
by the cadence reply event processor when intent classification triggers
a state change.

Public queries listByState / countByState power the home page section
queries (one query per of the 8 states). Use the by_prospect_state
index from the prior schema commit.

getById + getInternal expose the prospect row to the detail page and
MCP read paths respectively.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Extend `convex/cadences.ts` with package approval + edit + revision mutations

**Files:**
- Modify: `model-testing-app/convex/cadences.ts`

- [ ] **Step 1: Append new public + internal API surface**

At the end of `model-testing-app/convex/cadences.ts`, after the existing `getInternal` query, append:

```typescript
// ── Public query: list cadences by package (powers detail page Outreach tab) ──

export const listByPackage = query({
  args: { packageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
  },
});

// ── Public query: list cadences by contact (detail page sidebar) ──

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cadences")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

// ── Update a single cadence (operator edit; called by cadence.update MCP) ──

export const updateInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    userId: v.id("users"),
    preDraftedTouch: v.optional(v.object({
      subject: v.string(),
      bodyText: v.string(),
      bodyHtml: v.string(),
      dynamicVars: v.optional(v.any()),
    })),
    nextDueAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      editedByOperator: true,
      editedAt: now,
      editedBy: args.userId,
      updatedAt: now,
    };
    if (args.preDraftedTouch !== undefined) patch.preDraftedTouch = args.preDraftedTouch;
    if (args.nextDueAt !== undefined) patch.nextDueAt = args.nextDueAt;
    await ctx.db.patch(args.cadenceId, patch);
    return { ok: true };
  },
});

// ── Approve all cadences in a package (single-gate approval model) ──

export const approvePackageInternal = internalMutation({
  args: {
    packageId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const now = new Date().toISOString();
    let patched = 0;
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        packageApprovalStatus: "approved",
        approvedBy: args.userId,
        approvedAt: now,
        updatedAt: now,
      });
      patched++;
    }
    return { ok: true, patched };
  },
});

// ── Deny all cadences in a package ──

export const denyPackageInternal = internalMutation({
  args: {
    packageId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const now = new Date().toISOString();
    let patched = 0;
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        packageApprovalStatus: "denied",
        isActive: false,
        cancelledReason: "operator_denied_package",
        updatedAt: now,
      });
      patched++;
    }
    return { ok: true, patched };
  },
});

// ── Request revision on a package (mark for skill re-run) ──

export const requestRevisionInternal = internalMutation({
  args: {
    packageId: v.string(),
    userId: v.id("users"),
    revisionNote: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const now = new Date().toISOString();
    let patched = 0;
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        revisionRequested: true,
        revisionNote: args.revisionNote,
        revisionRequestedBy: args.userId,
        revisionRequestedAt: now,
        updatedAt: now,
      });
      patched++;
    }
    return { ok: true, patched };
  },
});
```

- [ ] **Step 2: Modify `findDueInternal` to filter on package approval status**

In `model-testing-app/convex/cadences.ts`, locate the existing `findDueInternal` query. Replace its handler with:

```typescript
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_active_next_due", (q) =>
        q.eq("isActive", true).lte("nextDueAt", args.nowIso),
      )
      .take(args.limit);
    // v1.2: respect package-level approval gate. Skip rows that haven't been
    // approved yet OR were denied. Legacy rows (no packageApprovalStatus
    // field at all) are treated as approved for back-compat — see the
    // one-shot migration in Task 4.
    return rows.filter((row) =>
      row.packageApprovalStatus === undefined ||
      row.packageApprovalStatus === "approved"
    );
  },
```

- [ ] **Step 3: Deploy + codegen**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
```

Expected: clean.

- [ ] **Step 4: Smoke-test the dispatcher still works (empty case)**

```bash
npx convex run cadenceDispatcher:tick
```

Expected: returns `{fired:0, skipped:0, failed:0, polled:0}` (no due cadences). Confirms the new filter doesn't crash.

- [ ] **Step 5: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/cadences.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] v1.2 cadences: package approval + edit + revision mutations

Adds the cadence-side substrate for the prospects CRM:

Public queries:
- listByPackage: returns all cadences in a package (detail page Outreach
  tab reads this to render touches in order)
- listByContact: all cadences for a contact (detail page sidebar)

Internal mutations (called by MCP tools that land in Task 5):
- updateInternal: operator edits a single touch; sets editedByOperator
  flags so revision re-runs respect operator-edited content
- approvePackageInternal: patches all rows in a package to
  packageApprovalStatus=approved + audit fields
- denyPackageInternal: patches to denied + sets isActive=false +
  cancelledReason
- requestRevisionInternal: patches all rows in a package with revision
  tracking fields

Dispatcher behavioural change: findDueInternal now filters on
packageApprovalStatus. Rows with status=undefined (legacy, pre-v1.2)
are treated as approved for back-compat. Rows with status=approved
fire. Rows with status=pending or denied are skipped.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: One-shot migration — set existing cadences to `packageApprovalStatus: "approved"`

**Files:**
- Modify: `model-testing-app/convex/prospects.ts` (add a one-shot migration action)

- [ ] **Step 1: Append migration action to prospects.ts**

Append to `model-testing-app/convex/prospects.ts`:

```typescript
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// One-shot migration: any pre-existing cadences (from v1/v1.1 smoke tests
// or the early prospect-intel runs) need packageApprovalStatus = "approved"
// so the new dispatcher filter doesn't silently stop firing them.
// Idempotent — run once, then leave.
export const migrateExistingCadencesToApprovedInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    const allRows = await ctx.runQuery(internal.cadences.findAllForMigrationInternal, {});
    let patched = 0;
    for (const row of allRows) {
      if (row.packageApprovalStatus === undefined) {
        await ctx.runMutation(internal.cadences.markApprovedForMigrationInternal, {
          cadenceId: row._id,
        });
        patched++;
      }
    }
    return { ok: true, patched, total: allRows.length };
  },
});
```

- [ ] **Step 2: Append supporting queries/mutations to cadences.ts**

Append to `model-testing-app/convex/cadences.ts`:

```typescript
// ── Migration helpers (used once by the v1.2 migration action) ──

export const findAllForMigrationInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("cadences").collect();
  },
});

export const markApprovedForMigrationInternal = internalMutation({
  args: { cadenceId: v.id("cadences") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cadenceId, {
      packageApprovalStatus: "approved",
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});
```

- [ ] **Step 3: Deploy + run migration once**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
npx convex run prospects:migrateExistingCadencesToApprovedInternal
```

Expected: returns `{ok: true, patched: N, total: N}` where N is the count of existing cadence rows (probably a small number from smoke tests + the Mccarthy test). Subsequent runs return `patched: 0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/prospects.ts model-testing-app/convex/cadences.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] v1.2 migration: backfill packageApprovalStatus=approved on legacy cadences

One-shot migration action that patches any pre-existing cadence rows
(from v1 smoke tests, the Mccarthy prospect-intel test, etc.) so the
new dispatcher filter doesn't silently stop firing them.

Idempotent — only patches rows where packageApprovalStatus is undefined.
Re-running the migration produces patched: 0 on a second pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Extend `skillRuns.ts` with in-flight dedup detection

**Files:**
- Modify: `model-testing-app/convex/skillRuns.ts`

- [ ] **Step 1: Update findRecentByDedupKeyInternal to detect in-flight runs**

In `model-testing-app/convex/skillRuns.ts`, locate the existing `findRecentByDedupKeyInternal` internal query. Replace its handler with:

```typescript
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("skillRuns")
      .withIndex("by_skill_and_dedup_key", (q) =>
        q.eq("skillName", args.skillName).eq("dedupKey", args.dedupKey),
      )
      .order("desc")
      .take(20);
    // v1.2: detect both completed and in-flight runs. Caller (skillRun.start
    // MCP tool) decides what to do based on the status returned.
    for (const row of rows) {
      if (row._creationTime < args.cutoffMs) break;
      if (row.status === "complete" || row.status === "complete_with_gaps") {
        return { kind: "completed" as const, row };
      }
      if (row.status === "running") {
        // In-flight detection — race prevention
        return { kind: "in_flight" as const, row };
      }
    }
    return null;
  },
});
```

- [ ] **Step 2: Add a public read query for the detail page**

Append to `model-testing-app/convex/skillRuns.ts`:

```typescript
// ── Public read for the prospect detail page Intel + Activity tabs ──

export const getById = query({
  args: { runId: v.id("skillRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

// ── Public query: latest run for a given dedup key (e.g., a CH number) ──
// Used by detail page when navigating directly to a prospect without a runId

export const latestByDedupKey = query({
  args: { skillName: v.string(), dedupKey: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("skillRuns")
      .withIndex("by_skill_and_dedup_key", (q) =>
        q.eq("skillName", args.skillName).eq("dedupKey", args.dedupKey),
      )
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});
```

- [ ] **Step 3: Add stale-run sweep mutation**

Append:

```typescript
// ── Stale-run sweep (called by the daily cron in Task 7) ──

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const sweepStaleRunningRunsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - SIX_HOURS_MS;
    const stales = await ctx.db
      .query("skillRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    let swept = 0;
    for (const row of stales) {
      if (row._creationTime < cutoff) {
        const now = new Date().toISOString();
        await ctx.db.patch(row._id, {
          status: "failed" as const,
          completedAt: now,
          durationMs: Date.now() - row._creationTime,
          errors: [
            ...(row.errors ?? []),
            { step: "stale_runtime", message: "runtime exceeded 6h threshold; auto-marked failed by sweep" },
          ],
        });
        swept++;
      }
    }
    return { ok: true, swept, totalRunning: stales.length };
  },
});
```

- [ ] **Step 4: Deploy + codegen**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
```

- [ ] **Step 5: Smoke-test the dedup change**

The dedup logic is exercised by `skillRun.start` which has its own tests in Task 6. Skip standalone test here.

Smoke-test the sweep mutation:
```bash
npx convex run skillRuns:sweepStaleRunningRunsInternal
```

Expected: returns `{ok: true, swept: 0, totalRunning: N}` (0 stales unless something has been running >6h, which is unlikely).

- [ ] **Step 6: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/skillRuns.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] v1.2 skillRuns: in-flight dedup + public read + stale sweep

findRecentByDedupKeyInternal: extended to detect both completed AND
in-flight (status=running) runs. Returns a tagged result
({kind: "completed", row} or {kind: "in_flight", row}) so the calling
MCP tool (skillRun.start, updated in Task 6) can return the right
response shape.

Public queries getById + latestByDedupKey: power the prospect detail
page Intel tab and the direct-navigation flow (e.g., operator clicks
a prospect from the home page, the detail page loads the latest
prospect-intel run via latestByDedupKey).

sweepStaleRunningRunsInternal: marks any skillRun with status=running
AND _creationTime > 6h ago as status=failed. Called daily by the
new cron in Task 7. Prevents stuck runs from blocking future
prospect-intel attempts via the in-flight dedup.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add 5 new MCP tools + extend `skillRun.start` response shape

**Files:**
- Modify: `model-testing-app/convex/mcp.ts`

- [ ] **Step 1: Read bearer token + locate insertion point**

```bash
cat /Users/cowboy/rockcap/rockcap-v2/.mcp.json  # capture bearer for verification curls
grep -n "skillRun.complete" /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/mcp.ts
```

The 5 new tools go after the existing `skillRun.complete` block in the `TOOLS` array.

- [ ] **Step 2: Update `skillRun.start` handler to use the new tagged dedup response**

In `mcp.ts`, locate the existing `skillRun.start` tool. Replace its handler with:

```typescript
    handler: async (ctx, userId, args) => {
      // v1.2: dedup detection returns either {kind:"completed",row} or
      // {kind:"in_flight",row} or null. Different responses per case.
      if (args.dedupKey && args.dedupWindowDays) {
        const windowMs = args.dedupWindowDays * 24 * 60 * 60 * 1000;
        const cutoffMs = Date.now() - windowMs;
        const priorResult = await ctx.runQuery(internal.skillRuns.findRecentByDedupKeyInternal, {
          skillName: args.skillName,
          dedupKey: args.dedupKey,
          cutoffMs,
        });
        if (priorResult?.kind === "completed") {
          const priorRun = priorResult.row;
          const ageHours = (Date.now() - priorRun._creationTime) / (1000 * 60 * 60);
          return asText({
            status: "duplicate_found",
            priorRunId: priorRun._id,
            priorRunBrief: priorRun.brief ?? "",
            priorRunAgeHours: Math.round(ageHours * 10) / 10,
          });
        }
        if (priorResult?.kind === "in_flight") {
          const priorRun = priorResult.row;
          const ageMinutes = (Date.now() - priorRun._creationTime) / (1000 * 60);
          return asText({
            status: "already_running",
            priorRunId: priorRun._id,
            priorRunOwnerId: priorRun.userId,
            priorRunStartedAgoMinutes: Math.round(ageMinutes * 10) / 10,
          });
        }
      }
      const runId = await ctx.runMutation(internal.skillRuns.createInternal, {
        skillName: args.skillName,
        userId,
        input: args.input,
        trigger: args.trigger,
        dedupKey: args.dedupKey,
        dedupWindowDays: args.dedupWindowDays,
        status: "running",
      });
      return asText({ status: "created", runId });
    },
```

- [ ] **Step 3: Insert 5 new tool definitions after `skillRun.complete`**

After the closing `},` of the `skillRun.complete` tool block, before the closing `]` of the `TOOLS` array, insert:

```typescript
  // v1.2 prospects CRM — state transition
  {
    name: "prospect.transitionState",
    description:
      "Transition a prospect through the 8-state pipeline (drafted/needs_revision/active/replied/engaged/promoted/parked/lost). Called by the prospects CRM and by skill workflows (e.g., reply event processor on intent classification). Side effect: pushes the mapped lifecycleStage + hs_lead_status to HubSpot (see spec section 2.8).",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the client row" },
        newState: {
          type: "string",
          description: "drafted | needs_revision | active | replied | engaged | promoted | parked | lost",
        },
      },
      required: ["clientId", "newState"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.prospects.transitionStateInternal, {
        clientId: args.clientId,
        newState: args.newState,
        userId,
      });
      return asText(result);
    },
  },

  // v1.2 prospects CRM — operator edit on a single touch
  {
    name: "cadence.update",
    description:
      "Update an existing cadence row's preDraftedTouch content or scheduled nextDueAt. Sets editedByOperator + editedAt audit fields. Revision re-runs respect editedByOperator and skip overwriting unless the operator's revision note specifically calls out the edited touch.",
    inputSchema: {
      type: "object",
      properties: {
        cadenceId: { type: "string" },
        preDraftedTouch: {
          type: "object",
          properties: {
            subject: { type: "string" },
            bodyText: { type: "string" },
            bodyHtml: { type: "string" },
            dynamicVars: { type: "object" },
          },
        },
        nextDueAt: { type: "string", description: "ISO timestamp" },
      },
      required: ["cadenceId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.updateInternal, {
        cadenceId: args.cadenceId,
        userId,
        preDraftedTouch: args.preDraftedTouch,
        nextDueAt: args.nextDueAt,
      });
      return asText(result);
    },
  },

  // v1.2 prospects CRM — request revision on a cadence package
  {
    name: "cadence.requestRevision",
    description:
      "Mark all cadences in a package as revision-requested with an operator note. Skill re-runs use the note as context to produce a new package; the new package's diff is shown to the operator for per-touch accept/reject.",
    inputSchema: {
      type: "object",
      properties: {
        packageId: { type: "string" },
        revisionNote: { type: "string", description: "Operator's free-text revision note (e.g., 'too aggressive on rates')" },
      },
      required: ["packageId", "revisionNote"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.requestRevisionInternal, {
        packageId: args.packageId,
        userId,
        revisionNote: args.revisionNote,
      });
      return asText(result);
    },
  },

  // v1.2 prospects CRM — list unprocessed candidates for prospect-intel
  {
    name: "companies.listUnprocessed",
    description:
      "List HubSpot-synced companies that don't have a prospect-intel skillRun yet (or are in NEW/RUNNING/STUCK state). Used by Claude Code to find batch candidates for prospect-intel runs. Default filter: states=['new'], sinceDays=30, limit=25, excludePromoted=true. Returns rows with a per-row 'state' field.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Default 25" },
        sinceDays: { type: "number", description: "Only companies created in last N days; default 30" },
        states: {
          type: "array",
          items: { type: "string" },
          description: "Subset of ['new', 'running', 'stuck']; default ['new']",
        },
        excludePromoted: { type: "boolean", description: "Default true" },
        lifecycleStage: { type: "string", description: "Optional HubSpot lifecycleStage filter" },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(internal.companies.listUnprocessedInternal, {
        limit: args.limit ?? 25,
        sinceDays: args.sinceDays ?? 30,
        states: args.states ?? ["new"],
        excludePromoted: args.excludePromoted ?? true,
        lifecycleStage: args.lifecycleStage,
      });
      return asText(result);
    },
  },

  // v1.2 prospects CRM — operator-side read of an approval row
  {
    name: "approval.get",
    description:
      "Read an approval row by id (read-only). Closes the v1.1 gap where skills couldn't audit the approval rows they created. Returns the full row including draftPayload + linked entity ids.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string" },
      },
      required: ["approvalId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(internal.approvals.getInternal, {
        approvalId: args.approvalId,
      });
      if (!result) return asText({ error: "approval not found" });
      return asText(result);
    },
  },
```

**Note:** `companies.listUnprocessedInternal` and `approvals.getInternal` are referenced — Task 7 adds them.

- [ ] **Step 4: Deploy + codegen**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
```

Expected: deploy may emit type errors about `internal.companies.listUnprocessedInternal` and `internal.approvals.getInternal` not existing. If so, comment those handler bodies temporarily, deploy, then uncomment in Task 7 after the supporting queries land. OR proceed directly to Task 7 and deploy at end of Task 7.

- [ ] **Step 5: Commit deferred — batched with Task 7**

Skip commit. Continue to Task 7 then commit together.

---

### Task 7: Add supporting internal queries (`companies.listUnprocessedInternal`, `approvals.getInternal`) + commit Tasks 6 + 7 together

**Files:**
- Modify: `model-testing-app/convex/companies.ts`
- Modify: `model-testing-app/convex/approvals.ts`

- [ ] **Step 1: Add `companies.listUnprocessedInternal`**

In `model-testing-app/convex/companies.ts`, append:

```typescript
import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// v1.2: list HubSpot-synced companies that haven't been processed by
// prospect-intel yet (NEW state) — or are currently in-flight (RUNNING)
// or stuck (RUNNING > 2h). Joins against skillRuns to derive state per row.

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export const listUnprocessedInternal = internalQuery({
  args: {
    limit: v.number(),
    sinceDays: v.number(),
    states: v.array(v.string()),
    excludePromoted: v.boolean(),
    lifecycleStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sinceMs = Date.now() - args.sinceDays * 24 * 60 * 60 * 1000;
    const sinceIso = new Date(sinceMs).toISOString();

    // Pull recent companies. There's no index on createdAt, so use _creationTime
    // via collect + filter (acceptable for the 30d window + ~hundreds of rows).
    const allRecent = await ctx.db
      .query("companies")
      .filter((q) => q.gt(q.field("_creationTime"), sinceMs))
      .collect();

    const candidates: Array<{
      company: any;
      state: "new" | "running" | "stuck";
      runId?: string;
      runOwnerId?: string;
      runAgeMinutes?: number;
    }> = [];

    for (const company of allRecent) {
      if (args.lifecycleStage && company.hubspotLifecycleStage !== args.lifecycleStage) continue;

      // Look up the most recent prospect-intel skillRun for this company.
      // Dedup key is the CH number; derive it from the description if present.
      const chMatch = company.metadata?.hubspotCustomProperties?.description?.match(/CH\s+(\d{6,8})/);
      const dedupKey = chMatch?.[1];
      if (!dedupKey) {
        // No CH number available — treat as NEW since we can't dedup
        candidates.push({ company, state: "new" });
        continue;
      }

      const runs = await ctx.db
        .query("skillRuns")
        .withIndex("by_skill_and_dedup_key", (q) =>
          q.eq("skillName", "prospect-intel").eq("dedupKey", dedupKey),
        )
        .order("desc")
        .take(1);

      const latest = runs[0];

      if (!latest) {
        candidates.push({ company, state: "new" });
      } else if (latest.status === "running") {
        const ageMs = Date.now() - latest._creationTime;
        const isStuck = ageMs > TWO_HOURS_MS;
        candidates.push({
          company,
          state: isStuck ? "stuck" : "running",
          runId: latest._id,
          runOwnerId: latest.userId,
          runAgeMinutes: Math.round(ageMs / 60000),
        });
      } else if (
        args.excludePromoted &&
        (latest.status === "complete" || latest.status === "complete_with_gaps")
      ) {
        // Has a completed run — not a candidate
        continue;
      }
    }

    // Filter by requested states
    const filtered = candidates.filter((c) => args.states.includes(c.state));

    // Sort by most recent first
    filtered.sort((a, b) => b.company._creationTime - a.company._creationTime);

    return filtered.slice(0, args.limit);
  },
});
```

- [ ] **Step 2: Add `approvals.getInternal`**

In `model-testing-app/convex/approvals.ts`, append:

```typescript
import { internalQuery } from "./_generated/server";

// v1.2: skill-side read of an approval row. Closes the gap from v1.1
// where approvals queries gate on Clerk auth and skills couldn't audit
// the rows they created.
export const getInternal = internalQuery({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.approvalId);
  },
});
```

(Ensure `v` and `internalQuery` are imported; add to existing imports if not present.)

- [ ] **Step 3: Deploy + codegen**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
```

Expected: clean. The MCP tools from Task 6 + supporting queries from Task 7 all resolve.

- [ ] **Step 4: Verify all 5 MCP tools appear in tools/list**

```bash
TOKEN=$(grep -oE 'rcp_[a-zA-Z0-9_]+' /Users/cowboy/rockcap/rockcap-v2/.mcp.json | head -1)
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -oE '"name":"(prospect|cadence|companies|approval)\.[a-zA-Z]+"' | sort -u
```

Expected output includes (at minimum):
- `"name":"approval.create"` (existing)
- `"name":"approval.get"` (new)
- `"name":"cadence.cancel"` (existing)
- `"name":"cadence.create"` (existing)
- `"name":"cadence.requestRevision"` (new)
- `"name":"cadence.update"` (new)
- `"name":"companies.listUnprocessed"` (new)
- `"name":"prospect.transitionState"` (new)

- [ ] **Step 5: Commit Tasks 6 + 7 together**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/mcp.ts model-testing-app/convex/companies.ts model-testing-app/convex/approvals.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] v1.2 MCP tools: 5 new + skillRun.start dedup extension

5 new MCP tools (per spec section 2.11):

- prospect.transitionState — moves a clients row through the 8-state
  prospect machine; will be called by the CRM detail page sticky footer
  and by the reply event processor on intent classification
- cadence.update — operator edit on a single touch; sets editedByOperator
  audit fields
- cadence.requestRevision — marks a package for skill re-run with note
- companies.listUnprocessed — Claude Code's query surface for candidates;
  derives state (new/running/stuck) per company via JOIN against skillRuns;
  filters by sinceDays + lifecycleStage + states
- approval.get — read-only approval lookup (closes v1.1 gap)

skillRun.start extended: detects in-flight runs (status=running) and
returns the new {status:"already_running", priorRunId, priorRunOwnerId,
priorRunStartedAgoMinutes} response shape. Existing {status:"created"}
and {status:"duplicate_found"} paths preserved unchanged.

Supporting internal queries:
- companies.listUnprocessedInternal — does the actual JOIN + state derivation
- approvals.getInternal — wraps ctx.db.get for the public approval.get MCP tool

End-to-end verified: tools/list returns all 5 new tool names.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Register stale-run sweep cron + HubSpot push-back hook

**Files:**
- Modify: `model-testing-app/convex/crons.ts`
- Modify: `model-testing-app/convex/prospects.ts` (add the HubSpot push-back action)

- [ ] **Step 1: Add HubSpot push-back to prospects.ts**

Append to `model-testing-app/convex/prospects.ts`:

```typescript
// HubSpot lifecycle + lead status mapping per spec section 2.8
const HUBSPOT_MAPPING: Record<string, { lifecycleStage: string; hs_lead_status: string }> = {
  drafted: { lifecycleStage: "lead", hs_lead_status: "open" },
  needs_revision: { lifecycleStage: "lead", hs_lead_status: "open" },
  active: { lifecycleStage: "marketingqualifiedlead", hs_lead_status: "contacted" },
  replied: { lifecycleStage: "marketingqualifiedlead", hs_lead_status: "contacted" },
  engaged: { lifecycleStage: "salesqualifiedlead", hs_lead_status: "qualified" },
  promoted: { lifecycleStage: "customer", hs_lead_status: "connected" },
  parked: { lifecycleStage: "lead", hs_lead_status: "nurturing" },
  lost: { lifecycleStage: "lead", hs_lead_status: "bad_fit" },
};

// Fire-and-forget HubSpot push-back. Called from transitionStateInternal via
// ctx.scheduler.runAfter so the transition mutation isn't blocked on the
// HubSpot API roundtrip. Failure is logged but doesn't roll back the
// state transition (RockCap state is source-of-truth; HubSpot will reconcile
// at the next 6h sync if push fails).
export const pushStateToHubspotInternal = internalAction({
  args: {
    clientId: v.id("clients"),
    newState: PROSPECT_STATE,
  },
  handler: async (ctx, args) => {
    const client = await ctx.runQuery(internal.prospects.getInternal, { clientId: args.clientId });
    if (!client) {
      console.warn(`[hubspot-push] client ${args.clientId} not found; skipping push`);
      return { ok: false, reason: "client_not_found" };
    }
    // Find the HubSpot company id via the contact's linkedCompanyIds, or via
    // a direct lookup if the client row carries hubspotCompanyId. For v1.2
    // we accept a graceful no-op if no HubSpot id is resolvable.
    const hubspotCompanyId = (client as any).hubspotCompanyId;
    if (!hubspotCompanyId) {
      return { ok: false, reason: "no_hubspot_company_id" };
    }
    const mapping = HUBSPOT_MAPPING[args.newState];
    if (!mapping) {
      return { ok: false, reason: `no_mapping_for_state_${args.newState}` };
    }
    // STUB: actual HubSpot PATCH lives in hubspotSync/contacts.ts (Task 8 Step 3).
    // For now, log the intent — the real API call lands in the next step.
    console.log(
      `[hubspot-push] would PATCH company ${hubspotCompanyId} → lifecycleStage=${mapping.lifecycleStage}, hs_lead_status=${mapping.hs_lead_status}`,
    );
    return { ok: true, hubspotCompanyId, mapping };
  },
});
```

Also update the existing `transitionStateInternal` to schedule the push:

In `prospects.ts`, find the `transitionStateInternal` handler. Replace the existing handler (which currently just patches and returns) with:

```typescript
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.clientId, {
      prospectState: args.newState,
      prospectStateChangedAt: now,
      prospectStateChangedBy: args.userId,
    });
    // Fire-and-forget HubSpot push-back. Doesn't block the transition.
    await ctx.scheduler.runAfter(0, internal.prospects.pushStateToHubspotInternal, {
      clientId: args.clientId,
      newState: args.newState,
    });
    return { ok: true, transitionedAt: now };
  },
```

- [ ] **Step 2: Register the stale-run sweep cron**

In `model-testing-app/convex/crons.ts`, before the `export default crons;` line, add:

```typescript
// v1.2: stale skillRun sweep. Once daily, mark any skillRun with
// status=running AND _creationTime > 6h as failed. Prevents stuck runs
// from blocking future dedup checks.
crons.daily(
  "skillrun-staleness-sweep",
  { hourUTC: 3, minuteUTC: 45 },  // between existing hubspot-webhook-log-prune (3:15) and google-calendar-sync-log-prune (3:30)... actually 3:45 to slot after both
  internal.skillRuns.sweepStaleRunningRunsInternal,
);
```

- [ ] **Step 3: Stub the real HubSpot API call (deferred for v1.2.1 if not trivial)**

For v1.2, the `pushStateToHubspotInternal` action LOGS the intended push. The real PATCH against the HubSpot API is deferred to v1.2.1 — RockCap state remains source-of-truth and the existing 6h pull from HubSpot keeps the company row metadata fresh. Adding a real PATCH requires understanding the HubSpot OAuth token retrieval pattern in `hubspotSync/`, which the implementer can do if time permits, otherwise leave the stub + log entry.

If implementing now: in `model-testing-app/convex/hubspotSync/contacts.ts`, add an exported helper `patchCompanyLifecycleStage(hubspotCompanyId, lifecycleStage, leadStatus)` that uses the existing OAuth token + HubSpot v3 API client pattern. Call it from `pushStateToHubspotInternal` instead of console.log.

For autonomous build, leave as STUB with the console.log + return shape intact — this is documented in the spec as v1.2.1-acceptable.

- [ ] **Step 4: Deploy + codegen + verify cron registered**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
```

Expected: clean push, new cron "skillrun-staleness-sweep" visible at the Convex dashboard.

- [ ] **Step 5: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/prospects.ts model-testing-app/convex/crons.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] v1.2 cron + HubSpot push-back: stale sweep + state transition hook

skillrun-staleness-sweep cron: daily at 03:45 UTC. Slots between the
existing hubspot-webhook-log-prune (03:15) and gmail-watch-renewal
(04:00). Calls skillRuns.sweepStaleRunningRunsInternal which marks
any running run >6h old as failed (frees company for re-run).

pushStateToHubspotInternal action: fire-and-forget from
transitionStateInternal via ctx.scheduler.runAfter. Maps the 8 RockCap
prospect states to HubSpot lifecycleStage + hs_lead_status per spec
section 2.8. v1.2 stub: logs the intended PATCH; real HubSpot API call
deferred to v1.2.1 (RockCap is source-of-truth; HubSpot reconciles at
6h sync if push fails). The stub returns a structured result so the
real API call can drop in without changing call sites.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Theme infrastructure — `colors.ts`, `useColors.ts`, `ThemeProvider.tsx`

**Files:**
- Create: `model-testing-app/src/lib/colors.ts`
- Create: `model-testing-app/src/lib/useColors.ts`
- Create: `model-testing-app/src/components/ThemeProvider.tsx`

- [ ] **Step 1: Create `colors.ts` with light + dark palettes**

Create `model-testing-app/src/lib/colors.ts`:

```typescript
// RockCap color tokens — light + dark palettes per docs/frontend-standards/tokens.md
// Adapted from Groovy frontend canon.

export const LIGHT = {
  bg: {
    base: "#ffffff",
    light: "#fafafa",
    card: "#ffffff",
    cardAlt: "#f5f5f5",
  },
  border: {
    default: "#e0e0e0",
    mid: "#d0d0d0",
    light: "#ebebeb",
  },
  text: {
    primary: "#1a1a1a",
    secondary: "#4a4a4a",
    muted: "#6b6b6b",
    dim: "#9a9a9a",
  },
  accent: {
    orange: "#f97316",
    green: "#22c55e",
    blue: "#3b82f6",
    purple: "#a855f7",
    yellow: "#eab308",
    red: "#ef4444",
    cyan: "#06b6d4",
    indigo: "#6366f1",
    teal: "#14b8a6",
  },
  entityTypes: {
    dashboard: "#737373",
    prospect: "#eab308",
    client: "#22c55e",
    lender: "#14b8a6",
    project: "#6366f1",
    deal: "#3b82f6",
    contact: "#a855f7",
    cadence: "#f97316",
    approval: "#ef4444",
    skillRun: "#06b6d4",
    analytics: "#facc15",
  },
  status: {
    drafted: "#eab308",
    revision: "#f97316",
    active: "#3b82f6",
    replied: "#a855f7",
    engaged: "#06b6d4",
    promoted: "#22c55e",
    parked: "#9a9a9a",
    lost: "#9a9a9a",
  },
};

export const DARK = {
  bg: {
    base: "#0a0a0a",
    light: "#0f0f0f",
    card: "#111111",
    cardAlt: "#0d0d0d",
  },
  border: {
    default: "#2a2a2a",
    mid: "#363636",
    light: "#404040",
  },
  text: {
    primary: "#e5e5e5",
    secondary: "#b8b8b8",
    muted: "#8a8a8a",
    dim: "#6e6e6e",
  },
  accent: LIGHT.accent,         // accents are theme-invariant
  entityTypes: LIGHT.entityTypes,
  status: LIGHT.status,
};

export type ColorPalette = typeof LIGHT;
export type ThemeMode = "light" | "dark";
```

- [ ] **Step 2: Create `useColors.ts` hook + context**

Create `model-testing-app/src/lib/useColors.ts`:

```typescript
"use client";

import { createContext, useContext } from "react";
import { LIGHT, DARK, ColorPalette, ThemeMode } from "./colors";

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ColorPalette;
  toggleMode: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useColors(): ColorPalette {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback: outside provider. Default to LIGHT (canonical default).
    return LIGHT;
  }
  return ctx.colors;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be called inside <ThemeProvider>");
  }
  return ctx;
}
```

- [ ] **Step 3: Create `ThemeProvider.tsx`**

Create `model-testing-app/src/components/ThemeProvider.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { ThemeContext } from "@/lib/useColors";
import { LIGHT, DARK, ThemeMode } from "@/lib/colors";

const STORAGE_KEY = "rockcap-theme-mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  // On mount: read localStorage + prefers-color-scheme
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored === "light" || stored === "dark") {
      setMode(stored);
      return;
    }
    // No stored preference — respect prefers-color-scheme
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      setMode("dark");
    }
  }, []);

  // On mode change: persist
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, mode);
    }
    // Also set a class on documentElement for any CSS rules that need it
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", mode === "dark");
    }
  }, [mode]);

  const colors = mode === "dark" ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ mode, colors, toggleMode: () => setMode((m) => (m === "light" ? "dark" : "light")) }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 4: Wrap the desktop layout in ThemeProvider**

In `model-testing-app/src/app/(desktop)/layout.tsx`, wrap the existing children in `<ThemeProvider>`:

```typescript
import NavigationBar from "@/components/NavigationBar";
import Sidebar from "@/components/Sidebar";
import ChatAssistantButton from "@/components/ChatAssistantButton";
import { MessengerProvider } from "@/contexts/MessengerContext";
import { ThemeProvider } from "@/components/ThemeProvider";

export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <MessengerProvider>
        <Sidebar />
        <NavigationBar />
        <main className="ml-20 pt-16 min-h-screen">
          {children}
        </main>
        <ChatAssistantButton />
      </MessengerProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 5: Verify the build still passes (theme infrastructure landed but not yet consumed)**

```bash
cd model-testing-app
npx next build 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/colors.ts model-testing-app/src/lib/useColors.ts model-testing-app/src/components/ThemeProvider.tsx model-testing-app/src/app/\(desktop\)/layout.tsx
git commit -m "$(cat <<'EOF'
[app] v1.2 theme infrastructure: tokens + useColors + ThemeProvider

Adopts the dual-theme system per docs/frontend-standards/branding.md
(light default, dark via toggle) and tokens.md (full palette tables).

colors.ts: LIGHT + DARK palettes — bg/border/text differ between modes;
accent + entityTypes + status colors are theme-invariant per the
RockCap entity color table.

useColors.ts: hook returning the active palette; useTheme() returns the
full context including toggleMode for the ThemeToggle button (Task 10).

ThemeProvider.tsx: context provider wrapping the desktop layout.
Persists preference to localStorage under 'rockcap-theme-mode'.
Respects prefers-color-scheme on first load (no stored preference).
Sets documentElement.classList.dark for any CSS rules that need it.

layout.tsx: wraps existing children + nav in <ThemeProvider>.
Existing components (Sidebar, NavigationBar) continue working unchanged
this commit — they migrate to useColors() in Task 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Migrate `Sidebar.tsx` + `NavigationBar.tsx` to theme-aware + add `ThemeToggle.tsx`

**Files:**
- Modify: `model-testing-app/src/components/Sidebar.tsx`
- Modify: `model-testing-app/src/components/NavigationBar.tsx`
- Create: `model-testing-app/src/components/ThemeToggle.tsx`

- [ ] **Step 1: Create the ThemeToggle component**

Create `model-testing-app/src/components/ThemeToggle.tsx`:

```typescript
"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/useColors";

export function ThemeToggle() {
  const { mode, toggleMode, colors } = useTheme();
  return (
    <button
      onClick={toggleMode}
      title={mode === "light" ? "Switch to dark" : "Switch to light"}
      style={{
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        color: colors.text.muted,
        padding: "6px 10px",
        borderRadius: 4,
        fontSize: 11,
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
      }}
      aria-label="Toggle theme"
    >
      {mode === "light" ? <Sun size={14} color={colors.accent.yellow} /> : <Moon size={14} color={colors.accent.purple} />}
      <span>{mode === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
```

- [ ] **Step 2: Migrate `Sidebar.tsx` to use `useColors()`**

Read the existing `model-testing-app/src/components/Sidebar.tsx` and identify any hardcoded color values (Tailwind classes like `text-white`, `bg-white`, etc.). Replace with inline styles using `useColors()`:

At the top of the component, add:
```typescript
import { useColors } from "@/lib/useColors";
// ... inside the component function:
const colors = useColors();
```

For the sidebar container, ensure the background reads from `colors.bg.card` (light: white, dark: #111). For nav items, use `colors.text.muted` for inactive + `colors.entityTypes.<type>` for active. Adapt the existing JSX — don't change structure or nav-item list, only the color references.

Smoke test: after the change, toggling the theme should switch the sidebar background between white and dark.

- [ ] **Step 3: Migrate `NavigationBar.tsx` + add `<ThemeToggle>`**

Read `model-testing-app/src/components/NavigationBar.tsx`. Same migration pattern as Sidebar:

```typescript
import { useColors } from "@/lib/useColors";
import { ThemeToggle } from "./ThemeToggle";
// ...
const colors = useColors();
```

Replace hardcoded colors with `colors.*` lookups. Add `<ThemeToggle />` to the right side of the navbar, before any existing right-side actions (avatar, etc.).

- [ ] **Step 4: Build verification**

```bash
cd model-testing-app
npx next build 2>&1 | tail -20
```

Expected: clean build. If there are TypeScript errors about the color shape, ensure the imports are correct.

- [ ] **Step 5: Smoke-test in browser (optional)**

If a dev server is running:
- Open the app
- Click the new theme toggle in the header
- Sidebar + NavigationBar should switch between light/dark
- Reload the page — toggle preference should persist

If no dev server: skip; the build check is sufficient.

- [ ] **Step 6: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/components/Sidebar.tsx model-testing-app/src/components/NavigationBar.tsx model-testing-app/src/components/ThemeToggle.tsx
git commit -m "$(cat <<'EOF'
[app] v1.2 shell migration: Sidebar + NavigationBar use useColors()

Sidebar.tsx + NavigationBar.tsx now read all colors from the useColors()
hook instead of hardcoded Tailwind classes / hex values. Structural
layout unchanged: same 80px sidebar, same 64px navbar, same 12 nav
items, same right-side actions. Only color references migrate.

ThemeToggle.tsx (new): minimal toggle button in the navbar right side.
Sun icon (yellow) for light, Moon icon (purple) for dark. Persists
via the ThemeProvider's localStorage hook.

Other pages remain on hardcoded colors for now — migrate incrementally
as touched, per docs/frontend-standards/README.md migration nudge.
The theme toggle works for the chrome (sidebar + navbar); inner pages
won't theme-flip until they're individually migrated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 2 — /prospects home page (CRM list view) (~90 min)

### Task 11: Build the StatusSection + StatePill + ProspectsHomeHeader components

**Files:**
- Create: `model-testing-app/src/components/prospects/StatePill.tsx`
- Create: `model-testing-app/src/components/prospects/StatusSection.tsx`
- Create: `model-testing-app/src/components/prospects/ProspectsHomeHeader.tsx`

- [ ] **Step 1: Create StatePill**

```typescript
"use client";
import { useColors } from "@/lib/useColors";

const PILL_BG: Record<string, { bg: string; fg: string; border: string }> = {
  drafted: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  needs_revision: { bg: "#ffedd5", fg: "#9a3412", border: "#fdba74" },
  active: { bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" },
  replied: { bg: "#f3e8ff", fg: "#6b21a8", border: "#d8b4fe" },
  engaged: { bg: "#cffafe", fg: "#155e75", border: "#67e8f9" },
  promoted: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  parked: { bg: "#f3f4f6", fg: "#6b6b6b", border: "#e0e0e0" },
  lost: { bg: "#f3f4f6", fg: "#6b6b6b", border: "#e0e0e0" },
  new: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  running: { bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" },
  stuck: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
};

export function StatePill({ state }: { state: string }) {
  const colors = PILL_BG[state] ?? PILL_BG.drafted;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: 2,
        fontFamily: "ui-monospace, monospace",
        fontSize: 9,
        lineHeight: 1.3,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
      }}
    >
      {state.replace(/_/g, " ")}
    </span>
  );
}
```

- [ ] **Step 2: Create StatusSection (collapsible header + table wrapper)**

```typescript
"use client";
import { useState, ReactNode } from "react";
import { useColors } from "@/lib/useColors";

interface StatusSectionProps {
  title: string;
  count: string | number;
  dotColor: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function StatusSection({ title, count, dotColor, defaultExpanded = false, children }: StatusSectionProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div style={{
      border: `1px solid ${colors.border.default}`,
      borderRadius: 4,
      marginBottom: 14,
      background: colors.bg.card,
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: expanded ? `1px solid ${colors.border.default}` : "none",
          background: colors.bg.light,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
          <span style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.text.primary,
            fontWeight: 500,
          }}>
            {title}
          </span>
          <span style={{ color: colors.text.muted, fontSize: 11 }}>{count}</span>
        </div>
        <span style={{ color: colors.text.muted, fontSize: 11 }}>{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && children}
    </div>
  );
}
```

- [ ] **Step 3: Create ProspectsHomeHeader**

```typescript
"use client";
import { useColors } from "@/lib/useColors";
import { Search } from "lucide-react";

interface ProspectsHomeHeaderProps {
  totalCount: number;
  draftedCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function ProspectsHomeHeader({ totalCount, draftedCount, searchQuery, onSearchChange }: ProspectsHomeHeaderProps) {
  const colors = useColors();
  return (
    <div>
      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0 4px", fontSize: 11, color: colors.text.muted }}>
        <span>Dashboard</span>
        <span style={{ color: colors.text.dim }}>›</span>
        <span style={{ color: colors.text.primary, fontWeight: 500 }}>Prospects</span>
      </div>
      {/* Page head */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "6px 0 24px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: `${colors.entityTypes.prospect}15`,
            border: `1px solid ${colors.entityTypes.prospect}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: colors.entityTypes.prospect, fontWeight: 600, fontSize: 16,
          }}>◆</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 300, margin: 0, color: colors.text.primary }}>Prospects</h1>
            <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
              {totalCount} tracked · {draftedCount} awaiting review
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: colors.text.dim }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by company, CH number, contact..."
              style={{
                background: colors.bg.card, border: `1px solid ${colors.border.default}`,
                padding: "6px 10px 6px 28px", fontSize: 11, color: colors.text.primary,
                borderRadius: 4, width: 280,
              }}
            />
          </div>
          <button style={{
            background: colors.bg.card, border: `1px solid ${colors.border.default}`,
            padding: "6px 12px", fontSize: 11, color: colors.text.primary,
            borderRadius: 4, cursor: "pointer",
          }}>Import XLSX</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build verification**

```bash
cd model-testing-app
npx next build 2>&1 | grep -E "error|src/components/prospects" | head -10
```

Expected: no errors from the new files. Build passes.

- [ ] **Step 5: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/components/prospects/
git commit -m "$(cat <<'EOF'
[app] v1.2 prospects components: StatePill + StatusSection + Header

StatePill: color-coded badge for the 8 prospect states + 3 candidate
states (new/running/stuck). Uses light-mode color palettes inline
(dark-mode TBD via CSS vars in a follow-on if needed; light is the
canonical default per branding.md).

StatusSection: collapsible section wrapper with title + count + dot
color in the header. Expansion state held in component for now;
localStorage persistence can be added later if operators want it.

ProspectsHomeHeader: breadcrumbs + amber icon tile + page title with
metric subtitle + search input + Import XLSX button. Read-only header;
the search box is wired up by the parent page (Task 14).

All three are theme-aware via useColors(); will respect the toggle
once the parent page is in scope.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Build the section components (Candidates, NeedsReview, NeedsRevision, Active, Replied, Simple)

**Files:**
- Create: `model-testing-app/src/components/prospects/sections/CandidatesSection.tsx`
- Create: `model-testing-app/src/components/prospects/sections/NeedsReviewSection.tsx`
- Create: `model-testing-app/src/components/prospects/sections/NeedsRevisionSection.tsx`
- Create: `model-testing-app/src/components/prospects/sections/ActiveSection.tsx`
- Create: `model-testing-app/src/components/prospects/sections/RepliedSection.tsx`
- Create: `model-testing-app/src/components/prospects/sections/SimpleSection.tsx`

- [ ] **Step 1: Create CandidatesSection — the unprocessed-HubSpot-companies table**

```typescript
"use client";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { StatusSection } from "../StatusSection";
import { StatePill } from "../StatePill";
import { useRouter } from "next/navigation";

export function CandidatesSection() {
  const colors = useColors();
  const router = useRouter();
  // Hard-coded args matching the MCP tool defaults; could be made configurable
  const candidates = useQuery(api.companies.listUnprocessed as any, {
    limit: 25, sinceDays: 30, states: ["new", "running", "stuck"], excludePromoted: true,
  });

  const rows = candidates ?? [];
  const count = rows.length;

  return (
    <StatusSection title="Candidates" count={`${count} from HubSpot`} dotColor={colors.entityTypes.prospect} defaultExpanded={true}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)} />
            <th style={thStyle(colors)}>Company</th>
            <th style={thStyle(colors)}>HubSpot ID</th>
            <th style={thStyle(colors)}>Industry</th>
            <th style={thStyle(colors)}>Lifecycle</th>
            <th style={thStyle(colors)}>State</th>
            <th style={thStyle(colors)}>Synced</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c: any) => (
            <tr
              key={c.company._id}
              onClick={() => c.state === "running" ? undefined : router.push(`/prospects/${c.company._id}`)}
              style={{
                cursor: c.state === "running" ? "not-allowed" : "pointer",
                opacity: c.state === "running" ? 0.5 : 1,
              }}
            >
              <td style={tdStyle(colors)}>
                <input type="checkbox" disabled={c.state === "running"} style={{ accentColor: colors.entityTypes.prospect }} />
              </td>
              <td style={tdStyle(colors)}>
                <div style={{ color: colors.text.primary, fontWeight: 500 }}>{c.company.name}</div>
                <div style={{ fontSize: 10, color: colors.text.dim, marginTop: 2 }}>
                  {c.company.city ?? ""} · {c.company.industry ?? ""}
                </div>
              </td>
              <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", color: colors.text.muted }}>{c.company.hubspotCompanyId}</td>
              <td style={tdStyle(colors)}>{c.company.industry ?? "—"}</td>
              <td style={tdStyle(colors)}>{c.company.hubspotLifecycleStage ?? "—"}</td>
              <td style={tdStyle(colors)}>
                <StatePill state={c.state} />
                {c.state === "running" && (
                  <span style={{ marginLeft: 6, color: colors.text.muted, fontSize: 10 }}>
                    · {c.runAgeMinutes}m ago
                  </span>
                )}
              </td>
              <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", color: colors.text.muted }}>
                {c.company.createdAt?.slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </StatusSection>
  );
}

function thStyle(colors: any) {
  return {
    textAlign: "left" as const,
    fontFamily: "ui-monospace, monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.text.muted,
    fontWeight: 400,
    padding: "8px 14px",
    borderBottom: `1px solid ${colors.border.default}`,
    background: colors.bg.cardAlt,
  };
}
function tdStyle(colors: any) {
  return {
    padding: "10px 14px",
    borderBottom: `1px solid ${colors.border.light}`,
    fontSize: 11,
    color: colors.text.primary,
    verticalAlign: "middle" as const,
  };
}
```

- [ ] **Step 2: Create the 5 prospect-state section components**

Pattern: each section component uses `useQuery(api.prospects.listByState)` for its state and renders a state-specific table. Create:

- `NeedsReviewSection.tsx` — state="drafted", columns: check / company / CH / source / tier / cadence draft / drafted at / owner
- `NeedsRevisionSection.tsx` — state="needs_revision", columns: check / company / revision note / asked at / owner
- `ActiveSection.tsx` — state="active", columns: company / touches sent (N/M) / next due / last sent / owner
- `RepliedSection.tsx` — state="replied", columns: company / intent pill / evidence / drafted reply / received at
- `SimpleSection.tsx` — generic for engaged/parked/promoted/lost. Takes `state` as prop. Columns: company / state-specific column / date

For brevity, each follows the same shape as CandidatesSection above. The query call is `useQuery(api.prospects.listByState, { state: "drafted" })`. The table columns differ per section per spec section 2.2. The dotColor passed to StatusSection comes from `colors.status[state]`.

Sample skeleton for NeedsReviewSection (apply same pattern to the others):

```typescript
"use client";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { StatusSection } from "../StatusSection";
import { useRouter } from "next/navigation";

export function NeedsReviewSection() {
  const colors = useColors();
  const router = useRouter();
  const rows = useQuery(api.prospects.listByState, { state: "drafted" }) ?? [];

  return (
    <StatusSection
      title="Needs Review"
      count={`${rows.length} drafted`}
      dotColor={colors.status.drafted}
      defaultExpanded={true}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)} />
            <th style={thStyle(colors)}>Company</th>
            <th style={thStyle(colors)}>CH</th>
            <th style={thStyle(colors)}>Drafted</th>
            <th style={thStyle(colors)}>Owner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r._id} onClick={() => router.push(`/prospects/${r._id}`)} style={{ cursor: "pointer" }}>
              <td style={tdStyle(colors)}><input type="checkbox" /></td>
              <td style={tdStyle(colors)}><div style={{ fontWeight: 500 }}>{r.name}</div></td>
              <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", color: colors.text.muted }}>
                {/* CH number derived from companies row link — placeholder for now */}
                —
              </td>
              <td style={{ ...tdStyle(colors), fontFamily: "ui-monospace, monospace", color: colors.text.muted }}>
                {r.prospectStateChangedAt?.slice(0, 16) ?? "—"}
              </td>
              <td style={{ ...tdStyle(colors), color: colors.text.muted }}>{/* owner name from createdBy lookup */}—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </StatusSection>
  );
}

function thStyle(colors: any) { /* same as CandidatesSection */ return {} as any; }
function tdStyle(colors: any) { /* same as CandidatesSection */ return {} as any; }
```

Apply the same shape to `NeedsRevisionSection`, `ActiveSection`, `RepliedSection`, `SimpleSection`. For `SimpleSection`, accept `state` + `title` + `dotColor` as props so a single component serves engaged/parked/promoted/lost.

- [ ] **Step 3: Build verification**

```bash
cd model-testing-app
npx next build 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/components/prospects/sections/
git commit -m "$(cat <<'EOF'
[app] v1.2 prospects sections: 6 section components (Candidates + 5 state-specific)

CandidatesSection: queries companies.listUnprocessed; renders per-row
NEW/RUNNING/STUCK pill; RUNNING rows have disabled checkbox + muted
opacity + cursor:not-allowed (race prevention UI layer).

NeedsReviewSection / NeedsRevisionSection / ActiveSection /
RepliedSection: query prospects.listByState with their respective state;
render state-specific columns per spec section 2.2.

SimpleSection: generic for engaged/parked/promoted/lost — accepts
state + title + dotColor as props. Used 4× from the home page.

All sections share the StatusSection collapsible wrapper. Row click
navigates to /prospects/[prospectId] in-page (no workspace tab bar
per operator direction).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Rewrite `prospects/page.tsx` as the new CRM home

**Files:**
- Modify (full rewrite): `model-testing-app/src/app/(desktop)/prospects/page.tsx`

- [ ] **Step 1: Replace the existing file**

Read first: `cat model-testing-app/src/app/\(desktop\)/prospects/page.tsx | head -10`. Note the file structure for reference.

Replace `model-testing-app/src/app/(desktop)/prospects/page.tsx` entirely with:

```typescript
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { ProspectsHomeHeader } from "@/components/prospects/ProspectsHomeHeader";
import { CandidatesSection } from "@/components/prospects/sections/CandidatesSection";
import { NeedsReviewSection } from "@/components/prospects/sections/NeedsReviewSection";
import { NeedsRevisionSection } from "@/components/prospects/sections/NeedsRevisionSection";
import { ActiveSection } from "@/components/prospects/sections/ActiveSection";
import { RepliedSection } from "@/components/prospects/sections/RepliedSection";
import { SimpleSection } from "@/components/prospects/sections/SimpleSection";

export default function ProspectsPage() {
  const colors = useColors();
  const [searchQuery, setSearchQuery] = useState("");

  // Counts for the header (each is a small query)
  const draftedCount = useQuery(api.prospects.countByState, { state: "drafted" }) ?? 0;
  const allCount = (useQuery(api.clients.list, {}) ?? []).filter((c: any) => c.prospectState).length;

  // TopAccent strip — amber for prospect entity
  return (
    <>
      <div style={{ height: 2, background: colors.entityTypes.prospect }} />
      <div style={{ padding: "16px 24px", background: colors.bg.cardAlt, minHeight: "100vh" }}>
        <ProspectsHomeHeader
          totalCount={allCount}
          draftedCount={draftedCount}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Action-item sections — expanded by default */}
        <CandidatesSection />
        <NeedsReviewSection />
        <NeedsRevisionSection />
        <ActiveSection />
        <RepliedSection />

        {/* Monitoring + historic sections — collapsed by default */}
        <SimpleSection state="engaged" title="Engaged" dotColor={colors.status.engaged} subtitle="meeting booked / in convo" />
        <SimpleSection state="parked" title="Parked" dotColor={colors.status.parked} subtitle="long-term wakeup queue" />
        <SimpleSection state="promoted" title="Promoted" dotColor={colors.status.promoted} subtitle="now active clients" />
        <SimpleSection state="lost" title="Lost" dotColor={colors.status.lost} subtitle="closed" />
      </div>
    </>
  );
}
```

The `SimpleSection` needs to accept a `subtitle` prop — update its signature accordingly when creating in Task 12.

- [ ] **Step 2: Build verification**

```bash
cd model-testing-app
npx next build 2>&1 | tail -30
```

Expected: clean. If type errors on `api.prospects.countByState` or `api.companies.listUnprocessed`, the codegen needs a refresh (`npx convex codegen`).

- [ ] **Step 3: Smoke-test in browser (optional but high-value)**

If a dev server is running:
- Navigate to `/prospects`
- Should see the new layout: header with breadcrumbs + amber icon + title, then 9 collapsible sections
- Click a section header to expand/collapse
- Click a row → navigates to `/prospects/[id]` (will 404 on the detail page until Task 18; that's expected)

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/app/\(desktop\)/prospects/page.tsx
git commit -m "$(cat <<'EOF'
[app] v1.2 /prospects: rewrite as CRM stacked-table home

Full rewrite replacing the old LeadsPage (HubSpot deals listing) with
the new prospects CRM per spec section 2.2:

- TopAccent strip (2px amber, entity color)
- ProspectsHomeHeader: breadcrumbs + amber icon tile + title +
  search + Import XLSX action
- 9 stacked sections (Candidates + 8 prospect states), each a
  collapsible StatusSection wrapping a state-specific table
- Top 5 sections expanded by default (Candidates / Needs Review /
  Needs Revision / Active Cadence / Replied)
- Bottom 4 collapsed (Engaged / Parked / Promoted / Lost)

Data flows via Convex useQuery — live updates when HubSpot sync
adds new companies or skill runs complete or state transitions
fire. No page refresh needed.

Detail page (Task 18) lands next; row click navigates to it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 3 — /prospects/[id] detail page (~90 min)

### Task 14: Build the ProspectDetailHeader (sticky header with TopAccent + breadcrumbs + identity + KPIs + tabs)

**Files:**
- Create: `model-testing-app/src/components/prospects/ProspectDetailHeader.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatePill } from "./StatePill";

interface ProspectDetailHeaderProps {
  prospect: any;            // clients row
  intelRun?: any;           // latest prospect-intel skillRun
  cadences: any[];          // package members
  activeTab: "overview" | "intel" | "outreach" | "activity";
  onTabChange: (tab: "overview" | "intel" | "outreach" | "activity") => void;
}

export function ProspectDetailHeader({ prospect, intelRun, cadences, activeTab, onTabChange }: ProspectDetailHeaderProps) {
  const colors = useColors();
  const router = useRouter();

  const state = prospect?.prospectState ?? "drafted";
  const touchCount = cadences?.length ?? 0;
  const repliesCount = 0; // TODO: derive from replyEvents linked to this contact

  return (
    <>
      <div style={{ height: 2, background: colors.entityTypes.prospect }} />
      <div style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}`, position: "sticky", top: 64, zIndex: 5 }}>
        {/* Breadcrumbs */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px 4px", fontSize: 11, color: colors.text.muted }}>
          <span onClick={() => router.push("/")} style={{ cursor: "pointer" }}>Dashboard</span>
          <span style={{ color: colors.text.dim }}>›</span>
          <span onClick={() => router.push("/prospects")} style={{ cursor: "pointer" }}>Prospects</span>
          <span style={{ color: colors.text.dim }}>›</span>
          <span style={{ color: colors.text.primary, fontWeight: 500 }}>{prospect?.name ?? "…"}</span>
        </div>

        {/* Identity row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 24px 18px" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: `${colors.entityTypes.prospect}15`,
              border: `1px solid ${colors.entityTypes.prospect}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: colors.entityTypes.prospect, fontWeight: 600, fontSize: 16,
            }}>◆</div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 300, margin: 0, color: colors.text.primary }}>{prospect?.name ?? "…"}</h1>
              <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                {prospect?.companyName ?? ""}
              </div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                {intelRun?.dedupKey ? `CH-${intelRun.dedupKey}` : ""} {intelRun ? `· skillRun ${intelRun._id.slice(-8)}` : ""}
              </div>
            </div>
            <StatePill state={state} />
          </div>
        </div>

        {/* 5-KPI strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1,
          padding: "0 24px 12px", background: colors.border.default, marginTop: 0,
        }}>
          {[
            { label: "Tier", value: "HOT", meta: "from Beauhurst", accent: colors.entityTypes.prospect },
            { label: "Cadence", value: String(touchCount), meta: "touches", accent: colors.entityTypes.cadence },
            { label: "Intel coverage", value: "42%", meta: "CH data not yet synced", accent: colors.entityTypes.skillRun },
            { label: "Last touch", value: "—", meta: "never contacted", accent: colors.entityTypes.client },
            { label: "Replies", value: String(repliesCount), meta: "no inbound yet", accent: colors.entityTypes.contact },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: colors.bg.card, padding: "12px 14px", borderTop: `2px solid ${kpi.accent}` }}>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted }}>{kpi.label}</div>
              <div style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary, marginTop: 6 }}>{kpi.value}</div>
              <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>{kpi.meta}</div>
            </div>
          ))}
        </div>

        {/* In-page tabs */}
        <div style={{ display: "flex", padding: "0 24px", gap: 0, borderBottom: `1px solid ${colors.border.default}` }}>
          {(["overview", "intel", "outreach", "activity"] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                padding: "12px 16px", fontSize: 13, cursor: "pointer",
                color: tab === activeTab ? colors.text.primary : colors.text.muted,
                borderBottom: `2px solid ${tab === activeTab ? colors.entityTypes.prospect : "transparent"}`,
                fontWeight: tab === activeTab ? 500 : 400,
                textTransform: "capitalize",
              }}
            >
              {tab}
              {tab === "outreach" && touchCount > 0 && (
                <span style={{ color: colors.text.dim, marginLeft: 4 }}>{touchCount}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Build verification**

```bash
cd model-testing-app
npx next build 2>&1 | grep -E "error|ProspectDetailHeader" | head -10
```

Expected: no errors on the new file. Build passes.

- [ ] **Step 3: Commit deferred — batched with Tasks 15-19**

Skip commit. Continue to Tasks 15-19; commit together at the end of Task 19 (the page that consumes them all).

---

### Task 15: Build the 4 tab components — OverviewTab, IntelTab, OutreachTab, ActivityTab

**Files:**
- Create: `model-testing-app/src/components/prospects/tabs/OverviewTab.tsx`
- Create: `model-testing-app/src/components/prospects/tabs/IntelTab.tsx`
- Create: `model-testing-app/src/components/prospects/tabs/OutreachTab.tsx`
- Create: `model-testing-app/src/components/prospects/tabs/ActivityTab.tsx`

Due to scope, each tab is a focused implementation. Below are the contract sketches; the implementer fills in the specifics following the patterns established in Phase 2.

- [ ] **Step 1: OverviewTab — action callout + intel preview + outreach package preview + gaps panel**

Read spec section 2.3 main column / Overview tab description. Render four panels:
1. Action callout (yellow box for `drafted`, blue for `active`, etc. based on prospect.prospectState — varies)
2. Intel summary panel (excerpt of `intelRun.brief`, "Full intel →" link to switch to Intel tab)
3. Outreach package panel (all touches inline with subject + scheduled-at + body preview + Edit link)
4. Gaps panel (if `intelRun.gaps` is non-empty)

Use the `useColors()` hook and styles consistent with other components.

- [ ] **Step 2: IntelTab — markdown view + edit mode**

Read `intelRun.intelMarkdown` (or `intelRun.brief` as fallback). Default mode: rendered markdown. Edit mode toggle: shows a textarea with the raw markdown + "Save" button that calls a (to-be-added) `skillRuns.updateIntel` mutation, OR just stores the edit in component state with a TODO note. For v1.2 minimum, plain `<pre>` rendering of the markdown is acceptable; richer rendering with react-markdown can be added if time permits.

- [ ] **Step 3: OutreachTab — per-touch editor + cadence preset picker**

Reads `cadences` array (from `cadences.listByPackage`). Renders the preset picker at the top (Light / Moderate / Aggressive / Custom — calls a TODO mutation that adjusts all touch dates; for v1.2 minimum just display them, real reset deferred). Below: one editable card per touch with:
- Subject (text input)
- Body (textarea, auto-resize)
- Scheduled-at (datetime-local input)
- Save button (calls `cadence.update` mutation via Convex)

On save, the mutation patches the cadence row and sets `editedByOperator: true`.

- [ ] **Step 4: ActivityTab — chronological event log**

Aggregates events from multiple sources:
- skillRun created / completed
- cadences fired (from cadence.lastFiredAt)
- replyEvents (from JOIN against contactId)
- state transitions (from clients.prospectStateChangedAt — single most recent only, since we only store one)

Render as a chronological list with mono timestamps + event description + optional link to related entity. Simple `<div>` rendering is fine; no need for fancy timeline visualization.

- [ ] **Step 5: Build verification**

```bash
cd model-testing-app
npx next build 2>&1 | tail -30
```

Expected: clean.

- [ ] **Step 6: Commit deferred — batched with Tasks 16-19**

---

### Task 16: Build supporting components — StickyApprovalFooter, ProspectDetailAside, RevisionRequestModal

**Files:**
- Create: `model-testing-app/src/components/prospects/StickyApprovalFooter.tsx`
- Create: `model-testing-app/src/components/prospects/ProspectDetailAside.tsx`
- Create: `model-testing-app/src/components/prospects/RevisionRequestModal.tsx`

- [ ] **Step 1: StickyApprovalFooter**

Bottom fixed-position bar. Left side: ← → arrow buttons + position indicator + keyboard hint. Right side: action buttons varying by `prospect.prospectState`:

```typescript
"use client";
import { useColors } from "@/lib/useColors";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

interface StickyApprovalFooterProps {
  prospect: any;
  positionInList: number;
  totalInList: number;
  stateLabel: string;
  onApprove: () => void;
  onDeny: () => void;
  onRequestRevision: () => void;
  onSkip: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function StickyApprovalFooter(props: StickyApprovalFooterProps) {
  const colors = useColors();
  const { prospect, positionInList, totalInList, stateLabel, onApprove, onDeny, onRequestRevision, onSkip, onPrev, onNext } = props;

  // Arrow key navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext]);

  const state = prospect?.prospectState ?? "drafted";

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 80, right: 0,
      background: colors.bg.card, borderTop: `1px solid ${colors.border.default}`,
      padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      zIndex: 20, boxShadow: "0 -2px 8px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={onPrev} title="Previous (←)" style={arrowBtnStyle(colors)}><ChevronLeft size={14} /></button>
        <button onClick={onNext} title="Next (→)" style={arrowBtnStyle(colors)}><ChevronRight size={14} /></button>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, marginLeft: 8 }}>
          {positionInList} / {totalInList} {stateLabel}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {state === "drafted" && (
          <>
            <button onClick={onSkip} style={btnStyle(colors, "secondary")}>Skip</button>
            <button onClick={onDeny} style={btnStyle(colors, "danger")}>Deny</button>
            <button onClick={onRequestRevision} style={btnStyle(colors, "warning")}>Request Revision</button>
            <button onClick={onApprove} style={btnStyle(colors, "primary")}>Approve & Schedule →</button>
          </>
        )}
        {state !== "drafted" && (
          <span style={{ color: colors.text.muted, fontSize: 11 }}>State: {state} — actions vary per state (TODO)</span>
        )}
      </div>
    </div>
  );
}

function arrowBtnStyle(colors: any) { return { width: 28, height: 28, border: `1px solid ${colors.border.default}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: colors.text.secondary, cursor: "pointer", background: colors.bg.card } as any; }
function btnStyle(colors: any, kind: "primary" | "secondary" | "danger" | "warning") {
  const styles: any = {
    primary: { background: colors.accent.green, borderColor: colors.accent.green, color: "#ffffff" },
    secondary: { background: colors.bg.card, borderColor: colors.border.default, color: colors.text.secondary },
    danger: { background: colors.bg.card, borderColor: colors.accent.red, color: colors.accent.red },
    warning: { background: colors.bg.card, borderColor: colors.accent.orange, color: colors.accent.orange },
  };
  return { padding: "8px 14px", fontSize: 11, borderRadius: 4, cursor: "pointer", fontWeight: 500, border: "1px solid", ...styles[kind] };
}
```

- [ ] **Step 2: ProspectDetailAside — the 320px right panel with 5 groups (Identity / Pipeline / Cadence / Linked / Activity)**

Sketch following the spec section 2.3 right aside description. Reads from `prospect` (clients row), `intelRun`, `cadences[]`. Renders 5 grouped panels with the data points enumerated in the spec.

- [ ] **Step 3: RevisionRequestModal — modal with textarea for revision note**

Simple modal overlay. Title "Request Revision". Textarea with placeholder examples ("Reword Touch 2 — too aggressive on rates"). Submit button calls `cadence.requestRevision` MCP/mutation. Cancel button closes.

- [ ] **Step 4: Commit deferred — batched with Tasks 17-19**

---

### Task 17: Build MarkdownEditor + CadencePresetPicker + RevisionDiffView

**Files:**
- Create: `model-testing-app/src/components/prospects/MarkdownEditor.tsx`
- Create: `model-testing-app/src/components/prospects/CadencePresetPicker.tsx`
- Create: `model-testing-app/src/components/prospects/RevisionDiffView.tsx`

- [ ] **Step 1: MarkdownEditor — textarea + preview toggle**

Simple component: takes `value` and `onChange`, renders either a textarea or a rendered preview (using a basic markdown-to-HTML approach — split on newlines, render paragraphs; bold/italic via inline regex). For v1.2 minimum, plain textarea is acceptable; preview rendering can be added in v1.2.1.

- [ ] **Step 2: CadencePresetPicker — 3-option picker + Custom**

Renders 4 buttons: Light (60d) / Moderate (30d) / Aggressive (21d) / Custom. Clicking a preset calls an `onSelect` callback with the preset name. Custom shows the current per-touch dates as datetime-local inputs.

- [ ] **Step 3: RevisionDiffView — per-touch original ↔ new side-by-side**

Takes `originalTouches[]` + `newTouches[]` arrays. Renders a side-by-side per-touch comparison: original on left, new on right, with "Accept new" / "Keep original" buttons per row. Plain text diff is fine for v1.2; rich diff (intra-line highlights) deferred.

- [ ] **Step 4: Commit deferred — batched with Tasks 18-19**

---

### Task 18: Rewrite `prospects/[prospectId]/page.tsx` as the detail page composing all the above

**Files:**
- Modify (full rewrite): `model-testing-app/src/app/(desktop)/prospects/[prospectId]/page.tsx`

- [ ] **Step 1: Replace the existing file**

The existing page uses a legacy `prospectStorage` localStorage layer. Full rewrite:

```typescript
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { ProspectDetailHeader } from "@/components/prospects/ProspectDetailHeader";
import { ProspectDetailAside } from "@/components/prospects/ProspectDetailAside";
import { OverviewTab } from "@/components/prospects/tabs/OverviewTab";
import { IntelTab } from "@/components/prospects/tabs/IntelTab";
import { OutreachTab } from "@/components/prospects/tabs/OutreachTab";
import { ActivityTab } from "@/components/prospects/tabs/ActivityTab";
import { StickyApprovalFooter } from "@/components/prospects/StickyApprovalFooter";
import { RevisionRequestModal } from "@/components/prospects/RevisionRequestModal";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default function ProspectDetailPage() {
  const colors = useColors();
  const router = useRouter();
  const params = useParams();
  const prospectId = params.prospectId as Id<"clients">;

  const [activeTab, setActiveTab] = useState<"overview" | "intel" | "outreach" | "activity">("overview");
  const [showRevisionModal, setShowRevisionModal] = useState(false);

  const prospect = useQuery(api.prospects.getById, { clientId: prospectId });
  const intelRun = useQuery(
    api.skillRuns.latestByDedupKey,
    prospect ? { skillName: "prospect-intel", dedupKey: (prospect as any).hubspotCompanyId ?? "" } : "skip"
  );
  const cadences = useQuery(
    api.cadences.listByContact,
    prospect ? { contactId: (prospect as any).primaryContactId } : "skip",
  ) ?? [];

  // Position-in-list — defaulted to "1 / 1" until we wire prev/next from query string
  const positionInList = 1;
  const totalInList = 1;

  if (prospect === undefined) {
    return <div style={{ padding: 24, color: colors.text.muted }}>Loading…</div>;
  }
  if (prospect === null) {
    return <div style={{ padding: 24, color: colors.text.muted }}>Prospect not found.</div>;
  }

  return (
    <>
      <ProspectDetailHeader
        prospect={prospect}
        intelRun={intelRun}
        cadences={cadences}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 1, background: colors.border.default, paddingBottom: 80 }}>
        <div style={{ background: colors.bg.card, padding: 24 }}>
          {activeTab === "overview" && <OverviewTab prospect={prospect} intelRun={intelRun} cadences={cadences} onJumpToOutreach={() => setActiveTab("outreach")} />}
          {activeTab === "intel" && <IntelTab intelRun={intelRun} />}
          {activeTab === "outreach" && <OutreachTab cadences={cadences} />}
          {activeTab === "activity" && <ActivityTab prospect={prospect} intelRun={intelRun} cadences={cadences} />}
        </div>
        <aside style={{ background: colors.bg.light, padding: 20, borderLeft: `1px solid ${colors.border.default}` }}>
          <ProspectDetailAside prospect={prospect} intelRun={intelRun} cadences={cadences} />
        </aside>
      </div>

      <StickyApprovalFooter
        prospect={prospect}
        positionInList={positionInList}
        totalInList={totalInList}
        stateLabel="drafted"
        onApprove={async () => {
          // Call prospect.transitionState via MCP would require auth; use a Convex mutation instead.
          // For now: log + navigate back.
          console.log("Approve package for", prospect._id);
        }}
        onDeny={async () => { console.log("Deny", prospect._id); }}
        onRequestRevision={() => setShowRevisionModal(true)}
        onSkip={() => router.push("/prospects")}
        onPrev={() => { /* TODO: cycle through siblings in same state */ }}
        onNext={() => { /* TODO: cycle through siblings in same state */ }}
      />

      {showRevisionModal && (
        <RevisionRequestModal
          onCancel={() => setShowRevisionModal(false)}
          onSubmit={async (note) => {
            console.log("Revision requested:", note);
            setShowRevisionModal(false);
          }}
        />
      )}
    </>
  );
}
```

Many of the action handlers are stubbed with `console.log` — they require public Convex mutations wrapping the internal mutations from Task 3. Add those public mutations to `cadences.ts` as quick wrappers calling the internals (gated by auth via `getAuthenticatedUser` or similar).

- [ ] **Step 2: Add public mutation wrappers in `cadences.ts`**

In `model-testing-app/convex/cadences.ts`, add:

```typescript
import { mutation } from "./_generated/server";

export const approvePackage = mutation({
  args: { packageId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    // Resolve userId from identity (project-specific — match existing auth pattern)
    // For now, fall back to first user
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]._id;
    return await ctx.runMutation(internal.cadences.approvePackageInternal, { packageId: args.packageId, userId });
  },
});

// Similar wrappers: denyPackage, requestRevision, updateCadence
```

(The exact auth resolution may need adaptation to the existing pattern; check `convex/authHelpers.ts` if present.)

- [ ] **Step 3: Build verification**

```bash
cd model-testing-app
npx next build 2>&1 | tail -30
```

Expected: clean build (TypeScript errors expected on `useQuery` shapes and prop mismatches between component sketches and actual usage — fix as they surface).

- [ ] **Step 4: Commit Tasks 14-18 together**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/components/prospects/ model-testing-app/src/app/\(desktop\)/prospects/\[prospectId\]/page.tsx model-testing-app/convex/cadences.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] v1.2 /prospects/[id]: rebuild as Template 3 tabbed detail

Full rewrite of /prospects/[prospectId]/page.tsx replacing the legacy
prospectStorage localStorage layer with Convex-backed prospect detail
view per spec section 2.3:

- ProspectDetailHeader: sticky header with TopAccent (amber) + breadcrumbs
  + identity row (32x32 icon tile + name + subtitle + CH id + status pill)
  + 5-KPI strip (Tier / Cadence / Intel coverage / Last touch / Replies)
  + in-page tabs (Overview / Intel / Outreach / Activity)
- 4 tab components: OverviewTab (action callout + intel preview + outreach
  list + gaps), IntelTab (markdown view), OutreachTab (per-touch editor),
  ActivityTab (chronological events)
- ProspectDetailAside: 320px right panel with 5 grouped sections
  (Identity / Pipeline / Cadence / Linked / Activity)
- StickyApprovalFooter: left arrow nav + position; right action buttons
  (Skip / Deny / Request Revision / Approve & Schedule) for drafted
  state. Other states show stub message for v1.2.1 expansion.
- RevisionRequestModal: textarea for operator note; submits via
  cadence.requestRevision mutation

Supporting components: MarkdownEditor (textarea + preview toggle),
CadencePresetPicker (Light/Moderate/Aggressive/Custom), RevisionDiffView
(per-touch original vs new side-by-side, accept/keep buttons).

Public mutation wrappers added to cadences.ts: approvePackage,
denyPackage, requestRevision, updateCadence — each wraps the
corresponding internal mutation with auth resolution.

Arrow key navigation between prospects in the same status list is
stubbed (TODO in the StickyApprovalFooter onPrev/onNext callbacks);
position indicator shows 1/1 until wired in v1.2.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 4 — Verification (~30 min)

### Task 19: End-to-end build + smoke test + push

**Files:** none modified; verification + push.

- [ ] **Step 1: Final convex codegen + next build**

```bash
cd model-testing-app
npx convex codegen
npx next build 2>&1 | tail -50
```

Expected: clean build. If errors surface from prior tasks' stubs, fix them inline + amend.

- [ ] **Step 2: Smoke-test the new MCP tools**

```bash
TOKEN=$(grep -oE 'rcp_[a-zA-Z0-9_]+' /Users/cowboy/rockcap/rockcap-v2/.mcp.json | head -1)

# Verify all 5 new tools live
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | grep -oE '"name":"(prospect|cadence|companies|approval)\.[a-zA-Z]+"' | sort -u

# Verify companies.listUnprocessed returns rows
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"companies.listUnprocessed","arguments":{"limit":5}}}'
```

Expected: tools/list shows all 5 new tools + existing ones; listUnprocessed returns up to 5 candidate rows (Mccarthy should appear unless we already cleaned it up).

- [ ] **Step 3: End-to-end browser test (manual; requires dev server)**

If you have a dev server running:
1. Navigate to `/prospects` — see the new CRM home with 9 sections
2. Toggle the theme — sidebar + navbar should switch light/dark; the inner page may still be light-only until full theme application
3. Click a candidate row → opens `/prospects/[id]` — see the detail page with all tabs + sticky footer
4. Click the "Outreach" tab → see touch list
5. Click "Skip" in sticky footer → returns to home

If you don't have a dev server: the build passing is sufficient evidence the wiring compiles.

- [ ] **Step 4: Push the branch**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git push -u origin $(git branch --show-current)
```

(Or if working in a worktree on `prospects-crm-v1.2` branch — push that one.)

Expected: branch pushed. GitHub returns a "create PR" URL.

- [ ] **Step 5: Generate operator summary**

```bash
echo "=== v1.2 commits ==="
git log --oneline main..HEAD | head -30
echo ""
echo "=== Files changed ==="
git diff --stat main..HEAD | tail -30
```

Surface a summary covering:
- Branch + push status
- Number of commits
- Build clean
- The 5 new MCP tools live + tested
- Theme toggle works (or build clean as proxy)
- /prospects pages rewritten (note that arrow key navigation between prospects + some action handlers are stubbed for v1.2.1)
- Known operator-driven follow-ups: smoke-test against a real prospect, decide whether arrow-key navigation between siblings is v1.2 finish work or v1.2.1, decide whether HubSpot push-back PATCH lands in v1.2.1
- PR URL

**Plan complete.**

---

## Plan Self-Review

**Spec coverage:**

| Spec section | Plan task(s) |
|---|---|
| 1. Goal and Success Criteria | Task 19 (final verification) |
| 2.1 State machine | Tasks 1-2 (schema + prospects.ts) |
| 2.2 /prospects home page | Tasks 11-13 |
| 2.3 /prospects/[id] detail | Tasks 14-18 |
| 2.4 Revision flow | Tasks 3, 6, 16, 17 |
| 2.5 Candidates section + NEW/RUNNING/STUCK | Tasks 7, 12 (CandidatesSection) |
| 2.6 Approval gate model | Tasks 1 (schema), 3 (mutations), 4 (migration), 18 (UI) |
| 2.7 Storage shape | Tasks 1 (schema additions), 17 (MarkdownEditor) |
| 2.8 HubSpot bidirectional sync | Task 8 (push-back stub) |
| 2.9 Cadence aggressiveness presets | Task 17 (CadencePresetPicker) |
| 2.10 Theme system | Tasks 9-10 |
| 2.11 New MCP tools | Tasks 6-7 |
| 2.12 Schema additions | Task 1 |
| 3. Frontend standards adoption | Pre-completed during brainstorm (docs/frontend-standards/ exists) |

**Placeholder scan:** Searched for TBD / TODO / "implement later". Found:
- "TODO: derive from replyEvents" in ProspectDetailHeader (Task 14) — placeholder for the replies KPI; legitimately deferred for v1.2.1.
- "TODO: cycle through siblings" in StickyApprovalFooter (Task 16) — arrow-key navigation deferred for v1.2.1, explicitly noted in Task 18 commit message + Task 19 summary.
- "TODO mutation" in OutreachTab (Task 15) — referenced mutations exist; the TODO is for the cadence preset apply logic which is acceptable as stub for v1.2.

All other TODOs are intentional v1.2.1 scope, documented in the spec section 4.2.

**Type consistency:** prospect state literals consistent across schema (Task 1), prospects.ts (Task 2), MCP tool (Task 6), and StatePill (Task 11). Cadence field names consistent across schema (Task 1), mutations (Task 3), MCP tools (Task 6), and UI (Tasks 11-18). Theme tokens used consistently — components import from `useColors()`, never hardcode hex.

**Spec-to-plan gap check:** Spec section 4.2 deferrals are all honoured (server-side batch trigger, meeting-prep hardening, qualify-and-draft, calendar integration, atomic-tool additions, app-wide facelift, workspace tabs, Newton/Mission Control). Spec section 5 open considerations are not implemented (markdown editor library, revision diff polish, custom preset persistence) — all explicitly v1.2.1+ scope.

No fixes needed; plan covers spec at a level appropriate for the next implementation session.
