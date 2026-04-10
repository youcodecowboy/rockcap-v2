# Mobile Upload V2 — Design Spec

**Date:** 2026-04-10
**Branch:** main
**Status:** Approved

## Purpose

Rework the mobile upload to use the exact same bulk upload pipeline as desktop. The current mobile upload is a lightweight wrapper around `directUpload` + `/api/analyze-file` — it bypasses the V4 pipeline, produces minimal analysis, and doesn't create batch records. This rework uses `bulkUpload.createBatch` + `BulkQueueProcessor` + `bulkUpload.fileBatch` — the identical infrastructure desktop uses — with a mobile-native frontend.

## What Changes

The existing `/m-upload` page and all its components are replaced. The `UploadContext` provider is removed — state now lives in Convex via batch/item queries, providing true persistence across route changes, app closes, and even cross-device continuity (start on mobile, finish on desktop).

### Files to Remove
- `src/contexts/UploadContext.tsx` (and its provider in `layout.tsx`)
- All existing `src/app/(mobile)/m-upload/components/*.tsx`

### Files to Create
New components following the four-phase flow: Setup → Processing → Review → Completion.

## Architecture

```
Setup page (scope → client → project → folder → instructions → files)
  ↓
bulkUpload.createBatch() → batchId
bulkUpload.addItemToBatch() × N → itemIds
  ↓
BulkQueueProcessor (foreground, 1-5 files)
  → uploads to Convex storage (generateUploadUrl + POST)
  → calls /api/v4-analyze with full metadata (client, project, shortcode, instructions, checklist items, available folders, folder hints)
  → saves results to bulkUploadItems via updateItemAnalysis
  ↓
Review reads bulkUploadItems via useQuery(api.bulkUpload.getBatchItems)
  → editable: classification, folder, project assignment, internal/external
  → read-only: summary, document analysis, intelligence fields, checklist matches, reasoning
  ↓
bulkUpload.fileBatch() → documents created, intelligence saved, checklist linked, knowledge bank entries
  ↓
Completion summary
```

**Key decisions:**
1. Uses the real `BulkQueueProcessor` class — no reimplementation
2. Batches appear in desktop upload history — cross-device continuity
3. Foreground processing only (max 5 files)
4. State lives in Convex (batch + items), not React context — true persistence
5. `fileBatch` handles everything: document creation, intelligence saving, checklist linking, knowledge bank, version handling

## Phase 1: Setup

Single scrollable page with progressive disclosure. Each section reveals after the previous selection.

### Layout

```
┌──────────────────────────────────────┐
│ Upload Documents                     │
├──────────────────────────────────────┤
│ DOCUMENT SCOPE                       │
│ [ Client ] [ Internal ] [ Personal ] │
├──────────────────────────────────────┤
│ CLIENT           (scope=client only) │
│ ┌──────────────────────────────────┐ │
│ │ Bayfield Homes                 >│ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ PROJECT          (scope=client only) │
│ ┌──────────────────────────────────┐ │
│ │ Comberton Rise     [COMB]      >│ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ FOLDER          CLASSIFICATION       │
│ [Appraisals ▼]  [External][Internal]│
├──────────────────────────────────────┤
│ ADDITIONAL INSTRUCTIONS        [▼]  │
│ ┌──────────────────────────────────┐ │
│ │ (textarea, collapsed default)   │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ FILES                                │
│ ┌ - - - - - - - - - - - - - - - ─┐ │
│ │    Select files to upload       │ │
│ │    [Choose Files]               │ │
│ └ - - - - - - - - - - - - - - - ─┘ │
│ file1.pdf                    2.3 MB ×│
│ file2.xlsx                   890 KB ×│
├──────────────────────────────────────┤
│      [ Upload & Analyze ]            │  ← sticky above footer
├──────────────────────────────────────┤
│  [Home] [Clients] [💬] [Docs] [Inbox]│
└──────────────────────────────────────┘
```

### Scope Selection

Three toggle buttons at the top: Client / Internal / Personal.

- **Client** (default): Shows client picker → project picker → folder picker → internal/external toggle
- **Internal**: Shows internal folder picker (queries `api.internalFolders.list` or similar). No client/project.
- **Personal**: Shows personal folder picker. No client/project.

