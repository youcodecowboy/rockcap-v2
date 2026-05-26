# Deal type + phase detection

The 2-dimensional frame for classifying an incoming deal. The deal-intake skill detects BOTH dimensions early (after reading 5-10 docs) and uses the combination to: (1) seed the right checklist requirements, (2) decide which intelligence facts to mine, (3) decide what's "expected missing" vs "alarmingly missing."

Loaded by `deal-intake` skill after initial doc batch classification. Output: `{dealType, dealPhase, confidence, evidence[]}`.

## Voice + format rules

- UK English. When citing a doc, quote its filename in backticks.
- Use "Development / Bridging / Investment" for type — never "Greenfield / Refi / Mid-stage" (operator-corrected 2026-05-25).
- Use `indicative_terms / credit_submission / post_credit / monitoring / redemption` (snake_case, matches `phaseRequired` schema field).

---

## Dimension 1 — Deal TYPE

Three canonical types, per RockCap operator framing (2026-05-25):

### Type: `Development`

**Definition.** New development loan. Capital deployed for ground-up build or major refurb-to-sell.

**Doc shape signature.** Plans-heavy + appraisal-heavy + supporting background docs on the developer.

**Detection signals (in priority order):**
1. **Presence of Plans-category docs** (Floor Plans, Elevations, Site Plan): strong YES for Development.
2. **Appraisal showing GDV + Build Cost + Profit on Cost**: confirms Development.
3. **Build Programme / Contract Sum Analysis**: confirms Development.
4. **Filename signal**: "development", "build", "construction", "scheme" in scheme name OR doc names.
5. **Sponsor type**: client.type = "developer" is a soft signal (the same sponsor can do bridging too).

**Counter-signals** (these REDUCE Development confidence):
- KYC-heavy doc shape with no plans → likely Bridging
- Lease + rent roll docs present → likely Investment Facility

### Type: `Bridging`

**Definition.** Acquiring an asset OR allowing time to sell an asset. Short-term capital (typically 6-24 months).

**Doc shape signature.** KYC-heavy (including application forms) + asset-detail heavy. NOT massively appraisal-heavy (no full development model). Often heavy multi-lender shopping.

**Detection signals (in priority order):**
1. **KYC-heavy + multiple Loan Terms docs from different lenders** (multi-lender shopping is the strongest bridging diagnostic): strong YES.
2. **No Plans / Elevations / Site Plans** (built asset): YES.
3. **Application Form + Asset Valuation present without Build Programme**: YES.
4. **Filename signal**: "bridge", "bridging", "acquisition", "refi" / "refinance" in scheme name OR doc names. Note: "refi" alone could also be Investment Facility — disambiguate by appraisal complexity.
5. **Heads of Terms language**: mentions of "bridge to term", "exit strategy", "sale of asset", "auction acquisition".

**Counter-signals:**
- Heavy plans pack → likely Development
- Long-hold language (lease, rent roll, 5+ year term) → likely Investment Facility

### Type: `Investment Facility`

**Definition.** Asset to be held medium-to-long term (typically 3-10 years). Capital for acquisition or refinance of income-producing asset.

**Doc shape signature.** KYC + appraisal + plans, all reasonably heavy but slightly LESS detail than full Development.

**Detection signals (in priority order):**
1. **Lease / Rent Roll / Tenancy Schedule docs present**: strong YES (asset is income-producing).
2. **Appraisal focused on net yield + DSCR rather than profit-on-cost**: YES.
3. **Long-term Heads of Terms (5+ years)**: YES.
4. **Filename signal**: "investment", "hold", "income", "tenant", "yield" in scheme name OR doc names.

**Counter-signals:**
- Short-term HoTs (< 24 months) → likely Bridging
- Build Programme present → likely Development

### Multi-type signals

Per operator: **all three types can carry multi-lender shopping elements, but bridging is the most heavy on approaching lots of lenders.** A deal with 5+ lender HoTs in the doc shape AND no plans → almost certainly Bridging.

---

## Dimension 2 — Deal PHASE

Five active phases (excluding `pre-intake` which means no docs yet). The phase reflects how far the deal has progressed at the moment of intake.

### Phase: `indicative_terms`

**Definition.** Scheme defined, asking lenders for Heads of Terms.

**Diagnostic docs (presence indicates phase ≥ this):**
- Appraisal
- Plans (for Development / Investment)
- Scheme Brief / Background
- Indicative Terms / Heads of Terms (early in this phase: zero or one HoTs; mid: multiple from different lenders)

**Diagnostic absence (typical for this phase):**
- No Facility Letter (deal not approved yet)
- No Monitoring Reports (deal not drawn)
- Planning Decision Notice may or may not be present (nice-to-have at this phase, required at credit_submission)

### Phase: `credit_submission`

**Definition.** Lender selected, preparing the full credit pack for IC submission.

**Diagnostic docs:**
- Planning Decision Notice present (was nice-to-have, now required)
- Full KYC pack assembled
- Final terms negotiated (often a single canonical Indicative Terms / Term Sheet, not multiple)

**Diagnostic absence:**
- No Facility Letter yet
- No drawn funds (no Loan Statement)

### Phase: `post_credit`

**Definition.** Lender approved, drawing legal docs.

**Diagnostic docs (presence indicates phase ≥ this):**
- Facility Letter (signed)
- Personal Guarantee (often)
- Debenture / Share Charge
- Valuation Report (RICS Red Book)
- Initial Monitoring Report (often started at this phase)

