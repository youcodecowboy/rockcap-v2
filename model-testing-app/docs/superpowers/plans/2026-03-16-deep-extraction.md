# Deep Extraction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in deep extraction that re-analyzes documents with full uncapped text (up to 400K chars) for richer intelligence and summaries.

**Architecture:** New API route `/api/v4-deep-extract` reuses all existing V4 pipeline internals (same system prompt, same Anthropic client, same response parser) but bypasses the 50K-char text truncation. Results overwrite existing fields in the same schema — no new data fields. One new status field `deepExtractionStatus` tracks progress.

**Tech Stack:** Next.js API route, Convex mutations/schema, existing V4 pipeline (`callAnthropicBatch`, `buildSystemPrompt`, `buildBatchUserMessage`), React frontend (BulkReviewTable)

**Spec:** `docs/superpowers/specs/2026-03-16-deep-extraction-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `convex/schema.ts` | Modify (~line 907) | Add `deepExtractionStatus` field to `bulkUploadItems` |
| `convex/bulkUpload.ts` | Modify (~line 832) | Add `getItem` query + `setDeepExtractionStatus` mutation |
| `src/app/api/v4-deep-extract/route.ts` | Create | New route: fetch item, load full text, call V4 internals, write results |
| `src/components/BulkReviewTable.tsx` | Modify | Replace extraction toggle with deep extraction button/status/modal |

**Reused V4 internals (read-only reference — do NOT modify):**
- `src/v4/lib/anthropic-client.ts` — `buildSystemPrompt()`, `buildBatchUserMessage()`, `callAnthropicBatch()`
- `src/v4/lib/skill-loader.ts` — `loadSkill('document-classify')` (line 64)
- `src/v4/lib/placement-rules.ts` — `resolvePlacement()` (line 155)
- `src/v4/lib/result-mapper.ts` — `mapClassificationToConvex()` (line 133) — maps `DocumentClassification` → Convex-ready `MappedDocumentResult`
- `src/v4/lib/document-preprocessor.ts` — `analyzeFilename()` (line 140)
- `src/lib/references/` — `getAllReferences()`, `formatForPrompt()` — shared reference library
- `src/v4/lib/reference-library.ts` — `loadReferencesWithMeta()` — loads user-created Convex references

---

## Chunk 1: Backend — Schema, Queries, Mutations

### Task 1: Add `deepExtractionStatus` to Convex Schema

**Files:**
- Modify: `convex/schema.ts:907` (after `extractionEnabled` field)

- [ ] **Step 1: Add the field to `bulkUploadItems` table**

In `convex/schema.ts`, after line 907 (`extractionEnabled: v.optional(v.boolean())`), add:

```typescript
  deepExtractionStatus: v.optional(
    v.union(
      v.literal("processing"),
      v.literal("complete"),
      v.literal("error")
    )
  ),
```

- [ ] **Step 2: Run Convex codegen to verify schema compiles**

Run: `npx convex codegen`
Expected: Success, no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add deepExtractionStatus field to bulkUploadItems schema"
```

### Task 2: Add Convex Query and Mutation

**Files:**
- Modify: `convex/bulkUpload.ts` (after `toggleExtraction` mutation at ~line 832)

- [ ] **Step 1: Add `getItem` query**

Add a query to fetch a single bulkUploadItem by ID (needed by the API route):

```typescript
export const getItem = query({
  args: { itemId: v.id("bulkUploadItems") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.itemId);
  },
});
```

- [ ] **Step 2: Add `setDeepExtractionStatus` mutation**

```typescript
export const setDeepExtractionStatus = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    status: v.union(
      v.literal("processing"),
      v.literal("complete"),
      v.literal("error")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      deepExtractionStatus: args.status,
      updatedAt: new Date().toISOString(),
    });
    return args.itemId;
  },
});
```

- [ ] **Step 3: Run Convex codegen**

Run: `npx convex codegen`
Expected: Success — new query and mutation available.

- [ ] **Step 4: Commit**

