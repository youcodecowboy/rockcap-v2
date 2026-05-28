# Prospect Lifecycle Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the prospect journey one canonical vocabulary (New / Prospects ladder + 4 deal types) shared by the intel, cadence, and UI; make `researched` a real state so completed work never vanishes; collapse the board to two tabs; and add a one-click promote-to-client.

**Architecture:** Approach C (hybrid) from the spec. One enum addition (`researched`), no bulk migration; existing states relabelled in the UI. Pure display logic (state→ladder rung, flag computation) is extracted into `src/lib/prospects/` and unit-tested with vitest. Convex, React, and SKILL.md changes are verified by `npx next build` + Convex deploy + a live `prospect-intel` re-run on Homes by Carlton (`clientId kn73ymjftace7c9zdggqqd62mn857kmb`).

**Tech Stack:** Next.js 16 (App Router, client components), Convex (queries/mutations), vitest, Anthropic skills (markdown). Commit prefixes: `[app]` / `[skills]` / `[both]`.

**Spec:** `docs/superpowers/specs/2026-05-28-prospect-lifecycle-redesign-design.md`

**Verification note:** there is no Convex-function or React-component test harness in this repo (vitest covers `src/lib` pure logic only). Tasks that change Convex/React/markdown verify via build + preview + live run, not unit tests. This is intentional, not a gap.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `convex/schema.ts` | `prospectState` union + `cadences.contactId` optionality | Modify |
| `convex/prospects.ts` | `PROSPECT_STATE` union; HubSpot mapping | Modify |
| `convex/mcp.ts` | `prospect.transitionState` enum | Modify |
| `convex/cadences.ts` | `createInternal` / create accepts contactless draft | Modify |
| `src/lib/prospects/ladder.ts` | Pure: `prospectState` → `{tab, rung, label}` + ordering | Create |
| `src/lib/prospects/flags.ts` | Pure: `(client, intelRun)` → flag chips | Create |
| `src/lib/prospects/__tests__/ladder.test.ts` | vitest for ladder | Create |
| `src/lib/prospects/__tests__/flags.test.ts` | vitest for flags | Create |
| `src/app/(desktop)/prospects/page.tsx` | Two-tab container | Rewrite |
| `src/components/prospects/tabs2/NewTab.tsx` | New-leads tab (wraps existing Candidates query) | Create |
| `src/components/prospects/tabs2/ProspectsTab.tsx` | Prospects ladder table | Create |
| `src/components/prospects/sections/ResearchedSection.tsx` | Retired (researched is a real rung now) | Delete |
| `src/components/prospects/tabs/OverviewTab.tsx` | Flag banner + promote button | Modify |
| `skills/skills/prospect-intel/SKILL.md` | Canonical terms, required outputs, set `researched` | Modify |
| `skills/skills/prospect-intel/references/bridging-vs-developer.md` | Rename codes → canonical terms | Modify |
| `skills/skills/prospect-intel/references/intel-report-template.md` | Required deal-type/size/flags sections | Modify |
| `skills/shared-references/deal-type-size-bands.md` | Band-fallback table (shared reference) | Create |
| `skills/CATALOGUE.md` | Reflect `transitionState` enum change | Modify |

---

## Phase 1 — Canonical state + pure display logic

### Task 1.1: Add `researched` to the prospectState enum

