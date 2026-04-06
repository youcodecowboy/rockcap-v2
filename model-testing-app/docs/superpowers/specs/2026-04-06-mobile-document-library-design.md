# Mobile Document Library — Design Spec

## Overview

A drill-down document browser for the RockCap mobile companion app. Replaces the desktop's 3-pane layout with a 4-screen navigation stack: Scope/Client List → Client Detail → Folder Contents → Document Viewer. All three document scopes (Client, Internal, Personal) are supported via a top-level toggle.

The mobile doc library is read-focused — browse, preview, and inspect documents in the field. Upload is out of scope for this spec (separate feature). Filing and bulk operations remain desktop-only.

## Navigation Stack

```
Screen 1: DocsList          — Scope toggle + client list (or flat file list for Internal/Personal)
Screen 2: ClientDocDetail   — Client-level folders + project list with folder counts
Screen 3: FolderContents    — File list within a folder (with subfolders at top if any)
Screen 4: DocumentViewer    — Full-screen bottom sheet with tabbed content
```

All navigation is push/pop within the `/m-docs` route using local component state (no route changes per screen). The back button pops the stack. The tab system's route stays `/m-docs` throughout.

---

## Screen 1: DocsList

### Scope Toggle

Segmented control at the top: **Clients** | **Internal** | **Personal**. Default: Clients.

- **Clients tab**: Shows the client list (see below)
- **Internal tab**: Flat file list of all internal-scope documents (`scope === 'internal'`). No folder drill-down. Search + sort.
- **Personal tab**: Flat file list of the user's personal documents (`scope === 'personal'`, `ownerId === currentUser`). No folder drill-down. Search + sort.

Tab styling matches the mobile design system: active tab gets `--m-text-primary` + `font-medium` + 2px `--m-accent-indicator` underline. Inactive: `--m-text-tertiary`.

### Client List (Clients scope)

- **Search bar**: Text input at top, filters clients by name (client-side filter on the full list)
- **Client rows**: Each row shows:
  - Client name (14px, font-medium, `--m-text-primary`)
  - Subtitle: "{N} projects · {M} docs" (12px, `--m-text-tertiary`)
  - Chevron right (14px, `--m-text-placeholder`)
- **Tap**: Pushes Screen 2 (ClientDocDetail) with the selected client
- **Empty state**: "No clients yet" centered

### Flat File Lists (Internal / Personal scopes)

When Internal or Personal scope is active, show a flat file list instead of the client list:

- Sort bar at top (Newest first / Oldest / A-Z / Z-A / Largest)
- File rows identical to Screen 3's format (type badge, name, subtitle, tap to open viewer)
- Search filters by file name

**Data sources:**
- Client list: `clients.list()` — filter out deleted, sort by name
- Client doc counts: `documents.list()` grouped by clientId (or use a dedicated query if available)
- Client project counts: `projects.list()` grouped by clientRoles
- Internal docs: `documents.getByScope('internal')` or filter `documents.list()` where `scope === 'internal'`
- Personal docs: filter `documents.list()` where `scope === 'personal'` and `ownerId` matches current user

---

## Screen 2: ClientDocDetail

Pushed when a client is tapped from Screen 1. Shows the client's document organization.

### Header

- Back button: "← Back" or "← {previous screen}" in `--m-accent-indicator`
- Client name: right-aligned or below, 14px font-semibold `--m-text-primary`

### Client Documents Section

Section header: "Client Documents" (14px, font-semibold, `--m-text-primary`, `--m-bg-subtle` background)

Lists the client-level folders from `clientFolders` table (top-level only, `parentFolderId === undefined`):
- Folder icon (28px rounded square, amber `#fef3c7` background)
- Folder name (13px, font-medium)
- Subtitle: "{N} documents" (10px, `--m-text-tertiary`)
- Chevron right
- **Tap**: Pushes Screen 3 (FolderContents) scoped to this client folder

Also show an "Unfiled" pseudo-folder if there are documents without a folder assignment at the client level.

### Projects Section

Section header: "Projects" (14px, font-semibold, `--m-text-primary`, `--m-bg-subtle` background)

Lists the client's projects from `projects.list({ clientId })`:
- Project icon (28px rounded square, blue `#eff6ff` background)
- Project name (13px, font-medium)
- Subtitle: "{N} folders · {M} docs" (10px, `--m-text-tertiary`)
- Chevron right
- **Tap**: Pushes an intermediate screen showing that project's folders (same layout as the Client Documents section, but using `projectFolders` table data). From there, tapping a folder pushes Screen 3.

### Data Sources

- Client folders: `clientFolders` query filtered by `clientId`, top-level only
- Client folder doc counts: `documents.getFolderCounts(clientId)` or compute from `documents.getByClient(clientId)` grouped by `folderId`
- Projects: `projects.list({ clientId })`
- Project folders: `projectFolders` query filtered by `projectId`, top-level only
- Project folder doc counts: compute from `documents.getByProject(projectId)` grouped by `folderId`