```bash
git add convex/bulkUpload.ts
git commit -m "feat: add getItem query and setDeepExtractionStatus mutation"
```

---

## Chunk 2: Backend — API Route

### Task 3: Create Deep Extraction API Route

**Files:**
- Create: `src/app/api/v4-deep-extract/route.ts`

This is the core of the feature. It reuses existing V4 internals with uncapped text.

- [ ] **Step 1: Create the route file**

Create `src/app/api/v4-deep-extract/route.ts` with the following structure:

**Imports:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { buildSystemPrompt, buildBatchUserMessage, callAnthropicBatch } from '@/v4/lib/anthropic-client';
import { loadSkill } from '@/v4/lib/skill-loader';
import { resolvePlacement } from '@/v4/lib/placement-rules';
import { mapClassificationToConvex } from '@/v4/lib/result-mapper';
import { analyzeFilename } from '@/v4/lib/document-preprocessor';
import { loadReferencesWithMeta } from '@/v4/lib/reference-library';
import { getAllReferences, formatForPrompt } from '@/lib/references';
import { DEFAULT_V4_CONFIG } from '@/v4/types';
import type { BatchDocument, ClientContext, FolderInfo, ChecklistItem, CorrectionContext } from '@/v4/types';
```

**Constants:**
```typescript
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const DEEP_EXTRACT_MAX_CHARS = 400_000;
```

**Route handler flow (POST function):**

1. Parse request body `{ itemId, batchId }`
2. Set up Convex client: `const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)`
3. **Fetch item** via `convex.query(api.bulkUpload.getItem, { itemId })`
4. **Fetch batch** via `convex.query(api.bulkUpload.getBatch, { batchId })` — this gives `clientId`, `projectId`, etc.
5. **Check userEdits**: If `item.userEdits?.fileTypeDetected || item.userEdits?.category || item.userEdits?.targetFolder`, return 400 with message about user corrections
6. **Set status**: `convex.mutation(api.bulkUpload.setDeepExtractionStatus, { itemId, status: 'processing' })`
7. **Get full text**: Use `item.textContent` if available. If not, fetch from `item.fileStorageId` and extract (follow the pattern in `v4-analyze/route.ts` lines 50-80 for fetching from storage URL). If neither available, return 400.
8. **Apply 400K char cap**:
   ```typescript
   let text = fullText;
   if (text.length > DEEP_EXTRACT_MAX_CHARS) {
     const headLen = Math.floor(DEEP_EXTRACT_MAX_CHARS * 0.75);
     const tailLen = DEEP_EXTRACT_MAX_CHARS - headLen;
     text = `${text.slice(0, headLen)}\n\n[... ${text.length - DEEP_EXTRACT_MAX_CHARS} characters truncated ...]\n\n${text.slice(-tailLen)}`;
   }
   ```
9. **Construct BatchDocument manually** (bypasses `preprocessDocument` and its 50K cap):
   ```typescript
   const batchDoc: BatchDocument = {
     index: 0,
     fileName: item.fileName,
     fileSize: item.fileSize || 0,
     mediaType: item.fileType || 'application/pdf',
     processedContent: { type: 'text', text },
     hints: analyzeFilename(item.fileName, text),
   };
   ```
10. **Load references** — CRITICAL: match the exact pipeline pattern from `pipeline.ts` lines 140-178 to ensure prompt cache compatibility:
    ```typescript
    // Load ALL system references (same as pipeline — enables prompt cache hits)
    const allRefs = getAllReferences();
    let referencePromptText = formatForPrompt(allRefs, 'classification');

    // Merge user-created Convex references (same as pipeline)
    const config = { ...DEFAULT_V4_CONFIG, anthropicApiKey: process.env.ANTHROPIC_API_KEY! };
    if (process.env.NEXT_PUBLIC_CONVEX_URL) {
      const userRefResult = await loadReferencesWithMeta(convex, config.referenceCacheTtlMs);
      const systemFileTypes = new Set(allRefs.map(r => r.fileType.toLowerCase()));
      const extraUserRefs = userRefResult.references.filter(
        r => r.source === 'user' && !systemFileTypes.has(r.fileType.toLowerCase())
      );
      if (extraUserRefs.length > 0) {
        referencePromptText += '\n\n## Additional User-Defined References\n';
        referencePromptText += extraUserRefs.map(ref =>
          `### ${ref.fileType} (${ref.category})\nTags: ${ref.tags.join(', ')}\nKeywords: ${ref.keywords.join(', ')}\n${ref.content}`
        ).join('\n\n');
      }
    }
    ```
11. **Load skill instructions**: `const skill = loadSkill('document-classify');`
12. **Build system prompt**: `const systemPrompt = buildSystemPrompt(skill.instructions, referencePromptText, availableFolders);`
    - `availableFolders`: Fetch from batch context. The batch's metadata should include available folders, or fetch them from the client/project context via Convex. Follow the same pattern as the V4 route's metadata parsing.
13. **Build ClientContext**:
    ```typescript
    const clientContext: ClientContext = {
      clientId: batch.clientId,
      projectId: batch.projectId,
      clientName: batch.clientName || undefined,
    };
    ```
14. **Build user message**: `const userBlocks = buildBatchUserMessage([batchDoc], checklistItems, clientContext, corrections, undefined);`
    - `checklistItems`: Fetch from Convex if available in batch metadata, otherwise pass `[]`
    - `corrections`: Fetch from Convex if available, otherwise pass `[]`
15. **Call Anthropic**: `const result = await callAnthropicBatch(systemPrompt, userBlocks, config);`
16. **Apply placement**: `const placement = resolvePlacement(result.classifications[0], clientContext);`
17. **Map to Convex format**: `const mapped = mapClassificationToConvex(result.classifications[0], placement, { projectShortcode: batch.projectShortcode, clientName: batch.clientName, isInternal: batch.isInternal });`
18. **Sanitize intelligence fields**: Use the same `sanitizeIntelligenceFields` pattern from `bulkQueueProcessor.ts` lines 55-73 — normalize `valueType` to valid schema values.
19. **Write results to Convex** via `convex.mutation(api.bulkUpload.updateItemAnalysis, { ... })` using the mapped fields:
    - `summary`: `mapped.itemAnalysis.summary`
    - `fileTypeDetected`: `mapped.itemAnalysis.fileTypeDetected`
    - `category`: `mapped.itemAnalysis.category`
    - `targetFolder`: `mapped.itemAnalysis.targetFolder`
    - `confidence`: `mapped.itemAnalysis.confidence`
    - `generatedDocumentCode`: `mapped.itemAnalysis.generatedDocumentCode`
    - `version`: `mapped.itemAnalysis.version`
    - `classificationReasoning`: `mapped.classificationReasoning`
    - `documentAnalysis`: `mapped.documentAnalysis`
    - `extractedIntelligence`: `{ fields: result.classifications[0].intelligenceFields }`
    - `suggestedChecklistItems`: `mapped.checklistMatches`
    - `textContent`: preserve the original `item.textContent` (don't overwrite with truncated version)
20. **Set status complete**: `convex.mutation(api.bulkUpload.setDeepExtractionStatus, { itemId, status: 'complete' })`
21. **Return response** with usage stats:
    ```typescript
    return NextResponse.json({
      success: true,
      usage: result.usage,
      latencyMs: result.latencyMs,
      textLength: text.length,
      intelligenceFieldCount: result.classifications[0]?.intelligenceFields?.length || 0,
    });
    ```

**Error handling — wrap entire handler in try/catch:**
```typescript
catch (error) {
  console.error('[DEEP-EXTRACT] Error:', error);
  // Always try to set error status
  try {
    await convex.mutation(api.bulkUpload.setDeepExtractionStatus, { itemId, status: 'error' });
  } catch {}
  return NextResponse.json({ error: (error as Error).message }, { status: 500 });
}
```

- [ ] **Step 2: Verify the route compiles**

Run: `npx next build`
Expected: Build passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v4-deep-extract/route.ts
git commit -m "feat: add /api/v4-deep-extract route for uncapped document re-analysis"
```

