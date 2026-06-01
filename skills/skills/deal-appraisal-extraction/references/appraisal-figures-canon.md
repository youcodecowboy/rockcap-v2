# Appraisal figures canon

The canonical figures to pull from a UK development appraisal, their `fieldPath`,
and the `templateTags` that let them re-populate appraisal templates later. Use
these exact fieldPaths so `project.getDeepContext`, `lender.matchForDeal`, and the
(future) template-population step all read the same keys.

All values: plain numbers (strip £/commas/%). `valueType: "number"` unless noted.
Always set `sourceText` to the `Sheet!Cell` it came from.

## Headline figures (write canonical at project scope)

| Figure | fieldPath | templateTags | Notes |
|---|---|---|---|
| Gross Development Value | `financials.grossDevelopmentValue` | `["appraisal","gdv"]` | The end value. If a range, midpoint + flag. |
| Total Development Cost | `financials.totalDevelopmentCost` | `["appraisal","tdc"]` | Land + build + fees + finance + contingency. |
| Land cost | `financials.landCost` | `["appraisal","land"]` | Purchase price / land value. |
| Construction (build) cost | `financials.constructionCost` | `["appraisal","build"]` | Build only — NOT total cost. |
| Professional fees | `financials.professionalFees` | `["appraisal","fees"]` | |
| Finance costs | `financials.financeCosts` | `["appraisal","finance"]` | Interest + arrangement + exit. |
| Contingency | `financials.contingency` | `["appraisal","contingency"]` | |
| Peak debt | `financials.peakDebt` | `["appraisal","peak-debt"]` | Max drawn balance across the cashflow. |
| Loan required | `financials.loanRequired` | `["appraisal","loan"]` | Facility being sought. |
| Developer profit | `financials.profit` | `["appraisal","profit"]` | GDV − TDC (cross-check). |
| Profit on cost | `financials.profitOnCost` | `["appraisal","profit","ratio"]` | profit ÷ TDC. `valueType: "percent"`. |
| Profit on GDV | `financials.profitOnGdv` | `["appraisal","profit","ratio"]` | profit ÷ GDV. `valueType: "percent"`. |
| LTGDV | `financials.ltgdv` | `["appraisal","leverage","ratio"]` | loan ÷ GDV. `valueType: "percent"`. |
| LTC | `financials.ltc` | `["appraisal","leverage","ratio"]` | loan ÷ TDC. `valueType: "percent"`. |

## Scheme / unit figures

| Figure | fieldPath | templateTags |
|---|---|---|
| Number of units | `scheme.numberOfUnits` | `["appraisal","units"]` |
| Unit schedule (mix) | `scheme.unitSchedule` | `["appraisal","units","schedule"]` (valueType `"json"` — array of {type, count, sqft, price}) |
| Gross internal area | `scheme.grossInternalArea` | `["appraisal","gia"]` |
| Net saleable area | `scheme.netSaleableArea` | `["appraisal","nsa"]` |
| Average £/sqft | `scheme.avgPricePerSqft` | `["appraisal","psf"]` |

## Timeline figures

| Figure | fieldPath | templateTags |
|---|---|---|
| Build duration (months) | `timeline.buildDurationMonths` | `["appraisal","programme"]` |
| Total project duration (months) | `timeline.totalDurationMonths` | `["appraisal","programme"]` |

## Reconciliation checks (flag, don't fix)

- `profit ≈ GDV − TDC`
- `profitOnCost ≈ profit ÷ TDC`
- `ltgdv ≈ loanRequired ÷ GDV`
- `peakDebt ≤ loanRequired` (usually; peak is the drawn max)

If the sheet's stated ratio disagrees with what you compute from its own figures,
record both and surface the discrepancy in the brief — the model may have stale
inputs, and the operator needs to know.
