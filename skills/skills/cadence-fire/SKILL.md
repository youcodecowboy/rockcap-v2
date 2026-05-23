# cadence-fire

The skill the cadence scheduling engine (BL-5.8) fires when a scheduled-touch event comes due. Handles all seven cadence types: prospect follow-ups, warm-lead chases, execution chasers, client check-ins, BDM relationship maintenance, monitoring asks, and lost-deal re-engagement.

## Runtime contract (v1.1, 2026-05-23)

The autonomy engine substrate is live: cadences table, 5-min dispatcher cron, Gmail push webhook (Pub/Sub setup pending), HubSpot sync sweep safety net, classify-reply-intent sub-skill, intent dispatch to four destinations.

**v1.1 supports both pre-drafted and dynamic-compose touches.**

- **Pre-drafted touches** (`preDraftedTouch` field populated): the dispatcher fires them directly. Used by skills that produce cadence packages (today: prospect-intel; coming: qualify-and-draft, lender-intel). Approval shape is the composed touch.

- **Dynamic-compose touches** (`preDraftedTouch` absent): the dispatcher calls `/api/cadence-compose` which loads this SKILL.md as system prompt, exposes a focused atomic-tool subset (see Tool surface below), runs an agentic loop, returns the composed touch or a skip decision. Used at fire time when the touch needs fresh evidence (a new charge, a recent monitoring period, the latest appetite signal). The per-cadence-type composition sections below describe what the composer should do per type.

The composer respects the "evidence or skip" rule: if no fresh evidence is available to ground the touch, the composer returns `{ skip: true, reason: ... }` and the dispatcher advances `nextDueAt` with `lastResult: "skipped_paused"`. This prevents content-free check-ins.

### Tool surface (v1.1)

The composer can call these atomic tools at fire time:

- `getContact`, `getClient`, `getProject` — entity reads
- `queryIntelligence`, `getClientIntelligence`, `getProjectIntelligence` — historical intelligence reads (lender DNA, prior analysis, captured charge summaries)

The composer does NOT yet have direct access to:

- **Touchpoint history** (`touchpoint.getByContact` not exposed as a tool). Recent inbound/outbound is not directly queryable; the "did the contact reply since lastFiredAt?" check is handled at the dispatcher level via the existing skip rules, not via the composer. Until a `touchpoint` tool domain lands, the composer infers history from `getClientIntelligence` if relevant intel was captured.
- **Live Companies House data** (`companies-house.getCharges` not exposed). Fresh charge filings are not directly fetchable by the composer; it must rely on whatever was already captured into `clientIntelligence` by prospect-intel or other workflows.
- **Live appetite signals** (`appetite.getCurrentForLender` not exposed). `bdm_relationship` cadences cannot read live appetite data; the composer either uses historical signals from `getClientIntelligence` or skips with `reason: "no_fresh_appetite_signal"` until the tool lands.

These gaps are tracked for v1.2 once the corresponding atomic tools are added to `src/lib/tools/domains/`. Until then, dynamic-compose cadences that depend on these data sources should produce skip decisions rather than fabricated content.

See `docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md` for the full design and `docs/superpowers/plans/2026-05-23-cadence-fire-v1.1-composer-and-meeting-prep.md` for the v1.1 implementation.

## Trigger

Invoke automatically when a `cadences` row's `nextDueAt` lapses and the cron-driven cadence engine schedules this skill against it. Not typically invoked by an operator directly; operators interact with the staged approvals that this skill produces.

A cadence row is the input. The skill reads the row, decides whether the touch should still fire (the person might have replied since the cadence was set; the deal might have closed; the relationship might be dormant for reasons), composes the touch, and stages it through approval.

## Inputs

Required:

- `cadenceId`: id of the `cadences` row that triggered

The skill loads everything else from the cadence row and from Convex.

## Outputs

Persisted to Convex:

1. An `approvals` row of type `gmail_send` (or `client_communication` for non-email cadences in future) with the composed touch. The approval row's `relatedCadenceId` points back to the cadence so the queue UI can show the chain.
2. The triggering cadence's `lastFiredAt` and `lastResult` are updated. `lastResult` reflects the actual outcome: `sent` if the approval was staged; `skipped_paused` if the cadence was paused; `skipped_holiday` if the touch should not fire today (UK bank holidays, weekends for certain cadence types); `skipped_user_opted_out` if the recipient has signalled stop; `failed` if the skill could not produce a draft.
3. `nextDueAt` is advanced based on `scheduleConfig.intervalDays`. If the cadence is one-shot (no intervalDays set), `isActive` is set to false.

What it does not do:

- Does not send. Every touch routes through approval.
- Does not delete cadences. Operator manages cadence lifecycle through settings.
- Does not handle non-email cadence types yet. Phone-call reminders and physical-mail cadences are out of scope for v1.

## High-level workflow

