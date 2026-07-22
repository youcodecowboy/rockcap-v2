---
name: rockcap-appraisal
description: |
  Read, QC, summarise, and cost-compare RockCap's proprietary Appraisal Model
  for buy-to-sell (BFS) residential development schemes without hallucinating
  cell values. Use whenever Rayn asks about a scheme's GDV, peak debt, profit,
  costs, LTGDV, LTC, unit mix, programme, debt stack, or asks to verify figures
  across appraisal versions. Three modes:
    Mode 1 (reader) triggers on "what's the GDV / profit / LTGDV" type questions.
    Mode QC (health check) triggers on "QC my appraisal", "is this working",
      "did I miss anything", "check the expenses line up", "sanity check this".
      Runs cost roll-up integrity, pink-cell discipline, programme chain,
      solver convergence, and benchmark sanity checks.
    Mode C (cost comparison against client CSA / BoQ / Form of Tender)
      triggers on "does my build match their CSA", "check our pro costs equal
      theirs", "compare contingency against contractor's schedule".
  Covers AppraisalSite1-10, Control Sheet parameters, Portfolio Dashboard BFS,
  Lender Dashboard BFS, CashflowSite debt-cost pass-throughs. Applies the
  verified cell-reference library (outputs in column Q on AppraisalSite tabs,
  values in column E on Control Sheet) and the verified pink-cell definition
  (theme=5, tint=0.8). Reads cost line labels dynamically since they are
  scheme-specific. Scope is buy-to-sell only; BTR/rental absorption tabs
  ignored.
license: Proprietary (RockCap internal)
compatibility: claude-code
---

# RockCap Appraisal Model Skill (BFS)

You are reading RockCap's proprietary Excel Appraisal Model for a buy-to-sell scheme. The model is the source of truth for every deal's financials. Your job is to pull headline metrics reliably without guessing cells.

**Scope:** Buy-for-sale (BFS) schemes only. Ignore all BTR (Build-to-Rent) tabs, rows, and parameters unless Rayn explicitly says a scheme uses a rental-absorption path.

## Core rules

1. **Never modify the file.** Read-only. No Write, no Edit on the model.
2. **Never guess a cell.** Use only the cell references in this skill. If you need a metric this skill does not cover, open the model and locate it by reading the label column (B) first.
3. **Read label first or refuse.** Before returning a value at any specified row, read the label cell (column B for AppraisalSite / Control Sheet / Lender Dashboard tabs) and verify it matches the expected text (case-insensitive substring match). If the label does not match, **STOP and report the mismatch to Rayn — do not return the value**. Row positions can drift across model versions (especially Lender Dashboard rows 47-56, dev cost rows 93-134, and debt-stack rows 141-185). Silent hallucination of a number from the wrong row is the worst possible failure mode for this skill. Examples of where this rule applies:
   - Lender Dashboard - BFS: verify B47 contains "margin", B49 contains "arrangement" or "fee", B55 contains "exit", B56 contains "IRR" before reading row values.
   - Cost roll-ups in Mode QC: verify column B label at each row contains the expected concept ("Build", "Contingency", "Professional Fees") before treating the value as that line.
   - Debt stack rows: verify B143 / B153 / B165 / B175 hold the expected facility header before reading the linked CashflowSite cells.
   - When the label is blank, "spare", or unexpected, treat the row as inactive and skip it; do not return a value.
4. **Always use `data_only=True`** when pulling values. `data_only=False` is for inspecting formulas only.
5. **Outputs live in column Q** on AppraisalSite tabs, not column C. Row labels are in column B; column A holds row-visibility formulas (`=IF(Q##=0,"Hide","")`) and should be ignored.
6. **Never hardcode financial assumptions** from memory. If the model says GDV is £4.25m, use £4.25m.
7. **When reading a live scheme, state the file version in your response.** The same scheme can exist across V1.0 to V5.0+ and they will differ. Filenames follow `SchemeName_VX.Y_Authors_INTERNAL|EXTERNAL_YYYYMMDD.xlsm`.

## Model structure at a glance

32 sheets. BFS-relevant sheets:

| Sheet | Purpose | Who owns |
|---|---|---|
| Control Sheet | Programme dates, facility assumptions, sale velocity path | Analyst (careful edits only) |
| Central Inputs | SONIA curves, CPI/RPI/TPI growth indices | Senior team (read-only) |
| AppraisalSite1 to AppraisalSite10 | Per-site inputs and waterfall. Sites 2-10 formula-link to Site 1 by default | Analyst |
| CashflowSite1 to CashflowSite10 | Monthly cashflow, debt sizing, interest accrual | Calculated |
| Consol Cashflow | Consolidated monthly roll-up across all active sites | Calculated |
| Portfolio Dashboard - BFS | Executive summary (unit mix, GDV, programme, returns) | Calculated |
| Lender Dashboard - BFS | Side-by-side lender term comparison, up to 8 lenders | Analyst inputs terms; metrics calculated |
| Sensitivity Testing - BFS | Yield, rent, build-cost stress tests | Analyst toggles |

