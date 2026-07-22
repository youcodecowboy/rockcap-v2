# Cell Reference Library — RockCap BFS Appraisal Model

Detailed cell maps for AppraisalSite1, Control Sheet, Portfolio Dashboard - BFS, plus the openpyxl reading recipes that pull the values. Load this file when you need to read specific metrics from a live model file. The main SKILL.md has the rules and modes; this file has the cell coordinates.

Verified against `239-245LondonRoad_V5.0_RS_AL_INTERNAL_20260416.xlsm` (SATIS V5).

---

## AppraisalSite1 input zones

Row labels are in column B. Inputs live in columns C onward. Sites 2-10 mirror Site 1 via formulas unless analyst overrides.

### Project identity

| Cell | What |
|---|---|
| C9 | Project Name |
| C10 | Active Scenario (free text, e.g. "Consented Scheme") |
| C11 | Appraisal Start Date |
| C12 | Assumed Exit Date |

### Non-Investment Property (for-sale units) — rows 53 to 64

Section header row 53. Input rows 54-63. Total row 64.

Column headers from row 53:

| Col | Header | Notes |
|---|---|---|
| C | Completion Date | Per-tranche PC |
| D | # Units | |
| E | NIA (sqft) | |
| H | Resi? | Yes/No |
| N | Capital Value per sqft | Analyst input |
| O | Base Capital Value (GDV) | `= D * N * sqft-per-unit-logic` (verify formula if needed) |
| P | Sensitivity | % adjustment for downside |
| Q | Sensitised Capital Value | Output |
| R onwards | Sales Profiling | Sales Start Date, % Offplan, Months to Maturity, Units/month, Sales End |

Row 64 totals: D64=total units, E64=total NIA, O64=total base GDV, Q64=total sensitised GDV.

### Development costs — rows 82 to 139

Column B holds line-item labels. **Column Q holds the totals**. Values in C through P are intermediate workings.

| Row | Label | Key cell |
|---|---|---|
| 84-90 | Land Costs (Price, SDLT, Agents, Legals, Other, Total) | Q90 = Land total |
| 92-104 | Development Costs (Professional Fees, Build, Contingency, Sales & Marketing, Other, Legals) | |
| 135 | Dev costs subtotal | Q135 |
| 137 | Cost Overrun | Q137 |
| **139** | **TOTAL DEVELOPMENT COSTS, EXCL FINANCE** | **Q139** |

### Cost Overrun (Q137) accounting treatment — important

Q137 represents the **analyst-side contingency overlay** added on top of the dev cost subtotal (Q135). It is not a lender-funded Cost Overrun Facility (CoF). The model's behaviour:

- Q137 is added to Q135 + Q90 to derive Q139 (TOTAL DEVELOPMENT COSTS EXCL FINANCE).
- Q137 is NOT a debt facility on the senior debt stack. The senior debt stack (rows 141-185) does not size against Q137 separately.
- A genuine lender-funded Cost Overrun Facility (when a deal has one) is modelled inside CashflowSite and shows up in the relevant facility block (rows 153-163 for Senior Dev, etc.), not at Q137.

QC check [3] in Mode QC treats Q137 as a cost roll-up component (`Q90 + Q135 + Q137 == Q139`) — that is correct. Do not flag schemes where Q137 has a value as having a lender-funded CoF. Q137 carrying a number simply means the analyst has reserved an additional contingency layer on the cost side.

### CashflowSite1-10 (debt cost source) — coverage scope

CashflowSite tabs hold the monthly cashflow, interest accrual, peak debt calculation, and facility drawdown profile. AppraisalSite debt rows pull from these tabs by direct cell reference (e.g. `=CashflowSite1!B164` for bridging facility amount).

Detailed CashflowSite cell mappings are **not exhaustively verified** in this skill. When you need a metric that lives only on CashflowSite (peak debt, total interest, monthly drawdown profile, facility availability period), follow this procedure:

1. **Read the column B labels first** on the relevant CashflowSite tab to locate the row containing the metric. Do not guess row positions — they vary across model versions and facility configurations.
2. **Verify the label matches** the expected concept (peak debt, total interest, facility quantum) before reading the value. Apply core rule #3 (read-label-first-or-refuse).
3. **If you cannot locate the metric or the label is ambiguous**, halt and ask Rayn to either point to the cell or extract the value manually. Do not return an inferred number.

