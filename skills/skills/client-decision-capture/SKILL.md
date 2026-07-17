# client-decision-capture

**Last hardening:** v2 2026-06-01 (hardened from skeleton via skill-forge; retargeted at the live MCP tool surface).

Step 10 of the deal lifecycle. The client has made a decision in response to
indicative terms: pick a lender, push back for different terms, pause, or step
away. This skill captures the decision **faithfully and structurally** against
the live tool surface, stages any client/lender communications for approval, and
records the structured facts that downstream steps and the audit trail depend on.

> **Substrate note.** Two state transitions this step *conceptually* owns —
> advancing `projects.dealPhase` and moving per-lender approach statuses
> (selected → credit submission, others → closed-lost) — have **no MCP tool
> today**. This skill captures the decision in full (knowledge items + a
> verbatim note + running context) and **logs those transitions as gaps** via
> `skillRun.complete`. It does **not** invent tools to perform them. When the
> substrate lands, this skill gets the two writes added.

## Trigger

Invoke after a client communication (email reply, meeting transcript, call note)
carries the decision:

- "Client picked Lender B, lock it in."
- "Client wants to push back on terms — capture the asks."
- "Client is pausing the deal, write it up."
- "Client's not proceeding."

## Inputs

Required (one of):

- `decisionDescription`: free-form description of the decision (the operator's or
  client's words).
- a touchpoint reference for the deal carrying the decision (resolve via
  `touchpoint.getByProject`).

Plus:

- `projectId`: required (the deal the decision is about).

Optional:

- `selectedLenderClientId`: explicit pointer when the decision is "pick this lender".
- `loopBackReason`: rationale when the decision is "go back for better terms".

## Dedup

`dedupKey: "decision:" + projectId`, `dedupWindowDays: 30`. A deal's decision
should be captured once. On `duplicate_found`, surface the prior decision brief
to the operator and confirm before recording a superseding decision (a genuine
change of mind is valid; an accidental re-run is not).

## Cadence package

Does not produce a gauntlet cadence package. It may create **standalone** cadence
rows for two paths: a warm re-engagement cadence on `pause`, and a longer-dated
re-engagement on `dropped`. These are individual `cadence.create` calls, not a
packaged sequence.

## Outputs

- **Verbatim decision record** — `note.create` on the project, capturing the
  client's exact wording (faithful to source; see Style rules).
- **Structured decision facts** — `intelligence.addKnowledgeItem` (projectId
  scope): the decision kind, the selected lender (if any), key conditions, the
  rationale. These are what `*.getDeepContext` later reads.
- **Running context block** — `intelligence.appendContext` on the project: a
  dated, operator-attributed summary of the decision and state changes made.
- **Staged communications** — `approval.create` (`entityType: "gmail_send"`,
  shapes per `approval-payload-shapes.md`): confirmation to the selected lender's
  BDM, short thank-you/declines to unselected BDMs, client acknowledgement.
- **Logged gaps** — for the dealPhase advance and lender-approach status changes
  that have no MCP tool yet (via `skillRun.complete` `gaps`).
- **Brief** — decision kind, what was captured, what was staged, what was logged
  as a gap.

## High-level workflow

1. `skillRun.start({ skillName: "client-decision-capture", input, dedupKey, dedupWindowDays: 30 })`.
   Honour a `duplicate_found` response.
2. `project.getDeepContext({ projectId })` — load the deal, its linked lenders
   (clientRoles), the knowledge-graph `graph` section (atoms, top edges,
   facilities; the projectIntelligence payload is the fallback when the graph
   section is empty — project not yet atomized), and recent touchpoints in one
   call. If the decision came from a touchpoint, confirm it via
   `touchpoint.getByProject`.
3. Classify the decision into one kind (see `references/decision-kinds-catalogue.md`):
   `lender_selected` · `loop_back_for_better_terms` · `pause` · `dropped`.
   If ambiguous (e.g. "let's keep talking to lenders" with no name), STOP and ask
   the operator — do not guess.
4. **Capture (all paths):**
   - `note.create` — the client's decision in their own words, verbatim.
   - `intelligence.addKnowledgeItem` — structured facts (kind; selected lender id
     if any; conditions; rationale). Use `sourceType: "operator"` /
     the touchpoint as appropriate.
5. **Per kind:**
   - `lender_selected`: resolve `selectedLenderClientId`; record it as a canonical
     knowledge item; stage a confirmation `gmail_send` to that lender's BDM and
     short thank-you/declines to the others; **log gaps** for advancing
     `projects.dealPhase` → credit submission and for the lender-approach status
     transitions (no MCP tool yet).
   - `loop_back_for_better_terms`: capture the loop-back reason + which terms to
     improve; stage a neutrally-framed follow-up to the relevant lender(s); deal
     phase stays put.
   - `pause`: `cadence.create` a warm re-engagement keyed to the client's
     preferred re-touch date; record the pause reason via `intelligence.appendContext`.
   - `dropped`: stage a brief courtesy note to the client; `cadence.create` a
     longer-dated (≈6 month) re-engagement; **log a gap** for closing the deal /
     lender approaches (no MCP tool yet).
6. `intelligence.appendContext` — a dated block summarising the decision and every
   action taken (including gaps logged), so the deal's running context is current.
7. `skillRun.complete({ runId, status, brief, gaps, linkedProjectId, linkedApprovalIds })`.
   Use `complete_with_gaps` whenever a substrate gap was logged.

## Style rules

All `../../CONVENTIONS.md` apply. Two that matter most here:

- **Faithful to the source.** The client's exact wording on *why* they picked,
  paused, or walked matters. Capture it verbatim in the note; do not paraphrase.
- **Thank-you notes are short.** Two sentences to a non-selected lender BDM:
  "Thanks for the work on the indicative; we've gone with another lender on this
  one. We'll be back with the next deal."

## Tool dependencies

Real, MCP-exposed tools this skill uses:

- `skillRun.start`, `skillRun.complete` — the execution envelope.
- `project.getDeepContext` — deal + lenders + graph section (intelligence fallback for not-yet-atomized projects) + touchpoints in one read.
- `touchpoint.getByProject` — confirm the decision's source touchpoint.
- `note.create` — the verbatim decision record.
- `intelligence.addKnowledgeItem` — structured decision facts.
- `intelligence.appendContext` — the running deal-context block.
- `cadence.create` — pause / dropped re-engagement.
- `approval.create` (`gmail_send`) — staged BDM + client communications.

Substrate gaps (no MCP tool yet — **log via `skillRun.complete`, do not invent a
tool**): advancing `projects.dealPhase`; transitioning per-lender approach status
(selected → credit submission, others → closed-lost / withdrawn on pause).

## What goes wrong

1. **Ambiguous decision** — client says "keep talking to lenders" with no name.
   Ask for clarification; never guess which lender.
2. **Multiple decisions at once** — picked Lender A *and* wants the LTGDV
   renegotiated. Capture both: record the selection, and stage the renegotiation
   follow-up to Lender A.
3. **Decision contradicts the recommendation** — capture it faithfully, without
   editorialising. The recommendation was advice; the decision is the client's.
4. **No prior recommendation on file** — capture the decision but flag in the
   brief that the audit trail is incomplete (was the comparison documented?).
5. **Tempted to advance state with a tool that doesn't exist** — don't. Log the
   gap; the decision capture is still complete and valuable without it.

## References

- [`references/decision-kinds-catalogue.md`](./references/decision-kinds-catalogue.md) — the four decision kinds + how to classify + what each captures.
- [`../../shared-references/approval-payload-shapes.md`](../../shared-references/approval-payload-shapes.md) — the `gmail_send` payload shape for staged comms.
- [`../../shared-references/uk-property-finance-glossary.md`](../../shared-references/uk-property-finance-glossary.md) — terminology.
- [`../../CONVENTIONS.md`](../../CONVENTIONS.md) — cross-skill voice + style.
