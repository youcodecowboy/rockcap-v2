# Mobile Clients & Projects — Design Spec

**Date:** 2026-04-09
**Branch:** mobile
**Status:** Approved (revised post-Codex review)

## Purpose

Build the mobile client/project area (`/m-clients`) as a quick-access information hub. Users on mobile need to rapidly find client information — notes, documents, intelligence, checklist status, meeting summaries, tasks, and flag threads — without the overhead of the desktop's dense multi-panel layout.

## Navigation Architecture

Single route (`/m-clients`), all navigation via in-component push/pop state machine — identical pattern to `DocsContent.tsx` in the mobile doc library.

### NavScreen Union Type

```typescript
type NavScreen =
  | { screen: 'list' }
  | { screen: 'client'; clientId: string; clientName: string }
  | { screen: 'project'; clientId: string; clientName: string; projectId: string; projectName: string };
```

Folder drill-down and document viewer states are **not** in this top-level union. The Docs tab components embed their own nested push/pop navigator internally (reusing the existing m-docs folder → contents → viewer flow). This keeps tab context alive — the tab bar stays visible while drilling into folders, and switching tabs doesn't lose folder position.

### Direct Entry from Dashboard

The dashboard recents section and future deep links can open `/m-clients` pre-navigated to a specific client or project. This uses the same `TabContext` params pattern that m-docs uses for documents:

```typescript
// TabContext param: { clientId: "abc123" }
// On mount, ClientsContent reads activeTab.params.clientId
// and auto-pushes the client detail screen
```

### Flow

```
Client List → Client Detail (9 tabs)
                  └─ Projects tab → Project Detail (6 tabs)
                  └─ Docs tab → [nested] Folder List → Folder Contents → Document Viewer
```

- Back button pops the stack (same `push`/`pop` pattern as doc library)
- Document viewer reuses the existing `DocumentViewer` component from m-docs
- URL stays at `/m-clients` throughout — all state is in-component

## Client List Screen

Reuses the visual pattern from `DocsList.tsx` Clients scope:

- Search bar at top (filters by client name)
- Alphabetically sorted list
- Per row: client name, type badge (borrower/lender/etc.), subtitle with `"{N} projects · {M} docs"`, chevron right
- Tap → pushes client detail screen

**Queries:**
- `api.clients.list` — all non-deleted clients
- `api.documents.getClientDocumentCounts` — doc counts per client
- `api.projects.list` — for project counts (client-side group-by)

## Client Detail Screen

### Layout Structure

```
┌──────────────────────────────────────┐
│ ← Clients    Client Name     Active │  ← header bar
├──────────────────────────────────────┤
│ Overview │ Projects │ Docs │ Intel… │  ← horizontally scrollable tab bar
├──────────────────────────────────────┤
│                                      │
│         Tab content fills            │  ← full remaining viewport
│         remaining space              │
│                                      │
└──────────────────────────────────────┘
```

- Header: back button left, client name + status badge right
- Tab bar: 9 horizontally scrollable pills (same styling as xlsx sheet picker / doc library scope tabs)
- Tab content: full page below the tab bar, each tab is independently scrollable

### Tabs (9)

1. **Overview** — landing page, metric cards + shortcut sections
2. **Projects** — project list, tap to push project detail
3. **Docs** — client-level folder browser + file list (nested navigator)
4. **Intelligence** — knowledge items from knowledgeLibrary
5. **Notes** — notes list + create (uses `notes` table, not `documentNotes`)
6. **Tasks** — my active/completed tasks for this client
7. **Checklist** — client-level compliance checklist with progress
8. **Meetings** — meeting summary list (read-only, expandable)
9. **Threads** — flag threads (read + comment, placeholder for future messaging)

## Client Tab Details

### Overview Tab

Vertical stack of dense, tappable summary cards. Each card previews data from another tab and taps through to it.

