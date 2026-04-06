'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Send } from 'lucide-react';

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
  const [newNote, setNewNote] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const notes = useQuery(api.documentNotes.getByDocument, {
    documentId: documentId as Id<'documents'>,
  });
  const createNote = useMutation(api.documentNotes.create);

  const handleSubmit = async () => {
    const content = newNote.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      await createNote({
        documentId: documentId as Id<'documents'>,
        content,
        addToIntelligence: false,
      });
      setNewNote('');
      inputRef.current?.focus();
    } catch (err) {
      console.error('[NotesTab] create failed:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {/* Input area — sticky at top */}
      <div className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border)] bg-[var(--m-bg)]">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            className="flex-1 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!newNote.trim() || sending}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-black text-white disabled:opacity-30"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notes list */}
      {notes === undefined ? (
        <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
          Loading...
        </div>
      ) : notes.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
          No notes yet — add one above
        </div>
      ) : (
        <div className="pb-4">
          {notes.map((note) => (
            <div
              key={note._id}
              className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]"
            >
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
              <p className="text-[13px] text-[var(--m-text-primary)] leading-relaxed">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
