# cold-reachout

The **action** command for the cold pipeline: `/cold-reachout N` queues N
net-new first touches end to end — select from HubSpot Weekly Targets →
**gate 1** (operator approves the list) → full prospect intel → template-true
drafting → queue with staggered send-window times → **gate 2** (operator
approves the packages) → touches auto-send at their scheduled moments.

This is the orchestrator over two existing hardened skills: `prospect-intel`
(the research chain) and `outreach-draft` (template-mapped drafting + package
creation). It adds the selection step, the two gates, the send-window
scheduling, and the batch choreography. Spec: `../../docs/01-cold-reachout.md`
(Alex) + `../../docs/05-response-and-build-plan.md` Phase 1 (Kristian).

**v1 (2026-07-15):** Phase 1 build. Stage moves are PROPOSED, not executed
(HubSpot write-back is Phase 3).

## Operator hand-holding

The full contract in `../outreach-triage/SKILL.md` § "Operator hand-holding"
applies verbatim: plain English, no field names or raw JSON, numbered items,
say exactly what a yes does before asking, "skip / not sure" always offered,
confirm after acting, recap at the end.

## Trigger

- **`/cold-reachout N`** — N is how many prospects to take on this session
  (operator's time budget). Default 10 when omitted.
- Operator asks in a `01-reach-out-cold` workspace chat: "queue up some cold
  outreach", "let's do 5 reach-outs".

## Inputs

- `n` (from `$ARGUMENTS`): batch size. Default 10, cap 25 per session.

## Dedup

None on the skill run (multiple sessions per day are legitimate). Dedup
happens **per prospect** in the selection step below.

## The two gates (non-negotiable)

1. **Gate 1 — approve the list.** Nothing is researched, created, or drafted
   until the operator approves which of the selected N proceed. They may drop
   any.
2. **Gate 2 — approve the packages.** Nothing sends until the operator
   approves the drafted packages, itemised with recipient, subject, template
   and the exact scheduled send time. Approval means: touch 1 sends
   automatically at the shown time; follow-ups on their dates.

## High-level workflow

1. **`skillRun.start`** — `skillName: "cold-reachout"`, `input: {n}`.

2. **Select.** `deal.listByStage({pipelineId: "1755919552", stageId:
   "2380814543", limit: 3×n})` — the mirrored Weekly Targets stage. Filter,
   reporting every exclusion with its reason:
   - `alreadyWorked: true` (linked prospect has send evidence) → belongs to
     `/cold-followup`, skip.
   - `appClient.pipelineStage` beyond `cold_outreach` → already progressed,
     skip.
   - Duplicate of a row already in this session's list (same Companies House
     number, else same normalised name) → skip.
   - `linkedContactCount: 0` / no `contactWithEmail` → keep, but flag "needs
     a contact found" on the gate-1 line (intel step 8 / Apollo will try).
   Take the first n survivors. If fewer than n survive, say so — never pad
   with skipped rows.

3. **Gate 1.** Numbered list, one line each: company · what we know (region /
   last activity from the deal) · contact status · the HubSpot link. Ask
   which proceed. Wait for the explicit yes.

4. **Ensure an app prospect per approved row.** If `appClient` is null:
   `client.create({promoteFromCompanyId})` when a company row exists, else
   `client.create({name})`. Never create a duplicate — re-check by Companies
   House number / name first.

5. **Intel.** Run the **`prospect-intel`** skill per prospect (its own
   SKILL.md governs: CH profile → group map → officers → charges / lender DNA
   → `companies.getLenderTierConflict` → knowledge items). Hard rules
   surfaced immediately, not at the end:
   - **Tier-1 conflict → park the prospect** (tell the operator, drop from
     this batch unless they explicitly override).
   - **Verified contact email** (Apollo `verified` only) — flag
     website-generic inboxes and dead domains; an emailless prospect proceeds
     only as a held needs-contact draft, never a blind send.

6. **Draft.** Run the **`outreach-draft`** skill per prospect. It selects the
   template by lender DNA per
   `../outreach-draft/references/template-mapped-reachout.md` (Housebuilder 2
   default · High Street Bank Client · Large Housebuilder · High LTPP ·
   Contractor), fills the hook from the hook ladder, and creates the 4-touch
   package. **Additionally (Phase 2 metrics substrate): when creating each
   touch, include `dynamicVars: {templateKey: "<template name>", hookRung:
   "<rung used>"}` in `preDraftedTouch`** — this is what makes
   response-rate-by-template reportable later. Never use the generic
   `outreach.draftFreshEmail` for cold sends.

