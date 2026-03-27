# Tier 3 — Medium Features & UX Design Spec

> **Date:** 2026-03-22
> **Source:** Client Feedback Backlog — Tier 3
> **Items:** UIX-03, FIL-03, NOT-02, NOT-01, LIB-02

---

## Execution Batches

| Batch | Items | Complexity |
|-------|-------|-----------|
| **A** | UIX-03 + FIL-03 | Low — isolated, parallel-friendly |
| **B** | NOT-02 → NOT-01 | Medium — sequential, NOT-01 builds on NOT-02 |
| **C** | LIB-02 | Medium — standalone, most complex UX |

---

## UIX-03 — Sort Clients by Most Recently Accessed

**Goal:** Active clients surface to the top of the sidebar instead of being buried alphabetically.

### Schema Change

```
// convex/schema.ts — clients table
lastAccessedAt: v.optional(v.string()),  // ISO timestamp

// New index
.index("by_last_accessed", ["lastAccessedAt"])
```

### Mutation

New `clients.recordAccess` mutation:
- Accepts `clientId`
- Sets `lastAccessedAt` to `new Date().toISOString()`
- **Debounce:** Skip update if last access was < 30 seconds ago (prevents rapid re-fires on page refresh)

### Frontend — ClientsSidebar.tsx

- Call `recordAccess` in the client navigation click handler (when user clicks a client row)
- Change sort logic from:
  ```ts
  filtered.sort((a, b) => a.name.localeCompare(b.name))
  ```
  To:
  ```ts
  filtered.sort((a, b) => {
    // Clients with lastAccessedAt sort first, by recency
    if (a.lastAccessedAt && b.lastAccessedAt) {
      return b.lastAccessedAt.localeCompare(a.lastAccessedAt); // descending
    }
    if (a.lastAccessedAt) return -1;
    if (b.lastAccessedAt) return 1;
    return a.name.localeCompare(b.name); // fallback: alphabetical
  })
  ```

### Behavior

- First load: clients without `lastAccessedAt` sort alphabetically at the bottom
- After clicking a client, it rises to the top
- Real-time: Convex reactivity re-sorts the sidebar live

### Key Files

- `convex/schema.ts` — add field + index
- `convex/clients.ts` — new `recordAccess` mutation
- `src/app/clients/components/ClientsSidebar.tsx` — sort logic + call mutation

---

## FIL-03 — Duplicate File Functionality

**Goal:** One-click file duplication from the context menu with a note flagging it as a copy.

### Convex Mutation

New `documents.duplicateDocument` mutation:
- Accepts `documentId`
- Clones the document record with a new `_id`
- **Same `storageId`** — references the same underlying file blob (no storage duplication)
- Name: `"{original name} (Copy)"`
- Generates new document code using existing `generateDocumentCode` pattern
- Copies: category, classification, tags, analysis results, projectId, clientId
- Sets `notes` to include: `"Duplicated from {original document code}"`
- Sets fresh `uploadedAt` timestamp

### Frontend — FileCard.tsx

- Add "Duplicate" to `renderDropdownItems()` with `Copy` icon
- Placement: after "Move to Folder", before the separator above "Delete"
- Calls `onDuplicate` prop passed from FileList

### Frontend — FileList.tsx

- New `handleDuplicate` handler calling `documents.duplicateDocument`
- Toast on success: `"Duplicated '{filename}'"`
- New file appears in list automatically via Convex reactivity (same folder)

### Scope Exclusions

- No bulk duplicate
- No destination picker (copy goes to same folder; user can Move after)
- No file blob duplication (both docs share `storageId`)

### Key Files

- `convex/documents.ts` — new `duplicateDocument` mutation
- `src/app/docs/components/FileCard.tsx` — menu item
- `src/app/docs/components/FileList.tsx` — handler + toast

---

## NOT-02 — Notes Tab in Document Preview Drawer

**Goal:** Surface document notes in the preview drawer so users don't need to open the full reader just to view/add notes.

### Drawer Width

