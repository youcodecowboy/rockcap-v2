'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery } from 'convex/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Inbox,
  Building2,
  Briefcase,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

type FilterType = 'all' | 'borrower' | 'lender';

export default function DocsSidebar({
  selectedClientId,
  onClientSelect,
  onInboxSelect,
  isInboxSelected,
  searchQuery,
  onSearchChange,
}: DocsSidebarProps) {
  const [filterType, setFilterType] = useState<FilterType>('all');

  // Queries
  const clients = useQuery(api.clients.list, {});
  const unfiledCount = useQuery(api.documents.getUnfiledCount);
  const documentCounts = useQuery(api.documents.getClientDocumentCounts);

  // Build client list with document counts
  const clientsWithCounts = useMemo(() => {
    if (!clients) return [];
    
    const counts = documentCounts || {};
    return clients.map(client => ({
      ...client,
      documentCount: counts[client._id] || 0,
    }));
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
      return <Building2 className="w-4 h-4 text-blue-500" />;
    }
    return <Briefcase className="w-4 h-4 text-green-500" />;
  };

  const getTypeBadge = (type?: string) => {
    const t = type?.toLowerCase();
    if (t === 'lender') {
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">Lender</Badge>;
    }
    if (t === 'borrower') {
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200">Borrower</Badge>;
    }
    return null;
  };

  return (
    <div className="w-[260px] border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-9 text-sm bg-white"
          />
        </div>
      </div>

      {/* Inbox */}
      <div className="px-2 py-2 border-b border-gray-200">
        <button
          onClick={onInboxSelect}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
            isInboxSelected
              ? "bg-blue-100 text-blue-900"
              : "hover:bg-gray-100 text-gray-700"
          )}
        >
          <Inbox className="w-4 h-4" />
          <span className="font-medium">Inbox</span>
          {(unfiledCount ?? 0) > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {unfiledCount}
            </Badge>
          )}
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="px-2 py-2 border-b border-gray-200">
        <div className="flex gap-1 bg-gray-200 rounded-md p-0.5">
          {(['all', 'borrower', 'lender'] as FilterType[]).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                "flex-1 px-2 py-1 text-xs font-medium rounded transition-colors capitalize",
                filterType === type
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
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
      <div className="p-3 border-t border-gray-200">
        <Button variant="outline" size="sm" className="w-full gap-2">
          <Plus className="w-4 h-4" />
          Add Client
        </Button>
      </div>
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
        <div className="text-center text-gray-500 text-sm">
          {searchQuery ? 'No clients match your search' : 'No clients yet'}
        </div>
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
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  selectedClientId === client._id
                    ? "bg-blue-100 text-blue-900"
                    : "hover:bg-gray-100 text-gray-700"
                )}
              >
                {getTypeIcon(client.type)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{client.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {getTypeBadge(client.type)}
                    <span className="text-xs text-gray-500">
                      {client.documentCount} docs
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
