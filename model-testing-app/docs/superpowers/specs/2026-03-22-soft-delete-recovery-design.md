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
- Modify existing `clients.remove` to cascade and set `deletedBy`
- Frontend: relocate delete to Settings, add deleted filter, restoration banner, permanent delete modal, toast with undo

No schema changes required.

## Backend Changes

### Existing (no changes)

- `projects.remove` mutation — already patches `isDeleted: true`, `deletedAt`, `deletedReason`
- Schema fields — `isDeleted`, `deletedAt`, `deletedBy`, `deletedReason` on both tables
- All list/get queries — already filter `isDeleted !== true`

### Modify: `clients.remove` (cascade + `deletedBy`)

When a client is trashed, also trash all its non-deleted projects. Set `deletedReason: "parent_client_deleted"` on cascade-trashed projects to distinguish them from independently-trashed projects. Also populate `deletedBy` with the current user identity (currently omitted by the existing mutation).

```
clients.remove handler:
  1. Get user identity via ctx.auth.getUserIdentity()
  2. Patch client with isDeleted: true, deletedAt, deletedBy: userId, deletedReason: "user_deleted"
  3. Query all projects (full table scan + JS filter for clientRoles containing this clientId) where isDeleted !== true
  4. For each project:
     a. Patch with isDeleted: true, deletedAt (same timestamp), deletedBy: userId, deletedReason: "parent_client_deleted"
     b. Invalidate context cache for the project
  5. Invalidate context cache for the client (existing)
```

**Implementation note:** Querying projects by clientId requires a full table scan because `clientRoles` is an array of objects — Convex indexes can't query nested fields within arrays. This is the existing pattern in the codebase (`.collect()` + `.filter()` in JS). Acceptable for the expected data volume.

### Modify: `projects.remove` (add `deletedBy`)

Add `deletedBy: userId` to the existing mutation (currently omitted).

### New: `clients.restore`

Unsets soft-delete fields on the client. Also restores any projects that were cascade-deleted, identified by `deletedReason === "parent_client_deleted"`. No timestamp matching needed — the reason tag is specific enough.

```
clients.restore handler:
  1. Get client, verify isDeleted === true
  2. Patch client: isDeleted: undefined, deletedAt: undefined, deletedBy: undefined, deletedReason: undefined
  3. Query projects where clientRoles contains this clientId AND deletedReason === "parent_client_deleted"
  4. For each, patch to unset all soft-delete fields + invalidate project cache
  5. Invalidate context cache for the client
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

Hard-deletes the client record and related data. Only callable when `isDeleted === true`.

**Multi-client project safety:** Projects can belong to multiple clients via `clientRoles`. When permanently deleting a client, only remove the client's `clientRole` entry from shared projects. If the project has no remaining `clientRoles` after removal AND is also soft-deleted, then hard-delete the project and its related data. If the project still has other clients, leave it intact (just remove the deleted client's role).

```
clients.permanentDelete handler:
  1. Get client, verify isDeleted === true
  2. Query all projects where clientRoles contains this clientId
  3. For each project:
     a. If project has ONLY this client in clientRoles (sole owner):
        - Hard-delete the project and all its related data (see project cleanup list below)
     b. If project has OTHER clients in clientRoles (shared project):
        - Remove this client's entry from clientRoles array (patch, not delete)
        - Do NOT delete the project itself
  4. Delete all client-level related records:
     - contacts (by clientId)
     - documents (by clientId, that are NOT also linked to a surviving project)
     - tasks (by clientId)
     - flags (by clientId)
     - notes (by clientId)
     - meetings (by clientId)
     - chatSessions (by clientId)
     - enrichmentSuggestions (by clientId)
     - reminders (by clientId, if indexed)
     - events (by clientId, if indexed)
  5. Delete the client record itself
```

**Project cleanup list** (used when a sole-owner project is hard-deleted):
- documents (by projectId)
- tasks (by projectId)
- flags (by projectId)
- notes (by projectId)
- meetings (by projectId)
- projectFolders (by projectId)
- scenarios (by projectId)
- chatSessions (by projectId)
- knowledgeLibrary entries (by projectId, if indexed)
- codifiedExtractions (by projectId, if indexed)

**Convex mutation size limits:** A client with many projects and documents could exceed Convex's ~8192 write limit per mutation. If the total related record count is large, use `ctx.scheduler.runAfter(0, ...)` to break cleanup into sub-mutations (e.g., one per project, one for client-level records). The parent mutation deletes the client record and schedules cleanup jobs. The implementer should check actual data volumes and add batching if needed.

### New: `projects.permanentDelete`

Hard-deletes the project and its related data. Only callable when `isDeleted === true`.

```
projects.permanentDelete handler:
  1. Get project, verify isDeleted === true
  2. Delete all related records (same project cleanup list as above)
  3. Delete the project record itself
  4. Invalidate context cache for related clients
