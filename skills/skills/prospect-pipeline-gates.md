# Prospect pipeline — the four gates

A guide for the operator agent. The prospecting flow from "we've spotted a developer" to "a cadence is firing" passes through four gates. Each gate has an explicit trigger, leaves the prospect in a known state, and (for the outward-facing ones) a human bless. The governing invariant: **no autonomous outreach** — nothing leaves the system until the operator approves it.

This flow was split into gates on 2026-05-30. Before, `prospect-intel` ran intel AND drafted outreach in one pass, and whether it drafted tracked whether Apollo happened to return an email — so the initial batch was non-deterministic. Splitting drafting out behind an explicit operator accept made the initial run uniform and outreach deliberate.

## The gates

### Gate 1 — Run intel
- **Trigger:** operator says "run prospect intel on {company}" → the `prospect-intel` skill.
- **What runs:** intel only. Companies House sync + group walk, structure chart, a contact per key person (with Apollo status), the 9-section report, per-scheme Track Record rows, lender DNA from the group book, `dealType` + `dealSizeRange`. **It does NOT draft outreach.**
- **Leaves:** `prospectState: "researched"`. The report ends with a `## Definition of Done` manifest whose last line is `Outreach: not drafted — pending operator accept`.
- **Why:** research is cheap and uniform; it should run the same way every time and not depend on whether a contact email was found.

### Gate 2 — Accept (the readiness bless)
- **Trigger:** the operator reviews the Intel tab on `/prospects/[id]` and clicks **"Accept — ready for outreach"** in the sticky footer. (Agent equivalent: `client.markOutreachReady` — use only when explicitly asked.)
- **What runs:** sets `outreachReadyAt` + `outreachReadyBy`. Nothing else. Guard: rejected (`no_completed_intel_run`) unless a completed `prospect-intel` run exists — you accept intel that exists.
- **Leaves:** `prospectState` unchanged (`researched`) + `outreachReadyAt` set. The prospect now appears under the `/prospects` board's "Ready for outreach" filter and in `client.listOutreachReady`.
- **Why:** a human blesses the intel before any outreach is composed. Nothing is drafted until this. The flag is internal — NOT a pipeline state and NOT a HubSpot lifecycle change. Reversible pre-draft via "Unmark" (`client.clearOutreachReady`).

### Gate 3 — Draft outreach
- **Trigger:** operator says "draft outreach for {prospect}" (single) or "draft all outreach for ready companies" (batch) → the `outreach-draft` skill.
- **What runs:** for each ready prospect — require `outreachReadyAt` is set, run the lender-tier gate (park Tier 1 / soften Tier 2), compose 4 touches in Alex's voice, `cadence.create` ×4 (same `packageId`, `pending`; held/contactless `needs_contact` when there is no verified email), then `prospect.transitionState({ newState: "drafted" })`. The batch form enumerates via `client.listOutreachReady` and returns a one-line-per-prospect summary; drafted prospects drop out of the pool, so re-running never double-drafts.
- **Leaves:** `prospectState: "drafted"`, 4 `pending` cadence rows. Parked (Tier 1) prospects are skipped with a reason and stay out of the board.
- **Why:** outreach is deliberate and batchable, not a side effect of research. The split is what makes "draft everything that's ready" a clean, repeatable operation.

### Gate 4 — Approve & schedule
- **Trigger:** the operator clicks the existing **Approve & Schedule** button on the prospect detail page (`cadences.approvePackage`).
- **What runs:** the package is approved; the dispatcher fires the touches on their scheduled dates (existing machinery, unchanged). A fire-time email guard still blocks any send to a contact without a valid, non-blocked email.
- **Leaves:** active cadence; state advances through `active` → `replied` → … via the cadence/reply machinery.
- **Why:** the trust gate. No autonomous send — a human approves before anything leaves the system. This does not change as autonomy increases.

### Gate 5 — Engaged (meeting booked → the semi-client zone)
- **Trigger:** a **meeting is booked** for the prospect (`meeting.create` / the web booking). Automatic.
- **What runs:** `meetings.create` advances `prospectState` forward to `engaged` (only from a pre-engagement active state — `researched` / `drafted` / `active` / `replied`; it never downgrades a `promoted` / `parked` / `lost` prospect, and no-ops if already engaged).
- **Leaves:** `prospectState: "engaged"`. The prospect is now a **semi-client**: it stays in the prospecting section but is actively worked — taking meetings, receiving files (the **Files tab** persists from the start), and optionally a project + appraisal extraction. There is no time limit; it stays `engaged` for as long as the work takes.
- **Why:** booking a meeting is the first hard signal of a live conversation. `engaged` gives that the-deal-is-real-but-not-yet-a-client phase a home, so features can flow without forcing a premature promotion.

### Gate 6 — Promote to client (operator judgment)
- **Trigger:** the operator clicks **Promote** on the prospect detail page (`client.activate`). **Manual only — never automatic.**
- **What runs:** `client.activate` sets `clients.status: "active"`, transitions `prospectState → "promoted"`, schedules the HubSpot lifecycle push. The prospect moves from the prospecting board to the clients board.
- **Leaves:** an active client.
- **Definition of promotion:** *a pure operator judgment call* — typically once a real document batch / signed mandate signals a genuine live deal, but it is the operator's decision, not a rule and not automated. A prospect can do real deal work (files, meetings, a project, extracted figures) as a semi-client **before** promotion; promotion is the deliberate "this is a client now" act, decoupled from doing the work. `deal-intake` may *recommend* promotion but must never fire it automatically.

## Data flow (one line)

`prospect-intel` (intel-only) → `researched` → operator **Accept** → `outreachReadyAt` → `outreach-draft` → `drafted` (4 pending cadences) → operator **Approve & Schedule** → `active` → `replied` → **meeting booked** → `engaged` (semi-client: files + meetings flow) → operator **Promote** (judgment) → `promoted` / active client.

## Edge cases

- **No verified email** → held/contactless package + `no_contact` gap (existing Phase-3 behaviour). Marking ready does NOT require an email.
- **Mark ready before intel exists** → the accept button is disabled and `markOutreachReady` rejects (`no_completed_intel_run`).
- **Re-run the batch after some are drafted** → drafted prospects are excluded by `listOutreachReady`; no double-draft.
- **Lender-tier park (Tier 1)** → `outreach-draft` skips that prospect and records why; it stays off the cadence board.
- **Unmark after drafting** → "Unmark" is meaningful only pre-draft. Once `drafted`, the prospect has left the ready pool and readiness is moot.

## Tools at a glance

| Gate | Operator action | Agent tool | State after |
|---|---|---|---|
| 1 Run intel | "run prospect intel on X" | `prospect-intel` skill | `researched` |
| 2 Accept | click "Accept — ready for outreach" | `client.markOutreachReady` | `researched` + `outreachReadyAt` |
| 3 Draft | "draft outreach for ready companies" | `outreach-draft` skill (`client.listOutreachReady`) | `drafted` (pending cadences) |
| 4 Approve | click "Approve & Schedule" | `cadences.approvePackage` | active cadence → `replied` |
| 5 Engaged | book a meeting (automatic) | `meeting.create` (auto-advances) | `engaged` (semi-client) |
| 6 Promote | click "Promote" (judgment) | `client.activate` | `promoted` / active client |
