# Merged Intelligence Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge intelligence extraction into the single classification API call, add qualifier/context fields for document generation, and fix PDF validation.

**Architecture:** Single Anthropic API call per document does intelligence extraction first (structured reading comprehension), then classification, summarization, and filing. Eliminates Stage 5.5, halves API calls, and adds qualifier/context disambiguation for downstream document generation.

**Tech Stack:** Next.js 16, Convex (schema + mutations), Anthropic Claude API (Haiku 4.5), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-11-merged-intelligence-pipeline-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `convex/schema.ts` | Modify | Add `qualifier` + `context` fields and composite indexes to `knowledgeItems` |
| `convex/knowledgeLibrary.ts` | Modify | Qualifier-aware supersession in `addKnowledgeItem`, `bulkAddKnowledgeItems`, `resolveIntelligenceConflict`, `applyConsolidation`, `applyDuplicateResolution` |
| `src/v4/types.ts` | Modify | Add `qualifier`/`context` to `IntelligenceField`, align inline type |
| `src/v4/skills/document-classify/SKILL.md` | Modify | Merge intelligence extraction instructions from intelligence-extract skill |
| `src/v4/lib/anthropic-client.ts` | Modify | Update output schema, remove intelligence functions |
| `src/v4/lib/pipeline.ts` | Modify | Remove Stage 5.5, update imports and result assembly |
| `src/v4/lib/document-preprocessor.ts` | Modify | Add PDF magic byte validation |
| `src/app/api/v4-analyze/route.ts` | Modify | Update intelligence field source from `result.intelligence` to per-doc fields |

---

## Chunk 1: Schema & Type Changes

### Task 1: Add qualifier and context to knowledgeItems schema

**Files:**
- Modify: `convex/schema.ts:2843-2911`

- [ ] **Step 1: Add qualifier and context fields**

In `convex/schema.ts`, inside the `knowledgeItems` table definition, add after the `sourceText` field (line 2877):

```typescript
    // Disambiguation for multi-instance fields (e.g., multiple interest rates)
    qualifier: v.optional(v.string()),   // e.g., "Senior Loan", "Phase 1", "Mezzanine"
    context: v.optional(v.string()),     // One-sentence explanation for doc generation
```

- [ ] **Step 2: Add composite indexes**

Append to the existing `.index()` chain on the `knowledgeItems` table (the last index is `.index("by_project_status", ...)` at line 2911). Add these BEFORE the closing `,` that ends the table definition — they chain onto the existing indexes:

```typescript
    .index("by_project_field_qualifier", ["projectId", "fieldPath", "qualifier"])
    .index("by_client_field_qualifier", ["clientId", "fieldPath", "qualifier"])
```

- [ ] **Step 3: Regenerate Convex types**

Run: `npx convex codegen`
Expected: Types regenerate successfully with new fields.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add qualifier and context fields to knowledgeItems schema"
```

---

### Task 2: Add qualifier and context to IntelligenceField type

**Files:**
- Modify: `src/v4/types.ts:203-258`

- [ ] **Step 1: Add fields to IntelligenceField interface**

In `src/v4/types.ts`, add to the `IntelligenceField` interface (after `pageReference` at line 257):

```typescript
  /** Disambiguator for multi-instance fields (e.g., "Senior Loan", "Phase 1") */
  qualifier?: string | null;
  /** One-sentence context explanation for LLM consumption during doc generation */
  context?: string;
```

- [ ] **Step 2: Align inline intelligenceFields type on DocumentClassification**

Replace the inline `intelligenceFields` type at lines 202-214 with a reference to the full interface:

```typescript
  /** Intelligence fields extracted from the document */
  intelligenceFields: IntelligenceField[];
