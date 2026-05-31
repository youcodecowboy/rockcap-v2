# Prospect-intel: outreach gating + standardized output — Design

- **Date:** 2026-05-30
- **Status:** Approved design (pre-implementation)
- **Owner:** Alex Lundberg (operator) + Claude Code
- **Scope:** `model-testing-app/` (Convex + Next) and `skills/`

## Problem

`prospect-intel` output is inconsistent run-to-run, most visibly in whether the cold-outreach cadence package gets drafted:

| Prospect | Cadence rows | Apollo email |
|---|---|---|
| Mccarthy | 4 (full package) | yes |
| Mackenzie Miller | 4 (full package) | yes |
| Opulence | 0 | no |
| Signia | 0 | no |

The variance tracks **whether Apollo returned an email**, not anything about the prospect. When an email existed, the run drafted the package; when it did not (Opulence, Signia), the run skipped outreach entirely — even though the skill's stated contract is to draft a held/contactless package regardless. So this is agent-driven non-determinism, not a per-client truth: the SKILL is long prose with conditional "if appropriate" branches, and each run leans on agent judgment. Operators want a predictable initial batch and an explicit gate before any outreach.

## Goals

1. Make the initial `prospect-intel` batch **intel-only** and uniform in shape (a Definition-of-Done manifest every run).
2. Add an explicit operator **"accept → ready for outreach"** gate (a lightweight internal flag).
3. Make **"draft outreach for ready companies"** a clean, batchable trigger for a later session.
4. **Document the gates** so the operator agent understands the flow.
5. Keep the invariant: **no autonomous outreach** — drafts always route through the existing approval gate.

## Non-goals

- No change to the cadence dispatcher / approval / fire machinery.
- No new prospect pipeline **state** and no HubSpot lifecycle change (the readiness flag is internal).
- Nothing is auto-sent.
- No structured/machine-checkable manifest field yet (a report section is enough for now).

## Design

### 1. Data model (`clients` table) — additive
- `outreachReadyAt?: string` (ISO), `outreachReadyBy?: Id<"users">`. Optional columns; no migration.
- Public mutations `clients.markOutreachReady({clientId})` and `clients.clearOutreachReady({clientId})` — set/clear the flag + actor + `updatedAt`. Idempotent.

### 2. Accept gate (UI)
- A **sticky footer action bar** on `/prospects/[prospectId]` (visible across tabs — "in the bottom"). Pre-accept: a primary **"Accept intel — ready for outreach"** button. Post-accept: a green **"Reviewed ✓ ready for outreach · {date} · {operator}"** pill with an **"Unmark"** link.
- The `/prospects` board gains a **"Ready for outreach"** filter (reads `outreachReadyAt`) so the ready pool is visible at a glance.
- Guard: the button is enabled only when a completed `prospect-intel` run exists for the prospect (you accept intel that exists). `markOutreachReady` also rejects clients with no intel run.

### 3. `prospect-intel` → intel-only + Definition-of-Done manifest
- **Step 11 no longer drafts or queues the cadence package.** It is replaced with: outreach is gated — do not draft in the initial run; it is produced by the `outreach-draft` skill after the operator marks the prospect ready. The lender-tier gate moves to `outreach-draft`.
- **Step 12 emits a `## Definition of Done` section** at the end of `intelMarkdown` (no schema change). A fixed checklist, every run, each line `DONE` or `SKIPPED — reason`:
  - onboarded (clients row + CH number) · CH synced + group walked · structure graph + chart · **contact per key person** (+ Apollo status each) · 9 report sections present · per-scheme Track Record rows · lender DNA from the group book · `dealType` + `dealSizeRange` · gaps → chips · final line: **`Outreach: not drafted — pending operator accept (mark "Ready for outreach")`**.
- `prospectState` stays `researched`. The contacts-per-key-person rule (v3.1) and the structure chart remain mandatory manifest lines.

