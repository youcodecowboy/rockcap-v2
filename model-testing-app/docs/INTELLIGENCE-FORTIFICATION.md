# Intelligence Pipeline Fortification: Few-Shot Examples, Reference Integration & Gap Fixes

## Purpose

This document is the result of a thorough end-to-end audit of the intelligence pipeline after the tagging/queryability expansion. It provides:

1. **Few-shot examples** — realistic extraction-to-storage examples for 5 document types that can be embedded in the SKILL.md to dramatically improve extraction accuracy
2. **Reference library integration** — the extraction skill currently receives ZERO reference context; this must be fixed
3. **Pipeline gap fixes** — 6 specific bugs where intelligence data is dropped between stages
4. **Expected field enrichment** — existing references need richer expectedFields

---

## Part 1: Critical Pipeline Gaps Found

These are bugs/gaps that will cause intelligence to be lost or degraded. They should be fixed as part of the current build.

### Gap 1: Intelligence Extraction Gets No Reference Library Context

**Location:** `src/v4/lib/pipeline.ts` lines 289-343

**Problem:** The classification call gets 12 scored references formatted with full descriptions, terminology, and identification rules via `formatForPrompt(references, 'classification')`. The intelligence extraction call gets **nothing** — just the SKILL.md instructions and a list of expectedFields.

**Impact:** The extraction skill can't leverage reference-specific terminology to recognise domain values. For example, a RedBook Valuation reference includes terminology like "Special Assumption", "Basis of Value", "VPS" — the extraction skill doesn't see any of this and may miss or misinterpret these fields.

**Fix:** In `pipeline.ts`, after classification resolves the document type, look up the specific reference for that type and format it using `formatForPrompt([ref], 'extraction')`. Pass this as additional system context to `callAnthropicIntelligence()`.

The `formatExtraction()` function already exists in `src/lib/references/formatter.ts` (lines 105-125) and outputs:
- Description
- Expected fields (bulleted)
- Full terminology (all terms with definitions)

This is exactly what the extraction skill needs to understand domain language.

```typescript
// In pipeline.ts, Stage 5.5, for each document:
const ref = getReferenceByType(cls.classification.fileType);
const refContext = ref ? formatForPrompt([ref], 'extraction') : '';

// Pass refContext to callAnthropicIntelligence alongside skill instructions
```

### Gap 2: `fileItem` Mutation Ignores V4 Stage 5.5 Intelligence

**Location:** `convex/bulkUpload.ts` — `fileItem` mutation (lines 824-963)

**Problem:** When filing a single document, `fileItem` only processes `documentAnalysis` (the old shallow data). It completely ignores `item.extractedIntelligence` from V4 Stage 5.5. Meanwhile, `fileBatch` correctly uses pre-extracted fields.

**Impact:** Single-document filing loses all V4 intelligence — template tags, categories, confidence scores, source text, original labels.

**Fix:** In `fileItem`, check for `item.extractedIntelligence?.fields` first. If present, use those (same logic as `fileBatch`). Fall back to `documentAnalysis` only if no pre-extracted fields exist.

### Gap 3: `pageReference` Dropped Everywhere

**Location:** V4 types define `pageReference?: string` on `IntelligenceField`, and the extraction skill is instructed to provide it. But:
- `updateItemAnalysis` schema doesn't include it
- `fileBatch` field mapping doesn't pass it through
- `knowledgeItems` schema has no field for it

**Fix:** Add `pageReference: v.optional(v.string())` to `knowledgeItems` in `convex/schema.ts`. Map it through `fileBatch` and `fileItem`.

### Gap 4: `originalLabel` Not Stored in knowledgeItems

**Location:** `convex/bulkUpload.ts` — `fileBatch` lines 1446-1600

**Problem:** `originalLabel` from V4 extraction is available but never written to the `knowledgeItems` insert. The schema HAS the `originalLabel` field — it's just not populated.

**Fix:** Add `originalLabel: field.originalLabel || field.label` to knowledgeItems inserts in both `fileItem` and `fileBatch`.

### Gap 5: `templateTags` Missing from `updateItemAnalysis` Schema

**Location:** `convex/bulkUpload.ts` lines 314-343

**Problem:** The `updateItemAnalysis` mutation accepts `extractedIntelligence` but the schema doesn't validate `templateTags`. Data passes through as unvalidated JSON.

**Fix:** Add `templateTags: v.optional(v.array(v.string()))` to the extractedIntelligence field schema.

### Gap 6: Classification's `intelligenceFields` Are Redundant

