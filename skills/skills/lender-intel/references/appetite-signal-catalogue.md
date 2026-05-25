# Appetite signal catalogue

Loaded by `../SKILL.md` capture mode step 4. The standard fieldPaths for lender appetite signals — what to capture, how to phrase the value, and which signals are matching-critical.

## Why standardised paths matter

`lender.matchForDeal` scores lenders by reading current signals at specific fieldPaths (e.g., `dealSize.min`, `propertyType.allowed`). Custom paths are allowed but won't contribute to matching unless the matching tool is extended. **Use the standard paths below for any signal that should affect matching.**

## Critical-for-matching signals

These 7 fieldPaths directly drive `lender.matchForDeal` scoring. Capture them whenever the source mentions them — they're the headline appetite dimensions.

| fieldPath | valueType | Example values | Why it matters for matching |
|---|---|---|---|
| `dealSize.min` | `currency` | `500000` (= £500k) | Lenders below this min won't fund; -5 to match score |
| `dealSize.max` | `currency` | `15000000` | Lenders above this max won't fund; -5 to match score |
| `products.offered` | `array` | `["bridging", "development_finance"]` | If deal type isn't in array: -4. If it is: +4 |
| `propertyType.allowed` | `array` | `["residential", "mixed_use"]` | If asset class not allowed: -3. If allowed: +3 |
| `geography.regions` | `array` | `["london", "south_east", "uk_wide"]` | If geography not covered: -2. If covered or uk_wide: +2 |
| `ltv.maximum` | `percentage` | `0.70` (= 70%) | If deal LTV > max: -3. If within: +2 |
| `ltgdv.maximum` | `percentage` | `0.65` (= 65%) | If deal LTGDV > max: -3. If within: +2 |
| `timeline.typicalWeeksToOffer` | `number` | `3` (weeks) | If deal needs faster than typical: -2. If within: +2 |

**Operator note:** the 4 array-valued fields (`products.offered`, `propertyType.allowed`, `geography.regions`) must be captured as ARRAYS even when the lender offers just one thing. Future signals will extend the array; matching always checks `array.includes()`.

## Allowed enum values

For consistency across lenders, use these standard values in the array-valued fields:

### `products.offered`
- `bridging` — short-term (≤24mo), asset-secured
- `development_finance` — term ground-up construction
- `term` — long-hold investment loan (5-25 years)
- `btl` — buy-to-let specialty (income-secured)
- `mezzanine` — second-position with senior layered above
- `commercial` — commercial-property-secured term
- `land` — land-only bridging (no consent OR pre-planning)

### `propertyType.allowed`
- `residential` — houses + flats for sale/rent
- `commercial` — office / retail / industrial
- `mixed_use` — combined residential + commercial
- `student` — purpose-built student accommodation
- `coliving` — single-let HMO / coliving
- `senior_living` — retirement / assisted living
- `hotel` — hospitality assets
- `industrial` — warehouse / logistics
- `land` — undeveloped sites

### `geography.regions`
- `london` — within M25
- `south_east` — Surrey, Kent, Sussex, Essex, Berks, Bucks, Herts (ex-London)
- `south_west` — Devon, Cornwall, Somerset, Dorset, Wilts, Glos
- `midlands` — West + East Midlands
- `north_west` — Lancs, Manchester, Liverpool, Cheshire, Cumbria
- `north_east` — Tyneside, Yorkshire, Durham
- `wales` — all of Wales
- `scotland` — all of Scotland
- `ni` — Northern Ireland
- `uk_wide` — no regional restriction

Custom regions OK (e.g., `m25_only`, `wider_southeast`) but matching won't recognise them — falls through to "geography not covered" -2.

## Supplemental signals (recorded but not currently in matching)

These signals are valuable for operator-readable context + may be added to matching scoring in a future iteration. Capture when stated.

