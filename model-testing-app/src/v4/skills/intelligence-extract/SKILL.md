---
name: intelligence-extract
description: Extracts structured intelligence fields from classified documents. Called after classification with the full document text. Extracts financial data, dates, entities, conditions, references, and domain-specific fields. Maps to canonical field paths, tags for template retrieval, and applies confidence scoring based on document authority.
---

# Intelligence Extraction Skill

You are extracting structured intelligence from a document that has already been classified. Your job is to find every relevant data point and return it as a structured, tagged field.

## Context

You will receive:
1. **Full document text** (up to 8,000 characters per document, may be batched)
2. **Document type and category** (already classified)
3. **Expected fields** for this document type (canonical field paths)

## Extraction Rules

### What to Extract

Extract EVERY relevant data point you can find:

- **Financial**: Amounts (GBP), percentages (%), ratios (LTV, LTC), costs, values, fees, rates
- **Dates**: Completion, expiry, valuation, registration, start, end, maturity, submission, approval
- **Entities**: Companies, people, roles, property addresses, project names, professional firms
- **References**: Policy numbers, account numbers, title numbers, planning refs, case refs
- **Conditions**: Planning conditions, loan conditions precedent/subsequent, warranties, obligations
- **Measurements**: Unit counts, square footage (sqft/sqm), site area, floor areas, densities
- **Legal**: Tenure, title details, covenants, restrictions, charges, lease terms, guarantees
- **Insurance**: Policy details, cover amounts, expiry dates, insurer names, cover types
- **Valuation**: Market values, GDV, special assumptions, comparables, basis of value
- **Risk**: Identified risks, severity assessments, mitigants, risk categories
- **Status**: Application status, approval status, compliance status, construction progress

### Field Path Mapping

Use **canonical field paths** when the data matches a known field. Use category-prefixed paths for non-canonical domain fields. Only use `custom.*` when no standard category applies.

#### Project-Level Canonical Paths

**Financials**
- `financials.gdv` — Gross Development Value
- `financials.loanAmount` — Loan/facility amount
- `financials.ltv` — Loan to Value ratio
- `financials.ltc` — Loan to Cost ratio
- `financials.purchasePrice` — Purchase/acquisition price
- `financials.totalDevelopmentCost` — Total development cost
- `financials.constructionCost` — Build/construction cost
- `financials.profitMargin` — Profit margin percentage
- `financials.equityContribution` — Equity contribution
- `financials.currentValue` — Current market value

**Overview**
- `overview.projectName` — Project/scheme name
- `overview.unitCount` — Number of units
- `overview.totalSqft` — Total square footage / GIA / GIFA

**Location**
- `location.siteAddress` — Site/property address
- `location.postcode` — Postcode
- `location.titleNumber` — Title number
- `location.localAuthority` — Local planning authority

**Timeline**
- `timeline.practicalCompletion` — PC date
- `timeline.constructionStart` — Construction start date
- `timeline.acquisitionDate` — Acquisition/exchange date
- `timeline.projectDuration` — Project duration/term

**Legal**
- `legal.titleDetails` — Title details and ownership
- `legal.charges` — Charges and encumbrances on title
- `legal.covenants` — Restrictive covenants
- `legal.leaseTerms` — Lease terms (if leasehold)
- `legal.guarantees` — Guarantee details
- `legal.conditionsPrecedent` — Legal conditions precedent
- `legal.conditionsSubsequent` — Legal conditions subsequent

**Insurance**
- `insurance.policyNumber` — Insurance policy number
- `insurance.insurer` — Insurer name
- `insurance.coverAmount` — Cover amount
- `insurance.expiryDate` — Policy expiry date
- `insurance.coverType` — Type of cover (CAR, PI, public liability, etc.)

**Planning**
- `planning.applicationRef` — Planning application reference number
- `planning.status` — Planning status (granted, pending, refused, etc.)
- `planning.conditions` — Planning conditions summary
- `planning.s106Details` — S106 agreement details and obligations
- `planning.cil` — Community Infrastructure Levy liability
- `planning.permittedDevelopment` — Permitted development rights

**Valuation**
- `valuation.marketValue` — Market value (current)
- `valuation.gdv` — GDV as stated in valuation
- `valuation.specialAssumptions` — Special assumptions applied
- `valuation.comparables` — Comparable evidence used
- `valuation.valuer` — Valuer name/firm
- `valuation.valuationDate` — Date of valuation
- `valuation.basisOfValue` — Basis of value (market value, reinstatement, etc.)

**Risk**
- `risk.description` — Risk description
- `risk.severity` — Risk severity (high/medium/low)
- `risk.mitigant` — Risk mitigant or mitigation strategy
- `risk.riskCategory` — Risk category (market/construction/planning/exit/borrower)

