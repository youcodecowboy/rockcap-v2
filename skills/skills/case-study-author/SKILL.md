# case-study-author

> **⚠ v1 SKELETON — not yet operational.** This skill documents *intended* behaviour for a future version. Some tools it references are **not yet in the MCP surface** (see `../../CATALOGUE.md` → "What's NOT yet MCP-exposed"). If a user triggers this skill: tell them this workflow isn't built yet, do only what the **live** tools (in `tools-manifest.json`) allow, and **never call a tool that isn't in the manifest** — log the rest as gaps via `skillRun.complete`.

Step 13 of the deal lifecycle. A deal has closed (won or lost). This skill assembles the artefacts, drafts a case study, and seeds it into the precedent library that future deals draw on.

## Trigger

Invoke when a project moves to a closed state. Common forms:

- "Write up the case study for {Project}"
- "{Scheme} closed today, draft the precedent record"
- Auto-trigger on `projects.dealPhase` transition to `completed` or on `projects.lifecycleStage` transition to `completed` or `cancelled`

## Inputs

Required:

- `projectId`: the closed deal

Optional:

- `outcome`: `closed_won` or `closed_lost`; inferred from project state if absent
- `narrativeFocus`: free-text on what to emphasise (e.g., "the speed of execution", "the deal structure innovation")
- `confidentiality`: `internal_only` (default), `anonymised_external`, `full_external` (rare; only with client consent)

## Outputs

Persisted to Convex:

1. **A case study document** in `_storage` as a DOCX file. Two versions when applicable: internal (full detail) and anonymised (placeholder names for borrower, sponsor, scheme).
2. **An `approvals` row** of type `document_publish` for the case study, with `relatedProjectId` set.
3. **A `knowledgeBankEntries` row** of `entryType: "deal_update"` with `sourceType: "case_study"` summarising the deal and key learnings.
4. **A `documents` row** in the internal documents scope linking the case study so it shows up in the firm-wide precedent library.

## Workflow

1. Load the deal in full via `deal.get_full_context` (BL-5.4). Include all lenderApproaches (even closed_lost), all milestones (including missed), all documents, all touchpoints with key counterparties, the underwriting model versions.
2. Pull the timeline: when did the deal start, when did each milestone hit, where did it slow down or speed up. Use `milestones` actualDate vs targetDate to flag deviations.
3. Identify the key learnings. Categories:
   - **What worked**: the lender that closed, the structure that landed, the document that unlocked.
   - **What was hard**: the milestone that slipped, the diligence that was unexpectedly painful, the term that took multiple rounds.
   - **What we'd do differently**: a narrow recommendation for future similar deals.
4. Compose the case study using `template.populate` against the `case-study.docx` template. Sections:
   - Headline: scheme, sponsor, facility, timing.
   - The deal: what it was, why it came to us, what made it interesting.
   - Execution: timeline highlights, key decisions, the lender pivot if any.
   - Numbers: GDV, TDC, facility, equity, LTGDV, LTC, all-in rate at signature.
   - Learnings: structured per the categories above.
   - Precedent value: what future deals can reuse from this one (a lender that has appetite for this asset class, a structure that worked, a contact who proved useful).
5. If `confidentiality !== "internal_only"`, run the anonymisation pass per `../../corpora/README.md` rules.
6. Stage the case study as a `document_publish` approval.
7. Write the knowledge bank entry. This is the structured record that becomes searchable when a future skill asks "have we done a deal like this before".
8. Return a brief: outcome captured, key learnings, where the case study lives.

## Style rules

All CONVENTIONS apply. Two that matter most:

- **Honest about losses.** A closed-lost case study is more valuable than a closed-won one for future learning. Do not soft-pedal what went wrong.
- **Specific, not generic.** "Lender X dropped indicative pricing by 25bps after the second QS report" is useful precedent. "We negotiated hard" is not.

## Tool dependencies

- `deal.get_full_context` (BL-5.4, planned)
- `milestone.listByProject`
- `lenderApproach.listByProject`
- `documents.getByProject`
- `touchpoint.getByProject`
- `modelRuns.listByProject` (for facility figures at various points)
- `template.populate` (BL-5.6, planned)
- `approval.create` of type `document_publish`
- `knowledge.addEntry`
- `documents.create` in the internal scope for the precedent library entry

## What goes wrong

1. **Closed-lost with sparse data**: deal died early; not much to learn from. Skill produces a short record and stops.
2. **The deal was contentious**: post-mortem reveals disagreement about what went wrong. Skill captures the disagreement structurally; does not arbitrate.
3. **Anonymisation incomplete**: confidentiality is set to anonymised but some details cannot be safely abstracted (e.g., a unique architectural feature that identifies the scheme). Skill flags the items that resist anonymisation and asks the operator to decide.
4. **Closed-won but the lender is now under regulatory scrutiny**: skill captures faithfully but holds external publication; flags for operator review.
5. **Two projects with shared sponsors**: closing one references work from the other. Skill cross-links the case studies but does not duplicate content.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/approval-payload-shapes.md`
- `../../corpora/README.md` (anonymisation rules)
- `../../templates/README.md` (case-study.docx template)
- This skill's own references to be authored: `learnings-extraction-rubric.md`, `precedent-library-tagging.md`.
