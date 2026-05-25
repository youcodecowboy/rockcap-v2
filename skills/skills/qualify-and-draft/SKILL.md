# qualify-and-draft

Step 2 of the deal lifecycle. After a prospect responds to outreach, this skill produces a personalised reply that confirms interest, surfaces the qualification gaps we still need to close, and stages the reply through approval.

**v2 hardening (2026-05-25):** retargeted at the v1.3 substrate — `prospect.getDeepContext` for one-shot context loading, `reply.get` for tracked inbound reply events, `outreach.draftReply` for one-call approval staging. Operator-initiated drafts ("draft a follow-up for Mccarthy mentioning X") use the same workflow as classifier-routed drafts (reply intent = `info_question` or operator-review escalation).

## Trigger

Three invocation paths, all use the same workflow:

1. **Classifier-routed** (most common, automatic): the reply-event processor classified an inbound as `info_question` and dispatched to this skill. The `dispatchedTo` field on `replyEvents` will be `"qualify-and-draft"` and `dispatchedSkillRunId` will be unset until this skill calls `skillRun.start`.

2. **Operator-initiated reply** (interactive, common): operator says "draft a response to Mccarthy's latest reply" or "qualify this inbound: {pasted email}". Either case: operator already has a reply in mind to respond to.

3. **Operator-initiated fresh outreach** (interactive, less common): operator says "draft a follow-up for Mccarthy mentioning the OneSavings refi" with no specific inbound to respond to. The skill produces a follow-up reflecting the latest intel.

All three converge on the same workflow once the inputs are resolved.

## Inputs

Required (one of):

