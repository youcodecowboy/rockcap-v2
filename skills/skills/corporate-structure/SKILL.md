# corporate-structure

Discover, stress-test, and chart a prospect/borrower's corporate structure. Produces a `StructureGraph` (persisted on the skillRun) and a styled SVG that renders in the prospect Intel tab and embeds in lender briefs and future documents.

## Trigger
- Operator: "map / chart the structure of {client}".
- Invoked by `prospect-intel` step 8b as part of intel.

## Inputs
Required: `clientId`. Optional: `schemeName` (improves the scheme-name search), `tier` ("direct" default, or "expand").

## Workflow
1. `skillRun.start` (dedupKey `structure:${clientId}`, window 1 day).
2. **Resolve controllers** — through any corporate PSC down to the individuals.
3. **Tier-1 discovery** (auto): walk each controller's appointments (`companies.getOfficerAppointments`); search CH by `schemeName` (`companies.searchCompaniesHouse`); for each discovered entity `companies.syncCompaniesHouse` then ownership (PSC) + charges check one hop. Build `StructureGraph` nodes/edges with evidence + confidence + flags (`director-not-owner`, `brand-not-borrower`, `band-only`, `ceased`, `dissolved`).
4. **Stress-test** — adversarial completeness re-search (scheme name, spellings, controllers' associates); add unconfirmed entities as `role:"unknown"` nodes with an `unverified` edge. Call `gradeStructure(graph)` for the verdict.
5. **Tier-2** (only if `tier:"expand"` or verdict low): recurse into new controllers until no new `41xxx`/`68xxx` entity; cap depth 2 + 40 nodes; `log` what was dropped.
6. **Render** `buildStructureChartSvg(graph)`; persist the graph on the skillRun.
7. `skillRun.complete` with the graph, the SVG (or its data-URI), `linkedClientId`, and the verdict's `openQuestions` as gaps.

## Outputs
- `StructureGraph` JSON on the skillRun.
- SVG embedded (image) in `intelMarkdown`; available inline for the lender brief's Corporate Structure section.

## References
- `../../../model-testing-app/src/lib/structure/types.ts` (schema)
- `../../sub-skills/resolve-related-entities.md` (discovery walk)
- `../../shared-references/doc-type-lender-brief.md` (Corporate Structure section)

## Style rules
Evidence-first: every edge cites a CH filing. **Director ≠ owner** — confirm ownership before any `owns`/`role` claim. Never present `soft`/`band-only` as confirmed.