```

This replaces the lightweight inline type with the full `IntelligenceField` interface that includes `isCanonical`, `scope`, `qualifier`, and `context`.

- [ ] **Step 3: Update the comment on IntelligenceField**

Change the comment at line 229 from:

```typescript
// INTELLIGENCE FIELD (from dedicated extraction call)
```

to:

```typescript
// INTELLIGENCE FIELD (extracted during classification call)
```

- [ ] **Step 4: Commit**

```bash
git add src/v4/types.ts
git commit -m "feat: add qualifier/context to IntelligenceField, align inline type"
```

---

### Task 3: Qualifier-aware supersession in knowledgeLibrary

**Files:**
- Modify: `convex/knowledgeLibrary.ts:1571-1668` (addKnowledgeItem)
- Modify: `convex/knowledgeLibrary.ts:1750-1865` (bulkAddKnowledgeItems)

- [ ] **Step 1: Add qualifier arg to addKnowledgeItem**

In `addKnowledgeItem` args (after `normalizationConfidence` at line 1602), add:

```typescript
    qualifier: v.optional(v.string()),
    context: v.optional(v.string()),
```

- [ ] **Step 2: Update addKnowledgeItem lookup to filter by qualifier**

Replace the existing lookup logic (lines 1609-1626) with qualifier-aware matching:

```typescript
    // Check if an active item with this field path AND qualifier already exists
    let existingItem = null;
    if (args.clientId) {
      const items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client_field", (q) =>
          q.eq("clientId", args.clientId).eq("fieldPath", args.fieldPath)
        )
        .collect();
      existingItem = items.find((i) =>
        i.status === "active" && (i.qualifier ?? null) === (args.qualifier ?? null)
      );
    } else if (args.projectId) {
      const items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project_field", (q) =>
          q.eq("projectId", args.projectId).eq("fieldPath", args.fieldPath)
        )
        .collect();
      existingItem = items.find((i) =>
        i.status === "active" && (i.qualifier ?? null) === (args.qualifier ?? null)
      );
    }
```

- [ ] **Step 3: Include qualifier and context in the insert**

In the `db.insert("knowledgeItems", {...})` call (lines 1637-1657), add after `normalizationConfidence`:

```typescript
      qualifier: args.qualifier,
      context: args.context,
```

- [ ] **Step 4: Add qualifier and context to bulkAddKnowledgeItems item schema**

In `bulkAddKnowledgeItems` args items array (after `normalizationConfidence` at line 1782), add:

```typescript
      qualifier: v.optional(v.string()),
      context: v.optional(v.string()),
```

- [ ] **Step 5: Update bulkAddKnowledgeItems lookup to filter by qualifier**

Replace the lookup logic (lines 1796-1813) with qualifier-aware matching (same pattern as Step 2, but using `item.qualifier` instead of `args.qualifier`):

```typescript
      // Check for existing active item with same field path AND qualifier
      let existingItem = null;
      if (args.clientId) {
        const items = await ctx.db
          .query("knowledgeItems")
          .withIndex("by_client_field", (q) =>
            q.eq("clientId", args.clientId).eq("fieldPath", item.fieldPath)
          )
          .collect();
        existingItem = items.find((i) =>
          i.status === "active" && (i.qualifier ?? null) === (item.qualifier ?? null)
        );
      } else if (args.projectId) {
        const items = await ctx.db
          .query("knowledgeItems")
          .withIndex("by_project_field", (q) =>
            q.eq("projectId", args.projectId).eq("fieldPath", item.fieldPath)
          )
          .collect();
        existingItem = items.find((i) =>
          i.status === "active" && (i.qualifier ?? null) === (item.qualifier ?? null)
        );
      }
```

- [ ] **Step 6: Include qualifier and context in bulkAddKnowledgeItems insert**

In the `db.insert("knowledgeItems", {...})` call (lines 1831-1851), add after `normalizationConfidence`:

```typescript
        qualifier: item.qualifier,
        context: item.context,
```

- [ ] **Step 7: Update resolveIntelligenceConflict to be qualifier-aware**

In `resolveIntelligenceConflict` (starts at line 1955), the function resolves conflicts between items with the same `fieldPath`. No changes needed to the resolution logic itself — the conflict records reference specific `knowledgeItem` IDs via `relatedItemIds`, so resolution already targets specific items. However, ensure that conflict _detection_ (wherever conflicts are created) will not flag same-fieldPath + different-qualifier items as conflicts. Search for where `intelligenceConflicts` records are inserted and add qualifier matching to those checks.

- [ ] **Step 8: Update applyDuplicateResolution to be qualifier-aware**

In `applyDuplicateResolution` (starts at line 2172), the function supersedes duplicate items based on `keepId` and `removeIds`. This operates on specific item IDs and is already qualifier-agnostic. No changes needed.

In `applyConsolidation` (starts at line 2269), same pattern — operates on specific IDs. However, the reclassification section (around line 2330) checks for existing active items with the new `fieldPath`. Update this check to also match on qualifier:

```typescript
      // When reclassifying, check for existing active items with same path AND qualifier
      existingItem = items.find((i) =>
        i.status === "active" && i._id !== reclassify.itemId &&
        (i.qualifier ?? null) === (reclassifiedItem?.qualifier ?? null)
      );
