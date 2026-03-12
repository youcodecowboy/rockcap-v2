# Document Library Toolbar Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unfiled folder visibility, bulk move (cross-client), and bulk delete to the Document Library.

**Architecture:** Three layers of change: (1) Convex data layer — new queries and mutations for bulk operations and unfiled counts, (2) FolderBrowser sidebar — render the existing "unfiled" folder when it has documents, (3) FileList toolbar — persistent Move/Delete buttons wired to a new BulkMoveModal and delete confirmation dialog.

**Tech Stack:** Convex (mutations/queries), Next.js App Router (client components), shadcn/ui (Dialog, AlertDialog, Select, RadioGroup, Button), Lucide icons.

**Spec:** `docs/superpowers/specs/2026-03-12-document-library-toolbar-enhancements-design.md`

---

## Chunk 1: Data Layer — Unfiled Count Query + Bulk Delete Mutation

### Task 1: Add `getUnfiledCountByProject` query

**Files:**
- Modify: `convex/documents.ts` (after `getProjectFolderCounts` at ~line 1755)

**Context:** The `projectFolders` table already has an `"unfiled"` folder type seeded for every project (see `convex/folderStructure.ts` line 300). Documents with `folderId === "unfiled"` are in that folder. We need a query that returns the count for conditional rendering in FolderBrowser.

- [ ] **Step 1: Add the query**

```typescript
// Add after getProjectFolderCounts query (~line 1755)

export const getUnfiledCountByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.and(
          q.eq(q.field("isDeleted"), false),
          q.or(
            q.eq(q.field("folderId"), "unfiled"),
            q.eq(q.field("folderId"), undefined),
            q.eq(q.field("folderId"), null)
          )
        )
      )
      .collect();
    return docs.length;
  },
});
```

**Why include null/undefined?** Some documents may have been filed before the unfiled folder existed — they'd have no folderId at all. These are also "unfiled" and should show up.

- [ ] **Step 2: Run codegen**

Run: `npx convex codegen`
Expected: Success, `convex/_generated/api.d.ts` updated with `documents.getUnfiledCountByProject`

- [ ] **Step 3: Commit**

```bash
git add convex/documents.ts convex/_generated/
git commit -m "feat: add getUnfiledCountByProject query for unfiled folder rendering"
```

---

### Task 2: Add `bulkDelete` mutation

**Files:**
- Modify: `convex/documents.ts` (after existing `remove` mutation at ~line 1034)

**Context:** The existing `remove()` mutation (line 1005) does a soft delete: sets `isDeleted: true` and `deletedAt`. We replicate that pattern for bulk operations.

- [ ] **Step 1: Add the mutation**

```typescript
// Add after remove mutation (~line 1034)

export const bulkDelete = mutation({
  args: {
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const now = new Date().toISOString();
    let deletedCount = 0;

    for (const docId of args.documentIds) {
      const doc = await ctx.db.get(docId);
      if (!doc || doc.isDeleted) continue;

      // Soft delete
      await ctx.db.patch(docId, {
        isDeleted: true,
        deletedAt: now,
        deletedReason: "bulk_delete",
      });

      // Unlink from version chains — clear parentDocumentId on children
      const children = await ctx.db
        .query("documents")
        .filter((q) => q.eq(q.field("parentDocumentId"), docId))
        .collect();
      for (const child of children) {
        await ctx.db.patch(child._id, { parentDocumentId: undefined });
      }

      deletedCount++;
    }

    return { deletedCount };
  },
});
```

- [ ] **Step 2: Run codegen**

Run: `npx convex codegen`
Expected: Success, `bulkDelete` available in API

- [ ] **Step 3: Commit**

```bash
git add convex/documents.ts convex/_generated/
git commit -m "feat: add bulkDelete mutation for soft-deleting multiple documents"
```

---

### Task 3: Add `bulkMove` mutation

**Files:**
- Modify: `convex/documents.ts` (after `bulkDelete`)

