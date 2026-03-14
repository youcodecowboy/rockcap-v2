# Nested Project Subfolders — Design Spec

## Context

Project-level folders are currently flat — users cannot create subfolders within template folders like "Background" or "Appraisals." In practice, users organize documents into nested structures (e.g., Background > KYC > Bank Statements > HSBC) to manage folders with 40-50+ documents. This feature adds Google Drive-style nested subfolders to project-level folders, matching the hierarchy support that already exists for client-level folders.

## Approach

**Mirror the existing `clientFolders` pattern.** Add `parentFolderId` to the `projectFolders` table — subfolders are just regular folder rows with a parent reference. Three other tables (`clientFolders`, `internalFolders`, `personalFolders`) already use this exact pattern. No new tables needed. No changes to the `documents` table schema.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Delete behavior | Move docs to parent folder | Google Drive behavior; prevents accidental data loss |
| Auto-filing target | Top-level folders only | Subfolders are for manual organization after auto-filing |
| Document counts | Include subfolder counts in parent | Quick sense of total volume; aggregated in UI |
| Depth limit | 5 levels max | Covers described use cases; prevents infinite nesting |
| Subfolder type | Always `isCustom: true` | Only template folders are non-custom; subfolders are user-created |

## Schema Changes

### `projectFolders` table (`convex/schema.ts` ~line 1060)

Add two fields and one index:

```
parentFolderId: v.optional(v.id("projectFolders")),  // undefined = top-level
depth: v.optional(v.number()),                        // 0 = top-level, 1-4 = nested; 5 levels total (depth 0-4)
```

