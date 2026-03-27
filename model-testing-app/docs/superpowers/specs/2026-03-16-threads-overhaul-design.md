# Threads & Flagging Overhaul — Design Spec

**Date:** 2026-03-16
**Status:** Draft

## Context

The flagging system has a solid backend (6 entity types, threaded conversations, status tracking, notifications) but the frontend undersells it. Flags show bare entity IDs instead of names, threads are only visible in the global inbox, and there's no way to see a document's conversation history from the document itself. Users can't communicate without navigating to the inbox first.

This overhaul surfaces threads everywhere users work — in the document drawer, at client and project levels — and enriches the flag detail view with real entity context.

## Design Decisions

- **No schema changes**: The existing `flags` + `flagThreadEntries` tables already support everything. Each flag is a thread; documents can already have multiple flags.
- **Shared component extraction**: A reusable `ThreadPanel` component handles the thread list → thread detail → reply flow, embedded in 4 contexts (inbox, document drawer, client tab, project tab).
- **Entity name resolution**: New Convex queries resolve entity IDs to names/metadata for display. This replaces the current pattern of showing truncated IDs.
- **Icons**: Lucide icons throughout (no emoji), matching existing app patterns — `FileText`, `Building2`, `FolderKanban`, `ListTodo`, `Video`, `CheckSquare`.

---

## Workstream A: Entity Context in Flag Detail

### A1. EntityContextHeader Component

**New file:** `src/components/threads/EntityContextHeader.tsx`

A component that takes `entityType`, `entityId`, and optional `clientId`/`projectId`, resolves the entity's details, and renders a contextual card.

**Per entity type:**

| Entity Type | Icon | Title | Badges | Subtitle | Action |
|---|---|---|---|---|---|
| `document` | `FileText` | Document filename | docType, category | client/project, file size, upload date | "View Document" opens drawer |
| `client` | `Building2` | Client name | client type | contact count, last activity | "View Client" navigates |
| `project` | `FolderKanban` | Project name | status, priority | client name, loan amount | "View Project" navigates |
| `task` | `ListTodo` | Task title | status | assignee, due date | "View Task" navigates |
| `meeting` | `Video` | Meeting title | — | date, attendee count | "View Meeting" navigates |
| `checklist_item` | `CheckSquare` | Requirement name | status | category | "View Checklist" navigates |

**Data source:** New Convex query `api.flags.getEntityContext({ entityType, entityId })` that resolves the entity and returns a normalized shape: `{ name, subtitle, badges[], summary? }`. This avoids client-side multi-query complexity.

**Layout:** Compact card with Lucide icon (40px rounded square, light blue bg), entity name (bold), badges inline, subtitle line, optional summary (for documents), and action button.

### A2. Enhanced FlagDetailPanel

**File:** `src/app/inbox/components/FlagDetailPanel.tsx`

**Changes:**
- Replace the header's `{entityLabel} {flag.entityId.slice(-6)}` with `EntityContextHeader`
- For documents: the "View Document" button opens the `FileDetailPanel` sheet (the sliding drawer)
- Keep all existing functionality (resolve, reopen, delete, reply, thread timeline)

### A3. Enhanced InboxItemList

**File:** `src/app/inbox/components/InboxItemList.tsx`

**Changes to `getTitle()`:** Instead of `Flag: ${entity}`, show the resolved entity name from the enriched inbox query (B5).

**Changes to item rendering:** Add a small entity type badge (`DOC`, `PROJECT`, `CLIENT`, etc.) and location context line (client/project name) below the preview text.

**Data source:** The frontend switches from `api.flags.getInboxItems` to `api.flags.getInboxItemsEnriched` (defined in B5), which returns `entityName` and `entityContext` fields on each flag item. The old `getInboxItems` query remains for backward compatibility but is no longer called by the inbox page.

---

## Workstream B: Shared ThreadPanel Components

### B1. Component Architecture

**New directory:** `src/components/threads/`

| Component | Purpose |
|---|---|
| `ThreadPanel.tsx` | Top-level: manages list ↔ detail state, accepts filter props |
| `ThreadListView.tsx` | Scrollable list of flag threads with status, participants, reply count |
| `ThreadDetailView.tsx` | Single thread: messages + activity log + reply input |
| `ThreadEntry.tsx` | Move from `src/app/inbox/components/ThreadEntry.tsx` (shared) |
| `EntityContextHeader.tsx` | Entity info card (from Workstream A) |

