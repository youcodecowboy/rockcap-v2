'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';

interface NotesTabProps {
  documentId: string;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotesTab({ documentId }: NotesTabProps) {
  const notes = useQuery(api.documentNotes.getByDocument, {
    documentId: documentId as Id<'documents'>,
  });

  if (notes === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
        Loading...
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
        No notes yet
      </div>
    );
  }

  return (
    <div className="pb-6">
      {notes.map((note) => (
        <div
          key={note._id}
          className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]"
        >
          {/* Header row: initials + name + timestamp */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--m-bg-inset)] text-[11px] font-semibold text-[var(--m-text-secondary)] shrink-0">
              {note.createdByInitials}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-[12px] font-medium text-[var(--m-text-primary)]">
                {note.createdByName}
              </span>
              <span className="text-[11px] text-[var(--m-text-tertiary)] ml-2">
                {formatDate(note.createdAt)}
              </span>
            </div>
          </div>

          {/* Note content */}
          <p className="text-[13px] text-[var(--m-text-primary)] leading-relaxed">
            {note.content}
          </p>
        </div>
      ))}
    </div>
  );
}
