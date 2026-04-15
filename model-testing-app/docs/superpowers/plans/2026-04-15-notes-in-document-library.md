# Notes in Document Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface project-linked notes as virtual items in the project's "Notes" folder in the document library, navigable back to the notes editor.

**Architecture:** Add a lightweight Convex query returning note metadata for a project. Modify folder count queries to include notes. Modify the desktop `FileList` and mobile `FolderContents` components to merge notes into the item list when viewing the "notes" folder.

**Tech Stack:** Convex (backend queries), React (Next.js components), Lucide icons, Tailwind CSS

---

### Task 1: Add `getByProjectForFolder` Query to Convex

**Files:**
- Modify: `convex/notes.ts` (append new query after line 386)

- [ ] **Step 1: Add the query**

Add this query at the end of `convex/notes.ts` (before the closing of the file, after the `getAll` query):

```typescript
// Query: Get notes for a project — lightweight metadata for document library folder view
export const getByProjectForFolder = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();

    // Return lightweight metadata — no content field
    return notes.map(note => ({
      _id: note._id,
      title: note.title,
      emoji: note.emoji,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
      wordCount: note.wordCount,
      isDraft: note.isDraft,
      tags: note.tags,
    }));
  },
});
```

- [ ] **Step 2: Verify Convex codegen picks it up**

Run: `cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app && npx convex codegen`
Expected: No errors, `api.notes.getByProjectForFolder` is now available.

- [ ] **Step 3: Commit**

```bash
git add convex/notes.ts
git commit -m "feat: add getByProjectForFolder query for document library"
```

---

### Task 2: Include Notes in Folder Count Queries

**Files:**
- Modify: `convex/documents.ts:1804-1836` (`getFolderCounts` query)
- Modify: `convex/documents.ts:1839-1872` (`getProjectFolderCounts` query)

- [ ] **Step 1: Update `getFolderCounts` to include note counts**

In `convex/documents.ts`, replace the `getFolderCounts` query (lines 1804-1836) with:

```typescript
export const getFolderCounts = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    const clientFolders: Record<string, number> = {};
    const projectFolders: Record<string, Record<string, number>> = {};
    let clientTotal = 0;

    for (const doc of docs) {
      if (doc.projectId) {
        // Project-level document
        if (!projectFolders[doc.projectId]) {
          projectFolders[doc.projectId] = {};
        }
        const folderKey = doc.folderId || 'uncategorized';
        projectFolders[doc.projectId][folderKey] = (projectFolders[doc.projectId][folderKey] || 0) + 1;
      } else {
        // Client-level document (no project)
        clientTotal++;
        if (doc.folderId && doc.folderType === 'client') {
          clientFolders[doc.folderId] = (clientFolders[doc.folderId] || 0) + 1;
        }
      }
    }

    // Add note counts to the "notes" folder for each project
    const allNotes = await ctx.db.query("notes").collect();
    for (const note of allNotes) {
      if (note.projectId) {
        const pid = note.projectId as string;
        if (!projectFolders[pid]) {
          projectFolders[pid] = {};
        }
        projectFolders[pid]["notes"] = (projectFolders[pid]["notes"] || 0) + 1;
      }
    }

    return { clientFolders, projectFolders, clientTotal };
  },
});
```

- [ ] **Step 2: Update `getProjectFolderCounts` to include note counts**

In `convex/documents.ts`, replace the `getProjectFolderCounts` query (lines 1839-1872) with:

```typescript
export const getProjectFolderCounts = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get all projects for this client
    const allProjects = await ctx.db.query("projects").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    const clientProjects = allProjects.filter(p =>
      p.clientRoles.some(cr => cr.clientId === args.clientId)
    );

    // Get all documents for this client
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    
    // Build counts per project
    const result: Record<string, { folders: Record<string, number>; total: number }> = {};
    
    for (const project of clientProjects) {
      result[project._id] = { folders: {}, total: 0 };
    }
    
    for (const doc of docs) {
      if (doc.projectId && result[doc.projectId]) {
        const folderKey = doc.folderId || 'uncategorized';
        result[doc.projectId].folders[folderKey] = (result[doc.projectId].folders[folderKey] || 0) + 1;
        result[doc.projectId].total++;
      }
    }

    // Add note counts to the "notes" folder for each project
    for (const project of clientProjects) {
      const projectNotes = await ctx.db
        .query("notes")
        .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
        .collect();
      if (projectNotes.length > 0) {
        if (!result[project._id]) {
          result[project._id] = { folders: {}, total: 0 };
        }
        result[project._id].folders["notes"] = (result[project._id].folders["notes"] || 0) + projectNotes.length;
        result[project._id].total += projectNotes.length;
      }
    }

    return result;
  },
});
```