Ignore: all `BTR` tabs (Lender Dashboard - BTR, Portfolio Dashboard - BTR, Sensitivity Testing - BTR, Lender BTR Dashboard Workings) for BFS schemes.

## Mode routing

Pick one mode based on the user's request, then load the matching reference file before doing the work.

| Mode | Trigger phrases | Detail file to load |
|---|---|---|
| **Mode 1 — reader** | "what's the GDV", "show me the profit", "pull the LTGDV", "summarise the financials", "headline numbers for [scheme]" | `references/cell-reference-library.md` |
| **Mode QC — health check** | "QC my appraisal", "is this working", "did I miss anything", "check the expenses line up", "sanity check this model" | `references/qc-battery.md` (also load `cell-reference-library.md` for cell coords) |
| **Mode C — cost comparison** | "does my build match their CSA", "check our pro costs equal theirs", "compare contingency against the contractor's schedule" — **AND a second non-RockCap file is in scope** (CSA, BoQ, Form of Tender) | `references/mode-c-comparison.md` |
| **Mode T — lender terms reconciliation** | "reconcile the terms against the model", "compare the lender terms to our comparison", "these terms don't match the model", "check this term sheet", "why is [lender] off", "the borrower equity doesn't tie" — **AND lender term sheets are in scope** | `references/lender-terms-reconciliation.md` |

If you only have the RockCap file and the request is ambiguous between Mode QC and Mode C, default to Mode QC. Do not run Mode C with only one file. Run Mode T whenever indicative lender terms have come back and you are building or checking the comparison — do not size a lender by matching net advance without reconciling its stated LTGDV and borrower-equity figures.

