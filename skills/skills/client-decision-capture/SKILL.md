# client-decision-capture

Step 10 of the deal lifecycle. The client has made a decision in response to indicative terms: pick a lender, push back for different terms, or step away. This skill captures the decision structurally and advances the deal state.

## Trigger

Invoke after a client communication (email reply, meeting transcript, phone-call note) carries the decision. Common forms:

- "Client picked Lender B, let's lock it in"
- "Client wants to push back on terms, capture the asks"
- "Client is pausing the deal, write it up"

## Inputs

Required (one of):

- `inboundTouchpointId`: the touchpoint that carries the decision
- `decisionDescription`: free-form description when no formal communication exists

Plus:

- `projectId`: required if not derivable from the touchpoint

Optional:

- `selectedLenderClientId`: if the decision is "pick this lender", explicit pointer
- `loopBackReason`: if the decision is "go back and ask for different terms", the rationale

## Outputs

Persisted to Convex:

1. **A structured decision record** written to `knowledgeBankEntries` as `entryType: "deal_update"` with the decision payload (kind, selected lender, conditions, rationale).
2. **`lenderApproaches` updates**: the selected lender moves to `status: "submitted_for_credit"` (next phase); the others move to `closed_lost` with a declineReason capturing why they were not selected.
3. **Project state advance**: `projects.dealPhase` moves from `indicative_terms` to `credit_submission` for the "lender selected" path. For loop-back paths, dealPhase stays at `indicative_terms` and lenderApproaches stay at `indicative_received` while we negotiate.
4. **Optional staged communications**: thank-you notes to the unselected lenders (`approvals` of type `gmail_send`), a confirmation-of-instruction email to the selected lender's BDM, and any client-facing acknowledgement.

## Workflow

1. Read the decision input. Classify into one of four kinds:
   - `lender_selected`: client has picked a specific lender to proceed with
   - `loop_back_for_better_terms`: client wants more rounds with lenders
   - `pause`: client wants to step away temporarily; resume later
   - `dropped`: client is not proceeding; deal closes lost
2. For `lender_selected`:
   - Confirm or resolve `selectedLenderClientId` from the decision text.
   - Update lenderApproaches: selected to `submitted_for_credit`, others to `closed_lost`.
   - Advance project `dealPhase` to `credit_submission`.
   - Stage a confirmation email to the selected lender's BDM ("we are moving forward with you on this deal").
   - Stage thank-you-and-decline emails to the unselected lenders (one per BDM contact).
3. For `loop_back_for_better_terms`:
   - Capture the loop-back reason and which terms the client wants improved (rate, leverage, conditions).
   - Stage a follow-up to the relevant lender(s) with the client's pushback framed neutrally.
   - Keep dealPhase at `indicative_terms`.
4. For `pause`:
   - Stage a follow-up cadence (warm_lead_chase) keyed off the client's preferred re-touch date.
   - Note the pause reason in `projectIntelligence`. Do not close lender approaches; mark them `withdrawn` with reason "client paused" so they can be reactivated.
5. For `dropped`:
   - Move project to a closed-lost state. Update all open lenderApproaches to `closed_lost`.
   - Stage a brief courtesy note to the client.
   - Schedule the `post_lost_re_engagement` cadence for 6 months out.
6. Write the structured decision record.
7. Return a brief: kind of decision, state changes made, communications staged.

## Style rules

All CONVENTIONS apply. Two that matter most:

- **Faithful to the source.** The client's exact wording on why they picked or paused matters. Capture it verbatim in the decision record; do not paraphrase.
- **Thank-you notes are short.** Two sentences to a non-selected lender BDM. "Thanks for the work on the indicative; we've gone with another lender on this one. We'll be back with the next deal."

## Tool dependencies

- `project.get`, `project.update` (for dealPhase advance)
- `lenderApproach.listByProject`, `lenderApproach.update`
- `touchpoint.get`
- `knowledge.addEntry` for the decision record
- `cadence.create` for the pause and re-engagement paths
- `approval.create` of type `gmail_send` for the staged emails
- `intelligence.addProjectUpdate`

## What goes wrong

1. **Decision is ambiguous**: client says "let's keep talking to lenders" without naming one. Skill asks for clarification rather than guessing.
2. **Multiple decisions in one communication**: client picked Lender A but also wants to renegotiate the LTGDV. Skill captures both; advances state to `submitted_for_credit` with Lender A; queues the LTGDV renegotiation as a `cadence` of type `execution_chaser`.
3. **The selected lender's BDM has changed**: skill detects via the lender's last `bdm_relationship` touchpoint and surfaces the BDM-mobility update.
4. **Client decision contradicts the recommendation**: skill captures faithfully without comment. The recommendation was advice; the decision is the client's.
5. **No prior recommendation document**: skill captures the decision but flags that the audit trail is incomplete (was the comparison documented?).

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/approval-payload-shapes.md`
- This skill's own references to be authored: `decision-kinds-catalogue.md`, `loop-back-pattern-library.md`.