- [ ] **Step 3: Run Convex codegen**

Run: `cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app && npx convex codegen`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add convex/documents.ts
git commit -m "feat: include project notes in folder count queries"
```

---

### Task 3: Desktop — Merge Notes into FileList

**Files:**
- Modify: `src/app/(desktop)/docs/components/FileList.tsx`

This task modifies the desktop `FileList` component to query and display notes when viewing a project's "notes" folder.

- [ ] **Step 1: Add imports**

At the top of `FileList.tsx`, add `Pencil` to the lucide-react imports (it's not currently imported in FileList, though it is in FileCard) and add `StickyNote` for the note badge:

In the lucide-react import block (around line 34), add `StickyNote` to the import list:

```typescript
import {
  LayoutGrid,
  List,
  Upload,
  FolderOpen,
  FileText,
  ArrowUpDown,
  FolderInput,
  FolderPlus,
  Trash2,
  ChevronRight,
  StickyNote,
  Pencil,
} from 'lucide-react';
```

- [ ] **Step 2: Add the notes query**

After the existing `folderDocuments` query (around line 182), add a query for notes:

```typescript
  // Notes for the "notes" folder — virtual items from the Notes section
  const isNotesFolder = selectedFolder?.folderId === 'notes' && selectedFolder?.type === 'project';
  const projectNotesForFolder = useQuery(
    api.notes.getByProjectForFolder,
    isNotesFolder && selectedFolder?.projectId
      ? { projectId: selectedFolder.projectId }
      : "skip"
  );
```

- [ ] **Step 3: Define the NoteItem type and merge logic**

After the `documents` useMemo (around line 210), add a type and a merged items list:

```typescript
  // Unified item type for mixed documents + notes in the notes folder
  type NoteItem = {
    _type: 'note';
    _id: string;
    title: string;
    emoji?: string;
    updatedAt: string;
    createdAt: string;
    wordCount?: number;
    isDraft?: boolean;
    tags: string[];
  };

  const noteItems: NoteItem[] = useMemo(() => {
    if (!isNotesFolder || !projectNotesForFolder) return [];
    return projectNotesForFolder.map(note => ({
      _type: 'note' as const,
      _id: note._id,
      title: note.title,
      emoji: note.emoji ?? undefined,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
      wordCount: note.wordCount ?? undefined,
      isDraft: note.isDraft ?? undefined,
      tags: note.tags,
    }));
  }, [isNotesFolder, projectNotesForFolder]);
```

- [ ] **Step 4: Update the file count display to include notes**

Find the count display in the toolbar (around line 580-582):

```typescript
          <span className="text-sm text-gray-500 flex-shrink-0">
            ({sortedDocuments.length} {sortedDocuments.length === 1 ? 'file' : 'files'})
          </span>
```

Replace with:

```typescript
          <span className="text-sm text-gray-500 flex-shrink-0">
            ({sortedDocuments.length + noteItems.length} {(sortedDocuments.length + noteItems.length) === 1 ? 'item' : 'items'})
          </span>
