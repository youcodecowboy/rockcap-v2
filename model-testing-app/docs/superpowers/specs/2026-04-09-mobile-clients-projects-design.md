# Mobile Clients & Projects — Design Spec

**Date:** 2026-04-09
**Branch:** mobile
**Status:** Approved

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

### Flow

```
Client List → Client Detail (9 tabs)
                  └─ Projects tab → Project Detail (6 tabs)
                                         └─ Docs tab → Document Viewer (reused from m-docs)
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
3. **Docs** — client-level folder browser + file list
4. **Intelligence** — AI-extracted intelligence entries
5. **Notes** — notes list + create
6. **Tasks** — active/completed task lists
7. **Checklist** — compliance checklist with progress
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
- `api.tasks.getByClient(clientId)` — first 3 active tasks
- `api.flags.getOpenCountByClient(clientId)` — open flag count
- `api.documents.getClientDocumentCounts(clientId)` — total doc count
- `api.knowledgeLibrary.getChecklistByClient(clientId)` — completion ratio
- `api.contacts.getByClient(clientId)` — key contacts (if query exists)

### Projects Tab

- List of projects for this client
- Per row: project name, status badge (active/completed/on-hold), shortcode if present
- Subtitle: doc count, loan amount (if present), last activity
- Tap → pushes project detail screen
- No create/delete on mobile (desktop-only workflow)

**Query:** `api.projects.getByClient(clientId)`

### Docs Tab

Reuses mobile doc library components:
- Client-level folder list (same as `ClientDocDetail.tsx` in m-docs)
- Tap folder → folder contents (reuses `FolderContents` component)
- Tap file → pushes document viewer onto nav stack

**Queries:**
- `api.folderStructure.getAllFoldersForClient(clientId)`
- `api.documents.getByFolder(...)`
- `api.documents.getFolderCounts(clientId)`

### Intelligence Tab

- List of intelligence entries grouped by type (CUSTOM, EXTRACTED)
- Per entry: title, value, confidence badge, source document name
- Read-only on mobile

**Query:** `api.documents.getDocumentIntelligence` scoped to client (may need a new `getByClient` variant)

### Notes Tab

- List of notes: content preview (2-line truncate), created date, author
- "Add Note" button at top
- Tap add → inline textarea + submit button (same pattern as doc viewer NotesTab)
- Notes are visible on both desktop and mobile

**Query:** `api.documentNotes.getByClient(clientId)` (may need new query)

### Tasks Tab

- Two sections: **Active** (sorted by due date) and **Completed** (collapsed by default, tap to expand)
- Per task: title, due date badge, assignee, status indicator
- Tap checkbox to toggle complete

**Query:** `api.tasks.getByClient(clientId)`

### Checklist Tab

- Progress bar at top: percentage + `N/M complete`
- Items grouped by category
- Per item: name, status toggle (complete/incomplete/N/A), linked document name if any
- Tap checkbox to toggle status

**Query:** `api.knowledgeLibrary.getChecklistByClient(clientId)`

### Meetings Tab

- List sorted by date (newest first)
- Per meeting: title, date, attendees (comma-separated names), summary preview (2-line truncate)
- Tap to expand full summary inline (accordion, not a new screen)
- Read-only on mobile — no create/edit

**Query:** `api.meetings.getByClient(clientId)` (may need new query or filter existing)

### Threads Tab

- List of flags/threads for this client
- Per flag: title, status badge (open/resolved), created date, entry count
- Tap to expand thread entries inline
- Comment input at bottom of expanded thread (simple text + submit)
- Placeholder for future messaging expansion

**Query:** `api.flags.getByClient(clientId)` (may need new query)

## Project Detail Screen

### Layout

Same pattern as Client Detail:
- Header: back button (← Client Name), project name + status badge
- 6 horizontally scrollable tabs
- Tab content fills remaining viewport

### Tabs (6)

1. **Overview** — project metrics + shortcut cards (same pattern as client overview, project-scoped)
2. **Docs** — project-level folder browser + file list
3. **Tasks** — project-scoped active/completed tasks
4. **Intelligence** — project-scoped intelligence entries
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

### Project Docs/Tasks/Intelligence/Checklist/Notes

Identical patterns to client-level versions, scoped by `projectId` instead of `clientId` in queries.

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
        ├── ClientDocsTab.tsx         ← reuses m-docs folder components
        ├── ClientIntelligenceTab.tsx ← intelligence entries list
        ├── ClientNotesTab.tsx        ← notes list + create
        ├── ClientTasksTab.tsx        ← active/completed tasks
        ├── ClientChecklistTab.tsx    ← checklist progress + items
        ├── ClientMeetingsTab.tsx     ← meeting summaries (accordion)
        ├── ClientThreadsTab.tsx      ← flag threads (read + comment)
        ├── ProjectOverviewTab.tsx    ← project metrics + shortcuts
        ├── ProjectDocsTab.tsx        ← project-scoped folder browser
        ├── ProjectTasksTab.tsx       ← project-scoped tasks
        ├── ProjectIntelligenceTab.tsx← project-scoped intelligence
        ├── ProjectChecklistTab.tsx   ← project-scoped checklist
        └── ProjectNotesTab.tsx       ← project-scoped notes
```

## Shared Component Reuse

| Component | Source | Used In |
|-----------|--------|---------|
| `FolderContents` | `m-docs/components/FolderContents.tsx` | ClientDocsTab, ProjectDocsTab |
| `FileRow` | `m-docs/components/shared/FileRow.tsx` | All doc tabs |
| `FolderRow` | `m-docs/components/shared/FolderRow.tsx` | All doc tabs |
| `DocumentViewer` | `m-docs/components/DocumentViewer.tsx` | Pushed onto nav stack from any doc tap |
| `MoveFileSheet` | `m-docs/components/MoveFileSheet.tsx` | Available from FileRow's action menu |

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

## Backend Queries

Some queries may not exist yet at the client/project scope. During implementation, either:
1. Use existing queries with client-side filtering (e.g., filter a global list by clientId)
2. Add simple new Convex queries where client-side filtering would be too expensive

Queries to verify/create during implementation:
- `api.contacts.getByClient(clientId)` — may not exist
- `api.meetings.getByClient(clientId)` — may not exist  
- `api.flags.getByClient(clientId)` — may not exist
- `api.documentNotes.getByClient(clientId)` — may not exist
- Intelligence queries scoped to client/project — may need new variants