```
┌─────────────────────────────────────┐
│ Client Name                  Active │
│ Borrower · 3 projects · 47 docs    │
│ john@bayfield.com    07700 123456  │  ← tappable email/phone
├─────────────────────────────────────┤
│ ▸ Active Tasks                   3 │  → Tasks tab
│   Complete site survey        Due… │
│   Submit planning docs        Due… │
├─────────────────────────────────────┤
│ ▸ Open Flags                    2  │  → Threads tab
│   Missing KYC documentation        │
├─────────────────────────────────────┤
│ ▸ Recent Documents             47  │  → Docs tab
│   BAYFIELD-APPRAISAL-V1.0         │
│   Planning Permission Report       │
├─────────────────────────────────────┤
│ ▸ Intelligence                 12  │  → Intelligence tab
│   Total GDV: £57.8M               │
│   Peak Loan: £24.4M               │
├─────────────────────────────────────┤
│ ▸ Checklist Progress          67%  │  → Checklist tab
│   ████████░░░░  8/12 items         │
├─────────────────────────────────────┤
│ ▸ Key Contacts                  4  │  ← inline, no separate tab
│   John Smith · Director            │
│   Sarah Lee · Solicitor            │
└─────────────────────────────────────┘
```

**Queries:**
- `api.clients.get(clientId)` — name, email, phone, type, status
- `api.clients.getStats(clientId)` — project count, doc count, active projects, last activity
- `api.tasks.getByClient(clientId)` — first 3 of current user's active tasks
- `api.flags.getOpenCountByClient(clientId)` — open flag count
- `api.documents.getClientDocumentCounts(clientId)` — total doc count
- `api.knowledgeLibrary.getClientLevelChecklist(clientId)` — completion ratio
- `api.contacts.getByClient(clientId)` — key contacts (if query exists)

### Projects Tab

- List of projects for this client
- Per row: project name, status badge (active/completed/on-hold), shortcode if present
- Subtitle: doc count, loan amount (if present), last activity
- Tap → pushes project detail screen
- No create/delete on mobile (desktop-only workflow)

**Query:** `api.projects.getByClient(clientId)`

### Docs Tab

Reuses mobile doc library components with a **nested navigator** embedded inside the tab. The Docs tab manages its own folder drill-down state independently of the top-level `ClientsContent` nav stack. This means:

- The tab bar stays visible while drilling into folders
- Switching to another tab and back preserves folder position
- The document viewer is pushed onto the nested doc navigator, not the parent

Components reused from m-docs:
- `ClientDocDetail.tsx` pattern for client-level folder list
- `FolderContents` for folder contents display
- `FileRow` / `FolderRow` for individual items
- `DocumentViewer` for viewing documents
- `MoveFileSheet` for moving files between folders

All existing doc actions (move, duplicate, delete, flag) are included — these are already built and tested for mobile, and the client docs tab is a natural place to use them.

**Queries:**
- `api.folderStructure.getAllFoldersForClient(clientId)` — folder topology
- `api.documents.getByFolder({ clientId, folderType, level: 'client' })` — folder contents
- `api.documents.getFolderCounts(clientId)` — doc counts per folder

### Intelligence Tab

Displays knowledge items from the `knowledgeLibrary` system (same data model as desktop `ClientKnowledgeTab`), NOT document-level intelligence extractions.

- List of knowledge items grouped by category
- Per entry: title/key, value, source reference, confidence level
- Read-only on mobile

**Query:** `api.knowledgeLibrary.getKnowledgeItemsByClient(clientId)` — verify this exists; if not, use the knowledge items returned by `getClientLevelChecklist` or add a new query

### Notes Tab

Uses the `notes` table (NOT `documentNotes`). Client/project notes have a different data model from document notes: they require a `title` and rich-text `content`.

- List of notes: title, content preview (2-line truncate), created date, author
- "Add Note" button at top
- Tap add → lightweight composer: title input + plain-text body textarea + submit button
- The composer writes a minimal rich-text document (just a text paragraph) via `api.notes.create`
- Notes are visible on both desktop and mobile

**Queries:**
- `api.notes.getByClient(clientId)` — or filter `api.notes.list` by clientId
- `api.notes.create({ clientId, title, content })` — for new notes

