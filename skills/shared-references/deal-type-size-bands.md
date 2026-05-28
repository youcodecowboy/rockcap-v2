# Deal-type size bands

Canonical reference for estimating an indicative deal size when the prospect has not told us a number. Loaded by `prospect-intel` (the Recommended approach section of the intel report) and any skill that has to put a size on a deal from public evidence alone.

The classification taxonomy this file pairs with is the four-bucket deal type defined in `skills/prospect-intel/references/bridging-vs-developer.md`: `new_development`, `bridging`, `existing_asset`, `unclassifiable`.

## The non-negotiable: range, confidence, basis

A deal-size estimate is always three things together:

1. **A range**, never a point. "£8m" is forbidden. "£6-10m" is the unit.
2. **A confidence label** — High, Medium, or Low (rubric below).
3. **A "based on X" provenance line** stating the evidence the range was derived from.

A naked number with no range, no confidence, and no basis is forbidden. It reads as precision we do not have, it cannot be checked, and it cannot be improved. If the evidence is too thin to derive even a coarse range, fall back to the deal-type band (below), label it Low confidence, and say the basis is the deal type alone.

Example of a compliant line:

> **Estimated deal size:** £6-10m (Medium confidence) — based on Woodberry Park (48 units) at a regional average sale value of ~£325k giving an indicative GDV of ~£15.6m, loan estimated at 60-65% LTGDV.

Example of a forbidden line:

> Estimated deal size: £9m.

## Derivation method

Use the strongest evidence available. Two methods, in priority order.

### Method A — development pipeline (preferred for `new_development`)

When the prospect has a visible scheme (units + location from website, planning portal, or press):

1. **Units** — count the residential units (or floor area for commercial) from the scheme evidence.
2. **Regional average sale value** — multiply units by the average sale value for that region and asset class. Use a conservative regional figure; do not assume prime values unless the evidence shows a prime location.
3. **Indicative GDV** — units × regional avg sale value = gross development value.
4. **Loan at typical LTGDV** — apply a typical loan-to-GDV ratio (60-65% for senior development debt is the working assumption; note if the structure suggests stretch senior or mezzanine, which pushes higher).

The range comes from the spread between the conservative and optimistic ends of the sale-value and LTGDV assumptions. State the units, the regional value used, the implied GDV, and the LTGDV in the basis line.

### Method B — charge-book sum (preferred for `existing_asset` and refinance `bridging`)

When the prospect has no visible new scheme but has a Companies House charge book:

1. **Sum the outstanding charge sizes** where charge amounts are disclosed.
2. Where charge amounts are not disclosed (common — many charges show no figure), estimate from the charged asset where the asset is identifiable, and say so.
3. The indicative deal size is the total current secured exposure, framed as a refinance-or-extend opportunity.

State which charges were summed (by charge ID) and which were estimated in the basis line.

If neither method has enough evidence, use the coarse fallback band for the deal type.

## Confidence rubric

| Confidence | When to use |
|---|---|
| **High** | Method A with a confirmed unit count AND a defensible regional sale value (e.g., units from a planning consent + comparable sales for the postcode), OR Method B with disclosed charge amounts that sum cleanly. Two corroborating inputs, no contradictions. |
| **Medium** | One solid input, the other estimated. E.g., confirmed unit count but a regional sale value applied generically; or charge book summed but with one or two amounts estimated from the asset. |
| **Low** | Estimate rests on the deal-type fallback band alone, or on a single weak input (e.g., "developer of unknown scale" with no unit count and no charge amounts). Always pair Low with an explicit gap noting what evidence would lift it. |

The confidence label on the deal size is independent of the overall report confidence — a report can be HIGH on identity and lender DNA but LOW on deal size if no scheme or charge amount is visible.

## Coarse fallback bands

When evidence will not support a derived range, fall back to the band for the classified deal type. These are deliberately wide — they are the "we know the type but not the number" answer. Always label Low confidence and state the basis is the deal type alone.

| Deal type | Fallback band | Notes |
|---|---|---|
| `new_development` | £2-50m | The widest band — a single-unit infill scheme and a 200-unit phased development are both new development. Narrow with units the moment any unit evidence appears. |
| `bridging` | £0.5-15m | Short-term, fast-execution. The lower bound reflects the smallest bridging tickets RockCap will look at; the upper bound the larger refinance-window bridges. |
| `existing_asset` | £2-30m | Investment loan or refinance of a stabilised asset. Sized off the asset value where identifiable; the band is the fallback when it is not. |
| `unclassifiable` | n/a | Do not produce a deal-size estimate for an unclassifiable prospect. Surface the classification gap instead. |

## Worked examples

**`new_development`, Method A, Medium confidence:**

> **Estimated deal size:** £6-10m (Medium confidence) — based on Woodberry Park (48 units, source: planning portal ref 23/01234/FUL) at a regional average sale value of ~£325k giving an indicative GDV of ~£15.6m, senior loan estimated at 60-65% LTGDV. Unit count is confirmed; sale value is a regional average, not postcode-specific comparables.

**`existing_asset`, Method B, High confidence:**

> **Estimated deal size:** £11-13m (High confidence) — based on the sum of 6 outstanding charges (charge IDs 0041, 0043-0047) with disclosed amounts totalling £12.1m, framed as a refinance of the stabilised portfolio.

**`bridging`, fallback band, Low confidence:**

> **Estimated deal size:** £0.5-15m (Low confidence) — based on the bridging classification alone; no scheme, charged-asset value, or disclosed charge amount is visible in public data. A charge amount or an asset valuation would lift this to Medium. (Gap recorded.)
