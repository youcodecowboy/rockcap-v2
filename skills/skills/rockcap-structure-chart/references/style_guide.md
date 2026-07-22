# RockCap Structure Chart — House Style

Derived from Mitcham V1.1 (Lucien) and Horton V1.3 (Galion). Both follow the
same palette and typography. Diverge from this only with explicit instruction.

## Slide

- Aspect: **16:9**, dimensions **13.333" × 7.5"** (PowerPoint widescreen).
- Layout: blank (`slide_layouts[6]` in python-pptx).
- Margins: title block at top (`y=0.20-0.95`), footer at bottom (`y=7.22-7.45`).
  All chart content sits in `y=1.10-7.05`.

## Colour palette

| Element | Hex | RGB | Use |
|---|---|---|---|
| Navy | `#0A2A4F` | (10, 42, 79) | Box outlines, lender boxes (when present), title text, body text on light boxes, connector lines |
| Light blue | `#D9E2EC` | (217, 226, 236) | Fill for SPV / shareholder / UBO boxes |
| White | `#FFFFFF` | (255, 255, 255) | Text on navy boxes, fill for connector labels |
| Grey | `#4A4A4A` | (74, 74, 74) | Subtitle, footer text |

These match the wider RockCap house style (lender note, etc.) — same navy.

## Typography

| Element | Font | Size | Weight | Colour |
|---|---|---|---|---|
| Slide title | Calibri | 18pt | Bold | Navy `#0A2A4F` |
| Subtitle | Calibri | 11pt | Regular | Grey `#4A4A4A` |
| Box title (SPV / company name) | Calibri | 12-13pt | Bold | Navy on light fill, White on navy fill |
| Box subtitle (`Co. <number>`) | Calibri | 9-10pt | Regular | Same as box title colour |
| Connector label (`100%`, `75-100%`) | Calibri | 10pt | Bold | Navy on white-fill text box |
| Footer | Calibri | 9pt | Regular | Grey `#4A4A4A` |

## Box sizing

- Single-PSC chain (Horton): boxes ~5.0" wide × 0.95" tall (last box / UBO 0.75").
- Multi-SPV branching (Mitcham): SPV boxes ~4.6" × 1.7" with extra detail line.
- Always rounded rectangles. Outline 1pt navy.

## Connectors

- Plain straight lines, navy, 1pt. No arrowheads.
- A relationship is implicit by adjacency. Convention: line connects two
  entities, label sits on the line and states the relationship (`100%` for full
  ownership, `75-100%` for a CH band, `Build contract` for non-ownership
  relationships in the rare cases those are needed).
- **Avoid diagonal lines that cross other boxes.** If a relationship is hard to
  draw cleanly, describe it inside the relevant box rather than drawing the
  line.
- Don't use dashed lines unless the relationship is meaningfully different
  (e.g. contract vs ownership) — and even then, prefer to drop the line
  entirely and put the relationship in box copy.

## Title format

`<Site address or scheme reference> — Borrower Structure Chart`

Examples:
- `Land off Broadway Hill, Horton, Ilminster, TA19 9QU — Borrower Structure Chart`
- `192 London Road / Bond Road, Mitcham, CR4 3LD — Borrower Structure Chart`

## Subtitle format

`Prepared by RockCap   |   <DD/MM/YYYY>`

If multi-borrower or sent to a specific lender, prepend the lender name:
`Pallas Capital credit submission   |   Prepared by RockCap   |   28/04/2026`

## Box content rules

**Default (always include):**
- Company name (uppercase, bold)
- `Co. <CH number>`

**Add only if user asks or if it materially aids reading:**
- Registered office (e.g. when multi-SPV with different addresses)
- Status (`Active`, `Dissolved DD/MM/YYYY`, `In administration`)
- Previous name (e.g. `formerly XYZ Limited until DD/MM/YYYY`)
- Share class detail (e.g. `100 of 100 Ord £1`)

**Don't include:**
- Director list (belongs in KYC Appendix A, not the structure chart)
- Lender names / facility size / security
- Build contract details
- NAV / financial detail on UBO

## Footer

Single line. Always cite source. Default:

`Source: Companies House PSC register.`

If anything is uncertain or shown as a CH band rather than precise %, append:
`Source: Companies House PSC register. Galion Land share holding shown as CH band; precise % not yet verified against share register.`

## Filename convention

`<Scheme>_StructureChart_<author>_<EXTERNAL>_V<n.n>_<YYYYMMDD>.pptx`

Examples:
- `Horton_StructureChart_RS_EXTERNAL_V1.3_20260511.pptx`
- `Mitcham_StructureChart_RS_EXTERNAL_V1_1_20260428.pptx`

Bump `.minor` for content tweaks; bump `.major` for structural changes
(e.g. switching from chain to branching layout).