### Tasks Tab

Shows the **current user's** tasks for this client (not all users' tasks — this matches the existing `api.tasks.getByClient` query which is user-scoped). This is a deliberate product decision: mobile is a personal productivity tool, not a team management surface.

- Two sections: **Active** (sorted by due date) and **Completed** (collapsed by default, tap to expand)
- Per task: title, due date badge, assignee, status indicator
- Tap checkbox to toggle complete

**Query:** `api.tasks.getByClient(clientId)` — returns current user's tasks only

### Checklist Tab

Uses `getClientLevelChecklist` (NOT `getChecklistByClient` which includes project-level items). Status values follow the existing schema: `missing`, `pending_review`, `fulfilled`.

- Progress bar at top: percentage + `N/M fulfilled`
- Items grouped by category
- Per item: name, status toggle cycling through `missing` → `pending_review` → `fulfilled`, linked document name if any
- Tap status to cycle

**Queries:**
- `api.knowledgeLibrary.getClientLevelChecklist(clientId)` — client-only checklist items
- `api.knowledgeLibrary.updateChecklistItemStatus(...)` — status toggle mutation

### Meetings Tab

- List sorted by date (newest first)
- Per meeting: title, date, attendees (comma-separated names), summary preview (2-line truncate)
- Tap to expand full summary inline (accordion, not a new screen)
- Read-only on mobile — no create/edit

**Query:** `api.meetings.getByClient(clientId)` — verify this exists; may need to filter `api.meetings.list` by clientId

### Threads Tab

- List of flags/threads for this client
- Per flag: title, status badge (open/resolved), created date, entry count
- Tap to expand thread entries inline
- Comment input at bottom of expanded thread (simple text + submit)
- Placeholder for future messaging expansion

**Query:** `api.flags.getByClient(clientId)` — verify this exists; may need new query

## Project Detail Screen

### Layout

Same pattern as Client Detail:
- Header: back button (← Client Name), project name + status badge
- 6 horizontally scrollable tabs
- Tab content fills remaining viewport

### Tabs (6)

1. **Overview** — project metrics + shortcut cards (same pattern as client overview, project-scoped)
2. **Docs** — project-level folder browser + file list (nested navigator)
3. **Tasks** — project-scoped active/completed tasks (current user only)
4. **Intelligence** — project-scoped knowledge items
5. **Checklist** — project-scoped checklist
6. **Notes** — project-scoped notes

### Project Overview Tab

Same card-stack pattern as client overview but project-scoped:
- Project name, status, shortcode, loan amount, created date, due date
- Active tasks count → Tasks tab
- Doc count → Docs tab
- Checklist progress → Checklist tab
- No contacts section (contacts live at client level)

**Queries:**
- `api.projects.get(projectId)`
- `api.projects.getStats(projectId)` — doc count, loan amount, last activity
- `api.tasks.getActiveCountByProject(projectId)`

### Project Docs Tab

Uses the same nested-navigator pattern as client Docs tab, but scoped to project-level folders:

- Folder list via `folderStructure.getAllFoldersForClient(clientId)` → filter to project folders for `projectId`
- Folder contents via `documents.getByFolder({ clientId, projectId, folderType, level: 'project' })`
- Reuses `ProjectFolderList.tsx` pattern from existing m-docs

This is NOT a simple "swap clientId for projectId" — the folder topology query takes `clientId` and the project folders are extracted from its response. The folder contents query takes both `clientId` AND `projectId` plus `level: 'project'`.

### Project Tasks/Intelligence/Checklist/Notes

Same patterns as client-level versions with project-scoped queries:
- Tasks: `api.tasks.getByProject(projectId)` (current user only)
- Intelligence: `api.knowledgeLibrary.getKnowledgeItemsByProject(projectId)` (verify/create)
- Checklist: `api.knowledgeLibrary.getChecklistByProject(projectId)` with `missing`/`pending_review`/`fulfilled` statuses
- Notes: `api.notes.getByProject(projectId)` or filter by projectId

