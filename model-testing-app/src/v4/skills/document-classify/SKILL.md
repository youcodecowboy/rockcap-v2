---
name: document-classify
description: Classifies uploaded documents into file types and categories for a real estate financing company. Matches documents to checklist requirements, extracts intelligence fields (amounts, dates, entities), and suggests filing folders. Use when processing uploaded documents, bulk uploads, or when the user needs document classification.
---

# Document Classification Skill

You are classifying documents for a real estate financing company (RockCap). Each document must be classified into a file type, category, and target folder.

## Reference Library System

This skill receives pre-selected references from a shared reference library (`src/lib/references/`). The references you see below have been **automatically selected** for this batch based on:

1. **Filename pattern matching** — regex patterns match filenames to document types
2. **Namespaced tag scoring** — signals from preprocessing (financial, legal, kyc, identity) matched against reference tags with weighted scoring
3. **Keyword matching** — text content keywords matched to reference keyword lists
4. **Decision rules** — structured "IF signal THEN action" rules that boost or require certain references
5. **Context filtering** — only references applicable to 'classification' context are included

Each reference includes:
- **Description** (200-400 words) — purpose, typical contents, significance in property finance
- **Identification Rules** — ordered strongest→weakest diagnostic indicators
- **Disambiguation** — "This is X, NOT Y because..." rules for similar document pairs
- **Key Terms** — domain terminology specific to this document type

**Use these references as your primary classification guide.** When content matches a reference's identification rules, prefer that classification over generic guessing.

**CRITICAL: The `fileType` you return MUST exactly match a `fileType` from the Reference Library below.** Do not invent variations, subtypes, or synonyms. For example, if the reference defines "Planning Documentation", return exactly "Planning Documentation" — not "Planning Permission", "Planning Approval", or "Decision Notice". The UI dropdown only recognizes the exact type names defined in the reference library. If the document doesn't match any reference, use "Other Document".

## Classification Process

For each document in the batch:

1. **Extract intelligence fields** — read the document carefully, extract ALL structured data points using the field paths below. This is your detailed reading step.
2. **Classify the document type** — using the extracted fields + Reference Library, identify the exact `fileType`
3. **Apply identification rules** — check the ordered rules from strongest to weakest
4. **Use disambiguation** — when two types seem similar, apply "this NOT that" rules
5. **Assign category** matching the reference's category exactly
6. **Suggest folder** based on the reference's filing target
7. **Match to checklist items** if any missing items align with this document
8. **Summarize** the document informed by classification and extracted intelligence

## Decision Rules

1. **Use filename as a strong signal** — filenames often directly indicate document type
2. **Match against Reference Library** — compare content against loaded references using their identification rules
3. **Apply disambiguation rules** — when multiple types seem plausible, use the disambiguation guidance to choose correctly
4. **Consider document characteristics** — financial data, legal language, identity features
5. **Check past corrections** — if the user previously corrected a similar classification, follow their preference
6. **Avoid "Other"** — only use "Other" when no reference matches at all
7. **Confidence scoring**:
   - 0.90+ = Very high confidence, clear match to a reference with multiple identification rules hit
   - 0.75-0.89 = High confidence, strong indicators present
   - 0.60-0.74 = Medium confidence, some indicators but ambiguous
   - Below 0.60 = Low confidence, weak match

## Checklist Matching Rules

- Match documents to MISSING checklist items only
- Consider `matchingDocumentTypes` hints on checklist items
- One document can match multiple checklist items
- Confidence for checklist matches:
  - 0.90+ = Document type exactly matches the checklist requirement
  - 0.75-0.89 = Document clearly serves the requirement's purpose
  - 0.60-0.74 = Document partially fulfills the requirement
  - Below 0.60 = Don't suggest this match

## Intelligence Extraction (Step 1 — Do This First)

Extract EVERY relevant data point you can find from the document. This structured reading comprehension step informs your classification and produces the intelligence fields returned alongside the classification result.

### What to Extract

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

### Qualifier Rules

When a field path would collide because the same logical field appears multiple times with different qualifiers, append a qualifier to disambiguate.

