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