**Context:** The existing `moveDocumentCrossScope()` mutation (line 1147) handles single-doc moves with code regeneration and flag activity logging. The bulk version reuses the same logic pattern but in a loop within a single transaction. We keep `targetScope` as `"client"` only for now (forward-compatible field).

- [ ] **Step 1: Add the mutation**

```typescript
// Add after bulkDelete mutation

export const bulkMove = mutation({
  args: {
    documentIds: v.array(v.id("documents")),
    targetScope: v.literal("client"),
    targetClientId: v.id("clients"),
    targetProjectId: v.optional(v.id("projects")),
    targetFolderId: v.string(),
    targetFolderType: v.union(v.literal("client"), v.literal("project")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Validate target client exists
    const targetClient = await ctx.db.get(args.targetClientId);
    if (!targetClient) throw new Error("Target client not found");

    // Validate target project if specified
    let targetProject: any = null;
    if (args.targetProjectId) {
      targetProject = await ctx.db.get(args.targetProjectId);
      if (!targetProject) throw new Error("Target project not found");
    }

    let movedCount = 0;

    for (const docId of args.documentIds) {
      const doc = await ctx.db.get(docId);
      if (!doc || doc.isDeleted) continue;

      // Generate new document code
      const newCode = generateDocumentCode(
        targetClient.name,
        doc.category || "Other",
        targetProject?.name,
        doc.uploadedAt || new Date().toISOString(),
      );

      // Build update
      const updates: Record<string, any> = {
        clientId: args.targetClientId,
        folderId: args.targetFolderId,
        folderType: args.targetFolderType,
        scope: "client",
        documentCode: newCode,
        updatedAt: new Date().toISOString(),
      };

      // Set or clear projectId
      if (args.targetProjectId) {
        updates.projectId = args.targetProjectId;
      } else {
        updates.projectId = undefined;
      }

      // Clear base document flag when moving across clients
      if (doc.clientId !== args.targetClientId) {
        updates.isBaseDocument = false;
      }

      await ctx.db.patch(docId, updates);

      // Log flag activity if document has open flags
      const flags = await ctx.db
        .query("flags")
        .filter((q) =>
          q.and(
            q.eq(q.field("documentId"), docId),
            q.neq(q.field("status"), "resolved")
          )
        )
        .collect();
      for (const flag of flags) {
        await ctx.db.insert("flagActivity", {
          flagId: flag._id,
          action: "comment",
          content: `Moved to ${targetClient.name}${targetProject ? ` / ${targetProject.name}` : ""} / ${args.targetFolderId}`,
          performedBy: identity.subject,
          performedAt: new Date().toISOString(),
        });
      }

      movedCount++;
    }

    return { movedCount };
  },
});
```

**Note:** `generateDocumentCode` is already defined at the top of `convex/documents.ts` (line 52). The bulk mutation reuses it directly.

- [ ] **Step 2: Run codegen**

Run: `npx convex codegen`
Expected: Success, `bulkMove` available in API

- [ ] **Step 3: Commit**

```bash
git add convex/documents.ts convex/_generated/
git commit -m "feat: add bulkMove mutation for cross-client document moves"
```

---

## Chunk 2: Unfiled Folder in Sidebar + Toolbar Bulk Actions

### Task 4: Render "Unfiled" folder in FolderBrowser

**Files:**
- Modify: `src/app/docs/components/FolderBrowser.tsx`

**Context:** The folder sidebar renders project folders at lines 388-439, followed by "Add custom folder..." at lines 441-451. We need to add an "Unfiled" row **between the regular folders and the "Add custom folder..." button**, only when the unfiled count > 0. The unfiled folder already exists in the `projectFolders` table but may be filtered out of the `project.folders` array. We query the count separately.

**Existing rendering pattern (lines 388-439):**
Each project folder is rendered with: Folder icon, name, document count, optional delete button. The folder is selected via `onFolderSelect({ type: 'project', folderId: folder.folderType, folderName: folder.name, projectId: project._id })`.

