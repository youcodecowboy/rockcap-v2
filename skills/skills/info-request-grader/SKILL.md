# info-request-grader

Step 11 of the deal lifecycle (parallel to ic-paper-drafter). The lender (or another counterparty) has sent a list of information requirements. This skill ingests the list, grades each item by priority and blocking-ness, maps to existing checklist items where possible, and surfaces gaps.

## Trigger

Invoke when an information request document or email arrives, or when an operator wants to assess what an upcoming submission needs. Common forms:

- "Grade these info requests from {Lender}: {pasted list or document id}"
- "What's blocking the IC submission for {Project}"
- "Process the lender's request list, then tell me what's outstanding"

## Inputs

Required (one of):

- `documentId`: a document containing the request list (often a PDF or a lender's standard info pack)
- `inboundEmailText`: pasted email body with the list inline
- `requestItems[]`: structured list when already parsed elsewhere

Plus:

- `projectId`: the deal the request is against
- `sourceLenderClientId`: the lender (or other counterparty) issuing the request

Optional:

- `defaultPriority`: priority to apply to items without explicit guidance (defaults to `required`)
- `dueByDate`: target date for the package to be complete

## Outputs

Persisted to Convex:

1. **`knowledgeChecklistItems` rows** for each request item, with the BL-1.5 extension fields populated: `priority` (required/nice_to_have/optional), `isBlocking` (true if the lender explicitly states the deal cannot proceed without it), `rockcapStatus` (initial `not_started` or `in_progress` if a matching document is already on file), `lenderStatus` (initial `requested`).
2. **Links from existing requirements**: for any request item that maps to a `knowledgeRequirementTemplates` requirement we already track, the existing row's `lenderStatus` is updated to `requested` and `priority` may be elevated if the lender's request is stricter.
3. **`knowledgeBankEntries` row** of `entryType: "deal_update"` summarising the request: total items, blocking count, due-by date, source.
4. **Optional staged communication**: a `client_communication` or `gmail_send` approval to the borrower listing what we need from them.

## Workflow

1. Parse the input. If a document or email, extract the list of items. The V4 extraction primitive can parse list-shaped content; aim for structure `{ name, description?, priority?, dueBy?, blockingFlag? }` per item.
2. For each parsed item, attempt a match against existing requirements: by name similarity to `knowledgeRequirementTemplates.name`, by matching document types, by category.
3. For matches: update the existing `knowledgeChecklistItems` row. Set `lenderStatus: "requested"`. Elevate `priority` if needed. Set `isBlocking: true` if the source says so.
4. For unmatched items: create new `knowledgeChecklistItems` rows with `isCustom: true`, `customSource: "llm"`, the parsed priority and blocking flag, `lenderStatus: "requested"`, `rockcapStatus: "not_started"`.
5. Compute the gap list: which items have `rockcapStatus !== "complete"`. Within the gap list, blocking items lead.
6. If the operator wants the borrower-side ask staged, compose a brief listing what we need (named with canonical document types from the document taxonomy) and stage as an approval.
7. Return a structured summary: total requested, total matched-to-existing, total new, blocking count, gap list with named items, recommended next action.

## Style rules

All CONVENTIONS apply. Three that matter most:

- **Use canonical document type names.** The ask to the borrower references "RedBook Valuation", not "an appraisal report from a chartered surveyor". The recipient sees the same names as in the app.
- **Distinguish required from nice-to-have.** The grader's job is exactly this distinction. Errors here cost time later.
- **Surface blocking items prominently.** A request that is genuinely deal-blocking gets named at the top of the brief. Non-blocking items are listed but not highlighted.

## Tool dependencies

- `documents.get`, `documents.list`
- The V4 extraction primitive (currently `/api/intelligence-extract` or `/api/knowledge-parse`; future the unified `document.extract` with a request-list schema)
- `knowledge.getChecklistByProject`, `knowledge.linkDocumentToRequirement`, `knowledge.addItem`, `knowledge.updateChecklistItem`
- `knowledge.addEntry`
- `approval.create` for borrower-side asks

## What goes wrong

1. **Source document is unparseable**: it's a long narrative rather than a list. Skill asks the operator to either extract bullet points manually or paste the relevant section.
2. **Lender's list uses unfamiliar names**: "Funder's Acceptance Certificate" instead of standard terminology. Skill creates the item as custom, names it as the lender named it, but adds `isCustom: true` so the operator can confirm or rename.
3. **Duplicate items**: lender asks for "appraisal" and "valuation" as separate items. Skill flags possible duplicates rather than auto-merging.
4. **Items already complete**: the lender is asking for something we already have on file. Skill links the existing document, sets `lenderStatus: "received"`, and tells the operator no action is needed.
5. **Blocking and non-blocking mismatch**: the lender's list is silent on which items are deal-blockers. Skill applies a conservative heuristic (post-credit items are blocking, pre-IC items typically not) and flags items where the decision was not explicit.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/document-checklist-canon.md`
- `../../shared-references/approval-payload-shapes.md`
- This skill's own references to be authored: `request-parser-rubric.md`, `priority-elevation-rules.md`.