---

## Screen 3: FolderContents

Pushed when a folder is tapped from Screen 2 (or the project folder list).

### Header

- Back link: "← {client name}" or "← {project name}" in `--m-accent-indicator`
- Folder name: 14px, font-semibold, `--m-text-primary`
- Context line: "{project name} · {N} documents" (10px, `--m-text-tertiary`)

### Sort Bar

Compact bar below header:
- Left: "Sort: Newest first" (tappable, cycles through sort options or opens a small dropdown)

Sort options: Date newest, Date oldest, Name A-Z, Name Z-A, Size largest

### Subfolders (if any)

If the folder has children (`parentFolderId` matching this folder), show them first:
- Same folder row style as Screen 2 (folder icon, name, doc count, chevron)
- Tapping a subfolder pushes another Screen 3 for that subfolder

### File Rows

Each document in this folder:
- **Type badge**: 32px rounded square, color-coded by file type:
  - PDF: red bg (`#fef2f2`), red text (`#991b1b`)
  - DOC/DOCX: blue bg (`#eff6ff`), blue text (`#1e40af`)
  - XLS/XLSX: green bg (`#f0fdf4`), green text (`#166534`)
  - IMG (jpg/png): purple bg (`#faf5ff`), purple text (`#6b21a8`)
  - Other: gray bg (`#f8fafc`), gray text (`#475569`)
- **Name**: document `displayName || fileName`, 13px font-medium, truncated
- **Subtitle**: "{category} · {fileSize} · {uploadDate}" (10px, `--m-text-tertiary`)
- **Tap**: Opens Screen 4 (DocumentViewer) for this document

### Data Sources

- Folder documents: `documents.getByFolder(clientId, folderType, level, projectId?)` or filter from `documents.getByClient/getByProject` where `folderId` matches
- Subfolders: `clientFolders` or `projectFolders` where `parentFolderId` matches current folder

---

## Screen 4: DocumentViewer

Full-screen bottom sheet that slides up when a file is tapped. Covers the entire viewport.

### Structure

```
┌─────────────────────────────┐
│ Title / metadata    [close] │  Header (fixed)
├─────────────────────────────┤
│ Preview│Summary│Class│Det│… │  Scrollable tab bar (fixed)
├─────────────────────────────┤
│                             │
│   Tab content               │  Scrollable content area
│   (fills remaining space)   │
│                             │
└─────────────────────────────┘
```

### Header

- Document title: `displayName || fileName`, 14px font-semibold, `--m-text-primary`, truncated
- Subtitle: "{category} · {client name} · {project name}" (10px, `--m-text-tertiary`)
- Close button (X icon, top-right): dismisses the viewer, returns to Screen 3

### Tab Bar

Horizontally scrollable tab bar. Active tab: `--m-text-primary` font-medium + 2px `--m-accent-indicator` bottom border. Inactive: `--m-text-tertiary`.

**Tabs (in order):**

1. **Preview**
2. **Summary**
3. **Classification**
4. **Details**
5. **Intelligence**
6. **Notes**

### Tab Content

#### 1. Preview

- Single-page document preview:
  - PDF: Render first page via `<iframe>` with the Convex storage URL, or a thumbnail if available
  - Images (jpg/png/gif): Full-width `<img>` with `object-contain`
  - Other formats: File type icon + "Preview not available" message
- Below the preview, two action buttons side by side:
  - **Download** (primary, black bg): Fetches file from Convex storage, triggers browser download
  - **Open in browser** (secondary, `--m-bg-inset` bg): Opens the file URL in a new browser tab for native viewer

#### 2. Summary

- **Executive Summary**: The `documentAnalysis.executiveSummary` field, displayed as body text
- **Detailed Summary**: The `documentAnalysis.detailedSummary` field, if present
- **Key Dates**: List of `documentAnalysis.keyDates` as chips/badges
- **Key Amounts**: List of `documentAnalysis.keyAmounts` as chips/badges
- **Key Terms**: List of `documentAnalysis.keyTerms` as chips/badges
- Empty state if no analysis: "Document not yet analyzed"

#### 3. Classification

- **Document Type**: `fileTypeDetected` displayed as a badge
- **Category**: `category` with color-coded badge (matching desktop color scheme)
- **Confidence**: `confidence` as percentage badge (green ≥80%, amber ≥60%, red <60%)
- **Characteristics**: Boolean flags from `documentAnalysis.documentCharacteristics` — show only true values as small badges (Financial, Legal, Identity, Report, etc.)
- **Classification Reasoning**: `classificationReasoning` as collapsible text

#### 4. Details

