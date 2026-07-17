# compute-deal-phase-transition

Determine whether a project's `dealPhase` should advance, hold, or roll back, based on the state of its lender approaches, checklist items, milestones, and recent touchpoints. Used by client-decision-capture, deal-triage, and any skill that observes deal-state changes.

## When to use

Whenever a deal-state change has occurred and a skill needs to check if `projects.dealPhase` should move. Examples: a client decision came in, an IC was approved, a drawdown happened.

## Inputs

Required:

- `projectId`: the deal

Optional:

- `triggerEvent`: hint about what just happened (e.g., `"client_picked_lender"`, `"ic_approved"`, `"drawdown_complete"`). Helps the skill check the right preconditions.

## Outputs

```ts
type PhaseTransition = {
  currentPhase: "indicative_terms" | "credit_submission" | "post_credit" | "completed";
  proposedPhase: "indicative_terms" | "credit_submission" | "post_credit" | "completed";
  shouldTransition: boolean;
  preconditionsMet: { name: string; met: boolean; detail: string }[];
  blockers: string[];                    // items the deal would need to clear first
  notes: string[];
};
```

## Workflow

1. Load the project. Note `currentPhase`.
2. Compute the next plausible phase from `currentPhase`:
   - `indicative_terms` → `credit_submission`
   - `credit_submission` → `post_credit`
   - `post_credit` → `completed`
   - `completed` → no further transition
3. For the next phase, check the canonical preconditions:

### Transition to `credit_submission`

- At least one `lenderApproaches` row is at `status: "submitted_for_credit"` or beyond.
- All `indicative_terms`-phase `required` checklist items have `status: "fulfilled"`.
- A client decision record exists — check the graph first (`atoms.search` for the lender-selection decision atom); fall back to `knowledgeBankEntries` with `entryType: "deal_update"` capturing the lender selection (not-yet-atomized deals).

### Transition to `post_credit`

- The selected `lenderApproaches` row is at `status: "credit_approved"`.
- All `credit_submission`-phase `nice_to_have` items are at least `pending_review`.
- A facility letter (`fileTypeDetected: "Facility Letter"`) exists in the project documents OR the credit approval is dated within 14 days (post-approval grace).

### Transition to `completed`

- The `Drawdown` document exists OR all `post_credit` required items are `fulfilled`.
- The selected `lenderApproaches` is at `status: "closed_won"`.
- A case study exists — check the graph first (`atoms.search`); fall back to `knowledgeBankEntries` for not-yet-atomized deals (or a TODO marker indicating one is queued).

4. For each precondition, return whether it's met with a one-sentence detail.
5. `shouldTransition` is true only if all preconditions are met. Even one unmet precondition holds the deal at its current phase.
6. Generate `blockers`: human-readable list of what would need to happen.
7. Add notes: any unusual signals (e.g., a `closed_lost` race condition where the selected lender declined after credit-submission).

## Style rules

CONVENTIONS apply. One that matters: skill never advances the phase. It only computes whether the advance is justified. The actual write happens in the calling skill (typically client-decision-capture), so the audit trail of who advanced what is preserved.

## Tool dependencies

- `project.get`
- `lenderApproach.listByProject`
- `knowledge.getChecklistByProject`
- `documents.getByProject` (for facility-letter, drawdown-doc detection)
- `atoms.search` (for decision records; `knowledge.queryIntelligence` fallback only, when the deal's graph is empty — not yet atomized)
- `milestone.listByProject` (for case-study detection on completion)

## What goes wrong

1. **Selected lender declined post-credit**: deal cannot advance to `post_credit`. Skill returns shouldTransition false; blockers explain.
2. **Multiple lenders at `credit_approved`**: deal could pick. Skill returns shouldTransition true for the most-recent or operator-flagged selected one; notes the alternatives.
3. **Drawdown happened but documents are not yet on file**: the 14-day grace window catches this; skill returns true with a note that file capture is pending.
4. **Phase rollback is needed** (client withdrew during credit submission): outside this skill's scope. Client-decision-capture handles the `dropped` path.
5. **Items marked complete but the document is the wrong file type**: skill respects the checklist's status field, does not re-verify. (The classification critic is the right layer to catch mis-classifications.)
