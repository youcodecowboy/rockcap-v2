# SAF-01: Soft Delete with Recovery for Projects and Clients

> **Status:** Approved design
> **Priority:** Critical | **Effort:** High | **Category:** Safety
> **Date:** 2026-03-22

## Problem

Clients and projects can be deleted from a prominent button in the page header — easy to click accidentally. Once deleted, there is no way to recover. The confirmation dialog misleadingly says "permanently delete" even though the backend already soft-deletes. Users need:

1. Delete moved away from the header to reduce accidental clicks
2. A recovery path for deleted items
3. A clear distinction between "move to trash" and "permanently delete"

## Decisions

| Question | Answer |
|----------|--------|
| Where does recovery UI live? | Filter within existing lists (Clients sidebar, Projects tab) — not a global Trash page |
| Recovery period? | Indefinite — deleted items stay in trash until manually permanently deleted |
| Confirmation flow? | Confirmation modal → toast with Undo button (8s) for trash. Name-confirmation modal for permanent delete |
| Cascade behavior? | Trashing a client cascades to all its projects. Restoring a client restores cascade-trashed projects |

## Approach

Minimal UI-only approach. The schema already has `isDeleted`, `deletedAt`, `deletedBy`, `deletedReason` fields on both `clients` and `projects` tables. All queries already filter out `isDeleted === true` records. The backend mutations already soft-delete. The work is:

- New Convex mutations (restore, permanent delete, list deleted)
- Modify existing `clients.remove` to cascade
- Frontend: relocate delete to Settings, add deleted filter, restoration banner, permanent delete modal, toast with undo

No schema changes required.

## Backend Changes

### Existing (no changes)

- `clients.remove` mutation — already patches `isDeleted: true`, `deletedAt`, `deletedReason`
- `projects.remove` mutation — same pattern
- Schema fields — `isDeleted`, `deletedAt`, `deletedBy`, `deletedReason` on both tables
- All list/get queries — already filter `isDeleted !== true`

### Modify: `clients.remove` (cascade)

When a client is trashed, also trash all its non-deleted projects. Set `deletedReason: "parent_client_deleted"` on cascade-trashed projects to distinguish them from independently-trashed projects. This enables selective restoration on client restore.

```
clients.remove handler:
  1. Patch client with isDeleted: true, deletedAt, deletedReason: "user_deleted"
  2. Query all projects where clientRoles contains this clientId AND isDeleted !== true
  3. Patch each with isDeleted: true, deletedAt (same timestamp), deletedReason: "parent_client_deleted"
  4. Invalidate context cache (existing)
```

### New: `clients.restore`

