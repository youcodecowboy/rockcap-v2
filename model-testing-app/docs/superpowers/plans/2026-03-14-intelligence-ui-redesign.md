# Intelligence UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the intelligence taxonomy to reduce "Custom" entries from 80% to <10%, redesign the card UI for rich provenance display, and add a targeted chat query tool to reduce token usage by ~95%.

**Architecture:** Three independent workstreams executed sequentially: (1) expand canonical fields + add auto-categorization, (2) rebuild intelligence UI with rich expandable cards and attention-signal sidebar, (3) add lightweight chat context + queryIntelligence tool. All changes are additive — zero data loss.

**Tech Stack:** Next.js 16, Convex (backend/schema), React, TypeScript, Vitest, Anthropic Claude API (chat)

**Spec:** `docs/superpowers/specs/2026-03-14-intelligence-ui-redesign.md`

**HARD CONSTRAINT:** Zero data loss. Never delete, rename, or move existing canonical fields. Only add new fields, extend aliases, and add new components. Existing `extractedAttributes` are never removed — only copied/promoted.

---

## Chunk 1: Taxonomy Expansion (Workstream 1)

### Task 1: Add new canonical fields to canonicalFields.ts

**Files:**
- Modify: `src/lib/canonicalFields.ts`

**Context:** The file has two main objects: `CLIENT_CANONICAL_FIELDS` (~35 fields) and `PROJECT_CANONICAL_FIELDS` (~46 fields). Each field has `label`, `type`, `description?`, and `aliases[]`. We are ADDING new fields — never modifying existing ones except to extend their alias arrays.

**Pre-work: Deduplication check.** These existing fields overlap with proposed new categories and should NOT be re-created:
- `valuation.*` (7 existing: marketValue, gdv, basisOfValue, valuationDate, valuer, comparables, specialAssumptions)
- `planning.*` (6 existing: applicationRef, status, conditions, s106Details, cil, permittedDevelopment)
- `insurance.*` (5 existing: policyNumber, insurer, coverAmount, expiryDate, coverType)
- `legal.*` (7 existing: titleDetails, charges, covenants, leaseTerms, guarantees, conditionsPrecedent, conditionsSubsequent)
- `financials.loanAmount`, `financials.ltv`, `financials.ltc`, `financials.constructionCost` (overlap with loanTerms/construction)
- `parties.*` (7 existing: solicitor, valuer, contractor, architect, monitoringSurveyor, broker, guarantor)
- `timeline.constructionStart`, `timeline.practicalCompletion` (overlap with construction)

- [ ] **Step 1: Add KYC/Due Diligence fields to CLIENT_CANONICAL_FIELDS**

Add after the `experience.*` fields block:

```typescript
// === KYC / DUE DILIGENCE (8 fields) ===
'kyc.idVerificationStatus': {
  label: 'ID Verification Status',
  type: 'string',
  description: 'Status of identity verification checks',
  aliases: ['ID verified', 'identity check', 'ID status', 'identity verification', 'ID check', 'verification status']
},
'kyc.amlCheckDate': {
  label: 'AML Check Date',
  type: 'date',
  description: 'Date of most recent anti-money laundering check',
  aliases: ['AML date', 'anti-money laundering check', 'AML check', 'AML screening', 'money laundering check']
},
'kyc.pepScreening': {
  label: 'PEP Screening Result',
  type: 'string',
  description: 'Politically Exposed Person screening result',
  aliases: ['PEP check', 'politically exposed person', 'PEP status', 'PEP screening', 'PEP result']
},
'kyc.sourceOfFunds': {
  label: 'Source of Funds',
  type: 'text',
  description: 'Explanation of where project/equity funds originate',
  aliases: ['source of funds', 'SOF', 'funding source', 'fund origin', 'source of finance', 'equity source']
},
'kyc.sourceOfWealth': {
  label: 'Source of Wealth',
  type: 'text',
  description: 'Explanation of how client accumulated their wealth',
  aliases: ['source of wealth', 'SOW', 'wealth origin', 'wealth source', 'how wealth was acquired']
},
'kyc.riskRating': {
  label: 'Risk Rating',
  type: 'string',
  description: 'Client risk assessment level',
  aliases: ['risk level', 'risk score', 'risk assessment', 'client risk', 'risk category', 'risk profile']
},
'kyc.sanctionsCheck': {
  label: 'Sanctions Screening',
  type: 'string',
  description: 'Result of sanctions list screening',
  aliases: ['sanctions screening', 'sanctions status', 'sanctions check', 'OFAC check', 'sanctions list']
},
'kyc.enhancedDueDiligence': {
  label: 'Enhanced Due Diligence Notes',
  type: 'text',
  description: 'Notes from enhanced due diligence process',
  aliases: ['EDD', 'enhanced checks', 'EDD notes', 'enhanced due diligence', 'additional checks']
},
```

- [ ] **Step 2: Add client Legal fields to CLIENT_CANONICAL_FIELDS**

Add after the KYC block (note: project-level `legal.*` already exists — these are CLIENT-level legal fields):

```typescript
// === CLIENT LEGAL (5 fields) ===
'clientLegal.personalGuarantees': {
  label: 'Personal Guarantees',
  type: 'text',
  description: 'Details of personal guarantees given by principals',
  aliases: ['personal guarantee', 'PG', 'guarantor details', 'guarantee given', 'PG details']
},
'clientLegal.legalDisputes': {
  label: 'Legal Disputes',
  type: 'text',
  description: 'Any ongoing or historical legal disputes',
  aliases: ['disputes', 'litigation', 'legal proceedings', 'court cases', 'legal action', 'lawsuits']
},
'clientLegal.bankruptcyHistory': {
  label: 'Bankruptcy History',
  type: 'string',
  description: 'Any bankruptcy or insolvency history',
  aliases: ['bankruptcy', 'insolvency', 'IVA', 'individual voluntary arrangement', 'bankrupt']
},
'clientLegal.ccjs': {
  label: 'County Court Judgements',
  type: 'string',
  description: 'Any CCJs registered against principals',
  aliases: ['CCJ', 'county court judgement', 'court orders', 'CCJs', 'county court judgment']
},
'clientLegal.restrictions': {
  label: 'Legal Restrictions',
  type: 'text',
  description: 'Any legal restrictions or caveats affecting the client',
  aliases: ['restrictions', 'caveats', 'legal restrictions', 'legal caveats']
},
```

- [ ] **Step 3: Add Loan Terms fields to PROJECT_CANONICAL_FIELDS**

Add after the existing `conditions.*` block. Note: `financials.loanAmount`, `financials.ltv`, `financials.ltc` already exist — we add aliases to those AND create new loanTerms-specific fields:

```typescript
// === LOAN TERMS (11 new fields — loanAmount/ltv/ltc already in financials.*) ===
'loanTerms.facilityAmount': {
  label: 'Facility Amount',
  type: 'currency',
  description: 'Total facility/loan amount (may differ from net loan)',
  aliases: ['facility amount', 'facility size', 'total facility', 'gross facility', 'facility']
},
'loanTerms.netLoan': {
  label: 'Net Loan',
  type: 'currency',
  description: 'Net loan amount after fees/retentions',
  aliases: ['net loan', 'net advance', 'net facility', 'net proceeds']
},
'loanTerms.ltgdv': {
  label: 'Loan to GDV',
  type: 'percentage',
  description: 'Loan as percentage of Gross Development Value',
  aliases: ['LTGDV', 'loan to GDV', 'loan to gross development value', 'LT GDV']
},
'loanTerms.interestRate': {
  label: 'Interest Rate',
  type: 'percentage',
  description: 'Annual interest rate on the facility',
  aliases: ['interest rate', 'rate', 'coupon', 'interest', 'annual rate', 'margin']
},
'loanTerms.arrangementFee': {
  label: 'Arrangement Fee',
  type: 'currency',
  description: 'Upfront facility arrangement fee',
  aliases: ['arrangement fee', 'facility fee', 'commitment fee', 'procuration fee', 'arrangement']
},
'loanTerms.exitFee': {
  label: 'Exit Fee',
  type: 'currency',
  description: 'Fee payable on facility redemption',
  aliases: ['exit fee', 'redemption fee', 'repayment fee', 'early repayment']
},
'loanTerms.termMonths': {
  label: 'Facility Term',
  type: 'number',
  description: 'Loan term in months',
  aliases: ['term', 'loan term', 'facility term', 'duration', 'term months', 'loan duration']
},
'loanTerms.facilityType': {
  label: 'Facility Type',
  type: 'string',
  description: 'Type of lending facility',
  aliases: ['facility type', 'loan type', 'senior', 'mezzanine', 'bridging', 'development finance', 'bridge loan']
},
'loanTerms.drawdownSchedule': {
  label: 'Drawdown Schedule',
  type: 'text',
  description: 'Schedule of loan drawdowns/tranches',
  aliases: ['drawdown', 'tranches', 'drawdown schedule', 'tranche schedule', 'staged drawdown']
},
'loanTerms.covenantsSummary': {
  label: 'Covenants Summary',
  type: 'text',
  description: 'Summary of financial and operational loan covenants',
  aliases: ['covenants', 'loan covenants', 'financial covenants', 'covenant requirements']
},
'loanTerms.redemptionDate': {
  label: 'Redemption Date',
  type: 'date',
  description: 'Date facility must be redeemed/repaid',
  aliases: ['redemption date', 'maturity date', 'repayment date', 'facility expiry', 'loan maturity']
},
```