```

### New: `clients.listDeleted`

Query returning all clients where `isDeleted === true`, sorted by `deletedAt` descending.

### New: `clients.deletedCount`

Query returning just the count of deleted clients. Used by the sidebar toggle to show `(N)` without loading full records. Lightweight — avoids unnecessary data transfer.

### New: `projects.listDeletedByClient`

Query accepting `clientId`, returning deleted projects for that client, sorted by `deletedAt` descending.

### New: `projects.deletedCountByClient`

Query accepting `clientId`, returning count of deleted projects for that client. Used by the projects tab toggle.

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

Below the client list, add a subtle toggle button using Lucide `Trash2` icon (not emoji):

```
<Trash2 /> Show deleted (N)
```

- `N` comes from `clients.deletedCount` query (lightweight count, not full records)
- When toggled: list switches to show only deleted clients from `listDeleted` query
- Deleted clients render with `opacity-60` and muted styling
- Toggle text changes to `← Back to active clients`
- Clicking a deleted client navigates to its page (which shows restoration banner)

**File: `src/app/clients/[clientId]/components/ClientProjectsTab.tsx`**

Same pattern — "Show deleted (N)" toggle below the project list. Uses `projects.deletedCountByClient` for the count and `projects.listDeletedByClient` for the list (only queried when toggled on).

### 4. Add restoration banner

**Files:**
- `src/app/clients/[clientId]/page.tsx`
- `src/app/clients/[clientId]/projects/[projectId]/page.tsx`

When the loaded client/project has `isDeleted === true`, render a full-width banner below the header:

- Amber/yellow background (`bg-amber-50 border-amber-200`)
- Icon: `AlertTriangle`
- Text: "This [client/project] was moved to trash on [formatted date] by [user name]"
- Two buttons:
  - **"Restore"** — primary style, calls restore mutation, shows success toast
  - **"Delete Permanently"** — ghost style with red text, opens `PermanentDeleteModal`

**Note:** The existing queries that fetch client/project data filter out `isDeleted === true`. The client/project pages will need a separate query (or the existing `get` query needs to NOT filter deleted records — it likely doesn't since `get` fetches by ID, not by list). Verify during implementation.

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

**After Undo:** The user remains on the list page (clients list or projects tab). They do not auto-navigate back to the restored entity. The success toast confirms restoration; they can click through to the entity from the list.

## Edge Cases

### Multi-client project cascade

A project can belong to Client A and Client B via `clientRoles`.

- **Trash Client A:** The project is cascade-trashed (`deletedReason: "parent_client_deleted"`). It disappears from Client B's view too (since `isDeleted` filters apply globally).
- **Restore Client A:** The project is restored. It reappears for both Client A and Client B.
- **Trash Client A, then trash Client B:** Client A's trash cascade already trashed the project. Client B's cascade skips it (already deleted). Restoring Client A restores the project. Restoring Client B does NOT restore the project (it was trashed by Client A's cascade, not Client B's — `deletedReason` doesn't match).
- **Permanent delete Client A (shared project):** Only removes Client A's `clientRole` from the project. The project survives under Client B. If the project was soft-deleted, it remains soft-deleted under Client B.

### Undo after navigation

The undo toast fires after navigating away from the trashed entity. If another user or process modifies the entity during the 8-second window, the restore mutation will still succeed (it just unsets `isDeleted`). No conflict risk.

## Files Changed Summary

| Change | File |
|--------|------|
| Modify `clients.remove` — cascade + `deletedBy` | `convex/clients.ts` |
| Modify `projects.remove` — add `deletedBy` | `convex/projects.ts` |
| Add `clients.restore` mutation | `convex/clients.ts` |
| Add `clients.permanentDelete` mutation | `convex/clients.ts` |
| Add `clients.listDeleted` query | `convex/clients.ts` |
| Add `clients.deletedCount` query | `convex/clients.ts` |
| Add `projects.restore` mutation | `convex/projects.ts` |
| Add `projects.permanentDelete` mutation | `convex/projects.ts` |
| Add `projects.listDeletedByClient` query | `convex/projects.ts` |
| Add `projects.deletedCountByClient` query | `convex/projects.ts` |
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
