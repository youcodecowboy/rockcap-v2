# Mode QC: "Is my appraisal working?"

Load this file when running the QC mode of the rockcap-appraisal skill. Triggered by phrases like "QC my appraisal", "is this working", "did I miss anything", "check the expenses line up", "sanity check this model".

The main SKILL.md routes here. This file holds the full QC battery, output format, and mode-specific rules. Cell coordinates referenced below come from `references/cell-reference-library.md` — load that file too if you need detailed cell maps.

---

## Critical: row labels are scheme-specific

RockCap appraisal cost rows have **fixed positions** but **scheme-specific labels**. SATIS rows 93-100 say Professional Fees / Build / Contingency / During Construction / etc. Park Road rows 93-104 say Planning / Insurance / Build / Preliminaries / CILs / Architect / QS / Engineer / Guarantees / Surveys / Marketing / Contingency.

**Never assume a label. Always read column B at runtime.** This is core rule #3 (read-label-first-or-refuse) applied to QC.

## Pink colour definition (verified)

Input cells on both AppraisalSite and Control Sheet use:
- `fill.fgColor.type == "theme"`
- `fill.fgColor.theme == 5`
- `fill.fgColor.tint ≈ 0.8`

```python
def is_pink(cell):
    try:
        fg = cell.fill.fgColor
        return fg.type == "theme" and fg.theme == 5 and abs((fg.tint or 0) - 0.8) < 0.05
    except Exception:
        return False
```

Yellow highlights (`rgb:FFFFFF00`) are calculated-output emphasis (e.g. Control Sheet E153/E154 Net and Gross LTGDV). Grey fills are section labels. Everything else is default (no fill).

## QC check battery

Run all of these. Report each as a section with PASS / FLAG. Sort flags by severity at the bottom.

**[1] Land costs roll-up.** Sum Q85:Q89, compare to Q90. FLAG if mismatch > GBP 1.

**[2] Development costs roll-up.** Walk rows 93-134, skip any row where column B = `'spare'`. Sum column Q of the remaining rows, compare to Q135. FLAG if mismatch.

**[3] Grand total roll-up.** `Q90 + Q135 + Q137 (overrun) == Q139`. FLAG if not.

**[4] Pink-cell discipline.** For rows 82-140 (cost block), scan cells B-S. Any non-pink cell holding a hardcoded numeric value (not a formula, not zero, not blank) is a violation: someone has overwritten a formula with a raw number, which breaks the solver chain. Report violations.

**[5] Empty pink cells in active sections.** Count pink cells that are blank or zero *within sections that have at least one populated pink cell*. Do not just count all empty pink on the tab — most of those are in inactive BTR/Other Investment zones for a BFS scheme and are noise. Scope the check to:
   - Land cost block (rows 85-89)
   - Populated dev cost rows (93-134 where column B is neither blank nor 'spare')
   - Unit input rows on the for-sale section (rows 54-63 where column B is not 'Tranche N' with no data)

**[6] Programme date chain.**
- `Acquisition (E18) + Planning months (E19) + Pre-con months (E20) = Construction Start (E21)` (calendar months, allow 1-day tolerance)
- `Construction Start (E21) + Construction months (E22) ≈ Practical Completion (E23)` (allow ±1 month)
- AppraisalSite1 Assumed Exit (C12) should be >= PC. FLAG if exit precedes PC.

**[7] Senior debt solver convergence.** If `E93 == "LTGDV"`, then `E101 (Live Gross LTGDV)` should equal `E94 (Sizing %)` within 0.002 (0.2pp). Same for LTC method. If they diverge, the solver didn't converge or the scheme isn't viable at the target ratio.

**[8] Benchmark sanity.**
- Build £/sqft: 200-300 London, 120-180 regions. Find build line by label containing "Build" or "Construction" (dynamic).
- Profit on Cost: 15-25% (FLAG outside 10-30%)
- Profit on GDV: 12-20% (FLAG outside 8-25%)
- Contingency as % of build: 5-10% (FLAG outside 3-15%)

**[9] GDV sensitivity.** If Q64 (sensitised GDV) equals O64 (base GDV), no sensitivity has been applied. This may be intentional for base-case modelling but worth stating.

**[10] Sales assumption integrity.** The highest-value check on a freshly-seeded model — this is where the costly errors land (Edgefold, 20/07/2026).

Read from the Control Sheet, per site column:
- **Sales Start - Active (row 39)** vs **Construction Start (row 21)**: derive the first-sale month number. FLAG if it lands at month 12 or earlier (lenders will not credit it). Month 13-15 is the acceptable band.
- **Sales Start (row 39)** vs **Practical Completion (row 23)**: state how many months of sales run pre-PC and post-PC. Alex's default is c.6 months post-PC; client models often assume 3.
- **Debt Maturity (row 44)** vs **Sales End (row 66)**: FLAG if sales run past debt maturity, and cross-check against any Default Interest line on the AppraisalSite tab (row 161, verify label). Non-zero default interest means the facility term is short of the sales tail.

**The client-model inheritance trap.** When a model has been seeded from a client's own appraisal, verify BOTH numbers were carried across:
1. their units-sold-per-month, AND
2. their **first-sale month**.

