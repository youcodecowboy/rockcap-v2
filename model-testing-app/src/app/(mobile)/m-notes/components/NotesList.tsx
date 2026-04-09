'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Plus, Trash2, ChevronRight, Building2, FolderKanban } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────

function extractPlainText(content: unknown): string {
  if (!content) return '';
  try {
    const doc = typeof content === 'string' ? JSON.parse(content) : content;
    if (typeof doc !== 'object') return String(doc);
    const texts: string[] = [];
    function walk(node: any) {
      if (node.text) texts.push(node.text);
      if (node.content) node.content.forEach(walk);
    }
    walk(doc);
    return texts.join(' ').trim();
  } catch {
    return typeof content === 'string' ? content : '';
  }
}

function formatDate(ts: string | number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type ScopeFilter = 'all' | 'personal' | 'filed';

// ─── Props ──────────────────────────────────────────────────────────

interface NotesListProps {
  onOpenNote: (noteId: string) => void;
  onNewNote: () => void;
}

// ─── Component ──────────────────────────────────────────────────────

export default function NotesList({ onOpenNote, onNewNote }: NotesListProps) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');

  const notes = useQuery(api.notes.getAll, {});
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const removeNote = useMutation(api.notes.remove);

  // Build lookup maps for client/project names
  const clientMap = useMemo(() => {
    const m = new Map<string, string>();
    if (clients) for (const c of clients) m.set(c._id, c.name);
    return m;
  }, [clients]);

  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    if (projects) for (const p of projects) m.set(p._id, p.name);
    return m;
  }, [projects]);

  // Filter + search
  const filtered = useMemo(() => {
    if (!notes) return [];
    let list = [...notes];

    // Scope filter
    if (scope === 'personal') {
      list = list.filter(n => !n.clientId && !n.projectId);
    } else if (scope === 'filed') {
      list = list.filter(n => n.clientId || n.projectId);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(n =>
        n.title?.toLowerCase().includes(q) ||
        extractPlainText(n.content).toLowerCase().includes(q)
      );
    }

    // Sort by updatedAt descending
    return list.sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? a.createdAt).getTime();
      const bTime = new Date(b.updatedAt ?? b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [notes, scope, search]);

  const handleDelete = async (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    if (confirm('Delete this note?')) {
      await removeNote({ id: noteId as Id<'notes'> });
    }
  };

  const isLoading = notes === undefined;

  return (
    <div>
      {/* Scope tabs */}
      <div className="flex gap-1.5 overflow-x-auto px-[var(--m-page-px)] py-2 border-b border-[var(--m-border)] scrollbar-none">
        {(['all', 'personal', 'filed'] as ScopeFilter[]).map(s => {
          const active = s === scope;
          const label = s === 'all' ? 'All Notes' : s === 'personal' ? 'Personal' : 'Filed';
          return (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap border ${
                active
                  ? 'bg-black text-white border-black'
                  : 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] border-[var(--m-border)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)]">
        <input
          type="text"
          placeholder="Search notes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: '16px' }}
          className="w-full bg-[var(--m-bg-inset)] text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] rounded-lg px-3 py-2 outline-none border border-[var(--m-border-subtle)] focus:border-[var(--m-accent-indicator)]"
        />
      </div>

      {/* New Note button */}
      <button
        onClick={onNewNote}
        className="flex items-center justify-center gap-1.5 mx-[var(--m-page-px)] my-2.5 py-2.5 w-[calc(100%-2*var(--m-page-px))] text-center text-[13px] font-medium text-white bg-black rounded-lg"
      >
        <Plus className="w-3.5 h-3.5" />
        New Note
      </button>

      {/* Loading */}
      {isLoading && (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          Loading notes...
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          {search ? 'No notes match your search' : 'No notes yet'}
        </div>
      )}

      {/* Notes list */}
      {filtered.map(note => {
        const preview = extractPlainText(note.content);
        const truncated = preview.length > 80 ? preview.slice(0, 80) + '...' : preview;
        const clientName = note.clientId ? clientMap.get(note.clientId) : null;
        const projectName = note.projectId ? projectMap.get(note.projectId) : null;

        return (
          <div key={note._id} className="border-b border-[var(--m-border-subtle)]">
            <button
              onClick={() => onOpenNote(note._id)}
              className="flex items-start gap-2 w-full text-left px-[var(--m-page-px)] py-3 active:bg-[var(--m-bg-subtle)]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {note.emoji && <span className="text-[14px]">{note.emoji}</span>}
                  <span className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                    {note.title || 'Untitled'}
                  </span>
                  {note.isDraft && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">
                      Draft
                    </span>
                  )}
                </div>
                {truncated && (
                  <div className="text-[12px] text-[var(--m-text-secondary)] mt-0.5 line-clamp-1">
                    {truncated}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[var(--m-text-tertiary)]">
                    {formatDate(note.updatedAt ?? note.createdAt)}
                  </span>
                  {clientName && (
                    <span className="flex items-center gap-0.5 text-[10px] text-[var(--m-text-tertiary)]">
                      <Building2 className="w-2.5 h-2.5" />
                      {clientName}
                    </span>
                  )}
                  {projectName && (
                    <span className="flex items-center gap-0.5 text-[10px] text-[var(--m-text-tertiary)]">
                      <FolderKanban className="w-2.5 h-2.5" />
                      {projectName}
                    </span>
                  )}
                </div>
              </div>

              {/* Delete + Chevron */}
              <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                <button
                  onClick={(e) => handleDelete(e, note._id)}
                  className="p-1 text-[var(--m-text-placeholder)] active:text-[var(--m-error)]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight className="w-4 h-4 text-[var(--m-text-placeholder)]" />
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