Depth encoding: depth 0 through 4 gives 5 levels total. A folder at depth 4 cannot have children (reject if parent's depth >= 4).

Add index: `.index("by_parent", ["parentFolderId"])`

**No changes to the `documents` table.** Each subfolder gets its own unique `folderType` string (e.g., `custom_kyc`). Documents reference subfolders the same way they reference any folder — via `folderId` set to the subfolder's `folderType` string.

## Backend Changes

### 1. `addCustomProjectFolder` (`convex/projects.ts` ~line 593)

Add optional `parentFolderId` parameter:
- If provided, validate parent exists and belongs to same project
- Compute depth by walking parent chain server-side (don't trust client)
- Reject if computed depth >= 5
- Store `parentFolderId` and `depth` on new folder row
- Both template folders AND custom folders can receive subfolders

### 2. `deleteCustomProjectFolder` (`convex/projects.ts` ~line 627)

Change from "block if has docs" to cascade behavior:
- Recursively collect all descendant subfolder IDs (DFS through `by_parent` index)
- For each descendant (bottom-up): find all documents where `folderId === descendant.folderType` and update their `folderId` to the deleted folder's parent's `folderType`
- Delete all descendant subfolder rows
- Find all documents where `folderId === targetFolder.folderType` and update their `folderId` to the parent's `folderType`
- Delete the target subfolder row
- Only custom folders can be deleted (existing guard)
- No document schema fields change beyond `folderId` — this is a simple string reassignment

### 3. `getAllProjectFoldersForClient` (`convex/projects.ts` ~line 557)

Include `parentFolderId` and `depth` in the returned fields. The frontend uses this to build the tree.

### 4. `getProjectFolderCounts` (`convex/documents.ts`)

No changes needed at the query level — counts are already per-`folderType`. The frontend aggregates by walking the tree.

### 5. `getByFolder` (`convex/documents.ts`)

No changes needed — when a subfolder is selected, `folderId` is set to the subfolder's `folderType` and the existing query works.

## Frontend Changes

### 1. `FolderBrowser.tsx` — Nested Project Folder Tree

**Tree building** (new `useMemo`, mirrors lines 299-315 client folder pattern):
```
Split project folders into rootFolders (no parentFolderId)
and childFolders (grouped by parentFolderId)
```

**`renderProjectFolder` function** (mirrors `renderClientFolder` at lines 317-370):
- Recursive rendering with expand/collapse chevrons
- Indentation via `ml-4` per depth level + left border line
- "+" button on hover for creating subfolders within any folder
- Document count shows aggregated total (direct + all descendants)
- Delete button only on `isCustom` folders
- Purple sparkle icon on custom subfolders

**Aggregated counts** (new `useMemo`):
- Walk the tree bottom-up, sum descendant counts into each parent
- Display aggregated count on parent folders

**"Add subfolder" interaction**:
- Hover any project folder → "+" icon appears
- Click opens the existing Add Folder dialog
- The `AddFolderTarget` union type (`FolderBrowser.tsx` line 72) must be extended — add optional `parentFolderId: Id<"projectFolders">` to the `project` variant:
  ```typescript
  type AddFolderTarget =
    | { type: 'client' }
    | { type: 'project'; projectId: Id<"projects">; projectName: string; parentFolderId?: Id<"projectFolders"> }
    | null;
  ```
- `handleAddFolder` passes `parentFolderId` to the `addCustomProjectFolder` mutation

### 2. `FileList.tsx` — Toolbar Enhancements

**"New Folder" button** in toolbar (between Delete and Sort):
- `FolderPlus` icon + "New Folder" label
- Only visible when a project folder is selected
- Opens Add Folder dialog with current folder as parent
- Works at any depth level (creates child of current folder)

**Breadcrumb navigation** (replaces simple folder title):
- When in a subfolder, show path: `Background / KYC / Bank Statements`
- Each ancestor segment is clickable → navigates to that folder
- Built by walking `parentFolderId` chain up to root

### 3. `FolderSelection` interface — Extract to shared location

The `FolderSelection` interface is currently duplicated across 8 files:
- `src/app/docs/page.tsx`
- `src/app/docs/components/FolderBrowser.tsx`
- `src/app/docs/components/FileList.tsx`
- `src/app/docs/components/DocsSidebar.tsx`
- `src/app/docs/components/InternalFolderList.tsx`
- `src/app/docs/components/PersonalFolderList.tsx`
- `src/app/clients/[clientId]/components/ClientDocumentLibrary.tsx`
- `src/app/clients/[clientId]/projects/[projectId]/components/ProjectDocumentsTab.tsx`

**Step 1**: Extract to a shared types file (e.g., `src/types/folders.ts`):
```typescript
interface FolderSelection {
  type: 'client' | 'project' | 'internal' | 'personal';
  folderId: string;
  folderName: string;
  projectId?: Id<"projects">;
  parentPath?: Array<{ folderId: string; folderName: string }>; // for breadcrumbs
}
```

**Step 2**: Update all 8 files to import from the shared location.

### 4. `BulkMoveModal.tsx` — Subfolder Destination

When moving documents to a project folder that has subfolders:
- Show expandable subfolder tree in the destination picker
- Allow selecting any subfolder as move target
- Moving to a subfolder sets `folderId` to the subfolder's `folderType`

### 5. `MoveDocumentCrossScopeModal.tsx` (`src/components/MoveDocumentCrossScopeModal.tsx`)

Same subfolder tree in destination picker.

## Chat Tools

`folder.tools.ts` `createProjectFolder` (lines 121-141) already defines a `parentFolderId` parameter that the backend currently ignores. Once the backend accepts it, this tool works with zero changes.

Add a read tool `getProjectSubfolders`:
- Args: `projectId: Id<"projects">`, `parentFolderId?: Id<"projectFolders">` (if omitted, returns top-level folders)
- Returns: array of `{ _id, name, folderType, depth, hasChildren }` for immediate children

## What Does NOT Change

- **Auto-filing / bulk upload** — continues routing to top-level folders only
- **Document schema** — no new fields; `folderId` references `folderType` strings as before
- **Placement rules** — target top-level folders only
- **Client folder system** — already has hierarchy, untouched
- **Template creation** — `folderTemplates` table unchanged; subfolders are runtime user-created

## Edge Cases

1. **Depth enforcement**: Server-side validation walks parent chain. Never trust client-supplied depth.
2. **Circular references**: Impossible during creation (new folder can't be its own ancestor). If move-subfolder is added later, must validate.
3. **Orphaned subfolders**: If parent deleted without cascade (shouldn't happen), treat as root-level in UI.
4. **Duplicate folderType**: Current uniqueness check is per-project on the `folderType` string. Two subfolders in different parents but with the same name (e.g., "Notes" under both Background and Appraisals) would collide on `custom_notes`. Resolution: generate folderType as `custom_{name}_{last8chars_of_parentId}` (e.g., `custom_notes_a1b2c3d4`). The last 8 characters of the Convex ID provide sufficient uniqueness within a project. The existing uniqueness query (`by_project_type` index lookup) serves as the final guard — if a collision still occurs, append a counter suffix.
5. **Template folder deletion**: Template folders (non-custom) cannot be deleted, but CAN have subfolders. Deleting a subfolder under a template folder moves docs to the template folder.
6. **Moving docs between subfolders**: Within same top-level tree — only `folderId` changes. Across top-level folders — `folderId` changes to new folder's `folderType`.

## Verification Plan

1. **Schema**: Deploy to Convex, verify codegen succeeds (`npx convex codegen`)
2. **Create subfolder**: Create subfolder under template folder (e.g., Background > KYC). Verify appears nested in sidebar.
3. **Multi-level**: Create 5 levels deep. Verify 6th level is rejected.
4. **Move documents**: Move documents into subfolder. Verify they appear in subfolder view and count aggregates in parent.
5. **Delete subfolder**: Delete a subfolder with documents. Verify docs appear in parent folder.
6. **Cascade delete**: Delete a subfolder that has child subfolders with documents. Verify all docs cascade to deleted folder's parent.
7. **Breadcrumbs**: Navigate to deep subfolder. Verify breadcrumb path. Click ancestor segments.
8. **Bulk move**: Open BulkMoveModal. Verify subfolder tree appears in destination picker.
9. **Auto-filing**: Bulk upload documents. Verify they land in top-level folders, not subfolders.
10. **Build**: `npx next build` passes without errors.

## Critical Files

| File | Changes |
|---|---|
| `convex/schema.ts` | Add `parentFolderId`, `depth`, `by_parent` index to `projectFolders` |
| `convex/projects.ts` | Modify `addCustomProjectFolder`, `deleteCustomProjectFolder`, `getAllProjectFoldersForClient` |
| `src/app/docs/components/FolderBrowser.tsx` | Add tree building, `renderProjectFolder`, aggregated counts, subfolder creation trigger |
| `src/app/docs/components/FileList.tsx` | Add "New Folder" button, breadcrumb navigation |
| `src/app/docs/page.tsx` | Extend `FolderSelection` interface with `parentPath` |
| `src/app/docs/components/BulkMoveModal.tsx` | Add subfolder tree to destination picker |
| `src/components/MoveDocumentCrossScopeModal.tsx` | Add subfolder tree to destination picker |
| `src/types/folders.ts` (new) | Extract shared `FolderSelection` interface |
| `src/lib/tools/domains/folder.tools.ts` | Add `getProjectSubfolders` tool |
