'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery } from 'convex/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button, Input, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  Search,
  Inbox,
  Building2,
  Briefcase,
  Plus,
  ChevronRight,
  ChevronLeft,
  Building,
  User,
} from 'lucide-react';
import InternalFolderList from './InternalFolderList';
import PersonalFolderList from './PersonalFolderList';
import { FolderSelection } from '@/types/folders';

export type DocumentScope = 'client' | 'internal' | 'personal';

interface Client {
  _id: Id<"clients">;
  name: string;
  type?: string;
  documentCount?: number;
}

interface DocsSidebarProps {
  selectedClientId: Id<"clients"> | null;
  onClientSelect: (clientId: Id<"clients"> | null) => void;
  onInboxSelect: () => void;
  isInboxSelected: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // New props for scope support
  activeScope: DocumentScope;
  onScopeChange: (scope: DocumentScope) => void;
  selectedInternalFolder: FolderSelection | null;
  onInternalFolderSelect: (folder: FolderSelection | null) => void;
  selectedPersonalFolder: FolderSelection | null;
  onPersonalFolderSelect: (folder: FolderSelection | null) => void;
}

type FilterType = 'all' | 'borrower' | 'lender';

export default function DocsSidebar({
  selectedClientId,
  onClientSelect,
  onInboxSelect,
  isInboxSelected,
  searchQuery,
  onSearchChange,
  activeScope,
  onScopeChange,
  selectedInternalFolder,
  onInternalFolderSelect,
  selectedPersonalFolder,
  onPersonalFolderSelect,
}: DocsSidebarProps) {
  const colors = useColors();
  const [filterType, setFilterType] = useState<FilterType>('all');

  // Queries
  const clients = useQuery(api.clients.list, {});
  const unfiledCount = useQuery(api.documents.getUnfiledCount);
  const documentCounts = useQuery(api.documents.getClientDocumentCounts);

  // Build client list with document counts. BUG FIX: api.clients.list returns
  // ALL client rows including prospects and archived; the docs library is for
  // live clients only. Zero-doc prospects/archived are noise here, but a client
  // whose row is still mis-statused as "prospect" must never lose its visible
  // library — so keep active + past, plus ANY client that has documents.
  const clientsWithCounts = useMemo(() => {
    if (!clients) return [];

    const counts = documentCounts || {};
    return clients
      .map(client => ({
        ...client,
        documentCount: counts[client._id] || 0,
      }))
      .filter(
        (client: any) =>
          client.status === 'active' ||
          client.status === 'past' ||
          client.documentCount > 0
      );
  }, [clients, documentCounts]);

  // Filter clients
  const filteredClients = useMemo(() => {
    let filtered = clientsWithCounts;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(client =>
        client.type?.toLowerCase() === filterType
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(client =>
        client.name.toLowerCase().includes(query)
      );
    }

    // Sort by name
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [clientsWithCounts, filterType, searchQuery]);

  const getTypeIcon = (type?: string) => {
    if (type?.toLowerCase() === 'lender') {
      return <Building2 className="w-4 h-4" style={{ color: colors.entityTypes.lender }} />;
    }
    return <Briefcase className="w-4 h-4" style={{ color: colors.entityTypes.client }} />;
  };

  const getTypeBadge = (type?: string) => {
    const t = type?.toLowerCase();
    if (t === 'lender') {
      return <StatusPill label="Lender" tone={colors.entityTypes.lender} />;
    }
    if (t === 'borrower') {
      return <StatusPill label="Borrower" tone={colors.entityTypes.client} />;
    }
    return null;
  };

  // Handle scope change - clear selections
  const handleScopeChange = (newScope: DocumentScope) => {
    onScopeChange(newScope);
    // Clear client selection when switching away from client scope
    if (newScope !== 'client') {
      onClientSelect(null);
    }
    // Clear folder selections
    onInternalFolderSelect(null);
    onPersonalFolderSelect(null);
  };

  // Segmented control button (scope toggle + filter tabs)
  const segButton = (active: boolean): React.CSSProperties => ({
    background: active ? colors.bg.card : 'transparent',
    color: active ? colors.text.primary : colors.text.muted,
    border: `1px solid ${active ? colors.border.default : 'transparent'}`,
    borderRadius: 3,
    cursor: 'pointer',
    transition: 'background 100ms linear, color 100ms linear',
  });

  // "Apple-like cascade": once a client is selected in the client scope, the
  // list pane collapses to a slim rail (name + expand affordance) so the
  // folder / file panes get the room. Expanding clears the selection, which
  // brings the full client list back.
  const isCollapsed = activeScope === 'client' && !!selectedClientId;
  const selectedClientName =
    clientsWithCounts.find((c) => c._id === selectedClientId)?.name;

  if (isCollapsed) {
    return (
      <div
        className="flex flex-col h-full flex-shrink-0 items-center"
        style={{
          width: 52,
          transition: 'width 180ms ease',
          borderRight: `1px solid ${colors.border.default}`,
          background: colors.bg.light,
        }}
      >
        <button
          onClick={() => onClientSelect(null)}
          title="Back to all clients"
          className="mt-3 flex items-center justify-center rounded-md"
          style={{
            width: 32,
            height: 32,
            color: colors.text.secondary,
            background: 'transparent',
            border: `1px solid ${colors.border.default}`,
            cursor: 'pointer',
            transition: 'background 100ms linear',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div
          className="flex-1 min-h-0 flex items-center justify-center mt-2"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          <span
            className="truncate text-xs font-medium"
            style={{ color: colors.text.primary, maxHeight: '100%' }}
            title={selectedClientName}
          >
            {selectedClientName}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full flex-shrink-0"
      style={{
        width: 300,
        transition: 'width 180ms ease',
        borderRight: `1px solid ${colors.border.default}`,
        background: colors.bg.light,
      }}
    >
      {/* Scope Toggle */}
      <div className="px-2 py-2" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
        <div className="flex p-0.5" style={{ background: colors.bg.cardAlt, borderRadius: 4 }}>
          <button
            onClick={() => handleScopeChange('client')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium min-w-0"
            style={segButton(activeScope === 'client')}
            title="Client Documents"
          >
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Clients</span>
          </button>
          <button
            onClick={() => handleScopeChange('internal')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium min-w-0"
            style={segButton(activeScope === 'internal')}
            title="RockCap Internal Documents"
          >
            <Building className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">RockCap</span>
          </button>
          <button
            onClick={() => handleScopeChange('personal')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium min-w-0"
            style={segButton(activeScope === 'personal')}
            title="Personal Documents"
          >
            <User className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Personal</span>
          </button>
        </div>
      </div>

      {/* Search - only show for client scope */}
      {activeScope === 'client' && (
        <div className="p-3" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: colors.text.dim, pointerEvents: 'none', zIndex: 1 }}
            />
            <Input
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>
      )}

      {/* Inbox - show for all scopes */}
      <div className="px-2 py-2" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
        <button
          onClick={onInboxSelect}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm"
          style={{
            background: isInboxSelected ? `${colors.accent.blue}15` : 'transparent',
            color: isInboxSelected ? colors.accent.blue : colors.text.secondary,
            border: `1px solid ${isInboxSelected ? `${colors.accent.blue}40` : 'transparent'}`,
            transition: 'background 100ms linear',
          }}
          onMouseEnter={(e) => { if (!isInboxSelected) e.currentTarget.style.background = colors.bg.cardAlt; }}
          onMouseLeave={(e) => { if (!isInboxSelected) e.currentTarget.style.background = 'transparent'; }}
        >
          <Inbox className="w-4 h-4" />
          <span className="font-medium">Inbox</span>
          {(unfiledCount ?? 0) > 0 && (
            <span className="ml-auto">
              <StatusPill label={String(unfiledCount)} tone={colors.accent.orange} />
            </span>
          )}
        </button>
      </div>

      {/* Content based on scope */}
      {activeScope === 'client' && (
        <>
          {/* Filter Tabs - only for client scope */}
          <div className="px-2 py-2" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
            <div className="flex gap-1 p-0.5" style={{ background: colors.bg.cardAlt, borderRadius: 4 }}>
              {(['all', 'borrower', 'lender'] as FilterType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className="flex-1 px-2 py-1 text-xs font-medium capitalize"
                  style={segButton(filterType === type)}
                >
                  {type === 'all' ? 'All' : type}
                </button>
              ))}
            </div>
          </div>

          {/* Client List - Virtualized for performance */}
          <ClientList
            clients={filteredClients}
            selectedClientId={selectedClientId}
            onClientSelect={onClientSelect}
            searchQuery={searchQuery}
            getTypeIcon={getTypeIcon}
            getTypeBadge={getTypeBadge}
          />

          {/* Add Client Button */}
          <div className="p-3" style={{ borderTop: `1px solid ${colors.border.default}` }}>
            <Button variant="secondary" size="sm" style={{ width: '100%', justifyContent: 'center' }}>
              <Plus className="w-4 h-4" />
              Add Client
            </Button>
          </div>
        </>
      )}

      {activeScope === 'internal' && (
        <InternalFolderList
          selectedFolder={selectedInternalFolder}
          onFolderSelect={onInternalFolderSelect}
        />
      )}

      {activeScope === 'personal' && (
        <PersonalFolderList
          selectedFolder={selectedPersonalFolder}
          onFolderSelect={onPersonalFolderSelect}
        />
      )}
    </div>
  );
}

// Virtualized Client List for performance with many clients
interface ClientListProps {
  clients: Client[];
  selectedClientId: Id<"clients"> | null;
  onClientSelect: (clientId: Id<"clients">) => void;
  searchQuery: string;
  getTypeIcon: (type?: string) => React.ReactNode;
  getTypeBadge: (type?: string) => React.ReactNode;
}

function ClientList({
  clients,
  selectedClientId,
  onClientSelect,
  searchQuery,
  getTypeIcon,
  getTypeBadge,
}: ClientListProps) {
  const colors = useColors();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: clients.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // Approximate height of each client row
    overscan: 5, // Render 5 extra items outside viewport
  });

  if (clients.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState
          icon={<Building2 className="w-10 h-10" />}
          title={searchQuery ? 'No clients match your search' : 'No clients yet'}
        />
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const client = clients[virtualRow.index];
          const selected = selectedClientId === client._id;
          return (
            <div
              key={client._id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="px-2"
            >
              <button
                onClick={() => onClientSelect(client._id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left"
                style={{
                  background: selected ? `${colors.accent.blue}15` : 'transparent',
                  color: selected ? colors.accent.blue : colors.text.secondary,
                  border: `1px solid ${selected ? `${colors.accent.blue}40` : 'transparent'}`,
                  transition: 'background 100ms linear',
                }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = colors.bg.cardAlt; }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
              >
                {getTypeIcon(client.type)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{client.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {getTypeBadge(client.type)}
                    <span className="text-xs" style={{ color: colors.text.muted }}>
                      {client.documentCount} docs
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.dim }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
