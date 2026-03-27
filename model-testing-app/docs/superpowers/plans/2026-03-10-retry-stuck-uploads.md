# Retry Stuck Uploads Implementation Plan

## TODO (future work)

- [ ] **Folder drag-and-drop**: Dragging a folder onto the upload dropzone uploads the folder itself as an empty file (e.g., "Lynton 352 B") instead of recursively uploading the files inside it. Need to use `DataTransferItem.webkitGetAsEntry()` to walk the directory tree and extract individual files. Affects the `FileUpload` / bulk upload dropzone component.
- [ ] **Upload Folder button — first click ignored**: Clicking "Upload Folder" does not allow folder selection on the first attempt; the file picker opens but won't let you select a folder. You have to close the dialog and click the button again for it to work. Likely a timing issue with the `webkitdirectory` attribute not being set on the hidden `<input>` before `click()` is triggered.
- [ ] **Background processing UX — no "safe to leave" messaging**: When a bulk upload starts, the page shows files processing one by one with no indication that it's safe to navigate away. Users feel stuck watching the page. Once background processing kicks in, we should show a clear message: "Your files are being processed in the background — this will take a few minutes. You can navigate away, start another bulk upload, or come back later. You'll get a notification when it's done." Consider a toast/banner that appears right after processing begins, with a link to start another upload.
- [ ] **Project-level checklist not auto-initialized on new project**: When creating a new project and immediately doing a bulk upload, the review page errors with "No project-level checklist items found. Project checklist may need to be initialized." The Knowledge Library checklist is only set up at client level — project-level checklists either need to be auto-created when a project is created, or the bulk upload review should gracefully handle missing project checklists (skip rather than error).

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to retry individual files (or all stuck files at once) from the bulk upload review page when items are stuck in `processing` or `error` status.

**Architecture:** Add a single `retryItem` public mutation in `bulkBackgroundProcessor.ts` that resets an item's status to `pending` and re-schedules a `processNextItem` worker. Wire this into the existing per-row UI in `BulkReviewTable.tsx` (replacing the broken `updateItemStatus` retry) and add a "Retry All Stuck" button to the batch page.

**Tech Stack:** Convex mutations + scheduled actions, Next.js, React, Convex React hooks

---

## Chunk 1: Backend — retryItem mutation

### Task 1: Add `retryItem` public mutation to `bulkBackgroundProcessor.ts`

**Files:**
- Modify: `convex/bulkBackgroundProcessor.ts`

This mutation:
1. Fetches the item and its batch
2. Validates the item is in `processing` or `error` state
3. Resets item status → `pending`, clears any error field
4. If the batch status is `review` or `partial` (because it completed incorrectly due to stuck items), resets batch status → `processing`
5. Schedules one new `processNextItem` worker using `batch.baseUrl`

- [ ] **Step 1: Open `convex/bulkBackgroundProcessor.ts` and add the mutation after `startBackgroundProcessing`**

Add this export after the `startBackgroundProcessing` mutation (around line 70):

```typescript
/**
 * Retry a single item that is stuck in 'processing' or failed with 'error'.
 * Resets item to 'pending' and schedules a new worker to pick it up.
 */
export const retryItem = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    batchId: v.id("bulkUploadBatches"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Batch not found");

    if (item.status !== "processing" && item.status !== "error") {
      throw new Error(`Item is not retryable (status: ${item.status})`);
    }

    const baseUrl = batch.baseUrl;
    if (!baseUrl) throw new Error("Batch has no baseUrl — cannot re-trigger processor");

    const now = new Date().toISOString();

    // Reset item to pending, clear any previous error
    await ctx.db.patch(args.itemId, {
      status: "pending",
      error: undefined,
      updatedAt: now,
    });

    // If the batch incorrectly moved to a terminal state due to this stuck item,
    // reset it back to processing so the worker chain completes correctly.
    if (batch.status === "review" || batch.status === "partial" || batch.status === "completed") {
      await ctx.db.patch(args.batchId, {
        status: "processing",
        updatedAt: now,
      });
    }

    // Schedule a new worker to pick up the newly-pending item
    // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
    await ctx.scheduler.runAfter(0, internal.bulkBackgroundProcessor.processNextItem, {
      batchId: args.batchId,
      baseUrl,
    });

    return { success: true };
  },
});
```