1. **Load the cadence row** by id. Read `cadenceType`, `contactId`, `relatedClientId`, `relatedProjectId`, `scheduleConfig`, `lastFiredAt`, `pauseUntil`.
2. **Skip checks.** Check `isActive` (skip if false). Check `pauseUntil` (skip if today is before it). Check holiday calendar (skip on UK bank holidays for cadences that should land on business days). Check for recent inbound from the same contact (skip if we already heard back since `lastFiredAt`).
3. **Load the contact and the relationship context.** Read the contact row, the related client, the related project if any. Load recent touchpoints to understand prior cadence history with this person.
4. **Branch on cadence type.** Each of the seven types has its own composition path; see the per-type sections below.
5. **Compose the touch.** Each composition uses templates from the appropriate reference. For email cadences, produce both `bodyText` and `bodyHtml`. Keep the touch short and respect the cadence type's tone (a warm-lead-chase is gentler than an execution-chaser).
6. **Stage the approval.** Create the `approvals` row with `entityType: "gmail_send"`, `requestSource: "cadence"`, `requestSourceName: "cadence-fire"`, `relatedCadenceId: <id>`.
7. **Advance the cadence state.** Patch `lastFiredAt`, `lastResult: "sent"`, and compute `nextDueAt` from `scheduleConfig.intervalDays`. For one-shot cadences (no interval), set `isActive: false`.
8. **Return a brief.** Two lines. Cadence type, contact, and approval id.

## Per-cadence-type composition

### `prospect_followup` (default 3-month re-touch on cold prospects)

Light, evidence-grounded re-touch. The angle: "I noticed [recent activity], wanted to come back." If no new evidence is available, the cadence skips that round (return `skipped_paused` with reason "no_new_evidence") rather than sending a content-free check-in.

### `warm_lead_chase` ("ask me in Q3" parked leads)

Aligned to the date the lead asked us to come back. The touch references the original parking ("you mentioned circling back in Q3") and asks if the timing has come good. Stronger close than the cold follow-up, because the relationship is warmer.

### `execution_chaser` (mid-deal chasers during execution)

The tightest of the cadences. References the specific outstanding action (an information request awaiting a document, a lender awaiting a decision, a client awaiting indicative terms). Lists the item plainly, proposes the next step. No softening preamble.

### `client_checkin` (periodic existing-client check-ins)

Relationship maintenance for closed deals or paused engagements. The angle: "How is the scheme tracking, anything we can help with?" Mention something specific (the recent monitoring report, a milestone they hit) if available; otherwise generic check-in. Quarterly cadence by default.

### `bdm_relationship` (lender BDM relationship maintenance)

Different audience to the other cadences. Touch a lender BDM with a brief market view, a recent deal we placed in their space, or a question about their current appetite. The reference for these touches is `../../shared-references/bdm-conversation-prompts.md` (to be authored). Six-week default cadence.

### `monitoring_ask` (monitoring document asks)

For deals in monitoring phase. Asks for the next monthly or quarterly monitoring document (drawdown report, cost-to-complete update, sales update). Specific document by name and reporting period. Light follow-up if the previous ask is unanswered after a week.

### `post_lost_re_engagement` (lost-deal re-entry)

For prospects whose previous deal closed lost. The angle: "Your scheme didn't move with us last time; the market has moved, lender appetite has changed, and your situation may have too." Six-month default cadence after a closed-lost outcome.

## Style rules

All voice and output rules from `../../CONVENTIONS.md` apply. Two that matter most for this skill:

- **Short.** Cadence touches are shorter than first-touch reachouts. Two paragraphs total, max. The first names the specific reason for the touch; the second asks for the next step.
- **Evidence or skip.** If the cadence cannot find specific evidence to ground the touch in (no new charges, no planning hits, no press, no new monitoring period), the cadence skips that round rather than sending fluff. Skipping is a `skipped_paused` outcome with reason in the cadence row.

## Tool dependencies

- `cadence.get` to read the triggering row
- `cadence.advance` to patch `lastFiredAt`, `lastResult`, `nextDueAt`
- `contact.get`, `client.get`, `project.get` for context
- `touchpoint.getByContact` to check for recent inbound
- `intelligence.queryIntelligence` for prior evidence and history
- `companies-house.getCharges` for fresh evidence when cadence type benefits from it
- `gmail.requestSend` to stage the approval
- `holiday.isBankHoliday(date)` (sub-skill, see `../../sub-skills/`) to check business-day rules

## What goes wrong

1. **The contact has replied since `lastFiredAt`.** Skip with `skipped_paused`, reason "inbound_received". Operator handles the reply manually or with qualify-and-draft.
2. **The contact has signalled stop.** Detect via past touchpoint with `kind: "note"` containing opt-out keywords. Skip with `skipped_user_opted_out` and set `isActive: false` so the cadence does not fire again.
3. **The cadence engine fires while the contact is in deep negotiation.** Skip if a project linked to this contact has `dealPhase: "credit_submission"` or later. The execution-chaser cadence is the only one that should fire during active execution.
4. **Today is a UK bank holiday.** Skip with `skipped_holiday`. Bank-holiday-aware scheduling for cadence types that should land on business days. Some types (e.g., monitoring asks) are fine on holidays.
5. **The composition produces nothing meaningful.** If the skill cannot find an evidence anchor for the touch (especially `prospect_followup` and `warm_lead_chase`), do not send a generic check-in. Skip.

## References

Loaded on demand:

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/approval-payload-shapes.md`
- `./references/cadence-templates.md` (to be authored): the per-type composition templates.
- `./references/bdm-conversation-prompts.md` (to be authored): for `bdm_relationship` type.
- `../../sub-skills/holiday-calendar.md` (planned): UK bank holiday and weekend rules.
