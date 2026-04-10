# Mobile Upload Experience — Design Spec

**Date:** 2026-04-10
**Branch:** mobile
**Status:** Approved (revised post-Codex review)

## Purpose

Add a lightweight mobile upload flow for 3-5 documents on the go. Uses the existing backend pipeline (`/api/analyze-file` + `convex/directUpload.uploadDocumentDirect` + `convex/documents.update` for folder assignment) — no backend changes. The experience is a linear four-phase flow: pick files → upload & process → per-doc review → completion summary.

**Note on analysis depth:** The mobile upload uses `/api/analyze-file` (the single-file direct upload path), not the V4 batch pipeline. This means uploaded documents will have `summary`, `category`, `fileType`, `confidence`, `reasoning`, and `extractedData`, but will NOT have `documentAnalysis`, `classificationReasoning`, `textContent`, or `extractedIntelligence` fields that the desktop bulk pipeline populates. The mobile Summary tab gracefully falls back to the basic `summary` field when `documentAnalysis` is absent. The Intelligence tab will show no items for mobile-uploaded docs until they are re-analyzed on desktop. This is an intentional trade-off for a lighter, faster mobile experience.

## Entry Points

Two ways to start an upload:

1. **Dedicated upload page** (`/m-upload`) — accessible from the StickyFooter nav and the MobileNavDrawer side menu.
2. **From folder view in m-docs** — an "Upload" button within `FolderContents.tsx`. When used, the client/project/folder context is passed to the upload page as pre-filled filing suggestions.

Both entry points navigate to the same upload page component. The folder-context entry passes query params or navigation state to pre-fill the filing destination.

## Navigation

Single route (`/m-upload`), view state managed in-component:

```typescript
type UploadPhase =
  | { phase: 'pick' }
  | { phase: 'processing'; files: UploadingFile[] }
  | { phase: 'review'; results: ProcessedDoc[]; currentIndex: number }
  | { phase: 'done'; results: ProcessedDoc[] };
```

The page is a state machine — no sub-routes. Back navigation from each phase:
- **pick** → normal back (StickyFooter nav or browser back)
- **processing** → confirm dialog ("Processing will continue. Leave?") — user can come back via a pending upload indicator (see Background Processing below)
- **review** → goes back to processing/pick (with warning if edits unsaved)
- **done** → "Done" returns to m-docs, "Upload More" resets to pick phase

## Phase 1: File Picker

Full-page upload screen at `/m-upload`.

### Layout

```
┌──────────────────────────────────────┐
│ Upload Documents                     │  ← header
├──────────────────────────────────────┤
│                                      │
│        📄                            │
│   Select files to upload             │  ← drop zone / tap target
│   PDF, DOCX, XLSX, images           │
│   Up to 5 files                      │
│                                      │
│      [ Choose Files ]                │  ← triggers native file picker
│                                      │
├──────────────────────────────────────┤
│ Selected (3 files)                   │
│ ┌──────────────────────────────┐     │
│ │ 📄 Bayfield_Valuation.pdf  ×│     │  ← removable file rows
│ │    2.3 MB                    │     │
│ └──────────────────────────────┘     │
│ ┌──────────────────────────────┐     │
│ │ 📊 Cost_Schedule_v3.xlsx   ×│     │
│ │    890 KB                    │     │
│ └──────────────────────────────┘     │
│ ┌──────────────────────────────┐     │
│ │ 📄 Solicitor_Title.pdf     ×│     │
│ │    1.1 MB                    │     │
│ └──────────────────────────────┘     │
├──────────────────────────────────────┤
│ 📁 Filing to: Bayfield → Comberton  │  ← context banner (only when
│    → Appraisals                 ×    │     entered from folder view)
├──────────────────────────────────────┤
│      [ Upload & Analyze ]            │  ← primary action
├──────────────────────────────────────┤
│  [ Home ] [ Docs ] [Upload] [ ··· ] │  ← StickyFooter
└──────────────────────────────────────┘
```

### Behavior

