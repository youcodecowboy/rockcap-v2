# Merged Intelligence Pipeline Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge intelligence extraction into the classification API call (eliminating the separate Stage 5.5 call), add qualifier/context fields for document generation disambiguation, and fix PDF validation.

**Architecture:** Single Anthropic API call per document that does intelligence extraction first (as structured reading comprehension), then classification, summarization, and filing — informed by the extracted fields. Eliminates duplicate document upload, halves API calls, and improves classification quality.

---

## 1. Problem Statement

### 1.1 Duplicate API Calls

The V4 pipeline currently makes **two API calls per document**:

1. **Classification call** (Stage 5): Uploads document (PDF/image/text) → classifies, summarizes, files
2. **Intelligence call** (Stage 5.5): Re-uploads a truncated text copy of the same document → extracts structured fields

This means every document is sent to Anthropic twice. The intelligence call re-uploads 4-12K chars of text that the model already processed in Call 1. This doubles rate limit pressure and token cost.

### 1.2 Intelligence Context for Document Generation

The `knowledgeItems` table stores flat field-value pairs with no disambiguation. When a project has multiple values for the same field type (e.g., multiple interest rates for different loan tranches), the document generator cannot tell them apart. Fields like `financials.interestRate` with value `7.5` need context about _which_ interest rate this is.

### 1.3 Invalid PDF Errors

`preprocessPdf()` in `document-preprocessor.ts` does not validate that file bytes are actually PDF data before base64-encoding and sending to Anthropic. Browser-misreported files (e.g., a JPEG with MIME type `application/pdf`) cause 400 errors.

---

## 2. Design

### 2.1 Merged Pipeline (Single API Call)

#### Before (2 calls per document)

```
Call 1: Upload doc (multimodal: PDF/image/text) → classify → summarize → file
Call 2: Re-upload doc as truncated text (12K chars) → extract intelligence fields  (separate skill)
```

#### After (1 call per document)

```
Call 1: Upload doc → extract intelligence → classify → summarize → file
```

Intelligence extraction becomes the **first stage** in the response. The model reads the document, extracts all structured fields (amounts, dates, entities, references), and then uses those extracted fields as additional signal for classification, summarization, and filing.

#### Why intelligence-first ordering

A human analyst reads a document by noticing key data points first (GDV, LTV, facility amount, planning references), and those data points tell them what kind of document it is. Extracting intelligence first serves as structured chain-of-thought that improves downstream classification accuracy.

#### What gets eliminated

- `callAnthropicIntelligence()` function in `anthropic-client.ts`
- `callAnthropicIntelligenceBatch()` function in `anthropic-client.ts`
- `parseIntelligenceResponse()` helper function
- Stage 5.5 block in `pipeline.ts`
- `src/v4/skills/intelligence-extract/SKILL.md` as a separate file (instructions merge into main skill)
- The intelligence caching problem entirely (instructions become part of the already-cached classification system prompt)
- Duplicate document upload (~4-12K tokens per file)
- ~50% of API calls per bulk upload

### 2.2 Skill Prompt Changes

#### Classification SKILL.md Updates

The `document-classify/SKILL.md` gets the intelligence extraction instructions merged in. The current lightweight "Intelligence Extraction" section (lines 67-79) is replaced with the full extraction rules from `intelligence-extract/SKILL.md`, adapted for the merged context.

Key additions to the classification skill:

1. **Field Path Mapping** — canonical paths (financials.gdv, legal.titleDetails, etc.)
2. **Confidence Scoring** — document authority + value clarity framework
3. **Qualifier rules** — when and how to set qualifiers for multi-instance fields
4. **Context rules** — one-sentence explanations for every extracted field
5. **Value Type Guidelines** — currency/percentage/date/text/boolean formatting
6. **UK Property Finance Domain Knowledge** — abbreviations, conventions, legal patterns
7. **Self-Review for extraction** — value accuracy, scope assignment, confidence calibration

The classification process section updates to:

1. Extract intelligence fields (forces careful reading)
2. Classify document type (informed by extracted fields + reference library)
3. Summarize document (informed by intelligence + classification)
4. Assign filing folder (informed by classification)
5. Match to checklist items

#### Output Format Changes

The output schema in `buildBatchUserMessage()` updates the `intelligenceFields` array to include the full field set:

```json
{
  "documentIndex": 0,
  "fileName": "facility-letter.pdf",
  "intelligenceFields": [
    {
      "fieldPath": "financials.loanAmount",
      "label": "Facility Amount (Senior)",
      "value": "15000000",
      "valueType": "currency",
      "confidence": 0.90,
      "sourceText": "Total Senior Facility: £15,000,000",
      "isCanonical": true,
      "scope": "project",
      "templateTags": ["general", "lenders_note", "credit_submission", "deal_summary"],
      "category": "financials",
      "originalLabel": "Total Senior Facility",
      "pageReference": "p.2",
      "qualifier": "Senior",
      "context": "Senior secured development facility per facility agreement dated 15 March 2024"
    }
  ],
  "classification": { ... },
  "summary": { ... },
  "checklistMatches": [ ... ]
}
```

New fields on each intelligence item:
- `qualifier` (string | null) — disambiguator for multi-instance fields
- `context` (string) — one-sentence explanation for LLM consumption during doc generation
- `isCanonical` (boolean) — whether this maps to a known canonical field path
- `scope` ("client" | "project") — whether this is client-level or project-level data

### 2.3 Schema Changes (`knowledgeItems`)

Add two optional fields to the `knowledgeItems` table in `convex/schema.ts`:

```typescript
qualifier: v.optional(v.string()),  // Disambiguator for multi-instance fields
context: v.optional(v.string()),    // One-sentence explanation for doc generation
```

Add composite indexes for the new uniqueness key:

```typescript
.index("by_project_field_qualifier", ["projectId", "fieldPath", "qualifier"])
.index("by_client_field_qualifier", ["clientId", "fieldPath", "qualifier"])
```

### 2.4 Supersession Logic Changes

**Current:** Matches existing active items by `(clientId/projectId, fieldPath)`. Same value = skip. Different value = supersede old, insert new. Note: "scope" is implicit — determined by whether `clientId` or `projectId` is populated, not a stored field.

**New:** Matches by `(clientId/projectId, fieldPath, qualifier)`.

- Same fieldPath, different qualifier → coexist as separate active items
- Same fieldPath, same qualifier, different value → supersede (updated value)
- Same fieldPath, qualifier = null → backward compatible, works as today

Conflict detection also updates: same `(fieldPath, qualifier)` with different values from different sources = conflict. Different qualifiers = not a conflict.

Affected functions in `convex/knowledgeLibrary.ts`:
- `addKnowledgeItem` — add qualifier to existing-item lookup
- `bulkAddKnowledgeItems` — add qualifier to existing-item lookup
- `resolveIntelligenceConflict` — qualifier-aware conflict matching
- `applyConsolidation` / `applyDuplicateResolution` — qualifier-aware dedup

### 2.5 Type Changes

Update `IntelligenceField` interface in `src/v4/types.ts` to add:

```typescript
qualifier?: string | null;
context?: string;
```

Update the inline `intelligenceFields` type in `DocumentClassification` to match the full `IntelligenceField` interface. Currently the inline type is missing `isCanonical` and `scope` (which exist on the full `IntelligenceField` today), plus the new `qualifier` and `context` fields being added. Additionally, the JSON example shown to the model in `buildBatchUserMessage()` (line 274 of `anthropic-client.ts`) omits several fields that the TypeScript type expects (`category`, `originalLabel`, `pageReference`, `isCanonical`, `scope`). The implementation must update both the TypeScript types AND the prompt example to include all fields.

### 2.6 Pipeline Changes

In `src/v4/lib/pipeline.ts`:

- Remove Stage 5.5 intelligence extraction block entirely
- Update Stage 5 result parsing to extract `intelligenceFields` from the classification response (already partially present)
- Remove `callAnthropicIntelligence` and `callAnthropicIntelligenceBatch` imports
- The intelligence fields flow directly from the classification response into the pipeline result

In `src/v4/lib/anthropic-client.ts`:

- Remove `callAnthropicIntelligence()` function
- Remove `callAnthropicIntelligenceBatch()` function
- Remove `parseIntelligenceResponse()` function
- Update `buildBatchUserMessage()` output schema to include full intelligence fields
- Update `parseClassificationResponse()` to handle the expanded intelligence fields

### 2.7 System Prompt Caching

The intelligence extraction instructions become part of `stableBlock` in the system prompt (alongside the existing classification skill instructions). This adds ~3-4K tokens to the cached block, bringing the total system prompt to ~40K tokens. At 10% cache cost, this is ~4K token-equivalent per call — far cheaper than the current separate 7.5K fresh intelligence call.

The `dynamicBlock` (references) remains unchanged.

### 2.8 PDF Validation Fix