- [ ] **Step 4: Add Construction fields to PROJECT_CANONICAL_FIELDS**

Note: `financials.constructionCost`, `parties.contractor`, `timeline.constructionStart`, `timeline.practicalCompletion` already exist. Add new construction-specific fields:

```typescript
// === CONSTRUCTION (8 new fields — cost/contractor/dates already exist elsewhere) ===
'construction.contractType': {
  label: 'Contract Type',
  type: 'string',
  description: 'Type of building contract',
  aliases: ['contract type', 'JCT', 'design and build', 'D&B', 'traditional contract', 'construction contract']
},
'construction.contractSum': {
  label: 'Contract Sum',
  type: 'currency',
  description: 'Agreed construction contract value',
  aliases: ['contract sum', 'contract value', 'build cost', 'construction cost', 'agreed sum']
},
'construction.programmeDuration': {
  label: 'Programme Duration',
  type: 'number',
  description: 'Construction programme length in months',
  aliases: ['programme', 'build programme', 'construction programme', 'programme duration', 'build duration']
},
'construction.currentProgress': {
  label: 'Current Progress',
  type: 'percentage',
  description: 'Current construction completion percentage',
  aliases: ['progress', 'completion percentage', '% complete', 'current progress', 'build progress']
},
'construction.defectsLiability': {
  label: 'Defects Liability Period',
  type: 'string',
  description: 'Duration of defects liability period after practical completion',
  aliases: ['defects period', 'DLP', 'defects liability', 'defects', 'rectification period']
},
'construction.buildWarrantyProvider': {
  label: 'Build Warranty Provider',
  type: 'string',
  description: 'Provider of structural/build warranty',
  aliases: ['build warranty', 'NHBC', 'Premier Guarantee', 'structural warranty', 'warranty provider', 'building warranty']
},
'construction.retentionPercent': {
  label: 'Retention Percentage',
  type: 'percentage',
  description: 'Percentage of contract sum retained until defects rectified',
  aliases: ['retention', 'retention percentage', 'retention %', 'contract retention']
},
'construction.clerkOfWorks': {
  label: 'Clerk of Works',
  type: 'string',
  description: 'Site inspector/clerk of works',
  aliases: ['clerk of works', 'site inspector', 'site supervision', 'clerk']
},
```

- [ ] **Step 5: Add Title fields to PROJECT_CANONICAL_FIELDS**

Note: `location.titleNumber` and `legal.titleDetails`, `legal.charges`, `legal.covenants`, `legal.leaseTerms` already exist. Add new title-specific fields:

```typescript
// === TITLE (4 new fields — titleNumber/charges/covenants/leaseTerms already exist elsewhere) ===
'title.tenure': {
  label: 'Tenure',
  type: 'string',
  description: 'Freehold, leasehold, or other tenure type',
  aliases: ['tenure', 'freehold', 'leasehold', 'tenure type', 'ownership type']
},
'title.leaseTermRemaining': {
  label: 'Lease Term Remaining',
  type: 'number',
  description: 'Remaining years on leasehold (if applicable)',
  aliases: ['lease term', 'unexpired term', 'years remaining', 'remaining lease', 'lease remaining']
},
'title.groundRent': {
  label: 'Ground Rent',
  type: 'currency',
  description: 'Annual ground rent payable (leasehold)',
  aliases: ['ground rent', 'peppercorn', 'annual rent', 'lease rent']
},
'title.reportOnTitleStatus': {
  label: 'Report on Title Status',
  type: 'string',
  description: 'Status of solicitor report on title',
  aliases: ['report on title', 'ROT', 'title report', 'ROT status', 'title report status']
},
```

- [ ] **Step 6: Add Sales/Exit fields to PROJECT_CANONICAL_FIELDS**

This is a completely new category — no existing fields:

```typescript
// === SALES / EXIT (7 fields) ===
'exit.strategy': {
  label: 'Exit Strategy',
  type: 'string',
  description: 'Planned exit/repayment strategy',
  aliases: ['exit strategy', 'exit route', 'repayment strategy', 'exit plan', 'disposal strategy']
},
'exit.unitsReserved': {
  label: 'Units Reserved',
  type: 'number',
  description: 'Number of units with reservations',
  aliases: ['reserved', 'reservations', 'units reserved', 'reserved units']
},
'exit.unitsExchanged': {
  label: 'Units Exchanged',
  type: 'number',
  description: 'Number of units with exchanged contracts',
  aliases: ['exchanged', 'exchanges', 'units exchanged', 'exchanged units', 'contracts exchanged']
},
'exit.unitsCompleted': {
  label: 'Units Completed',
  type: 'number',
  description: 'Number of units with completed sales',
  aliases: ['completed sales', 'completions', 'units completed', 'sales completed']
},
'exit.averageSalesPrice': {
  label: 'Average Sales Price',
  type: 'currency',
  description: 'Average achieved or projected sales price per unit',
  aliases: ['average price', 'ASP', 'avg sales price', 'average selling price', 'mean price']
},
'exit.totalSalesRevenue': {
  label: 'Total Sales Revenue',
  type: 'currency',
  description: 'Total achieved or projected sales revenue',
  aliases: ['total revenue', 'sales revenue', 'total sales', 'gross sales', 'revenue']
},
'exit.salesAgent': {
  label: 'Sales Agent',
  type: 'string',
  description: 'Estate agent or marketing agent handling sales',
  aliases: ['sales agent', 'estate agent', 'marketing agent', 'selling agent', 'agent']
},
```

- [ ] **Step 7: Add new fields to existing Valuation, Planning, and Insurance categories**

These are genuinely new fields that extend existing categories (not duplicates of existing fields):

```typescript
// Add to existing valuation.* block in PROJECT_CANONICAL_FIELDS:
'valuation.dayOneValue': {
  label: 'Day One Value',
  type: 'currency',
  description: 'Value at day one / acquisition',
  aliases: ['day one value', 'day 1 value', 'initial value', 'acquisition value']
},
'valuation.reinspectionDate': {
  label: 'Reinspection Date',
  type: 'date',
  description: 'Date of next scheduled valuation reinspection',
  aliases: ['reinspection', 'next inspection', 're-inspection date', 'reinspection date']
},

// Add to existing planning.* block in PROJECT_CANONICAL_FIELDS:
'planning.expiryDate': {
  label: 'Planning Expiry Date',
  type: 'date',
  description: 'Date planning permission expires',
  aliases: ['planning expiry', 'permission expiry', 'consent expiry', 'planning expiry date']
},
'planning.useClass': {
  label: 'Use Class',
  type: 'string',
  description: 'Planning use class designation',
  aliases: ['use class', 'planning use', 'C3', 'B1', 'E class', 'use class order']
},
'planning.conservationArea': {
  label: 'Conservation Area',
  type: 'string',
  description: 'Whether site is in conservation area or has heritage designation',
  aliases: ['conservation area', 'listed building', 'heritage', 'conservation', 'heritage designation']
},

// Add to existing insurance.* block in PROJECT_CANONICAL_FIELDS:
'insurance.buildingWorksPolicy': {
  label: 'Building Works Policy',
  type: 'string',
  description: 'Building works insurance policy details',
  aliases: ['building works', 'building works policy', 'construction insurance']
},
'insurance.professionalIndemnity': {
  label: 'Professional Indemnity',
  type: 'string',
  description: 'Professional indemnity insurance details',
  aliases: ['PI insurance', 'professional indemnity', 'PI', 'PI cover']
},
'insurance.contractorsAllRisks': {
  label: 'Contractors All Risks',
  type: 'string',
  description: 'Contractors all risks insurance policy',
  aliases: ['contractors all risks', 'CAR', 'all risks', 'CAR insurance']
},
'insurance.publicLiability': {
  label: 'Public Liability',
  type: 'string',
  description: 'Public liability insurance details',
  aliases: ['public liability', 'PL insurance', 'PL', 'public liability cover']
},
'insurance.structuralWarranty': {
  label: 'Structural Warranty',
  type: 'string',
  description: 'Structural/latent defects warranty details',
  aliases: ['structural warranty', 'latent defects', 'building warranty', 'structural defects insurance']
},
```

