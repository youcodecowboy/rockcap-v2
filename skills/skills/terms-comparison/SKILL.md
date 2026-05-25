# terms-comparison

Step 9 of the deal lifecycle. Multiple lenders have returned indicative terms; this skill normalises them into a common shape, runs sensitivities against the underwriting model, and drafts a recommendation grounded in the numbers.

## Trigger

Invoke when two or more `lenderApproaches` rows for a project have moved to status `indicative_received`. Common forms:

- "Compare the terms for {Project}"
- "We have four indicatives in, draft the comparison and recommendation"

## Inputs

Required:

- `projectId`: the project being compared

Optional:

- `includeWithdrawn`: include lenders who passed; defaults to false but useful when the operator wants the full picture
- `clientPreference`: free-text on what the client has signalled they care about most (rate vs LTV vs speed vs flexibility)

## Outputs

Persisted to Convex:

1. **A normalised comparison table** as a `knowledgeItems` row with `fieldPath: "terms_comparison.<projectId>"` and a structured payload (one column per lender, one row per term).
2. **Updated `lenderApproaches` rows** with `indicativeTerms` filled in from the normalised values (one canonical shape, even if the source documents differed).
3. **Sensitivity outputs** stored in a fresh `scenarios` + `scenarioResults` pair against the project's `modelRuns`. Sensitivities cover: rate +50bps and +100bps, LTGDV +5%, GDV -10%, build cost +10%, timeline +3 months.
4. **A recommendation document** staged as `approvals` row of type `document_publish`. Identifies the recommended lender and the reasoning, including pros and cons of each alternative.
5. **A summary `knowledgeBankEntries` row** of `entryType: "deal_update"` capturing the comparison event.

## Workflow

1. Load the project and all `lenderApproaches` with `status: "indicative_received"`. If `includeWithdrawn`, also include `withdrawn`, `credit_declined`, etc.
2. For each approach, extract the indicative terms from the source document (term sheet, indicative letter). Use the V4 extraction primitive with the term-sheet schema as the target.
3. Normalise to a common shape: facility size (£), LTGDV (%), LTC (%), all-in rate (% or bps margin over reference), key fees (arrangement, exit, non-utilisation), tenor (months), required equity (£), profit share / PCP (if any), key conditions precedent.
4. Build the comparison table. Flag any cell where the source document was ambiguous; do not fabricate.
5. Run sensitivities against the underwriting model for each lender's central terms. Use the `modelRuns` infrastructure with a scenario per lender.
6. Score each lender on the dimensions the client prefers (using `clientPreference` if provided; else use a default weighting of rate 40%, leverage 30%, speed 15%, conditions 15%).
7. Draft the recommendation document. Structure: executive summary, comparison table, sensitivities, pros and cons per lender, recommendation with rationale.
8. Stage the document as a `document_publish` approval.
9. Return a brief: number of lenders compared, recommended lender, headline reasoning.

## Style rules

All CONVENTIONS apply. Two that matter most:

- **Numbers, not adjectives.** "70% LTGDV" not "high leverage". "8.5% all-in at SONIA + 450bps" not "competitive pricing".
- **Trade-offs explicit.** Every recommendation names what it gives up. If Lender A is recommended, name the things Lenders B and C offer that A does not.

## Tool dependencies

- `project.get`, `lenderApproach.listByProject`
- `documents.getByProject` (to find the term sheets)
- The V4 extraction primitive (currently `/api/intelligence-extract`; future the unified `document.extract` with term-sheet schema)
- `modelRuns.getLatest`, `scenarios.create`, `scenarioResults.create`
- `knowledge.addItem` for the comparison table
- `approval.create` for the recommendation doc
- `lenderApproach.update` for the normalised terms

## What goes wrong

1. **Term sheet extraction unreliable**: one lender's document is poorly structured. Skill extracts what it can, flags the unclear cells, asks operator to confirm before drafting.
2. **Sensitivities show a recommended lender failing on a base case stress**: skill flags this prominently in the recommendation; "Lender A is the recommendation but the model breaks at GDV -10%, which the client should know about".
3. **No clear winner**: scores cluster within 5%. Recommendation defers to the operator and presents the comparison without picking. Surface the deadlock explicitly.
4. **Client has stated a hard requirement** (e.g., must close in 30 days): skill applies it as a filter before scoring, drops lenders who cannot meet it.
5. **A lender's indicative is materially better than the rest**: skill flags as possibly mis-priced (lender may not have understood the deal); recommend operator clarify before optimistically pursuing.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/approval-payload-shapes.md`
- This skill's own references to be authored: `term-sheet-extraction-schema.md`, `scoring-weights.md`, `sensitivity-recipe.md`.