**Conditions**
- `conditions.precedent` — Conditions precedent (loan drawdown requirements)
- `conditions.subsequent` — Conditions subsequent (post-completion obligations)
- `conditions.ongoing` — Ongoing conditions/covenants
- `conditions.waivers` — Waiver requests or granted waivers

**Parties**
- `parties.solicitor` — Solicitor/law firm
- `parties.valuer` — Valuer/valuation firm
- `parties.architect` — Architect
- `parties.contractor` — Main contractor
- `parties.monitoringSurveyor` — Monitoring surveyor / PMS
- `parties.broker` — Broker/introducer
- `parties.guarantor` — Guarantor

#### Client-Level Canonical Paths

- `company.name` — Company/borrower name
- `company.registrationNumber` — Company number / CRN
- `company.registeredAddress` — Registered office address
- `company.incorporationDate` — Incorporation date
- `contact.primaryName` — Primary contact name
- `contact.email` — Contact email
- `contact.phone` — Contact phone

#### Custom Paths

Only use `custom.*` when no canonical category applies. Use snake_case:
- `custom.epc_rating` — EPC energy rating
- `custom.flood_risk_zone` — Flood risk zone

For domain-specific fields not in the canonical list, prefer the correct category prefix:
- `financials.arrangement_fee` (not `custom.arrangement_fee`)
- `legal.tenure` (not `custom.tenure`)
- `planning.conditions_count` (not `custom.conditions_count`)

## Confidence Scoring

Base confidence on **document authority** + **value clarity**.

### Document Authority (base confidence)

- Formal legal documents (facility letters, deeds, guarantees): base **0.90**
- Professional reports (valuations, surveys, inspections): base **0.85**
- Financial statements and bank records: base **0.85**
- Planning documents and consents: base **0.85**
- Term sheets and indicative terms: base **0.80**
- Insurance certificates: base **0.80**
- Correspondence and emails: base **0.65**
- Meeting notes and call summaries: base **0.60**
- Internal notes and memos: base **0.55**

### Value Clarity (adjust from base)

- Explicitly labeled and formatted (e.g., "Loan Amount: £2,500,000"): **+0.05**
- Clearly stated but not labeled (e.g., "...facility of £2,500,000..."): **+0.00**
- Requires calculation or inference: **-0.10**
- Mentioned casually or in passing: **-0.15**
- Contradicted elsewhere in same document: **-0.20**

### Minimum Threshold

Do NOT extract fields with confidence below **0.50**. If a value is too uncertain, skip it entirely.

## Source Text

For every field, include a `sourceText` quote — the exact text from the document that contains the value. Keep quotes under 150 characters. This is REQUIRED for every field and is used as evidence for provenance and verification.

## Original Label

Always set `originalLabel` to what the document actually called this data point before you mapped it to a canonical path. For example, if the document says "Total Loan Facility" and you map it to `financials.loanAmount`, set `originalLabel` to "Total Loan Facility".

## Page Reference

When you can identify the page number or section where a value appears, include it in `pageReference`. Examples: "p.3", "pp.12-14", "Schedule 2", "Appendix A", "Section 4.2". This is optional but recommended.

## Scope Assignment

- `project` — Data about a specific property/deal/scheme (financials, timeline, location, development, legal, planning, valuation, insurance, risk, conditions, parties)
- `client` — Data about the person/company/borrower (identity, company info, contacts, client-level financial profile)

## Template Tagging

Every extracted field MUST have a `templateTags` array with at least `["general"]`. Tags indicate which output document templates can use this field. Apply tags based on field content:

### Tag Taxonomy

| Tag | Description |
|-----|-------------|
| `general` | Default tag, always included |
| `lenders_note` | Data for lender's internal credit notes |
| `credit_submission` | Data for formal credit committee papers |
| `proposal` | Data for lending proposals to borrowers |
| `deal_summary` | Data for high-level deal overviews |
| `due_diligence` | Data supporting DD checklists |
| `risk_assessment` | Data relevant to risk evaluation |
| `valuation_summary` | Data from/about property valuations |
| `legal_summary` | Data from legal documents |
| `monitoring` | Data for ongoing project monitoring |

### Tagging Rules

Apply tags based on field category. Always include `general` plus the relevant tags:

