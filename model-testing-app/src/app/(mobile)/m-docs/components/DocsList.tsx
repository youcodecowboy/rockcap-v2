'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ChevronRight } from 'lucide-react';
import FileRow from './shared/FileRow';

type Scope = 'clients' | 'internal' | 'personal';
type SortKey = 'newest' | 'oldest' | 'az' | 'za' | 'largest';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  az: 'A–Z',
  za: 'Z–A',
  largest: 'Largest',
};

const SORT_CYCLE: SortKey[] = ['newest', 'oldest', 'az', 'za', 'largest'];

interface DocsListProps {
  onSelectClient: (clientId: string, clientName: string) => void;
  onOpenViewer: (documentId: string) => void;
}

export default function DocsList({ onSelectClient, onOpenViewer }: DocsListProps) {
  const [scope, setScope] = useState<Scope>('clients');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');

  const removeMutation = useMutation(api.documents.remove);
  const duplicateMutation = useMutation(api.documents.duplicateDocument);

  const handleDelete = useCallback((docId: string) => {
    if (confirm('Delete this document?')) {
      removeMutation({ id: docId as Id<'documents'> }).catch(() => {});
    }
  }, [removeMutation]);

  const handleDuplicate = useCallback((docId: string) => {
    duplicateMutation({ documentId: docId as Id<'documents'> }).catch(() => {});
  }, [duplicateMutation]);

  // Always call all hooks — use 'skip' when not needed
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const internalDocs = useQuery(
    api.documents.getByScope,
    scope === 'internal' ? { scope: 'internal' } : 'skip'
  );
  const personalDocs = useQuery(
    api.documents.getByScope,
    scope === 'personal' ? { scope: 'personal' } : 'skip'
  );

  // Build project count per client from projects.clientRoles
  const projectCountByClient = useMemo(() => {
    const map = new Map<string, number>();
    if (!projects) return map;
    for (const p of projects) {
      for (const cr of p.clientRoles ?? []) {
        map.set(cr.clientId, (map.get(cr.clientId) ?? 0) + 1);
      }
    }
    return map;
  }, [projects]);

  // Filtered + sorted clients
  const filteredClients = useMemo(() => {
    if (!clients) return null;
    const q = query.toLowerCase();
    const filtered = clients.filter(
      c => !c.isDeleted && (!q || c.name.toLowerCase().includes(q))
    );
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, query]);

  // Sorted flat file list helper
  function sortDocs(docs: any[]): any[] {
    return [...docs].sort((a, b) => {
      switch (sort) {
        case 'newest':
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        case 'oldest':
          return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
        case 'az': {
          const nameA = (a.displayName || a.fileName).toLowerCase();
          const nameB = (b.displayName || b.fileName).toLowerCase();
          return nameA.localeCompare(nameB);
        }
        case 'za': {
          const nameA = (a.displayName || a.fileName).toLowerCase();
          const nameB = (b.displayName || b.fileName).toLowerCase();
          return nameB.localeCompare(nameA);
        }
        case 'largest':
          return (b.fileSize ?? 0) - (a.fileSize ?? 0);
        default:
          return 0;
      }
    });
  }

  // Filtered + sorted internal docs
  const filteredInternal = useMemo(() => {
    if (!internalDocs) return null;
    const q = query.toLowerCase();
    const filtered = internalDocs.filter(d => {
      if (!q) return true;
      const name = (d.displayName || d.fileName || '').toLowerCase();
      return name.includes(q);
    });
    return sortDocs(filtered);
  }, [internalDocs, query, sort]);

  // Filtered + sorted personal docs
  const filteredPersonal = useMemo(() => {
    if (!personalDocs) return null;
    const q = query.toLowerCase();
    const filtered = personalDocs.filter(d => {
      if (!q) return true;
      const name = (d.displayName || d.fileName || '').toLowerCase();
      return name.includes(q);
    });
    return sortDocs(filtered);
  }, [personalDocs, query, sort]);

  function cycleSort() {
    const idx = SORT_CYCLE.indexOf(sort);
    setSort(SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]);
  }

  function handleScopeChange(s: Scope) {
    setScope(s);
    setQuery('');
    setSort('newest');
  }

  const scopeTabs: { key: Scope; label: string }[] = [
    { key: 'clients', label: 'Clients' },
    { key: 'internal', label: 'Internal' },
    { key: 'personal', label: 'Personal' },
  ];

  return (
    <div>
      {/* Scope toggle */}
      <div className="flex bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        {scopeTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleScopeChange(tab.key)}
            className={`flex-1 text-center py-2.5 text-[12px] transition-colors ${
              scope === tab.key
                ? 'text-[var(--m-text-primary)] font-medium border-b-2 border-[var(--m-accent-indicator)]'
                : 'text-[var(--m-text-tertiary)] border-b-2 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Clients scope */}
      {scope === 'clients' && (
        <div>
          {/* Search */}
          <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)]">
            <input
              type="text"
              placeholder="Search clients…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-[var(--m-bg-inset)] text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] rounded-lg px-3 py-2 outline-none border border-[var(--m-border-subtle)] focus:border-[var(--m-accent-indicator)]"
            />
          </div>

          {/* Client list */}
          {filteredClients === null ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[13px] text-[var(--m-text-tertiary)]">
              Loading…
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[13px] text-[var(--m-text-tertiary)]">
              {query ? 'No matching clients' : 'No clients yet'}
            </div>
          ) : (
            filteredClients.map(client => {
              const projCount = projectCountByClient.get(client._id) ?? 0;
              const meta = projCount === 1 ? '1 project' : `${projCount} projects`;
              return (
                <button
                  key={client._id}
                  onClick={() => onSelectClient(client._id, client.name)}
                  className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                      {client.name}
                    </div>
                    <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">{meta}</div>
                  </div>
                  <ChevronRight size={16} className="text-[var(--m-text-tertiary)] shrink-0" />
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Internal scope */}
      {scope === 'internal' && (
        <div>
          {/* Search */}
          <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)]">
            <input
              type="text"
              placeholder="Search internal documents…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-[var(--m-bg-inset)] text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] rounded-lg px-3 py-2 outline-none border border-[var(--m-border-subtle)] focus:border-[var(--m-accent-indicator)]"
            />
          </div>

          {/* Sort bar */}
          <div className="flex items-center justify-between px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)]">
            <span className="text-[11px] text-[var(--m-text-tertiary)]">
              {filteredInternal ? `${filteredInternal.length} document${filteredInternal.length !== 1 ? 's' : ''}` : ''}
            </span>
            <button
              onClick={cycleSort}
              className="text-[11px] text-[var(--m-accent-indicator)] font-medium"
            >
              Sort: {SORT_LABELS[sort]}
            </button>
          </div>

          {/* File list */}
          {filteredInternal === null ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[13px] text-[var(--m-text-tertiary)]">
              Loading…
            </div>
          ) : filteredInternal.length === 0 ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[13px] text-[var(--m-text-tertiary)]">
              {query ? 'No matching documents' : 'No internal documents'}
            </div>
          ) : (
            filteredInternal.map(doc => (
              <FileRow
                key={doc._id}
                fileName={doc.fileName}
                displayName={doc.displayName}
                documentCode={doc.documentCode}
                fileType={doc.fileType ?? ''}
                category={doc.category}
                fileSize={doc.fileSize ?? 0}
                uploadedAt={doc.uploadedAt}
                onTap={() => onOpenViewer(doc._id)}
                onDuplicate={() => handleDuplicate(doc._id)}
                onFlag={() => {/* TODO: wire to flags.create */}}
                onDelete={() => handleDelete(doc._id)}
              />
            ))
          )}
        </div>
      )}

      {/* Personal scope */}
      {scope === 'personal' && (
        <div>
          {/* Search */}
          <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)]">
            <input
              type="text"
              placeholder="Search personal documents…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-[var(--m-bg-inset)] text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] rounded-lg px-3 py-2 outline-none border border-[var(--m-border-subtle)] focus:border-[var(--m-accent-indicator)]"
            />
          </div>

          {/* Sort bar */}
          <div className="flex items-center justify-between px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)]">
            <span className="text-[11px] text-[var(--m-text-tertiary)]">
              {filteredPersonal ? `${filteredPersonal.length} document${filteredPersonal.length !== 1 ? 's' : ''}` : ''}
            </span>
            <button
              onClick={cycleSort}
              className="text-[11px] text-[var(--m-accent-indicator)] font-medium"
            >
              Sort: {SORT_LABELS[sort]}
            </button>
          </div>

          {/* File list */}
          {filteredPersonal === null ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[13px] text-[var(--m-text-tertiary)]">
              Loading…
            </div>
          ) : filteredPersonal.length === 0 ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[13px] text-[var(--m-text-tertiary)]">
              {query ? 'No matching documents' : 'No personal documents'}
            </div>
          ) : (
            filteredPersonal.map(doc => (
              <FileRow
                key={doc._id}
                fileName={doc.fileName}
                displayName={doc.displayName}
                documentCode={doc.documentCode}
                fileType={doc.fileType ?? ''}
                category={doc.category}
                fileSize={doc.fileSize ?? 0}
                uploadedAt={doc.uploadedAt}
                onTap={() => onOpenViewer(doc._id)}
                onDuplicate={() => handleDuplicate(doc._id)}
                onFlag={() => {/* TODO: wire to flags.create */}}
                onDelete={() => handleDelete(doc._id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