- `replyEventId`: id of a `replyEvents` row representing the inbound the operator wants to respond to. THE primary path in v1.3 — captured automatically when classifier routes here, used explicitly when operator says "respond to Mccarthy's latest reply".
- `clientId`: id of a `clients` row, for the fresh-outreach path (operator wants a follow-up that doesn't respond to a specific inbound).
- `inboundBodyText`: pasted plain-text reply body (legacy / out-of-band). The operator received the reply via WhatsApp or text and wants to draft a response. Prefer `reply.ingestManual` first to create a `replyEventId`, then pass that.

Optional:

- `contactId`: explicit recipient. If not supplied, resolved from the reply event's `contactId` OR from the client's `primaryContactId`.
- `tone`: `formal` (default) or `warm` for relationships where prior context allows it.
- `extraContext`: anything the operator wants to feed in (a side conversation, a recent meeting note).
- `mentionPoints`: specific topics the operator wants the draft to reference (e.g., "OneSavings refi just landed").

## Dedup

- **dedupKey**: when `replyEventId` is the trigger: `reply:${replyEventId}`. Otherwise: `client:${clientId}:${YYYY-MM-DD}` (one draft per client per day).
- **dedupWindowDays**: 1 (we don't want to draft twice in the same day for the same trigger; the operator should approve, reject, or edit the existing draft).
- **On `duplicate_found`**: surface the prior approval id + draft summary. Operator decides: open prior, refresh (means deny existing + redraft).

## Cadence package

This skill **does not** produce a cadence package by default. A qualify-and-draft draft is a one-off reply, not a multi-touch sequence.

**Exception — `warm_lead_chase`:** if the inbound text suggests a parked-but-promising lead (e.g., "ask me in Q3", "talk to me again in 6 months"), the skill MAY produce a single `cadences` row of type `warm_lead_chase` with a default 90-day re-touch. The cadence is created `isActive: false` until operator confirms via the approvals UI — the skill never enables a chase autonomously. Implementation: include the cadence in the same approval row's `draftPayload.warmLeadChase` rather than as a separate cadence row; only on approval execution does the cadence actually persist.

## Outputs

Persisted to Convex via the v1.3 MCP tool surface:

1. **An `approvals` row** of type `client_communication` (entityType), `requestSource: "skill"`, `requestSourceName: "qualify-and-draft"`. Created via `outreach.draftReply` MCP tool. The `relatedReplyEventId` links back to the inbound (when classifier-routed); `relatedClientId` always set; `relatedContactId` always set; `relatedSkillRunId` always set.
2. **A `knowledgeItems` row** capturing the qualification gaps the draft asks about (`fieldPath: "qualification.open_questions"`), so the next inbound's qualify-and-draft run can check which gaps closed.
3. **A `skillRun` row** via the standard `skillRun.start` / `skillRun.complete` pattern. `linkedApprovalIds` set to the drafted approval. `linkedClientId` set. The brief should explain the qualification strategy (what gaps asked, why, what register chosen).
4. **Optionally** the warm_lead_chase cadence as described above.

What it does not do:

- Does not send the email. Approval is the gate.
- Does not create a `projects` row. Real projects emerge later in the lifecycle.
- Does not promote the prospect's state. State transitions happen via reply-event processor (which already advanced prospectState to `replied` when the inbound landed) or explicit operator action.
- Does not chase autonomously. The optional warm_lead_chase row lands `isActive: false` and requires operator approval.

## High-level workflow

1. **Resolve the trigger.** If `replyEventId`: call `reply.get({replyEventId})` to load the inbound (subject, bodyText, contactId, classifiedIntent, classifierEvidence, linkedClientId). The classifier already routed it here — DO NOT re-classify. If `clientId` only: this is a fresh-outreach draft; load via `client.getDeepContext` and surface the most recent inbound as context.

2. **Call `skillRun.start`** with `skillName: "qualify-and-draft"`, the appropriate `dedupKey`, `dedupWindowDays: 1`, and `input: {replyEventId or clientId, contactId, tone, mentionPoints}`. Honour `duplicate_found` per the dedup section above.

3. **Load full context — single call.** Call `prospect.getDeepContext({clientId})` (or `client.getDeepContext` — same query). One round-trip returns: prospect identity, contacts (find primary email), cadences (history of what we've sent), reply events (this one + any prior), latest prospect-intel skillRun + intelMarkdown, CH profile + charges, clientIntelligence row, recent touchpoints, pending approvals. This replaces 5-8 individual reads from earlier versions.

4. **Identify qualification gaps.** Load `references/qualification-gap-catalogue.md` and `../prospect-intel/references/bridging-vs-developer.md`. Compare what we already know (from `clientIntelligence` + `intelMarkdown`) against the standard gaps (scheme address, GDV, TDC, units, planning status, equity, sponsor experience, timeline). The reply asks about the highest-leverage 3 gaps maximum.

5. **Pick the register.** Default formal. If the inbound text uses first names, exclamation marks, or familiar language, register as warm. Match the inbound; do not overcorrect. If `tone` was passed explicitly, honour it.

6. **Compose the reply.** Open by acknowledging the SPECIFIC thing they wrote (one sentence; cite a phrase from `reply.replyBodyText`). State what we can do, grounded in evidence from the intel report (one sentence). Ask the qualification questions (≤3, the highest-leverage gaps). Propose a call as the close. Sign off with the partner who would actually own the relationship (the operator's name; pull from `users.getCurrent` if needed, else use a placeholder for the operator to fill).

7. **Stage the approval.** Call `outreach.draftReply({contactId, clientId, subject, bodyText, bodyHtml, replyToReplyEventId, skillRunId, reasoning})`. The `reasoning` field is a 1-2 sentence summary for the operator's quick-review on the /approvals page. Returns `{approvalId, viewAt}`.

8. **Capture qualification expectations.** Write a `knowledgeItems` row via `intelligence.addKnowledgeItem` (when MCP-exposed) with `fieldPath: "qualification.open_questions"` and the list of gaps the reply asks about. v1.3.x gap: this MCP tool may not be wired yet — if it errors, capture the gap list in the skillRun.complete `gaps` array as a fallback.

9. **Optional warm_lead_chase.** If the inbound suggests defer-and-revisit, add `warmLeadChase: {fireAt, message}` to the approval's draftPayload. Do NOT call `cadence.create` directly — the cadence only lands when the operator approves the package.

10. **Call `skillRun.complete`** with `status: "complete"` (or `complete_with_gaps`), `brief` (one paragraph: what we found, what we asked, what's staged), `linkedClientId`, `linkedApprovalIds: [approvalId]`, `gaps` for anything that couldn't be resolved (e.g., missing primary contact, missing intel report).

## Style rules

All voice and output rules from `../../CONVENTIONS.md` apply. Five that matter most for this skill:

- **Match the register.** If they wrote four sentences, we write four sentences. If they were warm, we are warm. Mirroring builds rapport without being obsequious.
- **Three questions maximum.** A reply asking ten questions reads as a form. Pick the three that determine whether we can place this. Hold the rest for the call.
- **Cite specifics from the inbound.** Open with a phrase or named scheme from their reply — proves we read it. "Thanks for the note on Milton Street" beats "Thanks for getting back to me".
- **Cite specifics from our intel.** The "what we can do" sentence should reference our actual knowledge — "we've placed two bridge-to-term refis in Southport this year" not "we work with lots of Essex developers".
- **Report-as-standalone-artefact.** Per `../prospect-intel/references/intel-report-template.md` rule: never compare to other prospects/clients in the reply body. Each reply stands on its own.

## Tool dependencies

This skill calls these MCP-exposed tools (v1.3):

- `reply.get` — load the inbound (when classifier-routed)
- `prospect.getDeepContext` / `client.getDeepContext` — one-shot context load
- `contact.getByClient` — find primary contact if reply is operator-initiated
- `skillRun.start` (with dedup) — workflow entry
- `outreach.draftReply` — stage the email draft as a pending approval
- `skillRun.complete` (with linkedApprovalIds + gaps) — workflow exit
- `cadence.create` — only for the warm_lead_chase case AND only after operator approval (deferred to approval-execution path; skill does not call this directly)

Claude Code native tools used:
- None required. Web research / Apollo / CH sync are prospect-intel concerns; by the time qualify-and-draft runs, the prospect-intel run is in scope via `getDeepContext`.

## What goes wrong

1. **The inbound is ambiguous.** The reply asks for clarification rather than guessing what they meant.
2. **No prospect-intel run exists for this client.** `getDeepContext.latestIntelRun` is null. Surface a gap in `skillRun.complete` recommending the operator run prospect-intel first, then draft a general "thanks for the note, would love to learn more about the project — happy to send a 15-minute Calendly link?" reply that doesn't fake specificity.
3. **The sender's email domain does not resolve to a tracked contact.** The reply event's `contactId` will be undefined (classifier flagged as `no_contact_match`). The skill cannot draft without a recipient — surface a gap recommending the operator create the contact (via `contact.create` MCP when available) and re-run.
4. **Prior history exists with mixed signals.** If a prior reachout was sent in the last 14 days and is still unanswered (visible in `getDeepContext.cadences.fired` + `getDeepContext.replyEvents`), the skill drafts a single combined reply rather than treating this as fresh inbound.
5. **The inbound is from a competing broker.** Detect by domain (known broker domains list in `../prospect-intel/references/template-mapped-reachout.md` — to be authored). Stop drafting and surface to operator.
6. **The inbound is a complaint or non-business message.** If keywords like "remove me", "stop emailing", "unsubscribe" appear, the skill stops drafting and uses `prospect.transitionState` to move the client to `lost` state with appropriate cancelled reason. No reply staged.
7. **The classifier flagged `info_question` but the operator wants a meeting reply.** Trust the operator; pass `tone: "warm"` and add a Calendly close even if questions were also asked.

## References

Loaded on demand during the workflow:

- `references/qualification-gap-catalogue.md` — the standard qualification gaps, when to ask each, how to phrase the question. (v2 hardening: authored alongside this SKILL.md.)
- `../prospect-intel/references/template-mapped-reachout.md` — reachout templates indexed by classification; used for register + length calibration.
- `../prospect-intel/references/bridging-vs-developer.md` — classification rules; used to remind the skill what evidence supports which product fit.
- `../../shared-references/uk-property-finance-glossary.md` — vocabulary checks.
- `../../shared-references/approval-payload-shapes.md` — the canonical `client_communication` approval shape (matches what `outreach.draftReply` produces).