1. **Financial amounts** (GDV, loan, costs, values, fees, rates) → `general`, `lenders_note`, `credit_submission`, `deal_summary`
2. **Borrower/client identity** (company name, directors, experience) → `general`, `credit_submission`, `lenders_note`, `due_diligence`
3. **Property/site details** (address, tenure, title, location) → `general`, `lenders_note`, `due_diligence`, `deal_summary`
4. **Loan terms** (rate, fees, LTV, term, conditions) → `general`, `proposal`, `credit_submission`, `lenders_note`
5. **Dates/timeline** (completion, maturity, milestones) → `general`, `deal_summary`, `monitoring`, `lenders_note`
6. **Risk factors** (risks, caveats, warnings, mitigants) → `general`, `risk_assessment`, `credit_submission`
7. **Valuation data** (market value, comparables, assumptions) → `general`, `valuation_summary`, `lenders_note`, `credit_submission`
8. **Legal details** (title, charges, guarantees, covenants) → `general`, `legal_summary`, `due_diligence`, `credit_submission`
9. **Planning details** (refs, conditions, S106, CIL) → `general`, `due_diligence`, `risk_assessment`
10. **Insurance details** (policy, cover, expiry) → `general`, `risk_assessment`, `monitoring`
11. **Conditions** (precedent, subsequent, ongoing) → `general`, `legal_summary`, `credit_submission`, `monitoring`
12. **Parties** (solicitor, valuer, contractor, etc.) → `general`, `deal_summary`, `due_diligence`
13. **Construction/development** (units, sqft, specs) → `general`, `deal_summary`, `monitoring`, `lenders_note`
14. **Contact/entity info** (names, emails, roles) → `general`, `deal_summary`

When in doubt, include MORE tags rather than fewer.

## Output Format

Return a JSON array (for single document) or a JSON object keyed by document index (for batched documents).

### Single Document Response

```json
[
  {
    "fieldPath": "financials.gdv",
    "label": "Gross Development Value",
    "value": "12500000",
    "valueType": "currency",
    "confidence": 0.90,
    "sourceText": "The Gross Development Value is estimated at £12,500,000",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "lenders_note", "credit_submission", "deal_summary"],
    "category": "financials",
    "originalLabel": "Gross Development Value",
    "pageReference": "p.8"
  },
  {
    "fieldPath": "planning.applicationRef",
    "label": "Planning Application Reference",
    "value": "23/01713/FULM",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Application Reference: 23/01713/FULM",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "due_diligence", "risk_assessment"],
    "category": "planning",
    "originalLabel": "Application Reference",
    "pageReference": "p.1"
  }
]
```

### Batched Response (multiple documents)

When processing multiple documents, return a JSON object keyed by document index:

```json
{
  "0": [
    { "fieldPath": "financials.gdv", "label": "...", ... }
  ],
  "1": [
    { "fieldPath": "legal.titleDetails", "label": "...", ... }
  ]
}
```

## Value Type Guidelines

- `currency` — Numeric value in base units (e.g., £2.5m = "2500000"). Strip currency symbols.
- `percentage` — Numeric percentage (e.g., 65% = "65"). Strip % symbol.
- `number` — Plain numeric (e.g., unit count = "24")
- `date` — ISO format YYYY-MM-DD where possible
- `text` — Free text string
- `boolean` — "true" or "false"

## Self-Review (REQUIRED before returning)

Before finalizing your extraction, review EVERY field against these checks:

1. **Value accuracy**: Re-read the source text for each extracted value. Did you transcribe the number correctly? Common mistakes:
   - Mixing up GDV and loan amount
   - Confusing LTV% with LTGDV%
   - Reading dates in wrong format (DD/MM vs MM/DD — UK documents use DD/MM/YYYY)
   - Getting net vs gross figures wrong

2. **Scope assignment**: Is this a client-level or project-level field? Banking details and company info = client. Loan amount, GDV, site address = project.

3. **Confidence calibration**: Only assign > 0.90 if the value is explicitly stated with a clear label. Derived or calculated values should be ≤ 0.80. If a figure requires inference from context, cap at 0.70.

4. **Duplicate fields**: Check you haven't extracted the same data point under two different field paths (e.g., both `financials.gdv` and `valuation.gdv` for the same number).

5. **sourceText verification**: Every field MUST have a sourceText quote. If you can't point to specific text, you shouldn't be extracting the field.

6. **Currency values**: Verify numeric strings are in base units (£2.5m = "2500000", not "2.5" or "£2,500,000").

If any check fails, fix the field or remove it entirely. Precision matters more than volume.

## Important

1. Extract as MANY fields as possible — err on the side of including more rather than less
2. Every field MUST have a `sourceText` evidence quote
3. Every field MUST have `templateTags` with at least `["general"]`
4. Every field MUST have `category` matching the first segment of `fieldPath`
5. Every field MUST have `originalLabel` (what the document called it)
6. Use canonical paths when available; use correct category prefix for non-canonical fields; only `custom.*` as last resort
7. Financial values should be numeric strings without currency symbols
8. Do not extract fields with confidence below 0.50
9. Return ONLY the JSON. No markdown, no explanation, just valid JSON.
