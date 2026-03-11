# Project-Aware Bulk Upload + Quick Fixes

## Overview

This spec covers two workstreams:

1. **Quick fixes** (3 items): folder drag-and-drop, Upload Folder button bug, "safe to leave" messaging
2. **Project-aware bulk upload**: auto-create projects (with checklists) at filing time, with an editable New Projects panel on the review page

## Workstream A: Quick Fixes

### Fix 1 — Folder drag-and-drop recursive extraction

**Problem:** Dragging a folder onto the upload dropzone uploads the folder itself as a single empty file (e.g., "Lynton 352 B") instead of its contents.

**Root cause:** `handleDrop` in `src/components/BulkUpload.tsx:328` reads `e.dataTransfer.files`, which gives the folder entry as a single item. It does not recurse into the folder.

**Fix:** Replace the `handleDrop` implementation to use `e.dataTransfer.items` with `DataTransferItem.webkitGetAsEntry()`. Walk the directory tree recursively using `FileSystemDirectoryReader.readEntries()`, collecting all files. Pass the collected files to `handleFiles()` as before.

**Files:**
- Modify: `src/components/BulkUpload.tsx` — `handleDrop` function (~line 328)

**Edge cases:**
- Nested folders (e.g., `Client/Project/subfolder/file.pdf`) — flatten all files, preserve `webkitRelativePath`-equivalent path info for folder hint extraction via `extractFolderHints()`
- Mixed drops (files + folders in the same drop) — handle both
- Empty folders — skip silently
- Reuse the existing `handleFolderSelect` logic (~line 351) for folder hint extraction and project detection when no project is pre-selected

---

### Fix 2 — Upload Folder button first-click bug

**Problem:** Clicking "Upload Folder" opens the file picker but won't allow folder selection on the first attempt. Works on second click.

**Root cause (hypothesis):** The hidden `<input webkitdirectory>` at `src/components/BulkUpload.tsx:1221-1229` is always mounted with the attribute set via `folderInputRef`. The button at line 1247 calls `folderInputRef.current?.click()`. The issue is likely a browser timing problem — the ref may not be fully attached on first render, or the browser needs a frame to register the `webkitdirectory` attribute before the dialog respects it. This needs testing to confirm.

**Fix (try first, verify in browser):** Wrap the `.click()` call in a `requestAnimationFrame` to give the browser a frame to process the attribute before opening the dialog:
```typescript
onClick={() => requestAnimationFrame(() => folderInputRef.current?.click())}
```

**Files:**
- Modify: `src/components/BulkUpload.tsx` — Upload Folder button click handler (~line 1247)

---

### Fix 3 — "Safe to leave" messaging

**Problem:** When background processing starts, the page shows a progress card but doesn't tell the user they can navigate away.

**Fix:** Update the existing background processing card in `src/app/docs/bulk/[batchId]/page.tsx`. Change the copy from:

> "Files are being analyzed in the background. You'll receive a notification when processing is complete. This page will automatically update as files are processed."

To:

> "Your files are being processed in the background. You can safely navigate away, start another upload, or come back later — you'll get a notification when it's done. This page will automatically update as files are processed."

Add a "Start Another Upload" link button below the message that navigates to the docs/upload page.

**Files:**
- Modify: `src/app/docs/bulk/[batchId]/page.tsx` — background processing card

---

## Workstream B: Project-Aware Bulk Upload

### Problem Statement

When a bulk upload detects files belonging to new (not yet existing) projects:
1. V4 pipeline sets `suggestedProjectName` on each item
2. But `fileBatch` ignores `suggestedProjectName` — it only uses `itemProjectId` (manually assigned)
3. Projects must be manually created via `handleCreateProject` before filing
4. New projects sometimes lack initialized checklists, causing errors

### Design

#### Architecture Decision: Separate Mutation for Project Creation

**Constraint:** Convex mutations cannot call other mutations. The existing `projects.create` mutation (in `convex/projects.ts:107-260`) performs 6 operations: shortcode validation/generation, project DB insert, folder creation from template, intelligence initialization (via scheduler), project summary sync to client (via scheduler), and checklist initialization (via scheduler). We cannot call `projects.create` from within `fileBatch`.

**Solution:** Create a new `createBulkUploadProjects` mutation in `convex/bulkUpload.ts` that **extracts and replicates** the essential project creation logic inline (not calling `projects.create`). This mutation runs **before** `fileBatch` and returns a `suggestedName → projectId` mapping. The frontend then passes this mapping to `fileBatch`.

This approach:
- Keeps `fileBatch` focused on filing (no new project creation logic)
- Keeps each mutation's transaction size manageable
- Uses `ctx.scheduler.runAfter` for checklist init, intelligence init, and project summary sync (same pattern as `projects.create`)

#### Component 1: New Projects Panel (Frontend)

**Location:** `src/app/docs/bulk/[batchId]/page.tsx` — above the `BulkReviewTable`

**Visibility:** Only shown when `batch.status === 'review'` AND items exist with `suggestedProjectName` values that don't match any existing project for this client (case-insensitive comparison).

**UI:** A card with editable rows for each detected new project:

| Column | Type | Description |
|--------|------|-------------|
| Checkbox | Toggle | Checked by default. Unchecking means "don't create this project — leave items unfiled to a project" |
| Name | Editable text input | Pre-filled from `suggestedProjectName`. User can rename. |
| Shortcode | Editable text input | Auto-generated using `generateShortcodeSuggestion()` logic from `convex/projects.ts:61-92`. User can edit. Field name: `projectShortcode`. |
| Files | Read-only count | Number of items assigned to this project |

**Footer text:** "Projects will be created when you click 'File All'"

