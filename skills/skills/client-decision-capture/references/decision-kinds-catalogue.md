# Decision kinds catalogue

The four kinds a client decision (in response to indicative terms) classifies
into. Pick exactly one. If the communication carries more than one (e.g. picks a
lender *and* asks to renegotiate a term), the primary kind drives state; the
secondary becomes a staged follow-up.

## `lender_selected`

The client has chosen a specific lender to proceed with.

- **Resolve** `selectedLenderClientId` from the decision text (confirm against the
  deal's linked lenders in `project.getDeepContext` → clientRoles).
- **Capture** the selection as a canonical knowledge item + the verbatim
  rationale as a note.
- **Stage** a confirmation `gmail_send` to the selected lender's BDM; short
  thank-you/declines to the unselected BDMs.
- **Gaps to log** (no MCP tool yet): advance `projects.dealPhase` → credit
  submission; move the selected lender's approach → submitted-for-credit and the
  others → closed-lost.

## `loop_back_for_better_terms`

The client wants another round — better rate, more leverage, different conditions.

- **Capture** the loop-back reason and exactly which terms to improve.
- **Stage** a neutrally-framed follow-up to the relevant lender(s) carrying the
  client's pushback.
- **State**: deal phase stays at indicative terms; no lender is closed.

## `pause`

The client wants to step away temporarily and resume later.

- **Capture** the pause reason via `intelligence.appendContext`.
- **Create** a warm re-engagement `cadence.create` keyed to the client's preferred
  re-touch date.
- **State**: do not close lenders; note that approaches are paused (gap: no tool
  to mark approach status "withdrawn — client paused").

## `dropped`

The client is not proceeding.

- **Capture** the reason verbatim.
- **Stage** a brief courtesy note to the client.
- **Create** a longer-dated (≈6 month) re-engagement `cadence.create`.
- **Gaps to log**: close the deal; move all open lender approaches → closed-lost.

## Classification rule

If the decision text does not clearly map to one of these — most commonly a vague
"let's keep going" with no named lender — **stop and ask the operator**. A
mis-captured decision corrupts the deal's audit trail; a clarifying question
costs nothing.