**Location:** `src/v4/skills/document-classify/SKILL.md` instructs Claude to extract `intelligenceFields` during classification. Then Stage 5.5 does dedicated extraction with much richer output.

**Impact:** Token waste. Classification is doing shallow extraction that gets overwritten by Stage 5.5.

**Recommendation:** Remove `intelligenceFields` from the classification output schema. Let classification focus on classification. Let extraction focus on extraction. This saves ~500 output tokens per classification call.

---

## Part 2: Reference Library Integration for Extraction

### Current State

The reference library has an `extraction` context that's already built and ready:

```typescript
// formatter.ts — formatExtraction() output:
### RedBook Valuation (Appraisals)

A RedBook Valuation is a formal property valuation report prepared in accordance
with the RICS Valuation — Global Standards...

**Expected Fields:**
- financials.currentValue
- financials.gdv
- location.siteAddress
- financials.purchasePrice

**Terminology:**
- **RICS**: Royal Institution of Chartered Surveyors...
- **Red Book**: The RICS Valuation — Global Standards publication...
- **GDV**: Gross Development Value...
- **Market Value**: The estimated amount for which an asset should exchange...
- **Special Assumption**: An assumption that differs from actual facts...
[... all terminology entries]
```

Each reference already has `applicableContexts: ['extraction']` tagged, meaning the resolver knows which references are relevant for extraction.

### What Needs to Happen

1. After classification identifies the document type, look up the matching reference
2. Format it using `formatForPrompt([ref], 'extraction')`
3. Inject this into the intelligence extraction system prompt alongside the SKILL.md

This gives the extraction skill:
- **Domain terminology with definitions** — so it can recognise "Basis of Value" as a valuation-specific concept
- **Expected fields** — so it knows what canonical paths to target
- **Document description** — so it understands what this document type typically contains

### Enriching expectedFields on Existing References

Many references have slim `expectedFields` arrays. They should be expanded:

| Reference | Current expectedFields | Should Add |
|-----------|----------------------|------------|
| RedBook Valuation | `currentValue, gdv, siteAddress, purchasePrice` | `valuation.marketValue, valuation.specialAssumptions, valuation.comparables, valuation.valuer, valuation.valuationDate, valuation.basisOfValue, location.postcode, location.titleNumber, location.tenure, parties.valuer` |
| Appraisal | `gdv, totalDevelopmentCost, constructionCost, profitMargin, purchasePrice, unitCount` | `overview.totalSqft, planning.s106Details, planning.cil` |
| Cashflow | `gdv, totalDevelopmentCost, constructionCost` | `financials.loanAmount, financials.equityContribution, timeline.practicalCompletion, timeline.constructionStart` |
| Indicative Terms | `loanAmount, ltv, ltc, projectDuration` | `financials.purchasePrice, financials.gdv, conditions.precedent, parties.borrower, parties.lender, parties.broker, timeline.loanMaturity` |
| Credit Backed Terms | `loanAmount, ltv, ltc, projectDuration` | `conditions.precedent, conditions.subsequent, legal.guarantees, parties.solicitor, parties.monitoringSurveyor, parties.borrower, parties.lender` |
| Insurance Policy | `policyNumber, insurer, insured, broker, typeOfCover, periodFrom, periodTo, sumInsured, excess, notedInterest, endorsements, premium` | Already rich — keep as-is |
| Monitoring Report | `monitoringSurveyor, reportNumber, inspectionDate...` | Already rich (13 fields) — keep as-is |

---

## Part 3: Few-Shot Examples for the Extraction Skill

These examples should be added to the SKILL.md (or a referenced file if token budget is tight). They show Claude exactly what good extraction looks like for common document types.

### Example 1: RedBook Valuation

**Document context:** RICS-compliant formal valuation report by Savills, addressed to ABC Lending Ltd, for a 12-unit residential development site in London.

**Source text excerpts:**
- "Market Value in existing state: £2,150,000" (p.8)
- "Gross Development Value (assuming completion of the proposed scheme): £8,750,000" (p.12)
- "The property is held Freehold under Title Number NGL123456" (p.4)
- "Valuation Date: 15 January 2026" (p.2)
- "Our valuation has been prepared on the basis of Market Value as defined in VPS 4" (p.3)
- "Special Assumption: Planning permission reference 2025/1234/FUL is assumed to be implemented" (p.13)
- "Comparable 1: 14 Oak Road, sold September 2025 at £425,000 (2-bed flat)" (p.15)
- "Instructed by: ABC Lending Ltd" (p.1)
- "Prepared by: James Wilson MRICS, Savills" (p.1)
- "Property: 45 Elm Grove, London SW19 4AB" (p.2)

