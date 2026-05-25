# Lender matching rules

Loaded by `../SKILL.md` matching mode steps 4 + 5. Documents how `lender.matchForDeal` computes scores and how to interpret the result for operator-facing recommendations.

## Why this exists

`lender.matchForDeal` is the value-add tool — when prospect-intel produces a Recommended Approach ("bridging £150k-1m, residential, Southport"), this tool turns that into "Optimal lenders: A, B, C". The scoring rubric is documented HERE so:

1. Operator can defend the recommendation ("why is Lender X above Lender Y?")
2. Future tuning to the scorer is auditable (changing weights is documented here, not buried in code)
3. Skills downstream (terms-package-build) know what the scores mean before acting on them

## The scoring rubric

Per-lender, per-dimension, current signals only. Aggregate to a net score; rank desc.

### Positive contributions (additive)

| Dimension | When it contributes | Score |
|---|---|---|
| Deal size | Within `dealSize.min` ≤ x ≤ `dealSize.max` | +3 |
| Deal type | `dealType` in `products.offered` array | +4 |
| Asset class | `assetClass` in `propertyType.allowed` array | +3 |
| Geography | `geography` in `geography.regions` array OR `uk_wide` present | +2 |
| LTV | `ltv` ≤ `ltv.maximum` | +2 |
| LTGDV | `ltgdv` ≤ `ltgdv.maximum` | +2 |
| Timeline | `timelineWeeks` ≥ `timeline.typicalWeeksToOffer` | +2 |

**Why these weights:** deal type is the highest single-dimension signal (+4) because if a lender doesn't offer the product, nothing else matters. Deal size + asset class are next-most-important (+3) because they're hard thresholds for most specialty lenders. Geography + LTV + LTGDV + timeline are softer dimensions (+2) where stretch is occasionally possible.

### Negative contributions (subtractive)

| Dimension | When it contributes | Score |
|---|---|---|
| Deal size | Below `dealSize.min` OR above `dealSize.max` | -5 |
| Deal type | Not in `products.offered` | -4 |
| Asset class | Not in `propertyType.allowed` | -3 |
| Geography | Not in regions AND no `uk_wide` | -2 |
| LTV | `ltv` > `ltv.maximum` | -3 |
| LTGDV | `ltgdv` > `ltgdv.maximum` | -3 |
| Timeline | Lender's typical > requested | -2 |

**Why negatives are steeper than positives in some cases:** size out-of-range is the steepest negative (-5) because a £15m lender doesn't suddenly do a £150k deal. Product mismatch (-4) is steeper than the positive (+4) because operators should be warned away from wrong-product matches more strongly than reassured by right-product matches.

### Default behaviour for missing signals

When a criteria dimension is set but the lender has no signal at that fieldPath:

- The dimension contributes 0 (neither + nor -)
- The lender's score isn't penalised for missing data — uninformed, not incompatible
- The result's `fitConcerns` array adds an entry: "No `<fieldPath>` signal recorded for this lender; matching on this dimension is uninformed"

Operator interpretation: a 0-from-missing-signal is different from a 0-from-balanced-pluses-and-minuses. The first means "we don't know yet"; the second means "actually balanced". Use `currentSignalsCount` to distinguish.

### Lenders with zero appetite signals

Lender exists (clients row with type=lender) but has 0 signals in `appetiteSignals` table:

- `matchScore: 0`
- `matchReasons: []`
- `fitConcerns: ["No appetite signals recorded for this lender; matching is uninformed"]`
- `currentSignalsCount: 0`

Operator interpretation: this lender is in the database but has never had appetite captured. The match doesn't EXCLUDE them but flags that the score is meaningless. Either record appetite first OR ask operator to confirm "include uninformed lenders in shortlist or skip?".

## Score tier interpretation

Use these tiers when presenting matches to the operator:

| Tier | Score | Operator response |
|---|---|---|
| **Optimal** | ≥ 8 | First-call lenders. Most criteria match positively; few or no concerns. |
| **Viable** | 3 – 7 | Worth including in distribution but flag the fitConcerns. Possibly stretch on one dimension. |
| **Stretch** | 0 – 2 | Long shot. Multiple concerns; include only if operator explicitly wants broad distribution. |
| **Uninformed** | 0 AND currentSignalsCount=0 | Lender exists but we have no data; recommend appetite capture before deciding. |
| **Incompatible** | < 0 | Clear mismatches outweigh positives. Don't pitch unless operator wants to test the boundary (e.g., capturing a "no" signal for behavioural-recompute purposes). |

## How operator-facing briefs should phrase results

The skill's brief in matching mode should follow this shape:

```
Matched {N} lenders for the {dealType} {dealSize} {assetClass} deal in {geography}:

Optimal ({optimal_count}):
- {Lender A} (score 12) — {top 2 matchReasons}
- {Lender B} (score 9) — {top 2 matchReasons}

Viable ({viable_count}):
- {Lender C} (score 6) — {top reason}. Concern: {top fitConcern}
- {Lender D} (score 4) — {top reason}. Concern: {top fitConcern}

Stretch / Uninformed: {summary line — N stretch, M uninformed (consider capturing appetite)}

Incompatible: {N — operator should know these were considered but ruled out, with the top fitConcern per lender}
```

Brief should NOT enumerate beyond top 6-8 lenders even if there are more matches. Long lists become unread. If the operator wants the full ranked list, they call the tool directly.

## When matching produces no optimal results

`optimal_count === 0` happens when:

1. **Criteria too specific.** £25m development finance for student accommodation in Wales — niche enough that no recorded appetite covers it. Skill should suggest broadening (one dimension at a time).

2. **Lender database thin in this area.** We have 3 bridging lenders + 0 development finance lenders. Skill notes the gap: "0 optimal matches; consider adding development-finance lenders to the database — none currently recorded."

3. **All in-area lenders are uninformed.** 5 lenders exist that could match but none have appetite captured. Skill recommends capture sessions: "Consider recording appetite for: A, B, C, D, E (currently uninformed)."

In all three cases the brief should be honest about the cause + suggest the actionable next step.

## Tuning the rubric

The weights here are v1 defaults. Adjust based on operational feedback:

- If operators report optimal-tier lenders that actually decline frequently → strengthen the negative weights (e.g., LTV/LTGDV mismatch becomes -4 instead of -3)
- If operators report viable-tier lenders that actually convert → loosen the tiering thresholds (e.g., optimal becomes ≥6 instead of ≥8)
- If a new dimension becomes important (e.g., "lender requires personal guarantee" becomes a deal-killer) → add it to the scorer + this rubric

Changes to weights MUST be reflected in:
1. `convex/appetiteSignals.ts` matchForDeal handler (the code)
2. This document (the rationale)
3. `lender-intel/SKILL.md` matching workflow if interpretation changes

## Future extensions (deferred)

- **Behavioural signal weighting.** `deal_behaviour` sourceType signals (derived from lenderApproaches history — what they've actually approved vs declined) should weigh higher than `manual` or `publication` signals. Currently all sources weigh equally.
- **Recency decay.** Signals from 18 months ago should weigh less than signals from last month. Currently no time decay.
- **Confidence-weighted scoring.** Low-confidence signals (≤0.6) should contribute less to the score. Currently confidence is captured but not used in scoring.
- **Conflict detection.** Two contradictory signals (e.g., bdm_meeting says LTV 70%, publication says LTV 65%) should reduce the lender's score and surface in fitConcerns. Currently latest-write-wins via supersession.

All four would improve match quality but require schema or scorer changes; held for v1.4.
