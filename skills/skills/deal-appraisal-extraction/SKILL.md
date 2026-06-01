# deal-appraisal-extraction

**Last hardening:** NEW 2026-06-01 (v1)

Pull the key financial figures out of a development **appraisal spreadsheet**
(GDV, total development cost, unit schedule, peak debt, LTGDV, profit-on-cost, …)
and persist them as structured, template-ready fields — **the extraction is done
Claude-side**, not by a server pipeline.

The server only hands over the cells (`document.getSheetData`); you read them,
reason out which number is which (appraisal layouts vary wildly — that's exactly
why a reasoning model does this better than a rigid parser), and write the figures
back with provenance (`document.saveIntelligence`). The figures are tagged
(`templateTags`) so they can later re-populate appraisal templates.

## Trigger

- "Extract the figures from this appraisal." / "Pull GDV, TDC, units, peak debt off the model for {project}."
- Invoked by **deal-intake** step 11 (financial mining) once an appraisal spreadsheet is filed.
- After ingesting an appraisal via `document.requestUpload` + `document.analyze`.

## Inputs

- **Required (one of):** `documentId` of the filed appraisal spreadsheet, OR a raw `storageId` from `document.requestUpload`.
- **Optional:** `projectId` / `clientId` to scope the persisted figures (defaults to the document's own links).

## Dedup

Not a `skillRun`-enveloped client-data skill in the prospecting sense, but if run
under deal-intake use that run's envelope. Re-running is safe: `saveIntelligence`
supersedes prior facts at the same `fieldPath` from the same document.

## Cadence package

Does not produce one.

## Outputs

- **Data tab (primary):** each figure written via `projectData.upsertItem` into the
  project data library — the project/client **Data tab**. One call per figure with a
  canonical `itemCode` (see `references/appraisal-figures-canon.md`), `category`,
  `originalName`, numeric `value`, `dataType`, the source `documentId` (so it files
  under the document in the Data tab), and `note` = the **sheet!cell** provenance.
  Upsert by `(projectId, itemCode)` — re-running is safe. The library normalizes
  values + computes category totals.
- **Knowledge bridge (headline figures):** GDV, TDC, LTGDV, units also written via
  `intelligence.addKnowledgeItem` (scope `project`, `fieldPath: "financials.*"`) so
  `project.getDeepContext` + `lender.matchForDeal` can read them.
- A short brief: what was extracted, confidence, anything ambiguous left for the operator.

## High-level workflow

1. **Resolve the document.** From `documentId` (or `storageId`). If you only have a
   storageId, you can still read it; persist needs a `documentId`, so analyze/file
   it first (`document.analyze`) if it isn't a documents row yet.
2. **Get the cells.** `document.getSheetData({documentId})` → `{sheets:[{name, rows}]}`.
   For a big model raise `maxRows`. Identify which sheet is the appraisal/cashflow.
3. **Reason out the figures.** Map cells to the canonical fieldPaths
   (`references/appraisal-figures-canon.md`). Record the **sheet!cell** for each
   (e.g. `Appraisal!B12`). Convert to plain numbers (strip £, commas, %). If a
   figure is a range or unclear, capture it but mark low confidence — do not invent.
3. **Cross-check the arithmetic.** GDV − TDC ≈ profit; profit ÷ TDC ≈ profit-on-cost;
   loan ÷ GDV ≈ LTGDV. If the sheet's stated ratios don't reconcile with the
   figures you pulled, flag it rather than silently "fixing" it.
4. **Persist to the Data tab.** For each figure call `projectData.upsertItem({projectId,
   itemCode, category, originalName, value, dataType, documentId, note})` — `itemCode`
   + `category` from the canon, `value` a plain number, `note` the sheet!cell. Then
   bridge the headline figures (GDV/TDC/LTGDV/units) to `intelligence.addKnowledgeItem`
   (scope `project`, `fieldPath: financials.*`) for lender-matching.
5. **Brief.** Report the figures table, confidence, and any unreconciled / ambiguous
   items for the operator to confirm.

## Style rules

- **Provenance always.** Every figure carries the sheet!cell it came from in
  `sourceText`. A figure with no cell reference is not trustworthy.
- **Numbers are numbers.** Persist `value` as a number with `valueType: "number"`;
  don't store "£6.24m" as a string. Keep the original display in `label` if useful.
- **Don't invent or smooth.** If the model doesn't state a figure, leave it out and
  note the gap. Never back-compute a missing GDV from assumed ratios.
- Follow `../../CONVENTIONS.md`.

## Tool dependencies

- `document.getSheetData` — the cells (server parses, you extract).
- `projectData.upsertItem` — persist each figure into the Data tab (upsert by itemCode; carries documentId + cell provenance).
- `intelligence.addKnowledgeItem` — bridge headline `financials.*` figures for lender-matching / getDeepContext.
- `document.get` — resolve the document / its links.
- `project.getDeepContext` — confirm the project + read back what landed.
- `document.saveIntelligence` — optional: also record fields on the document's own intelligence (Knowledge tab).

## What goes wrong

- **Multiple appraisal scenarios in one workbook** (base / downside / multi-site).
  Extract the primary case; note the others exist; don't merge their numbers.
- **Figures as ranges** (GDV £6.0–6.4m). Capture the range in `label`, the midpoint
  (low confidence) in `value`, and flag for operator confirmation.
- **Build cost vs total cost confusion.** Construction cost ≠ TDC (TDC includes land,
  fees, finance, contingency). Map carefully; cross-check against the total row.
- **Ratios that don't reconcile.** Surface it; the model may have stale inputs.
- **Tempted to deep-parse a giant model.** Target the summary/appraisal sheet first;
  raise `maxRows` only if the headline figures live deeper.

## References

- [`references/appraisal-figures-canon.md`](./references/appraisal-figures-canon.md) — the canonical figure list + fieldPaths + templateTags.
- [`../../shared-references/uk-property-finance-glossary.md`](../../shared-references/uk-property-finance-glossary.md) — terminology (GDV, TDC, LTGDV, peak debt, …).
- [`../../CONVENTIONS.md`](../../CONVENTIONS.md) — cross-skill voice + style.