**Expected extraction:**

```json
[
  {
    "fieldPath": "valuation.marketValue",
    "label": "Market Value (Existing State)",
    "value": "2150000",
    "valueType": "currency",
    "confidence": 0.95,
    "sourceText": "Market Value in existing state: £2,150,000",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "valuation_summary", "lenders_note", "credit_submission"],
    "category": "valuation",
    "originalLabel": "Market Value in existing state",
    "pageReference": "p.8"
  },
  {
    "fieldPath": "financials.gdv",
    "label": "Gross Development Value",
    "value": "8750000",
    "valueType": "currency",
    "confidence": 0.95,
    "sourceText": "Gross Development Value (assuming completion of the proposed scheme): £8,750,000",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "lenders_note", "credit_submission", "deal_summary", "valuation_summary"],
    "category": "financials",
    "originalLabel": "Gross Development Value",
    "pageReference": "p.12"
  },
  {
    "fieldPath": "location.titleNumber",
    "label": "Title Number",
    "value": "NGL123456",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "The property is held Freehold under Title Number NGL123456",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "legal_summary", "due_diligence"],
    "category": "location",
    "originalLabel": "Title Number",
    "pageReference": "p.4"
  },
  {
    "fieldPath": "valuation.valuationDate",
    "label": "Valuation Date",
    "value": "2026-01-15",
    "valueType": "date",
    "confidence": 0.95,
    "sourceText": "Valuation Date: 15 January 2026",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "valuation_summary", "lenders_note"],
    "category": "valuation",
    "originalLabel": "Valuation Date",
    "pageReference": "p.2"
  },
  {
    "fieldPath": "valuation.basisOfValue",
    "label": "Basis of Value",
    "value": "Market Value as defined in VPS 4",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Our valuation has been prepared on the basis of Market Value as defined in VPS 4",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "valuation_summary"],
    "category": "valuation",
    "originalLabel": "Basis of Value",
    "pageReference": "p.3"
  },
  {
    "fieldPath": "valuation.specialAssumptions",
    "label": "Special Assumptions",
    "value": "Planning permission reference 2025/1234/FUL is assumed to be implemented",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Special Assumption: Planning permission reference 2025/1234/FUL is assumed to be implemented",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "valuation_summary", "risk_assessment", "lenders_note"],
    "category": "valuation",
    "originalLabel": "Special Assumption",
    "pageReference": "p.13"
  },
  {
    "fieldPath": "valuation.comparables",
    "label": "Comparable Evidence",
    "value": "14 Oak Road, sold Sep 2025 at £425,000 (2-bed flat)",
    "valueType": "text",
    "confidence": 0.85,
    "sourceText": "Comparable 1: 14 Oak Road, sold September 2025 at £425,000 (2-bed flat)",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "valuation_summary"],
    "category": "valuation",
    "originalLabel": "Comparable 1",
    "pageReference": "p.15"
  },
  {
    "fieldPath": "valuation.valuer",
    "label": "Valuer",
    "value": "James Wilson MRICS, Savills",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Prepared by: James Wilson MRICS, Savills",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "valuation_summary", "due_diligence"],
    "category": "valuation",
    "originalLabel": "Prepared by",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "location.siteAddress",
    "label": "Site Address",
    "value": "45 Elm Grove, London SW19 4AB",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Property: 45 Elm Grove, London SW19 4AB",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "lenders_note", "deal_summary", "due_diligence"],
    "category": "location",
    "originalLabel": "Property",
    "pageReference": "p.2"
  },
  {
    "fieldPath": "parties.lender",
    "label": "Instructing Lender",
    "value": "ABC Lending Ltd",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Instructed by: ABC Lending Ltd",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "deal_summary"],
    "category": "parties",
    "originalLabel": "Instructed by",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "planning.applicationRef",
    "label": "Planning Reference",
    "value": "2025/1234/FUL",
    "valueType": "text",
    "confidence": 0.85,
    "sourceText": "Planning permission reference 2025/1234/FUL is assumed to be implemented",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "due_diligence", "risk_assessment"],
    "category": "planning",
    "originalLabel": "Planning permission reference",
    "pageReference": "p.13"
  }
]
```