If the request asks for a metric not covered in any reference file, open the model and locate the metric via column B labels (per core rule #3).

## Detecting used vs unused sites

Sites 2-10 are formula-linked to Site 1 by default. A site is "in use" if the analyst has overridden the project name or populated units/GDV with scheme-specific data.

Reliable check: look at Portfolio Dashboard - BFS column B rows 11-20. Active sites show the scheme name; unused sites show `'hide rows'` or blank.

```python
active_sites = []
pd = wb["Portfolio Dashboard - BFS"]
for r in range(11, 21):
    name = pd.cell(r, 2).value
    if name and name not in ("hide rows", "spare", ""):
        active_sites.append((r, name))
```

## Validation benchmarks (sanity-check, do not enforce)

Use these to flag suspicious figures, not to overwrite the model.

| Metric | Benchmark | Flag if |
|---|---|---|
| Build cost £/sqft (London) | £200-300 | Outside this range |
| Build cost £/sqft (regions) | £120-180 | Outside this range |
| Profit on Cost | 15-25% | Below 10% or above 30% |
| Profit on GDV | 12-20% | Below 8% or above 25% |
| Construction duration | 12-24 months | Under 9 or over 30 |
| Contingency | 5-10% of build cost | Under 3% or over 15% |
| Sales velocity (offplan + post-PC) | 2-6 units/month typical | Verify with local comps |
| **First sale month** | **Month 13-15 of programme** | **Month 12 or earlier (see below)** |
| **Legal fees** | **c.0.2% of facility** | Outside 0.1-0.35% |
| **Valuation fee** | **0.1% of GDV small, tapering to 0.05% large** | Materially outside |
| **Monitoring (IMS) fee** | **£1,000/month** (£1,200 over £10m, £1,500 over £15m) | Wrong band for facility size |

If a scheme sits outside these ranges, surface it in your summary. Do not "correct" it silently.

### Fee benchmark detail (Alex Lundberg, 20/07/2026)

Blended market averages. Individual lenders vary, especially on monitoring (some do it in-house).

| Facility size | Legals |
|---|---|
| Up to £5m | c.£7,500 |
| Up to £7.5m | c.£10,000-12,500 |
| c.£10m | c.£15,000-20,000 |

Legals track c.0.2% of facility size. These came down from historic levels. **Legals cannot be formula-driven in the model** — it creates a circular reference through the macro, so they stay a manual pink input.

Valuation: 0.1% of GDV on smaller schemes, tapering to 0.05% as schemes get bigger.

Monitoring: £1,000/month is right for most schemes. £1,200/month is the template default — if a model shows £1,200 on a sub-£10m facility, it is almost certainly an untouched default rather than a decision. Flag it.

### Sales-start reality (Alex Lundberg, 20/07/2026)

Lenders credit the first sale at **month 13-15** of the programme. Month 13 is punchy but achievable with the most ambitious lenders; **month 12 or earlier will not be credited**. Client appraisals routinely assume earlier starts than this.

An over-optimistic sales start shortens the modelled facility, understates rolled interest, and overstates profit. The converse error — inheriting a client's *total sales period* without their *first-sale month* — overstates facility length and crushes profit on cost. See QC check [10].

## Common pitfalls to avoid

1. **Don't read column C expecting outputs.** Column C on totaling rows (78, 80, 139, 187, 189, 211) is often blank. Outputs live in column Q.
2. **Don't trust row 38 GDV as scheme GDV for BFS.** Row 38 totals the BTR section which will be zero or `#DIV/0!` for BFS schemes. BFS GDV lives at O64 (base) and Q64 (sensitised).
3. **Don't modify the Control Sheet.** Senior-team territory. If Rayn asks to change a programme date or a facility parameter, confirm first and have him open the model himself unless explicitly asked to edit.
4. **Don't read dashboard row 2 for a scheme name.** Row 2 of Portfolio Dashboard - BFS often still reads "Portfolio Dashboard - BTR" as legacy text. Read the sheet name and the site rows (row 11 onward) instead.
5. **Don't compare across versions without stating the version.** V1.0 to V5.0+ iterations exist per scheme. Always say which version you read.
6. **Don't assume Sites 2-10 are populated.** Most schemes use only Site 1. Check Portfolio Dashboard - BFS column B rows 11-21 to confirm which sites are active.
7. **Don't output raw 16-decimal floats to Rayn.** Round to appropriate precision (£m to 2dp, £k to whole £, percentages to 1dp, £/sqft to whole £).
8. **LTGDV/LTV/LTC are exposed on the Control Sheet**, not on the AppraisalSite tabs. Read them from there (E99-E101 for senior dev, E83-E84 for bridging, E153-E154 for post-mezz). These are "Live" ratios calculated by the model solver; do not back-compute from GDV and debt quantum unless you need to cross-check.
9. **Column E vs F on Control Sheet.** E is the primary scenario, F is an alternate comparison scenario. Default to E. Only use F if explicitly asked, or if E is blank and F is populated.

## When to stop and ask

- Model has no populated sites (all "hide rows" on dashboard) — ask Rayn if you have the right file.
- Scheme appears to be BTR (Active Scenario references rental, C26=Yes on Control Sheet) — stop; this skill is BFS-only.
- Key cells return `#DIV/0!`, `#NUM!`, `#REF!` — report the error location and the formula in question; do not paper over.
- Multi-site schemes where sites disagree — list each site's figures separately, do not silently average.

## Reference files (load on demand)

This SKILL.md holds the rules, mode routing, and sanity benchmarks. Detailed cell coordinates and mode-specific procedures live in the `references/` folder:

- **`references/cell-reference-library.md`** — full cell maps for AppraisalSite1 (project identity, for-sale units, dev costs, debt stack, profit waterfall, value outputs), Control Sheet (programme, sale velocity, senior dev, bridging, mezz/equity), Portfolio Dashboard - BFS, plus all openpyxl reading recipes. Load whenever you need to read specific values from the model.
- **`references/qc-battery.md`** — Mode QC procedure: row-label dynamics, pink-cell definition, the 9-check QC battery, output format, QC-specific rules. Load when running QC.
- **`references/mode-c-comparison.md`** — Mode C procedure: file detection, RockCap-side cost cells, client CSA read recipes, comparison logic, output format, Mode C-specific rules. Load when comparing against a client cost schedule.

## Skill metadata

- QC checks [10] [11] [12] (sales assumptions, fee benchmarks, equity routing) added 20/07/2026 from Alex Lundberg's review of the Edgefold 3-site portfolio models. Fee and sales-start benchmarks are his stated rules of thumb.
- Verified against: `239-245LondonRoad_V5.0_RS_AL_INTERNAL_20260416.xlsm` (SATIS, 26-unit Hazel Grove conversion, GDV £4.25m)
- Mode C verified against: `239LR_CSA.xlsx` (SATIS client Contractor Schedule of Accommodation)
- Other client-appraisal formats seen: `Park_Road_21_04_2026.xlsx` (clean full appraisal, Mackenzie Miller), `Parnham Park Residencies 82 P&L Plot Zones.xlsx` (plot-by-plot P&L, Fenway)
- Verified on: 2026-04-23
- Model template: `SchemeName_RockCap_V1.0_RS_INTERNAL_Date (Replication1to5_20260408).xlsm`
- Refactored into core + references on 2026-05-08.