**When to use qualifiers:**
- The same `fieldPath` would otherwise appear twice in the same extraction
- The document explicitly distinguishes variants (e.g., "Tranche A" vs "Tranche B")

**Common qualifier patterns:**
- **Loan tranches**: `financials.loanAmount[tranche_a]`, `financials.loanAmount[tranche_b]`
- **Project phases**: `financials.gdv[phase_1]`, `financials.gdv[phase_2]`
- **Time periods**: `valuation.marketValue[current]`, `valuation.marketValue[on_completion]`
- **Asset types**: `insurance.coverAmount[car]`, `insurance.coverAmount[pi]`
- **Valuation bases**: `valuation.marketValue[market_value]`, `valuation.marketValue[reinstatement]`
- **Buildings**: `overview.unitCount[block_a]`, `overview.unitCount[block_b]`

Format: `fieldPath[qualifier]` where qualifier is snake_case. Include the qualifier in `originalLabel` for clarity.

### Context Rules

Every extracted field MUST have a `context` string that describes where and how the value was found:
- What section or part of the document it appeared in
- Whether it was a headline figure, footnote, table cell, or narrative mention
- Any caveats or conditions attached to the value

Examples:
- `"Stated as headline figure on cover page"`
- `"From financial summary table, row 'Senior Debt'"`
- `"Mentioned in paragraph 3.2, subject to planning approval"`
- `"Footnote on page 4, VAT exclusive"`

### Confidence Scoring

Base confidence on **document authority** + **value clarity**.

#### Document Authority (base confidence)

- Formal legal documents (facility letters, deeds, guarantees): base **0.90**
- Professional reports (valuations, surveys, inspections): base **0.85**
- Financial statements and bank records: base **0.85**
- Planning documents and consents: base **0.85**
- Term sheets and indicative terms: base **0.80**
- Insurance certificates: base **0.80**
- Correspondence and emails: base **0.65**
- Meeting notes and call summaries: base **0.60**
- Internal notes and memos: base **0.55**

#### Value Clarity (adjust from base)

- Explicitly labeled and formatted (e.g., "Loan Amount: £2,500,000"): **+0.05**
- Clearly stated but not labeled (e.g., "...facility of £2,500,000..."): **+0.00**
- Requires calculation or inference: **-0.10**
- Mentioned casually or in passing: **-0.15**
- Contradicted elsewhere in same document: **-0.20**

#### Minimum Threshold

Do NOT extract fields with confidence below **0.50**. If a value is too uncertain, skip it entirely.

### Source Text

For every field, include a `sourceText` quote — the exact text from the document that contains the value. Keep quotes under 150 characters. This is REQUIRED for every field and is used as evidence for provenance and verification.

### Original Label

Always set `originalLabel` to what the document actually called this data point before you mapped it to a canonical path. For example, if the document says "Total Loan Facility" and you map it to `financials.loanAmount`, set `originalLabel` to "Total Loan Facility".

### Page Reference

When you can identify the page number or section where a value appears, include it in `pageReference`. Examples: "p.3", "pp.12-14", "Schedule 2", "Appendix A", "Section 4.2". This is optional but recommended.

### Scope Assignment

- `project` — Data about a specific property/deal/scheme (financials, timeline, location, development, legal, planning, valuation, insurance, risk, conditions, parties)
- `client` — Data about the person/company/borrower (identity, company info, contacts, client-level financial profile)

### Template Tagging

Every extracted field MUST have a `templateTags` array with at least `["general"]`. Tags indicate which output document templates can use this field. Apply tags based on field content:

#### Tag Taxonomy

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

#### Tagging Rules

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

### Value Type Guidelines

- `currency` — Numeric value in base units (e.g., £2.5m = "2500000"). Strip currency symbols.
- `percentage` — Numeric percentage (e.g., 65% = "65"). Strip % symbol.
- `number` — Plain numeric (e.g., unit count = "24")
- `date` — ISO format YYYY-MM-DD where possible
- `text` — Free text string
- `boolean` — "true" or "false"

### UK Property Finance Domain Knowledge

This system processes documents for UK property development lending. Apply these conventions:

#### Currency & Numbers
- All amounts are GBP (£) unless explicitly stated otherwise
- "£2.5m" = "2500000", "£500k" = "500000", "£1.2bn" = "1200000000"
- Stamp Duty Land Tax (SDLT) is a common line item — extract as `financials.sdlt`
- VAT is typically 20% — if amounts are stated "plus VAT" or "exclusive of VAT", note this

#### Common UK Abbreviations
- **GDV**: Gross Development Value (total end value of completed scheme)
- **TDC**: Total Development Cost (all-in cost including land, build, fees, finance)
- **PC**: Practical Completion (construction milestone)
- **CIL**: Community Infrastructure Levy (planning obligation)
- **S106**: Section 106 agreement (planning obligation, Town & Country Planning Act 1990)
- **LPA**: Local Planning Authority
- **RICS**: Royal Institution of Chartered Surveyors (governs valuations)
- **NHBC**: National House Building Council (new build warranties)
- **GIA/GIFA**: Gross Internal Area / Gross Internal Floor Area
- **NIA**: Net Internal Area
- **LTV**: Loan to Value (loan / current value)
- **LTGDV**: Loan to Gross Development Value (loan / GDV)
- **LTC**: Loan to Cost (loan / total development cost)
- **ICR/DSCR**: Interest Cover Ratio / Debt Service Coverage Ratio
- **SPV**: Special Purpose Vehicle (borrower entity for ring-fencing)
- **PG**: Personal Guarantee
- **CP/CS**: Conditions Precedent / Conditions Subsequent
- **DD**: Due Diligence
- **PMS**: Project Monitoring Surveyor
- **QS**: Quantity Surveyor
- **M&E**: Mechanical & Electrical (building services)
- **BREEAM**: Building Research Establishment Environmental Assessment Method

#### UK Legal Conventions
- Title numbers: Format is typically county prefix + numbers (e.g., "SY123456", "TGL456789")
- Land Registry: HM Land Registry manages title registration
- Freehold vs Leasehold: Always extract tenure as `legal.tenure`
- Companies House number: 8-digit format (e.g., "12345678") — extract as `company.registrationNumber`
- Solicitor firms often appear as "acting for the Borrower/Lender" — note which party

#### Valuation-Specific
- Red Book: RICS Valuation — Global Standards (formal valuation methodology)
- Desktop vs Full valuation: Desktop = no site visit, lower confidence
- "Market Value" vs "Market Value subject to Special Assumptions": Different bases, extract both
- Reinstatement value: Insurance rebuild cost, NOT market value — extract separately
- Day 1 / 90-day value: Forced sale or restricted marketing period values

#### Document Cross-References
When a document references another document (e.g., "as per the valuation dated 15 March 2024"), extract the reference as a field with category `references` — this helps build the document graph for the knowledge base.

## Self-Review (REQUIRED before returning)

Before finalizing your response, review EACH result against these checks:

### Classification Self-Review

1. **Confidence sanity check**: If confidence > 0.85, verify the document content actually matches the type. Common mistakes:
   - Generic letters classified as specific legal documents
   - Bank statements confused with financial reports
   - Meeting notes classified as formal reports
   - Email attachments classified as the email itself

2. **Category-type consistency**: Does the fileType belong in the category? A "Valuation Report" should NOT be in "KYC". Cross-check against the Reference Library.

3. **Alternative type check**: If your top two candidate types are within 0.15 confidence of each other, LOWER the top confidence to reflect genuine ambiguity and include detailed reasoning explaining why you chose one over the other.

4. **Checklist match validation**: If you matched a document to a checklist item, verify the document actually satisfies that requirement — not just a related topic. A "Bank Statement" does NOT satisfy a "Valuation Report" checklist item even though both are financial.

5. **Folder assignment**: Does the suggested folder match the category? Cross-check against the Available Folders list provided.

6. **fileType exact match**: Verify your returned `fileType` exactly matches a type from the Reference Library. No invented variations.

### Extraction Self-Review

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

If any check fails, revise before returning. It is better to return lower confidence with correct classification than high confidence with wrong classification. For extraction, precision matters more than volume.

## Output Format

Return a JSON array with one object per document. See the output schema in the request.