```

- [ ] **Step 5: Add note item rendering in the list view**

Find the `renderListView` function (starts around line 499). After the standalone documents map (around line 546, before the closing `</div>`), add the note items:

```typescript
      {/* Note items from Notes section */}
      {noteItems.map(note => (
        <div
          key={`note-${note._id}`}
          onClick={() => router.push(`/notes?note=${note._id}`)}
          className="flex items-center px-3 py-2 border-b border-gray-100 cursor-pointer group transition-colors hover:bg-gray-50/60"
        >
          {/* Spacer for expand chevron */}
          <div className="flex-shrink-0 w-5" />
          {/* Spacer for checkbox */}
          <div className="flex-shrink-0 w-5" />
          {/* Name block */}
          <div className="flex-1 min-w-0 pl-2 pr-4">
            <div className="flex items-center gap-1.5 min-w-0">
              <Pencil className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-[13px] font-medium text-gray-900 truncate">
                {note.emoji ? `${note.emoji} ` : ''}{note.title || 'Untitled Note'}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                Note
              </Badge>
              {note.isDraft && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Draft
                </Badge>
              )}
            </div>
          </div>
          {/* Type */}
          <div className="flex-shrink-0 w-32 hidden md:block text-[12px] text-gray-500 truncate pr-3">
            Note
          </div>
          {/* Category */}
          <div className="flex-shrink-0 w-32 hidden lg:flex items-center gap-1.5 pr-3">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-500" />
            <span className="text-[12px] text-gray-500 truncate">Notes</span>
          </div>
          {/* Date */}
          <div className="flex-shrink-0 w-20 hidden sm:block text-[12px] text-gray-400 tabular-nums text-right">
            {new Date(note.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          {/* Size placeholder */}
          <div className="flex-shrink-0 w-16 hidden sm:block text-[12px] text-gray-400 tabular-nums text-right">
            {note.wordCount ? `${note.wordCount}w` : '—'}
          </div>
          {/* Actions spacer */}
          <div className="flex-shrink-0 w-7 ml-1" />
        </div>
      ))}
```

- [ ] **Step 6: Add note items in grid view**

Find the grid view render (around line 719-726). After the existing documents map, add notes:

```typescript
          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedDocuments.map((doc) => (
              <FileCard
                key={doc._id}
                {...fileCardProps(doc)}
                viewMode="grid"
              />
            ))}
            {/* Note items in grid */}
            {noteItems.map(note => (
              <div
                key={`note-${note._id}`}
                onClick={() => router.push(`/notes?note=${note._id}`)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Pencil className="w-8 h-8 text-amber-500" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                    Note
                  </Badge>
                </div>
                <div className="mb-2">
                  <div className="font-medium text-gray-900 text-sm truncate">
                    {note.emoji ? `${note.emoji} ` : ''}{note.title || 'Untitled Note'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {note.isDraft && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Draft</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{new Date(note.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  {note.wordCount && <span>{note.wordCount} words</span>}
                </div>
              </div>
            ))}
          </div>
```

- [ ] **Step 7: Update the empty state check**

Find the empty state check (around line 673). Update to account for notes:

Replace:
```typescript
        {sortedDocuments.length === 0 ? (
```

With:
```typescript
        {sortedDocuments.length === 0 && noteItems.length === 0 ? (
```

- [ ] **Step 8: Commit**

```bash
git add src/app/\(desktop\)/docs/components/FileList.tsx
git commit -m "feat: display project notes in desktop document library Notes folder"
```

---

### Task 4: Mobile — Merge Notes into FolderContents

**Files:**
- Modify: `src/app/(mobile)/m-docs/components/FolderContents.tsx`

- [ ] **Step 1: Add imports**

At the top of `FolderContents.tsx`, add `Pencil` to the lucide-react import:

```typescript
import { ChevronLeft, Upload, Pencil } from 'lucide-react';
```

- [ ] **Step 2: Add the notes query**

After the existing `docs` query (around line 78), add:

```typescript
  // Notes for the "notes" folder — virtual items from the Notes section
  const isNotesFolder = folderTypeKey === 'notes' && folderLevel === 'project' && !!projectId;
  const projectNotesForFolder = useQuery(
    api.notes.getByProjectForFolder,
    isNotesFolder
      ? { projectId: projectId as Id<'projects'> }
      : "skip"
  );

  const noteItems = useMemo(() => {
    if (!isNotesFolder || !projectNotesForFolder) return [];
    return projectNotesForFolder;
  }, [isNotesFolder, projectNotesForFolder]);
```

- [ ] **Step 3: Update counts to include notes**

Find the count variables (around lines 123-129). Replace:

```typescript
  const isLoading = docs === undefined;
  const docCount = sortedDocs?.length ?? 0;
  const isEmpty = !isLoading && subfolders.length === 0 && docCount === 0;
  const backLabel = projectName || clientName;
  const contextLine = [projectName, `${docCount} document${docCount !== 1 ? 's' : ''}`]
    .filter(Boolean)
    .join(' · ');
```

With:

```typescript
  const isLoading = docs === undefined;
  const docCount = sortedDocs?.length ?? 0;
  const totalCount = docCount + noteItems.length;
  const isEmpty = !isLoading && subfolders.length === 0 && totalCount === 0;
  const backLabel = projectName || clientName;
  const contextLine = [projectName, `${totalCount} item${totalCount !== 1 ? 's' : ''}`]
    .filter(Boolean)
    .join(' · ');
```

- [ ] **Step 4: Update the sort bar count**

Find the sort bar (around line 167). Replace:

```typescript
          {isLoading ? '' : `${docCount} document${docCount !== 1 ? 's' : ''}`}
```

With:

```typescript
          {isLoading ? '' : `${totalCount} item${totalCount !== 1 ? 's' : ''}`}
```

- [ ] **Step 5: Render note items after document list**

Find the file list section (around line 224-250). After the `sortedDocs.map` block and before the closing `</div>` of the file list section, add the note items. Replace the entire file list block:

```typescript
      {/* File list */}
      {sortedDocs && sortedDocs.length > 0 && (
        <div>
          {subfolders.length > 0 && (
            <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
              <span className="text-[12px] font-semibold text-[var(--m-text-secondary)]">Documents</span>
            </div>
          )}
          {sortedDocs.map(doc => (
            <FileRow
              key={doc._id}
              fileName={doc.fileName}
              displayName={doc.displayName}
              documentCode={doc.documentCode}
              fileType={doc.fileType ?? ''}
              category={doc.category}
              fileSize={doc.fileSize ?? 0}
              uploadedAt={doc.uploadedAt}
              lastOpenedAt={doc.lastOpenedAt}
              onTap={() => onOpenViewer(doc._id)}
              onMove={() => setMoveTarget({ id: doc._id, name: doc.documentCode || doc.displayName || doc.fileName })}
              onDuplicate={() => handleDuplicate(doc._id)}
              onFlag={() => {/* TODO: wire to flags.create */}}
              onDelete={() => handleDelete(doc._id)}
            />
          ))}
        </div>
      )}

      {/* Note items from Notes section */}
      {noteItems.length > 0 && (
        <div>
          {(subfolders.length > 0 || (sortedDocs && sortedDocs.length > 0)) && (
            <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
              <span className="text-[12px] font-semibold text-[var(--m-text-secondary)]">Notes</span>
            </div>
          )}
          {noteItems.map(note => (
            <div
              key={`note-${note._id}`}
              className="flex items-center border-b border-[var(--m-border-subtle)]"
            >
              <button
                onClick={() => router.push(`/m-notes?note=${note._id}`)}
                className="flex items-center gap-2.5 flex-1 min-w-0 text-left px-[var(--m-page-px)] py-2.5 active:bg-[var(--m-bg-subtle)]"
              >
                <div className="relative flex-shrink-0 w-8 h-8 rounded-md bg-amber-50 flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                      {note.emoji ? `${note.emoji} ` : ''}{note.title || 'Untitled Note'}
                    </span>
                    <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-amber-50 text-amber-700 flex-shrink-0">
                      Note
                    </span>
                    {note.isDraft && (
                      <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">
                        Draft
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
                    {[
                      note.wordCount ? `${note.wordCount} words` : null,
                      new Date(note.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(mobile\)/m-docs/components/FolderContents.tsx
git commit -m "feat: display project notes in mobile document library Notes folder"
```

---

### Task 5: Build Verification & Final Commit

**Files:**
- All modified files from Tasks 1-4

- [ ] **Step 1: Run the build**

Run: `cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app && npx next build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Fix any build errors**

If there are TypeScript errors, fix them and re-run the build.

- [ ] **Step 3: Push to GitHub**

```bash
git push origin mobile2
```