---

## Chunk 3: Frontend — BulkReviewTable UI

### Task 4: Replace Extraction Toggle with Deep Extraction UI

**Files:**
- Modify: `src/components/BulkReviewTable.tsx`
  - Lines 732 (extraction stats), 841–848 (toggle handler), 951–963 (stats badge), 1639–1662 (toggle column rendering)

- [ ] **Step 1: Add deep extraction handler and state**

Near the existing `handleToggleExtraction` function (~line 841), add:

```typescript
// Deep extraction state
const [deepExtractConfirm, setDeepExtractConfirm] = useState<{
  itemId: Id<"bulkUploadItems">;
  fileName: string;
  hasUserEdits: boolean;
} | null>(null);

const handleDeepExtraction = async (itemId: Id<"bulkUploadItems">) => {
  try {
    // Fire-and-forget — status tracked via Convex subscription
    const response = await fetch('/api/v4-deep-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, batchId }),
    });
    if (!response.ok) {
      const error = await response.json();
      console.error('Deep extraction failed:', error);
    }
  } catch (error) {
    console.error('Deep extraction request failed:', error);
  }
};

// Bulk deep extraction — sequential fire-and-forget
const handleBulkDeepExtraction = async (itemIds: Id<"bulkUploadItems">[]) => {
  for (const id of itemIds) {
    await handleDeepExtraction(id);
  }
};
```