### B2. ThreadPanel Props

```typescript
interface ThreadPanelProps {
  // Filter scope — at least one required
  entityType?: string;        // e.g., "document"
  entityId?: string;          // specific entity
  clientId?: string;          // all threads for a client
  projectId?: string;         // all threads for a project

  // Display options
  showEntityBadge?: boolean;  // show entity type + name on each thread (true at client/project level)
  showCreateButton?: boolean; // show "+ New Flag" button (true everywhere)
  compact?: boolean;          // smaller spacing for embedded contexts like drawer
}
```

**State management:** Internal `selectedFlagId` state. When null → shows `ThreadListView`. When set → shows `ThreadDetailView` with back button.

### B3. ThreadListView

**Queries:**
- Entity-scoped: `api.flags.getByEntity({ entityType, entityId })` (existing)
- Client-scoped: `api.flags.getByClient({ clientId })` — new query using `by_client` index
- Project-scoped: `api.flags.getByProject({ projectId })` — new query using `by_project` index

**Each thread item shows:**
- Status dot (orange = open, green = resolved)
- Open border-left accent (orange for open, transparent for resolved)
- Thread title (the flag's `note` text, first line or first 80 chars)
- Relative timestamp
- Participant avatars (small stacked circles)
- Reply count
- Status badge (OPEN / RESOLVED / URGENT)
- If `showEntityBadge`: entity type chip + entity name above the title
- Chevron right icon (`ChevronRight` from Lucide)

**Resolved threads:** Shown with muted styling (gray text). Optional "Show N resolved threads" toggle.

### B4. ThreadDetailView

Extracted from the current `FlagDetailPanel` thread section. Contains:
- Back button + thread title + status badge
- Original flag note (first message)
- Thread timeline (messages + activity entries, using shared `ThreadEntry`)
- Reply input bar: auto-resizing textarea, "Resolve & send" checkbox, Send button
- Cmd/Ctrl+Enter keyboard shortcut
- Resolve/Reopen/Delete actions in a compact toolbar

### B5. New Convex Queries

**`api.flags.getByClient({ clientId, status? })`**
- Uses `by_client` index on flags table
- Returns all flags for a client, sorted by createdAt descending
- Optional status filter

**`api.flags.getByProject({ projectId, status? })`**
- Uses `by_project` index on flags table
- Returns all flags for a project, sorted by createdAt descending
- Optional status filter

**`api.flags.getEntityContext({ entityType, entityId })`**
- Resolves entity to `{ name, subtitle, badges, summary? }`
- Document: queries `documents.get` → returns filename, docType, category, summary
- Client: queries `clients.get` → returns name, type
- Project: queries `projects.get` → returns name, status
- Task/Meeting/Checklist: similar resolution

**`api.flags.getInboxItemsEnriched({ filter?, limit? })`**
- Extends existing `getInboxItems` to join entity names
- For each flag: resolves entityId to get the entity's display name
- Returns additional `entityName` and `entityContext` fields on each item

---

## Workstream C: Threads Tab Integration

### C1. Document Drawer — Threads Tab

**File:** `src/app/docs/components/FileDetailPanel.tsx`

**Changes:**
- Add 5th tab: "Threads" with `MessageSquare` icon from Lucide (update tab grid from `grid-cols-4` to `grid-cols-5`)
- Tab shows count badge of open flags for this document (use existing `api.flags.getOpenCountByEntity`)
- Tab content renders `<ThreadPanel entityType="document" entityId={documentId} compact showCreateButton />`
- "New Flag" uses existing `FlagCreationModal` pre-filled with `entityType="document"` and `entityId`

### C2. Client Page — Threads Tab

**File:** `src/app/clients/[clientId]/page.tsx`

**New component:** `src/app/clients/[clientId]/components/ClientThreadsTab.tsx`

**Changes to page.tsx:**
- Add tab entry: `{ label: 'Threads', icon: MessageSquare, badge: openFlagCount }`
- Position after the Communications tab (Communications has real content — document timeline — so it stays)

**ClientThreadsTab content:**
- Filter bar: status pills (All, Open, Resolved) + entity type pills (Documents, Projects, Tasks)
- `<ThreadPanel clientId={clientId} showEntityBadge showCreateButton />`

**Badge count:** New query `api.flags.getOpenCountByClient({ clientId })` — counts open flags where `clientId` matches.

### C3. Project Page — Threads Tab

**File:** `src/app/clients/[clientId]/projects/[projectId]/page.tsx`

**New component:** `src/app/clients/[clientId]/projects/[projectId]/components/ProjectThreadsTab.tsx`

**Changes to page.tsx:**
- Add tab entry: `{ label: 'Threads', icon: MessageSquare, badge: openFlagCount }`
- Replaces the placeholder Communications tab (which currently just shows "Communication timeline for this project will appear here")

**ProjectThreadsTab content:**
- Filter bar: status pills (All, Open, Resolved) + entity type pills (Documents, Tasks)
- `<ThreadPanel projectId={projectId} showEntityBadge showCreateButton />`

**Badge count:** New query `api.flags.getOpenCountByProject({ projectId })` — counts open flags where `projectId` matches.

---

## Workstream D: Chat Bubble Overlap Fix

**File:** `src/app/inbox/components/FlagDetailPanel.tsx`

**Change:** Add right padding to the reply bar to clear the floating ChatAssistantButton:

```tsx
// Reply bar — current
<div className="border-t border-gray-200 px-5 py-3 bg-white">

// Reply bar — updated (extra right padding clears the 56px chat button at right-6)
<div className="border-t border-gray-200 pl-5 pr-20 py-3 bg-white">
```

This gives 80px right padding, clearing the chat button (56px wide + 24px from right edge). Simple, non-breaking change.

---

## Files Modified (Summary)

| File | Changes |
|------|---------|
| `src/components/threads/ThreadPanel.tsx` | **NEW** — shared thread list ↔ detail container |
| `src/components/threads/ThreadListView.tsx` | **NEW** — thread list with status, participants, badges |
| `src/components/threads/ThreadDetailView.tsx` | **NEW** — extracted from FlagDetailPanel thread section |
| `src/components/threads/EntityContextHeader.tsx` | **NEW** — rich entity info card |
| `src/components/threads/ThreadEntry.tsx` | **MOVED** from inbox/components/ — shared thread entry |
| `src/components/threads/utils.ts` | **NEW** — shared `relativeTime()` + `getInitial()` helpers (currently duplicated in FlagDetailPanel, InboxItemList, ThreadEntry) |
| `src/app/inbox/components/FlagDetailPanel.tsx` | Use EntityContextHeader, reply bar padding fix |
| `src/app/inbox/components/InboxItemList.tsx` | Show entity names, type badges, location context |
| `src/app/docs/components/FileDetailPanel.tsx` | Add Threads tab |
| `src/app/clients/[clientId]/page.tsx` | Add Threads tab |
| `src/app/clients/[clientId]/components/ClientThreadsTab.tsx` | **NEW** — client threads tab wrapper |
| `src/app/clients/[clientId]/projects/[projectId]/page.tsx` | Add Threads tab |
| `src/app/clients/[clientId]/projects/[projectId]/components/ProjectThreadsTab.tsx` | **NEW** — project threads tab wrapper |
| `convex/flags.ts` | Add getByClient, getByProject, getEntityContext, getInboxItemsEnriched queries, getOpenCountByClient, getOpenCountByProject |

---

## Verification

1. **Flag detail panel**: Open inbox → click a document flag → verify document name, type/category badges, summary, and "View Document" button appear instead of bare ID
2. **Inbox sidebar**: Verify flag items show entity name ("Proposed Roof Plan") instead of "Flag: Document"
3. **Document drawer Threads tab**: Open any document → Threads tab → verify open flag count badge, thread list, click into thread, reply, resolve
4. **Client Threads tab**: Navigate to a client → Threads tab → verify threads from all entity types appear with type badges, filters work (status + entity type)
5. **Project Threads tab**: Navigate to a project → Threads tab → verify project-scoped threads, filters work
6. **Chat bubble fix**: On /inbox, verify send button is not obscured by the floating chat button
7. **Multiple threads**: Create 2+ flags on the same document → verify both appear in the document drawer Threads tab
8. **Thread actions**: From any embedded thread (drawer, client tab, project tab), verify: reply, resolve & send, reopen, resolve without reply
9. **Build**: `npx next build` passes with no errors
