# Mode C: Cost comparison against client CSA / BoQ / cost schedule

Load this file when running Mode C of the rockcap-appraisal skill. Triggered when Rayn asks to compare RockCap cost inputs against a client-supplied cost schedule **and a second non-RockCap file is in scope** (typically `*_CSA.xlsx`, `Form of Tender.xlsx`, `BoQ.xlsx`, contractor schedule).

The main SKILL.md routes here. This file holds the file-detection logic, RockCap-side cell coordinates relevant to cost comparison, openpyxl reading recipes for client files, comparison logic, and Mode C-specific rules.

---

## Mode C activation rule (disambiguation vs Mode QC)

Mode C **only fires when a second non-RockCap file is referenced or attached**. If only the RockCap appraisal is in scope, the right mode is QC (which already runs build £/sqft and contingency benchmarks against RockCap's own ranges).

Disambiguation:
- "Is my build right" + only RockCap file → **Mode QC** (benchmark check against RockCap's £/sqft bands)
- "Is my build right against their tender" + RockCap file + CSA file → **Mode C** (line-by-line vs client)
- "Sanity check this scheme" + only RockCap file → **Mode QC**
- "Compare my contingency to the contractor's schedule" + two files → **Mode C**

If a phrase is ambiguous and only one file has been mentioned, ask Rayn whether he has a client cost schedule to compare against. Do not run Mode C against the RockCap file alone — there is nothing to compare to.

## What client files look like

Client cost schedules arrive in three common shapes. Auto-detect which one you have before reading values.

1. **Form of Tender summary (easiest).** A dedicated sheet named `Form of Tender`, `Tender Summary`, or similar. Last row is `TOTAL`. Section rows list each discipline subtotal. Example: SATIS 239LR_CSA.xlsx.
2. **Section sheets with SUB-TOTAL footers (common).** Each discipline on its own sheet (`1. General`, `2. Enabling`, `3. Construction`, `4. Electrical`, `5. Mechanical`, `6. Prov Sums`, etc). Each sheet ends with a row where column C = `'SUB-TOTAL'` and column D holds the value. Often accompanies a Form of Tender.
3. **Flat BoQ (rare).** Single sheet, line-by-line priced items, no section totals. Needs manual row-range identification per section.

## RockCap cost cells (verified on SATIS V5)

AppraisalSite1 column Q holds the pound totals.

| Row | What | Cell |
|---|---|---|
| 85 | Land Price | Q85 |
| 86 | SDLT | Q86 |
| 87 | Land agents | Q87 |
| 88 | Land legals | Q88 |
| 89 | Other land | Q89 |
| 90 | Land Costs Total | Q90 |
| 93 | Professional Fees | Q93 |
| 94 | Development Costs (Build) | Q94 |
| 95 | Contingency | Q95 |
| 96 | Insurance During Construction | Q96 |
| 97 | Post Construction | Q97 |
| 98 | Sales & Marketing | Q98 |
| 99 | Other | Q99 |
| 100 | Legals | Q100 |
| 135 | Development Costs Total (sum of 93-100) | Q135 |
| 137 | Cost Overrun | Q137 |
| 139 | TOTAL DEVELOPMENT COSTS EXCL FINANCE | Q139 |

Column O holds the per-sqft rate on each line (e.g. O94 = build £/sqft). Column N holds the same rate where the input was a £/sqft; column C on row 95 holds the contingency rate as a decimal (e.g. 0.0465 = 4.65%).

## Client CSA read recipe (Form of Tender path)

```python
from openpyxl import load_workbook
import warnings
warnings.filterwarnings('ignore')

wb_c = load_workbook(client_path, data_only=True, keep_vba=False)

# Prefer Form of Tender
fot_name = next((s for s in wb_c.sheetnames if "tender" in s.lower()), None)
if fot_name:
    fot = wb_c[fot_name]
    sections = {}
    total = None
    for r in range(1, fot.max_row + 1):
        b = fot.cell(r, 2).value
        c = fot.cell(r, 3).value
        d = fot.cell(r, 4).value
        if isinstance(d, (int, float)):
            if isinstance(c, str) and c.strip().upper() == "TOTAL":
                total = d
            elif isinstance(b, str) and b.strip().upper().startswith("SECTION"):
                sections[b.strip()] = d
            elif isinstance(c, str) and c.strip().upper() == "SUB-TOTAL":
                sections["SUB-TOTAL"] = d
```

## Client CSA read recipe (section subtotal path)

```python
# Fallback: sum SUB-TOTAL rows from each section sheet
section_totals = {}
for s in wb_c.sheetnames:
    ws = wb_c[s]
    # Last ~5 rows usually hold SUB-TOTAL
    for r in range(max(1, ws.max_row - 5), ws.max_row + 1):
        c = ws.cell(r, 3).value
        d = ws.cell(r, 4).value
        if isinstance(c, str) and "SUB-TOTAL" in c.upper() and isinstance(d, (int, float)):
            section_totals[s] = d
            break
```

## Comparison logic

Do not force a 1:1 line match where the concepts do not exist on both sides. Most CSAs do not include:

- Professional fees (architect, QS, engineer are usually separate appointments)
- Contingency (contractor prices firm)
- Sales and marketing
- Legal fees
- Land costs

So the clean top-line comparison is:

| Comparison | RockCap side | Client side |
|---|---|---|
| Build (primary) | Q94 | Form of Tender `TOTAL` |
| Build + Contingency | Q94 + Q95 | Form of Tender `TOTAL` |
| Hard-cost only | Q94 | CSA Construction + Electrical + Mechanical (exclude General/prelims/provsums) |

Within construction, you can try sub-line matches where names align (e.g. RockCap "During Construction" vs CSA "General / Prelims"), but state the mapping explicitly and flag weak matches.

## Output format for a cost comparison

Produce a tight table, not prose. Sort by absolute delta descending.

```
SATIS 239-245 London Road — Cost comparison
RockCap V5.0 INTERNAL 20260416  vs  239LR_CSA.xlsx

Line                          RockCap      Client       Delta        Delta %
Build (primary)               £2,372,499   £2,221,586   +£150,913    +6.8%
  Prelims / General            £12,933*    £280,343     -£267,410    *RockCap "During Construction" line, weak match
  Construction hard-cost       £2,372,499  £1,567,079   +£805,420    Check if RockCap line includes M&E
  Electrical                   (no line)   £103,642     n/a          RockCap rolls into build
  Mechanical                   (no line)   £170,523     n/a          RockCap rolls into build
  Prov Sums                    (no line)   £100,000     n/a          Held in RockCap contingency?
Contingency                   £111,761     (n/a)        -            Contractor prices firm; buffer on RockCap side
Professional fees             £137,505     (n/a)        -            Separate appointment
Sales & marketing             £19,482      (n/a)        -
Legals                        £17,795      (n/a)        -
Land costs                    £415,000     (n/a)        -
──────────────────────────────────────────────────────────────────
TOTAL EXCL FINANCE            £3,107,886   £2,221,586   +£886,300    CSA is build-only

Flags:
  - Build +6.8%: within tolerance, no action needed
  - RockCap does not separately line-item Electrical/Mechanical; confirm these
    are included within Q94 rather than double-counted in contingency
```

## Mode C practical notes

- **Avoid Unicode glyphs in Python stdout on Windows.** The default cp1252 codec chokes on symbols like `✓`, `±`, em-dash, and even `£` gets mangled. Use ASCII: `GBP` or `£` inside strings written to the output buffer is fine in files, but for `print()` stick to `OK` / `MISMATCH` text markers.

## Mode C rules

1. **Always state both file versions** (RockCap filename + client filename) at the top of the comparison.
2. **Never invent a line on either side.** If a concept does not exist on one side, write `(n/a)` and explain why in one line.
3. **Flag deltas using thresholds**: >5% on Build, >10% on any other named line, any absolute delta >£50k. List flags underneath the table.
4. **Do not "reconcile" silently.** If the CSA total does not reconcile to the sum of its sections (± £1), say so.
5. **Do not modify either file.** Read-only, both sides.
6. **Ask before comparing if categories are ambiguous.** E.g. "the CSA has a Prov Sums line of £100k but your RockCap contingency is £112k — should I treat these as equivalent, or separate?"

---

Mode C verified against: `239LR_CSA.xlsx` (SATIS client Contractor Schedule of Accommodation). Other client-appraisal formats seen: `Park_Road_21_04_2026.xlsx` (clean full appraisal, Mackenzie Miller), `Parnham Park Residencies 82 P&L Plot Zones.xlsx` (plot-by-plot P&L, Fenway).