```

- [ ] **Step 9: Commit**

```bash
git add convex/knowledgeLibrary.ts
git commit -m "feat: qualifier-aware supersession in knowledge library mutations"
```

---

## Chunk 2: Skill Merge & Output Schema

### Task 4: Merge intelligence instructions into classification SKILL.md

**Files:**
- Modify: `src/v4/skills/document-classify/SKILL.md`
- Reference (read-only): `src/v4/skills/intelligence-extract/SKILL.md`

- [ ] **Step 1: Replace the lightweight Intelligence Extraction section**

In `document-classify/SKILL.md`, replace lines 67-79 (the current `## Intelligence Extraction` section) with the full extraction instructions. The new section should include:

1. **Extraction ordering note** — intelligence extraction happens FIRST before classification:

```markdown
## Intelligence Extraction (Step 1 — Do This First)

Before classifying, extract ALL structured intelligence fields from the document. This serves as your detailed reading of the document and directly informs your classification, summary, and filing decisions.

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
```

2. **Field Path Mapping** — copy the full canonical paths section from `intelligence-extract/SKILL.md` lines 35-143 (project-level paths: financials, overview, location, timeline, legal, insurance, planning, valuation, risk, conditions, parties; client-level paths: company, contact; custom paths).

3. **Qualifier Rules**:

```markdown
### Qualifier Rules

When a document contains **multiple values for the same data type**, you MUST provide a `qualifier` that distinguishes them. Also use qualifiers when a value applies to a specific tranche, phase, building, unit type, or time period — even if it's the only instance.

Common qualifier patterns:
- Loan tranches: "Senior", "Mezzanine", "Tranche A", "Tranche B"
- Project phases: "Phase 1", "Phase 2"
- Time periods: "Day 1", "Post-PC", "Year 1"
- Asset types: "Residential", "Commercial", "Retail"
- Valuation bases: "Market Value", "Reinstatement", "90-Day"
- Buildings: "Block A", "Block B", "Tower", "Podium"

Qualifier should be short (2-5 words), consistent, and describe WHAT the value applies to. Set to null when the value is unambiguous (e.g., single site address).
```

4. **Context Rules**:

```markdown
### Context Rules

Every extracted field MUST have a `context` string — a one-sentence explanation of what this value means in the deal. This is for LLM consumption during document generation.

Examples:
- "Senior secured development facility interest rate, fixed for 18 months from first drawdown"
- "GDV for the completed 24-unit residential scheme as stated in the RICS Red Book valuation"
- "Company registration number for the SPV borrower entity"
```

5. **Confidence Scoring** — copy the document authority + value clarity framework from `intelligence-extract/SKILL.md` lines 145-171.

6. **Value Type Guidelines** — copy from `intelligence-extract/SKILL.md` lines 284-291.

7. **Scope Assignment** — copy from `intelligence-extract/SKILL.md` lines 186-188.

8. **Template Tagging** — copy the tag taxonomy and tagging rules from `intelligence-extract/SKILL.md` lines 192-228.

9. **UK Property Finance Domain Knowledge** — copy from `intelligence-extract/SKILL.md` lines 315-364 (currency conventions, abbreviations, legal conventions, valuation specifics, document cross-references).

10. **Self-Review for extraction** — copy from `intelligence-extract/SKILL.md` lines 293-313.

- [ ] **Step 2: Update the Classification Process section**