**What this example teaches the model:**
- Extract 10+ fields from a single valuation (not just 3-4)
- `originalLabel` preserves what the document says ("Market Value in existing state") vs canonical label
- `pageReference` is always populated when visible
- Confidence: 0.95 for explicitly labelled values, 0.90 for clearly stated but needing interpretation, 0.85 for inferred/contextual values
- Tags are generous — GDV appears in 5 tags because it's relevant to many templates
- A single sentence can yield multiple fields (the special assumption sentence gives both `valuation.specialAssumptions` and `planning.applicationRef`)

---

### Example 2: Credit Backed Terms

**Document context:** Formal credit-approved loan terms from XYZ Capital for a 6-unit residential conversion in Manchester. Credit committee approved 8 January 2026.

**Source text excerpts:**
- "Facility: £1,850,000 (One Million Eight Hundred and Fifty Thousand Pounds)" (p.1)
- "LTV: 70% of current market value" (p.1)
- "LTGDV: 55%" (p.1)
- "Interest Rate: SONIA + 4.50% per annum, rolled up monthly" (p.2)
- "Arrangement Fee: 2.00% of facility, deducted at drawdown" (p.2)
- "Exit Fee: 1.25% of facility" (p.2)
- "Loan Term: 18 months from first drawdown" (p.2)
- "Security: First legal charge over the Property, Debenture over the Borrower, Personal guarantee from Mr David Chen limited to £500,000" (p.3)
- "Borrower: Chen Developments Ltd (Company No. 12345678)" (p.1)
- "Property: 24 Victoria Road, Manchester M14 5PQ" (p.1)
- "Credit Committee Ref: CC-2026-0042, approved 8 January 2026" (p.1)
- "Conditions Precedent: (1) Satisfactory RICS valuation confirming LTV; (2) Satisfactory title report; (3) Building insurance noting Lender's interest; (4) Completion of KYC/AML checks" (p.4)
- "Conditions Subsequent: (1) Monitoring surveyor appointment within 14 days; (2) Contractor's all-risk insurance before works commence" (p.4)
- "Solicitors: Taylor Wessing LLP (Lender), Addleshaw Goddard LLP (Borrower)" (p.5)
- "Monitoring Surveyor: To be appointed from Lender's approved panel" (p.5)

**Expected extraction:**