Scope selection is remembered in localStorage (matching desktop's `rockcap-filing-last-selection`).

### Client Selection

Tappable card → opens bottom sheet with searchable client list.
- Query: `api.clients.list({})`
- Selection stores `clientId` and `clientName`
- Clearing client cascades: clears project, folder

### Project Selection (client scope only)

Tappable card → opens bottom sheet with searchable project list for selected client.
- Query: `api.projects.getByClient({ clientId })`
- Shows project name + shortcode badge
- "Client-level (no project)" option at top
- **Shortcode requirement**: If selected project has no shortcode, show inline text input with:
  - Auto-suggested shortcode via `api.projects.suggestShortcode({ name })`
  - Availability check via `api.projects.isShortcodeAvailable({ shortcode })`
  - Must be set before upload can proceed

### Folder Selection

Dropdown/bottom sheet showing available folders for the selected client/project.
- Query: `api.folderStructure.getAllFoldersForClient({ clientId })` — filter to project-level or client-level folders based on whether a project is selected
- For Internal scope: internal folder list
- For Personal scope: personal folder list
- The selected folder is passed to V4 as a folder hint AND used as the default `targetFolder` for items

### Internal/External Toggle

Side-by-side toggle buttons. Only shown for client scope.
- State: `isInternal` boolean
- Affects document naming and classification scope

### Additional Instructions

Collapsible textarea, collapsed by default.
- Optional free text passed to V4 pipeline as `metadata.instructions`
- Placeholder: "e.g. These are monitoring reports from the March site visit..."

### File Selection

- File input: `<input type="file" multiple accept="..." />` — same accept list as desktop
- Max 5 files
- File list with icon (lucide, not emoji), filename, size, remove button
- Icons: `FileText` (pdf), `Table` (xlsx/xls/csv), `FileType` (docx/doc), `Image` (images), `Mail` (eml), `File` (default)

### Upload Button

Sticky above the StickyFooter nav bar. Disabled until:
- Scope is set
- Client is selected (client scope) OR folder is selected (internal/personal scope)
- At least one file is added
- If project is selected, shortcode must be set

### Pre-fill from Folder Context

When entering from `FolderContents.tsx`, URL params pre-fill: scope=client, clientId, clientName, projectId, projectName, folderTypeKey, folderLevel. Setup sections are pre-populated, user just picks files.

## Phase 2: Processing

### Batch Creation

When "Upload & Analyze" is tapped:

1. Get authenticated user ID (for `userId` field)
2. Get uploader initials from user profile
3. Fetch checklist items for the target client/project (for V4 checklist matching)
4. Fetch available folders for the target client (for V4 folder suggestions)
5. Call `bulkUpload.createBatch()` with:
   - `scope`, `clientId`, `clientName`, `projectId`, `projectName`, `projectShortcode`
   - `internalFolderId` / `personalFolderId` (for non-client scopes)
   - `isInternal`, `instructions`, `uploaderInitials`, `userId`
   - `totalFiles: files.length`
   - `processingMode: 'foreground'`
6. For each file, call `bulkUpload.addItemToBatch()` with `batchId`, `fileName`, `fileSize`, `fileType`, `folderHint` (the selected folder's key)
7. Navigate to processing screen with `batchId`

### Processing Screen

Reads batch state via reactive Convex queries:
- `useQuery(api.bulkUpload.getBatch, { batchId })` — batch status, progress counts
- `useQuery(api.bulkUpload.getBatchItems, { batchId })` — per-item status

Instantiates `BulkQueueProcessor` with callbacks wired to Convex mutations:
- `updateItemStatus` → `api.bulkUpload.updateItemStatus`
- `updateItemAnalysis` → `api.bulkUpload.updateItemAnalysis`
- `updateBatchStatus` → `api.bulkUpload.updateBatchStatus`
- `checkForDuplicates` → `api.bulkUpload.checkForDuplicates`
- `generateUploadUrl` → `api.files.generateUploadUrl`
- `getStorageUrl` → (use Convex storage URL query)

Sets `BatchInfo` with full metadata:
- `clientId`, `clientName`, `clientType`, `projectId`, `projectShortcode`
- `isInternal`, `instructions`, `uploaderInitials`
- `checklistItems` — fetched missing checklist items for the project/client
- `availableFolders` — fetched folder structure
- `folderHints` — from user's folder selection in setup

Calls `processor.processQueue()` — files processed sequentially (concurrency=1 for mobile to be gentle on network).

### Layout

```
┌──────────────────────────────────────┐
│ Processing...                        │
├──────────────────────────────────────┤
│           [spinner]                  │
│     Analyzing documents              │
│     This may take a moment...        │
├──────────────────────────────────────┤
│ ✓ file1.pdf      Uploaded & analyzed │
│ ⟳ file2.xlsx     Analyzing...  ━━━  │
│ ○ file3.pdf      Waiting...          │
├──────────────────────────────────────┤
│ You can navigate away — processing   │
│ continues in the background          │
└──────────────────────────────────────┘
```

Per-file rows show real-time status from `bulkUploadItems` query:
- `pending` → waiting (dimmed)
- `processing` → analyzing (spinner + progress bar)
- `ready_for_review` → done (green check)
- `error` → error (red, tappable to retry)

### Completion Trigger

When batch status changes to `review` (all items processed), auto-navigate to review screen after 1s delay.

### Re-entry

Since state lives in Convex, if the user leaves and comes back to `/m-upload`:
- Check for pending batches via `api.bulkUpload.getPendingBatches({ userId })`
- If a batch exists in `uploading` or `processing` status, show the processing screen for that batch
- If a batch exists in `review` status, show the review screen
- Otherwise show fresh setup

## Phase 3: Review

Full-page per-document review. Reads data from `bulkUploadItems`.

### Layout (per document)

```
┌──────────────────────────────────────┐
│ ← Back      1 of 3           Delete  │
├──────────────────────────────────────┤
│ DOCUMENT                             │
│ COMB-VAL-100426                      │
│ Bayfield_Valuation_Report.pdf        │
├──────────────────────────────────────┤
│ CLASSIFICATION              (edit)   │
│ [Category ▼] [Type ▼]               │
│ ● 95% confidence  Folder: Appraisals│
├──────────────────────────────────────┤
│ FILED TO                     (edit)  │
│ Bayfield → Comberton · External      │
├──────────────────────────────────────┤
│ EXECUTIVE SUMMARY                    │
│ [full summary text]                  │
├──────────────────────────────────────┤
│ DOCUMENT ANALYSIS            [▼]    │
│ Purpose, entities, amounts, dates,   │
│ characteristics                      │
├──────────────────────────────────────┤
│ INTELLIGENCE FIELDS (6)      [▼]    │
│ Market Value    £875,000   High  P   │
│ Property Addr   14 Comb... High  P   │
│ Surveyor        Knight F.  High  C   │
│ ...                                  │
├──────────────────────────────────────┤
│ CHECKLIST MATCHES (2)                │
│ ✓ RICS Valuation Report  92%        │
│ ✓ Property Valuation     78%        │
├──────────────────────────────────────┤
│ CLASSIFICATION REASONING     [▼]    │
│ [AI reasoning text]                  │
├──────────────────────────────────────┤
│ [Previous]         [Next →]          │
│ or on last doc:    [File All]        │
└──────────────────────────────────────┘
```

### Data Source

All data comes from `bulkUploadItems` via `useQuery(api.bulkUpload.getBatchItems, { batchId })`. Each item has:
- `summary` — executive summary
- `fileTypeDetected` — classified type
- `category` — classified category
- `confidence` — classification confidence (0-1)
- `targetFolder` — suggested folder
- `generatedDocumentCode` — V4-generated document code
- `documentAnalysis` — full structured analysis (description, purpose, entities, key terms/dates/amounts, executive summary, detailed summary, document characteristics)
- `extractedIntelligence` — intelligence fields array (fieldPath, label, value, valueType, confidence, scope, isCanonical)
- `suggestedChecklistItems` — matched checklist items with confidence and reasoning
- `classificationReasoning` — AI explanation
- `emailMetadata` — from/to/subject/date (for .eml files)
- `isDuplicate` — duplicate detection result

### Editable Fields

Changes are saved back to `bulkUploadItems` via `api.bulkUpload.updateItemDetails`:

| Field | Edit mechanism |
|---|---|
| Category | Bottom sheet with 13 categories |
| File type | Text input / searchable select |
| Target folder | Bottom sheet with available folders |
| Internal/external | Toggle |
| Project assignment | Bottom sheet (if multi-project) |

### Read-Only Sections

| Section | Display | Default state |
|---|---|---|
| Document code + filename | Header area | Always visible |
| Executive summary | Full text card | Always visible |
| Document analysis | Purpose, entities (pills), amounts, dates, characteristics | Collapsible, default collapsed |
| Intelligence fields | List with label, value, confidence badge (High/Med/Low), scope badge (P/C) | Collapsible, default expanded |
| Checklist matches | List with name, category, confidence % | Always visible if matches exist |
| Classification reasoning | Text card | Collapsible, default collapsed |
| Email metadata | From/to/subject/date (only for .eml) | Always visible if present |

### Confidence Badges

- High (≥0.9): green `bg-[var(--m-accent-subtle)]` + `text-[var(--m-success)]`
- Medium (≥0.7): amber `bg-[#fefce8]` + `text-[var(--m-warning)]`
- Low (<0.7): red + `text-[var(--m-error)]`

### Scope Badges

- P (project-level): blue pill `bg-[var(--m-accent-subtle)]` + `text-[var(--m-accent-indicator)]`
- C (client-level): amber pill

### Navigation

- **Previous/Next**: Navigate between items. Sticky footer.
- **"File All"**: Shown on last document. Calls `bulkUpload.fileBatch()`. Disabled if any item is missing required fields.
- **Delete**: Removes item from batch via `bulkUpload.removeItemFromBatch()`
- **Back**: Returns to processing/setup

### Filing

"File All" calls `bulkUpload.fileBatch({ batchId })`. This is the existing desktop mutation — it handles:
- Document creation with all V4 fields (documentAnalysis, classificationReasoning, textContent, extractedData)
- Folder assignment (folderId + folderType)
- Intelligence field saving (to clientIntelligence / projectIntelligence tables)
- Checklist linking (knowledgeChecklistDocumentLinks)
- Knowledge bank entries
- Version handling (if duplicates detected)
- Scope-based access control

No custom filing logic needed on mobile — `fileBatch` does everything.

## Phase 4: Completion

### Layout

```
┌──────────────────────────────────────┐
│ Complete                             │
├──────────────────────────────────────┤
│        [check circle]                │
│     3 documents filed                │
│     All files analyzed and filed     │
│                                      │
│ Bayfield Homes → Comberton · External│
├──────────────────────────────────────┤
│ ✓ COMB-VAL-100426                    │
│   Appraisals · Bayfield_Val.pdf    > │
│ ✓ COMB-FIN-100426                    │
│   Financial · Cost_Schedule.xlsx   > │
│ ✓ COMB-LEG-100426                    │
│   Legal · Solicitor_Title.pdf      > │
├──────────────────────────────────────┤
│ [Upload More]           [Done]       │
└──────────────────────────────────────┘
```

- Batch context card shows client/project/scope
- Per-doc rows with document code, category badge, original filename
- Tap any row to open in m-docs viewer
- "Upload More" navigates to fresh setup (preserving scope + client)
- "Done" navigates to `/m-docs`
- Black "Done" button, outlined "Upload More"

## Component Structure

```
src/app/(mobile)/m-upload/
├── page.tsx                          ← route shell, checks for pending batches, renders current phase
└── components/
    ├── UploadSetup.tsx               ← Phase 1: scope, client, project, folder, instructions, files
    ├── ScopeToggle.tsx               ← Three-button scope selector
    ├── ShortcodeInput.tsx            ← Inline shortcode editor with availability check
    ├── ProcessingScreen.tsx          ← Phase 2: per-file progress from Convex queries
    ├── ReviewFlow.tsx                ← Phase 3: nav wrapper (prev/next/file all)
    ├── DocReviewCard.tsx             ← Phase 3: single document review content
    ├── DocumentAnalysisSection.tsx   ← Collapsible document analysis display
    ├── IntelligenceFieldsList.tsx    ← Intelligence fields with confidence/scope badges
    ├── ChecklistMatchesList.tsx      ← Checklist matches with confidence
    ├── CompletionSummary.tsx         ← Phase 4: batch results
    ├── FilingSheet.tsx               ← Bottom sheet: client/project/folder picker
    ├── CategorySheet.tsx             ← Bottom sheet: category/type editor
    └── FolderSheet.tsx               ← Bottom sheet: folder picker
```

### Responsibilities

- **page.tsx** — Checks for pending batches on mount. If found, resumes at the correct phase. Otherwise shows UploadSetup. Holds `batchId` in URL state (`/m-upload?batchId=xxx`).
- **UploadSetup.tsx** — Full setup form. On submit: creates batch, adds items, starts processing, navigates to processing screen. ~250-300 lines.
- **ProcessingScreen.tsx** — Reads batch/items via Convex queries. Instantiates and runs `BulkQueueProcessor`. Shows per-file progress. Auto-advances to review. ~150-200 lines.
- **ReviewFlow.tsx** — Nav wrapper: header (back/counter/delete), footer (prev/next/file all). Manages current index. On "File All", calls `fileBatch`. ~100-120 lines.
- **DocReviewCard.tsx** — Full review content for one item. Editable classification + filing, read-only analysis/intelligence/checklist/reasoning. ~200-250 lines.
- **DocumentAnalysisSection.tsx** — Collapsible section: purpose, entities, amounts, dates, characteristics. ~80-100 lines.
- **IntelligenceFieldsList.tsx** — Field rows with confidence + scope badges. ~80-100 lines.
- **ChecklistMatchesList.tsx** — Match rows with confidence percentage. ~50-60 lines.
- **CompletionSummary.tsx** — Success header, batch context, doc list, actions. ~100-120 lines.

## Convex Queries & Mutations Used

All existing — no backend changes:

| API | Used By | Purpose |
|---|---|---|
| `bulkUpload.createBatch()` | UploadSetup | Create batch record |
| `bulkUpload.addItemToBatch()` | UploadSetup | Add file to batch |
| `bulkUpload.getBatch()` | ProcessingScreen, ReviewFlow | Read batch status |
| `bulkUpload.getBatchItems()` | ProcessingScreen, ReviewFlow, DocReviewCard | Read item data |
| `bulkUpload.updateItemStatus()` | BulkQueueProcessor callback | Update item processing status |
| `bulkUpload.updateItemAnalysis()` | BulkQueueProcessor callback | Save V4 analysis results |
| `bulkUpload.updateBatchStatus()` | BulkQueueProcessor callback | Update batch progress |
| `bulkUpload.checkForDuplicates()` | BulkQueueProcessor callback | Duplicate detection |
| `bulkUpload.updateItemDetails()` | DocReviewCard | Save user edits to classification/folder/internal |
| `bulkUpload.fileBatch()` | ReviewFlow | File all documents (creates docs, intelligence, checklist links) |
| `bulkUpload.getPendingBatches()` | page.tsx | Check for in-progress batches on mount |
| `bulkUpload.removeItemFromBatch()` | ReviewFlow | Delete item from batch |
| `files.generateUploadUrl()` | BulkQueueProcessor | Convex storage upload URL |
| `clients.list()` | FilingSheet | Client picker |
| `projects.getByClient()` | FilingSheet | Project picker |
| `projects.suggestShortcode()` | ShortcodeInput | Auto-suggest shortcode |
| `projects.isShortcodeAvailable()` | ShortcodeInput | Check shortcode availability |
| `folderStructure.getAllFoldersForClient()` | FolderSheet, UploadSetup | Folder picker + V4 metadata |
| `knowledgeLibrary.getChecklistByProject()` | UploadSetup | Checklist items for V4 matching |

## Styling

- Light theme only — `var(--m-*)` CSS custom properties throughout
- Tailwind classes, no inline styles (except CSS variable references)
- No emojis — lucide-react icons only
- Black primary buttons (`bg-[var(--m-text-primary)] text-white`), not blue
- Outlined secondary buttons (`border border-[var(--m-border)]`)
- Cards: `bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px]`
- Labels: `text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase`
- Inputs: `style={{ fontSize: '16px' }}` to prevent iOS auto-zoom

## What's NOT Being Built

- Background processing (max 5 files, foreground only)
- Multi-project detection from folder hints (desktop-only)
- Version candidate panel (desktop-only)
- User notes with "add to intelligence" (desktop-only)
- Flag creation (desktop-only)
- Data extraction toggle (desktop-only — can be added later)
- Intelligence field editing (read-only on mobile — can be edited on desktop)
- Upload more to existing batch (desktop-only)
- New client/project creation during upload (desktop-only — select from existing)

## What IS Being Removed

- `src/contexts/UploadContext.tsx` — replaced by Convex batch/item state
- `UploadProvider` from `src/app/(mobile)/layout.tsx`
- All current `m-upload/components/*.tsx` — replaced with new components
