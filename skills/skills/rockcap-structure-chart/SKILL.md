---
name: rockcap-structure-chart
description: |
  Build a borrower / borrower-group ownership Structure Chart for a RockCap scheme as a
  one-slide PowerPoint (.pptx). Walks the Companies House PSC register to derive the
  ownership chain from the borrowing SPV up to the ultimate beneficial owner(s), then
  renders the chart in RockCap house style (Calibri, navy/light-blue palette, 16:9).

  TRIGGER when Rayn or Alex says: "draft a structure chart", "build a structure chart
  for [scheme]", "[scheme] borrower structure chart", "ownership chart", "ownership
  structure chart", "draw the structure", "structure chart for the borrower", "give
  me an org structure for [SPV]", or invokes the `/structure-chart` slash command.

  SCOPE — borrower / corporate-ownership charts only. NOT for organisational charts
  (staff hierarchies — different document type, not driven by CH). NOT for security /
  charge perimeter diagrams (those go in the Lender Note or as separate annexes).
  NOT for financial / debt-stack waterfalls — that is a separate skill TBC.

  Three layout patterns supported, picked from the CH PSC topology:
    1. SIMPLE CHAIN (default): single vertical column, SPV at top → UBO at bottom.
       Used when each layer has exactly one PSC. Example: Horton.
    2. BRANCHING TREE: two or more SPVs at top converging to one or more UBOs.
       Used for multi-parcel deals or where the lender has 1st-charge over more
       than one borrower. Example: Mitcham (2 SPVs, single UBO each).
    3. JV / MULTI-INVESTOR: non-100% splits, multiple ultimate owners at the
       bottom row. Used when CH PSC shows multiple individuals with significant
       control or where share-class detail matters. Example: Herne Hill.

  Always sources from Companies House. Never guesses share splits. If CH only
  reports a band (e.g. "75-100%"), check whether the latest CS01 with-updates or
  the original NEWINC Statement of Capital gives a precise number; otherwise the
  band is shown verbatim and flagged in the footer.
license: Proprietary (RockCap internal)
compatibility: claude-code
---

# RockCap Structure Chart Skill

You are producing a one-slide borrower **Structure Chart** for a RockCap scheme.
Output is a `.pptx` saved into the project's `outputs/` folder and (if the scheme
has one) mirrored to its `4. Credit/` or `4. Credit Submission/` folder on H:\.

## When to use this skill

Triggered by: "structure chart", "ownership chart", "build me the structure for
X", "/structure-chart", or similar phrasings. See the description block above.

## When NOT to use this skill

