'use client';

import { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Building, Upload, Plus, Search } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import {
  EntityListScaffold,
  StatusPill,
  clientStatusTone,
  SkeletonTable,
} from '@/components/layouts';
import CreateClientDrawer from '@/components/CreateClientDrawer';
import CSVClientImport from '@/components/CSVClientImport';

type ClientRow = {
  _id: Id<'clients'>;
  name: string;
  type?: string;
  status?: string;
  updatedAt?: number;
  _creationTime: number;
};

function ClientsPortalContent() {
  const router = useRouter();
  const colors = useColors();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [isCSVImportOpen, setIsCSVImportOpen] = useState(false);

  const clients = useQuery(api.clients.list, {}) as ClientRow[] | undefined;

  const filtered = useMemo(() => {
    if (!clients) return undefined;
    const q = searchQuery.trim().toLowerCase();
    return clients.filter((c) => {
      const matchesQuery = !q || c.name?.toLowerCase().includes(q) || c.type?.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || (c.status ?? '').toLowerCase() === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [clients, searchQuery, statusFilter]);

  const openClient = useCallback((id: Id<'clients'>) => router.push(`/clients/${id}`), [router]);

  const lastActivity = (c: ClientRow) =>
    new Date(c.updatedAt ?? c._creationTime).toLocaleDateString();

  const search = (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <Search style={{ position: 'absolute', left: 8, width: 14, height: 14, color: colors.text.muted }} />
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search clients"
        style={{
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          color: colors.text.primary,
          borderRadius: 4,
          padding: '6px 8px 6px 28px',
          fontSize: 12,
          width: 220,
        }}
      />
    </div>
  );

  const actions = (
    <>
      <button
        onClick={() => setIsCSVImportOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.bg.card, border: `1px solid ${colors.border.default}`, color: colors.text.primary, borderRadius: 4, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
      >
        <Upload style={{ width: 14, height: 14 }} /> Import CSV
      </button>
      <button
        onClick={() => setIsCreateDrawerOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.entityTypes.client, border: `1px solid ${colors.entityTypes.client}`, color: '#fff', borderRadius: 4, padding: '6px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
      >
        <Plus style={{ width: 14, height: 14 }} /> New Client
      </button>
    </>
  );

  const filters = (['all', 'active', 'prospect', 'archived'] as const).map((s) => (
    <button
      key={s}
      onClick={() => setStatusFilter(s)}
      style={{
        textTransform: 'capitalize',
        fontSize: 11,
        borderRadius: 4,
        padding: '4px 10px',
        cursor: 'pointer',
        background: statusFilter === s ? colors.text.primary : colors.bg.card,
        color: statusFilter === s ? colors.bg.card : colors.text.muted,
        border: `1px solid ${colors.border.default}`,
      }}
    >
      {s}
    </button>
  ));

  const columns = ['Name', 'Type', 'Status', 'Last activity'];

  return (
    <>
      <EntityListScaffold
        entityType="client"
        title="Clients"
        count={filtered?.length}
        search={search}
        actions={actions}
        filters={filters}
      >
        {filtered === undefined ? (
          <SkeletonTable rows={10} cols={4} />
        ) : filtered.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center', color: colors.text.dim, fontSize: 13 }}>
            No clients match your filters.
          </div>
        ) : (
          <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16, padding: '10px 16px', background: colors.bg.cardAlt, borderBottom: `1px solid ${colors.border.default}` }}>
              {columns.map((c) => (
                <div key={c} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
                  {c}
                </div>
              ))}
            </div>
            {filtered.map((c) => (
              <div
                key={c._id}
                onClick={() => openClient(c._id)}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16, padding: '12px 16px', borderBottom: `1px solid ${colors.border.light}`, cursor: 'pointer', alignItems: 'center', fontSize: 12, color: colors.text.primary }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Building style={{ width: 14, height: 14, color: colors.entityTypes.client, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                </div>
                <div style={{ color: colors.text.secondary, textTransform: 'capitalize' }}>{c.type ?? '—'}</div>
                <div>{c.status ? <StatusPill label={c.status} tone={clientStatusTone(c.status, colors)} /> : '—'}</div>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: colors.text.muted }}>{lastActivity(c)}</div>
              </div>
            ))}
          </div>
        )}
      </EntityListScaffold>

      <CreateClientDrawer isOpen={isCreateDrawerOpen} onClose={() => setIsCreateDrawerOpen(false)} onSuccess={() => setIsCreateDrawerOpen(false)} />
      <CSVClientImport isOpen={isCSVImportOpen} onClose={() => setIsCSVImportOpen(false)} />
    </>
  );
}

export default function ClientsPortalPage() {
  return (
    <Suspense fallback={null}>
      <ClientsPortalContent />
    </Suspense>
  );
}
