# Deep Extraction — Design Spec

**Date:** 2026-03-16
**Status:** Approved
**Approach:** New API route reusing V4 pipeline internals (Approach 1)

## Problem

The standard V4 pipeline caps extracted text at 50K characters to balance cost and speed during bulk uploads. Most documents fit within this limit, but dense PDFs (valuations, facility letters, legal reports) can be 100K-300K+ characters. The truncated text produces good-enough classification but misses intelligence fields buried deep in the document body — conditions precedent in schedules, valuation comparables in appendices, financial covenants on page 15.

Post-migration, document volume has dropped from 3,000+ bulk to dozens per week. The economics now favor richer per-document analysis over throughput optimization.

## Solution

An opt-in "Deep Extraction" feature that re-analyzes a document using its full extracted text (up to 400K chars / ~100K tokens), producing richer summaries, more intelligence fields, and higher-confidence classifications — all within the existing V4 schema.

## Design Decisions

- **Additive, not modified**: The existing V4 pipeline is completely untouched. Deep extraction is a separate API route that reuses the same internals.
- **Same schema**: Output is identical `DocumentClassification` — no new fields for data. Results overwrite the standard analysis in place.
- **Same system prompt**: Reuses the exact cached system prompt (skill instructions + references) from the initial upload, getting prompt cache hits at 10% cost when within the 1-hour cache TTL window. Cold calls pay full price for the system prompt (~18K tokens).
- **Single new schema field**: `deepExtractionStatus` on `bulkUploadItems` tracks the state.

## Architecture

### 1. API Route: `POST /api/v4-deep-extract`

**Request body:**
```typescript
{
  itemId: string;       // Convex bulkUploadItem ID
  batchId: string;      // Parent batch ID (for context: client, folders, checklist)
}
```

**Flow:**
1. Fetch `bulkUploadItem` from Convex → get `fileStorageId`, `fileName`, `fileSize`, `mediaType`, `textContent`
2. Fetch batch context from Convex → get `clientId`, `projectId`, folders, checklist items, corrections
3. **Get full text**: Use stored `textContent` from the item if available (this is the full pre-truncation text from the initial upload). Only re-extract from `fileStorageId` as fallback if `textContent` is empty/missing.
4. Apply 400K char hard cap (safety valve for massive spreadsheets). If text exceeds 400K, use 75/25 head/tail truncation — same strategy as standard, just 8x the limit.
5. **Construct a `BatchDocument` manually** — bypass `preprocessDocument()` entirely (which applies the 50K cap). Build the object directly:
   ```typescript
   const batchDoc: BatchDocument = {
     index: 0,
     fileName: item.fileName,
     fileSize: item.fileSize,
     mediaType: item.mediaType || 'application/pdf',
     processedContent: { type: 'text', text: fullText },
     hints: analyzeFilename(item.fileName, fullText),
   };
   ```
   This is the core mechanism that differentiates deep extraction — same `BatchDocument` shape, but with uncapped text in `processedContent`.
6. Build system prompt via `buildSystemPrompt()` — identical to standard V4, hits existing prompt cache
7. Build user message via `buildBatchUserMessage()` for the single document
8. Call `callAnthropicBatch()` with same config (Haiku 4.5, temp 0.1, 16K max output tokens)
9. Parse response via existing `parseClassificationResponse()`
10. Apply placement rules via `resolvePlacement()` to ensure folder/category consistency
11. Map results to Convex shape via the same field mapping used by the V4 route
12. Write enriched results back to Convex via existing `updateItemAnalysis` mutation
13. Set `deepExtractionStatus: 'complete'` on the item

**Error handling:**
- No `fileStorageId` AND no `textContent` → return 400 "No document content available for deep extraction"
- Item has `userEdits` with truthy flags → return 400 "Document has user corrections. Deep extraction would overwrite them. Clear edits first or confirm override." (Frontend shows this in the confirmation modal.)
- API failure → 3 retries (429/5xx), then set `deepExtractionStatus: 'error'` and return 500
- Timeout → reuse existing 120s `maxDuration`

**Reused V4 internals (no changes to these):**
- `buildSystemPrompt()` from `src/v4/lib/anthropic-client.ts`
- `buildBatchUserMessage()` from `src/v4/lib/anthropic-client.ts`
- `callAnthropicBatch()` from `src/v4/lib/anthropic-client.ts`
- `analyzeFilename()` from `src/v4/lib/document-preprocessor.ts`
- `loadSkill('document-classify')` from `src/v4/lib/skill-loader.ts`
- `loadReferences()` / `selectRelevantReferences()` from `src/v4/lib/reference-library.ts`
- `resolvePlacement()` from `src/v4/lib/pipeline.ts` (Stage 6 placement rules)
- Server-side text extraction logic from `src/app/api/v4-analyze/route.ts` (fallback only)
- Field mapping from `DocumentClassification` → Convex mutation args (same pattern as V4 route)

### 2. Convex Schema Change

