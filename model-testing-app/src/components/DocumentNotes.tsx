"use client";

import { useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import DocumentNoteForm from "@/app/(desktop)/docs/reader/[documentId]/components/DocumentNoteForm";
import DocumentNoteCard from "@/app/(desktop)/docs/reader/[documentId]/components/DocumentNoteCard";
import NoteCleanupBubble from "@/components/NoteCleanupBubble";
import { showUndoToast } from "@/components/UndoToast";

interface DocumentNotesProps {
  documentId: Id<"documents">;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
}

export default function DocumentNotes({ documentId, clientId, projectId }: DocumentNotesProps) {
  const notes = useQuery(api.documentNotes.getByDocument, { documentId });
  const notesContainerRef = useRef<HTMLDivElement>(null);

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
    range.deleteContents();
    range.insertNode(document.createTextNode(cleaned));
    showUndoToast({
      message: "Text cleaned up",
      onUndo: () => {
        // Best-effort undo for selection cleanup
      },
    });
  }, [cleanupText]);

  return (
    <div className="flex flex-col h-full">
      {/* Notes list — scrollable */}
      <div className="flex-1 overflow-y-auto space-y-3 p-1 relative" ref={notesContainerRef}>
        <NoteCleanupBubble
          containerRef={notesContainerRef}
          onCleanup={handleSelectionCleanup}
        />
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