- **File input**: `<input type="file" multiple accept="..." />` — same accept list as `DirectUploadButton.tsx`: `.pdf,.docx,.doc,.xls,.xlsx,.xlsm,.csv,.txt,.md,.eml,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif`
- **Max 5 files**: If user selects more than 5, show a toast/alert: "Maximum 5 files per upload. Please remove some files."
- **File list**: Each row shows icon (based on extension), filename (truncated with ellipsis), file size, and × remove button.
- **Context banner**: Only shown when navigated from a folder in m-docs. Displays the pre-filled client → project → folder path. Has × to clear it (reverts to no pre-fill). Stored in component state, passed via URL search params: `?clientId=xxx&projectId=yyy&folderTypeKey=appraisals&folderLevel=client|project&folderName=Appraisals&clientName=Bayfield+Homes&projectName=Comberton+Rise`. Note: `folderTypeKey` is the string key used by `documents.folderId` (e.g., `"appraisals"`, `"background"`), NOT the Convex folder record ID. `folderLevel` distinguishes client-level vs project-level folders.
- **"Choose Files" button**: Opens native OS file picker. Users can also tap the entire drop zone area.
- **"Upload & Analyze" button**: Disabled when no files selected. Tapping advances to Phase 2.
- **Camera support**: On mobile, the file picker natively offers camera capture — no special handling needed.

### File Icons

Map file extension to emoji for the file list:
- `.pdf` → 📄
- `.xlsx`, `.xls`, `.csv` → 📊
- `.docx`, `.doc` → 📝
- `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.heic`, `.heif` → 🖼️
- `.eml` → 📧
- default → 📄

## Phase 2: Processing

Shows per-file upload + analysis progress. Each file goes through:
1. **Uploading** — POST to Convex storage via `generateUploadUrl()`
2. **Analyzing** — POST to `/api/analyze-file` with the file as FormData
3. **Done** — analysis result stored in local state

### Layout

```
┌──────────────────────────────────────┐
│ ← Upload           Processing...     │
├──────────────────────────────────────┤
│              ⚙️                      │
│       Analyzing documents            │
│       This may take a moment...      │
├──────────────────────────────────────┤
│ ✓ Bayfield_Valuation.pdf            │  ← uploaded & analyzed
│   Uploaded & analyzed                │
│                                      │
│ ⟳ Cost_Schedule_v3.xlsx             │  ← currently analyzing
│   Analyzing...  ━━━━━━━━░░░░         │
│                                      │
│ ↑ Solicitor_Title.pdf               │  ← uploading
│   Uploading...  ━━━░░░░░░░░          │
├──────────────────────────────────────┤
│ You can close this screen —          │
│ processing continues in background   │
├──────────────────────────────────────┤
│  [ Home ] [ Docs ] [Upload] [ ··· ] │
└──────────────────────────────────────┘
```

### Processing Flow

Files are processed **sequentially** (one at a time), matching the desktop `bulkQueueProcessor` pattern. For each file:

```typescript
async function processFile(file: File): Promise<ProcessedDoc> {
  // Step 1: Upload to Convex storage
  const uploadUrl = await generateUploadUrl();
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  const { storageId } = await uploadRes.json();

  // Step 2: Analyze via existing API
  const formData = new FormData();
  formData.append('file', file);
  const analysisRes = await fetch('/api/analyze-file', { method: 'POST', body: formData });
  const analysis = await analysisRes.json();

  return { file, storageId, analysis };
}
```

### Per-File Status States

