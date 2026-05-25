# qualify-and-draft

Step 2 of the deal lifecycle. After a prospect responds to outreach, this skill produces a personalised first-touch reply that confirms interest, flags any information we still need to qualify the opportunity, and stages the reply through approval.

## Trigger

Invoke when an operator has an inbound reply from a prospect (or a referral introduction that names a specific scheme or opportunity) and wants to respond. Common forms of the trigger:

- "Reply to Sarah at {Developer Co.}, she wrote back about the {Scheme} financing"
- "Qualify this inbound: {pasted email body}"
- "{Referrer} introduced me to {Borrower MD} at {Co}, draft a reply"

The skill takes either a Gmail thread reference (where touchpoint capture has the inbound mail already), a pasted email body, or a free-form description of the inbound interest.

## Inputs

Required (one of):

- `inboundTouchpointId`: id of a `touchpoints` row representing the inbound email or message we are replying to
- `inboundBodyText`: pasted plain-text email body, with sender identifiable in the text or via `senderEmail`
- `referralDescription`: free-form description when there is no email yet (e.g., a verbal referral that needs a follow-up email)

Optional:

- `clientId`: if the prospect is already known and we want the reply linked to that client
- `projectId`: if a deal context is already established
- `tone`: `formal` (default) or `warm` for relationships where prior context allows it
- `extraContext`: anything the operator wants to feed in (a side conversation, a recent meeting note)

## Outputs

Persisted to Convex:

1. A new `approvals` row of type `gmail_send` with the reply draft. Includes `inReplyTo` and `threadId` when responding to an inbound Gmail.
2. A `knowledgeItems` row capturing the qualification gaps the draft asks about, so a follow-up skill can check which gaps closed when the next reply comes in.
3. Optionally, a `cadences` row of type `warm_lead_chase` if the operator's framing suggests a parked-but-promising lead (e.g., "ask me in Q3"). The cadence defaults to 90-day re-touch; the skill writes it but does not enable it without operator confirmation.

What it does not do:

- Does not send the email.
- Does not create a `projects` row. A real project gets created later in the lifecycle when the deal becomes tangible.
- Does not promote the prospect to active client status.
- Does not chase. Chasers are a separate skill (cadence-fire) consuming the cadences table.

## High-level workflow

1. **Resolve the prospect.** If `inboundTouchpointId` was given, read the touchpoint to extract sender, body, subject, threadId. If `inboundBodyText` was given, parse for the sender. If `referralDescription`, ask for the recipient's email if missing.
2. **Resolve the company.** Use the `resolve-company` sub-skill (when available) to match the sender's email domain or company name to an existing `clients` row or a Companies House company.
3. **Load context.** Read the prospect's `clientIntelligence` and any recent `touchpoints` against the same contact or company. The reply should reflect prior history (or explicitly note its absence).
4. **Identify qualification gaps.** Compare what we know to what we need before we can submit to lenders. Standard gaps: GDV, TDC, site address, scheme units, planning status, equity in deal, sponsor experience, timeline. Each gap that exists becomes a question the reply asks.
5. **Pick a draft register.** Default formal. If the inbound text uses first names, an exclamation mark, or familiar language, register as warm. Match the inbound register; do not overcorrect in either direction.
6. **Compose the reply.** Open by acknowledging the specific thing they wrote (one sentence). State what we can do, grounded in evidence (one sentence). Ask the qualification questions (no more than three; choose the highest-leverage gaps). Propose a call as the close. Sign off with the partner who would actually own the relationship.
7. **Stage the approval.** Create an `approvals` row of type `gmail_send` with `inReplyTo` set to the inbound message id, `threadId` set so the reply lands in the same Gmail thread, and `summary` describing what the reply is about for the approvals queue.
8. **Capture qualification expectations.** Write a `knowledgeItems` row with `fieldPath: "qualification.open_questions"` and the list of gaps the reply asks about. A future skill checks this against the next inbound and updates close-status.
9. **Return a brief.** One paragraph. What we have, what we are asking, what the staged approval contains.

## Style rules

All voice and output rules from `../../CONVENTIONS.md` apply. Two that matter most for this skill:

- **Match the register.** If they wrote four sentences, we write four sentences. If they were warm, we are warm. Mirroring builds rapport without being obsequious.
- **Three questions maximum.** A reply asking ten questions reads as a form. Pick the three that determine whether we can place this. Hold the rest for the call.

## Tool dependencies

This skill calls these MCP-exposed tools:

- `touchpoint.get` to read the inbound, when given a touchpoint id
- `client.get`, `client.checkExists`, `client.create` to resolve the borrower side
- `intelligence.getClientIntelligence` for context
- `touchpoint.getByContact` for prior history
- `companies-house.searchCompanies` if the domain or name needs resolving
- `gmail.requestSend` (BL-4.2) to stage the approval
- `knowledge.addItem` to record qualification gaps
- `cadence.create` to optionally stage a warm-lead-chase row

If `gmail.requestSend` cannot be called (per-user send disabled, global send off, or no connection), the skill produces the draft text and returns it inline with a clear note that the operator needs to enable Gmail send before the draft can be staged.

## What goes wrong

1. **The inbound is ambiguous.** The reply asks for clarification rather than guessing what they meant.
2. **The sender's email domain does not resolve to a company we can identify.** The skill drafts the reply with the company name omitted from the body (using the sender's name only) and flags the missing company in the brief.
3. **Prior history exists with mixed signals.** If a previous reachout was sent in the last 14 days and is still unanswered, the skill drafts a single combined reply rather than treating this as fresh inbound.
4. **The inbound is from a competing broker.** Detect by domain (a known broker's domain) and stop. Surface to the operator for manual handling.
5. **The inbound is a complaint or non-business message.** If keywords like "remove me", "stop emailing", "unsubscribe" appear, the skill stops drafting and creates an `approvals` row of type `client_communication` with a respectful acknowledgement only.

## References

Loaded on demand during the workflow:

- `../prospect-intel/references/template-mapped-reachout.md` — the canonical reachout templates, used here for register and length calibration even though we are responding rather than initiating.
- `../../shared-references/uk-property-finance-glossary.md` — vocabulary checks.
- `../../shared-references/approval-payload-shapes.md` — the exact shape of the `gmail_send` approval row.
- This skill's own references (to be added): `qualification-gap-catalogue.md` listing the standard gaps and how to phrase questions about each.