**Diagnostic absence:**
- No drawn funds yet (no Loan Statement showing drawdowns)
- No Interim Monitoring Reports (only Initial)

### Phase: `monitoring`

**Definition.** Loan drawn, active execution under monitoring.

**Diagnostic docs:**
- Loan Statement showing drawdowns
- Interim Monitoring Reports (one or more)
- Possibly: Amended Plans (revisions during build), updated Cashflow, valuation revisions

### Phase: `redemption`

**Definition.** Loan being repaid.

**Diagnostic docs:**
- Redemption Statement
- Completion Statement (for sale completion driving the redemption)
- Final Monitoring Report

---

## The 3 × 5 combination matrix

Not every combination is common. Real production tends toward these patterns:

| Type | Phase | Common? | What checklist requirements to seed | What intelligence facts to mine |
|---|---|---|---|---|
| Development | indicative_terms | **YES (most common)** | Standard 15-item template, all phases included | GDV, TDC, profit on cost, unit count, scheme address, sponsor name, location, planning status |
| Development | credit_submission | YES | Standard 15-item + ensure Planning Decision is required | Same as above + IC paper inputs (DSCR, peak debt, exit strategy) |
| Development | post_credit | YES | Standard 15-item, post_credit items focus | Same + actual draw schedule, monitoring KPIs |
| Development | monitoring | YES | Standard 15-item, monitoring items focus | Build progress %, drawdowns to date, projected vs actual cost |
| Bridging | indicative_terms | **YES (common for multi-lender shopping)** | Bridging template (KYC-heavy, no Plans) — template pending | Asset value, exit strategy (sale / refi), days to exit, bridge LTV |
| Bridging | credit_submission | YES | Bridging template + final lender selection | Same + chosen lender, finalised terms |
| Bridging | post_credit | YES | Bridging template + drawdown materials | Same + drawn amount, repayment schedule |
| Bridging | monitoring | YES (short — typically < 24 months) | Bridging template + exit-strategy progress | Sale progress, refi progress, days to maturity |
| Investment Facility | indicative_terms | YES | Investment template (KYC + Appraisal + Plans, lease/rent roll required) — template pending | Asset value, net yield, DSCR, tenant covenant strength, lease term remaining |
| Investment Facility | credit_submission | YES | Investment template + lender selection | Same + final terms, exit assumptions |
| Investment Facility | post_credit | YES | Investment template + drawdown | Same + actual debt service ratio |
| Investment Facility | monitoring | YES (long — typically 3-10 years) | Investment template + rent roll updates | Occupancy %, debt service trend, valuation evolution |

**The 3 reference deals as worked examples:**

- **Comberton (Bayfield)**: Type=`Development`, Phase mixed (`indicative_terms` based on HoTs presence but no Facility Letter, with `monitoring` artefacts in portfolio appraisal). Likely either an active deal in indicative phase OR an older deal where portfolio-wide monitoring docs are mixed in. Skill should flag the mixed phase signals for operator clarification.
- **Manor Park Refinance (Capstone)**: Type=`Bridging` (no plans + 27 Loan Terms from multiple lenders + 15 KYC), Phase=`indicative_terms` (no Facility Letter present).
- **Monksbury Court (Kinspire)**: Type=`Development`, Phase=`monitoring` (has Facility Letter, Loan Statement, Initial Monitoring Report, Interim Monitoring Report — past close and drawn).

---

## Detection algorithm

The skill runs this after the initial V4 classification batch completes:

```
1. Score Type:
   a. Count docs by category × fileTypeDetected
   b. Apply each Type's detection signals — sum weighted scores
   c. Apply counter-signals — subtract
   d. Pick highest; if top two are within 20%, set confidence=LOW and flag for operator clarification

2. Score Phase:
   a. Check diagnostic-presence rules in order (redemption → monitoring → post_credit → credit_submission → indicative_terms)
   b. Pick first phase whose presence rules match
   c. Cross-check diagnostic-absence rules; if violated, set confidence=LOW and flag mixed signals

3. Output:
   {
     dealType: "Development" | "Bridging" | "Investment Facility",
     dealPhase: "indicative_terms" | "credit_submission" | "post_credit" | "monitoring" | "redemption",
     confidence: HIGH | MED | LOW,
     evidence: [{signal: "...", supporting_docs: [...]}, ...]
   }
```

The skill persists this output via `intelligence.addKnowledgeItem` at fieldPaths:
- `deal.type` (value: string, isCanonical: true)
- `deal.phase` (value: string, isCanonical: true)
- `deal.detectionConfidence` (value: string, isCanonical: true)
- `deal.detectionEvidence` (value: array, isCanonical: true, sourceType: ai_extraction)

---

## What goes wrong

1. **Mixed type signals.** A Development sponsor sometimes refinances an older asset, producing a Bridging-shaped doc batch under a developer client. Skill flags as `mixed_type_signal` and asks operator to confirm.
2. **Portfolio docs muddy the doc shape.** Comberton's intake includes a portfolio appraisal covering 4 schemes — that one doc inflates the appraisal count without indicating Development scale. Skill should detect portfolio docs (mentions multiple schemes in entities/summary) and weight them less.
3. **No phase diagnostic absence.** A deal in `post_credit` should NOT have monitoring reports unless transitioning. If both Facility Letter AND multiple Interim Monitoring Reports present, phase is `monitoring`, not `post_credit`.
4. **Brand-new intake with thin batch.** When the doc count is <5, detection confidence is automatically LOW. Skill stands up the project shell with placeholder type/phase and flags `intake_too_thin_for_detection` for operator to set manually.