```json
[
  {
    "fieldPath": "financials.loanAmount",
    "label": "Facility Amount",
    "value": "1850000",
    "valueType": "currency",
    "confidence": 0.95,
    "sourceText": "Facility: £1,850,000 (One Million Eight Hundred and Fifty Thousand Pounds)",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "lenders_note", "credit_submission", "deal_summary", "proposal"],
    "category": "financials",
    "originalLabel": "Facility",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "financials.ltv",
    "label": "Loan to Value",
    "value": "70",
    "valueType": "percentage",
    "confidence": 0.95,
    "sourceText": "LTV: 70% of current market value",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "lenders_note", "credit_submission", "deal_summary", "risk_assessment"],
    "category": "financials",
    "originalLabel": "LTV",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "financials.ltc",
    "label": "Loan to GDV",
    "value": "55",
    "valueType": "percentage",
    "confidence": 0.95,
    "sourceText": "LTGDV: 55%",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "lenders_note", "credit_submission", "risk_assessment"],
    "category": "financials",
    "originalLabel": "LTGDV",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "custom.interest_rate",
    "label": "Interest Rate",
    "value": "SONIA + 4.50% per annum, rolled up monthly",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Interest Rate: SONIA + 4.50% per annum, rolled up monthly",
    "scope": "project",
    "isCanonical": false,
    "templateTags": ["general", "proposal", "credit_submission", "lenders_note"],
    "category": "custom",
    "originalLabel": "Interest Rate",
    "pageReference": "p.2"
  },
  {
    "fieldPath": "custom.arrangement_fee",
    "label": "Arrangement Fee",
    "value": "2.00% of facility, deducted at drawdown",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Arrangement Fee: 2.00% of facility, deducted at drawdown",
    "scope": "project",
    "isCanonical": false,
    "templateTags": ["general", "proposal", "credit_submission", "lenders_note"],
    "category": "custom",
    "originalLabel": "Arrangement Fee",
    "pageReference": "p.2"
  },
  {
    "fieldPath": "custom.exit_fee",
    "label": "Exit Fee",
    "value": "1.25% of facility",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Exit Fee: 1.25% of facility",
    "scope": "project",
    "isCanonical": false,
    "templateTags": ["general", "proposal", "credit_submission", "lenders_note"],
    "category": "custom",
    "originalLabel": "Exit Fee",
    "pageReference": "p.2"
  },
  {
    "fieldPath": "timeline.projectDuration",
    "label": "Loan Term",
    "value": "18 months",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Loan Term: 18 months from first drawdown",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "deal_summary", "monitoring", "lenders_note", "proposal"],
    "category": "timeline",
    "originalLabel": "Loan Term",
    "pageReference": "p.2"
  },
  {
    "fieldPath": "legal.guarantees",
    "label": "Personal Guarantee",
    "value": "Mr David Chen, limited to £500,000",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Personal guarantee from Mr David Chen limited to £500,000",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "legal_summary", "credit_submission", "lenders_note", "risk_assessment"],
    "category": "legal",
    "originalLabel": "Personal guarantee",
    "pageReference": "p.3"
  },
  {
    "fieldPath": "company.name",
    "label": "Borrower Company",
    "value": "Chen Developments Ltd",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Borrower: Chen Developments Ltd (Company No. 12345678)",
    "scope": "client",
    "isCanonical": true,
    "templateTags": ["general", "credit_submission", "lenders_note", "deal_summary"],
    "category": "company",
    "originalLabel": "Borrower",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "company.registrationNumber",
    "label": "Company Number",
    "value": "12345678",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Borrower: Chen Developments Ltd (Company No. 12345678)",
    "scope": "client",
    "isCanonical": true,
    "templateTags": ["general", "credit_submission", "due_diligence"],
    "category": "company",
    "originalLabel": "Company No.",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "location.siteAddress",
    "label": "Property Address",
    "value": "24 Victoria Road, Manchester M14 5PQ",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Property: 24 Victoria Road, Manchester M14 5PQ",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "lenders_note", "deal_summary", "due_diligence"],
    "category": "location",
    "originalLabel": "Property",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "conditions.precedent",
    "label": "Conditions Precedent",
    "value": "RICS valuation confirming LTV; Satisfactory title report; Building insurance noting Lender's interest; KYC/AML checks",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Conditions Precedent: (1) Satisfactory RICS valuation confirming LTV; (2) Satisfactory title report; (3) Building insurance noting Lender's interest; (4) Completion of KYC/AML checks",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "legal_summary", "credit_submission", "monitoring", "due_diligence"],
    "category": "conditions",
    "originalLabel": "Conditions Precedent",
    "pageReference": "p.4"
  },
  {
    "fieldPath": "conditions.subsequent",
    "label": "Conditions Subsequent",
    "value": "Monitoring surveyor appointment within 14 days; Contractor's all-risk insurance before works commence",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Conditions Subsequent: (1) Monitoring surveyor appointment within 14 days; (2) Contractor's all-risk insurance before works commence",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "legal_summary", "credit_submission", "monitoring"],
    "category": "conditions",
    "originalLabel": "Conditions Subsequent",
    "pageReference": "p.4"
  },
  {
    "fieldPath": "parties.solicitor",
    "label": "Lender's Solicitor",
    "value": "Taylor Wessing LLP",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Solicitors: Taylor Wessing LLP (Lender), Addleshaw Goddard LLP (Borrower)",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "deal_summary", "due_diligence"],
    "category": "parties",
    "originalLabel": "Solicitors (Lender)",
    "pageReference": "p.5"
  }
]
```

**What this example teaches:**
- 14 fields from a single Credit Backed Terms document
- Mix of canonical (`financials.loanAmount`) and custom (`custom.interest_rate`) paths
- `scope: "client"` for company name/number (these belong to the client, not the project)
- Complex values kept as text (e.g., "SONIA + 4.50% per annum, rolled up monthly") rather than losing context
- A single sentence can yield multiple fields (Borrower line gives both `company.name` and `company.registrationNumber`)
- Conditions are extracted as semi-structured text, preserving all items

---

### Example 3: Planning Permission

**Document context:** Planning decision notice from London Borough of Merton granting full planning permission for demolition and redevelopment of a site.

**Source text excerpts:**
- "Application Reference: 2025/1234/FUL" (header)
- "Decision: GRANT of Full Planning Permission" (p.1)
- "Site: 45 Elm Grove, London SW19 4AB" (p.1)
- "Applicant: Chen Developments Ltd" (p.1)
- "Proposal: Demolition of existing commercial building and erection of a three-storey building comprising 12 self-contained residential flats (6 x 2-bed, 4 x 1-bed, 2 x 3-bed) with associated landscaping and car parking" (p.1)
- "Date of Decision: 12 November 2025" (p.1)
- "Condition 3: Development shall be commenced within 3 years of the date of this permission" (p.2)
- "Condition 7: A Section 106 Agreement dated 10 November 2025 requiring payment of £85,000 towards affordable housing" (p.3)
- "Condition 12: Hours of construction limited to 08:00-18:00 Monday to Friday and 09:00-13:00 Saturday" (p.4)