- [ ] **Step 2: Replace extraction toggle column rendering**

Find the extraction toggle UI (~lines 1639–1662). Replace the `Switch`/`Badge` rendering with:

```tsx
{/* Deep Extraction Status */}
{item.deepExtractionStatus === 'processing' ? (
  <Tooltip>
    <TooltipTrigger>
      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    </TooltipTrigger>
    <TooltipContent>
      <p className="text-xs">Deep extraction in progress...</p>
    </TooltipContent>
  </Tooltip>
) : item.deepExtractionStatus === 'complete' ? (
  <Tooltip>
    <TooltipTrigger>
      <Badge variant="secondary" className="text-[9px] h-5 px-1 bg-emerald-100 text-emerald-700">
        Deep
      </Badge>
    </TooltipTrigger>
    <TooltipContent>
      <p className="text-xs">Deep extraction complete — enriched intelligence</p>
    </TooltipContent>
  </Tooltip>
) : item.deepExtractionStatus === 'error' ? (
  <Tooltip>
    <TooltipTrigger>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
        onClick={() => setDeepExtractConfirm({ itemId: item._id, fileName: item.fileName, hasUserEdits: false })}>
        <AlertCircle className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent><p className="text-xs">Deep extraction failed — click to retry</p></TooltipContent>
  </Tooltip>
) : item.status === 'ready_for_review' ? (
  <Tooltip>
    <TooltipTrigger>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => setDeepExtractConfirm({
          itemId: item._id, fileName: item.fileName,
          hasUserEdits: !!(item.userEdits?.fileTypeDetected || item.userEdits?.category || item.userEdits?.targetFolder),
        })}>
        <Layers className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent><p className="text-xs">Run deep extraction for richer intelligence</p></TooltipContent>
  </Tooltip>
) : null}
```

Ensure `Loader2`, `Layers`, `AlertCircle` are imported from `lucide-react`.

- [ ] **Step 3: Add confirmation modal**

Add near other modals in the component's JSX:

```tsx
{deepExtractConfirm && (
  <Dialog open={!!deepExtractConfirm} onOpenChange={() => setDeepExtractConfirm(null)}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Run Deep Extraction</DialogTitle>
        <DialogDescription>
          {deepExtractConfirm.hasUserEdits ? (
            <><span className="text-amber-600 font-medium">Warning:</span> This document has manual corrections that will be overwritten by deep extraction results.</>
          ) : (
            <>Re-analyze <span className="font-medium">{deepExtractConfirm.fileName}</span> with the full document text for richer intelligence and summaries.</>
          )}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => setDeepExtractConfirm(null)}>Cancel</Button>
        <Button onClick={() => { handleDeepExtraction(deepExtractConfirm.itemId); setDeepExtractConfirm(null); }}>
          {deepExtractConfirm.hasUserEdits ? 'Override & Extract' : 'Run Deep Extraction'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)}
```