Inheriting the client's *total sales period* while missing their *first-sale month* stretches our facility well beyond intent, because the RockCap sales rows are **post-build** numbers. Result: over-accrued rolled interest and artificially depressed profit on cost. If profit on cost comes in a few points below expectation on an otherwise healthy scheme, check this before concluding the scheme is marginal.

**[11] Fee benchmarks.** Read the senior debt cost block (rows 153-163, verify labels in column B) and test against the benchmark table in SKILL.md:
- Legals vs c.0.2% of facility (band by facility size).
- Valuation vs 0.1% of GDV tapering to 0.05% on larger schemes.
- Monitoring vs £1,000/month, £1,200 over £10m, £1,500 over £15m. **£1,200/month on a sub-£10m facility is the template default — flag it as probably untouched, not chosen.**

**[12] Equity investor routing.** Read Control Sheet row 152 ("Amount Funded by Equity Investor") in both value and formula view, per site column.

- If the scheme has **no third-party equity investor**, the correct state is the formula intact with a **`*0%` multiplier** — `=(E149-SUM(E150:E151))*0%`.
- FLAG if the multiplier is non-zero on a scheme with no equity investor: the priority coupon (row 171) and promote (rows 172-173) will be skimming the profit, and reported Developer Profit (Q211) will be far below the true figure at PRE MEZZ AND EQUITY PROFIT (Q189). On Edgefold this showed developer profit of GBP 80k against a true GBP 811k.
- Also FLAG if the formula has been **replaced with a hard 0**. The outcome is right but the method is wrong — Alex wants the formula preserved so the equity-investor lens stays available on other deals. Row 155 (developer funding) is its mirror and picks up the balance automatically.

When flagging, report both Q189 and Q211 so the true developer position is visible.

## QC output format

Tight, scannable. Top block is the scheme identity; then numbered checks; then a consolidated flag list.

```
Park Road V1.1 — QC report
Project: Park Road | Scenario: Consented Scheme | Units: 5 | NIA: 10,015 sqft | GDV: GBP 6,525,000

[1] Land roll-up        OK  (Q90 = GBP 1,548,250)
[2] Dev costs roll-up   OK  (Q135 = GBP 3,423,998, 12 populated lines)
[3] Grand total         OK  (Q139 = GBP 4,972,248)
[4] Pink discipline     OK  (no non-pink hardcoded values)
[5] Empty pink (active) OK  (all populated sections complete)
[6] Programme chain     OK  (Acq->CS 6mo, CS->PC 11mo within budget)
[7] Solver convergence  OK  (70.0% LTGDV target, 70.00% live)
[8] Benchmarks
    Build psf: 256 (London OK)
    Contingency: 7.9% (OK)
    Profit on Cost: 7.4%  FLAG (benchmark 15-25%)
    Profit on GDV:  6.3%  FLAG (benchmark 12-20%)
[9] GDV sensitivity     base = sensitised (no downside applied)
[10] Sales assumptions  FLAG (first sale month 12; lender band is 13-15)
     Sales start Nov-27, PC Jan-28: 2mo pre-PC, 4mo post-PC
     Sales end within debt maturity, no default interest
[11] Fee benchmarks     Legals GBP 10,000 (0.20% of facility, OK)
                        Valuation GBP 7,500 (0.11% of GDV, OK)
                        Monitoring GBP 1,200/mo  FLAG (template default,
                        GBP 1,000 correct for a sub-10m facility)
[12] Equity routing     OK  (row 152 formula intact, *0% multiplier,
                        developer funds 100%)

Flags:
  - First sale at month 12 - lenders credit month 13-15. Check whether the
    client's first-sale month was carried across, or only their sales period.
  - Profit on Cost 7.4% - below 10% floor. Before concluding the scheme is
    marginal, re-run check [10]: an inherited sales period without the
    client's first-sale month inflates facility length and rolled interest.
  - Monitoring fee GBP 1,200/mo looks like an untouched template default.
  - No GDV sensitivity applied. Consider -5% stress for lender presentation.
```

## QC rules

1. **Never modify the file.** Pure read.
2. **Always state the file version** at the top of the report.
3. **Read labels dynamically** via column B. Never hardcode label-to-row mappings across schemes.
4. **Do not invent checks**. If you notice something odd that is not in the check battery above, call it out as "observation" separately, not as a PASS/FAIL check.
5. **When a check cannot run** (e.g. a cell is blank that the check expected), report the check as `SKIPPED (reason)`, not PASS.
6. **ASCII only in printed output** (Windows cp1252). Use `OK`, `FLAG`, `MISMATCH`, `GBP`. No tick marks, no em-dashes.
7. **Do not attribute a weak profit on cost to leverage or scheme viability until checks [10] and [12] are clean.** Both an inherited-sales-period error and a live equity-investor multiplier depress reported profit for modelling reasons, not commercial ones. Diagnose the model before you diagnose the deal.
8. **Never instruct Rayn to overwrite a formula with a hard value as a fix.** Where a formula carries a percentage multiplier (row 152 being the known case), the fix is to change the multiplier. Preserving the formula keeps the alternative scenario modellable.