Unsets soft-delete fields on the client. Also restores any projects that were cascade-deleted (matched by `deletedReason === "parent_client_deleted"` AND `deletedAt` matching the client's `deletedAt` within 1 second).

```
clients.restore handler:
  1. Get client, verify isDeleted === true
  2. Patch client: isDeleted: undefined, deletedAt: undefined, deletedBy: undefined, deletedReason: undefined
  3. Query projects where clientRoles contains this clientId AND deletedReason === "parent_client_deleted"
  4. For each, patch to unset soft-delete fields
  5. Invalidate context cache
```

### New: `projects.restore`

Same unset pattern. Standalone — no cascade.

```
projects.restore handler:
  1. Get project, verify isDeleted === true
  2. Patch project: unset all soft-delete fields
  3. Invalidate context cache for project and related clients
```

### New: `clients.permanentDelete`

Hard-deletes the client record and all related data. Only callable when `isDeleted === true` (guard against accidental permanent deletion of active records).

```
clients.permanentDelete handler:
  1. Get client, verify isDeleted === true
  2. Delete all related records:
     - projects (where clientRoles contains this clientId)
     - documents (by clientId)
     - contacts (by clientId)
     - tasks (by clientId)
     - flags (by clientId)
     - notes (by clientId)
     - meetings (by clientId)
     - chatSessions (by clientId)
     - enrichmentSuggestions (by clientId)
  3. For each project found, also delete its project-specific related data:
     - documents (by projectId)
     - tasks (by projectId)
     - flags (by projectId)
     - notes (by projectId)
     - meetings (by projectId)
     - folderStructure (by projectId)
     - scenarios (by projectId)
  4. Delete the client record itself
```

### New: `projects.permanentDelete`

Hard-deletes the project and its related data. Only callable when `isDeleted === true`.

```
projects.permanentDelete handler:
  1. Get project, verify isDeleted === true
  2. Delete all related records:
     - documents (by projectId)
     - tasks (by projectId)
     - flags (by projectId)
     - notes (by projectId)
     - meetings (by projectId)
     - folderStructure (by projectId)
     - scenarios (by projectId)
     - chatSessions (by projectId)
  3. Delete the project record itself
  4. Invalidate context cache for related clients
```

### New: `clients.listDeleted`

Query returning all clients where `isDeleted === true`, sorted by `deletedAt` descending.

### New: `projects.listDeletedByClient`

Query accepting `clientId`, returning deleted projects for that client, sorted by `deletedAt` descending.

## Frontend Changes

### 1. Remove delete buttons from headers

**Files:**
- `src/app/clients/[clientId]/page.tsx` — remove the red "Delete" `<Button>` and the `showDeleteDialog` AlertDialog from the header
- `src/app/clients/[clientId]/projects/[projectId]/page.tsx` — same removal

The Archive button stays in the header — archive is a status change, not removal.

### 2. Add "Danger Zone" to Settings panels

**Files:**
- `src/components/ClientSettingsPanel.tsx`
- `src/components/ProjectSettingsPanel.tsx`

At the bottom of the **General** tab (not a new tab), add a "Danger Zone" section:

- Divider with margin above
- Red-bordered card (`border-red-200`)
- Header: "Danger Zone"
- Copy: "Move this [client/project] to trash. It can be restored from the Deleted filter in the [clients sidebar / projects tab]."
- For clients: show count of active projects that will be cascade-trashed
- Button: "Move to Trash" — red outline style (`variant="outline"` with red text)
- Confirmation modal: "Move [name] to trash?" with description of what will happen
- On confirm: call remove mutation, close settings panel, navigate to list, show toast with Undo

### 3. Add "Show deleted" toggle to lists

**File: `src/app/clients/components/ClientsSidebar.tsx`**

Below the client list, add a subtle toggle:

```
🗑 Show deleted (N)
```

- `N` comes from `clients.listDeleted` query (just the count)
- When toggled: list switches to show only deleted clients from `listDeleted` query
- Deleted clients render with `opacity-60` and muted styling
- Toggle text changes to `← Back to active clients`
- Clicking a deleted client navigates to its page (which shows restoration banner)

**File: `src/app/clients/[clientId]/components/ClientProjectsTab.tsx`**

Same pattern — "Show deleted (N)" toggle below the project list. Uses `projects.listDeletedByClient` query.

### 4. Add restoration banner

**Files:**
- `src/app/clients/[clientId]/page.tsx`
- `src/app/clients/[clientId]/projects/[projectId]/page.tsx`

When the loaded client/project has `isDeleted === true`, render a full-width banner below the header:

- Amber/yellow background (`bg-amber-50 border-amber-200`)
- Icon: `AlertTriangle`
- Text: "This [client/project] was moved to trash on [formatted date]"
- Two buttons:
  - **"Restore"** — primary style, calls restore mutation, shows success toast
  - **"Delete Permanently"** — ghost style with red text, opens `PermanentDeleteModal`

### 5. New component: `PermanentDeleteModal`

**File: `src/components/PermanentDeleteModal.tsx`**

Shared modal for permanent deletion with name-confirmation gate:

**Props:**
- `isOpen: boolean`
- `onClose: () => void`
- `entityType: 'client' | 'project'`
- `entityName: string`
- `entityId: Id<"clients"> | Id<"projects">`
- `relatedCounts?: { documents: number, projects?: number, tasks: number }` — for showing impact
- `onDeleted: () => void` — callback after successful deletion

**UI:**
- Red accent modal
- Header: "Permanently delete [name]?"
- Copy: "This will permanently delete this [type] and all associated data including [X documents, Y projects, Z tasks]. This cannot be undone."
- Text input: placeholder "Type [exact name] to confirm"
- Submit button: "Delete Forever" — solid red, disabled until input matches name exactly (case-sensitive)
- On success: call `onDeleted` callback, show toast "[Name] permanently deleted"

### 6. Toast with Undo

Uses the existing `sonner` library (`toast` from `sonner`).

After successfully trashing a client/project from the Settings panel:

```typescript
toast("Acme Corp moved to trash", {
  duration: 8000,
  action: {
    label: "Undo",
    onClick: () => {
      restoreMutation({ id: entityId });
      toast.success("Acme Corp restored");
    },
  },
});
```

## Files Changed Summary

| Change | File |
|--------|------|
| Add `clients.restore` mutation | `convex/clients.ts` |
| Add `clients.permanentDelete` mutation | `convex/clients.ts` |
| Add `clients.listDeleted` query | `convex/clients.ts` |
| Modify `clients.remove` — cascade to projects | `convex/clients.ts` |
| Add `projects.restore` mutation | `convex/projects.ts` |
| Add `projects.permanentDelete` mutation | `convex/projects.ts` |
| Add `projects.listDeletedByClient` query | `convex/projects.ts` |
| Remove delete button from client header | `src/app/clients/[clientId]/page.tsx` |
| Remove delete button from project header | `src/app/clients/[clientId]/projects/[projectId]/page.tsx` |
| Add restoration banner to client page | `src/app/clients/[clientId]/page.tsx` |
| Add restoration banner to project page | `src/app/clients/[clientId]/projects/[projectId]/page.tsx` |
| Add "Danger Zone" to General tab | `src/components/ClientSettingsPanel.tsx` |
| Add "Danger Zone" to General tab | `src/components/ProjectSettingsPanel.tsx` |
| Add "Show deleted" toggle | `src/app/clients/components/ClientsSidebar.tsx` |
| Add "Show deleted" toggle | `src/app/clients/[clientId]/components/ClientProjectsTab.tsx` |
| New shared component | `src/components/PermanentDeleteModal.tsx` |

## Out of Scope

- Audit trail / activity log (can be added later)
- Auto-purge after time period (indefinite retention chosen)
- Soft-delete for documents, tasks, notes, contacts (only clients and projects for now)
- Cascading permanent delete confirmation counts (showing exact related record counts — nice-to-have, can use approximate counts)
