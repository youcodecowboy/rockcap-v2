'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';

function extractPlainText(content: unknown): string {
  if (!content) return '';
  try {
    const nodes = typeof content === 'string' ? JSON.parse(content) : content;
    if (!Array.isArray(nodes)) return String(content);
    return nodes
      .flatMap((node: any) => (node.children ?? []).map((c: any) => c.text ?? ''))
      .join(' ')
      .trim();
  } catch {
    return typeof content === 'string' ? content : '';
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${mon} ${year}`;
}

interface ClientNotesTabProps {
  clientId: string;
}

export default function ClientNotesTab({ clientId }: ClientNotesTabProps) {
  const notes = useQuery(api.notes.getByClient, { clientId: clientId as Id<'clients'> });
  const createNote = useMutation(api.notes.create);

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createNote({
        clientId: clientId as Id<'clients'>,
        title: title.trim(),
        content: JSON.stringify([{ type: 'paragraph', children: [{ text: body }] }]),
      });
      setTitle('');
      setBody('');
      setComposerOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (notes === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading notes...
      </div>
    );
  }

  const sorted = [...notes].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      {/* Add Note button */}
      {!composerOpen && (
        <button
          onClick={() => setComposerOpen(true)}
          className="mx-[var(--m-page-px)] my-2.5 py-2 w-[calc(100%-2*var(--m-page-px))] text-center text-[13px] font-medium text-white bg-black rounded-lg"
        >
          Add Note
        </button>
      )}

      {/* Composer */}
      {composerOpen && (
        <div className="mx-[var(--m-page-px)] my-2.5 p-3 rounded-lg border border-[var(--m-border)] bg-[var(--m-bg)]">
          <input
            type="text"
            placeholder="Note title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ fontSize: '16px' }}
            className="w-full bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] mb-2 outline-none"
          />
          <textarea
            placeholder="Write a note..."
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ fontSize: '16px' }}
            className="w-full bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] mb-2 outline-none resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setComposerOpen(false);
                setTitle('');
                setBody('');
              }}
              className="px-3 py-1.5 text-[13px] rounded-lg border border-[var(--m-border-subtle)]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="px-3 py-1.5 text-[13px] font-medium text-white bg-black rounded-lg disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {sorted.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          No notes yet
        </div>
      ) : (
        sorted.map((note) => {
          const preview = extractPlainText(note.content);
          const truncated = preview.length > 80 ? preview.slice(0, 80) + '...' : preview;
          return (
            <div
              key={note._id}
              className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]"
            >
              <div className="text-[13px] font-medium">{note.title}</div>
              {truncated && (
                <div className="text-[12px] text-[var(--m-text-secondary)] mt-0.5 line-clamp-2">
                  {truncated}
                </div>
              )}
              <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">
                {formatDate(note.createdAt)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