**Unchecked project behavior:** Items whose `suggestedProjectName` maps to an unchecked project will be filed without a project assignment (they fall through to the batch-level `projectId` if one exists, or remain unassigned). The items are still filed — only the project creation is skipped.

**State management:** The panel maintains local state (React `useState`) for the new projects array: `{ name, projectShortcode, enabled, suggestedName }[]`. When the user edits a name or shortcode, the local state updates. This state is passed to the filing flow.

**Auto-shortcode generation:** Replicate the `generateShortcodeSuggestion()` function from `convex/projects.ts:61-92` on the frontend (or share as a utility). Uses first letters of words + numbers from name, up to 10 characters.

**Frontend shortcode validation:** The panel should highlight duplicate shortcodes within the new projects list (case-insensitive) and disable "File All" until resolved. The backend also validates intra-batch uniqueness as a safety net.

#### Component 2: `createBulkUploadProjects` mutation (Backend)

**File:** `convex/bulkUpload.ts` — new mutation

**Arguments:**
```typescript
createBulkUploadProjects: mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    newProjects: v.array(v.object({
      suggestedName: v.string(),        // Original name from V4 (used to match items)
      name: v.string(),                 // Final name (possibly edited by user)
      projectShortcode: v.string(),     // User-confirmed shortcode
    })),
  },
})
```

**Logic:**

1. Fetch the batch to get `clientId`
2. Fetch the primary client to get `clientType` (needed for folder templates and checklist initialization)
3. **Validate intra-batch shortcode uniqueness** — check that no two entries in `newProjects` share the same `projectShortcode` (case-insensitive). Throw if duplicates found. This prevents a race where both pass DB uniqueness checks since neither exists yet.
4. For each entry in `newProjects`:
   a. **Validate shortcode uniqueness vs DB** — query `projects` table by `by_shortcode` index, throw if duplicate (same logic as `projects.create:148-177`)
   b. **Insert the project** — minimal required fields: `name`, `projectShortcode`, `clientRoles: [{ clientId: batch.clientId, role: "borrower" }]`, `status: "active"`, `createdAt`
   c. **Create project folders** — query `folderTemplates` by client type + level "project", insert folder records (same logic as `projects.create:213-235`)
   d. **Schedule checklist initialization** — `ctx.scheduler.runAfter(0, api.knowledgeLibrary.initializeChecklistForProject, { clientId, projectId, clientType })`
   e. **Schedule intelligence initialization** — `ctx.scheduler.runAfter(0, api.intelligence.initializeProjectIntelligence, { projectId })`
   f. **Schedule project summary sync** — `ctx.scheduler.runAfter(0, api.intelligence.syncProjectSummariesToClient, { clientId })`
   g. Store mapping: `suggestedName → newProjectId`
5. Return the mapping: `{ suggestedName: string, projectId: Id<"projects"> }[]`

**Transaction size considerations:** Each project creation inserts ~1 project + ~8 folders + 3 scheduler calls. For a batch with 10 new projects, that's ~120 DB operations — well within Convex's 512 soft limit. For batches with 20+ new projects (unlikely but possible), consider splitting into chunks of 10 in a follow-up if needed.

#### Component 3: `fileBatch` enhancement (Backend)

**File:** `convex/bulkUpload.ts` — existing `fileBatch` mutation

**New argument:**
```typescript
projectMapping: v.optional(v.array(v.object({
  suggestedName: v.string(),
  projectId: v.id("projects"),
})))
```

**Logic change (before filing items):**
- Build a `Map<string, Id<"projects">>` from `projectMapping` (case-insensitive keys)
- When filing each item: if `item.suggestedProjectName` matches a key in the mapping, set `item.itemProjectId` to the mapped project ID
- The existing filing logic (`effectiveProjectId = item.itemProjectId || batch.projectId`) then picks it up naturally

#### Component 4: Graceful checklist fallback (Backend)

**File:** `convex/bulkUpload.ts` — `fileBatch` mutation, checklist linking section (~line 1564-1605)

**Fix:** Where `fileBatch` attempts to link documents to checklist items, wrap the checklist query in a guard. If no checklist items exist for the target project, log a warning and skip checklist linking for that item rather than throwing an error.

This is a safety net for:
- Projects created by `createBulkUploadProjects` where checklist initialization (scheduled async) hasn't completed yet
- Projects created outside the bulk upload flow that lack checklists
- Any other edge case where a project exists without a checklist

### Frontend Filing Flow

```
"File All" clicked
    ↓
1. If newProjects with enabled=true exist:
   → Call createBulkUploadProjects({ batchId, newProjects: enabledProjects })
   → Receive projectMapping back
2. Call fileBatch({ ..., projectMapping })
    ↓
fileBatch:
  1. Build suggestedName → projectId map from projectMapping
  2. For each item: resolve projectId from map if suggestedProjectName matches
  3. File each item (with correct projectId)
  4. Link to checklist items (graceful fallback if missing)
```

### Data Flow

```
Upload files → V4 analysis → suggestedProjectName set per item
    ↓
Review page loads → detect new project names (case-insensitive vs existing projects) → show New Projects panel
    ↓
User edits names/shortcodes, unchecks projects to skip → local state updated
    ↓
"File All" clicked → createBulkUploadProjects (for enabled projects) → returns mapping
    ↓
fileBatch({ ..., projectMapping }) → files each item with correct projectId → checklist linking (graceful)
```

### What This Does NOT Change

- The V4 analysis pipeline — it already detects and suggests projects
- The `suggestedProjectName` / `suggestedProjectId` schema fields — already exist
- Single-project bulk uploads — unaffected (no new projects panel shown)
- The `handleCreateProject` manual flow — still works, but the New Projects panel replaces it as the primary way to create projects during bulk upload
- The `projects.create` mutation — remains unchanged, `createBulkUploadProjects` replicates the essential logic inline