**Expected extraction:**

```json
[
  {
    "fieldPath": "planning.applicationRef",
    "label": "Planning Application Reference",
    "value": "2025/1234/FUL",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Application Reference: 2025/1234/FUL",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "due_diligence", "risk_assessment", "lenders_note"],
    "category": "planning",
    "originalLabel": "Application Reference",
    "pageReference": "header"
  },
  {
    "fieldPath": "planning.status",
    "label": "Planning Status",
    "value": "Full Planning Permission Granted",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Decision: GRANT of Full Planning Permission",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "due_diligence", "lenders_note", "deal_summary", "risk_assessment"],
    "category": "planning",
    "originalLabel": "Decision",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "planning.conditions",
    "label": "Planning Conditions Summary",
    "value": "12 conditions including: 3-year commencement; S106 affordable housing contribution £85,000; construction hours 08:00-18:00 Mon-Fri, 09:00-13:00 Sat",
    "valueType": "text",
    "confidence": 0.85,
    "sourceText": "Condition 3: Development shall be commenced within 3 years... Condition 7: Section 106... Condition 12: Hours of construction...",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "due_diligence", "risk_assessment", "monitoring"],
    "category": "planning",
    "originalLabel": "Planning Conditions",
    "pageReference": "p.2-4"
  },
  {
    "fieldPath": "planning.s106Details",
    "label": "Section 106 Obligation",
    "value": "£85,000 affordable housing contribution",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Condition 7: A Section 106 Agreement dated 10 November 2025 requiring payment of £85,000 towards affordable housing",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "due_diligence", "lenders_note", "credit_submission"],
    "category": "planning",
    "originalLabel": "Section 106 Agreement",
    "pageReference": "p.3"
  },
  {
    "fieldPath": "overview.unitCount",
    "label": "Total Units",
    "value": "12",
    "valueType": "number",
    "confidence": 0.90,
    "sourceText": "erection of a three-storey building comprising 12 self-contained residential flats",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "deal_summary", "lenders_note"],
    "category": "overview",
    "originalLabel": "residential flats",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "custom.unit_mix",
    "label": "Unit Mix",
    "value": "6 x 2-bed, 4 x 1-bed, 2 x 3-bed",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "12 self-contained residential flats (6 x 2-bed, 4 x 1-bed, 2 x 3-bed)",
    "scope": "project",
    "isCanonical": false,
    "templateTags": ["general", "deal_summary", "lenders_note", "credit_submission"],
    "category": "custom",
    "originalLabel": "Unit breakdown",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "location.siteAddress",
    "label": "Site Address",
    "value": "45 Elm Grove, London SW19 4AB",
    "valueType": "text",
    "confidence": 0.95,
    "sourceText": "Site: 45 Elm Grove, London SW19 4AB",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "lenders_note", "deal_summary"],
    "category": "location",
    "originalLabel": "Site",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "location.localAuthority",
    "label": "Local Authority",
    "value": "London Borough of Merton",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "London Borough of Merton",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "due_diligence"],
    "category": "location",
    "originalLabel": "Local Authority",
    "pageReference": "p.1"
  }
]
```

**What this example teaches:**
- Planning documents yield many non-obvious fields (unit mix from the proposal description)
- `planning.conditions` is extracted as a summary — don't try to create individual fields for each condition
- S106 is extracted separately with its own canonical path because it's a key financial obligation
- Confidence is 0.85 for the conditions summary (interpretation required) vs 0.95 for explicit fields
- `custom.unit_mix` is non-canonical but high value — tagged for lenders_note and credit_submission

---

### Example 4: Insurance Certificate (Short Document)

**Document context:** Insurance certificate of insurance, 1 page.

**Source text excerpts:**
- "Certificate of Insurance No. POL-2026-78901"
- "Insured: Chen Developments Ltd"
- "Insurer: Aviva plc"
- "Property: 24 Victoria Road, Manchester M14 5PQ"
- "Period: 15 January 2026 to 14 January 2027"
- "Sum Insured: £3,500,000 (Reinstatement value)"
- "Cover: Contract Works All Risks, Public Liability £10,000,000, Employer's Liability £10,000,000"
- "Lender's Interest Noted: ABC Lending Ltd"

**Expected extraction:**