Each file row shows one of:
- **Waiting** — gray, queued (not started yet)
- **Uploading** — arrow-up icon, progress bar (indeterminate — fetch doesn't give upload progress easily)
- **Analyzing** — spinner icon, "Analyzing..." with indeterminate progress bar
- **Done** — green checkmark, "Uploaded & analyzed"
- **Error** — red × icon, error message, "Tap to retry" action

### Error Handling

- **Upload failure** (network error, Convex down): Mark file as error, continue to next file. User can retry individual files.
- **Analysis failure** (`/api/analyze-file` returns error): Mark file as error with the error message. User can retry.
- **All files error**: Show "All uploads failed" with a "Retry All" button. Don't advance to review.
- **Partial success**: Advance to review with only the successful files. Error files shown at the end with retry option.

### Completion Trigger

When all files have finished (success or error), and at least one succeeded:
- Auto-advance to Phase 3 (review) after a brief 1-second delay (so user sees the final checkmark).
- If ALL files failed, stay on processing screen with retry options.

## Background Processing

For unstable mobile networks, the processing phase should be resilient to the user leaving the screen:

- **State persistence**: The upload phase state (files, progress, results) is stored in a React context provider (`UploadContext`) mounted in the mobile layout — above the route children. This ensures state survives when the user navigates away from `/m-upload` and back. A `useRef` inside the page component would NOT work because route children unmount on navigation.
- **"You can close this screen"** hint shown at the bottom of the processing phase.
- **Re-entry**: If the user navigates away and comes back to `/m-upload` while processing is active, they see the current progress (not a fresh picker). The `UploadContext` holds the current phase, file list, processing results, and review edits.
- **Implementation**: Create `src/contexts/UploadContext.tsx` with a provider wrapping route children in the mobile layout (same pattern as `MessengerContext` and `MobileLayoutContext`). The context exposes the upload state machine and mutation functions. The `/m-upload` page reads from this context rather than owning the state directly.
- **Scope**: This covers navigation within the app only. True background survival (browser tab closed, app killed) would require service workers or server-side job tracking — that's out of scope for this iteration. The files are already uploaded to Convex storage during Phase 2, so even if the user loses the review state, the storage files exist (though without document records).

## Phase 3: Per-Doc Review

Full-page review for each document, one at a time. User swipes through with Previous/Next buttons.

### Layout

```
┌──────────────────────────────────────┐
│ ← Back         1 of 3        Delete  │
├──────────────────────────────────────┤
│ DOCUMENT TITLE                       │
│ ┌──────────────────────────────────┐ │
│ │ APR-BH-CR-001 Bayfield Val...   │ │  ← auto-generated, read-only
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ SUMMARY                              │
│ ┌──────────────────────────────────┐ │
│ │ RICS Red Book valuation for 14  │ │  ← AI summary, read-only
│ │ Comberton Rise, Cambridge...    │ │
│ │ Valued at £875,000 for secured  │ │
│ │ lending purposes.               │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ CLASSIFICATION                       │
│ ┌────────────┐ ┌────────────────┐   │
│ │ Category ▼ │ │ Type         ▼ │   │  ← editable dropdowns
│ │ Appraisals │ │ RedBook Val.   │   │
│ └────────────┘ └────────────────┘   │
│ ● 95% confidence                     │
├──────────────────────────────────────┤
│ FILE TO                              │
│ ┌──────────────────────────────────┐ │
│ │ 🏠 Bayfield Homes → Comberton  │ │  ← editable, tap to change
│ │    📁 Appraisals          Edit  │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ KEY DETAILS                          │
│ ┌──────────────────────────────────┐ │
│ │ Property   14 Comberton Rise    │ │  ← extracted data, read-only
│ │ Valuation  £875,000             │ │
│ │ Surveyor   Knight Frank         │ │
│ │ Date       15 Mar 2026          │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ [ Previous ]     [ Next →          ] │
├──────────────────────────────────────┤
│  [ Home ] [ Docs ] [Upload] [ ··· ] │
└──────────────────────────────────────┘
```

### Data Mapping

From the `/api/analyze-file` response:

| Review Field | Source | Editable |
|---|---|---|
| Document Title | Generated server-side by `uploadDocumentDirect()` mutation via `generateDocumentCode()` — displayed as filename until saved | Read-only |
| Summary | `analysis.summary` | Read-only |
| Category | `analysis.category` | Yes — dropdown with 13 categories |
| Type | `analysis.fileType` | Yes — text input or dropdown filtered by category |
| Confidence | `analysis.confidence` | Read-only indicator |
| Filing: Client | `analysis.clientId` / `analysis.clientName` or pre-filled from context | Yes — bottom sheet picker |
| Filing: Project | `analysis.projectId` / `analysis.projectName` or pre-filled from context | Yes — bottom sheet picker (filtered by client) |
| Filing: Folder | Derived from `analysis.category` → `suggestedFolder` mapping, or pre-filled from context | Yes — bottom sheet picker |
| Key Details | `analysis.extractedData` fields (property, amounts, dates, entities) | Read-only |

### Classification Editing

- **Category dropdown**: Bottom sheet with the 13 document categories (Appraisals, Plans, Inspections, Professional Reports, KYC, Loan Terms, Legal Documents, Project Documents, Financial Documents, Insurance, Communications, Warranties, Photographs).
- **Type field**: Free text input. When category changes, suggest common types for that category but allow any text.

### Filing Destination Editing

- **"Edit" button** opens a filing sheet (same bottom sheet pattern as `MetadataChips.tsx` and `MoveFileSheet.tsx`).
- **Client picker**: Searchable list of all clients.
- **Project picker**: Shown after client selected, filtered to that client's projects.
- **Folder picker**: Shown after project selected, shows the project's folder structure.
- **Pre-filled values**: If entered from folder context OR if the AI suggested a client/project, these are pre-filled. User can override.
- **Clearing client cascades**: Clearing client also clears project and folder (same pattern as MetadataChips).

### Key Details Section

Displays extracted data from `analysis.extractedData` as a read-only key-value table. Only shown if the analysis returned extracted data. Common fields:
- Property address
- Valuation / amounts
- Key dates
- Surveyor / professional
- Company names

If `extractedData` is null or empty, this section is hidden.

### Client Required

The `directUpload.uploadDocumentDirect()` mutation requires `clientId` (non-optional). Every document must have a client assigned before saving. If a doc has no client set (neither from context nor AI suggestion), the "Finish" button is disabled and the filing section shows a "Client required" validation hint. The user must tap "Edit" on the filing destination and select a client.

### Navigation

- **"Previous" button**: Goes to previous doc. Disabled on first doc.
- **"Next →" button**: Goes to next doc. On the last doc, label changes to **"Finish"** and advances to Phase 4. Disabled if any doc in the batch is missing a client.
- **"Delete" button** (top-right, red text): Removes this doc from the batch. If it was already uploaded to Convex storage, the storage file is orphaned (acceptable — Convex garbage-collects unreferenced storage). If deleting the last remaining doc, return to Phase 1.
- **"← Back" button** (top-left): Goes back to the processing screen. Any edits made during review are preserved in local state.
- **Counter**: "1 of 3" in the header, updates as user navigates.

### Saving Documents

Documents are NOT saved to the database during review. They are saved in bulk when the user taps "Finish" on the last doc (or navigates to Phase 4). This means:

1. User reviews/edits all docs
2. On "Finish", for each doc:
   a. Call `directUpload.uploadDocumentDirect()` with the (potentially edited) classification, client/project, and analysis results. This creates the document record and generates the document code.
   b. If the user set a folder destination, immediately call `documents.update()` on the returned document ID to set `folderId` (the `folderTypeKey` string, e.g., `"appraisals"`) and `folderType` (`"client"` or `"project"`). This is necessary because `directUpload.uploadDocumentDirect()` does not accept folder fields.
3. If any save fails, show error on the completion screen with retry

This two-step save (create + update folder) avoids backend changes while ensuring documents appear in the correct folder. The `documents.update` mutation already accepts `folderId` and `folderType` fields.

## Phase 4: Completion Summary

Shows all successfully uploaded documents with their classification and filing destination.

### Layout

```
┌──────────────────────────────────────┐
│              ✅                       │
│     3 documents uploaded             │
│     All files analyzed and filed     │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ ✓ APR-BH-CR-001 Bayfield Val.  │ │  ← tappable → document viewer
│ │   Appraisals → Bayfield/Comber. │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ✓ FIN-BH-CR-003 Cost Schedule  │ │
│ │   Financial → Bayfield/Comber.  │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ✓ LEG-BH-CR-002 Title Report   │ │
│ │   Legal → Bayfield/Comberton    │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ [ Upload More ]      [ Done ]        │
├──────────────────────────────────────┤
│  [ Home ] [ Docs ] [Upload] [ ··· ] │
└──────────────────────────────────────┘
```

### Behavior

- **Document rows**: Each shows the generated document code/title, classification badge, and filing destination. Tap to open the document in the m-docs viewer via `TabContext.openTab({ type: 'docs', route: '/m-docs', params: { documentId } })` — same pattern used by dashboard quick links.
- **Error rows**: If any saves failed, show them with a red indicator and "Tap to retry" action.
- **"Upload More"**: Resets to Phase 1 (pick), preserving the filing context if it was set.
- **"Done"**: Navigates to `/m-docs` via the StickyFooter route. Deep-linking into a specific folder is not supported by the current `DocsContent` navigation model (it uses local component state, not URL params), so "Done" always lands on the docs root. This is acceptable for V1 — folder deep-linking can be added later if needed.

## Component Structure

```
src/contexts/UploadContext.tsx        ← upload state machine + processing logic (survives route changes)

src/app/(mobile)/m-upload/
├── page.tsx                          ← thin shell, reads from UploadContext, renders current phase
└── components/
    ├── FilePicker.tsx                ← Phase 1: file selection UI, context banner
    ├── ProcessingScreen.tsx          ← Phase 2: per-file progress, sequential upload+analyze
    ├── DocReview.tsx                 ← Phase 3: single-doc review card (full page)
    ├── ReviewFlow.tsx                ← Phase 3: wraps DocReview with prev/next/finish nav
    ├── CompletionSummary.tsx         ← Phase 4: batch result list with actions
    ├── FilingSheet.tsx               ← Bottom sheet for client/project/folder selection
    └── CategorySheet.tsx             ← Bottom sheet for category/type editing
```

### Responsibilities

- **UploadContext.tsx** — Mounted in mobile layout (`layout.tsx`), same level as `MessengerProvider` and `MobileLayoutProvider`. Owns the upload phase state machine, file list, processing results, review edits, and processing async logic. Exposes `useUpload()` hook. This ensures state survives when the user navigates away from `/m-upload` during processing and returns.
- **page.tsx** — Thin phase router. Reads from `useUpload()` context, renders the component for the current phase.
- **FilePicker.tsx** — File input, selected files list with remove, context banner, "Upload & Analyze" button. ~100-120 lines.
- **ProcessingScreen.tsx** — Orchestrates sequential file processing (upload to Convex + analyze). Displays per-file progress rows. Calls back when all done. ~120-150 lines.
- **DocReview.tsx** — Renders one document's review card: title, summary, classification (editable), filing (editable), key details. Calls back on edits. ~180-220 lines.
- **ReviewFlow.tsx** — Wraps DocReview with navigation (prev/next/finish/delete), counter header. Manages current index. On "Finish", triggers bulk save. ~80-100 lines.
- **CompletionSummary.tsx** — Success header, document list rows, action buttons. ~80-100 lines.
- **FilingSheet.tsx** — Bottom sheet with client → project → folder picker flow. Reuses the same visual pattern as `MoveFileSheet.tsx`. ~120-150 lines.
- **CategorySheet.tsx** — Bottom sheet for selecting category from the 13 options, and entering/selecting file type. ~80-100 lines.

## StickyFooter Integration

The StickyFooter remains visible throughout all upload phases. The upload page needs a new nav item added to the footer.

### Footer Changes

The current StickyFooter has 4 nav links split around a central chat button (Home, Docs, [Chat], Notes, More). Adding a 5th item would crowd the layout. Two options:

**Option A (recommended):** Replace the "More" item with "Upload" in the footer. Move "More" functionality into the MobileNavDrawer (hamburger menu) only. Upload is a higher-frequency action on mobile than "More" (which just opens contacts/tasks).

**Option B:** Keep the current 4 items, add Upload only to the MobileNavDrawer side menu. Less discoverable but zero footer changes.

Regardless of footer choice, add "Upload" as a menu item in `MobileNavDrawer.tsx`:
- **Icon**: `Upload` from lucide-react
- **Label**: "Upload"
- **Route**: `/m-upload`

## Pre-filled Context from Folder View

When entering upload from a folder in m-docs (`FolderContents.tsx`):

### Entry Point

Add an "Upload" button to `FolderContents.tsx` header area. When tapped, navigate to `/m-upload` with context:

```typescript
router.push(`/m-upload?clientId=${clientId}&projectId=${projectId}&folderTypeKey=${folderTypeKey}&folderLevel=${folderLevel}&folderName=${encodeURIComponent(folderName)}&clientName=${encodeURIComponent(clientName)}&projectName=${encodeURIComponent(projectName)}`);
```

Where `folderTypeKey` is the string key stored in `documents.folderId` (e.g., `"appraisals"`, `"background"`, `"custom_xyz"`), and `folderLevel` is `"client"` or `"project"` (maps to `documents.folderType`).

### Context Handling

- `page.tsx` reads search params on mount and stores them as the default filing destination.
- The blue context banner in `FilePicker.tsx` shows "Filing to: [Client] → [Project] → [Folder]" with × to clear.
- During review (Phase 3), each doc's filing destination is pre-filled with this context.
- The AI's suggested client/project from `/api/analyze-file` is compared to the pre-filled context. If the AI suggests a different client, the pre-filled context takes precedence (user explicitly chose to upload here).

## Existing APIs Used

All existing — no backend changes:

| API | Used By | Purpose |
|---|---|---|
| `files.generateUploadUrl()` | ProcessingScreen | Get Convex storage upload URL |
| `/api/analyze-file` (POST) | ProcessingScreen | Analyze single file (summary, classification, extraction) |
| `directUpload.uploadDocumentDirect()` | ReviewFlow (on finish) | Create document record with analysis results |
| `documents.update()` | ReviewFlow (on finish) | Set `folderId` + `folderType` after document creation |
| `clients.list({})` | FilingSheet | Client picker |
| `projects.getByClient({ clientId })` | FilingSheet | Project picker |
| `folderStructure.getAllFoldersForClient({ clientId })` | FilingSheet | Folder picker |

## What's NOT Being Built

- New backend APIs or Convex mutations (uses existing `directUpload.uploadDocumentDirect` + `documents.update`)
- Bulk upload batch tracking (`bulkUploadBatches` / `bulkUploadItems`) — mobile uses the simpler `directUpload` path per file
- Service worker for true offline/background processing
- Drag and drop (not applicable on mobile)
- Camera-specific UI (native file picker handles this)
- Duplicate detection (desktop-only feature for now)
- Document code editing (auto-generated, read-only on mobile)
- Intelligence extraction editing (read-only display of what the API returns)
