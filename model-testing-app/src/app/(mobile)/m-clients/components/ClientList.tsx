'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ChevronRight } from 'lucide-react';

interface ClientListProps {
  onSelectClient: (clientId: string, clientName: string) => void;
}

export default function ClientList({ onSelectClient }: ClientListProps) {
  const [search, setSearch] = useState('');

  const clients = useQuery(api.clients.list, {});
  const clientDocCounts = useQuery(api.documents.getClientDocumentCounts, {});
  const projects = useQuery(api.projects.list, {});

  // Build project count per client from clientRoles
  const projectCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!projects) return map;
    for (const p of projects) {
      if ((p as any).isDeleted) continue;
      const roles = (p as any).clientRoles as Array<{ clientId: string; role: string }> | undefined;
      if (!roles) continue;
      for (const cr of roles) {
        map.set(cr.clientId, (map.get(cr.clientId) ?? 0) + 1);
      }
    }
    return map;
  }, [projects]);

  const isLoading = clients === undefined;
  const q = search.toLowerCase();

  const filtered = useMemo(() => {
    if (!clients) return [];
    const sorted = [...clients].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '')
    );
    if (!q) return sorted;
    return sorted.filter(c => (c.name ?? '').toLowerCase().includes(q));
  }, [clients, q]);

  return (
    <div>
      {/* Search */}
      <div className="px-[var(--m-page-px)] py-2">
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[var(--m-bg-inset)] text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] rounded-lg px-3 py-2 outline-none border border-[var(--m-border-subtle)] focus:border-[var(--m-accent-indicator)]"
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          Loading clients...
        </div>
      )}

      {/* Empty states */}
      {!isLoading && clients && clients.length === 0 && (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          No clients yet
        </div>
      )}

      {!isLoading && clients && clients.length > 0 && filtered.length === 0 && (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          No clients match your search
        </div>
      )}

      {/* Client rows */}
      {filtered.map(client => {
        const projCount = projectCountMap.get(client._id) ?? 0;
        const docCount = clientDocCounts ? (clientDocCounts as Record<string, number>)[client._id] ?? 0 : 0;
        return (
          <button
            key={client._id}
            onClick={() => onSelectClient(client._id, client.name ?? 'Unnamed')}
            className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                  {client.name ?? 'Unnamed'}
                </span>
                {(client as any).type && (
                  <span className="text-[10px] bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] rounded px-1.5 py-0.5 flex-shrink-0">
                    {(client as any).type}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--m-text-tertiary)]">
                {projCount} project{projCount !== 1 ? 's' : ''} &middot; {docCount} doc{docCount !== 1 ? 's' : ''}
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-placeholder)] flex-shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
