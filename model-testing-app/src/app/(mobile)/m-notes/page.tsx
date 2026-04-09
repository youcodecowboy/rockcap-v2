'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Plus, Trash2, ChevronDown, ChevronUp, Building2, FolderKanban } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────

function extractPlainText(content: unknown): string {
  if (!content) return '';
  try {
    const nodes = typeof content === 'string' ? JSON.parse(content) : content;
    if (!Array.isArray(nodes)) return String(content);
    return nodes
      .flatMap((node: any) => {
        const texts = (node.children ?? []).map((c: any) => c.text ?? '');
        return texts;
      })
      .join(' ')
      .trim();
  } catch {
    return typeof content === 'string' ? content : '';
  }
}

function formatDate(ts: string | number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type ScopeFilter = 'all' | 'personal' | 'filed';

// ─── Main Component ─────────────────────────────────────────────────

export default function MobileNotes() {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const notes = useQuery(api.notes.getAll, {});
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const createNote = useMutation(api.notes.create);
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

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createNote({
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

  const handleDelete = async (noteId: string) => {
    if (confirm('Delete this note?')) {
      await removeNote({ id: noteId as Id<'notes'> });
      if (expandedNoteId === noteId) setExpandedNoteId(null);
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
          placeholder="Search notes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: '16px' }}
          className="w-full bg-[var(--m-bg-inset)] text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] rounded-lg px-3 py-2 outline-none border border-[var(--m-border-subtle)] focus:border-[var(--m-accent-indicator)]"
        />
      </div>

      {/* Add Note button */}
      {!composerOpen && (
        <button
          onClick={() => setComposerOpen(true)}
          className="flex items-center justify-center gap-1.5 mx-[var(--m-page-px)] my-2.5 py-2.5 w-[calc(100%-2*var(--m-page-px))] text-center text-[13px] font-medium text-white bg-black rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" />
          New Note
        </button>
      )}

      {/* Composer */}
      {composerOpen && (
        <div className="mx-[var(--m-page-px)] my-2.5 p-3 rounded-lg border border-[var(--m-border)] bg-[var(--m-bg)]">
          <input
            type="text"
            placeholder="Note title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ fontSize: '16px' }}
            className="w-full bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] mb-2 outline-none text-[var(--m-text-primary)]"
          />
          <textarea
            placeholder="Write a note..."
            rows={4}
            value={body}
            onChange={e => setBody(e.target.value)}
            style={{ fontSize: '16px' }}
            className="w-full bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] mb-2 outline-none resize-none text-[var(--m-text-primary)]"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setComposerOpen(false); setTitle(''); setBody(''); }}
              className="px-3 py-1.5 text-[13px] rounded-lg border border-[var(--m-border-subtle)] text-[var(--m-text-secondary)]"
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
        const isExpanded = expandedNoteId === note._id;
        const preview = extractPlainText(note.content);
        const truncated = preview.length > 80 ? preview.slice(0, 80) + '…' : preview;
        const clientName = note.clientId ? clientMap.get(note.clientId) : null;
        const projectName = note.projectId ? projectMap.get(note.projectId) : null;

        return (
          <div key={note._id} className="border-b border-[var(--m-border-subtle)]">
            {/* Note header row — tap to expand/collapse */}
            <button
              onClick={() => setExpandedNoteId(isExpanded ? null : note._id)}
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
                {!isExpanded && truncated && (
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
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-[var(--m-text-placeholder)] flex-shrink-0 mt-0.5" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--m-text-placeholder)] flex-shrink-0 mt-0.5" />
              )}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-[var(--m-page-px)] pb-3">
                <div className="p-3 rounded-lg bg-[var(--m-bg-inset)] text-[12px] text-[var(--m-text-secondary)] whitespace-pre-wrap leading-relaxed">
                  {preview || 'No content'}
                </div>
                {/* Tags */}
                {note.tags && note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {note.tags.map((tag: string) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* Delete action */}
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handleDelete(note._id)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--m-error)] active:opacity-70"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