- [ ] **Step 8: Extend aliases on existing fields that overlap with new categories**

Add more aliases to existing fields so they catch more extracted data. Modify these existing entries in `PROJECT_CANONICAL_FIELDS` by extending their `aliases` arrays:

```typescript
// Extend financials.loanAmount aliases:
// ADD to existing aliases: 'facility amount', 'total facility', 'gross loan', 'facility'

// Extend financials.ltv aliases:
// ADD to existing aliases: 'loan to value ratio', 'LTV ratio', 'LTV %'

// Extend financials.constructionCost aliases:
// ADD to existing aliases: 'build cost', 'construction budget', 'works cost'

// Extend planning.applicationRef aliases:
// ADD to existing aliases: 'planning reference', 'planning ref', 'planning number'

// Extend planning.conditions aliases:
// ADD to existing aliases: 'planning conditions', 'pre-commencement conditions', 'discharge of conditions'

// Extend valuation.marketValue aliases:
// ADD to existing aliases: 'CMV', 'as-is value', 'current market value', 'open market value'

// Extend valuation.gdv aliases:
// ADD to existing aliases: 'gross development value', 'completed value', 'end value'

// Extend valuation.valuationDate aliases:
// ADD to existing aliases: 'date of valuation', 'inspection date', 'survey date'

// Extend insurance.expiryDate aliases:
// ADD to existing aliases: 'policy expiry', 'renewal date', 'insurance expiry', 'insurance renewal'

// Extend insurance.coverType aliases:
// ADD to existing aliases: 'building works', 'contractors all risks', 'CAR', 'professional indemnity', 'PI', 'public liability'
```

- [ ] **Step 9: Run tests to verify no regressions**

Run: `npx vitest run src/__tests__/intelligence.test.ts src/__tests__/intelligence-extract.test.ts -v`
Expected: All existing tests PASS (we only added fields, never changed existing ones)

- [ ] **Step 10: Commit**

```bash
git add src/lib/canonicalFields.ts
git commit -m "feat: expand canonical taxonomy with 53 new fields across 8+ categories

Add KYC/Due Diligence (8), Client Legal (5), Loan Terms (11),
Construction (8), Title (4), Sales/Exit (7) new fields. Add 10
fields to existing Valuation (2), Planning (3), Insurance (5)
categories. Extend aliases on existing financial, planning, valuation,
and insurance fields. No existing fields modified or removed."
```

### Task 2: Add new UI field definitions to fieldDefinitions.ts

**Files:**
- Modify: `src/components/intelligence/fieldDefinitions.ts`
- Modify: `src/components/intelligence/types.ts` (if category type needs extending)

**Context:** This file defines `FieldDefinition[]` arrays used by the UI to know what fields to display, their priorities, and expected sources. Each new canonical field needs a corresponding UI definition.

- [ ] **Step 1: Add KYC field definitions**

```typescript
export const clientKycFields: FieldDefinition[] = [
  { key: 'kyc.idVerificationStatus', label: 'ID Verification Status', priority: 'critical' },
  { key: 'kyc.amlCheckDate', label: 'AML Check Date', priority: 'critical' },
  { key: 'kyc.pepScreening', label: 'PEP Screening', priority: 'important' },
  { key: 'kyc.sourceOfFunds', label: 'Source of Funds', multiline: true, priority: 'critical', expectedSource: 'Source of Funds Declaration' },
  { key: 'kyc.sourceOfWealth', label: 'Source of Wealth', multiline: true, priority: 'important' },
  { key: 'kyc.riskRating', label: 'Risk Rating', priority: 'important' },
  { key: 'kyc.sanctionsCheck', label: 'Sanctions Screening', priority: 'important' },
  { key: 'kyc.enhancedDueDiligence', label: 'Enhanced Due Diligence Notes', multiline: true, priority: 'optional' },
];
```

- [ ] **Step 2: Add Client Legal field definitions**

```typescript
export const clientLegalFields: FieldDefinition[] = [
  { key: 'clientLegal.personalGuarantees', label: 'Personal Guarantees', multiline: true, priority: 'critical' },
  { key: 'clientLegal.legalDisputes', label: 'Legal Disputes', multiline: true, priority: 'important' },
  { key: 'clientLegal.bankruptcyHistory', label: 'Bankruptcy History', priority: 'critical' },
  { key: 'clientLegal.ccjs', label: 'County Court Judgements', priority: 'critical' },
  { key: 'clientLegal.restrictions', label: 'Legal Restrictions', multiline: true, priority: 'optional' },
];
```

- [ ] **Step 3: Add project-level field definitions for Loan Terms, Construction, Title, Sales/Exit**

```typescript
export const projectLoanTermsFields: FieldDefinition[] = [
  { key: 'loanTerms.facilityAmount', label: 'Facility Amount (£)', type: 'number', priority: 'critical', expectedSource: 'Facility Letter' },
  { key: 'loanTerms.netLoan', label: 'Net Loan (£)', type: 'number', priority: 'important' },
  { key: 'loanTerms.ltgdv', label: 'Loan to GDV (%)', type: 'number', priority: 'critical' },
  { key: 'loanTerms.interestRate', label: 'Interest Rate (%)', type: 'number', priority: 'critical', expectedSource: 'Facility Letter' },
  { key: 'loanTerms.arrangementFee', label: 'Arrangement Fee (£)', type: 'number', priority: 'important' },
  { key: 'loanTerms.exitFee', label: 'Exit Fee (£)', type: 'number', priority: 'important' },
  { key: 'loanTerms.termMonths', label: 'Facility Term (months)', type: 'number', priority: 'critical', expectedSource: 'Facility Letter' },
  { key: 'loanTerms.facilityType', label: 'Facility Type', priority: 'critical' },
  { key: 'loanTerms.drawdownSchedule', label: 'Drawdown Schedule', multiline: true, priority: 'important' },
  { key: 'loanTerms.covenantsSummary', label: 'Covenants Summary', multiline: true, priority: 'important' },
  { key: 'loanTerms.redemptionDate', label: 'Redemption Date', priority: 'important' },
];

export const projectConstructionFields: FieldDefinition[] = [
  { key: 'construction.contractType', label: 'Contract Type', priority: 'important' },
  { key: 'construction.contractSum', label: 'Contract Sum (£)', type: 'number', priority: 'critical', expectedSource: 'Build Contract' },
  { key: 'construction.programmeDuration', label: 'Programme Duration (months)', type: 'number', priority: 'important', expectedSource: 'Build Programme' },
  { key: 'construction.currentProgress', label: 'Current Progress (%)', type: 'number', priority: 'important' },
  { key: 'construction.defectsLiability', label: 'Defects Liability Period', priority: 'optional' },
  { key: 'construction.buildWarrantyProvider', label: 'Build Warranty Provider', priority: 'important' },
  { key: 'construction.retentionPercent', label: 'Retention (%)', type: 'number', priority: 'optional' },
  { key: 'construction.clerkOfWorks', label: 'Clerk of Works', priority: 'optional' },
];

export const projectTitleFields: FieldDefinition[] = [
  { key: 'title.tenure', label: 'Tenure', priority: 'critical', expectedSource: 'Report on Title' },
  { key: 'title.leaseTermRemaining', label: 'Lease Term Remaining (years)', type: 'number', priority: 'important' },
  { key: 'title.groundRent', label: 'Ground Rent (£)', type: 'number', priority: 'optional' },
  { key: 'title.reportOnTitleStatus', label: 'Report on Title Status', priority: 'important' },
];

export const projectExitFields: FieldDefinition[] = [
  { key: 'exit.strategy', label: 'Exit Strategy', priority: 'critical' },
  { key: 'exit.unitsReserved', label: 'Units Reserved', type: 'number', priority: 'important' },
  { key: 'exit.unitsExchanged', label: 'Units Exchanged', type: 'number', priority: 'important' },
  { key: 'exit.unitsCompleted', label: 'Units Completed', type: 'number', priority: 'important' },
  { key: 'exit.averageSalesPrice', label: 'Average Sales Price (£)', type: 'number', priority: 'important' },
  { key: 'exit.totalSalesRevenue', label: 'Total Sales Revenue (£)', type: 'number', priority: 'important' },
  { key: 'exit.salesAgent', label: 'Sales Agent', priority: 'optional' },
];
```

