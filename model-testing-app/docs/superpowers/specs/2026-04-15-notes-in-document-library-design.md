# Notes in Document Library — Design Spec

**Date:** 2026-04-15  
**Status:** Approved  
**Scope:** Desktop + Mobile document library

## Problem

Notes created in the Notes section and linked to a project are invisible from the document library. Users must navigate to the Notes section separately to see project notes. For organizational purposes, project-linked notes should surface in the project's "Notes" folder in the document library, creating a single place to see all note-related content for a project.

## Solution

When a note is linked to a project, it appears as a virtual item in that project's "Notes" folder in the document library. Notes are visually distinguished from uploaded documents with a "Note" badge. Clicking a note navigates to the note editor in the Notes section.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Click behavior | Navigate to notes editor | Option A — simplest, avoids building a preview component |
| Visual distinction | "Note" badge + pen icon | Users can tell at a glance which items are notes vs. uploaded documents |
| Folder count | Combined total (docs + notes) | Reinforces "everything note-related lives here" mental model |
| Note filing | Always in "Notes" folder | No manual filing into other folders — notes are always in the Notes folder |

## Data Layer

### New Convex Query: `notes.getByProjectForFolder`

- **Input:** `projectId: Id<"projects">`
- **Output:** Array of note metadata (no content field — lightweight for list display):
  - `_id`, `title`, `emoji`, `updatedAt`, `createdAt`, `wordCount`, `isDraft`, `tags`
- **Purpose:** Provides the data needed to render note items in the folder view without fetching heavy content payloads

### Folder Count Update

Modify the folder document count logic to include project-linked notes when computing the count for the "notes" folder type:
- Count = `documents in notes folder` + `notes linked to project`
- Affects both desktop `FolderBrowser` and mobile `ProjectFolderList` folder count badges

### No Schema Changes

The existing `notes` table already has `projectId`. No migrations or new tables needed.

## Desktop — FileList Component

**File:** `src/app/(desktop)/docs/components/FileList.tsx`

When `selectedFolder.folderType === "notes"` and a `projectId` is available:

1. Query `api.documents.getByFolder` (existing — unchanged)
2. Query `api.notes.getByProjectForFolder` (new)
3. Map notes to a unified display shape compatible with the existing document list item structure:
   - `title` → display name
   - `updatedAt` → date field
   - `emoji` → optional prefix
   - `_type: "note"` → discriminator for rendering logic
4. Merge documents and notes into a single array
5. Sort the merged array using the same sort options (date, name, etc.)
6. Render note items with:
   - Pen/edit icon (e.g., `Pencil` from lucide) instead of file-type icon
   - Small "Note" badge (styled like existing badges)
   - Draft notes also show a "Draft" badge
   - `onClick` → `router.push(\`/notes?note=\${noteId}\`)`

## Mobile — FolderContents Component

**File:** `src/app/(mobile)/m-docs/components/FolderContents.tsx`

Same pattern as desktop:

1. When `folderTypeKey === "notes"` and `projectId` exists, also query `api.notes.getByProjectForFolder`
2. Merge and sort with documents
3. Render note items using `FileRow`-like styling with:
   - Pen/edit icon
   - "Note" badge
   - Draft badge if applicable
   - `onClick` → navigate to `/m-notes?note=noteId`

## What Appears

- Notes with a `projectId` matching the current project
- Both drafts and published notes (drafts get an additional "Draft" badge)
- Notes without a `projectId` (unfiled/personal) do NOT appear in any folder

## Out of Scope

- Filing notes into folders other than "Notes"
- Editing notes from within the document library
- Document viewer/preview for notes
- Changes to note creation flow
- Client-level note display (only project-level)

## Components Affected

| Component | Platform | Change |
|-----------|----------|--------|
| `convex/notes.ts` | Backend | Add `getByProjectForFolder` query |
| `convex/folderStructure.ts` or count logic | Backend | Include notes in folder count for "notes" type |
| `src/app/(desktop)/docs/components/FileList.tsx` | Desktop | Query + merge + render notes in notes folder |
| `src/app/(mobile)/m-docs/components/FolderContents.tsx` | Mobile | Query + merge + render notes in notes folder |
| `src/app/(mobile)/m-docs/components/ProjectFolderList.tsx` | Mobile | Updated folder count |
| `src/app/(desktop)/docs/components/FolderBrowser.tsx` | Desktop | Updated folder count |