For Mode QC check [7] (senior debt solver convergence), the LTGDV/LTC verification on the Control Sheet (E99-E101) is sufficient — peak-debt cross-check from CashflowSite is a nice-to-have, not a hard requirement. If solver convergence flags FAIL on the Control Sheet ratios, that's the diagnostic; do not attempt CashflowSite reconciliation without explicit instruction.

### Senior debt stack — rows 141 to 185

Per facility (Bridging, Senior Development, Development Exit, Term Loan), rows pull from `CashflowSite1` specific cells. For example:

- Row 143: Bridging Loan header
- Row 144: `=CashflowSite1!B164` (bridging facility amount)
- Row 145: Broker Fee
- Rows 146-150: Fees and interest, from CashflowSite1
- Row 151: Bridging total

Similar blocks for Senior Dev (rows 153-163), Dev Exit (165-173), Term Loan (175-183).

- **Row 185: TOTAL SENIOR DEBT COSTS** (Q185)

### Profit waterfall — rows 187 to 211

| Row | Label | Key cell |
|---|---|---|
| **187** | **TOTAL COSTS** (dev + finance) | **Q187** |
| **189** | **PRE MEZZ AND EQUITY PROFIT** | **Q189** |
| 191-201 | Mezzanine facility block | Q201 = Mezz total |
| 203-207 | Equity Investor block (Priority Coupon, Promote, Surplus) | Q207 |
| 209 | TOTAL MEZZ / EQUITY INVESTOR | Q209 |
| **211** | **DEVELOPER PROFIT** | **Q211** |

### Value outputs

| Cell | What |
|---|---|
| **Q78** | **DEVELOPMENT VALUE FOR DEBT SIZING** (sensitised) |
| P78 | DVD unsensitised |
| **Q80** | **NET EXIT VALUE** (sensitised, post-disposal costs) |

---

## Control Sheet — BFS-relevant parameters

Column layout is non-obvious:

- **Column B** = labels
- **Column C** = multi-site total (blank on single-site schemes like SATIS)
- **Column E** = primary scenario values (the ones you usually want)
- **Column F** = alternate scenario for side-by-side comparison (may be blank or duplicated on schemes that don't use it)

Always read column E unless you have been told explicitly to pull the alternate. Row 10 shows the scenario label in E10 / F10 ("Consented Scheme", "Planning Gain Uplift", etc.).

### Programme (rows 17-23)

| Cell | What |
|---|---|
| E18 | Acquisition Date |
| E19 | Planning Period (months) |
| E20 | Pre-Construction Period (months) |
| E21 | Construction Start Date |
| E22 | Construction Length (months) |
| E23 | Practical Completion Date |

### Path toggle

- **E34 = `Yes`** → BFS active (sale velocity path). This is what you want.
- **E26 = `No`** for BFS schemes. If E26 = `Yes`, the scheme is BTR and this skill does not apply.

### Sale Velocity (BFS path) — rows 33-66

All values in column E.

| Cell | What |
|---|---|
| E35 | Total units for sale |
| E37 | Sales Start, base case date |
| E39 | Sales Start, active (post-sensitivity) |
| E41 | % Realised at Sales Start (offplan) |
| E44 | Debt Maturity Date |
| E45 | Months between Sales Start and Debt Maturity |
| E46 | Remaining units to sell after offplan |
| E48 | Units sold per month, base case |
| E57 | Units sold at Debt Maturity (bulk sale) |
| E58 | % Sold at Debt Maturity |
| E60 | Post Debt Maturity start |
| E66 | Sales End Date |

### Senior Development Facility (rows 89-108) — the main BFS debt

| Cell | What |
|---|---|
| E90 | Facility Start Date |
| E91 | Term (months) |
| E92 | Facility End Date |
| E93 | Sizing Methodology (usually "LTGDV") |
| E94 | Sizing % (e.g. 0.75 = 75% LTGDV) |
| E95 | Repayment Mechanism (`Full Cash Sweep` or `Part Cash Sweep`) |
| E96 | Sales proceeds to equity pre PC |
| E97 | Sales proceeds to equity post PC |
| **E99** | **Live Net Loan to Net Cost (Live Net LTC)** |
| **E100** | **Live Gross Loan to Gross Cost (Live Gross LTC)** |
| **E101** | **Live Gross Loan to GDV (Live Gross LTGDV)** |
| E104 | Margin |
| E105 | Fixed or Floating? |
| E106 | Floating Rate reference (usually "SONIA") |
| E107 | Swap/Fixed Rate |

### Acquisition Bridging Loan (rows 74-87) — if active

| Cell | What |
|---|---|
| E75 | Active? (`Yes`/`No`) |
| E76 | Facility Start Date |
| E77 | Term (months) |
| E79 | Sizing Methodology |
| E80 | Sizing % |
| E81 | Initial Red Book Value for Sizing |
| E83 | Live LTC |
| E84 | Live LTV |
| E86 | Monthly Interest Rate |

### Stabilisation Facility (rows 110-120) and Term Loan (rows 122-136)

Same pattern. Relevant only on BTR-adjacent or held-asset schemes; usually inactive (E111 and E123 = `No`) on pure BFS deals.

### Mezzanine / Equity Sizing (rows 138-167)

These rows report the live funding stack solved by the model.

| Cell | What |
|---|---|
| E149 | Pre Senior Dev Debt Funding Requirement |
| E150 | Amount funded by Senior Debt |
| E151 | Amount funded by Mezz |
| E152 | Amount funded by Equity Investor |
| E153 | Net LTGDV (post-mezz) |
| E154 | Gross LTGDV (incl. priority coupon) |
| E155 | Amount funded by Developer |
| E161 | Mezzanine Active? |
| E162 | Mezz Sizing Methodology |
| E163 | Mezz Sizing % |
| E167 | Mezz Monthly Coupon |

---

## Portfolio Dashboard - BFS cell map

Note: row 2 may still read "Portfolio Dashboard - BTR" as legacy text. The sheet itself is BFS. Trust the sheet name, not row 2.

### Site Development Summary (rows 10-21)

Row 10 headers: D=GIA, E=NIA including non-resi, F=# Resi Units, G=Blended £psf, H=GDV, I=Disposal Costs / RF Adjustments

Row 11 = Site 1 summary. Rows 12-20 = Sites 2-10 ("hide rows" label if unused).
Row 21 = Total across all sites.

### Development Programme Summary (rows 23-33)

Row 23 headers: D=Acquisition Date, E=Construction Start, F=Construction Length (Months), G=Practical Completion, H=Sales Start, I=Sales End

Row 24 = Site 1. Rows 25-33 = Sites 2-10.

### Mezz Investor Returns (rows 35-46)

Row 35 headers: D=Net Loan, E=Gross Loan, F=Repayment Date, G=Lender Surplus, H=Lender Money Multiple, I=Lender IRR

### Equity Investor Returns (rows 48-59)

Row 48 headers: D=Cash Requirement, E=Priority Coupon (%), F=Priority Coupon (£), G=Profit Share £, H=IRR, I=Money Multiple

---

## Openpyxl reading recipes

### Load pattern (always use both views)

```python
from openpyxl import load_workbook
import warnings
warnings.filterwarnings('ignore')  # suppress Data Validation warnings

path = "..."
wb_v = load_workbook(path, data_only=True, keep_vba=False)   # cached values
wb_f = load_workbook(path, data_only=False, keep_vba=False)  # formulas (only if needed)
```

### Headline metrics for Site 1

```python
site = wb_v["AppraisalSite1"]

headline = {
    "project":               site["C9"].value,
    "scenario":              site["C10"].value,
    "appraisal_start":       site["C11"].value,
    "assumed_exit":          site["C12"].value,
    "units":                 site["D64"].value,
    "nia_sqft":              site["E64"].value,
    "blended_psf_base":      site["N64"].value,
    "gdv_base":              site["O64"].value,
    "gdv_sensitised":        site["Q64"].value,
    "development_value_debt_sizing": site["Q78"].value,
    "net_exit_value":        site["Q80"].value,
    "total_dev_costs":       site["Q139"].value,
    "total_senior_debt":     site["Q185"].value,
    "total_costs":           site["Q187"].value,
    "pre_mezz_equity_profit":site["Q189"].value,
    "developer_profit":      site["Q211"].value,
}
```

### Key ratios (derive, don't look up — these are not always pre-calculated)

```python
gdv = headline["gdv_sensitised"]
total_costs = headline["total_costs"]
dev_costs = headline["total_dev_costs"]
profit = headline["developer_profit"]

ratios = {
    "profit_on_cost":  profit / total_costs if total_costs else None,
    "profit_on_gdv":   profit / gdv if gdv else None,
    "cost_to_gdv":     total_costs / gdv if gdv else None,
}
```

### Programme from Control Sheet

```python
ctrl = wb_v["Control Sheet"]
programme = {
    "scenario_label":         ctrl["E10"].value,   # e.g. "Consented Scheme"
    "acquisition_date":       ctrl["E18"].value,
    "planning_months":        ctrl["E19"].value,
    "preconstruction_months": ctrl["E20"].value,
    "construction_start":     ctrl["E21"].value,
    "construction_months":    ctrl["E22"].value,
    "practical_completion":   ctrl["E23"].value,
    "sale_velocity_active":   ctrl["E34"].value,  # 'Yes' for BFS
    "rental_absorption_active": ctrl["E26"].value,  # 'No' for BFS
}
```

### Senior Development Facility and live leverage ratios

```python
senior_dev = {
    "facility_start":       ctrl["E90"].value,
    "term_months":          ctrl["E91"].value,
    "facility_end":         ctrl["E92"].value,
    "sizing_method":        ctrl["E93"].value,      # "LTGDV"
    "sizing_pct":           ctrl["E94"].value,      # e.g. 0.75
    "repayment_mechanism":  ctrl["E95"].value,      # "Full Cash Sweep" / "Part Cash Sweep"
    "margin":               ctrl["E104"].value,
    "rate_type":            ctrl["E105"].value,     # "Floating" / "Fixed"
    "live_net_ltc":         ctrl["E99"].value,
    "live_gross_ltc":       ctrl["E100"].value,
    "live_gross_ltgdv":     ctrl["E101"].value,
}
```

### Acquisition Bridging facility (if active)

```python
if ctrl["E75"].value == "Yes":
    bridging = {
        "start":            ctrl["E76"].value,
        "term_months":      ctrl["E77"].value,
        "sizing_method":    ctrl["E79"].value,
        "sizing_pct":       ctrl["E80"].value,
        "initial_value":    ctrl["E81"].value,
        "live_ltc":         ctrl["E83"].value,
        "live_ltv":         ctrl["E84"].value,
        "monthly_rate":     ctrl["E86"].value,
    }
```

### Live funding stack (mezz / equity / developer splits)

```python
funding_stack = {
    "total_requirement":        ctrl["E149"].value,
    "senior_debt":              ctrl["E150"].value,
    "mezzanine":                ctrl["E151"].value,
    "equity_investor":          ctrl["E152"].value,
    "developer":                ctrl["E155"].value,
    "net_ltgdv_post_mezz":      ctrl["E153"].value,
    "gross_ltgdv_incl_priority":ctrl["E154"].value,
}
```

### Lender Dashboard - BFS term comparison

Lenders sit in paired columns. Col C+D = Lender 1, E+F = Lender 2, G+H = Lender 3, and so on up to col O+P (Lender 8).

Odd col (C, E, G, ...) = numeric value. Even col (D, F, H, ...) = unit label.

```python
ld = wb_v["Lender Dashboard - BFS"]
LENDER_COLS = [3, 5, 7, 9, 11, 13]  # C, E, G, I, K, M — BFS sheet is 13 cols wide
# verify per-file: ws.max_column

# Row 47 = Margin. Row 49 = Arrangement Fee. Row 55 = Exit Fee. Row 56 = Lender IRR.
# Verify label by reading column B first; row positions can drift across model versions.

for col in LENDER_COLS:
    margin = ld.cell(47, col).value
    arr_fee = ld.cell(49, col).value
    exit_fee = ld.cell(55, col).value
    irr = ld.cell(56, col).value
    if margin is not None or arr_fee is not None:
        print(f"Col {col}: margin={margin}, arr_fee={arr_fee}, exit_fee={exit_fee}, IRR={irr}")
```

Row numbers may shift slightly between model versions; always sanity-check by reading column B labels first (per core rule #3 in SKILL.md).
