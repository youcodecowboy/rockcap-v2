# Doc type: comps appendix (Master Comparable Schedule)

The RockCap **"Appendix A — Master Comparable Schedule"**: the comparable-evidence table attached to a lender credit pack (or a client brief) that **justifies a scheme's GDV pricing**. Output is a **spreadsheet (XLSX, primary)** or a **Word table (DOCX)** — *not* a PDF; these are working schedules, not prose. Built from structured **`compsData`** via the comps engine (`model-testing-app/src/lib/docgen/comps/`).

## Purpose
Evidence the per-unit / per-house-type pricing of a development by listing real comparable sales (and asking-level sentiment, flagged) with £psf, grouped into tiers, so a lender credit team can see the pricing is supported. The notes column carries the analytical argument ("older stock, needs £50k to reach NB spec, so our new-build should trade above this").

## Render path
Compose a `CompsAppendixData` object (`model-testing-app/src/lib/docgen/comps/types.ts`) and call **`generateComps`** (MCP: **`document.generateComps`**) with `{ title, compsData, clientId, formats? }`. It renders XLSX (default) and/or DOCX (via `/api/documents/generate` → `renderCompsAppendix`) and stages a `document_publish` approval. Default format is **xlsx**; pass `formats: ["xlsx","docx"]` for both. PDF is not supported.

## Structure (`compsData`)
- **title** — sheet heading, e.g. "Horton — Master Comparable Appendix".
- **subtitle** — scheme address + purpose, e.g. "Land at …, GL5 2TG. Comparable evidence for lender credit pack."
- **preparedBy** — e.g. "Prepared by RockCap Ltd | May 2026 | All comps are materially older stock".
- **sheets[]** — one tab each. A single tiered schedule = one sheet; a hero / second-hand / new-build pack = several.
  - **name** — tab name ("Appendix A", "Hero Comps", "New Build").
  - **intro[]** *(optional)* — framing bullets above the table.
  - **columns[]** — left-to-right column defs: `{ key, label, type?, role?, width?, align? }`.
    - `type`: `text` | `price` | `psf` | `number` | `date` | `link`. `price`/`psf` format as £; `link` is a hyperlink cell; `date` is free text (so "Asking" / "Oct 2024" / ISO all work).
    - `role`: set `price` / `sqft` / `psf` on those three columns to enable **£psf auto-compute**.
  - **tiers[]** — grouped sections: `{ heading?, rows[], average? }`. For a flat, ungrouped sheet use a single tier with no `heading`.
    - **heading** — full-width banded section header, e.g. "TIER 1: WALL HALL (WD25) — Tier 1 Benchmark".
    - **rows[]** — each `{ cells, excludeFromAverage?, isSummary? }`. `cells` is keyed by column key; numeric columns take numbers, a `link` column takes `{ text, url }`. **Leave the £psf cell empty to have it computed** (price ÷ sqft, rounded).
    - **average** — optional per-tier average row: `{ label?, auto: ["price","sqft","psf"] }` means-averages those columns across non-excluded rows; or supply an explicit `row`.

### Typical column set (the common single-schedule case)
`Scheme · Unit/Address · Date · Price (£) · SqFt · £/psf · Type · Beds · Notes · Evidence`. (Some packs add `Svc Chg`; the analytical "hero" tab adds target price/£psf, GDV, delta, distance, condition.)

## The two real shapes
1. **Single tiered schedule** (Leafield, Dark Mills, Master Houses, Temple Dinsley): one sheet, tier bands (TIER 1/3/5 or "New Build / Local Resale"), standard columns. Most requests are this.
2. **Multi-tab analytical pack** (Horton): several sheets ("Hero Comps" with target-vs-comp analytical columns, "Second Hand", "New Build"), rows grouped by bed count, each group ending in an **Average** row. Use multiple `sheets[]` + per-tier `average`.

## House style (applied by the engine — do not hand-format)
Title bold 14pt RockCap blue (#1F4E79); prepared-by 9pt grey; **tier band** full-width #2E5090 white bold; **header row** #1F4E79 white bold centred; price/£psf as `£#,##0`; notes column wide + wrapped; **average rows** light-blue (#EAF0F8) bold; evidence links as blue hyperlinks.

## Sourcing (required — never fabricate)
Every comp must trace to real evidence — Land Registry sold prices and agent/portal listings (Rightmove, agent particulars). Read the deal's own appraisal/valuation and any existing comps work first (`document.search` / `document.get`), then `project.getDeepContext` / `client.getDeepContext` for the scheme's unit schedule and target pricing.
- **Asking ≠ achieved.** Flag asking/marketing rows and set `excludeFromAverage: true` so they don't inflate the tier mean. Put the achieved-vs-asking caveat in the notes.
- **£psf integrity.** Provide price + sqft and let the engine compute £psf, so the maths is always consistent. Note where a sqft figure includes a garage/excludes habitable area (it distorts £psf).
- **Cite the source** in the Evidence column (a link where you have one).

## Avoid
- Inventing prices, sqft or addresses; quoting a £psf that doesn't reconcile to price ÷ sqft.
- Letting asking-level rows into the average (set `excludeFromAverage`).
- Forcing a date number-format — dates are free text ("Asking", "Q. Dec 25", "Oct 2024").
- Producing a PDF — comps are XLSX/DOCX.

## Worked examples
Reproduced in `model-testing-app/src/__tests__/compsAppendix.test.ts`: **Leafield** (single tiered schedule, auto-computed £psf, hyperlink evidence) and **Horton** (multi-tab: New Build with a per-bed auto-average + Second Hand).