7. **Schedule into the send window.** Compute per-package touch-1 times in
   the next good window and apply via `cadence.update({cadenceId,
   nextDueAt})`:
   - **Primary window: Friday 06:30–08:00 UK time. Secondary: Saturday
     06:30–09:00.** If today is already past this week's windows, use next
     Friday.
   - **Randomise within the window** — pick scattered minutes (e.g. 06:37,
     06:51, 07:14…), at least 3 minutes apart, never the same instant. Work
     in Europe/London and convert to UTC ISO before writing (UK summer =
     UTC+1: 06:30 London = 05:30Z).
   - Follow-ups keep their preset offsets relative to touch 1
     (`cadence.applyPresetSchedule` re-anchors if needed).
   - The dispatcher ticks every 5 minutes and fires each touch when its
     moment arrives — a future-dated touch 1 does NOT send on approval; it
     sends in the window. Say this to the operator.

8. **Gate 2.** Itemise every package: recipient (name + email) · subject ·
   template used · touch-1 send time (in plain UK time) · follow-up dates.
   State: "If you say yes, these N emails send automatically at the times
   shown — nothing goes out before then." On the explicit yes →
   `cadence.approvePackageBatch`. Report per-item results, including any
   no-contact guard failures (those become held drafts to fix).

9. **Propose the stage moves (do not execute).** For each approved package,
   list the HubSpot move due once its touch 1 fires: Weekly Targets →
   Contacted 1 (`2386002123`). Until the Phase 3 write-back exists the
   operator clicks these in HubSpot; `/cold-reachout-triage` re-checks
   hygiene later.

10. **`skillRun.complete`** — brief: selected / skipped (with reasons) /
    parked (tier-1, no-email) / approved / scheduled window, plus `gaps[]`
    (e.g. Weekly Targets rows that arrived unverified — the Rayn hand-off
    signal).

## Guardrails specific to this command

- Two gates, both the operator's. No research before gate 1; no send path
  before gate 2.
- Tier-1 lender gate and **no forward funding** in any draft (RockCap
  arranges development finance + debt & equity only).
- Templates from the canon, voice per
  `../../shared-references/rockcap-outreach-voice.md` — subject
  `"{Company} Enquiry"` (never "Inquiry"), no em dashes, UK spelling, sign as
  Alex.
- No autonomous HubSpot writes or stage moves — propose only (Phase 3 adds
  the approval-gated write path).

## Tool dependencies

`deal.listByStage` (selection) · `client.create` / `prospect.import` (app
row) · the `prospect-intel` skill's chain (`companies.syncCompaniesHouse`,
`companies.mapGroup`, `companies.getOfficers`, `apollo.findEmail`,
`companies.getLenderTierConflict`, `intelligence.*`) · the `outreach-draft`
skill's chain (`cadence.create`, `contact.create`) · `cadence.update` /
`cadence.applyPresetSchedule` (window scheduling) ·
`cadence.approvePackageBatch` (gate 2) · `skillRun.start` /
`skillRun.complete`.

## What goes wrong

- **Selecting already-worked prospects.** `alreadyWorked` exists precisely so
  a cold-reachout never re-touches someone mid-cadence or already contacted —
  those are `/cold-followup`'s job. Skipping silently is also wrong: report
  every skip with its reason (that's the Rayn hand-off feedback loop).
- **Stale mirror.** Selection reads the HubSpot mirror, not live HubSpot. If
  the list looks obviously out of date (deals the operator knows moved), say
  so and suggest checking the sync before burning a session on it.
- **Past-due touch 1 at gate 2.** If a computed send time has already passed
  when the operator approves (long session), approval fires it within
  minutes. Recompute times just before gate 2 and re-state them.
- **Timezone slips.** 06:30 in the doc means London wall-clock. Convert to
  UTC before writing timestamps; in summer 06:30 London = 05:30Z. Getting
  this wrong sends at 3am or 9am — both defeat the window.
- **Emailless sends.** A prospect without a verified email must end the
  session as a held needs-contact draft or a parked row — never approved
  into a package that will 3-strike fail at fire time.
- **Skill run left open.** Abandoned mid-batch → `skillRun.complete` with
  `complete_with_gaps`, listing exactly where it stopped.

## Voice

Per `CONVENTIONS.md` and the hand-holding contract: the operator sees
companies and decisions, not plumbing.

## Outputs

1. A `skillRun` row (`skillName: "cold-reachout"`) with the full account:
   selected / skipped-with-reasons / parked / approved / send window.
2. Per approved prospect: the `clients` row (created if net-new), the
   `prospect-intel` outputs (its SKILL.md governs), and a 4-touch cadence
   package with `templateKey` + `hookRung` stamped in each touch's
   `dynamicVars`, touch 1 scheduled into the send window.
3. Approved packages flipped via `cadence.approvePackageBatch` — touches then
   send themselves at their scheduled moments.
4. A proposed-stage-moves list (Weekly Targets → Contacted 1) for the
   operator to action in HubSpot until the Phase 3 write-back lands.
5. `gaps[]` on `skillRun.complete` — unverified Weekly Targets rows, tier-1
   parks, emailless prospects (the upstream hand-off feedback).