**`bulkUploadItems` table — one new field:**
```typescript
deepExtractionStatus: v.optional(
  v.union(
    v.literal("processing"),
    v.literal("complete"),
    v.literal("error")
  )
)
// undefined = never run (default for all existing items)
```

`undefined` means deep extraction has never been triggered. No `"none"` literal — simpler queries with just `deepExtractionStatus !== undefined`.

**No new tables. No changes to existing fields.** The enriched results overwrite the same fields the standard V4 populates: `summary`, `fileTypeDetected`, `category`, `confidence`, `extractedIntelligence`, `documentAnalysis`, `classificationReasoning`.

**New mutation: `setDeepExtractionStatus`**
- Sets `deepExtractionStatus` on a single item
- Called by the API route at start (`processing`) and end (`complete` or `error`)

**Existing mutation reuse:** `updateItemAnalysis` already accepts all the data fields — no changes needed.

### 3. Frontend: BulkReviewTable Changes

**Replace deprecated extraction toggle column** with deep extraction action:

| `deepExtractionStatus` | UI |
|---|---|
| `undefined` | Small icon button (magnifying glass or layers) — clickable |
| `"processing"` | Spinner replacing the button |
| `"complete"` | "Deep" pill/badge indicator |
| `"error"` | Red indicator, clickable to retry |

**Click flow:**
1. User clicks deep extraction button on a row
2. If item has `userEdits` with truthy flags, modal warns: "This document has manual corrections that will be overwritten. Continue?"
3. Otherwise, confirmation modal: "Run deep extraction on [filename]? This will re-analyze the full document for richer intelligence and summaries."
4. User confirms → frontend fires a fetch to `/api/v4-deep-extract` (fire-and-forget pattern)
5. Status tracked via reactive Convex subscription on the `bulkUploadItem` — UI updates automatically as `deepExtractionStatus` changes from `processing` → `complete`/`error`
6. On completion, enriched data appears in existing Summary/Analysis/Intelligence tabs

**Multi-select support:**
- Select multiple items via checkboxes → bulk action "Deep Extract Selected"
- Frontend fires one fetch per item sequentially (fire-and-forget, each returns quickly after setting status to `processing`)
- Each item's status updates independently via Convex subscriptions as it completes
- No browser timeout risk — the long-running work happens server-side

**No new tabs or views** — enriched data overwrites the existing data in the same UI panels.

### 4. Deep Extraction Limits

| Parameter | Value | Rationale |
|---|---|---|
| Text cap | 400,000 chars | ~100K tokens. With ~18K system prompt + ~16K max output = ~134K total, within Haiku 4.5's 200K context window |
| Truncation strategy | 75% head / 25% tail (only if >400K) | Same pattern as standard, just higher cap |
| Max output tokens | 16,384 | Same as standard — sufficient for single-doc rich output |
| Max duration | 120 seconds | Same as standard — Haiku is fast even at 100K input tokens |
| Retry attempts | 3 (429/5xx) | Same as standard |
| Model | Haiku 4.5 | Same as standard — no model upgrade needed |

### 5. Cost Estimate

| Document size | Input tokens | Estimated cost (cached) | Estimated cost (cold) |
|---|---|---|---|
| 50K chars (standard) | ~12.5K | ~$0.001 | ~$0.01 |
| 100K chars | ~25K | ~$0.002 | ~$0.02 |
| 200K chars | ~50K | ~$0.005 | ~$0.04 |
| 400K chars (max) | ~100K | ~$0.01 | ~$0.08 |

Plus output tokens (~2-4K at $4/MTok = ~$0.01-0.02). Total per deep extraction: **~$0.01-0.10** depending on document size and cache state. Cache hits are only guaranteed within the 1-hour TTL window of a previous V4 call for the same client/project context.

## What This Does NOT Change

- The existing V4 pipeline (`/api/v4-analyze`) — completely untouched
- The `DocumentClassification` schema — same fields, same types
- The `bulkQueueProcessor.ts` — standard upload flow unchanged
- The reference library or SKILL.md — same prompts
- The prompt caching strategy — reused as-is

## Future: Modeling Pipeline Auto-Chunking (Reference)

Not built in this spec, but documented as the next evolution for the modeling section:

- **Pattern**: For documents exceeding the context window (~400K+ chars, primarily massive XLSX files with 500K-900K+ chars across 20+ sheets), split into chunks of ~400K chars each
- **Per-chunk call**: Same cached system prompt, each chunk gets its own API call
- **Chunk strategy**: Sheet-by-sheet for spreadsheets (2-3 sheets per call), section-by-section for very long documents
- **Merge strategy**: Combine intelligence fields across chunks — deduplicate by `fieldPath + qualifier`, keep highest confidence for conflicts, union `templateTags`
- **Summary merge**: Final call takes per-chunk summaries as input and produces a unified executive summary
- **Cost model**: User-acknowledged — these calls will be expensive ($0.50-2.00 per massive document) but replace hours of manual analysis

This chunking pattern will be specified separately when the modeling pipeline work begins.
