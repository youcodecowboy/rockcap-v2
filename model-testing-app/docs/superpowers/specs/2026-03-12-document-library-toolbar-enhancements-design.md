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

Add a virtual "Unfiled" folder at the bottom of each project's folder list in `FolderBrowser.tsx`.

### Behavior

- **Visibility**: Appears only when a project has 1+ documents with no matching folder (`folderId` is null, empty, or doesn't match any existing project folder)
- **Position**: Rendered at the bottom of the project's folder list, below all real folders and below "Add custom folder..."
- **Styling**: Muted/dashed style to visually distinguish from real folders and signal "needs attention"
- **Click action**: Sets folder selection to a special `__unfiled__` sentinel value, causing `FileList` to query unfiled documents for that project
- **Disappears**: When all documents in the project are properly filed (unfiled count = 0)

### Not a database record

The "Unfiled" folder is computed client-side. No new folder record is created. It's derived from the difference between documents belonging to a project and documents with a valid folder assignment.

### New Convex Queries

```typescript
// documents.getUnfiledByProject
// Returns documents where projectId matches but folderId is null or doesn't match any project folder
getUnfiledByProject({
  projectId: v.id("projects"),
  sortBy?: v.optional(v.string()),
  sortOrder?: v.optional(v.string()),
}) => Document[]

// documents.getUnfiledCountByProject
// Returns count for the folder badge
getUnfiledCountByProject({
  projectId: v.id("projects"),
}) => number
```

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
  targetClientId: v.id("clients"),
  targetProjectId: v.optional(v.id("projects")),
  targetFolderId: v.string(),
  targetFolderType: v.union(v.literal("client"), v.literal("project")),
})
```

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
- Delete the document record
- Delete associated storage file (if any)
- Remove from any version chains
- All within a single Convex mutation (atomic)

### `documents.getUnfiledByProject`

```typescript
getUnfiledByProject({
  projectId: v.id("projects"),
})
```

Returns documents where `projectId` matches and (`folderId` is null/undefined OR `folderId` doesn't match any folder in the project's folder list).

### `documents.getUnfiledCountByProject`

```typescript
getUnfiledCountByProject({
  projectId: v.id("projects"),
})
```

Returns count of unfiled documents for badge display.

---

## Files Affected

### New Files
- None — all changes are additions to existing files

### Modified Files

| File | Change |
|------|--------|
| `convex/documents.ts` | Add `bulkMove`, `bulkDelete`, `getUnfiledByProject`, `getUnfiledCountByProject` |
| `src/app/docs/components/FolderBrowser.tsx` | Render virtual "Unfiled" folder per project |
| `src/app/docs/components/FileList.tsx` | Add Move/Delete buttons to toolbar, select-all checkbox, wire bulk actions |
| `src/app/docs/components/FileCard.tsx` | No changes expected (checkbox already works) |
| `src/app/docs/page.tsx` | Handle `__unfiled__` folder selection, pass bulk action handlers |
| New component: `src/app/docs/components/BulkMoveModal.tsx` | Move destination picker modal |

---

## Out of Scope

- Moving documents to internal/personal scopes (can add later)
- Bulk download (zip generation)
- Auto-sorting moved documents by category into destination folders
- Drag-and-drop to move documents between folders