- **File name**: `fileName`
- **Display name**: `displayName` (if different)
- **Document code**: `documentCode`
- **File size**: Formatted (KB/MB)
- **File type**: MIME type simplified (PDF, DOCX, etc.)
- **Version**: `version` if present
- **Uploaded by**: `uploaderInitials`
- **Uploaded**: `uploadedAt` formatted date
- **Last opened**: `lastOpenedAt` formatted date (if present)

Display as a simple key-value list with labels in `--m-text-tertiary` and values in `--m-text-primary`.

#### 5. Intelligence

- Fetch intelligence items via `documents.getDocumentIntelligence(documentId)` (knowledgeItems linked to this document)
- Group by `category` (Financial, Legal, Entity, etc.)
- Each group: section header with category name
- Each item: label (12px, `--m-text-tertiary`), value (13px, `--m-text-primary`), confidence badge if available
- Empty state: "No intelligence extracted yet" with note about running analysis from desktop

#### 6. Notes

- List of document notes fetched via the notes system
- Each note: author, timestamp, content
- Simple display only — note creation is a future enhancement for mobile
- Empty state: "No notes yet"

### Data Sources

- Document data: `documents.get(documentId)` — single document with all fields
- File URL: Convex storage URL from `fileStorageId`
- Intelligence items: `documents.getDocumentIntelligence(documentId)` or query `knowledgeItems` by `sourceDocumentId`
- Notes: Query document notes by `documentId`

---

## Component Structure

```
src/app/(mobile)/m-docs/
├── page.tsx                              — Server component, imports DocsContent
└── components/
    ├── DocsContent.tsx                   — Client component, navigation stack state machine
    ├── DocsList.tsx                      — Screen 1: scope toggle + client list / flat file list
    ├── ClientDocDetail.tsx               — Screen 2: client folders + project list
    ├── ProjectFolderList.tsx             — Intermediate: project's folder list
    ├── FolderContents.tsx                — Screen 3: file list within a folder
    ├── DocumentViewer.tsx                — Screen 4: full-screen bottom sheet with tabs
    ├── DocumentViewerTabs/
    │   ├── PreviewTab.tsx                — File preview + download/open actions
    │   ├── SummaryTab.tsx                — Executive summary, key dates/amounts/terms
    │   ├── ClassificationTab.tsx         — Document type, category, characteristics
    │   ├── DetailsTab.tsx                — File metadata key-value list
    │   ├── IntelligenceTab.tsx           — Extracted intelligence grouped by category
    │   └── NotesTab.tsx                  — Document notes list
    └── shared/
        ├── FileRow.tsx                   — Reusable file list item (type badge + name + subtitle)
        ├── FolderRow.tsx                 — Reusable folder list item (icon + name + count)
        └── FileTypeBadge.tsx             — Color-coded type badge (PDF/DOC/XLS/IMG/other)
```

### Navigation State Machine

`DocsContent` manages a stack of navigation states:

```typescript
type NavScreen =
  | { screen: 'list' }
  | { screen: 'client'; clientId: string; clientName: string }
  | { screen: 'projectFolders'; clientId: string; clientName: string; projectId: string; projectName: string }
  | { screen: 'folder'; clientId: string; clientName: string; projectId?: string; projectName?: string; folderId: string; folderName: string; folderType: 'client' | 'project' }
  | { screen: 'viewer'; documentId: string };
```

Navigation is a simple array (stack). Push to go forward, pop to go back. The viewer is a special case — it renders as an overlay on top of the current screen rather than replacing it.

---

## Styling Rules

All components follow `MOBILE_DESIGN_SYSTEM.md` tokens. Specific to the doc library:

- No card shadows — borders only, consistent with dashboard
- Section headers: 14px font-semibold `--m-text-primary` on `--m-bg-subtle` background
- File rows: `px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)]` with `active:bg-[var(--m-bg-subtle)]`
- Folder rows: Same as file rows but with folder icon
- Viewer uses `fixed inset-0 z-50` — fully covers the screen including header/footer
- Tab bar: horizontally scrollable, same underline indicator pattern as dashboard recents

---

## Scope Boundaries

**In scope:**
- All 4 screens with real Convex data
- All 3 scopes (Client, Internal, Personal)
- Client-level and project-level folder navigation
- Subfolder support
- Document viewer with all 6 tabs
- File preview (PDF iframe, image display, fallback for other types)
- Download and open-in-browser actions
- Search (client list and file lists)
- Sort (file lists)

**Out of scope:**
- File upload (separate feature)
- Document filing / moving between folders
- Bulk operations (select multiple, bulk move/delete)
- Document analysis trigger ("Analyze" button — desktop only for now)
- Note creation (read-only display of existing notes)
- Drag-and-drop (not applicable on mobile)
- Version chain display (show latest version only)
- Checklist tab (deferred — add when checklist system is ready for mobile)
- Filter by category (deferred — sort is sufficient for first pass)
