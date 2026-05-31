# outreach-draft

Lifecycle step 1.5. Composes the cold-outreach cadence package for a prospect the operator has **accepted for outreach**. This is the second half of what `prospect-intel` used to do in one pass: `prospect-intel` now produces intel only, and the operator clicks "Accept — ready for outreach" (sets `outreachReadyAt`) before this skill drafts anything. See `../prospect-pipeline-gates.md` for the four-gate flow.

**Why this is a separate skill (2026-05-30):** the old combined flow drafted a package only when Apollo happened to return an email, so the initial batch was non-deterministic. Splitting drafting into an explicitly-triggered, gated skill makes outreach deliberate and batchable, and keeps the initial intel run uniform.

**The invariant is unchanged:** no autonomous outreach. Every touch lands as a `pending` cadence row that the operator approves via the existing Approve & Schedule button before anything fires.

## Trigger

Operator-invoked, two forms:

- **Single:** "draft outreach for {prospect}" / "draft the cadence for {company}".
- **Batch:** "draft all outreach for ready companies" / "draft outreach for everyone marked ready".

The batch form enumerates the ready pool via `client.listOutreachReady` and runs the per-prospect workflow for each.

## Inputs

Single:

- `clientId` (Convex id of the prospect clients row) — required for the single form. If only a name is given, resolve it via `client.list` first.

Batch:

- No input. The pool is `client.listOutreachReady()` — prospects with `outreachReadyAt` set AND still at `prospectState: "researched"` (not yet drafted). Drafted prospects drop out automatically, so re-running never double-drafts.

## Dedup

- **dedupKey**: the `clientId`.
- **dedupWindowDays**: 3.
- **On `status: "duplicate_found"`**: a package was drafted for this prospect very recently. Surface the prior package + ask "re-draft or open prior?". Default open prior.

## Cadence package

This skill produces a **cadence package**: the initial outreach plus 3 follow-ups, all pre-drafted at queue time, with sequential send dates.

**Why upfront drafting:** the follow-ups reference the initial pitch and intel. Drafting them at queue time keeps the narrative coherent (each follow-up builds on the prior); deferring composition to fire-time loses that thread. The operator approves the full package once (via the `/prospects/[id]` Approve & Schedule button, which fires `cadences.approvePackage`).

**Package shape (4 rows in `cadences`, all sharing a `packageId`):**

| Order | Type | nextDueAt offset from now | Content angle |
|---|---|---|---|
| 1 | `prospect_followup` | +0 days (immediate, post-approval) | The cold outreach itself (drawn from template-mapped-reachout reference) |
| 2 | `prospect_followup` | +5 days | Soft nudge referencing the initial; new angle (one fresh piece of intel from the report) |
| 3 | `prospect_followup` | +12 days | Stronger close referencing a specific scheme or charge filing |
| 4 | `prospect_followup` | +30 days | Final touch with a "should I stop reaching out?" close |

**Implementation:** after composing the four messages, call `cadence.create` four times (one per row). Same `packageId` (a UUID generated at run start). `packageOrder` 1-4. Each row carries `preDraftedTouch: { subject, bodyText, bodyHtml }`. `sourceSkillRunId` set to the current runId. `packageApprovalStatus: "pending"` by default (single-gate approval model).

**Contactless held drafts (Phase 3):** the package is composed and queued **whether or not** a verified contact email exists. When one exists, pass `contactId` and the rows land `pending`. When none exists, **omit `contactId`** on all four calls: `cadence.create` then forces the rows to `isActive: false` + `packageApprovalStatus: "needs_contact"` + `needsContact: true` — a held draft that is reviewable on the board but that the dispatcher will never fire (it polls only active + approved rows). Record a `no_contact` gap in that case. Marking a prospect ready does NOT require an email; the drafts are held until a contact is attached, never blocked.

If a reply arrives at any point, the cadence engine cancels all remaining package members automatically (via the by_contact_active index lookup). No skill action needed.

## High-level workflow (per prospect)

1. **Start the run.** `skillRun.start({ skillName: "outreach-draft", input: { clientId }, dedupKey: clientId, dedupWindowDays: 3 })`. Use the returned `runId`.

2. **Require the accept gate.** Read the prospect (`client.get` / `prospect.getDeepContext`). If `outreachReadyAt` is NOT set, **stop** and say so: "{prospect} is not marked ready for outreach — accept the intel on the prospect page first." Never draft for an un-accepted prospect. (In the batch form this never happens — the pool query already filters on it — but the single form must check.)

3. **Load the intel.** Pull the latest `prospect-intel` skillRun's `intelMarkdown` (via `prospect.getDeepContext` → `latestIntelRun`) and the structured facts (`dealType`, `dealSizeRange`, lender DNA, schemes). This is the evidence the hooks draw from.

4. **Lender-tier gate.** Call `companies.getLenderTierConflict({clientId})` (source of truth `../../shared-references/lender-tiers.md`).
   - `action: "park"` (Tier 1 / favourite lender such as Quantum) → **do NOT draft**. This is a stop condition; record why and skip this prospect (it stays out of the cadence board, and the prospect detail raises a "Parked — Tier 1 lender" flag). In the batch summary, mark it `parked`.
   - `action: "soften"` (Tier 2) → force the hook to the generic-market rung; avoid any scheme- or charge-specific reference.
   - otherwise → proceed normally.

