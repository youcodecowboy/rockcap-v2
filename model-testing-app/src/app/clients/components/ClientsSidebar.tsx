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
  Building2,
  Briefcase,
  Plus,
  ChevronRight,
  FolderKanban,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Client {
  _id: Id<"clients">;
  name: string;
  type?: string;
  status?: string;
  documentCount?: number;
  projectCount?: number;
}

interface ClientsSidebarProps {
  selectedClientId: Id<"clients"> | null;
  onClientSelect: (clientId: Id<"clients"> | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddClient: () => void;
}

type FilterType = 'all' | 'borrower' | 'lender';
type StatusFilter = 'all' | 'active' | 'prospect' | 'archived';

export default function ClientsSidebar({
  selectedClientId,
  onClientSelect,
  searchQuery,
  onSearchChange,
  onAddClient,
}: ClientsSidebarProps) {
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Queries
  const clients = useQuery(api.clients.list, {});
  const documentCounts = useQuery(api.documents.getClientDocumentCounts);
  const projects = useQuery(api.projects.list, {});

  // Build client list with document and project counts
  const clientsWithCounts = useMemo(() => {
    if (!clients) return [];
    
    const docCounts = documentCounts || {};
    
    // Count projects per client
    const projectCounts: Record<string, number> = {};
    projects?.forEach(project => {
      project.clientRoles?.forEach(role => {
        const clientId = (role.clientId as any)?._id || role.clientId;
        if (clientId) {
          projectCounts[clientId] = (projectCounts[clientId] || 0) + 1;
        }
      });
    });

    return clients.map(client => ({
      ...client,
      documentCount: docCounts[client._id] || 0,
      projectCount: projectCounts[client._id] || 0,
    }));
  }, [clients, documentCounts, projects]);

  // Filter clients
  const filteredClients = useMemo(() => {
    let filtered = clientsWithCounts;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(client => 
        client.type?.toLowerCase() === filterType
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(client => 
        client.status === statusFilter
      );
    } else {
      // By default, hide archived unless explicitly selected
      filtered = filtered.filter(client => client.status !== 'archived');
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
  }, [clientsWithCounts, filterType, statusFilter, searchQuery]);

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
    <div className="w-[280px] min-w-[280px] border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Clients</h2>
        <p className="text-xs text-gray-500 mt-0.5">{filteredClients.length} clients</p>
      </div>

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

      {/* Type Filter Tabs */}
      <div className="px-3 py-2 border-b border-gray-200">
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

      {/* Status Filter */}
      <div className="px-3 py-2 border-b border-gray-200">
        <div className="flex gap-1 flex-wrap">
          {(['all', 'active', 'prospect', 'archived'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors capitalize",
                statusFilter === status
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {status === 'all' ? 'All Status' : status}
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
        <Button 
          variant="default" 
          size="sm" 
          className="w-full gap-2 bg-black hover:bg-gray-800"
          onClick={onAddClient}
        >
          <Plus className="w-4 h-4" />
          New Client
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
    estimateSize: () => 72, // Approximate height of each client row
    overscan: 5,
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
          const isSelected = selectedClientId === client._id;
          
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
              className="px-2 py-1"
            >
              <button
                onClick={() => onClientSelect(client._id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left",
                  isSelected
                    ? "bg-blue-600 text-white shadow-md"
                    : "hover:bg-white hover:shadow-sm text-gray-700 border border-transparent hover:border-gray-200"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                  isSelected ? "bg-blue-500" : "bg-gray-100"
                )}>
                  {client.type?.toLowerCase() === 'lender' ? (
                    <Building2 className={cn("w-5 h-5", isSelected ? "text-white" : "text-blue-600")} />
                  ) : (
                    <Briefcase className={cn("w-5 h-5", isSelected ? "text-white" : "text-green-600")} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "font-medium truncate",
                    isSelected ? "text-white" : "text-gray-900"
                  )}>
                    {client.name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn(
                      "text-xs flex items-center gap-1",
                      isSelected ? "text-blue-100" : "text-gray-500"
                    )}>
                      <FolderKanban className="w-3 h-3" />
                      {client.projectCount}
                    </span>
                    <span className={cn(
                      "text-xs flex items-center gap-1",
                      isSelected ? "text-blue-100" : "text-gray-500"
                    )}>
                      <FileText className="w-3 h-3" />
                      {client.documentCount}
                    </span>
                    {!isSelected && getTypeBadge(client.type)}
                  </div>
                </div>
                <ChevronRight className={cn(
                  "w-4 h-4 flex-shrink-0",
                  isSelected ? "text-blue-200" : "text-gray-400"
                )} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