- Staff org charts / management diagrams. Different doc type, not CH-driven.
- Security / charge / debt-stack diagrams. Belong in the Lender Note or as a
  separate annex. (Horton V1.0 had this content baked in; V1.3 stripped it back
  to pure ownership only — that's the canonical pattern.)
- Sources & uses, debt waterfalls, cashflow visuals. Not yet automated.

## Source of truth

**Companies House PSC register**, walked recursively from the borrowing SPV up to
the UBO. Never guess share splits or invent intermediate entities. If CH PSC
only reports a band ("75-100%"), check the original NEWINC Statement of Capital
(filed at incorporation) and any later CS01 with-updates filings for the precise
share count. If still ambiguous, render the band verbatim and add a footer note
flagging it.

Companies House API key lives in `~/.claude/.env` as `COMPANIES_HOUSE_API_KEY`.
Both REST endpoints used (auth = key as username, blank password):

- `GET /company/{number}` — basic company details
- `GET /company/{number}/persons-with-significant-control` — PSC list (the
  ownership above this entity)
- `GET /company/{number}/filing-history?items_per_page=100` — filing list,
  used to find NEWINC + any with-updates CS01s for precise shareholding
- `GET /document/{id}/content` (document-api host) — fetch any filing PDF

## Workflow

### 1. Confirm the inputs

Before doing anything, you need:

- **Root SPV company number** (8 digits or LLP-style `OC######`). If only the
  scheme name is given, look up the SPV in the project's `SESSION_STATE.md`
  or `.claude/CLAUDE.md` first.
- **Output directory**. Default: `<project root>/outputs/`. Mirror to H:\
  Credit folder if one exists.
- **Filename**. Use RockCap convention:
  `<Scheme>_StructureChart_<author>_<EXTERNAL>_V<n.n>_<YYYYMMDD>.pptx`
  Example: `Horton_StructureChart_RS_EXTERNAL_V1.0_20260511.pptx`

If anything is missing, ask one clarifying question (not five) — Rayn has ADHD,
keep prompts tight.

### 2. Walk the PSC chain

Use `scripts/walk_psc.py`:

```
python scripts/walk_psc.py <ROOT_COMPANY_NUMBER> [--max-depth 6]
```

Walks PSCs upwards from the SPV. For each layer:
- Records the company number, name, registered office, status
- Records all PSCs (corporate + individual)
- For each corporate PSC, recurses up
- Stops at individuals (UBOs) or depth limit (default 6)
- Detects branches (multiple PSCs at same level) and joint ownership

Outputs JSON tree to stdout. Pipe into the chart builder.

### 3. Pick the layout pattern

Based on the JSON tree topology:

| Topology | Layout | Reference |
|---|---|---|
| Each level has exactly 1 PSC, terminating in 1 UBO | **Simple chain** (vertical) | Horton V1.3 |
| Multiple SPVs at top, common parent below | **Branching tree** | Mitcham V1.1 |
| Multiple UBOs at bottom OR non-100% splits | **JV / multi-investor** | Herne Hill |

If the topology is genuinely simple, default to the simple chain. Don't over-
engineer with a branching layout when a single column will do — Rayn will tell
you to strip detail back if you do.

### 4. Build the chart

Use `scripts/build_chart.py`:

```
python scripts/build_chart.py --input tree.json --output <path.pptx>
                              --title "<scheme address>" --layout chain
```

Produces a one-slide PPTX following the RockCap house style (see
`references/style_guide.md` for exact colours, fonts, margins).

### 5. Save + present

- Save to project `outputs/`.
- Mirror to H:\ Credit folder if one exists for the scheme.
- Tell the user the filenames + any flags (e.g. "PSC band shown verbatim because
  share register not seen").
- Don't include lender boxes, security flows, contractor relationships, or
  financial detail unless the user explicitly asks. The default chart is
  ownership-only.

## House style anchors

(Detailed in `references/style_guide.md`. Brief version here.)

- **Slide**: 13.333" × 7.5" (16:9)
- **Title**: Calibri 18pt bold, navy `#0A2A4F`. Format: `<address> — Borrower Structure Chart`
- **Subtitle**: Calibri 11pt, grey `#4A4A4A`. Format: `Prepared by RockCap   |   <DD/MM/YYYY>`
- **SPV / shareholder boxes**: rounded rectangle, light-blue fill `#D9E2EC`, navy 1pt outline. Box title 12-13pt bold navy. Box detail 9-10pt navy.
- **Connectors**: navy 1pt straight lines.
- **Connector labels** (e.g. "100%"): white-fill text box, no outline, Calibri 10pt bold navy, centred on the line.
- **Footer**: Calibri 9pt grey. One line. Always cite "Source: Companies House PSC register."
- **Default box content**: company name (uppercase) + `Co. <number>`. Nothing else. Add registered office or status only if the user asks.

## Naming convention

`<Scheme>_StructureChart_<author-initials>_<EXTERNAL>_V<major.minor>_<YYYYMMDD>.pptx`

- `<Scheme>` matches the project folder name (no spaces).
- `<author-initials>` = `RS` for Rayn, `AL` for Alex, `RS_AL` for joint.
- `<EXTERNAL>` if the chart is going to a lender. Omit (or use `INTERNAL`) for
  internal-only working drafts.
- Version: bump `.minor` for content tweaks (e.g. removing detail), bump `.major`
  for structural changes (e.g. switching from chain to branching).

## Reference examples

- `references/horton_chain_reference.pptx` — canonical simple chain. SPV → Land
  Co → Group Co → UBO. 4 boxes, 3 connectors, 100% throughout.
- `references/mitcham_branching_reference.pptx` — canonical branching tree. 2
  SPVs at top, common UBO below. Useful when the deal has multiple borrowing
  entities.
- `references/style_guide.md` — exact colours, fonts, margins, spacing rules.

## Pitfalls (learned, don't repeat)

- **Don't put AM at the top of the chart**. UBO sits at the BOTTOM, per Mitcham
  convention. The flow reads "SPV is owned by … which is owned by … ultimately
  controlled by [UBO]".
- **Don't add lender boxes by default**. Strip back to pure ownership unless
  asked. Lender + security detail belongs in the Lender Note.
- **Don't use diagonal lines that cross other boxes**. If a relationship is
  awkward to draw (e.g. UBO providing PG to a lender that sits in another
  column), describe it inside a box rather than drawing a clutter line.
- **Don't infer 100% from a 75-100% PSC band without checking**. Pull the
  NEWINC Statement of Capital first. If precise share count is in the doc,
  use it. If not, render the band verbatim and flag it.
- **Don't list every directorship inside the UBO box**. Keep the box concise
  (name + "Ultimate beneficial owner"). Director footprint belongs in KYC
  Appendix A, not the structure chart.
- **Don't include the contractor as a separate box** unless the contractor is
  itself a borrowing entity or guarantor. Common ownership of contractor is
  worth a footnote at most.

## Edge cases

- **LLPs**: PSC structure differs (members vs shareholders). The walker handles
  both; the chart treats LLP "members with significant control" the same as
  shareholders.
- **Foreign parents**: render with the registered jurisdiction (e.g.
  "Falco Capital Limited (Jersey)"). Don't try to walk further up unless CH
  records the foreign parent's identification.
- **Trusts**: appear as "trustee acting on behalf of [trust name]" on CH.
  Render verbatim.
- **Dissolved / struck-off intermediates**: include but flag in the box subtitle
  ("Dissolved 12/03/2024 — historic owner only").
- **Share-class splits** (A/B/C, ordinary/preference, loan notes): if relevant
  to ownership economics, render the split inside the connector label
  (e.g. "100% A shares") rather than collapsing to a single % figure.