- `w-[1080px]` → `w-[1460px]` (~35% increase as spec'd)

### Tab Layout

- `grid-cols-5` → `grid-cols-6`
- New tab order: Details, Summary, Intel, Checklist, **Notes**, Threads
- "Intelligence" label shortened to "Intel" to fit 6 columns

### Notes Tab Content

Reuses existing reader note components:
- `DocumentNoteForm.tsx` — note creation input pinned at bottom
- `DocumentNoteCard.tsx` — note display with edit/delete/add-to-intelligence
- Query: `api.documentNotes.getByDocument` with current document ID
- Scrollable note list

### What We're Reusing (Not Rebuilding)

| Component | Location | Purpose |
|-----------|----------|---------|
| `DocumentNoteForm` | `src/app/docs/reader/[documentId]/components/` | Note creation |
| `DocumentNoteCard` | `src/app/docs/reader/[documentId]/components/` | Note display |
| `convex/documentNotes.ts` | `convex/` | All CRUD mutations |

### Key Files

- `src/app/docs/components/FileDetailPanel.tsx` — add tab, widen drawer
- May need to extract `DocumentNoteForm` and `DocumentNoteCard` to shared location (e.g., `src/components/`) if they have reader-specific imports

---

## NOT-01 — AI-Powered Note Cleanup

**Goal:** Let users clean up dictated/raw notes with AI — either a selected portion or the full document.

### Two Entry Points

1. **Selection bubble** — user highlights text → floating toolbar appears near selection with "Clean up" button → replaces selected text only
2. **Toolbar button** — "Clean up" button in notes editor toolbar → processes entire note content

### API Route

New `/api/note-cleanup/route.ts`:
- Uses Claude Haiku 4.5 via existing `@anthropic-ai/sdk`
- Accepts `{ text: string, mode: "selection" | "full" }`
- Returns `{ cleaned: string }`
- Single-shot transform, not a conversation

### System Prompt

```
You are a note cleanup assistant for a property finance team. The user has dictated or quickly typed raw notes. Your job is to enhance — not rewrite.

Do:
- Fix grammar, spelling, and punctuation
- Add formatting (paragraphs, bullet points) where it improves readability
- Add clarity where meaning is ambiguous
- Add substance where context is implied but not stated

Do not:
- Change the meaning or tone of what was written
- Remove or replace specific figures, names, dates, or technical terms
- Add information that wasn't implied by the original
- Make it sound overly formal or corporate — keep the user's voice

Return only the cleaned text. No explanations.
```

### UX Flow

- **Selection mode:** highlight → bubble appears → click "Clean up" → inline spinner → text replaced
- **Full mode:** click toolbar button → button loading state → entire content replaced
- **Undo:** Toast appears after cleanup with "Undo" button. Caches the original text before the API call; clicking Undo restores it. Toast auto-dismisses after 5 seconds.
- **Keyboard undo:** Editor's built-in Ctrl+Z also reverts

### Scope Exclusions

- No accept/reject diff view
- No streaming (short texts, near-instant with Haiku)
- No conversation memory between cleanups (stateless)

### Key Files

- New: `src/app/api/note-cleanup/route.ts`
- `DocumentNoteForm.tsx` or `DocumentNoteCard.tsx` — add selection bubble + toolbar button
- Existing: `@anthropic-ai/sdk` already configured in project

---

## LIB-02 — Drag-and-Drop File Movement Between Folders

**Goal:** Replace the click → Move → Select Folder workflow with intuitive drag-and-drop.

### Drag Source — FileCard.tsx / FileList.tsx

- Add `draggable` attribute to file rows
- `onDragStart`: set drag data with document ID(s)
  - If checkboxes are selected AND dragged file is in the selection → drag all selected files
  - Otherwise → drag just the single file
- Visual: source files ghost out (opacity ~0.35) during drag
- Multi-file: badge near cursor showing count

### Drop Targets — FolderBrowser.tsx

- Each folder gets `onDragOver` (prevent default + highlight) and `onDrop` handlers
- Drop target visual: amber dashed border with "Drop to move here" label
- `onDragLeave`: remove highlight
- `onDrop`: call existing mutations:
  - Single file: `documents.moveDocument`
  - Multiple files: `documents.bulkMove`

### Toast with Undo

- On successful drop: toast showing "Moved {n} file(s) to {folder name}" with Undo button
- Undo calls reverse move (back to original folder) — cache original folder ID before move
- Toast auto-dismisses after 5 seconds

### Cross-Scope: Project → Client Base Docs

- Dragging from a project folder onto client-level "Base Documents" must work
- Backend may need extension: `moveDocument` needs a code path to unset `projectId`/`projectName` and set `isBaseDocument: true` when target is client base docs
- **Flag for implementation:** Verify if existing mutation supports this; if not, add dedicated path

### Constraints

- Cannot drop onto the folder the file is already in (no highlight, cursor "not-allowed")
- Same-client scope enforced (cannot move across clients)
- Invalid drop targets show no highlight

### Interaction States

| State | Visual |
|-------|--------|
| **Hover** | Cursor changes to grab on file row |
| **Dragging** | Source files ghost out; badge shows count if multi-select |
| **Over valid target** | Folder: amber dashed border + "Drop to move here" |
| **Over invalid target** | No highlight, cursor "not-allowed" |
| **Completed** | Toast: "Moved {n} files to {folder}" + Undo button |

### Key Files

- `src/app/docs/components/FileCard.tsx` — draggable attribute + drag handlers
- `src/app/docs/components/FileList.tsx` — drag state management, selection-aware drag
- `src/app/docs/components/FolderBrowser.tsx` — drop target handlers + visual states
- `convex/documents.ts` — verify/extend `moveDocument` for project→client scope

---

## Architecture Notes

- **No new dependencies required** — HTML5 Drag and Drop API, existing Anthropic SDK, existing Convex mutations
- **All items use existing Convex reactivity** — UI updates automatically after mutations
- **Toast pattern** should be consistent across FIL-03, NOT-01, and LIB-02 — consider a shared toast-with-undo utility if one doesn't exist