```json
[
  {
    "fieldPath": "insurance.policyNumber",
    "label": "Policy Number",
    "value": "POL-2026-78901",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Certificate of Insurance No. POL-2026-78901",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "risk_assessment", "monitoring", "due_diligence"],
    "category": "insurance",
    "originalLabel": "Certificate of Insurance No.",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "insurance.insurer",
    "label": "Insurer",
    "value": "Aviva plc",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Insurer: Aviva plc",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "risk_assessment", "monitoring"],
    "category": "insurance",
    "originalLabel": "Insurer",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "insurance.coverAmount",
    "label": "Sum Insured",
    "value": "3500000",
    "valueType": "currency",
    "confidence": 0.90,
    "sourceText": "Sum Insured: £3,500,000 (Reinstatement value)",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "risk_assessment", "monitoring", "lenders_note"],
    "category": "insurance",
    "originalLabel": "Sum Insured",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "insurance.expiryDate",
    "label": "Policy Expiry",
    "value": "2027-01-14",
    "valueType": "date",
    "confidence": 0.90,
    "sourceText": "Period: 15 January 2026 to 14 January 2027",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "risk_assessment", "monitoring"],
    "category": "insurance",
    "originalLabel": "Period (end date)",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "insurance.coverType",
    "label": "Cover Type",
    "value": "Contract Works All Risks, Public Liability £10M, Employer's Liability £10M",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Cover: Contract Works All Risks, Public Liability £10,000,000, Employer's Liability £10,000,000",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "risk_assessment", "monitoring", "due_diligence"],
    "category": "insurance",
    "originalLabel": "Cover",
    "pageReference": "p.1"
  },
  {
    "fieldPath": "custom.lender_interest_noted",
    "label": "Lender's Interest Noted",
    "value": "ABC Lending Ltd",
    "valueType": "text",
    "confidence": 0.90,
    "sourceText": "Lender's Interest Noted: ABC Lending Ltd",
    "scope": "project",
    "isCanonical": false,
    "templateTags": ["general", "risk_assessment", "due_diligence"],
    "category": "custom",
    "originalLabel": "Lender's Interest Noted",
    "pageReference": "p.1"
  }
]
```

**What this example teaches:**
- Insurance certificates are authoritative professional documents → base confidence 0.90
- All fields on an insurance cert are explicitly labelled → no clarity deduction needed
- Date extraction: "Period: start to end" → extract the END date as the expiry (this is the actionable date)
- Compound cover types kept as descriptive text rather than splitting into separate fields
- "Lender's Interest Noted" is non-canonical but operationally important for CP satisfaction → tagged for due_diligence

---

### Example 5: Meeting Notes / Call Summary (Low-Authority Source)

**Document context:** Internal call notes from a broker discussion about a new deal opportunity.

**Source text excerpts:**
- "Call with James at Bloom Finance re: potential deal in Leeds"
- "Borrower is apparently worth around £5m net, has done 3 or 4 previous schemes"
- "Site is somewhere off Kirkstall Road, they're looking for about £2m facility"
- "Says GDV should be around £6m but no valuation yet"
- "Planning apparently in place, full permission"
- "Wants to move quickly, hoping to exchange in March"

**Expected extraction:**

```json
[
  {
    "fieldPath": "financials.loanAmount",
    "label": "Requested Facility",
    "value": "2000000",
    "valueType": "currency",
    "confidence": 0.60,
    "sourceText": "they're looking for about £2m facility",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "deal_summary"],
    "category": "financials",
    "originalLabel": "about £2m facility",
    "pageReference": null
  },
  {
    "fieldPath": "financials.gdv",
    "label": "Estimated GDV",
    "value": "6000000",
    "valueType": "currency",
    "confidence": 0.55,
    "sourceText": "Says GDV should be around £6m but no valuation yet",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "deal_summary"],
    "category": "financials",
    "originalLabel": "GDV should be around £6m",
    "pageReference": null
  },
  {
    "fieldPath": "financial.netWorth",
    "label": "Borrower Net Worth",
    "value": "5000000",
    "valueType": "currency",
    "confidence": 0.55,
    "sourceText": "Borrower is apparently worth around £5m net",
    "scope": "client",
    "isCanonical": true,
    "templateTags": ["general", "credit_submission"],
    "category": "financial",
    "originalLabel": "apparently worth around £5m net",
    "pageReference": null
  },
  {
    "fieldPath": "parties.broker",
    "label": "Broker",
    "value": "James at Bloom Finance",
    "valueType": "text",
    "confidence": 0.65,
    "sourceText": "Call with James at Bloom Finance re: potential deal in Leeds",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "deal_summary"],
    "category": "parties",
    "originalLabel": "Call with",
    "pageReference": null
  },
  {
    "fieldPath": "planning.status",
    "label": "Planning Status",
    "value": "Full permission reportedly in place",
    "valueType": "text",
    "confidence": 0.55,
    "sourceText": "Planning apparently in place, full permission",
    "scope": "project",
    "isCanonical": true,
    "templateTags": ["general", "due_diligence"],
    "category": "planning",
    "originalLabel": "Planning apparently in place",
    "pageReference": null
  }
]
```

