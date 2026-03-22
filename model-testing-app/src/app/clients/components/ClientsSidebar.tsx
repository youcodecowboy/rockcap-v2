'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search,
  Building2,
  Briefcase,
  Plus,
  ChevronRight,
  FolderKanban,
  FileText,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import EditableClientTypeBadge from '@/components/EditableClientTypeBadge';

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

type StatusFilter = 'all' | 'active' | 'prospect' | 'archived';

export default function ClientsSidebar({
  selectedClientId,
  onClientSelect,
  searchQuery,
  onSearchChange,
  onAddClient,
}: ClientsSidebarProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const recordAccess = useMutation(api.clients.recordAccess);
  const updateClient = useMutation(api.clients.update);

  // Queries
  const clients = useQuery(api.clients.list, {});
  const documentCounts = useQuery(api.documents.getClientDocumentCounts);
  const projects = useQuery(api.projects.list, {});
  const deletedClientsCount = useQuery(api.clients.deletedCount);
  const deletedClients = useQuery(
    api.clients.listDeleted,
    showDeleted ? {} : "skip"
  );

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

  // Derive unique client types for dynamic filter buttons
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    clientsWithCounts.forEach((c) => {
      if (c.type) types.add(c.type.toLowerCase());
    });
    return Array.from(types).sort();
  }, [clientsWithCounts]);

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

    // Sort by most recently accessed, then alphabetically
    return filtered.sort((a, b) => {
      const aTime = (a as any).lastAccessedAt;
      const bTime = (b as any).lastAccessedAt;
      if (aTime && bTime) return bTime.localeCompare(aTime);
      if (aTime) return -1;
      if (bTime) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [clientsWithCounts, filterType, statusFilter, searchQuery]);

  const displayClients = showDeleted ? (deletedClients || []) as Client[] : filteredClients;

  const getTypeIcon = (type?: string) => {
    if (type?.toLowerCase() === 'lender') {
      return <Building2 className="w-4 h-4 text-blue-500" />;
    }
    return <Briefcase className="w-4 h-4 text-green-500" />;
  };

  return (
    <div className="w-[280px] min-w-[280px] border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Clients</h2>
        <p className="text-xs text-gray-500 mt-0.5">{displayClients.length} {showDeleted ? 'deleted' : ''} clients</p>
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

      {/* Type Filter Tabs — dynamic from all client types */}
      <div className="px-3 py-2 border-b border-gray-200">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded transition-colors",
              filterType === 'all'
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            All
          </button>
          {uniqueTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded transition-colors capitalize",
                filterType === type
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {type}
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
        clients={displayClients}
        selectedClientId={selectedClientId}
        onClientSelect={onClientSelect}
        recordAccess={recordAccess}
        searchQuery={searchQuery}
        getTypeIcon={getTypeIcon}
        onTypeChange={(clientId, newType) => updateClient({ id: clientId, type: newType })}
        customTypes={uniqueTypes}
        showDeleted={showDeleted}
      />

      {/* Sticky footer — always visible */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
        {/* Show deleted toggle */}
        {(deletedClientsCount ?? 0) > 0 && (
          <div className="px-3 py-3">
            <button
              onClick={() => setShowDeleted(!showDeleted)}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors w-full py-1.5 px-2 rounded-md hover:bg-gray-100"
            >
              {showDeleted ? (
                <>
                  <ArrowLeft className="w-4 h-4" />
                  Back to active clients
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Show deleted ({deletedClientsCount})
                </>
              )}
            </button>
          </div>
        )}

        {/* Add Client Button */}
        {!showDeleted && (
          <div className="px-3 pb-3 pt-1">
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
        )}
      </div>
    </div>
  );
}

// Virtualized Client List for performance with many clients
interface ClientListProps {
  clients: Client[];
  selectedClientId: Id<"clients"> | null;
  onClientSelect: (clientId: Id<"clients">) => void;
  recordAccess: (args: { clientId: Id<"clients"> }) => Promise<unknown>;
  searchQuery: string;
  getTypeIcon: (type?: string) => React.ReactNode;
  onTypeChange: (clientId: Id<"clients">, newType: string) => void;
  customTypes: string[];
  showDeleted?: boolean;
}

function ClientList({
  clients,
  selectedClientId,
  onClientSelect,
  recordAccess,
  searchQuery,
  getTypeIcon,
  onTypeChange,
  customTypes,
  showDeleted,
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
      className="flex-1 overflow-auto min-h-0"
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
                onClick={() => {
                  recordAccess({ clientId: client._id });
                  onClientSelect(client._id);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left",
                  isSelected
                    ? "bg-blue-600 text-white shadow-md"
                    : "hover:bg-white hover:shadow-sm text-gray-700 border border-transparent hover:border-gray-200",
                  showDeleted && "opacity-60"
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
                    {!isSelected && client.type && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <EditableClientTypeBadge
                          type={client.type}
                          onTypeChange={(newType) => onTypeChange(client._id, newType)}
                          customTypes={customTypes}
                          compact
                        />
                      </span>
                    )}
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
