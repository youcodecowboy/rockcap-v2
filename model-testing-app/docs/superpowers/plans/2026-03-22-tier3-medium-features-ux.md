# Tier 3 — Medium Features & UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement five client-feedback features: client sort by recent access, file duplication, notes tab in preview drawer, AI note cleanup, and drag-and-drop file moves.

**Architecture:** Each feature is isolated — no cross-feature dependencies except a shared toast-with-undo utility built in Task 1. Batches can run in parallel once the shared utility exists. All backend work is Convex mutations; frontend uses existing shadcn/ui + sonner toast + Tailwind patterns.

**Tech Stack:** Next.js 16, Convex, React, TypeScript, shadcn/ui, sonner (toast), Anthropic SDK (Haiku 4.5), HTML5 Drag and Drop API

**Spec:** `docs/superpowers/specs/2026-03-22-tier3-medium-features-ux-design.md`

---

## File Structure

### Shared
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/UndoToast.tsx` | Reusable toast-with-undo utility for FIL-03, NOT-01, LIB-02 |

### UIX-03 — Client Sort
| Action | File | Purpose |
|--------|------|---------|
| Modify | `convex/schema.ts` | Add `lastAccessedAt` field + index to clients table |
| Modify | `convex/clients.ts` | New `recordAccess` mutation |
| Modify | `src/app/clients/components/ClientsSidebar.tsx` | Sort by recency + call recordAccess |

### FIL-03 — Duplicate File
| Action | File | Purpose |
|--------|------|---------|
| Modify | `convex/documents.ts` | New `duplicateDocument` mutation |
| Modify | `src/app/docs/components/FileCard.tsx` | Add Duplicate menu item |
| Modify | `src/app/docs/components/FileList.tsx` | Add handleDuplicate handler |

### NOT-02 — Notes Tab
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/DocumentNotes.tsx` | Shared notes list + form (extracted from reader) |
| Modify | `src/app/docs/components/FileDetailPanel.tsx` | Add Notes tab, widen drawer |
| Modify | `src/app/docs/reader/[documentId]/components/ReaderSidebar.tsx` | Use shared DocumentNotes component |

### NOT-01 — AI Note Cleanup
| Action | File | Purpose |
|--------|------|---------|
| Create | `src/app/api/note-cleanup/route.ts` | Haiku cleanup API endpoint |
| Create | `src/components/NoteCleanupBubble.tsx` | Floating selection bubble UI |
| Modify | `src/components/DocumentNotes.tsx` | Add cleanup toolbar button + selection bubble integration |

### LIB-02 — Drag-and-Drop
| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/app/docs/components/FileCard.tsx` | Add draggable + drag handlers |
| Modify | `src/app/docs/components/FileList.tsx` | Drag state management, selection-aware drag |
| Modify | `src/app/docs/components/FolderBrowser.tsx` | Drop target handlers + visual states |

---

## Task 1: Shared Toast-with-Undo Utility

**Files:**
- Create: `src/components/UndoToast.tsx`

This is used by FIL-03, NOT-01, and LIB-02 so it goes first.

- [ ] **Step 1: Create the UndoToast utility**

```tsx
// src/components/UndoToast.tsx
"use client";

import { toast } from "sonner";

interface UndoToastOptions {
  message: string;
  onUndo: () => void | Promise<void>;
  duration?: number;
}

