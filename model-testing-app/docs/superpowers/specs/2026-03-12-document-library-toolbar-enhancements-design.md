# Document Library Toolbar Enhancements — Design Spec

## Goal

Solve two problems in the Document Library:
1. Documents filed to a project but not matching any folder category are invisible (no way to navigate to them)
2. No bulk document operations — moving/deleting requires opening each document individually

## Architecture

Add a virtual "Unfiled" folder per project for visibility of unmapped documents, and add persistent Move/Delete buttons to the file list toolbar that operate on checkbox-selected documents. Bulk move supports cross-client transfers via a destination picker modal.

## Tech Stack

- Convex mutations/queries (data layer)
- React components (Next.js App Router, client components)
- shadcn/ui (AlertDialog, Dialog, Select, Button)
- Existing patterns: `MoveDocumentCrossScopeModal`, `FileList` selection state, `FolderBrowser` sidebar

---

## Feature 1: "Unfiled" Folder Per Project

### Problem

When documents are filed to a project but their category doesn't match any folder in the category-to-folder mapping (`convex/folderStructure.ts`), they have no folder assignment. The folder sidebar shows the project's total count (e.g., "Heythrop (17)") but only folders with matched docs are navigable — the unmatched documents are invisible.

### Solution

Render the existing "Unfiled" project folder (already seeded as `folderType: "unfiled"` in `convex/folderStructure.ts` PROJECT_FOLDER_TYPES) in `FolderBrowser.tsx` when it has documents. The folder record already exists in the database for every project — the issue is purely that the sidebar doesn't render it.

### Existing Infrastructure

- `convex/folderStructure.ts` already defines an `"unfiled"` folder type in `PROJECT_FOLDER_TYPES`
- Every project already gets an `unfiled` folder record in `projectFolders` table at creation time
- `documents.getUnfiled()` and `documents.getUnfiledCount()` queries exist in `convex/documents.ts` but target the global Inbox (docs without a clientId) — these are **not** what we need here

### Behavior

- **Visibility**: Appears only when a project has 1+ documents assigned to the `unfiled` project folder (count > 0)
- **Position**: Rendered at the bottom of the project's folder list, below all real folders and below "Add custom folder..."
- **Styling**: Muted/dashed style to visually distinguish from real folders and signal "needs attention"
- **Click action**: Selects the real `unfiled` folder record, causing `FileList` to query documents in that folder via the existing `documents.getByFolder()` query
- **Disappears**: When all documents are refiled out (count = 0)

### Filing: Route unmatched documents to "Unfiled"

When documents are filed to a project but their category doesn't match any folder in the `CATEGORY_TO_FOLDER_MAP`, the filing logic should assign them to the project's `unfiled` folder rather than leaving `folderId` null. This ensures they're always navigable.

### New Convex Query

```typescript
// documents.getUnfiledCountByProject
// Returns count of documents in the "unfiled" project folder — used for conditional rendering
getUnfiledCountByProject({
  projectId: v.id("projects"),
}) => number
```

Note: No new "get documents" query is needed — the existing `documents.getByFolder()` query handles fetching documents from any folder including `unfiled`.

---

## Feature 2: Persistent Toolbar Actions (Move + Delete)

### Current State

`FileList.tsx` already tracks selected documents via a `selectedDocIds` Set and renders checkboxes on each `FileCard`. But no bulk action UI exists — the selection state is unused.

### Solution

Add Move and Delete buttons to the existing toolbar bar (alongside sort dropdown, view toggle, and Upload button). These buttons are always visible but disabled until 1+ documents are selected.

### Toolbar Layout (left to right)

| Element | Visibility | State |
|---------|-----------|-------|
| Selection count badge ("3 selected") | Only when selection > 0 | — |
| **Move** button | Always | Disabled when no selection |
| **Delete** button (destructive style) | Always | Disabled when no selection |
| *spacer* | Always | — |
| Sort dropdown | Always (existing) | — |
| View toggle | Always (existing) | — |
| Upload button | Always (existing) | — |

### Select All

Add a "select all" checkbox in the file list header row that toggles all visible documents (respecting current filter/sort state).

### Selection Behavior

- Selection clears automatically after a successful bulk action (move or delete)
- Selection persists across sort/filter changes within the same folder view
- Navigating to a different folder clears selection

---

## Feature 3: Bulk Move Modal

### Trigger

User selects 1+ documents → clicks Move button in toolbar.

### Modal Structure