- [ ] **Step 4: Extend existing field definition arrays for new valuation/planning/insurance fields**

The new canonical fields added in Task 1 Step 7 need corresponding UI field definitions. Add to the existing arrays:

```typescript
// Add to existing projectValuationFields (or whichever array holds valuation.* fields):
// If no such array exists, check which array includes valuation.marketValue and add there.
  { key: 'valuation.dayOneValue', label: 'Day One Value (£)', type: 'number', priority: 'important' },
  { key: 'valuation.reinspectionDate', label: 'Reinspection Date', priority: 'important' },

// Add to existing projectPlanningFields (or the array with planning.* fields):
  { key: 'planning.expiryDate', label: 'Planning Expiry Date', priority: 'important' },
  { key: 'planning.useClass', label: 'Use Class', priority: 'important' },
  { key: 'planning.conservationArea', label: 'Conservation Area', priority: 'optional' },

// Add to existing projectInsuranceFields (or the array with insurance.* fields):
// If no separate insurance array exists, these may need a new array.
  { key: 'insurance.buildingWorksPolicy', label: 'Building Works Policy', priority: 'important' },
  { key: 'insurance.professionalIndemnity', label: 'Professional Indemnity', priority: 'optional' },
  { key: 'insurance.contractorsAllRisks', label: 'Contractors All Risks', priority: 'important' },
  { key: 'insurance.publicLiability', label: 'Public Liability', priority: 'optional' },
  { key: 'insurance.structuralWarranty', label: 'Structural Warranty', priority: 'important' },
```

- [ ] **Step 5: Update `getAllClientFields` and `getAllProjectFields` to include new categories**

```typescript
export const getAllClientFields = (isLender: boolean): FieldDefinition[] => [
  ...clientBasicFields,
  ...clientFinancialFields,
  ...(isLender ? lenderProfileFields : borrowerProfileFields),
  ...clientKycFields,
  ...clientLegalFields,
];

export const getAllProjectFields = (): FieldDefinition[] => [
  ...projectOverviewFields,
  ...projectLocationFields,
  ...projectFinancialsFields,
  ...projectTimelineFields,
  ...projectDevelopmentFields,
  ...projectLoanTermsFields,
  ...projectConstructionFields,
  ...projectTitleFields,
  ...projectExitFields,
];
```

- [ ] **Step 6: Commit**

```bash
git add src/components/intelligence/fieldDefinitions.ts src/components/intelligence/types.ts
git commit -m "feat: add UI field definitions for new intelligence categories

KYC (8), Client Legal (5), Loan Terms (11), Construction (6),
Title (4), Sales/Exit (7) field definitions with priorities and
expected sources."
```

### Task 3: Create auto-categorization fallback

**Files:**
- Create: `src/lib/intelligenceCategorizer.ts`
- Test: `src/__tests__/intelligenceCategorizer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/intelligenceCategorizer.test.ts
import { describe, it, expect } from 'vitest';
import { categorizeAttribute } from '@/lib/intelligenceCategorizer';

describe('categorizeAttribute', () => {
  it('categorizes loan-related labels as Loan Terms', () => {
    expect(categorizeAttribute('Interest Rate')).toBe('Loan Terms');
    expect(categorizeAttribute('LTV Ratio')).toBe('Loan Terms');
    expect(categorizeAttribute('Facility Amount')).toBe('Loan Terms');
    expect(categorizeAttribute('Loan Covenant Details')).toBe('Loan Terms');
  });

  it('categorizes planning-related labels as Planning', () => {
    expect(categorizeAttribute('Planning Reference Number')).toBe('Planning');
    expect(categorizeAttribute('S106 Agreement')).toBe('Planning');
    expect(categorizeAttribute('Permitted Development Rights')).toBe('Planning');
  });

  it('categorizes valuation-related labels as Valuation', () => {
    expect(categorizeAttribute('GDV Estimate')).toBe('Valuation');
    expect(categorizeAttribute('Market Value Assessment')).toBe('Valuation');
    expect(categorizeAttribute('Comparable Sales Evidence')).toBe('Valuation');
  });

  it('categorizes construction-related labels as Construction', () => {
    expect(categorizeAttribute('Build Programme')).toBe('Construction');
    expect(categorizeAttribute('Contractor Name')).toBe('Construction');
    expect(categorizeAttribute('Retention Percentage')).toBe('Construction');
  });

  it('categorizes title-related labels as Legal / Title', () => {
    expect(categorizeAttribute('Title Number')).toBe('Legal / Title');
    expect(categorizeAttribute('Freehold/Leasehold')).toBe('Legal / Title');
    expect(categorizeAttribute('Solicitor Firm Name')).toBe('Legal / Title');
  });

  it('categorizes insurance-related labels as Insurance', () => {
    expect(categorizeAttribute('Building Works Policy')).toBe('Insurance');
    expect(categorizeAttribute('Professional Indemnity Cover')).toBe('Insurance');
  });

  it('categorizes exit-related labels as Sales / Exit', () => {
    expect(categorizeAttribute('Exit Strategy')).toBe('Sales / Exit');
    expect(categorizeAttribute('Units Reserved')).toBe('Sales / Exit');
  });

  it('categorizes KYC-related labels as KYC / Due Diligence', () => {
    expect(categorizeAttribute('AML Check Status')).toBe('KYC / Due Diligence');
    expect(categorizeAttribute('PEP Screening Result')).toBe('KYC / Due Diligence');
    expect(categorizeAttribute('Sanctions Check')).toBe('KYC / Due Diligence');
  });

  it('categorizes contact-related labels as Contact Info', () => {
    expect(categorizeAttribute('Email Address')).toBe('Contact Info');
    expect(categorizeAttribute('Phone Number')).toBe('Contact Info');
  });

  it('categorizes company-related labels as Company', () => {
    expect(categorizeAttribute('Company Registration Number')).toBe('Company');
    expect(categorizeAttribute('Director Names')).toBe('Company');
  });

  it('categorizes financial-related labels as Financial', () => {
    expect(categorizeAttribute('Net Worth Statement')).toBe('Financial');
    expect(categorizeAttribute('Annual Income')).toBe('Financial');
  });

  it('falls back to Other for unrecognized labels', () => {
    expect(categorizeAttribute('Random Miscellaneous Data')).toBe('Other');
    expect(categorizeAttribute('Some Unknown Field')).toBe('Other');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/intelligenceCategorizer.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement categorizeAttribute**

```typescript
// src/lib/intelligenceCategorizer.ts

/**
 * Auto-categorizes an extracted attribute label into a display category.
 * Used as a fallback when an attribute doesn't match any canonical field.
 * Returns one of the standard category names for UI display.
 */

const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/\b(loan|interest\s*rate|ltv|ltgdv|facility|covenant|drawdown|bridging|mezzanine|senior\s*debt)\b/i, 'Loan Terms'],
  [/\b(planning|permitted\s*dev|s106|cil|use\s*class|planning\s*ref|planning\s*condition)\b/i, 'Planning'],
  [/\b(valuation|gdv|comparable|market\s*value|day\s*one\s*value|apprai)/i, 'Valuation'],
  [/\b(contract\s*(sum|type|value)|build\s*(cost|programme)|construct|retention|defects|warranty\s*provider|nhbc|premier\s*guarantee)\b/i, 'Construction'],
  [/\b(title\s*(number|deed)|tenure|freehold|leasehold|solicitor|conveyancer|report\s*on\s*title|ground\s*rent)\b/i, 'Legal / Title'],
  [/\b(insurance|indemnity|warranty|liability|policy\s*(number|expiry)|all\s*risks|CAR)\b/i, 'Insurance'],
  [/\b(exit\s*strat|sales?\s*(agent|revenue|price)|reserved|exchanged|completion|disposal)\b/i, 'Sales / Exit'],
  [/\b(kyc|aml|pep|sanction|due\s*diligence|identity\s*verif|source\s*of\s*(funds|wealth)|money\s*launder)\b/i, 'KYC / Due Diligence'],
  [/\b(guarantee|dispute|bankrupt|ccj|litigation|insolvency|legal\s*action)\b/i, 'Legal'],
  [/\b(contact|email|phone|mobile|address|name|postcode)\b/i, 'Contact Info'],
  [/\b(company|director|shareholder|registration|vat|incorporat|trading\s*name|ubo|beneficial\s*owner)\b/i, 'Company'],
  [/\b(income|net\s*worth|assets?|debt|credit|bank|portfolio\s*value|liquid)\b/i, 'Financial'],
  [/\b(experience|track\s*record|projects?\s*completed|specializ|expertise)\b/i, 'Experience'],
];