export function showUndoToast({ message, onUndo, duration = 5000 }: UndoToastOptions) {
  toast(message, {
    duration,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await onUndo();
          toast.success("Undone");
        } catch {
          toast.error("Failed to undo");
        }
      },
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `UndoToast.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/UndoToast.tsx
git commit -m "feat: add shared toast-with-undo utility"
```

---

## Task 2: UIX-03 — Schema + Mutation for Client Access Tracking

**Files:**
- Modify: `convex/schema.ts` (clients table)
- Modify: `convex/clients.ts` (new mutation)

- [ ] **Step 1: Add `lastAccessedAt` field and index to clients schema**

In `convex/schema.ts`, add to the clients table definition:

```ts
// Add field alongside other optional fields (near lastContactDate):
lastAccessedAt: v.optional(v.string()),
```

Add index (alongside existing indices `by_status`, `by_type`, `by_name`, `by_hubspot_id`):

```ts
.index("by_last_accessed", ["lastAccessedAt"])
```

- [ ] **Step 2: Add `recordAccess` mutation to clients.ts**

Add at the end of `convex/clients.ts`:

```ts
export const recordAccess = mutation({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return;

    // Debounce: skip if accessed less than 30 seconds ago
    if (client.lastAccessedAt) {
      const lastAccess = new Date(client.lastAccessedAt).getTime();
      const now = Date.now();
      if (now - lastAccess < 30_000) return;
    }

    await ctx.db.patch(args.clientId, {
      lastAccessedAt: new Date().toISOString(),
    });
  },
});
```

- [ ] **Step 3: Run Convex codegen to verify schema**

Run: `npx convex codegen`
Expected: Successful codegen with no errors

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/clients.ts
git commit -m "feat(UIX-03): add lastAccessedAt field and recordAccess mutation"
```

---

## Task 3: UIX-03 — Frontend Sort by Recent Access

**Files:**
- Modify: `src/app/clients/components/ClientsSidebar.tsx`

- [ ] **Step 1: Import useMutation and add recordAccess call**

At the top of `ClientsSidebar.tsx`, ensure these imports exist:

```ts
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
```

Inside the component, add the mutation hook:

```ts
const recordAccess = useMutation(api.clients.recordAccess);
```

- [ ] **Step 2: Call recordAccess in the navigation handler**

Find the `onClientSelect` call (around line 286). Wrap it to also fire `recordAccess`:

```ts
onClick={() => {
  recordAccess({ clientId: client._id });
  onClientSelect(client._id);
}}
```

- [ ] **Step 3: Change the sort logic from alphabetical to recency**

Replace the existing sort (around line 110-111):

```ts
return filtered.sort((a, b) => a.name.localeCompare(b.name));
```

With:

```ts
return filtered.sort((a, b) => {
  const aTime = (a as any).lastAccessedAt;
  const bTime = (b as any).lastAccessedAt;
  if (aTime && bTime) return bTime.localeCompare(aTime);
  if (aTime) return -1;
  if (bTime) return 1;
  return a.name.localeCompare(b.name);
});
```

> **Note:** The `as any` cast is needed temporarily until Convex codegen picks up the new field. After running `npx convex codegen`, the type should include `lastAccessedAt` and the cast can be removed.

- [ ] **Step 4: Build check**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/clients/components/ClientsSidebar.tsx
git commit -m "feat(UIX-03): sort clients sidebar by most recently accessed"
```

---

## Task 4: FIL-03 — Duplicate Document Mutation

**Files:**
- Modify: `convex/documents.ts`

- [ ] **Step 1: Add `duplicateDocument` mutation**

Add at an appropriate location in `convex/documents.ts` (near `moveDocument`):

```ts
export const duplicateDocument = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");

    // Generate the "(Copy)" display name
    const copyName = doc.displayName
      ? `${doc.displayName} (Copy)`
      : doc.fileName
        ? `${doc.fileName} (Copy)`
        : "Document (Copy)";

    // Look up client name for code generation
    let clientName = "Unknown";
    if (doc.clientId) {
      const client = await ctx.db.get(doc.clientId);
      if (client) clientName = client.name;
    }

    // Generate new document code
    const now = new Date().toISOString();
    const newCode = generateDocumentCode(
      clientName,
      doc.category || "Uncategorized",
      doc.projectName || undefined,
      now,
    );

    // Check uniqueness and add counter suffix if needed
    const existingWithCode = await ctx.db
      .query("documents")
      .filter((q) => q.eq(q.field("documentCode"), newCode))
      .first();

    const finalCode = existingWithCode
      ? `${newCode}-${Date.now().toString(36).slice(-4)}`
      : newCode;

    // Clone the document record
    const newDocId = await ctx.db.insert("documents", {
      // File reference (shared — no blob duplication)
      storageId: doc.storageId,
      fileName: copyName,
      displayName: copyName,
      fileType: doc.fileType,
      fileSize: doc.fileSize,

      // Location (same as original)
      clientId: doc.clientId,
      projectId: doc.projectId,
      projectName: doc.projectName,
      isBaseDocument: doc.isBaseDocument,
      folderId: doc.folderId,
      folderType: doc.folderType,

      // Classification (copied)
      category: doc.category,
      documentType: doc.documentType,
      tags: doc.tags,

      // Metadata
      documentCode: finalCode,
      uploadedAt: now,
      uploadedBy: doc.uploadedBy,
      status: doc.status || "filed",
      scope: doc.scope,
      owner: doc.owner,

      // Notes flagging the duplicate
      notes: `Duplicated from ${doc.documentCode || doc.fileName}`,
    });

    return newDocId;
  },
});
```

- [ ] **Step 2: Run Convex codegen**

Run: `npx convex codegen`
Expected: Successful codegen

- [ ] **Step 3: Commit**

```bash
git add convex/documents.ts
git commit -m "feat(FIL-03): add duplicateDocument mutation"
```

---

## Task 5: FIL-03 — Frontend Duplicate Menu Item

**Files:**
- Modify: `src/app/docs/components/FileCard.tsx`
- Modify: `src/app/docs/components/FileList.tsx`

- [ ] **Step 1: Add `onDuplicate` prop to FileCard**

In `FileCard.tsx`, add to the `FileCardProps` interface (around line 57-74):

```ts
onDuplicate?: () => void;
```

Add `onDuplicate` to the destructured props in the component function.

- [ ] **Step 2: Add Duplicate menu item to renderDropdownItems**

Import the `Copy` icon at the top:

```ts
import { Copy } from "lucide-react";
```

Add to the existing lucide-react import line (which already imports Eye, Download, FolderInput, Trash2, BookOpen, Layers, Unlink).

In `renderDropdownItems()`, add after the `onMove` menu item and before the separator above Delete:

```tsx
{onDuplicate && (
  <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onDuplicate)}>
    <Copy className="w-4 h-4 mr-2" />
    Duplicate
  </DropdownMenuItem>
)}
```

- [ ] **Step 3: Add handleDuplicate in FileList.tsx**

In `FileList.tsx`, import the mutation and toast:

```ts
import { useMutation } from "convex/react";
import { toast } from "sonner";
```

(These may already be imported — check and add only if missing.)

Add the handler inside the component:

```ts
const duplicateDocument = useMutation(api.documents.duplicateDocument);

const handleDuplicate = useCallback(async (documentId: Id<"documents">, fileName: string) => {
  try {
    await duplicateDocument({ documentId });
    toast.success(`Duplicated "${fileName}"`);
  } catch (error) {
    toast.error("Failed to duplicate document");
  }
}, [duplicateDocument]);
```

- [ ] **Step 4: Pass onDuplicate to FileCard**

Find where `FileCard` is rendered in `FileList.tsx` and add the prop:

```tsx
onDuplicate={() => handleDuplicate(doc._id, doc.displayName || doc.fileName)}
```

- [ ] **Step 5: Build check**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/app/docs/components/FileCard.tsx src/app/docs/components/FileList.tsx
git commit -m "feat(FIL-03): add duplicate option to file context menu"
```

---

## Task 6: NOT-02 — Extract Shared DocumentNotes Component

**Files:**
- Create: `src/components/DocumentNotes.tsx`

The existing `DocumentNoteForm` and `DocumentNoteCard` live deep in the reader path with reader-specific relative imports. Rather than moving them, create a wrapper component that composes them for reuse in both the drawer and reader.

- [ ] **Step 1: Create shared DocumentNotes component**

```tsx
// src/components/DocumentNotes.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import DocumentNoteForm from "@/app/docs/reader/[documentId]/components/DocumentNoteForm";
import DocumentNoteCard from "@/app/docs/reader/[documentId]/components/DocumentNoteCard";

interface DocumentNotesProps {
  documentId: Id<"documents">;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
}

export default function DocumentNotes({ documentId, clientId, projectId }: DocumentNotesProps) {
  const notes = useQuery(api.documentNotes.getByDocument, { documentId });

  return (
    <div className="flex flex-col h-full">
      {/* Notes list — scrollable */}
      <div className="flex-1 overflow-y-auto space-y-3 p-1">
        {notes === undefined ? (
          <div className="text-sm text-gray-400 text-center py-8">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8">No notes yet</div>
        ) : (
          notes.map((note) => (
            <DocumentNoteCard key={note._id} note={note} />
          ))
        )}
      </div>

      {/* Add note form — pinned at bottom */}
      <div className="border-t border-gray-100 pt-3 mt-3 flex-shrink-0">
        <DocumentNoteForm
          documentId={documentId}
          clientId={clientId}
          projectId={projectId}
        />
      </div>
    </div>
  );
}
```

> **Note:** The imports from `@/app/docs/reader/[documentId]/components/` use path aliases. If these imports fail due to the bracket in the path, the components will need to be moved to `src/components/` as a sub-task. Check this during implementation.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors. If the bracketed path import fails, move `DocumentNoteForm.tsx` and `DocumentNoteCard.tsx` to `src/components/` and update imports in both the reader sidebar and this new component.

- [ ] **Step 3: Commit**

```bash
git add src/components/DocumentNotes.tsx
git commit -m "feat(NOT-02): extract shared DocumentNotes component"
```

---

## Task 7: NOT-02 — Add Notes Tab to FileDetailPanel

**Files:**
- Modify: `src/app/docs/components/FileDetailPanel.tsx`

- [ ] **Step 1: Import DocumentNotes**

Add at the top of `FileDetailPanel.tsx`:

```ts
import DocumentNotes from "@/components/DocumentNotes";
```

- [ ] **Step 2: Widen the drawer**

Find the Sheet/SheetContent width class (search for `w-[1080px]`) and change to:

```ts
w-[1460px]
```

- [ ] **Step 3: Change tab grid from 5 to 6 columns**

Find `grid grid-cols-5` in the TabsList and change to:

```ts
grid grid-cols-6
```

- [ ] **Step 4: Shorten "Intelligence" label to "Intel"**

Find the Intelligence TabsTrigger text and change from `Intelligence` to `Intel`.

- [ ] **Step 5: Add Notes TabsTrigger after Checklist**

After the Checklist TabsTrigger and before the Threads TabsTrigger, add:

```tsx
<TabsTrigger value="notes" className="text-xs px-2 py-1.5">
  Notes
</TabsTrigger>
```

- [ ] **Step 6: Add Notes TabsContent**

After the Checklist TabsContent and before the Threads TabsContent, add:

```tsx
<TabsContent value="notes" className="mt-0 p-5 flex-1 data-[state=inactive]:hidden">
  <DocumentNotes
    documentId={document._id}
    clientId={document.clientId}
    projectId={document.projectId}
  />
</TabsContent>
```

> **Note:** `document` is the prop passed into FileDetailPanel — verify the exact prop name by checking the component's props interface. It may be called `selectedDocument` or `file`.

- [ ] **Step 7: Build check**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/app/docs/components/FileDetailPanel.tsx
git commit -m "feat(NOT-02): add Notes tab to document preview drawer"
```

---

## Task 8: NOT-01 — AI Note Cleanup API Route

**Files:**
- Create: `src/app/api/note-cleanup/route.ts`

- [ ] **Step 1: Create the cleanup API route**

```ts
// src/app/api/note-cleanup/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a note cleanup assistant for a property finance team. The user has dictated or quickly typed raw notes. Your job is to enhance — not rewrite.

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

Return only the cleaned text. No explanations.`;

export async function POST(request: NextRequest) {
  try {
    const { text, mode } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    if (!mode || !["selection", "full"].includes(mode)) {
      return NextResponse.json({ error: "mode must be 'selection' or 'full'" }, { status: 400 });
    }

    const userPrompt =
      mode === "selection"
        ? `Clean up this selected text from a note:\n\n${text}`
        : `Clean up this entire note:\n\n${text}`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const cleaned =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ cleaned });
  } catch (error) {
    console.error("Note cleanup error:", error);
    return NextResponse.json(
      { error: "Failed to clean up note" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/note-cleanup/route.ts
git commit -m "feat(NOT-01): add AI note cleanup API route with Haiku 4.5"
```

---

## Task 9: NOT-01 — Selection Bubble + Toolbar Button

**Files:**
- Create: `src/components/NoteCleanupBubble.tsx`
- Modify: `src/components/DocumentNotes.tsx`

- [ ] **Step 1: Create the floating selection bubble component**

```tsx
// src/components/NoteCleanupBubble.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NoteCleanupBubbleProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onCleanup: (selectedText: string, range: Range) => Promise<void>;
}

export default function NoteCleanupBubble({ containerRef, onCleanup }: NoteCleanupBubbleProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (
        !selection ||
        selection.isCollapsed ||
        !selection.rangeCount ||
        !container.contains(selection.anchorNode)
      ) {
        if (!isLoading) setPosition(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const text = selection.toString().trim();
      if (text.length < 5) {
        if (!isLoading) setPosition(null);
        return;
      }

      rangeRef.current = range.cloneRange();
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      setPosition({
        top: rect.top - containerRect.top - 40,
        left: rect.left - containerRect.left + rect.width / 2,
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [containerRef, isLoading]);

  if (!position) return null;

  const handleClick = async () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || !rangeRef.current) return;

    setIsLoading(true);
    try {
      await onCleanup(text, rangeRef.current);
    } finally {
      setIsLoading(false);
      setPosition(null);
    }
  };

  return (
    <div
      ref={bubbleRef}
      className="absolute z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-1 duration-150"
      style={{ top: position.top, left: position.left }}
    >
      <Button
        size="sm"
        variant="secondary"
        className="shadow-lg text-xs gap-1.5 h-7 px-2.5"
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        Clean up
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Add cleanup integration to DocumentNotes**

Update `src/components/DocumentNotes.tsx` to add the toolbar button and selection bubble. Add imports:

```tsx
import { useRef, useState, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import NoteCleanupBubble from "@/components/NoteCleanupBubble";
import { showUndoToast } from "@/components/UndoToast";
```

Inside the component, add cleanup logic:

```tsx
const notesContainerRef = useRef<HTMLDivElement>(null);
const [isCleaningAll, setIsCleaningAll] = useState(false);

const cleanupText = useCallback(async (text: string, mode: "selection" | "full") => {
  const res = await fetch("/api/note-cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode }),
  });
  if (!res.ok) throw new Error("Cleanup failed");
  const data = await res.json();
  return data.cleaned as string;
}, []);

const handleSelectionCleanup = useCallback(async (selectedText: string, range: Range) => {
  const cleaned = await cleanupText(selectedText, "selection");
  const originalText = selectedText;

  range.deleteContents();
  range.insertNode(document.createTextNode(cleaned));

  showUndoToast({
    message: "Text cleaned up",
    onUndo: () => {
      // Selection-level undo is best-effort; user can also Ctrl+Z
    },
  });
}, [cleanupText]);
```

> **Note:** The exact integration of cleanup into note editing depends on whether `DocumentNoteCard` uses a textarea, contenteditable, or rich text editor. The selection bubble works with any of these via `window.getSelection()`. During implementation, check the note editing UX and adapt. The full-document cleanup button should be added to the header area of the DocumentNotes component.

- [ ] **Step 3: Build check**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/NoteCleanupBubble.tsx src/components/DocumentNotes.tsx
git commit -m "feat(NOT-01): add AI note cleanup with selection bubble and toolbar button"
```

---

## Task 10: LIB-02 — Make Files Draggable

**Files:**
- Modify: `src/app/docs/components/FileCard.tsx`
- Modify: `src/app/docs/components/FileList.tsx`

- [ ] **Step 1: Add drag handlers to FileCard**

Add new props to `FileCardProps`:

```ts
onDragStart?: (e: React.DragEvent) => void;
isDragging?: boolean;
```

Add `draggable` and handlers to the card's root element (the outermost clickable div):

```tsx
draggable={!!onDragStart}
onDragStart={onDragStart}
className={cn(
  // ... existing classes ...
  isDragging && "opacity-35"
)}
```

Also add `cursor-grab` to the className when `onDragStart` is defined.

- [ ] **Step 2: Add drag state management to FileList**

In `FileList.tsx`, add state:

```ts
const [draggingDocIds, setDraggingDocIds] = useState<Set<string>>(new Set());
```

Add handler:

```ts
const handleDragStart = useCallback((e: React.DragEvent, docId: string) => {
  // If the dragged doc is in the selection, drag all selected; otherwise just this one
  const idsToMove = selectedDocIds.has(docId)
    ? Array.from(selectedDocIds)
    : [docId];

  e.dataTransfer.setData("application/x-document-ids", JSON.stringify(idsToMove));
  e.dataTransfer.effectAllowed = "move";

  setDraggingDocIds(new Set(idsToMove));

  // Clean up on drag end
  const handleDragEnd = () => {
    setDraggingDocIds(new Set());
    document.removeEventListener("dragend", handleDragEnd);
  };
  document.addEventListener("dragend", handleDragEnd);
}, [selectedDocIds]);
```

- [ ] **Step 3: Pass drag props to FileCard**

Where FileCard is rendered, add:

```tsx
onDragStart={(e) => handleDragStart(e, doc._id)}
isDragging={draggingDocIds.has(doc._id)}
```

- [ ] **Step 4: Build check**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/docs/components/FileCard.tsx src/app/docs/components/FileList.tsx
git commit -m "feat(LIB-02): make file cards draggable with multi-select support"
```

---

## Task 11: LIB-02 — Folder Drop Targets

**Files:**
- Modify: `src/app/docs/components/FolderBrowser.tsx`

- [ ] **Step 1: Add drop target state and handlers**

In `FolderBrowser.tsx`, add state for tracking which folder is being hovered:

```ts
const [dropTargetId, setDropTargetId] = useState<string | null>(null);
```

Add drop handler props. The component will need access to the move mutations. Import:

```ts
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { showUndoToast } from "@/components/UndoToast";
```

Add mutation hooks:

```ts
const moveDocument = useMutation(api.documents.moveDocument);
const bulkMove = useMutation(api.documents.bulkMove);
```

- [ ] **Step 2: Create drag-over and drop handler functions**

```ts
const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  setDropTargetId(folderId);
}, []);

const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  setDropTargetId(null);
}, []);

const handleFolderDrop = useCallback(async (
  e: React.DragEvent,
  targetFolder: {
    type: "client" | "project";
    folderId: string;
    folderName: string;
    projectId?: string;
    clientId: string;
  }
) => {
  e.preventDefault();
  setDropTargetId(null);

  const data = e.dataTransfer.getData("application/x-document-ids");
  if (!data) return;

  const docIds = JSON.parse(data) as string[];
  if (docIds.length === 0) return;

  // Cache original locations for undo (would need to query docs before move)
  const count = docIds.length;

  try {
    if (count === 1) {
      await moveDocument({
        documentId: docIds[0] as any,
        targetClientId: targetFolder.clientId as any,
        targetProjectId: targetFolder.projectId as any,
        targetProjectName: undefined,
        isBaseDocument: targetFolder.type === "client" && targetFolder.folderId === "base",
      });
    } else {
      await bulkMove({
        documentIds: docIds as any,
        targetScope: "client",
        targetClientId: targetFolder.clientId as any,
        targetProjectId: targetFolder.projectId as any,
        targetFolderId: targetFolder.folderId,
        targetFolderType: targetFolder.type,
      });
    }

    showUndoToast({
      message: `Moved ${count} file${count !== 1 ? "s" : ""} to ${targetFolder.folderName}`,
      onUndo: async () => {
        // Undo requires knowing original locations — this is a best-effort approach
        // For v1, show a message directing user to use the Move modal to move back
        toast.info("Use the Move option to move files back to their original folder");
      },
    });
  } catch (error) {
    toast.error(`Failed to move file${count !== 1 ? "s" : ""}`);
  }
}, [moveDocument, bulkMove]);
```

> **Note on Undo:** A full undo would require caching each document's original folder before the move. For v1, the undo toast shows a helpful message. A follow-up improvement could cache original locations by querying the documents before executing the move.

- [ ] **Step 3: Apply drag handlers to each folder button**

For each folder `<button>` in the rendering logic, add:

```tsx
onDragOver={(e) => handleFolderDragOver(e, folder.id)}
onDragLeave={handleFolderDragLeave}
onDrop={(e) => handleFolderDrop(e, {
  type: folderType,
  folderId: folder.id,
  folderName: folder.name,
  projectId,
  clientId,
})}
className={cn(
  // ... existing classes ...
  dropTargetId === folder.id && "!bg-amber-50 !border-2 !border-dashed !border-amber-400 !text-amber-700"
)}
```

> **Implementation note:** The exact folder rendering structure varies between base doc folders, project folders, and custom folders in FolderBrowser. Each folder `<button>` element needs these three handlers added. Check each rendering path (unfiled, standard category folders, custom folders, project-level folders) and apply consistently.

- [ ] **Step 4: Handle cross-scope drop (project → client base docs)**

When the drop target is the client-level "Base Documents" folder, the `moveDocument` mutation should receive:
- `isBaseDocument: true`
- `targetProjectId: undefined`

Verify this works with the existing `moveDocument` mutation. If `moveDocument` doesn't support unsetting `projectId`, use `moveDocumentCrossScope` instead:

```ts
// If moving from project to client base docs:
await moveDocumentCrossScope({
  documentId: docIds[0] as any,
  targetScope: "client",
  targetClientId: targetFolder.clientId as any,
  targetIsBaseDocument: true,
});
```

- [ ] **Step 5: Build check**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/app/docs/components/FolderBrowser.tsx
git commit -m "feat(LIB-02): add drag-and-drop targets to folder browser with undo toast"
```

---

## Task 12: Final Build + Push

- [ ] **Step 1: Full build check**

Run: `npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Fix any build errors**

If there are errors, fix them and re-run the build.

- [ ] **Step 3: Commit any fixes and push**

```bash
git push origin main
```

---

## Quick Reference: What Each Backlog Item Maps To

| Backlog ID | Tasks | Key Files |
|-----------|-------|-----------|
| UIX-03 | 2, 3 | `convex/schema.ts`, `convex/clients.ts`, `ClientsSidebar.tsx` |
| FIL-03 | 4, 5 | `convex/documents.ts`, `FileCard.tsx`, `FileList.tsx` |
| NOT-02 | 6, 7 | `DocumentNotes.tsx` (new), `FileDetailPanel.tsx` |
| NOT-01 | 8, 9 | `note-cleanup/route.ts` (new), `NoteCleanupBubble.tsx` (new), `DocumentNotes.tsx` |
| LIB-02 | 10, 11 | `FileCard.tsx`, `FileList.tsx`, `FolderBrowser.tsx` |