**What this example teaches:**
- Meeting notes base confidence: 0.60 (per document authority framework)
- Casual mentions get -0.15 clarity deduction ("apparently", "around", "about")
- Resulting confidences: 0.55-0.65 range — just above the 0.50 extraction threshold
- `originalLabel` preserves the informal language ("apparently worth around £5m net")
- `pageReference` is null when not applicable (unstructured notes)
- Fewer template tags — low-confidence data only gets `general` + most relevant tag
- Values qualified with uncertainty in the value text ("Full permission reportedly in place")
- Only 5 fields extracted vs 10-14 from formal documents — model should NOT over-extract from informal sources

---

## Part 4: How to Embed Examples in the Skill

### Token Budget Consideration

Each few-shot example is roughly 800-1200 tokens. Adding all 5 examples would be ~5K tokens. Options:

**Option A: Inline in SKILL.md (recommended if under 6K total)**
Add an `## Examples` section at the end of SKILL.md with 2-3 of the most instructive examples (RedBook Valuation + Credit Backed Terms + Meeting Notes). This covers the three confidence tiers and canonical/custom field mix.

**Option B: Separate FEW_SHOT_EXAMPLES.md loaded as second cached block**
If SKILL.md exceeds 4K tokens with examples, create `src/v4/skills/intelligence-extract/FEW_SHOT_EXAMPLES.md` and load it as a second cached system block (same pattern as the reference library text in classification). This keeps examples cached across batch calls.

**Option C: Context-sensitive example selection**
Based on the classified document type, select the most relevant example. If the document is a valuation → show the RedBook example. If it's loan terms → show the Credit Backed Terms example. This is the most token-efficient but requires loader changes.

**Recommendation:** Start with Option A (inline, 3 examples). If token budget is tight after the tagging rules and canonical field list are added, move to Option B.

### Example Selection for Inline

1. **RedBook Valuation** — demonstrates formal document extraction, 10+ fields, mixed categories, rich tagging
2. **Credit Backed Terms** — demonstrates loan terms extraction, client vs project scope, conditions, custom fields
3. **Meeting Notes** — demonstrates low-authority extraction, confidence deductions, minimal tagging

These three cover the full confidence spectrum (0.95 → 0.55) and the full formality range.

---

## Part 5: Summary of All Required Changes

### Priority 1: Pipeline Fixes (Bugs)
1. **Feed reference context to extraction** — pass `formatForPrompt([ref], 'extraction')` to `callAnthropicIntelligence()`
2. **Fix fileItem mutation** — use `item.extractedIntelligence.fields` before falling back to `documentAnalysis`
3. **Store pageReference** — add to `knowledgeItems` schema, map through filing flow
4. **Store originalLabel** — add to knowledgeItems inserts in both `fileItem` and `fileBatch`
5. **Validate templateTags** — add to `updateItemAnalysis` schema

### Priority 2: Reference Enrichment
6. **Expand expectedFields** on existing references (see table in Part 2)
7. **Add `extraction` context tag** to any references missing it (most already have it)

### Priority 3: Skill Improvement
8. **Add few-shot examples** to SKILL.md (3 examples, ~3K tokens)
9. **Remove intelligenceFields from classification** output schema (redundant with Stage 5.5)

### Priority 4: Future Consideration
10. **Context-sensitive example selection** — select few-shot examples based on document type for maximum relevance

---

## File References

| File | What Needs Changing |
|------|-------------------|
| `src/v4/lib/pipeline.ts` | Pass reference context to intelligence extraction calls |
| `src/v4/skills/intelligence-extract/SKILL.md` | Add few-shot examples section |
| `convex/bulkUpload.ts` | Fix fileItem to use extractedIntelligence; store originalLabel and pageReference |
| `convex/schema.ts` | Add pageReference to knowledgeItems |
| `src/lib/references/references/*.ts` | Expand expectedFields arrays |
| `src/v4/skills/document-classify/SKILL.md` | Remove intelligenceFields from output schema |
| `src/v4/lib/anthropic-client.ts` | Accept reference context in callAnthropicIntelligence() |