### 4. `outreach-draft` skill (NEW — lifecycle step 1.5)
The current step-11 logic and its references move here largely intact: `template-mapped-reachout.md`, `rockcap-outreach-voice.md`, `hook-ladder.md`, `lender-tiers.md`, `compose-outreach-hook.md`, regional/sender-geography refs.
- **Trigger:** "draft outreach for {prospect}" (single) OR "draft all outreach for ready companies" (batch).
- **Per prospect:** `skillRun.start` → require `outreachReadyAt` is set (else stop and say so) → lender-tier gate (park Tier-1 / soften Tier-2) → compose the 4 touches in Alex's voice → `cadence.create` ×4 (same `packageId`, `pending` approval; held/contactless + `no_contact` gap when there is no verified email, per the existing Phase-3 rule) → `prospect.transitionState({newState: "drafted"})` → `skillRun.complete`.
- **Batch:** enumerate via `clients.listOutreachReady`, run per prospect, return a one-line-per-prospect summary.
- **Stop conditions unchanged:** parked Tier-1 lender, dissolved company, or a recent outbound send still awaiting reply.

### 5. Ready query + batch trigger
- New query `clients.listOutreachReady()` → prospects where `outreachReadyAt` is set AND not yet drafted (no cadence package / `prospectState` still `researched`). Exposed as a dedicated MCP tool (`client.listOutreachReady`) — this is what "draft all outreach for ready companies" enumerates; drafted prospects drop out of the pool automatically.
- Additionally, `outreachReadyAt` + `outreachReadyBy` are surfaced on the existing `client.list` and `prospect.getDeepContext` payloads so the UI badge, the board filter, and the agent all read the same flag from data already in scope.

### 6. Operator-agent gates guide (NEW doc)
`skills/skills/prospect-pipeline-gates.md` — a step-by-step guide written for the operator agent, covering the four gates end to end:
1. **Run intel** — `prospect-intel` (intel-only) → `researched`, ends with the Definition-of-Done manifest whose last line is the pending accept.
2. **Accept gate** — operator reviews the Intel tab and clicks "Accept — ready for outreach" → `outreachReadyAt` set. *Why:* a human blesses the intel before any outreach is composed; nothing is drafted until this.
3. **Draft gate** — operator says "draft outreach for ready companies" → `outreach-draft` (batch) → `drafted` (pending approval). *Why:* outreach is deliberate and batched, not a side effect of research.
4. **Approve & schedule** — existing Approve button → cadence fires. *Why:* the trust gate; no autonomous send.

It states what triggers each gate, what state each leaves, and the invariant (no autonomous outreach). Referenced from `skills/skills/README.md` and CLAUDE.md's "Where to look first".

### 7. Docs to update (same change)
- `skills/CATALOGUE.md`: new mutations (`markOutreachReady`/`clearOutreachReady`/`listOutreachReady`) + the `outreach-draft` skill and its tools.
- `skills/skills/README.md`: add the `outreach-draft` row to the status table + lifecycle map; note `prospect-intel` is now intel-only + manifest; link the gates guide.

## Data flow

`prospect-intel` (intel-only) → intel + manifest → `researched` (outreach pending) → operator clicks **Accept** → `outreachReadyAt` set (badge + board filter) → later session: "draft all outreach for ready companies" → `outreach-draft` (batch) → `drafted` (pending approval) → operator **Approve & Schedule** → cadence fires (existing machinery, unchanged).

## Edge cases

- **No verified email** → held/contactless package + `no_contact` gap (existing Phase-3 behaviour); marking ready does NOT require an email.
- **Mark ready before intel exists** → button disabled; mutation guards reject.
- **Re-run batch after some are drafted** → drafted prospects are excluded by `listOutreachReady` (no double-draft).
- **Lender-tier park (Tier-1)** → `outreach-draft` skips that prospect and records why; it stays out of the cadence board.
- **Unmark after drafting** → "unmark" is meaningful only pre-draft; once `drafted`, readiness is moot (the prospect has left the pool).

## Testing

- `npx next build` (from `model-testing-app/`) passes.
- Manual: mark a prospect ready → it appears in the board filter and in `listOutreachReady`; run the batch draft → 4 `cadences` rows per prospect + `prospectState: drafted`; a no-email prospect → held package + `no_contact` gap; a Tier-1 prospect → skipped with reason.

## Out of scope / future

- A structured, machine-asserted manifest field on the skillRun (report-section manifest is sufficient now).
- Promoting "ready for outreach" to a first-class pipeline state / HubSpot lifecycle stage (revisit if the flag proves useful).
