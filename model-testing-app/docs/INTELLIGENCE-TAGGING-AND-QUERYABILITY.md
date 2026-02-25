# Intelligence Extraction: Tagging, Queryability & Knowledge Items

## Purpose of This Document

This document is **additional context** for the agent building the intelligence extraction skill (see `starry-purring-moler.md`). It addresses gaps found during an audit of the full client intelligence system — specifically around **tagging for document generation**, **source attribution**, **confidence tracking**, and **making intelligence queryable** rather than buried in monolithic JSON blobs.

The intelligence extraction skill being built is the right foundation. This document specifies what it needs to produce so that downstream document generation (lender's notes, credit submissions, proposals) can reliably find and use the extracted data.

---

## The Core Problem

Currently, extracted intelligence gets written to monolithic `clientIntelligence` / `projectIntelligence` documents — one giant JSON blob per client/project. This makes it impossible to:

- Query "give me every piece of financial data tagged for a lender's note"
- Track which document a specific fact came from
- Detect when two documents disagree on the same field
- Know when data is stale vs. fresh
- Build templates that pull specific tagged fields

The `knowledgeItems` table already exists in the schema with the right design (per-field, normalized, with source tracking, status, and conflict detection). **The extraction skill must write to `knowledgeItems` as its primary output**, not just to the monolithic blobs.

---

## What the Extraction Skill Must Produce Per Field

Every intelligence field extracted from a document must include these properties. The `IntelligenceField` type in the plan already covers most of this — below are the additions and clarifications needed:

```typescript
interface IntelligenceField {
  // Already in plan
  fieldPath: string;        // Canonical path or custom.{label}
  label: string;            // Human-readable
  value: any;               // Extracted value
  valueType: FieldType;     // string | number | currency | date | percentage | array | text | boolean
  confidence: number;       // 0.0-1.0
  sourceText: string;       // Direct quote from document (REQUIRED, not optional)
  scope: 'client' | 'project';
  isCanonical: boolean;

  // ADDITIONS for tagging & queryability
  templateTags: string[];   // Which document templates can use this field (see taxonomy below)
  category: string;         // Field category (see category definitions below)
  originalLabel: string;    // What the AI originally called this before normalization
  pageReference?: string;   // Page number or section where found (e.g., "p.3", "Schedule 2")
}
```

### Non-Negotiable Requirements

1. **`sourceText` must be REQUIRED** — every field must have a direct quote from the source document. Without this, generated documents can't cite sources and users can't verify accuracy.

2. **`templateTags` must always be populated** — even if it's just `["general"]`. The extraction skill prompt must instruct Claude to tag every field.

3. **`originalLabel` must be preserved** — when Claude extracts "Total Loan Facility" and it gets normalized to `financials.loanAmount`, we need to keep "Total Loan Facility" so we can show users what was actually in the document.

4. **`confidence` must follow strict rules** — see Confidence Framework below.

---

## Tag Taxonomy

Tags indicate which **output document templates** a piece of intelligence is relevant for. A single field can have multiple tags. The extraction skill prompt must include this taxonomy so Claude tags appropriately.

### Template Tags (for document generation)

| Tag | Description | Example Fields |
|-----|-------------|----------------|
| `lenders_note` | Data needed for a lender's internal credit note | GDV, LTV, loan amount, borrower experience, site address, planning status, exit strategy |
| `credit_submission` | Data for formal credit committee submission | All financials, borrower track record, risk factors, security details, key conditions |
| `proposal` | Data for a lending proposal to borrower | Proposed terms, rates, fees, loan structure, key conditions, timeline |
| `deal_summary` | High-level deal overview for internal use | Project type, location, loan amount, GDV, borrower name, key dates |
| `due_diligence` | Data supporting DD checklist | Title details, planning refs, survey findings, environmental, legal opinions |
| `risk_assessment` | Data relevant to risk evaluation | LTV, borrower experience, market conditions, planning risk, construction risk, exit risk |
| `valuation_summary` | Data from or about property valuations | Market value, GDV, comparables, special assumptions, valuer identity |
| `legal_summary` | Data from legal documents | Title details, charges, covenants, lease terms, guarantees, conditions precedent |
| `monitoring` | Data for ongoing project monitoring | Construction progress, drawdown schedule, cost overruns, timeline slippage |
| `general` | Catch-all for data not specific to any template | Company registration numbers, contact details, miscellaneous references |

### Tagging Rules for the Skill Prompt

The SKILL.md for intelligence extraction should include:

```
## Template Tagging Rules

Every extracted field MUST have at least one templateTag. Apply tags based on:

1. **Financial amounts** (GDV, loan amount, costs, values) → always tag: ["lenders_note", "credit_submission", "deal_summary"]
2. **Borrower/client identity** (company name, directors, experience) → tag: ["credit_submission", "lenders_note", "due_diligence"]
3. **Property/site details** (address, tenure, title, planning) → tag: ["lenders_note", "due_diligence", "deal_summary"]
4. **Loan terms** (rate, fees, LTV, conditions) → tag: ["proposal", "credit_submission", "lenders_note"]
5. **Dates/timeline** (completion, maturity, milestones) → tag: ["deal_summary", "monitoring", "lenders_note"]
6. **Risk factors** (conditions, caveats, warnings) → tag: ["risk_assessment", "credit_submission"]
7. **Valuation data** (market value, comparables, assumptions) → tag: ["valuation_summary", "lenders_note", "credit_submission"]
8. **Legal details** (title, charges, guarantees, covenants) → tag: ["legal_summary", "due_diligence", "credit_submission"]
9. **Construction/development** (units, sqft, specifications) → tag: ["deal_summary", "monitoring", "lenders_note"]
10. **Contact/entity info** (names, emails, roles) → tag: ["general", "deal_summary"]

When in doubt, include MORE tags rather than fewer. It's better to have a field appear
in a template query and be filtered out than to miss it entirely.
```

---

## Category Definitions

Categories group fields by their **domain** (what they're about), while tags group by their **usage** (what they're for). Both are needed.

### Canonical Categories

These map directly to the first segment of the `fieldPath`:

| Category | Field Path Prefix | Description | Example Fields |
|----------|------------------|-------------|----------------|
| `financials` | `financials.*` | All monetary values and financial ratios | gdv, loanAmount, ltv, purchasePrice, totalDevelopmentCost, profitMargin, interestRate, arrangementFee, exitFee, equityContribution |
| `timeline` | `timeline.*` | All dates and durations | acquisitionDate, constructionStart, practicalCompletion, loanMaturity, salesCompletion, planningSubmission, planningApproval |
| `location` | `location.*` | Property/site location data | siteAddress, postcode, localAuthority, region, titleNumber, tenure, coordinates |
| `overview` | `overview.*` | Project description and scope | projectType, assetClass, description, currentPhase, unitCount, totalSqft, siteArea, existingUse, proposedUse |
| `development` | `development.*` | Construction and development specifics | unitBreakdown, planningReference, planningStatus, buildSpec, architect, contractor |
| `parties` | `parties.*` | Key parties involved in the deal | borrower, lender, solicitor, valuer, architect, contractor, monitoringSurveyor, broker, guarantor |
| `company` | `company.*` | Client company information | name, registrationNumber, registeredAddress, incorporationDate, vatNumber, tradingName |
| `contact` | `contact.*` | Contact information | primaryName, email, phone, role, additionalContacts |
| `financial` | `financial.*` | Client-level financial profile (not project) | netWorth, liquidAssets, annualIncome, propertyPortfolioValue |
| `legal` | `legal.*` | Legal details from documents | titleDetails, charges, covenants, leaseTerms, guaranteeDetails, conditionsPrecedent, conditionsSubsequent |
| `insurance` | `insurance.*` | Insurance coverage details | policyNumber, insurer, coverAmount, expiryDate, coverType |
| `planning` | `planning.*` | Planning permission details | applicationRef, status, conditions, s106Details, cil, permittedDevelopment |
| `valuation` | `valuation.*` | Valuation-specific data | marketValue, gdv, specialAssumptions, comparables, valuer, valuationDate, basisOfValue |
| `risk` | `risk.*` | Identified risks and mitigants | description, severity, mitigant, category (market/construction/planning/exit/borrower) |
| `conditions` | `conditions.*` | Loan conditions and requirements | precedent, subsequent, ongoing, waivers |
| `insights` | `insights.*` | AI-generated summaries and analysis | executiveSummary, keyFindings, keyTerms |
| `custom` | `custom.*` | Non-canonical fields that don't fit above | Any field the AI extracts that doesn't map to a canonical path |

### Category Rules for the Skill Prompt

```
## Field Categorization Rules

The category is derived from the first segment of the fieldPath. When mapping
extracted data to field paths:

1. ALWAYS try to map to a canonical field first (see canonical field list)
2. If no canonical match, choose the most appropriate category prefix:
   - Financial number → financials.{descriptive_name}
   - Date → timeline.{descriptive_name}
   - Address/location → location.{descriptive_name}
   - Person/company → parties.{role_name} or contact.{descriptive_name}
   - Legal clause/condition → legal.{descriptive_name} or conditions.{type}
   - Risk/warning → risk.{descriptive_name}
3. Only use custom.{name} when no standard category applies
4. Use snake_case for custom field names: custom.s106_contribution, not custom.S106 Contribution
```

---

## Confidence Framework

Confidence scores must be consistent and meaningful because they drive merge behavior (higher confidence overwrites lower) and determine what appears in generated documents.

### Confidence Tiers

| Score | Tier | Meaning | When to Use |
|-------|------|---------|-------------|
| 0.95-1.0 | **Definitive** | Value is explicitly stated, unambiguous, from authoritative source | Loan amount on a facility letter, company number on Certificate of Incorporation, valuation figure on a RICS Red Book report |
| 0.85-0.94 | **High** | Value is clearly stated but may need context | GDV mentioned in a valuation report (authoritative), dates in term sheets, named parties in legal documents |
| 0.70-0.84 | **Medium** | Value is present but requires interpretation or inference | Percentages calculated from other figures, dates mentioned in passing, parties implied but not formally stated |
| 0.50-0.69 | **Low** | Value is inferred, approximate, or from informal source | Amounts mentioned in emails or meeting notes, estimated timelines, implied relationships |
| Below 0.50 | **Do not extract** | Too uncertain to be useful | Vague references, ambiguous context, could be about a different project/client |

### Confidence Modifiers

The skill prompt should instruct Claude to adjust confidence based on:

```
## Confidence Scoring

Base confidence on document authority + value clarity:

DOCUMENT AUTHORITY (affects base confidence):
- Formal legal documents (facility letters, deeds, guarantees): base 0.90
- Professional reports (valuations, surveys, inspections): base 0.85
- Financial statements and bank records: base 0.85
- Planning documents and consents: base 0.85
- Term sheets and indicative terms: base 0.80
- Correspondence and emails: base 0.65
- Meeting notes and call summaries: base 0.60
- Internal notes and memos: base 0.55

VALUE CLARITY (adjust from base):
- Explicitly labeled and formatted (e.g., "Loan Amount: £2,500,000"): +0.05
- Clearly stated but not labeled (e.g., "...facility of £2,500,000..."): +0.00
- Requires calculation or inference: -0.10
- Mentioned casually or in passing: -0.15
- Contradicted elsewhere in same document: -0.20
```

---

## Writing to `knowledgeItems` — The Filing Step

When a document is filed (user clicks "File" in BulkReviewTable), the extracted `IntelligenceField[]` array (with any user edits applied) must be written to `knowledgeItems`. This is the **critical step** that makes intelligence queryable.

### For Each Extracted Field, Create a `knowledgeItem`:

```typescript
// Pseudocode for the filing mutation
for (const field of extractedFields) {
  // Check if this field already exists for this client/project
  const existing = await ctx.db.query("knowledgeItems")
    .withIndex("by_client_field", q => q.eq("clientId", clientId).eq("fieldPath", field.fieldPath))
    // or by_project_field for project-scoped fields
    .first();

  if (existing) {
    if (field.confidence > (existing.normalizationConfidence ?? 0)) {
      // Supersede the old entry
      await ctx.db.patch(existing._id, {
        status: "superseded",
        supersededBy: newItemId
      });
      // Create new entry (see below)
    } else if (field.value !== existing.value) {
      // Different value, lower confidence → create conflict
      await ctx.db.insert("intelligenceConflicts", {
        clientId,
        projectId,
        fieldPath: field.fieldPath,
        category: field.category,
        description: `"${field.label}" differs: "${field.value}" (new, confidence ${field.confidence}) vs "${existing.value}" (existing, confidence ${existing.normalizationConfidence})`,
        relatedItemIds: [existing._id, newItemId],
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
    }
    // Same value, same or lower confidence → skip (already have it)
  }

  // Create the knowledge item
  await ctx.db.insert("knowledgeItems", {
    clientId: field.scope === 'client' ? clientId : undefined,
    projectId: field.scope === 'project' ? projectId : undefined,

    fieldPath: field.fieldPath,
    isCanonical: field.isCanonical,
    category: field.category,
    label: field.label,

    value: field.value,
    valueType: field.valueType,

    sourceType: "ai_extraction",
    sourceDocumentId: documentId,
    sourceDocumentName: documentName,
    sourceText: field.sourceText,

    originalLabel: field.originalLabel,
    matchedAlias: field.isCanonical ? field.label : undefined,
    normalizationConfidence: field.confidence,

    status: "active",
    addedAt: now,
    updatedAt: now,
    addedBy: "ai-extraction",
  });
}
```

### Schema Addition Required

The `knowledgeItems` table needs a `tags` field added:

```typescript
// In convex/schema.ts, add to knowledgeItems:
tags: v.optional(v.array(v.string())),  // Template tags: ["lenders_note", "credit_submission", etc.]
```

And a new index for tag-based queries:

```typescript
.index("by_client_tags", ["clientId", "status"])  // Filter in application code by tags
```

(Convex doesn't support array indexes, so tag filtering happens in application code after the index narrows by client/project + status.)

---

## Querying Intelligence for Document Generation

Once knowledge items are the primary store, template generation queries become straightforward:

### Example: "Get all data for a Lender's Note"

```typescript
// Query all active knowledge items for this project tagged for lender's note
const items = await ctx.db.query("knowledgeItems")
  .withIndex("by_project", q => q.eq("projectId", projectId))
  .filter(q => q.eq(q.field("status"), "active"))
  .collect();

const lendersNoteData = items.filter(item =>
  item.tags?.includes("lenders_note")
);

// Group by category for template sections
const grouped = {};
for (const item of lendersNoteData) {
  if (!grouped[item.category]) grouped[item.category] = [];
  grouped[item.category].push(item);
}

// Result: { financials: [...], location: [...], timeline: [...], parties: [...] }
// Each item has: label, value, valueType, confidence, sourceText, sourceDocumentName
```

### Example: "What's missing for a Credit Submission?"

```typescript
// Define required fields for credit submission template
const CREDIT_SUBMISSION_REQUIRED = [
  "financials.loanAmount", "financials.gdv", "financials.ltv",
  "financials.purchasePrice", "financials.totalDevelopmentCost",
  "location.siteAddress", "overview.projectType", "overview.unitCount",
  "timeline.practicalCompletion", "parties.borrower", "parties.lender",
  // ... etc
];

const existing = await getActiveFieldPaths(projectId);
const missing = CREDIT_SUBMISSION_REQUIRED.filter(f => !existing.includes(f));
// Returns: ["financials.ltv", "timeline.practicalCompletion", ...]
```

---

## What Needs to Change in the Current Plan

The plan in `starry-purring-moler.md` is solid. Here's what needs to be layered on:

### 1. SKILL.md Must Include Tag Taxonomy

Section B1 says the skill instructs Claude to "Tag with `templateTags` for template population." The skill prompt needs the **full tag taxonomy table** and **tagging rules** from this document so Claude knows exactly which tags to apply to which fields.

### 2. `IntelligenceField` Type Needs Additions

Section B4 defines `IntelligenceField`. Add:
- `category: string` (derived from fieldPath, but explicitly set by Claude)
- `originalLabel: string` (what Claude originally extracted before normalization)
- `pageReference?: string` (where in the document this was found)
- Make `sourceText` required (not optional)
- Make `templateTags` required with minimum `["general"]`

### 3. Filing Flow Must Write `knowledgeItems`

Section C3 says filing creates `knowledgeItems` + merges into monolithic blobs. The **priority** must be:

1. Write each field as a `knowledgeItem` (primary store)
2. Check for conflicts with existing items (create `intelligenceConflicts` if needed)
3. Optionally update monolithic `clientIntelligence`/`projectIntelligence` as a **derived view** (for backward compatibility with the chat assistant context builder until it's updated to read from `knowledgeItems`)

### 4. Schema Update for Tags

Add `tags` field to `knowledgeItems` table in `convex/schema.ts`.

### 5. Canonical Field List Expansion

The current `LABEL_TO_CANONICAL` in `intelligenceHelpers.ts` has ~45 mappings. For the intelligence extraction skill to work well, this needs to grow to cover all the categories above. The skill itself should be given the **full canonical field list** so Claude maps to the right paths. Key additions needed:

- `legal.*` fields (titleDetails, charges, covenants, guaranteeDetails, conditionsPrecedent, conditionsSubsequent)
- `insurance.*` fields (policyNumber, insurer, coverAmount, expiryDate, coverType)
- `planning.*` fields (applicationRef, status, conditions, s106Details, cil)
- `valuation.*` fields (marketValue, specialAssumptions, comparables, basisOfValue)
- `risk.*` fields (description, severity, mitigant)
- `conditions.*` fields (precedent, subsequent, ongoing)
- `parties.*` fields (solicitor, valuer, architect, contractor, monitoringSurveyor, broker, guarantor)

### 6. Conflict Detection in Merge

When writing to `knowledgeItems`, the filing mutation must check for existing active items with the same `fieldPath` for the same client/project. If values differ:
- Higher confidence → supersede old item
- Lower confidence + different value → create `intelligenceConflict`
- Same value → skip (idempotent)

---

## Summary: The Extraction Skill's Responsibility

The skill extracts intelligence from documents. For each field it extracts, it must provide:

1. **What** — `fieldPath`, `label`, `value`, `valueType` (the data)
2. **Where** — `sourceText`, `pageReference` (provenance)
3. **How sure** — `confidence` following the tiered framework
4. **For whom** — `scope` (client vs project)
5. **For what** — `templateTags[]` following the tag taxonomy (what templates can use this)
6. **What kind** — `category` following category definitions (what domain this belongs to)
7. **Original form** — `originalLabel` (what the document actually called it)

The filing flow then writes each field as a queryable `knowledgeItem` with full source attribution, enabling downstream document generation to query by tag, category, confidence, and source.

---

## File References

| File | Relevance |
|------|-----------|
| `convex/schema.ts:2809-2905` | `knowledgeItems` + `intelligenceConflicts` table definitions |
| `convex/intelligenceHelpers.ts` | Current canonical field mappings + value parsers |
| `convex/intelligence.ts:1422-1769` | Current `mergeExtractedIntelligence` (needs updating) |
| `convex/knowledgeLibrary.ts` | `bulkAddKnowledgeItems` mutation (exists, may need updating) |
| `src/v4/skills/intelligence-extract/SKILL.md` | The skill being built (needs tag taxonomy + confidence framework) |
| `src/v4/types.ts` | `IntelligenceField` type (needs additions) |
| `convex/bulkUpload.ts` | Filing flow (C3 in plan — must write `knowledgeItems`) |