**Files:**
- Modify: `convex/schema.ts:66-75`
- Modify: `convex/prospects.ts:201-210` (the `PROSPECT_STATE` const) and `538-547` (`HUBSPOT_MAPPING`)
- Modify: `convex/mcp.ts` (the `prospect.transitionState` tool's `newState` enum — search for `transitionState`)

- [ ] **Step 1: Add the literal to the schema union**

In `convex/schema.ts`, inside `prospectState: v.optional(v.union(...))`, add as the first literal:

```ts
      v.literal("researched"),
      v.literal("drafted"),
```

- [ ] **Step 2: Add it to the `PROSPECT_STATE` const in prospects.ts**

```ts
const PROSPECT_STATE = v.union(
  v.literal("researched"),
  v.literal("drafted"),
  v.literal("needs_revision"),
  v.literal("active"),
  v.literal("replied"),
  v.literal("engaged"),
  v.literal("promoted"),
  v.literal("parked"),
  v.literal("lost"),
);
```

- [ ] **Step 3: Add the HubSpot mapping row**

In `HUBSPOT_MAPPING` (prospects.ts), add:

```ts
  researched: { lifecycleStage: "lead", hs_lead_status: "open" },
```

- [ ] **Step 4: Add `researched` to the `prospect.transitionState` enum in `convex/mcp.ts`**

Find the `transitionState` tool definition and add `"researched"` to its `newState` enum list (same set of 9 values as Step 2).

- [ ] **Step 5: Deploy + verify**

Run: `npx convex dev --once`
Expected: pushes schema + functions with no validation error (additive optional union value is non-breaking).
Then: `grep -rn "researched" convex/schema.ts convex/prospects.ts convex/mcp.ts` → 4 hits.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/prospects.ts convex/mcp.ts
git commit -m "[app] add 'researched' prospect state (lifecycle redesign Phase 1)"
```

### Task 1.2: Pure ladder mapping helper

**Files:**
- Create: `src/lib/prospects/ladder.ts`
- Test: `src/lib/prospects/__tests__/ladder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { rungFor, RUNGS, PROSPECT_RUNGS } from "../ladder";

describe("rungFor", () => {
  it("maps researched to the Researched rung", () => {
    expect(rungFor("researched")).toEqual({ key: "researched", label: "Researched", order: 1 });
  });
  it("relabels engaged as Meeting booked", () => {
    expect(rungFor("engaged").label).toBe("Meeting booked");
  });
  it("treats needs_revision as Drafted (revision is a flag, not a rung)", () => {
    expect(rungFor("needs_revision").key).toBe("drafted");
  });
  it("relabels active as Outreach active", () => {
    expect(rungFor("active").label).toBe("Outreach active");
  });
  it("returns null for an unset state (belongs to New tab, not a rung)", () => {
    expect(rungFor(undefined)).toBeNull();
  });
  it("orders the active prospect rungs researched→drafted→active→replied→engaged", () => {
    const ordered = PROSPECT_RUNGS.map((r) => r.key);
    expect(ordered).toEqual(["researched", "drafted", "active", "replied", "engaged"]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/prospects/__tests__/ladder.test.ts`
Expected: FAIL — cannot find module `../ladder`.

- [ ] **Step 3: Implement `ladder.ts`**

```ts
// Canonical prospect ladder. Maps the stored prospectState enum to the
// operator-facing rung + label. `engaged` shows as "Meeting booked";
// `needs_revision` collapses into Drafted (revision is a flag, not a rung).
export type ProspectStateValue =
  | "researched" | "drafted" | "needs_revision" | "active"
  | "replied" | "engaged" | "promoted" | "parked" | "lost";

export interface Rung { key: string; label: string; order: number; }

const MAP: Record<ProspectStateValue, Rung> = {
  researched:     { key: "researched", label: "Researched",     order: 1 },
  drafted:        { key: "drafted",    label: "Drafted",        order: 2 },
  needs_revision: { key: "drafted",    label: "Drafted",        order: 2 },
  active:         { key: "active",     label: "Outreach active", order: 3 },
  replied:        { key: "replied",    label: "Replied",        order: 4 },
  engaged:        { key: "engaged",    label: "Meeting booked", order: 5 },
  promoted:       { key: "promoted",   label: "Promoted",       order: 6 },
  parked:         { key: "parked",     label: "Parked",         order: 90 },
  lost:           { key: "lost",       label: "Lost",           order: 91 },
};

export const RUNGS = MAP;

// The active ladder shown in the Prospects tab (excludes promoted/parked/lost holding).
export const PROSPECT_RUNGS: Rung[] = [
  MAP.researched, MAP.drafted, MAP.active, MAP.replied, MAP.engaged,
];

export function rungFor(state: ProspectStateValue | undefined | null): Rung | null {
  if (!state) return null;
  return MAP[state] ?? null;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/prospects/__tests__/ladder.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prospects/ladder.ts src/lib/prospects/__tests__/ladder.test.ts
git commit -m "[app] add prospect ladder mapping helper (lifecycle redesign Phase 1)"
```

### Task 1.3: Pure flag-computation helper

**Files:**
- Create: `src/lib/prospects/flags.ts`
- Test: `src/lib/prospects/__tests__/flags.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeProspectFlags } from "../flags";

const intelRun = (gaps: any[] = []) => ({ status: "complete_with_gaps", gaps });

describe("computeProspectFlags", () => {
  it("flags a prospect with no usable contact", () => {
    const flags = computeProspectFlags(
      { primaryContactId: undefined, contactsWithEmail: 0 },
      intelRun(),
    );
    expect(flags.some((f) => f.key === "no_contact" && f.severity === "warn")).toBe(true);
  });
  it("does not flag no_contact when a contact email exists", () => {
    const flags = computeProspectFlags({ contactsWithEmail: 1 }, intelRun());
    expect(flags.some((f) => f.key === "no_contact")).toBe(false);
  });
  it("surfaces intel-run gaps as info flags", () => {
    const flags = computeProspectFlags(
      { contactsWithEmail: 1 },
      intelRun([{ kind: "missing_data", description: "officers/PSCs not synced" }]),
    );
    expect(flags.some((f) => f.severity === "info")).toBe(true);
  });
  it("returns an all-clear flag when nothing is wrong", () => {
    const flags = computeProspectFlags({ contactsWithEmail: 1 }, intelRun([]));
    expect(flags).toEqual([{ key: "all_clear", label: "All found", severity: "ok" }]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/prospects/__tests__/flags.test.ts`
Expected: FAIL — cannot find module `../flags`.

- [ ] **Step 3: Implement `flags.ts`**

```ts
export interface ProspectFlag { key: string; label: string; severity: "ok" | "info" | "warn"; }

interface ClientLike { primaryContactId?: string; contactsWithEmail?: number; }
interface IntelRunLike { status?: string; gaps?: { kind: string; description: string }[]; }

export function computeProspectFlags(client: ClientLike, intelRun: IntelRunLike | null): ProspectFlag[] {
  const flags: ProspectFlag[] = [];
  const hasContact = (client.contactsWithEmail ?? 0) > 0 || !!client.primaryContactId;
  if (!hasContact) {
    flags.push({ key: "no_contact", label: "No contact — add an email to send", severity: "warn" });
  }
  for (const gap of intelRun?.gaps ?? []) {
    flags.push({ key: gap.kind, label: gap.description, severity: "info" });
  }
  if (flags.length === 0) {
    flags.push({ key: "all_clear", label: "All found", severity: "ok" });
  }
  return flags;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/prospects/__tests__/flags.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prospects/flags.ts src/lib/prospects/__tests__/flags.test.ts
git commit -m "[app] add prospect flag computation helper (lifecycle redesign Phase 1)"
```

---

## Phase 2 — Intel output (skills)

### Task 2.1: Rename deal-type taxonomy to canonical terms

**Files:** Modify `skills/skills/prospect-intel/references/bridging-vs-developer.md`

- [ ] **Step 1:** Replace the four-row classification table's codes/labels with: `new_development` "New development", `bridging` "Bridging", `existing_asset` "Existing asset", `unclassifiable` "Unclassifiable". Update every in-body reference (`development_finance`→`new_development`, `term_loan`→`existing_asset`) and the SIC-signal table rows accordingly.
- [ ] **Step 2:** Verify: `grep -nE "development_finance|term_loan" skills/skills/prospect-intel/references/bridging-vs-developer.md` → 0 hits.
- [ ] **Step 3:** Commit: `git commit -am "[skills] rename deal-type taxonomy to canonical terms"`

### Task 2.2: Create the deal-size band-fallback reference

**Files:** Create `skills/shared-references/deal-type-size-bands.md`

- [ ] **Step 1:** Write the reference with: the derivation method (units × regional avg sale value → indicative GDV → loan at typical LTGDV; or sum of outstanding charge sizes), the confidence rubric, the "based on X" provenance requirement, and the coarse fallback bands per deal type (New development £2–50m, Bridging £0.5–15m, Existing asset £2–30m). State that a range + confidence + basis line is mandatory and a naked number is forbidden.
- [ ] **Step 2:** Commit: `git add skills/shared-references/deal-type-size-bands.md && git commit -m "[skills] add deal-type size-band reference"`

### Task 2.3: Make deal-type/size/flags required in the report template

**Files:** Modify `skills/skills/prospect-intel/references/intel-report-template.md`

- [ ] **Step 1:** Update the "Recommended approach" section spec so it MUST contain: canonical deal type + confidence + rationale; deal-size range + confidence + "based on X" (referencing `shared-references/deal-type-size-bands.md`). Make section 9 (Gaps) explicitly the source of the UI flag chips.
- [ ] **Step 2:** Commit: `git commit -am "[skills] require deal-type + deal-size + flags in intel report"`

### Task 2.4: Update SKILL.md — canonical terms + set `researched` on completion

**Files:** Modify `skills/skills/prospect-intel/SKILL.md`

- [ ] **Step 1:** In step 5 (classify) and the Outputs section, replace `development_finance`/`term_loan` with the canonical terms and reference `bridging-vs-developer.md` + `deal-type-size-bands.md`.
- [ ] **Step 2:** Add to step 12 (Return): after `skillRun.complete`, call `prospect.transitionState({ clientId, newState: "researched" })` IF the prospect has no later state yet (do not downgrade a prospect already in drafted/active/etc.). Update the Outputs "what it does not do" line that currently says it never sets prospectState, to: "sets `researched` on completion; later transitions are operator-driven."
- [ ] **Step 3:** Verify: `grep -nE "development_finance|term_loan" skills/skills/prospect-intel/SKILL.md` → 0 hits; `grep -n "researched" skills/skills/prospect-intel/SKILL.md` → ≥1.
- [ ] **Step 4:** Commit: `git commit -am "[skills] prospect-intel: canonical terms + set researched on completion"`

### Task 2.5: Reflect the enum change in CATALOGUE.md

**Files:** Modify `skills/CATALOGUE.md`

- [ ] **Step 1:** Update the `prospect.transitionState` row to list `researched` as the first state in the 9-state machine.
- [ ] **Step 2:** Commit: `git commit -am "[skills] CATALOGUE: add researched to transitionState states"`

---

## Phase 3 — Cadence: always draft + contact flag

### Task 3.1: Allow a contactless held draft on cadences

**Files:** Modify `convex/schema.ts` (cadences table), `convex/cadences.ts` (`createInternal` + the public `create`)

- [ ] **Step 1:** In the `cadences` table schema, make `contactId` optional (`v.optional(v.id("contacts"))`) and add `packageApprovalStatus` value `"needs_contact"` to its union if it is an enum (else it is a free string — no change). Add `needsContact: v.optional(v.boolean())`.
- [ ] **Step 2:** In `cadences.ts` `createInternal`, change `contactId` arg to `v.optional(v.id("contacts"))`; when absent, set `isActive: false`, `packageApprovalStatus: "needs_contact"`, `needsContact: true`.
- [ ] **Step 3:** Locate the fire-time guard (search `convex/` for where the dispatcher reads cadences / `emailStatus`); confirm a row with `isActive: false` / `needs_contact` is already skipped (it is — dispatcher fires only `isActive` + approved). Add an assertion comment; no behavioural change needed if confirmed.
- [ ] **Step 4:** Deploy + verify: `npx convex dev --once` → no schema error. Then in the Convex dashboard (or a scratch `internalMutation`), create a contactless cadence row and confirm it persists with `needsContact: true`, `isActive: false`.
- [ ] **Step 5:** Commit: `git add convex/schema.ts convex/cadences.ts && git commit -m "[app] cadences: support contactless held drafts (needs_contact)"`

### Task 3.2: prospect-intel always drafts; flags the contact

**Files:** Modify `skills/skills/prospect-intel/SKILL.md` (step 11 + Cadence package section)

- [ ] **Step 1:** Rewrite step 11 so it ALWAYS composes the 4-touch package. If a verified contact email exists → create cadence rows as today (pending). If not → create the rows contactless (`needs_contact`) so the drafts are reviewable, and record a `no_contact` gap. Remove the "without an email the cadence package CANNOT be created — stop" instruction.
- [ ] **Step 2:** Verify: `grep -n "needs_contact\|always" skills/skills/prospect-intel/SKILL.md` → present; the old "CANNOT be created" line gone.
- [ ] **Step 3:** Commit: `git commit -am "[skills] prospect-intel: always draft cadence, flag missing contact"`

---

## Phase 4 — Prospects UI (two tabs)

> React tasks follow the existing component patterns in `src/components/prospects/sections/CandidatesSection.tsx` and `StatusSection.tsx` (styling via `useColors()`, `useQuery(api.x as any, {})`, row → `router.push`). Verify each via `npx next build` + reloading `/prospects` in the running dev app.

### Task 4.1: Two-tab container

**Files:** Rewrite `src/app/(desktop)/prospects/page.tsx`; Create `src/components/prospects/tabs2/NewTab.tsx`, `ProspectsTab.tsx`

- [ ] **Step 1:** Create `NewTab.tsx` — move the table body of today's `CandidatesSection` here (the `companies.listUnprocessed` query + the table), minus the `StatusSection` wrapper.
- [ ] **Step 2:** Create `ProspectsTab.tsx` — see Task 4.2 for its body (build that first, then wire here).
- [ ] **Step 3:** Rewrite `page.tsx` to a tabbed shell: local `useState<"new" | "prospects">`, a tab bar with counts (`New` = `companies.listUnprocessed` length; `Prospects` = `clients.list` filtered to `status==="prospect" && prospectState`), rendering `<NewTab />` or `<ProspectsTab />`. Keep `UpcomingMeetingsSection` + `RepliesAwaitingTriageSection` above the tabs (they are cross-cutting morning-triage, not pipeline rungs).
- [ ] **Step 4:** Verify: `npx next build` passes; `/prospects` shows two tabs.
- [ ] **Step 5:** Commit: `git add -A src/app/\(desktop\)/prospects src/components/prospects/tabs2 && git commit -m "[app] prospects: two-tab shell (New / Prospects)"`

### Task 4.2: Prospects ladder table

**Files:** `src/components/prospects/tabs2/ProspectsTab.tsx`

- [ ] **Step 1:** Query `api.clients.list({})`; filter to `status==="prospect" && prospectState`. For each, derive the rung via `rungFor(c.prospectState)` and flags via `computeProspectFlags`. Render a table with columns: Company, Deal type (`c.dealType` once intel sets it; "—" otherwise), Est. size (`c.dealSizeRange` or "—"), Status (rung label), Emails sent (count of fired cadences — from a `cadences.countFiredByClient` query, or "—" for now), Last reply (`c.lastReplyAt` or "—"), Flags (chips from `computeProspectFlags`). Group rows by `rung.order`.
- [ ] **Step 2:** Row click → `router.push(/prospects/${c._id})`.
- [ ] **Step 3:** Verify: build passes; Homes by Carlton appears under "Researched" with a "No contact" flag chip.
- [ ] **Step 4:** Commit: `git commit -am "[app] prospects: ladder table in Prospects tab"`

> Note: `dealType` / `dealSizeRange` / `lastReplyAt` as `clients` columns are written by Phase 2's intel + the reply flow. If not yet present on the row, render "—"; do not block. A follow-up can add `clients.setProspectFacts` fields for `dealType` + `dealSizeRange` (extend Task 2.4 if you want them populated immediately).

### Task 4.3: Retire ResearchedSection

**Files:** Delete `src/components/prospects/sections/ResearchedSection.tsx`; remove its import/usage (already gone from `page.tsx` after 4.1 rewrite)

- [ ] **Step 1:** `git rm src/components/prospects/sections/ResearchedSection.tsx`
- [ ] **Step 2:** `grep -rn "ResearchedSection" src` → 0 hits.
- [ ] **Step 3:** Verify: `npx next build` passes.
- [ ] **Step 4:** Commit: `git commit -m "[app] retire ResearchedSection (researched now a real ladder rung)"`

### Task 4.4: Detail Overview flag banner

**Files:** Modify `src/components/prospects/tabs/OverviewTab.tsx`

- [ ] **Step 1:** At the top of the Overview tab, render a banner from `computeProspectFlags(client, latestIntelRun)`: green "All found" when only `all_clear`, else amber "N items need attention" listing the warn/info chips, with the relevant action (e.g. an "Add contact" affordance when `no_contact`).
- [ ] **Step 2:** Verify: build passes; Homes by Carlton's Overview shows the amber "no contact" banner.
- [ ] **Step 3:** Commit: `git commit -am "[app] prospect overview: findings/flags banner"`

---

## Phase 5 — Promote to client

### Task 5.1: Promote-to-client button

**Files:** Modify `src/components/prospects/ProspectDetailHeader.tsx` (or `ProspectDetailAside.tsx`)

- [ ] **Step 1:** Add a "Promote to client" button, shown when `prospectState === "engaged"` (Meeting booked). On click, call a mutation wrapping `client.activate` (`useMutation(api.clients.activate ...)` if it exists as a public mutation; otherwise add a thin public `clients.activate` mutation that mirrors the MCP `client.activate`). On success, `router.push(/clients/${clientId})`.
- [ ] **Step 2:** Verify: build passes; on a Meeting-booked prospect the button appears; clicking promotes (status→active, prospectState→promoted) and the row leaves the Prospects tab.
- [ ] **Step 3:** Commit: `git commit -am "[app] prospects: one-click promote to client"`

---

## Phase 6 — Integration verification

### Task 6.1: End-to-end re-run + ship

- [ ] **Step 1:** `npx vitest run src/lib/prospects` → all pass.
- [ ] **Step 2:** `npx next build` → passes (110+/110+).
- [ ] **Step 3:** Re-run `prospect-intel` on Homes by Carlton (`kn73ymjftace7c9zdggqqd62mn857kmb`): confirm it now sets `prospectState: researched`, emits a deal type + deal-size range + flags, and a contactless cadence draft exists with a `no_contact` flag.
- [ ] **Step 4:** Confirm `/prospects` → Prospects tab → Homes by Carlton under "Researched" with the flag chip; Overview shows the banner.
- [ ] **Step 5:** Open PR: `gh pr create --base main --title "[both] Prospect lifecycle redesign" --body "Implements docs/superpowers/specs/2026-05-28-prospect-lifecycle-redesign-design.md"`

---

## Self-review

- **Spec coverage:** Thread 1 → Tasks 1.1–1.2; Thread 2 → Tasks 1.3, 2.1–2.5, 4.4; Thread 3 → Tasks 3.1–3.2; Thread 4 → Tasks 4.1–4.4; Thread 5 → 5.1. All five threads + all six acceptance criteria covered.
- **Open dependency:** the Prospects table columns `dealType` / `dealSizeRange` need to be persisted on the `clients` row to display non-"—" values. Task 4.2's note flags this; populating them is an optional extension of Task 2.4 (`setProspectFacts` gains `dealType` + `dealSizeRange`), called out rather than hidden.
- **Type consistency:** `rungFor` / `computeProspectFlags` signatures are used consistently in Tasks 4.2 and 4.4.