- [ ] **Step 2: Add `baseUrl` to the schema and persist it in `startBackgroundProcessing`**

`baseUrl` is NOT currently stored on `bulkUploadBatches` — it is passed as an arg to `startBackgroundProcessing` but never written to the DB. Both fixes are required:

**2a.** In `convex/schema.ts`, find the `bulkUploadBatches` table definition and add:
```typescript
baseUrl: v.optional(v.string()),
```

**2b.** In `convex/bulkBackgroundProcessor.ts`, in the `startBackgroundProcessing` handler, find the `ctx.db.patch(args.batchId, { ... })` call and add `baseUrl: args.baseUrl` to the patch object:
```typescript
await ctx.db.patch(args.batchId, {
  processingMode: "background",
  status: "processing",
  baseUrl: args.baseUrl,          // ← add this line
  estimatedCompletionTime: estimatedCompletionTime.toISOString(),
  startedProcessingAt: now.toISOString(),
  updatedAt: now.toISOString(),
});
```

- [ ] **Step 3: Run Convex codegen to pick up any schema changes**

```bash
npx convex codegen
```

Expected: no errors. If there are type errors, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
git add convex/bulkBackgroundProcessor.ts convex/schema.ts
git commit -m "feat: add retryItem mutation for stuck/failed bulk upload items"
```

---

## Chunk 2: Frontend — per-row retry button

### Task 2: Wire per-row retry in `BulkReviewTable.tsx`

**Files:**
- Modify: `src/components/BulkReviewTable.tsx`

Replace the broken per-row retry (which calls `updateItemStatus` without re-triggering the processor) with the new `retryItem` mutation. Also add the same button for items stuck in `processing`.

- [ ] **Step 1: Add `batchId` to the `BulkUploadItem` type and import `retryItem` mutation**

`batchId` is NOT currently in the `BulkUploadItem` interface. Find the interface definition (around line 148) and add the field:

```typescript
batchId: Id<"bulkUploadBatches">;
```

Then add the mutation hook near the other `useMutation` calls:

```typescript
const retryItem = useMutation(api.bulkBackgroundProcessor.retryItem);
```

- [ ] **Step 2: Fix the existing error retry button (around line 1729)**

Find this block:
```typescript
{item.error && (
  <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center justify-between gap-2">
    <div>
      <span className="font-medium">Error:</span> {item.error}
    </div>
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 text-xs h-7 border-red-300 text-red-700 hover:bg-red-100"
      onClick={async () => {
        try {
          await updateItemStatus({
            itemId: item._id,
            status: 'pending',
          });
        } catch (e) {
          console.error('Failed to retry item:', e);
        }
      }}
    >
      <RefreshCw className="w-3 h-3 mr-1" />
      Retry
    </Button>
  </div>
)}
```

Replace the `onClick` handler to use `retryItem`:
```typescript
onClick={async () => {
  try {
    await retryItem({ itemId: item._id, batchId: item.batchId });
  } catch (e) {
    console.error('Failed to retry item:', e);
  }
}}
```

- [ ] **Step 3: Add retry button for items stuck in `processing`**

Directly after the `{item.error && (...)}` block, add:

```typescript
{item.status === 'processing' && (
  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700 flex items-center justify-between gap-2">
    <div>
      <span className="font-medium">Stuck:</span> This file appears to be stuck in processing.
    </div>
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-100"
      onClick={async () => {
        try {
          await retryItem({ itemId: item._id, batchId: item.batchId });
        } catch (e) {
          console.error('Failed to retry stuck item:', e);
        }
      }}
    >
      <RefreshCw className="w-3 h-3 mr-1" />
      Retry
    </Button>
  </div>
)}
```

Note: `item.batchId` is now available because we added it to the type in Step 1 above.

- [ ] **Step 4: Commit**

```bash
git add src/components/BulkReviewTable.tsx
git commit -m "feat: wire retryItem mutation in per-row retry buttons for error and stuck processing items"
```

---

## Chunk 3: Frontend — "Retry All Stuck" batch-level button

### Task 3: Add "Retry All Stuck" button to `[batchId]/page.tsx`

**Files:**
- Modify: `src/app/docs/bulk/[batchId]/page.tsx`

Add a button that appears when the batch has any `processing` or `error` items. It calls `retryItem` for each one sequentially.

- [ ] **Step 1: Import `retryItem` mutation in the page**

At the top of `src/app/docs/bulk/[batchId]/page.tsx`, add the mutation:

```typescript
const retryItem = useMutation(api.bulkBackgroundProcessor.retryItem);
```

- [ ] **Step 2: Add loading state**

Add to the existing state declarations:

```typescript
const [isRetryingAll, setIsRetryingAll] = useState(false);
```

- [ ] **Step 3: Add handler function**

Add this function before the return statement:

```typescript
const handleRetryAllStuck = async () => {
  if (!items) return;
  const stuckItems = items.filter(i => i.status === 'processing' || i.status === 'error');
  if (stuckItems.length === 0) return;

  setIsRetryingAll(true);
  try {
    for (const item of stuckItems) {
      await retryItem({ itemId: item._id, batchId });
    }
  } catch (e) {
    console.error('Failed to retry all stuck items:', e);
  } finally {
    setIsRetryingAll(false);
  }
};
```

- [ ] **Step 4: Add the button to the UI**

Find the "Background Processing Progress" card block (around line 378) that shows while `batch.status === 'processing'`. Add a "Retry All Stuck" button inside the card, below the progress bar. Compute the stuck count first:

```typescript
const stuckCount = items?.filter(i => i.status === 'processing' || i.status === 'error').length ?? 0;
```

Then inside the card's `<CardContent>` after the existing `<p>` paragraph, add:

```typescript
{stuckCount > 0 && (
  <div className="mt-3 flex justify-end">
    <Button
      variant="outline"
      size="sm"
      className="border-blue-300 text-blue-700 hover:bg-blue-100"
      onClick={handleRetryAllStuck}
      disabled={isRetryingAll}
    >
      {isRetryingAll ? (
        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
      ) : (
        <RefreshCw className="w-3 h-3 mr-2" />
      )}
      Retry Stuck Files ({stuckCount})
    </Button>
  </div>
)}
```

Also render the button when the batch is NOT in `processing` state (e.g., erroneously moved to `review` but still has stuck items). Add a standalone warning card after the existing processing card:

```typescript
{batch.status !== 'processing' && stuckCount > 0 && (
  <Card className="border-amber-200 bg-amber-50/50">
    <CardContent className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-amber-100">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-medium text-amber-900">
              {stuckCount} file{stuckCount > 1 ? 's' : ''} need attention
            </h3>
            <p className="text-sm text-amber-700">
              {stuckCount} file{stuckCount > 1 ? 's are' : ' is'} stuck in processing or failed.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100"
          onClick={handleRetryAllStuck}
          disabled={isRetryingAll}
        >
          {isRetryingAll ? (
            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3 mr-2" />
          )}
          Retry All Stuck ({stuckCount})
        </Button>
      </div>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/docs/bulk/[batchId]/page.tsx
git commit -m "feat: add Retry All Stuck button to batch review page"
```

---

## Chunk 4: Final verification

### Task 4: Build check and final cleanup

- [ ] **Step 1: Run the Next.js build**

```bash
npx next build
```

Expected: build passes with no errors. Fix any TypeScript errors before continuing (common issues: missing `batchId` on item type, missing `baseUrl` on batch type).

- [ ] **Step 2: No extra verification needed for `baseUrl`**

`baseUrl` is now persisted by Chunk 1 Step 2. The field was already passed as a required arg to `startBackgroundProcessing` from the client — it just wasn't saved. That is now fixed.

- [ ] **Step 3: Push to GitHub**

```bash
git push
```