| fieldPath | valueType | Example | Operational use |
|---|---|---|---|
| `pricing.bridgingFrom` | `percentage` | `0.085` (= 8.5%) | Lender's lowest rate; useful in shortlist context |
| `pricing.devFinanceFrom` | `percentage` | `0.085` | Same for dev finance |
| `pricing.spreadOverBase` | `percentage` | `0.04` (= +400bp over SONIA) | Variable-rate pricing pattern |
| `fees.arrangement` | `percentage` | `0.015` (= 1.5%) | Standard arrangement fee |
| `fees.exit` | `percentage` | `0.01` (= 1%) | Exit fee if any |
| `sponsor.minUnitsCompleted5yr` | `number` | `50` | Several specialty banks gate on minimum track record |
| `sponsor.experienceTier` | `string` | `"experienced"` ("new" / "experienced" / "established") | Looser version of the units-completed gate |
| `kyc.requirementLevel` | `string` | `"enhanced"` ("standard" / "enhanced" / "intensive") | Operator-relevant for upfront doc collection |
| `decisioning.processWeeks` | `number` | `4` | Total weeks from drawdown application to funds (not just offer) |
| `decisioning.creditCommitteeFrequency` | `string` | `"weekly"` ("rolling" / "weekly" / "fortnightly" / "monthly") | Drives timeline expectations |
| `relationship.preferredCommunication` | `string` | `"email"` | BDM-relationship-management hint |
| `appetite.summary` | `string` | `"Tightening on resi >£3m; opening on commercial conversions"` | Free-text snapshot for human reading |
| `red_flags.zones` | `array` | `["high_flood_risk", "ex_local_authority_flats"]` | Things they won't fund regardless of headline criteria |
| `notes.bdm` | `string` | `"James the BDM is moving to Allica next quarter; relationship transferring to Sarah"` | Relationship continuity notes |

## How to phrase the value field

The `value` field accepts any JSON-compatible type. Match `valueType`:

- `number` — bare number: `15000000`
- `currency` — number in GBP minor units would be ideal but for ergonomics use GBP integer pounds: `15000000` (= £15m)
- `percentage` — decimal 0-1: `0.65` (= 65%); NOT 65
- `string` — bare string: `"weekly"`
- `array` — JSON array of strings: `["residential", "commercial"]`
- `boolean` — `true` / `false`
- `date` — ISO date string: `"2026-06-15"`

**Don't mix.** A `percentage` valueType with value `65` (instead of 0.65) breaks the matching scorer's threshold comparisons.

## Confidence calibration

Same scale as meeting-capture's intelligence extraction:

- `1.0` — explicit-authoritative ("Our max LTGDV is 70% on dev finance" stated by named BDM)
- `0.8` — stated-but-qualified ("We're typically up to about 70% LTGDV")
- `0.6` — derived ("So if GDV is £10m and you're after £6.5m, that's 65% — yeah we can do that" → ltgdv.max ≈ 0.65)
- `0.4` — implied ("We don't usually do anything below £2m these days" → dealSize.min ≈ 2000000)
- `<0.4` — don't extract; capture as a notes signal (`appetite.summary`) instead

When confidence ≤ 0.6, ALSO populate the `notes` field with the source's exact wording so a reviewing operator can decide whether to up-grade or down-grade the signal.

## When to capture vs notes

Some lender statements are useful but don't fit a fieldPath. Don't force them. Capture as:

```typescript
{ fieldPath: "notes.market_view", valueType: "string", value: "Pluto sees Q4 2026 turn — expanding back into mid-tier dev finance", confidence: 0.8 }
```

OR

```typescript
{ fieldPath: "appetite.summary", valueType: "string", value: "Tightening on resi >£3m...", confidence: 0.8 }
```

Multiple `notes.*` signals are fine. They show up in `lender.getDeepContext.currentAppetite` as fieldPath keys but don't contribute to match scoring.

## Anti-patterns to avoid

- **Don't capture the lender's name OR product list as separate signals if you're already setting `products.offered`.** Each fieldPath captures ONE concept.
- **Don't capture inferences as signals.** "They probably do bridging" is not the same as "they confirmed they do bridging." If the source is unclear, capture nothing OR a low-confidence `appetite.summary`.
- **Don't capture deal-specific signals as appetite.** "They liked the Comberton deal" is project-level intelligence (goes to clientIntelligence), not appetite. Appetite is the lender's *general* preferences.
- **Don't capture rate quotes as `pricing.*` signals.** A specific quote on a specific deal is `lenderApproaches` data (different table). `pricing.*` is the lender's headline rate for their published products.