Replace the current `## Classification Process` section (lines 32-39) to reflect the new ordering:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add src/v4/skills/document-classify/SKILL.md
git commit -m "feat: merge intelligence extraction into classification skill"
```

---

### Task 5: Update output schema in anthropic-client.ts

**Files:**
- Modify: `src/v4/lib/anthropic-client.ts:243-280` (output schema in buildBatchUserMessage)
- Modify: `src/v4/lib/anthropic-client.ts` — `normalizeClassification()` (around line 450, where `intelligenceFields` is mapped)

- [ ] **Step 1: Update the JSON output schema example**

Replace the `intelligenceFields` example in `buildBatchUserMessage()` (line 273-274) with the full field set:

```typescript
    "intelligenceFields": [
      {
        "fieldPath": "financials.propertyValue",
        "label": "Property Value",
        "value": "2500000",
        "valueType": "currency",
        "confidence": 0.9,
        "sourceText": "Market value: £2,500,000",
        "isCanonical": true,
        "scope": "project",
        "templateTags": ["general", "lenders_note", "valuation_summary"],
        "category": "financials",
        "originalLabel": "Market Value",
        "pageReference": "p.8",
        "qualifier": null,
        "context": "Current market value of the completed development as assessed by RICS Red Book valuation"
      }
    ]
```

- [ ] **Step 2: Update parseClassificationResponse to handle full intelligence fields**

In `normalizeClassification()` (around line 450 in `anthropic-client.ts`), find where `intelligenceFields` is mapped from parsed JSON (currently a simple passthrough like `intelligenceFields: Array.isArray(raw.intelligenceFields) ? raw.intelligenceFields : []`). Replace with a per-field mapper that adds defaults for all fields including the new ones:

```typescript
intelligenceFields: (doc.intelligenceFields || []).map((f: any) => ({
  fieldPath: f.fieldPath || '',
  label: f.label || '',
  value: f.value || '',
  valueType: f.valueType || 'text',
  confidence: f.confidence || 0,
  sourceText: f.sourceText || '',
  isCanonical: f.isCanonical ?? false,
  scope: f.scope || 'project',
  templateTags: f.templateTags || ['general'],
  category: f.category || f.fieldPath?.split('.')[0] || 'custom',
  originalLabel: f.originalLabel || f.label || '',
  pageReference: f.pageReference,
  qualifier: f.qualifier ?? null,
  context: f.context || '',
})),
```

- [ ] **Step 3: Commit**

```bash
git add src/v4/lib/anthropic-client.ts
git commit -m "feat: update output schema for full intelligence fields"
```

---

## Chunk 3: Pipeline Cleanup & PDF Fix

### Task 6: Remove Stage 5.5 and intelligence functions

**Files:**
- Modify: `src/v4/lib/pipeline.ts:38,292-394,429-433`
- Modify: `src/v4/lib/anthropic-client.ts:460-710` (approximate — intelligence functions)

- [ ] **Step 1: Remove Stage 5.5 from pipeline.ts**

Delete the entire Stage 5.5 block in `pipeline.ts` (lines 292-394):

```
  // STAGE 5.5: BATCH INTELLIGENCE EXTRACTION (dedicated second call)
  ...through to...
  } else if (isMock) {
    console.log(`\n[STAGE 5.5] Skipping intelligence extraction (mock mode)`);
  }
```

- [ ] **Step 2: Update pipeline result assembly**

In the result object (line 429-446), replace:

```typescript
    intelligence: allIntelligence,
```

with intelligence sourced from the classification response's `intelligenceFields`:

```typescript
    intelligence: Object.fromEntries(
      allClassifications.map(cls => [
        cls.documentIndex,
        cls.intelligenceFields || [],
      ])
    ),
