# deal-intake

Step 7 of the deal lifecycle. A client has provided initial scheme documents and we need to stand up a deal: create the project, populate the underwriting model, initialise intelligence, set up the checklist.

## Trigger

Invoke when the operator has received a meaningful first batch of documents from a borrower (appraisal, floor plans, planning pack, scheme brief) and wants to spin up a tracked deal. Common forms:

- "{Borrower Co.} just sent across the pack for the {Scheme}, let's intake it"
- "Spin up a deal off these documents for {Client}"
- "Run intake on the upload batch {batchId}"

## Inputs

Required (one of):

- `clientId` plus `documentIds[]`: an existing client and a set of just-uploaded documents
- `bulkUploadBatchId`: a batch from the file upload queue

Optional:

- `projectName`: human-readable name; otherwise derived from the scheme address or appraisal title
- `projectShortcode`: 10-character code for document naming; otherwise auto-generated
- `expectedDealPhase`: defaults to `indicative_terms`

## Outputs

Persisted to Convex:

1. A new `projects` row with the resolved name, shortcode, dealPhase, and clientRoles linking the borrower.
2. The default folder structure for the borrower's project-level template (8 folders).
3. The 6 indicative-terms-phase requirements seeded as `knowledgeChecklistItems` rows.
4. Documents from the input batch classified and filed via the placement rules. Any that matched a checklist item are linked via `knowledgeChecklistDocumentLinks`.
5. A populated underwriting model (XLSX) staged in `modelRuns` with extracted figures from the appraisal and cashflow.
6. An initial `projectIntelligence` row with the scheme address, scheme type, GDV/TDC estimates from the appraisal, and a `sourceType: "ai_extraction"` trail.
7. A summary `knowledgeBankEntries` row of `entryType: "deal_update"` capturing the intake event.

## Workflow

1. Validate the input. If `bulkUploadBatchId` was given, list the batch items. If `documentIds[]`, verify each exists.
2. Resolve or create the project. Use the appraisal or scheme brief to extract a sensible name and address. If the scheme already has a project under the same client (by name match or shortcode hint), update instead of duplicate.
3. Seed the project folder structure via the borrower project-level template.
4. Seed the indicative-terms-phase requirements (6 items per the borrower template).
5. For each input document, classify via the V4 pipeline. Route to the correct project folder via `documentPlacementRules`. Link to checklist items where the matchingDocumentTypes align.
6. Extract scheme figures from the appraisal and cashflow: GDV, TDC, equity, unit count, asset class, location. Write each as `knowledgeItems` rows.
7. Populate the underwriting model template using the `template.populate` primitive (BL-5.6) with the extracted figures keyed against `modelingCodeMappings`. Stage as a `modelRuns` row with version 1.
8. Write the initial `projectIntelligence` row pulling from the same extracted figures.
9. Write a knowledge bank entry summarising the intake.
10. Return a brief to the operator: project ID, what was extracted, what's missing for the current phase.

## Style rules

All CONVENTIONS apply. Two that matter most:

- **Do not promote.** Intake creates a project, not a closed-won deal. Stage is `indicative_terms`; no facility figures committed.
- **Cite extractions.** Every figure written to intelligence has a `sourceRef` pointing at the source document. Operators can audit the extraction.

## Tool dependencies

- `client.get`, `client.checkExists`
- `project.create`, `project.suggestShortcode`
- `bulkUpload.getItems`, `documents.list`
- The V4 classification primitive (currently `/api/v4-analyze`; future the unified `document.extract`)
- `folderStructure.mapCategoryToFolder`, `placementRules.applyForCategory`
- `knowledge.linkDocumentToRequirement`, `knowledge.addItem`
- `intelligence.initialiseProjectIntelligence`, `intelligence.updateProjectIntelligence`
- `template.populate` (planned, BL-5.6) for the underwriting model
- `modelRuns.create`

## What goes wrong

1. **Appraisal extraction failed**: figures are ambiguous or the appraisal is in a non-standard format. Skill stages the project shell, populates what it can, and flags missing key figures for manual entry.
2. **The scheme already has a project**: detected by name + client + shortcode overlap. Skill switches to update mode, layering new documents and figures onto the existing project rather than creating a duplicate.
3. **Mixed asset classes in one upload**: the batch contains documents from two unrelated schemes. Skill stops and asks the operator to split the batch.
4. **No appraisal in the batch**: the underwriting model cannot be populated. Skill creates the project shell and stages a checklist ask for the appraisal.
5. **Sponsor inferred from documents differs from clientRoles**: the docs reference a different entity to the client. Skill flags the structural mismatch for operator review.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/document-checklist-canon.md`
- `../../shared-references/approval-payload-shapes.md`
- This skill's own references to be authored: `intake-extraction-heuristics.md`, `underwriting-model-population.md`.