5. **Other stop conditions.** Skip drafting (and say why) when: the company is dissolved, or a recent outbound send is still awaiting a reply (check `touchpoints` for outbound contact in the last 90 days). A missing contact is NOT a stop — it produces a held `needs_contact` draft (step 7).

6. **Compose the four touches.** Load `references/template-mapped-reachout.md`, select the canonical template by lender DNA, write the touch-1 hook via the `compose-outreach-hook` sub-skill (`../../sub-skills/compose-outreach-hook.md`) and the hook ladder (`../../shared-references/hook-ladder.md`), in Alex's voice (`../../shared-references/rockcap-outreach-voice.md`). Compose all four touches per the `## Cadence package` section above. Geographic hooks draw on `../../shared-references/rockcap-regional-activity.md` + `sender-geography.md`.

7. **Queue the package.** Call `cadence.create` four times (same `packageId`, `packageOrder` 1-4). The contact situation decides HOW the rows land — not WHETHER they are created:
   - **Verified contact email exists** → pass `contactId` on every call. Rows land `packageApprovalStatus: "pending"`.
   - **No usable contact email** (Apollo `unavailable`/`not found`, or `emailStatus` blocks send) → **omit `contactId`** on every call. Rows land contactless (`isActive: false` + `needs_contact` + `needsContact: true`). Record a `no_contact` gap. Do NOT stop — the drafts are the deliverable.

   **Cadence email guard:** when you pass a `contactId`, `cadence.create` refuses a contact with no email OR `emailStatus` in [questionable, spam_trap, invalid, bounced]. On that error, either fix the contact (`apollo.findEmail` + `contact.update`, or pick a different contact) and retry, or omit `contactId` to land a held `needs_contact` draft. The guard does not apply when `contactId` is omitted.

8. **Advance the state.** Call `prospect.transitionState({ clientId, newState: "drafted" })` so the prospect leaves the ready-to-draft pool (and `client.listOutreachReady` no longer returns it). Guard against downgrade as usual — only advance from `researched`.

9. **Complete the run.** `skillRun.complete` with `status` (`complete` or `complete_with_gaps`), a one-paragraph `brief`, `linkedClientId`, the created cadence ids, and any `gaps` (e.g. `no_contact`).

## Batch form

1. `client.listOutreachReady()` → the ready-but-not-drafted pool.
2. For each prospect, run the per-prospect workflow above.
3. Return a one-line-per-prospect summary: `{name}: drafted (4 touches, pending) | drafted (contactless, needs_contact) | parked (Tier 1 {lender}) | skipped ({reason})`.
4. Note the totals (drafted / contactless / parked / skipped) at the end.

## Outputs

- 4 `cadences` rows per drafted prospect (same `packageId`, `pending` approval; or held `needs_contact` when contactless). Never sent — the operator approves via the existing Approve & Schedule button.
- `prospectState: "drafted"` on each drafted prospect.
- Gaps where surfaced (`no_contact`, etc.).

What it does not do:

- Does not send email or contact the prospect through any channel.
- Does not run intel (that is `prospect-intel`) and does not create contacts/companies/projects.
- Does not draft for a prospect that is not marked ready (`outreachReadyAt` unset) — it stops.
- Does not bypass the approval gate. Every touch is a `pending` cadence.

## Tool dependencies

- `client.get` / `prospect.getDeepContext` — read the prospect, the accept flag, and the intel.
- `client.listOutreachReady` — the batch pool.
- `companies.getLenderTierConflict` — the Tier 1 park / Tier 2 soften gate (step 4).
- `contact.getByClient`, `contact.update` — resolve / fix the outreach contact.
- `apollo.findEmail` — repair a missing/blocked contact email.
- `cadence.create` — queue the 4 touches (step 7).
- `touchpoint.getByClient` — the recent-send stop check (step 5).
- `prospect.transitionState` — advance to `drafted` (step 8).
- `skillRun.start` / `skillRun.complete` — run bookkeeping.

## Style rules

All voice and output rules from `../../CONVENTIONS.md` apply. The touches are in Alex Lundberg's voice (`../../shared-references/rockcap-outreach-voice.md`): no em dashes, UK English, no rule-of-three, the canonical opener skeleton and sign-off. Every scheme- or charge-specific hook cites the evidence it draws from (charge ID, planning ref, scheme name) so the operator can verify before approving.

## References

Loaded on demand during the workflow (all moved here from `prospect-intel` on 2026-05-30):

- `references/template-mapped-reachout.md` — the five canonical proven templates + Lender-DNA-to-template selection + the RCF check; defers tone to the outreach voice reference. (Step 6.)
- `../../shared-references/rockcap-outreach-voice.md` — canonical outreach voice (Alex Lundberg): opener skeleton, sign-off, verbatim quirks, hard rules. (Step 6.)
- `../../shared-references/hook-ladder.md` — the 10 ranked hook types + the data each needs; fills the touch-1 hook. (Step 6.)
- `../../shared-references/lender-tiers.md` — park (Tier 1) / soften (Tier 2) lender gate, checked before drafting. (Step 4.)
- `../../shared-references/rockcap-regional-activity.md` and `sender-geography.md` — geographic hook data (rungs 4 and 3). (Step 6.)
- `../../sub-skills/compose-outreach-hook.md` — selects and writes the touch-1 hook line from the prospect's intel. (Step 6.)
