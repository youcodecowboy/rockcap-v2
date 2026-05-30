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
3. **Tier-1 discovery** (auto): START with `companies.mapGroup({clientId})` — returns the group's CH numbers + controllers + each controller's `appointmentsLink` in one call (the starting point). THEN walk each `appointmentsLink` via `companies.getOfficerAppointments`; search CH by `schemeName` (`companies.searchCompaniesHouse`); for each discovered entity `companies.syncCompaniesHouse` then ownership (PSC) + charges check one hop. Build `StructureGraph` nodes/edges with evidence + confidence + flags (`director-not-owner`, `brand-not-borrower`, `band-only`, `ceased`, `dissolved`).
4. **Stress-test** — adversarial completeness re-search (scheme name, spellings, controllers' associates); add unconfirmed entities as `role:"unknown"` nodes with an `unverified` edge. The verdict (`gradeStructure`) is returned by `structure.renderChart` in step 6 — the agent does not call `gradeStructure` directly.
5. **Tier-2** (only if `tier:"expand"` or verdict low): recurse into new controllers until no new `41xxx`/`68xxx` entity; cap depth 2 + 40 nodes; `log` what was dropped.
6. **Render** — call `structure.renderChart({graph})` → `{svg, dataUri, verdict}` (runs the grader + renderer server-side). Set `graph.verdict = verdict` — the route's recompute is authoritative; keep the persisted graph in sync with the rendered chart's badge. Persist the graph on the skillRun.
7. `skillRun.complete({structureGraph: graph, intelMarkdown, linkedClientId, gaps})` — embed the returned `dataUri` as a markdown image (`![Corporate structure](<dataUri>)`) in `intelMarkdown` under a "Corporate structure" heading, persist the graph via `structureGraph: graph`, set `linkedClientId`, and pass the verdict's `openQuestions` as `gaps`.

## Outputs
- `StructureGraph` JSON on the skillRun.
- SVG embedded (image) in `intelMarkdown`; available inline for the lender brief's Corporate Structure section.

> **Ownership only:** the chart shows ownership edges only — directed-but-not-owned entities are recorded in the graph (for the verdict + track record) but excluded from the SVG by the renderer.

## References
- `../../../model-testing-app/src/lib/structure/types.ts` (schema)
- `../../sub-skills/resolve-related-entities.md` (discovery walk)
- `../../shared-references/doc-type-lender-brief.md` (Corporate Structure section)

## Style rules
Evidence-first: every edge cites a CH filing. **Director ≠ owner** — confirm ownership before any `owns`/`role` claim. Never present `soft`/`band-only` as confirmed.