- [ ] **Step 1: Add unfiled count query**

In `FolderBrowser.tsx`, add after the existing queries (~line 94):

```typescript
// Import useQuery if not already imported (it is)
// Add per-project unfiled count queries — we'll handle this in the rendering logic
// since we need one per project, we'll use a small helper component
```

Actually, since we need per-project counts and `useQuery` can't be called in a loop, create a small inner component:

```typescript
// Add before the main component export, or inside the file as a helper:

function UnfiledFolderRow({
  projectId,
  selectedFolder,
  onFolderSelect,
}: {
  projectId: Id<"projects">;
  selectedFolder: FolderSelection | null;
  onFolderSelect: (folder: FolderSelection) => void;
}) {
  const unfiledCount = useQuery(api.documents.getUnfiledCountByProject, { projectId });

  if (!unfiledCount || unfiledCount === 0) return null;

  const selected = selectedFolder?.type === 'project' &&
    selectedFolder?.folderId === 'unfiled' &&
    selectedFolder?.projectId === projectId;

  return (
    <div className="group">
      <div
        className={cn(
          "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors rounded-md",
          selected
            ? "bg-blue-100 text-blue-900"
            : "hover:bg-gray-100 text-gray-500"
        )}
      >
        <button
          onClick={() => onFolderSelect({
            type: 'project',
            folderId: 'unfiled',
            folderName: 'Unfiled',
            projectId,
          })}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          {selected ? (
            <FolderOpen className="w-4 h-4 text-orange-400 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-orange-400 flex-shrink-0 opacity-60" />
          )}
          <span className="flex-1 text-left truncate italic">Unfiled</span>
        </button>
        <span className="text-xs text-orange-400 flex-shrink-0">({unfiledCount})</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Insert the component in the project folder section**

In the project folders rendering block, add `<UnfiledFolderRow>` after the folder map loop (after line 439) and before the "Add custom folder..." button (line 441):

```tsx
{/* After project.folders.map(...) closing */}

{/* Unfiled folder — only renders when count > 0 */}
<UnfiledFolderRow
  projectId={project._id}
  selectedFolder={selectedFolder}
  onFolderSelect={onFolderSelect}
/>

{/* Add Custom Folder Button (existing) */}
<button
  onClick={() => setAddFolderTarget({...})}
  ...
```

- [ ] **Step 3: Verify the Folder/FolderOpen icons are already imported**

Check imports at top of FolderBrowser.tsx — `Folder` and `FolderOpen` should already be imported from lucide-react. The `cn` utility should also already be imported. The `Id` type from convex should be imported. Add any missing imports.

- [ ] **Step 4: Test manually**

Navigate to a client with a project that has documents with `folderId: "unfiled"` or `folderId: null`. Verify:
- The "Unfiled" folder appears at the bottom of the project's folder list
- Clicking it shows those documents
- It doesn't appear for projects with 0 unfiled docs

- [ ] **Step 5: Commit**

```bash
git add src/app/docs/components/FolderBrowser.tsx
git commit -m "feat: render Unfiled folder in project sidebar when docs exist"
```

---

### Task 5: Add bulk action buttons to FileList toolbar

**Files:**
- Modify: `src/app/docs/components/FileList.tsx`

**Context:** The toolbar is at lines 451-516 of FileList.tsx. It has a left side (folder icon, title, file count) and a right side (sort dropdown, view toggle, upload button). We add Move and Delete buttons to the right side, before the sort dropdown. They're always visible but disabled when `selectedDocIds.size === 0`.

- [ ] **Step 1: Add imports**

Add to the existing lucide-react imports in FileList.tsx:

```typescript
import { FolderInput, Trash2 } from 'lucide-react';
```

Also add AlertDialog imports:

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
```

Add toast import:

```typescript
import { toast } from 'sonner';
```

- [ ] **Step 2: Add state and mutation**

After the existing state declarations (~line 96), add:

```typescript
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
const [isBulkDeleting, setIsBulkDeleting] = useState(false);

const bulkDeleteMutation = useMutation(api.documents.bulkDelete);
```

- [ ] **Step 3: Add delete handler**

After the toggleSelection function (~line 266), add:

```typescript
const handleBulkDelete = async () => {
  if (selectedDocIds.size === 0) return;
  setIsBulkDeleting(true);
  try {
    const result = await bulkDeleteMutation({
      documentIds: Array.from(selectedDocIds) as Id<"documents">[],
    });
    toast.success(`Deleted ${result.deletedCount} document${result.deletedCount !== 1 ? 's' : ''}`);
    setSelectedDocIds(new Set());
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Failed to delete documents');
  } finally {
    setIsBulkDeleting(false);
    setShowDeleteConfirm(false);
  }
};
```

- [ ] **Step 4: Add select-all handler**

After the handleBulkDelete function, add:

```typescript
const handleSelectAll = useCallback(() => {
  if (selectedDocIds.size === sortedDocuments.length) {
    setSelectedDocIds(new Set());
  } else {
    setSelectedDocIds(new Set(sortedDocuments.map(d => d._id)));
  }
}, [selectedDocIds.size, sortedDocuments]);
```

- [ ] **Step 5: Update the toolbar — add bulk action buttons**

In the toolbar div (right side, ~line 461), add before the Sort dropdown:

```tsx
<div className="flex items-center gap-2 flex-shrink-0">
  {/* Bulk Actions */}
  {selectedDocIds.size > 0 && (
    <Badge variant="secondary" className="text-xs">
      {selectedDocIds.size} selected
    </Badge>
  )}
  <Button
    size="sm"
    variant="outline"
    className="gap-1.5 h-8"
    disabled={selectedDocIds.size === 0}
    onClick={() => setShowBulkMoveModal(true)}
  >
    <FolderInput className="w-3.5 h-3.5" />
    <span className="hidden sm:inline">Move</span>
  </Button>
  <Button
    size="sm"
    variant="outline"
    className="gap-1.5 h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
    disabled={selectedDocIds.size === 0}
    onClick={() => setShowDeleteConfirm(true)}
  >
    <Trash2 className="w-3.5 h-3.5" />
    <span className="hidden sm:inline">Delete</span>
  </Button>

  {/* Sort (existing) */}
  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
    ...existing sort code...
  </Select>
  ...rest of existing toolbar...
```

Make sure Badge is imported from `@/components/ui/badge`.

- [ ] **Step 6: Add select-all checkbox to list header**

Update the `renderListHeader` function (line 385). Replace the first empty `<div className="w-5 flex-shrink-0" />` with:

```tsx
<div className="w-5 flex-shrink-0 flex items-center justify-center">
  <Checkbox
    checked={sortedDocuments.length > 0 && selectedDocIds.size === sortedDocuments.length}
    onCheckedChange={handleSelectAll}
    className="h-3 w-3"
  />
</div>
```

Import Checkbox if not already imported:

```typescript
import { Checkbox } from '@/components/ui/checkbox';
```

- [ ] **Step 7: Add delete confirmation AlertDialog**

At the bottom of the component's return, before the closing `</div>`, add:

```tsx
{/* Bulk Delete Confirmation */}
<AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete {selectedDocIds.size} document{selectedDocIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
      <AlertDialogDescription>
        This will permanently delete the selected documents. This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleBulkDelete}
        disabled={isBulkDeleting}
        className="bg-red-600 hover:bg-red-700"
      >
        {isBulkDeleting ? 'Deleting...' : 'Delete'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 8: Clear selection on folder change**

Add a `useEffect` to clear selection when the folder changes:

```typescript
useEffect(() => {
  setSelectedDocIds(new Set());
}, [selectedFolder?.folderId, selectedFolder?.projectId]);
```

- [ ] **Step 9: Commit**

```bash
git add src/app/docs/components/FileList.tsx
git commit -m "feat: add Move/Delete bulk action buttons and select-all to FileList toolbar"
```

---