```
┌─────────────────────────────────────────┐
│  Move 3 documents                       │
│                                         │
│  Client:    [Paxford Property    ▾]     │
│                                         │
│  Move to:   ○ Client Folder             │
│             ● Project Folder            │
│                                         │
│  Project:   [Heythrop            ▾]     │
│                                         │
│  Folder:    ┌─────────────────────┐     │
│             │ ○ Background        │     │
│             │ ○ Terms Comparison  │     │
│             │ ○ Credit Submission │     │
│             │ ● Appraisals       │     │
│             │ ○ Notes            │     │
│             └─────────────────────┘     │
│                                         │
│              [Cancel]  [Move]           │
└─────────────────────────────────────────┘
```

### Fields

1. **Client selector** — Dropdown listing all clients. Defaults to the current client. Changing the client reloads the project and folder lists.
2. **Destination type** — Radio toggle: "Client Folder" (top-level folders like Background, KYC) or "Project Folder" (project-specific folders like Appraisals, Terms Comparison).
3. **Project selector** — Only shown when "Project Folder" is selected. Lists projects under the selected client.
4. **Folder selector** — Radio list of available folders at the selected level.

### Validation

- Move button disabled until a destination folder is selected
- Prevent moving to the document's current location (same folder + same project + same client)

### After Move

- Toast: "Moved 3 documents to Heythrop / Appraisals"
- Selection clears
- File list re-queries automatically (Convex reactivity)

---

## Feature 4: Bulk Delete

### Trigger

User selects 1+ documents → clicks Delete button in toolbar.

### Confirmation

AlertDialog:
- Title: "Delete 3 documents?"
- Description: "This will permanently delete the selected documents and their files. This action cannot be undone."
- Cancel button + red "Delete" action button

### After Delete

- Toast: "Deleted 3 documents"
- Selection clears
- File list re-queries automatically

---

## Feature 5: Data Layer — New Convex Mutations

### `documents.bulkMove`

```typescript
bulkMove({
  documentIds: v.array(v.id("documents")),
  targetScope: v.literal("client"), // Explicitly client-scope only for now
  targetClientId: v.id("clients"),
  targetProjectId: v.optional(v.id("projects")),
  targetFolderId: v.string(),
  targetFolderType: v.union(v.literal("client"), v.literal("project")),
})
```

Note: `targetScope` is always `"client"` in this version. The field exists for forward-compatibility with internal/personal scope moves in the future.

**Behavior per document:**
- Update `clientId`, `projectId`, `folderId`, `folderType`
- Regenerate document code using existing `generateDocumentCode()` logic (encodes client/project/type/date)
- Log "Moved to [destination]" activity on any open flags
- All within a single Convex mutation (atomic)

**Reuses logic from:** `documents.moveDocumentCrossScope()` (line 1147 of `convex/documents.ts`), but extracted into a shared helper to avoid duplication.

### `documents.bulkDelete`

```typescript
bulkDelete({
  documentIds: v.array(v.id("documents")),
})
```

**Behavior per document:**
- Soft delete: set `isDeleted: true` and `deletedAt` timestamp (matches existing codebase pattern)
- Documents with `isDeleted: true` are filtered out of all queries
- Storage files are NOT deleted immediately (allows potential recovery)
- Unlink from any version chains (set `parentDocumentId` to null on child versions)
- All within a single Convex mutation (atomic)

### `documents.getUnfiledCountByProject`

```typescript
getUnfiledCountByProject({
  projectId: v.id("projects"),
})
```

Returns count of documents in the project's `unfiled` folder. Used by `FolderBrowser` to conditionally render the Unfiled folder row. Note: document fetching uses the existing `documents.getByFolder()` query — no new document listing query is needed.

---

## Files Affected

### New Files
- `src/app/docs/components/BulkMoveModal.tsx` — Move destination picker modal

### Modified Files

| File | Change |
|------|--------|
| `convex/documents.ts` | Add `bulkMove`, `bulkDelete`, `getUnfiledCountByProject` |
| `src/app/docs/components/FolderBrowser.tsx` | Render existing "Unfiled" folder when count > 0 |
| `src/app/docs/components/FileList.tsx` | Add Move/Delete buttons to toolbar, select-all checkbox, wire bulk actions |
| `src/app/docs/components/FileCard.tsx` | No changes expected (checkbox already works) |
| `src/app/docs/page.tsx` | Pass bulk action handlers down to FileList |
| `convex/folderStructure.ts` | Ensure unmatched docs route to `unfiled` folder during filing |

---

## Out of Scope

- Moving documents to internal/personal scopes (can add later)
- Bulk download (zip generation)
- Auto-sorting moved documents by category into destination folders
- Drag-and-drop to move documents between folders