Ensure Dialog components are imported from the UI library.

- [ ] **Step 4: Add bulk action for multi-select**

Find the bulk actions area (where "File Selected", "Discard Selected" etc. buttons are). Add a "Deep Extract Selected" button:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    const selectedItemIds = selectedItems
      .filter(i => i.status === 'ready_for_review' && !i.deepExtractionStatus)
      .map(i => i._id);
    if (selectedItemIds.length > 0) {
      handleBulkDeepExtraction(selectedItemIds);
    }
  }}
  disabled={!selectedItems.some(i => i.status === 'ready_for_review' && !i.deepExtractionStatus)}
>
  <Layers className="h-4 w-4 mr-1" />
  Deep Extract Selected
</Button>
```

- [ ] **Step 5: Update extraction stats badge**

Find the stats section (~lines 951–963). Replace old extraction count with:

```tsx
const deepExtractionComplete = items.filter(i => i.deepExtractionStatus === 'complete').length;
const deepExtractionProcessing = items.filter(i => i.deepExtractionStatus === 'processing').length;
```

Replace the old extraction badge:
```tsx
{(deepExtractionComplete > 0 || deepExtractionProcessing > 0) && (
  <Badge variant="outline" className="text-xs">
    {deepExtractionProcessing > 0
      ? `${deepExtractionProcessing} extracting...`
      : `${deepExtractionComplete} deep extracted`}
  </Badge>
)}
```

- [ ] **Step 6: Clean up deprecated extraction toggle code**

Remove:
- The `handleToggleExtraction` function (~lines 841–848)
- The old `extractionEnabled` stats calculation (~line 732)
- The old extraction stats badge (~lines 951–963)

Do NOT remove the `toggleExtraction` mutation import or `extractionEnabled` schema field — those may still be referenced in other code paths.

- [ ] **Step 7: Build and verify**

Run: `npx next build`
Expected: Build passes with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/BulkReviewTable.tsx
git commit -m "feat: replace extraction toggle with deep extraction UI in review table"
```

---

## Chunk 4: Integration Verification + Push

### Task 5: Build Verification & Push

- [ ] **Step 1: Run full build**

Run: `npx next build`
Expected: Build passes with no errors.

- [ ] **Step 2: Verify Convex codegen**

Run: `npx convex codegen`
Expected: Success.

- [ ] **Step 3: Push to GitHub**

Run: `git push`

---

## Key Implementation References

### Reference loading pattern (must match pipeline exactly for cache hits)

From `src/v4/lib/pipeline.ts` lines 140-178:
```typescript
const allRefs = getAllReferences();                          // from src/lib/references/
let referencePromptText = formatForPrompt(allRefs, 'classification');  // from src/lib/references/
// Then merge user-created Convex references...
```

Do NOT use `selectReferencesForBatch()` — that produces a different (smaller) reference set that would break prompt cache compatibility.

### Field mapping via result-mapper

Use `mapClassificationToConvex()` from `src/v4/lib/result-mapper.ts` (line 133). This function handles:
- `DocumentClassification` → `ConvexItemAnalysis` (summary, fileType, category, folder, confidence, documentCode, version)
- `DocumentClassification` → `ConvexDocumentAnalysis` (entities, keyTerms, keyDates, keyAmounts, characteristics)
- `DocumentClassification` → `KnowledgeBankEntryData`
- Checklist match extraction
- Classification reasoning extraction

### Convex client pattern

```typescript
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
```

### Prompt cache behavior

System prompt (skill instructions + ALL references) is cached with 1-hour TTL. Deep extraction within 1 hour of initial upload gets cache hits at 10% input cost. The user message (document text) is always fresh/uncached.
