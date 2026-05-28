# Bridging vs Developer Classification

Reference loaded by `../SKILL.md` step 5. This document defines how RockCap classifies a prospective borrower into one of four buckets based on the data the prospect-intel workflow has gathered. The classification colours the reachout angle, the lender match, and the financing product on offer.

## The four classifications

| Code | Label | Typical product fit | Typical ticket | Typical tenor |
|---|---|---|---|---|
| `new_development` | New development | Term development loan with build monitoring | £2m to £50m+ | 18 to 36 months |
| `bridging` | Bridging | Bridging loan or short-term development exit | £500k to £15m | 6 to 24 months |
| `existing_asset` | Existing asset | Investment loan, refinance of stabilised asset | £2m to £30m+ | 5 to 25 years |
| `unclassifiable` | Unclassifiable | Defer; gather more data before reaching out | n/a | n/a |

A prospect may have features of more than one bucket. In that case, classify by the dominant pattern from the most recent two years of activity. Note the secondary fit in the intelligence write-up; it informs the reachout angle ("we can also do new development finance if your next scheme moves to construction").

## Signals to weigh

The lender DNA picture (`./lender-dna-from-charges.md`) is the strongest signal. Supplement with company-age and SIC-code signals; combine into a classification with stated confidence.

### From the charge book

| Signal | Points towards |
|---|---|
| Three or more bridging-shaped charges (under 18 months tenor) satisfied in the last 36 months | bridging |
| A single bridging charge over a year old with no successor pattern | bridging, possibly transitioning |
| Multiple development-finance-shaped charges (18-36 month tenor) with named development lenders | new_development |
| Charges with high-street banks at tenors over 36 months on the same asset class | existing_asset |
| Mix of bridging and development finance charges in the last 24 months, with the developer SPV pattern | new_development (with bridging as the bridge-to-development entry point) |
| Recent SPV proliferation with first-time charges in the last 12 months | new_development for the new vehicles, qualify the parent separately |
| All charges satisfied, no current exposure, recent incorporations | new_development (the developer is positioning for a new scheme) |
| Charges on assets in central London or prime asset classes only | existing_asset or new_development, never bridging unless explicitly fast-execution |
| Security-agent-only charges with multiple co-mortgages | new_development or existing_asset, not bridging |

### From Companies House profile

| Signal | Points towards |
|---|---|
| SIC code `41100` (development of building projects) | new_development default |
| SIC code `41201` or `41202` (construction of commercial / domestic) | new_development |
| SIC code `68100` (buying and selling of own real estate) | existing_asset or bridging depending on holding pattern |
| SIC code `68209` (other letting and operating of own or leased real estate) | existing_asset default |
| SIC code `68310` (real estate agencies) | unclassifiable for RockCap's borrower lens |
| Company age under 18 months with multiple charges already filed | new_development (active developer using SPVs) |
| Company age over 10 years, charges on the same property over a decade | existing_asset (long-term holder) |
| Dormant flag set | unclassifiable; check parent/sister structure |
| Liquidation or administration appointment recent | unclassifiable; do not reach out without senior sign-off |

### From HubSpot Beauhurst metadata (if populated)

| Signal | Points towards |
|---|---|
| `beauhurst_data_stage_of_evolution` = "growth" or "established" with turnover > £5m | new_development or existing_asset |
| `beauhurst_data_total_funding_received` > £20m | new_development scale |
| `beauhurst_data_headcount` < 5 with active charges | bridging or single-scheme new_development |
| `beauhurst_data_risk_signals` populated with adverse content | unclassifiable; senior review |

### Trigger context

When `triggerContext` is provided to the skill, weight the classification accordingly:

- Trigger is a planning-approval hit: pulls towards `new_development` if the application is for a scheme that needs build finance.
- Trigger is a recent charge filing: classify against the new charge, not the company's history.
- Trigger is a referral: respect the referrer's framing where they have told us what the borrower wants.
- Trigger is a press mention of a sale or acquisition: pulls towards `bridging` (refinance window) or `existing_asset` (stabilised hold).

## How to assign confidence

Three tiers:

- **High**: multiple aligning signals from at least two source categories (charges + SIC, or charges + Beauhurst). No contradicting signals.
- **Medium**: one source category aligns clearly; others are sparse or neutral.
- **Low**: signals are sparse or contradicting. Classify based on most recent activity but flag for human override.

Skills write the classification and confidence into `clientIntelligence.lenderProfile.staticLayer` or as a `knowledgeItems` row with `fieldPath: "borrower_profile.classification"` and `value: { code, label, confidence, rationale }`. Always include the rationale (one sentence per signal that drove it) so a future skill or human can verify or override.

## Don't do these things

- Don't classify based on a single bridging charge from five years ago. Recent activity dominates.
- Don't extrapolate from charges held by security agents without naming "syndicate, agents only" in the rationale.
- Don't classify a sponsor company (a vehicle that holds other vehicles) by its own SIC code; look at its subsidiaries.
- Don't classify a dissolved or liquidating company. Set `unclassifiable` and stop.
- Don't write a classification without the rationale field. Unexplained classifications can't be improved.