In `src/v4/lib/document-preprocessor.ts`, `preprocessPdf()`:

Add magic byte validation before base64 encoding:

```typescript
const headerBytes = new Uint8Array(buffer, 0, 4);
const headerText = String.fromCharCode(...headerBytes);
if (headerText !== '%PDF') {
  return { type: 'text', text: '[File does not have a valid PDF header — content could not be processed as PDF]' };
}
```

This ensures only actual PDF files get sent to Anthropic with `media_type: 'application/pdf'`. Non-PDF files that were misreported by the browser fall back to text representation.

---

## 3. Qualifier & Context Details

### 3.1 When to Use Qualifiers

The extraction instructions tell the model to set qualifiers when:

- A document contains **multiple values for the same data type** (e.g., two interest rates) — REQUIRED
- A value applies to a **specific tranche, phase, building, unit type, or time period** — REQUIRED even for single instances (future documents may add more)

### 3.2 Common Qualifier Patterns

| Pattern | Examples |
|---------|----------|
| Loan tranches | "Senior", "Mezzanine", "Tranche A", "Tranche B" |
| Project phases | "Phase 1", "Phase 2", "Phase 3" |
| Time periods | "Day 1", "Post-PC", "Year 1", "Month 6" |
| Asset types | "Residential", "Commercial", "Retail" |
| Valuation bases | "Market Value", "Reinstatement", "90-Day" |
| Buildings | "Block A", "Block B", "Tower", "Podium" |

### 3.3 Context Format

Every extracted field gets a `context` string — a one-sentence explanation of what the value means in the deal. This is for LLM consumption during document generation.

Examples:
- `"Senior secured development facility interest rate, fixed for 18 months from first drawdown"`
- `"GDV for the completed 24-unit residential scheme as stated in the RICS Red Book valuation"`
- `"Company registration number for the SPV borrower entity"`

### 3.4 Qualifier in Supersession

The uniqueness key changes from `(scope, fieldPath)` to `(scope, fieldPath, qualifier)`:

| fieldPath | qualifier | value | Supersedes? |
|-----------|-----------|-------|-------------|
| `financials.interestRate` | `Senior` | `7.5` | Only superseded by another `financials.interestRate` + `Senior` |
| `financials.interestRate` | `Mezzanine` | `12` | Coexists with `Senior` — different qualifier |
| `financials.loanAmount` | `null` | `8000000` | Backward compatible — works as today |

---

## 4. Files Changed

### Modified

| File | Change |
|------|--------|
| `src/v4/skills/document-classify/SKILL.md` | Merge intelligence extraction instructions, add qualifier/context rules, UK domain knowledge |
| `src/v4/lib/anthropic-client.ts` | Remove intelligence functions, update output schema and parser |
| `src/v4/lib/pipeline.ts` | Remove Stage 5.5, update result handling |
| `src/v4/types.ts` | Add qualifier/context to IntelligenceField, align inline type |
| `convex/schema.ts` | Add qualifier + context fields, new indexes on knowledgeItems |
| `convex/knowledgeLibrary.ts` | Qualifier-aware supersession + conflict logic |
| `src/v4/lib/document-preprocessor.ts` | PDF magic byte validation |

### Removed

| File | Reason |
|------|--------|
| `src/v4/skills/intelligence-extract/SKILL.md` | Instructions merged into document-classify skill |

---

## 5. What This Does NOT Change

- **Reference library** (`src/lib/references/`) — unchanged
- **Aggregate tables** (`clientIntelligence`, `projectIntelligence`) — unchanged, doc generation queries `knowledgeItems` directly
- **Bulk queue processor** (`bulkQueueProcessor.ts`) — unchanged, still processes one file per worker
- **Filing flow** — unchanged, intelligence fields are still stored via `batchUpsertKnowledgeItems`
- **Chat system** — unchanged
- **Frontend** — unchanged (intelligence fields already flow through)

---

## 6. Benefits

1. **50% fewer API calls** — one call per document instead of two
2. **~10-16K fewer tokens per document** — no duplicate document upload + no separate intelligence prompt
3. **Better rate limit headroom** — fewer calls means potential to increase concurrency beyond 5
4. **Better extraction quality** — model sees full document (PDF/image) instead of truncated 12K text
5. **Better classification quality** — intelligence-first ordering provides structured chain-of-thought
6. **Caching problem eliminated** — intelligence instructions cached as part of existing system prompt
7. **Document generation ready** — qualifier + context fields enable unambiguous field retrieval