export function categorizeAttribute(label: string): string {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(label)) {
      return category;
    }
  }
  return 'Other';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/intelligenceCategorizer.test.ts -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/intelligenceCategorizer.ts src/__tests__/intelligenceCategorizer.test.ts
git commit -m "feat: add auto-categorization fallback for extracted attributes

Keyword-pattern matching categorizes extracted attributes that
don't match canonical fields into display categories. Falls back
to 'Other' for truly unrecognized labels."
```

### Task 4: Build migration audit function (dry-run only)

**Files:**
- Modify: `convex/intelligence.ts`

**Context:** This adds a query (not mutation) that scans existing `extractedAttributes` and reports which ones would now match canonical fields. It does NOT modify any data — it's a dry-run audit for safety.

- [ ] **Step 1: Write the migration audit query**

Add to `convex/intelligence.ts`:

```typescript
// Migration audit — reports which extractedAttributes would match new canonical fields
// This is a READ-ONLY query for safety. Run this to verify before any actual migration.
export const auditAttributeMigration = query({
  args: {
    scope: v.union(v.literal('client'), v.literal('project')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    if (args.scope === 'client') {
      const records = await ctx.db.query('clientIntelligence').take(limit);
      const results = [];

      for (const record of records) {
        const attrs = record.extractedAttributes ?? [];
        const promotable = [];

        for (const attr of attrs) {
          // Try to match against canonical fields using normalizeFieldLabel
          // (imported from intelligenceHelpers or canonicalFields)
          const label = typeof attr === 'object' && attr !== null ? (attr as any).label || (attr as any).key || '' : '';
          if (label) {
            promotable.push({ label, value: (attr as any).value });
          }
        }

        if (promotable.length > 0) {
          results.push({
            clientId: record.clientId,
            totalAttributes: attrs.length,
            promotableCount: promotable.length,
            promotable,
          });
        }
      }

      return {
        scope: 'client',
        recordsScanned: records.length,
        totalPromotable: results.reduce((sum, r) => sum + r.promotableCount, 0),
        details: results,
      };
    }

    // Similar logic for project scope
    const records = await ctx.db.query('projectIntelligence').take(limit);
    const results = [];

    for (const record of records) {
      const attrs = record.extractedAttributes ?? [];
      const promotable = [];

      for (const attr of attrs) {
        const label = typeof attr === 'object' && attr !== null ? (attr as any).label || (attr as any).key || '' : '';
        if (label) {
          promotable.push({ label, value: (attr as any).value });
        }
      }

      if (promotable.length > 0) {
        results.push({
          projectId: record.projectId,
          totalAttributes: attrs.length,
          promotableCount: promotable.length,
          promotable,
        });
      }
    }

    return {
      scope: 'project',
      recordsScanned: records.length,
      totalPromotable: results.reduce((sum, r) => sum + r.promotableCount, 0),
      details: results,
    };
  },
});
```

- [ ] **Step 2: Run Convex codegen**

Run: `npx convex codegen`
Expected: Types regenerated successfully

- [ ] **Step 3: Commit**

```bash
git add convex/intelligence.ts
git commit -m "feat: add migration audit query for extracted attributes

Read-only query that reports which extractedAttributes would match
new canonical fields. Does not modify any data — for verification
before any migration."
```

### Task 5: Build and verify

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run -v`
Expected: All tests PASS

- [ ] **Step 2: Run Next.js build**

Run: `npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit and push**

```bash
git push origin main
```

---

## Chunk 2: Intelligence Card UI Redesign (Workstream 2)

### Task 6: Create intelligenceUtils.ts shared helpers

**Files:**
- Create: `src/components/intelligence/intelligenceUtils.ts`
- Test: `src/__tests__/intelligenceUtils.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/intelligenceUtils.test.ts
import { describe, it, expect } from 'vitest';
import {
  getConfidenceColor,
  getConfidenceLabel,
  getRelativeTimeString,
  detectConflicts,
  getCategoryIcon,
  getCategoryForField,
} from '@/components/intelligence/intelligenceUtils';

describe('getConfidenceColor', () => {
  it('returns green for high confidence (>= 0.85)', () => {
    expect(getConfidenceColor(0.95)).toBe('green');
    expect(getConfidenceColor(0.85)).toBe('green');
  });
  it('returns amber for medium confidence (0.60 - 0.84)', () => {
    expect(getConfidenceColor(0.72)).toBe('amber');
    expect(getConfidenceColor(0.60)).toBe('amber');
  });
  it('returns red for low confidence (< 0.60)', () => {
    expect(getConfidenceColor(0.45)).toBe('red');
    expect(getConfidenceColor(0)).toBe('red');
  });
});

describe('getConfidenceLabel', () => {
  it('formats confidence as percentage string', () => {
    expect(getConfidenceLabel(0.95)).toBe('95%');
    expect(getConfidenceLabel(0.721)).toBe('72%');
    expect(getConfidenceLabel(1)).toBe('100%');
  });
});

describe('getCategoryIcon', () => {
  it('returns correct icons for known categories', () => {
    expect(getCategoryIcon('Contact Info')).toBeTruthy();
    expect(getCategoryIcon('Loan Terms')).toBeTruthy();
    expect(getCategoryIcon('Other')).toBeTruthy();
  });
});

describe('getCategoryForField', () => {
  it('maps canonical field keys to categories', () => {
    expect(getCategoryForField('kyc.idVerificationStatus')).toBe('KYC / Due Diligence');
    expect(getCategoryForField('loanTerms.interestRate')).toBe('Loan Terms');
    expect(getCategoryForField('exit.strategy')).toBe('Sales / Exit');
    expect(getCategoryForField('contact.email')).toBe('Contact Info');
  });
});

describe('detectConflicts', () => {
  it('returns empty array when no conflicts', () => {
    const trail = [
      { fieldPath: 'contact.email', value: 'a@b.com', confidence: 0.95 },
    ];
    expect(detectConflicts(trail, 'contact.email')).toEqual([]);
  });
  it('returns conflicting entries when values differ', () => {
    const trail = [
      { fieldPath: 'contact.email', value: 'a@b.com', confidence: 0.95 },
      { fieldPath: 'contact.email', value: 'x@y.com', confidence: 0.80 },
    ];
    const conflicts = detectConflicts(trail, 'contact.email');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].value).toBe('x@y.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/intelligenceUtils.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement intelligenceUtils.ts**

```typescript
// src/components/intelligence/intelligenceUtils.ts

export type ConfidenceLevel = 'green' | 'amber' | 'red';

export function getConfidenceColor(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return 'green';
  if (confidence >= 0.60) return 'amber';
  return 'red';
}

export function getConfidenceLabel(confidence: number): string {
  return `${Math.floor(confidence * 100)}%`;
}

export function getRelativeTimeString(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

const CATEGORY_ICONS: Record<string, string> = {
  'Contact Info': '👤',
  'Company': '🏢',
  'Financial': '💰',
  'Experience': '📋',
  'KYC / Due Diligence': '🔍',
  'Legal': '⚖️',
  'Loan Terms': '📑',
  'Valuation': '🏠',
  'Planning': '📐',
  'Construction': '🔨',
  'Legal / Title': '📜',
  'Insurance': '🛡️',
  'Sales / Exit': '📈',
  'Other': '📦',
};

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? '📦';
}

const FIELD_PREFIX_TO_CATEGORY: Record<string, string> = {
  'contact': 'Contact Info',
  'company': 'Company',
  'financial': 'Financial',
  'financials': 'Financial',
  'experience': 'Experience',
  'kyc': 'KYC / Due Diligence',
  'clientLegal': 'Legal',
  'legal': 'Legal / Title',
  'loanTerms': 'Loan Terms',
  'valuation': 'Valuation',
  'planning': 'Planning',
  'construction': 'Construction',
  'title': 'Legal / Title',
  'insurance': 'Insurance',
  'exit': 'Sales / Exit',
  'overview': 'Overview',
  'location': 'Location',
  'timeline': 'Timeline',
  'development': 'Development',
  'parties': 'Key Parties',
  'conditions': 'Loan Terms',
  'risk': 'Risk',
};

export function getCategoryForField(fieldKey: string): string {
  const prefix = fieldKey.split('.')[0];
  return FIELD_PREFIX_TO_CATEGORY[prefix] ?? 'Other';
}

interface EvidenceEntry {
  fieldPath: string;
  value: unknown;
  confidence: number;
  [key: string]: unknown;
}

export function detectConflicts(
  evidenceTrail: EvidenceEntry[],
  fieldPath: string
): EvidenceEntry[] {
  const entries = evidenceTrail.filter(e => e.fieldPath === fieldPath);
  if (entries.length <= 1) return [];

  // Sort by confidence desc, the first is the "current" value
  const sorted = [...entries].sort((a, b) => b.confidence - a.confidence);
  const current = sorted[0];

  // Return entries with different values (conflicts)
  return sorted.slice(1).filter(e =>
    String(e.value).toLowerCase() !== String(current.value).toLowerCase()
  );
}

// Confidence color CSS classes for card left border
export const CONFIDENCE_BORDER_COLORS = {
  green: 'border-l-green-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
} as const;

export const CONFIDENCE_BADGE_STYLES = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/intelligenceUtils.test.ts -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/intelligence/intelligenceUtils.ts src/__tests__/intelligenceUtils.test.ts
git commit -m "feat: add intelligence display utility functions

Confidence colors/labels, relative time formatting, category icons,
field-to-category mapping, and conflict detection helpers."
```

### Task 7: Build IntelligenceCard + IntelligenceCardExpanded components

**Files:**
- Create: `src/components/intelligence/IntelligenceCard.tsx`
- Create: `src/components/intelligence/IntelligenceCardExpanded.tsx`

**Context:** These replace the existing `KnownDataCard.tsx`. The card shows collapsed state by default and expands on click to reveal source document, evidence quote, conflicts, and prior values. The expanded panel fetches document summary on-demand via `sourceDocumentId`.

- [ ] **Step 1: Build IntelligenceCard.tsx**

The collapsed card component. Props:
- `fieldLabel: string` — display label
- `fieldValue: string | number` — the current value
- `fieldKey: string` — canonical path (e.g., 'contact.email')
- `confidence: number` — 0-1 confidence score
- `sourceDocumentName?: string` — source doc name
- `sourceDocumentId?: string` — for linking to document viewer
- `extractedAt?: string` — ISO timestamp
- `isCore: boolean` — whether this is a canonical field
- `conflictCount: number` — number of conflicting values
- `priorValueCount: number` — number of superseded values
- `isRecentlyUpdated: boolean` — updated in last 24h
- `evidenceTrail: EvidenceEntry[]` — full evidence for this field
- `clientId: string` — for document links
- `projectId?: string` — for document links

The component renders the collapsed rich card with:
- Color-coded left border (confidence)
- Label with Core badge
- Value (formatted)
- Confidence percentage badge
- Clickable source doc link
- Relative timestamp
- Conflict/history indicators
- Green tint if recently updated
- Expand/collapse toggle

On click, renders `<IntelligenceCardExpanded>` below.

Implementation: Build this as a standard React component using the project's existing UI patterns (check existing components for Tailwind/shadcn usage). Use the helpers from `intelligenceUtils.ts`.

- [ ] **Step 2: Build IntelligenceCardExpanded.tsx**

The expanded detail panel. Props:
- `evidenceTrail: EvidenceEntry[]` — all evidence entries for this field
- `sourceDocumentId?: string` — to fetch document summary
- `clientId: string` — for building document viewer URL
- `projectId?: string` — for building document viewer URL

The component renders:
- **Source Document panel** — fetches `documentAnalysis.executiveSummary` on mount via the `sourceDocumentId`. Shows doc name (linked), category tags, summary text, page number, extraction date, method.
- **Evidence panel** — quoted `sourceText` in a blockquote with indigo left border
- **Conflict panel** — amber background, alternative values with confidence and sources
- **Prior Values panel** — strikethrough old values with their sources, dimmed

Uses Convex `useQuery` to fetch document details on-demand when expanded.

- [ ] **Step 3: Verify components render**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/intelligence/IntelligenceCard.tsx src/components/intelligence/IntelligenceCardExpanded.tsx
git commit -m "feat: add rich expandable intelligence card components

Collapsed state shows confidence, source doc link, recency, and
conflict indicators. Expanded state shows source document summary,
quoted evidence, conflicts, and prior values."
```

### Task 8: Build IntelligenceSidebar component

**Files:**
- Create: `src/components/intelligence/IntelligenceSidebar.tsx`

**Context:** Replaces category navigation. Shows client-level categories, then project-level categories (with project selector for multi-project clients), with completeness fractions and attention dots.

- [ ] **Step 1: Build IntelligenceSidebar.tsx**

Props:
- `categories: CategorySummary[]` — array of { name, icon, filled, total, hasCriticalMissing, hasConflicts, recentlyUpdated }
- `projectCategories: CategorySummary[]` — project-level categories
- `activeCategory: string`
- `onSelectCategory: (name: string) => void`
- `clientName: string`
- `clientType: string`
- `projectCount: number`
- `overallCompleteness: number` — 0-100%
- `projects?: { id: string, name: string }[]` — for project selector
- `activeProjectId?: string`
- `onSelectProject?: (id: string) => void`

Renders:
- Client header: name, type, project count, overall completeness bar
- Client categories list with: icon, name, filled/total, attention dots (red=critical missing, amber=conflicts, green=recently updated)
- "Project Categories" section with project dropdown
- Project categories (indented) with same attention signals
- "Other" category at bottom
- Legend explaining dot colors

- [ ] **Step 2: Verify component renders**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/intelligence/IntelligenceSidebar.tsx
git commit -m "feat: add intelligence sidebar with attention signals

Category navigation with completeness fractions, conflict indicators,
critical-missing badges, and recently-updated highlights. Supports
both client and project-level categories."
```

### Task 9: Build IntelligenceCardList component

**Files:**
- Create: `src/components/intelligence/IntelligenceCardList.tsx`

- [ ] **Step 1: Build IntelligenceCardList.tsx**

Props:
- `items: IntelligenceItem[]` — fields to display in this category
- `categoryName: string`
- `categoryIcon: string`
- `filled: number`
- `total: number`
- `lastUpdated?: string`
- `clientId: string`
- `projectId?: string`
- `evidenceTrail: EvidenceEntry[]`

Renders:
- Category header (icon, name, filled/total, last updated, sort/filter/add controls)
- Attention chips below header (conflicts count, missing fields count, recently updated count — each clickable to filter)
- List of `<IntelligenceCard>` components
- Sort state: Recent (default), Confidence, Alphabetical
- Filter state: All (default), Conflicts only, Missing only

- [ ] **Step 2: Verify component renders**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/intelligence/IntelligenceCardList.tsx
git commit -m "feat: add intelligence card list with sort, filter, and attention chips"
```

### Task 10: Build IntelligenceMissingFields component

**Files:**
- Create: `src/components/intelligence/IntelligenceMissingFields.tsx`

- [ ] **Step 1: Build IntelligenceMissingFields.tsx**

Props:
- `missingFields: { key: string, label: string, priority: 'critical' | 'important' | 'optional' }[]`
- `onAddField?: (fieldKey: string) => void`

Renders:
- "Missing Fields (N)" header
- Compact chip layout: critical fields in red with "critical" label, optional fields in neutral gray
- Clicking a chip triggers `onAddField` callback (opens add entry modal)

- [ ] **Step 2: Commit**

```bash
git add src/components/intelligence/IntelligenceMissingFields.tsx
git commit -m "feat: add missing fields chip component for intelligence tab"
```

### Task 11: Refactor IntelligenceTab.tsx to compose new components

**Files:**
- Modify: `src/components/IntelligenceTab.tsx`

**Context:** This is the biggest task — the existing file is ~95KB. We need to refactor both `ClientIntelligenceTab` and `ProjectIntelligenceTab` to use the new components while preserving all existing data fetching and state management logic.

**CRITICAL:** Do NOT change any Convex queries, mutations, or data flow. Only change the rendering layer.

- [ ] **Step 1: Read the existing IntelligenceTab.tsx thoroughly**

Understand: data fetching hooks, state management, existing event handlers (edit, delete, add), modal integrations. Note which existing components are used and where.

- [ ] **Step 2: Build category computation logic**

Add a function that takes the intelligence record + field definitions and computes `CategorySummary[]` for the sidebar. This maps each canonical field to its category, counts filled/total, detects conflicts from evidenceTrail, and checks for recently updated entries.

For `extractedAttributes`, use the `categorizeAttribute()` function from `intelligenceCategorizer.ts` to assign categories.

- [ ] **Step 3: Replace the rendering in ClientIntelligenceTab**

Replace the existing card/section rendering with:
```tsx
<div className="flex">
  <IntelligenceSidebar
    categories={clientCategories}
    activeCategory={activeCategory}
    onSelectCategory={setActiveCategory}
    {...clientHeaderProps}
  />
  <div className="flex-1">
    <IntelligenceCardList
      items={filteredItems}
      categoryName={activeCategory}
      {...cardListProps}
    />
    <IntelligenceMissingFields
      missingFields={missingForCategory}
      onAddField={handleAddField}
    />
  </div>
</div>
```

Keep ALL existing data fetching, mutation calls, and modal logic intact.

- [ ] **Step 4: Replace the rendering in ProjectIntelligenceTab**

Same refactor pattern as client tab, using project-specific categories and fields.

- [ ] **Step 5: Verify everything renders and existing functionality works**

Run: `npx next build`
Expected: Build succeeds

Test manually: open the intelligence tab, verify categories display, cards expand, edit/delete still work.

- [ ] **Step 6: Commit**

```bash
git add src/components/IntelligenceTab.tsx
git commit -m "refactor: compose intelligence tab from new card and sidebar components

Replace inline card rendering with IntelligenceSidebar,
IntelligenceCardList, IntelligenceCard, and IntelligenceMissingFields.
All data fetching and mutation logic preserved unchanged."
```

### Task 12: Clean up old components

**Files:**
- Delete: `src/components/intelligence/KnownDataCard.tsx`
- Delete: `src/components/intelligence/MissingDataList.tsx`
- Delete: `src/components/intelligence/IntelligenceSection.tsx`
- Delete: `src/components/intelligence/CompletenessIndicator.tsx`
- Delete: `src/components/intelligence/SharedComponents.tsx`
- Delete: `src/components/intelligence/sections/ClientSections.tsx`
- Delete: `src/components/intelligence/sections/ProjectSections.tsx`

Also update or delete barrel files:
- Modify or delete: `src/components/intelligence/index.ts` (if it exists — re-exports old components)
- Delete: `src/components/intelligence/sections/index.ts` (if it exists)

**CRITICAL:** Only delete after verifying that no other files import these components.

- [ ] **Step 1: Search for imports of old components**

Run grep for each component name AND barrel file imports across `src/` to confirm no remaining imports. Check for `from './intelligence'`, `from '../intelligence'`, etc.

- [ ] **Step 2: Update barrel file (index.ts)**

If `src/components/intelligence/index.ts` exists, update it to re-export the new components instead of the old ones. If no barrel file exists, skip this step.

- [ ] **Step 3: Delete old files**

Only delete files confirmed to have zero remaining imports.

- [ ] **Step 4: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove superseded intelligence UI components

Removed KnownDataCard, MissingDataList, IntelligenceSection,
CompletenessIndicator, SharedComponents, ClientSections, and
ProjectSections — all replaced by new component architecture.
Updated barrel file exports."
```

---

## Chunk 3: Chat Intelligence Query System (Workstream 3)

### Task 13: Add queryIntelligence Convex query function

**Files:**
- Modify: `convex/intelligence.ts`

- [ ] **Step 1: Add the query function**

```typescript
export const queryIntelligence = query({
  args: {
    scope: v.union(v.literal('client'), v.literal('project')),
    clientId: v.optional(v.id('clients')),
    projectId: v.optional(v.id('projects')),
    category: v.optional(v.string()),
    fieldName: v.optional(v.string()),
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Determine which intelligence record to query
    let record;
    if (args.scope === 'client' && args.clientId) {
      record = await ctx.db
        .query('clientIntelligence')
        .withIndex('by_clientId', q => q.eq('clientId', args.clientId!))
        .first();
    } else if (args.scope === 'project' && args.projectId) {
      record = await ctx.db
        .query('projectIntelligence')
        .withIndex('by_projectId', q => q.eq('projectId', args.projectId!))
        .first();
    }

    if (!record) return { results: [], totalMatches: 0 };

    // Build flat list of all fields with their values and evidence
    const fields = flattenIntelligenceRecord(record);

    // Filter by category, fieldName, or query
    let filtered = fields;

    if (args.category) {
      filtered = filtered.filter(f => f.category === args.category);
    }

    if (args.fieldName) {
      const search = args.fieldName.toLowerCase();
      filtered = filtered.filter(f =>
        f.label.toLowerCase().includes(search) ||
        f.fieldPath.toLowerCase().includes(search)
      );
    }

    if (args.query) {
      const search = args.query.toLowerCase();
      filtered = filtered.filter(f =>
        f.label.toLowerCase().includes(search) ||
        String(f.value).toLowerCase().includes(search) ||
        (f.sourceDocumentName ?? '').toLowerCase().includes(search)
      );
    }

    // Sort by confidence desc, then recency desc
    filtered.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (b.extractedAt ?? '').localeCompare(a.extractedAt ?? '');
    });

    return {
      results: filtered.map(f => ({
        field: f.fieldPath,
        label: f.label,
        value: f.value,
        confidence: f.confidence,
        source: f.sourceDocumentName,
        sourceDate: f.extractedAt,
        category: f.category,
        hasConflict: f.hasConflict,
        conflictingValues: f.conflictingValues,
      })),
      totalMatches: filtered.length,
    };
  },
});
```

Also add the helper `flattenIntelligenceRecord()` in the same file. **Note:** Since Convex backend files cannot import from `src/`, the category-mapping logic must be duplicated here (or extracted to `convex/lib/categoryMapping.ts`).

```typescript
// convex/intelligence.ts (or convex/lib/categoryMapping.ts if preferred)

// Category mapping for field prefixes — duplicated from src/ because
// Convex backend cannot import from src/
const FIELD_PREFIX_TO_CATEGORY: Record<string, string> = {
  'contact': 'Contact Info',
  'company': 'Company',
  'financial': 'Financial',
  'financials': 'Financial',
  'experience': 'Experience',
  'kyc': 'KYC / Due Diligence',
  'clientLegal': 'Legal',
  'legal': 'Legal / Title',
  'loanTerms': 'Loan Terms',
  'valuation': 'Valuation',
  'planning': 'Planning',
  'construction': 'Construction',
  'title': 'Legal / Title',
  'insurance': 'Insurance',
  'exit': 'Sales / Exit',
  'overview': 'Overview',
  'location': 'Location',
  'timeline': 'Timeline',
  'development': 'Development',
  'parties': 'Key Parties',
  'conditions': 'Loan Terms',
  'risk': 'Risk',
};

function getCategoryForFieldPath(fieldPath: string): string {
  const prefix = fieldPath.split('.')[0];
  return FIELD_PREFIX_TO_CATEGORY[prefix] ?? 'Other';
}

// Auto-categorize extracted attribute labels that don't match canonical fields
const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/\b(loan|interest\s*rate|ltv|ltgdv|facility|covenant|drawdown)\b/i, 'Loan Terms'],
  [/\b(planning|permitted\s*dev|s106|cil|use\s*class)\b/i, 'Planning'],
  [/\b(valuation|gdv|comparable|market\s*value)\b/i, 'Valuation'],
  [/\b(contract\s*(sum|type|value)|build\s*(cost|programme)|construct)\b/i, 'Construction'],
  [/\b(title|tenure|freehold|leasehold|solicitor|report\s*on\s*title)\b/i, 'Legal / Title'],
  [/\b(insurance|indemnity|warranty|liability|policy)\b/i, 'Insurance'],
  [/\b(exit|sales?\s*(agent|revenue|price)|reserved|exchanged)\b/i, 'Sales / Exit'],
  [/\b(kyc|aml|pep|sanction|due\s*diligence|source\s*of\s*(funds|wealth))\b/i, 'KYC / Due Diligence'],
  [/\b(contact|email|phone|address|name)\b/i, 'Contact Info'],
  [/\b(company|director|shareholder|registration|vat)\b/i, 'Company'],
  [/\b(income|net\s*worth|assets?|debt|credit|bank)\b/i, 'Financial'],
];

function categorizeLabel(label: string): string {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(label)) return category;
  }
  return 'Other';
}

interface FlattenedField {
  fieldPath: string;
  label: string;
  value: unknown;
  confidence: number;
  category: string;
  sourceDocumentName?: string;
  sourceDocumentId?: string;
  extractedAt?: string;
  hasConflict: boolean;
  conflictingValues?: Array<{ value: unknown; confidence: number; source?: string }>;
}

function flattenIntelligenceRecord(record: any): FlattenedField[] {
  const results: FlattenedField[] = [];
  const evidenceTrail: any[] = record.evidenceTrail ?? [];

  // Walk ALL top-level keys of the record dynamically rather than hardcoding sections.
  // This ensures new taxonomy sections (kyc, loanTerms, construction, etc.) are included.
  const SKIP_KEYS = new Set([
    '_id', '_creationTime', 'clientId', 'projectId', 'clientType',
    'extractedAttributes', 'evidenceTrail', 'customFields',
    'lastUpdated', 'lastUpdatedBy', 'version',
    'dataLibraryAggregate', 'dataLibrarySummary', 'projectSummaries',
  ]);

  for (const section of Object.keys(record)) {
    if (SKIP_KEYS.has(section)) continue;
    const data = record[section];
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;

    for (const [key, value] of Object.entries(data)) {
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;

      const fieldPath = `${section}.${key}`;
      const evidence = evidenceTrail.filter((e: any) => e.fieldPath === fieldPath);
      const topEvidence = evidence.sort((a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      const conflicts = evidence
        .filter((e: any) => String(e.value).toLowerCase() !== String(value).toLowerCase())
        .map((e: any) => ({ value: e.value, confidence: e.confidence, source: e.sourceDocumentName }));

      results.push({
        fieldPath,
        label: key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim(),
        value,
        confidence: topEvidence?.confidence ?? 0.5,
        category: getCategoryForFieldPath(fieldPath),
        sourceDocumentName: topEvidence?.sourceDocumentName,
        sourceDocumentId: topEvidence?.sourceDocumentId,
        extractedAt: topEvidence?.extractedAt,
        hasConflict: conflicts.length > 0,
        conflictingValues: conflicts.length > 0 ? conflicts : undefined,
      });
    }
  }

  // Walk extractedAttributes
  const attrs: any[] = record.extractedAttributes ?? [];
  for (const attr of attrs) {
    if (!attr || typeof attr !== 'object') continue;
    const label = attr.label || attr.key || '';
    if (!label) continue;

    results.push({
      fieldPath: `custom.${label}`,
      label,
      value: attr.value,
      confidence: attr.confidence ?? 0.5,
      category: categorizeLabel(label),
      sourceDocumentName: attr.sourceDocumentName,
      sourceDocumentId: attr.sourceDocumentId,
      extractedAt: attr.extractedAt,
      hasConflict: false,
    });
  }

  return results;
}
```

- [ ] **Step 2: Run Convex codegen**

Run: `npx convex codegen`
Expected: Types regenerated

- [ ] **Step 3: Commit**

```bash
git add convex/intelligence.ts
git commit -m "feat: add queryIntelligence Convex query for targeted chat lookups

Supports filtering by scope, category, field name, or free-text query.
Returns matching fields with values, confidence, sources, and conflicts.
Sorted by confidence then recency."
```

### Task 14: Add queryIntelligence tool definition

**Files:**
- Modify: `src/lib/tools/domains/intelligence.tools.ts`
- Modify: `src/lib/tools/executor.ts`
- Modify: `src/lib/tools/registry.ts`

- [ ] **Step 1: Add tool definition to intelligence.tools.ts**

```typescript
{
  name: 'queryIntelligence',
  description: 'Query client or project intelligence for specific field values. Use this to look up data like interest rates, company details, valuations, etc. Always prefer this over loading full documents when the answer is likely in intelligence data.',
  scope: 'global',
  requiresConfirmation: false,
  parameters: [
    { name: 'scope', type: 'string', required: true, description: 'Either "client" or "project"' },
    { name: 'category', type: 'string', required: false, description: 'Category to filter by, e.g. "Loan Terms", "Contact Info", "Valuation"' },
    { name: 'fieldName', type: 'string', required: false, description: 'Field name to search for, e.g. "interest rate", "LTV"' },
    { name: 'query', type: 'string', required: false, description: 'Free text search across field labels, values, and source documents' },
  ],
}
```

- [ ] **Step 2: Add handler to executor.ts**

Add case for `queryIntelligence` in the dispatch table. Follow the same pattern as `getClientIntelligence`:

```typescript
// In the dispatch table:
queryIntelligence: async (params: any) => {
  const result = await ctx.runQuery(api.intelligence.queryIntelligence, {
    scope: params.scope,
    clientId: params.scope === 'client' ? contextClientId : undefined,
    projectId: params.scope === 'project' ? contextProjectId : undefined,
    category: params.category,
    fieldName: params.fieldName,
    query: params.query,
  });
  return result;
},
```

- [ ] **Step 3: Register in registry.ts**

Add `queryIntelligence` to the GLOBAL_SCOPE tools array so it's available in all chat contexts.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tools/domains/intelligence.tools.ts src/lib/tools/executor.ts src/lib/tools/registry.ts
git commit -m "feat: add queryIntelligence chat tool for targeted intelligence lookups

Global-scope read tool that queries intelligence by category, field
name, or free text. Auto-injects clientId/projectId from context."
```

### Task 15: Update chat context gathering — lightweight summary

**Files:**
- Modify: `src/app/api/chat-assistant/route.ts`

**Context:** The `gatherChatContext()` function currently dumps full intelligence records into the system context. Replace this with a compact summary.

- [ ] **Step 1: Create `buildIntelligenceSummary()` helper**

Add a function that takes the intelligence record and returns a compact text summary:

```typescript
import { getAllClientFields, getAllProjectFields } from '@/components/intelligence/fieldDefinitions';
import { getCategoryForField } from '@/components/intelligence/intelligenceUtils';

function buildIntelligenceSummary(
  clientIntel: any | null,
  projectIntel: any | null,
  clientName: string,
  clientType: string,
  projectName?: string,
): string {
  const lines: string[] = [];

  if (clientIntel) {
    lines.push(`Client Intelligence Summary (${clientName}, ${clientType}):`);
    const isLender = clientType === 'lender';
    const allFields = getAllClientFields(isLender);

    // Group fields by category and count filled/missing
    const categoryMap = new Map<string, { filled: number; total: number; criticalMissing: string[] }>();

    for (const field of allFields) {
      const category = getCategoryForField(field.key);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { filled: 0, total: 0, criticalMissing: [] });
      }
      const cat = categoryMap.get(category)!;
      cat.total++;

      // Check if field has a value by walking the nested path
      const parts = field.key.split('.');
      let value: any = clientIntel;
      for (const part of parts) {
        value = value?.[part];
      }

      if (value != null && value !== '') {
        cat.filled++;
      } else if (field.priority === 'critical') {
        cat.criticalMissing.push(field.label);
      }
    }

    for (const [category, stats] of categoryMap) {
      let line = `- ${category}: ${stats.filled}/${stats.total} filled`;
      if (stats.criticalMissing.length > 0) {
        line += ` [⚠ missing critical: ${stats.criticalMissing.join(', ')}]`;
      }
      lines.push(line);
    }
  }

  if (projectIntel && projectName) {
    lines.push('');
    lines.push(`Project Intelligence (${projectName}):`);
    const allFields = getAllProjectFields();
    const categoryMap = new Map<string, { filled: number; total: number; criticalMissing: string[] }>();

    for (const field of allFields) {
      const category = getCategoryForField(field.key);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { filled: 0, total: 0, criticalMissing: [] });
      }
      const cat = categoryMap.get(category)!;
      cat.total++;

      const parts = field.key.split('.');
      let value: any = projectIntel;
      for (const part of parts) {
        value = value?.[part];
      }

      if (value != null && value !== '') {
        cat.filled++;
      } else if (field.priority === 'critical') {
        cat.criticalMissing.push(field.label);
      }
    }

    for (const [category, stats] of categoryMap) {
      let line = `- ${category}: ${stats.filled}/${stats.total} filled`;
      if (stats.criticalMissing.length > 0) {
        line += ` [⚠ missing critical: ${stats.criticalMissing.join(', ')}]`;
      }
      lines.push(line);
    }
  }

  lines.push('');
  lines.push('Use queryIntelligence tool to look up specific values.');

  return lines.join('\n');
}
```

- [ ] **Step 2: Replace full intelligence dump with summary**

In `gatherChatContext()`, find where client intelligence is serialized into the context string (around lines 95-199 for client, 438-510 for project). Replace the full JSON dump with the output of `buildIntelligenceSummary()`.

**CRITICAL:** Keep the try/catch error handling. If intelligence fails to load, degrade gracefully (empty summary, not a crash).

- [ ] **Step 3: Update system prompt instructions**

In the system instructions block (around line 1015), add guidance about the queryIntelligence tool:

```
Intelligence data is available via the queryIntelligence tool. The summary above shows what categories have data and what's missing. For questions about specific values (e.g., "what's the interest rate?", "who is the contractor?"), call queryIntelligence with the relevant category or field name rather than searching through documents.
```

- [ ] **Step 4: Verify chat still works**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat-assistant/route.ts
git commit -m "feat: replace full intelligence context dump with lightweight summary

Chat now loads ~300 tokens of intelligence summary instead of
10,000-25,000 tokens. Uses queryIntelligence tool for specific
lookups. ~95% reduction in intelligence-related token usage."
```

### Task 16: Final build and push

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run -v`
Expected: All tests PASS

- [ ] **Step 2: Run Next.js build**

Run: `npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit and push**

```bash
git push origin main
```