```

Also remove the `allIntelligence` variable declaration that was at line 295.

- [ ] **Step 3: Remove intelligence imports from pipeline.ts**

Update the import from `anthropic-client` (line 38):

```typescript
import { buildSystemPrompt, buildBatchUserMessage, callAnthropicBatch, type SystemPromptBlocks } from './anthropic-client';
```

Remove `callAnthropicIntelligence`, `callAnthropicIntelligenceBatch` from the import.

Also remove the `chunkIntelligenceBatch` import from `document-preprocessor` (line 37) if it's no longer used elsewhere.

- [ ] **Step 4: Remove intelligence functions from anthropic-client.ts**

Delete these functions from `anthropic-client.ts`:
- `callAnthropicIntelligence()` (starts at line 465)
- `parseIntelligenceResponse()` (starts at line 557)
- `callAnthropicIntelligenceBatch()` (starts at line 617)

Also remove their exports if they appear in any export statements.

- [ ] **Step 5: Update pipeline architecture comment**

Update the comment at the top of `pipeline.ts` (lines 6-13) to reflect the merged pipeline:

```typescript
// Architecture (7 stages):
// 1. Pre-process documents (truncation, hints, tag generation) — no LLM
// 2. Load references from shared library (cached, 1-hour TTL)
// 3. Select relevant references based on batch document hints
// 4. Load skill instructions (SKILL.md) — includes intelligence extraction
// 5. Chunk batch & call API for classification + intelligence extraction (single call)
// 6. Apply deterministic placement rules (post-processing)
// 7. Assemble and return structured results
```

- [ ] **Step 6: Commit**

```bash
git add src/v4/lib/pipeline.ts src/v4/lib/anthropic-client.ts
git commit -m "feat: remove Stage 5.5, intelligence now extracted in classification call"
```

---

### Task 7: Update API route to use per-doc intelligence fields

**Files:**
- Modify: `src/app/api/v4-analyze/route.ts:218-219`

- [ ] **Step 1: Update intelligence field source**

In `route.ts`, the current line 218-219 pulls intelligence from a separate result:

```typescript
        // Intelligence fields from dedicated extraction call
        intelligenceFields: result.intelligence[doc.documentIndex] || [],
```

Update the comment (the code can stay the same since the pipeline result still has an `intelligence` key, just sourced differently now):

```typescript
        // Intelligence fields (extracted during classification call)
        intelligenceFields: result.intelligence[doc.documentIndex] || [],
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/v4-analyze/route.ts
git commit -m "fix: update intelligence field comment to reflect merged pipeline"
```

---

### Task 8: PDF magic byte validation

**Files:**
- Modify: `src/v4/lib/document-preprocessor.ts:191-218`

- [ ] **Step 1: Add PDF header validation**

In `preprocessPdf()`, after `const buffer = await file.arrayBuffer();` (line 202), add validation before base64 encoding:

```typescript
    const buffer = await file.arrayBuffer();

    // Validate PDF magic bytes — reject non-PDF files misreported by the browser
    if (buffer.byteLength < 5) {
      console.warn('[PREPROCESS] File too small to be a valid PDF, falling back to text');
      return { type: 'text', text: '[File too small to be a valid PDF]' };
    }
    const headerBytes = new Uint8Array(buffer, 0, 5);
    const headerText = String.fromCharCode(...headerBytes);
    if (!headerText.startsWith('%PDF')) {
      console.warn(`[PREPROCESS] File does not have PDF header (got: "${headerText.slice(0, 4)}"), falling back to text`);
      return { type: 'text', text: '[File does not have a valid PDF header — may be a misidentified image or document]' };
    }

    const base64 = Buffer.from(buffer).toString('base64');
```

- [ ] **Step 2: Commit**

```bash
git add src/v4/lib/document-preprocessor.ts
git commit -m "fix: validate PDF magic bytes before sending to Anthropic API"
```

---

### Task 9: Delete intelligence-extract SKILL.md

**Files:**
- Delete: `src/v4/skills/intelligence-extract/SKILL.md`

- [ ] **Step 1: Remove the now-merged skill file**

```bash
rm src/v4/skills/intelligence-extract/SKILL.md
rmdir src/v4/skills/intelligence-extract 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git add -A src/v4/skills/intelligence-extract/
git commit -m "chore: remove intelligence-extract skill (merged into document-classify)"
```

---

### Task 10: Build verification and push

- [ ] **Step 1: Run Convex codegen**

Run: `npx convex codegen`
Expected: Success, types regenerated with qualifier/context fields.

- [ ] **Step 2: Run Next.js build**

Run: `npx next build`
Expected: Build succeeds with no type errors. Fix any errors that arise.

- [ ] **Step 3: Commit any build fixes**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: resolve build errors from merged intelligence pipeline"
```

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```