## Component Structure

```
src/app/(mobile)/m-clients/
├── page.tsx                          ← shell, renders ClientsContent
└── components/
    ├── ClientsContent.tsx            ← nav state machine (list/client/project)
    ├── ClientList.tsx                ← searchable client list
    ├── ClientDetail.tsx              ← tab bar + tab content router
    ├── ProjectDetail.tsx             ← tab bar + tab content router
    └── tabs/
        ├── ClientOverviewTab.tsx     ← metric cards + shortcut sections
        ├── ClientProjectsTab.tsx     ← project list
        ├── ClientDocsTab.tsx         ← nested doc navigator (reuses m-docs components)
        ├── ClientIntelligenceTab.tsx ← knowledge items list
        ├── ClientNotesTab.tsx        ← notes list + lightweight composer
        ├── ClientTasksTab.tsx        ← user's active/completed tasks
        ├── ClientChecklistTab.tsx    ← client-level checklist (missing/pending/fulfilled)
        ├── ClientMeetingsTab.tsx     ← meeting summaries (accordion)
        ├── ClientThreadsTab.tsx      ← flag threads (read + comment)
        ├── ProjectOverviewTab.tsx    ← project metrics + shortcuts
        ├── ProjectDocsTab.tsx        ← project-scoped nested doc navigator
        ├── ProjectTasksTab.tsx       ← project-scoped tasks
        ├── ProjectIntelligenceTab.tsx← project-scoped knowledge items
        ├── ProjectChecklistTab.tsx   ← project-scoped checklist
        └── ProjectNotesTab.tsx       ← project-scoped notes
```

## Shared Component Reuse

| Component | Source | Used In |
|-----------|--------|---------|
| `FolderContents` | `m-docs/components/FolderContents.tsx` | ClientDocsTab, ProjectDocsTab |
| `FileRow` | `m-docs/components/shared/FileRow.tsx` | All doc tabs (includes move/duplicate/delete/flag actions) |
| `FolderRow` | `m-docs/components/shared/FolderRow.tsx` | All doc tabs |
| `DocumentViewer` | `m-docs/components/DocumentViewer.tsx` | Pushed onto nested doc nav from any doc tap |
| `MoveFileSheet` | `m-docs/components/MoveFileSheet.tsx` | Available from FileRow's action menu |
| `ProjectFolderList` | `m-docs/components/ProjectFolderList.tsx` | ProjectDocsTab |
| `ClientDocDetail` | `m-docs/components/ClientDocDetail.tsx` | ClientDocsTab (pattern reference) |

## Design Tokens

Uses existing mobile design system (`--m-` prefix tokens from `globals.css`):
- Same background, text, border, accent colors
- Same typography scale (13px body, 11px meta, 14px section headers)
- Same spacing (`--m-page-px` for horizontal padding)
- Tab pills use the same black/white active/inactive styling as xlsx sheet picker

## What's NOT Being Built

- Contact management CRUD (contacts shown read-only in Overview)
- Meeting creation/editing (meetings shown read-only as summaries)
- Communications tab (desktop-only)
- Data tab (desktop-only)
- Project create/delete (desktop-only)
- Full folder browser tree (simplified folder list instead)
- Team-wide task view (mobile shows current user's tasks only)

## Backend Queries to Verify/Create

During implementation, verify which queries exist and add simple new ones where needed:

| Query | Table | Notes |
|-------|-------|-------|
| `knowledgeLibrary.getKnowledgeItemsByClient` | knowledgeLibrary | May exist; if not, add |
| `knowledgeLibrary.getKnowledgeItemsByProject` | knowledgeLibrary | May exist; if not, add |
| `notes.getByClient(clientId)` | notes | Filter by clientId |
| `notes.getByProject(projectId)` | notes | Filter by projectId |
| `meetings.getByClient(clientId)` | meetings | May need new query |
| `flags.getByClient(clientId)` | flags | May need new query |
| `contacts.getByClient(clientId)` | contacts | May need new query |
