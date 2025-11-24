'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useClients, useProjectsByClient, useProjects } from '@/lib/clientStorage';
import { useDocumentsByClient, useDocuments } from '@/lib/documentStorage';
import { Id } from '../../../convex/_generated/dataModel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CompactMetricCard from '@/components/CompactMetricCard';
import CreateClientDrawer from '@/components/CreateClientDrawer';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, FolderKanban, FileText, Filter, ArrowUpDown, Plus, Search, MoreVertical, Archive, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDeleteClient, useUpdateClient } from '@/lib/clientStorage';

// Component to get client data (projects and documents)
function ClientDataLoader({ clientId, children }: { clientId: Id<"clients">, children: (data: any) => React.ReactNode }) {
  const projects = useProjectsByClient(clientId) || [];
  const documents = useDocumentsByClient(clientId) || [];
  const client = useQuery(api.clients.get, { id: clientId });
  
  const data = useMemo(() => {
    // Find most recently uploaded document
    const sortedDocs = [...documents].sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    const lastUploadedFile = sortedDocs.length > 0 ? sortedDocs[0] : null;
    
    // Use last document upload date as activity date
    let lastActivityDate: Date | null = null;
    if (lastUploadedFile) {
      lastActivityDate = new Date(lastUploadedFile.uploadedAt);
    }
    
    return {
      projects,
      documents,
      projectCount: projects.length,
      documentCount: documents.length,
      lastUploadedFile,
      lastActivityDate,
    };
  }, [projects, documents, client]);
  
  return <>{children(data)}</>;
}

export default function ClientsPage() {
  const router = useRouter();
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'lastActivity' | 'projects'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveClientId, setArchiveClientId] = useState<Id<"clients"> | null>(null);
  const [deleteClientId, setDeleteClientId] = useState<Id<"clients"> | null>(null);
  const [openPopoverId, setOpenPopoverId] = useState<Id<"clients"> | null>(null);
  const ITEMS_PER_PAGE = 15;
  
  const clients = useClients() || [];
  const allProjects = useProjects() || [];
  const allDocuments = useDocuments() || [];
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  // Calculate metrics
  const metrics = useMemo(() => {
    const activeClients = clients.filter(c => c.status === 'active').length;
    return {
      totalClients: clients.length,
      totalProjects: allProjects.length,
      totalDocuments: allDocuments.length,
      activeClients,
    };
  }, [clients, allProjects, allDocuments]);

  const formatLastActivity = (date: Date | null) => {
    if (!date) return '—';
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filter and sort clients
  const filteredAndSortedClients = useMemo(() => {
    let filtered = [...clients];
    
    // Archive toggle: when ON, show ONLY archived clients; when OFF, exclude archived clients
    if (showArchived) {
      filtered = filtered.filter(c => c.status === 'archived');
    } else {
      filtered = filtered.filter(c => c.status !== 'archived');
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.name?.toLowerCase().includes(query) ||
        c.companyName?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.phone?.toLowerCase().includes(query) ||
        c.city?.toLowerCase().includes(query) ||
        c.state?.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter (only if Archive toggle is OFF, otherwise we're already showing only archived)
    if (statusFilter !== 'all' && !showArchived) {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    
    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(c => c.type === typeFilter);
    }
    
    // Sort clients
    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        const comparison = a.name.localeCompare(b.name);
        return sortOrder === 'asc' ? comparison : -comparison;
      }
      // For other sorts, we'd need to load the data first
      return 0;
    });
    
    return filtered;
  }, [clients, searchQuery, statusFilter, typeFilter, sortBy, sortOrder, showArchived]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredAndSortedClients.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedClients = filteredAndSortedClients.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, typeFilter, sortBy, sortOrder, showArchived]);

  const handleArchive = async (clientId: Id<"clients">) => {
    try {
      await updateClient({
        id: clientId,
        status: 'archived',
      });
      setArchiveClientId(null);
    } catch (error) {
      console.error('Error archiving client:', error);
      alert('Failed to archive client. Please try again.');
    }
  };

  const handleDelete = async (clientId: Id<"clients">) => {
    try {
      await deleteClient({ id: clientId });
      setDeleteClientId(null);
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Failed to delete client. Please try again.');
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case 'archived':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Archived</Badge>;
      case 'past':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Past</Badge>;
      case 'prospect':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Prospect</Badge>;
      default:
        return null;
    }
  };

  const getTypeBadge = (type?: string) => {
    if (!type) return null;
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes('lender')) {
      return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Lender</Badge>;
    } else if (normalizedType.includes('broker')) {
      return <Badge className="bg-teal-100 text-teal-800 border-teal-200">Broker</Badge>;
    } else if (normalizedType.includes('developer') || normalizedType.includes('real-estate')) {
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Developer</Badge>;
    } else if (normalizedType.includes('borrower')) {
      return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Borrower</Badge>;
    }
    return <Badge variant="outline">{type}</Badge>;
  };

  return (
    <div className="bg-gray-50 min-h-screen" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
              Client Database
            </h1>
            <p className="mt-2 text-gray-600" style={{ fontWeight: 400 }}>
              Manage and view all clients
            </p>
          </div>
          <Button
            onClick={() => setIsCreateDrawerOpen(true)}
            className="bg-black text-white hover:bg-gray-800 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Client
          </Button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <CompactMetricCard
            label="Total Clients"
            value={metrics.totalClients}
            icon={Building2}
            iconColor="blue"
            className="bg-black text-white"
          />
          <CompactMetricCard
            label="Active Clients"
            value={metrics.activeClients}
            icon={Building2}
            iconColor="green"
            className="bg-black text-white"
          />
          <CompactMetricCard
            label="Total Projects"
            value={metrics.totalProjects}
            icon={FolderKanban}
            iconColor="purple"
            className="bg-black text-white"
          />
          <CompactMetricCard
            label="Total Documents"
            value={metrics.totalDocuments}
            icon={FileText}
            iconColor="orange"
            className="bg-black text-white"
          />
        </div>

        {/* Table Section */}
        <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
          <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-white" />
              <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                Clients
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                {filteredAndSortedClients.length} {filteredAndSortedClients.length === 1 ? 'Client' : 'Clients'}
              </span>
            </div>
          </div>
          <CardContent className="pt-0 pb-6">
            {filteredAndSortedClients.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-900 font-medium mb-1">No clients found</p>
                <p className="text-sm text-gray-500 mb-4">
                  {searchQuery.trim() || statusFilter !== 'all' || typeFilter !== 'all' 
                    ? 'Try adjusting your search or filters'
                    : 'Create your first client or upload files to create clients automatically.'}
                </p>
                {!searchQuery.trim() && statusFilter === 'all' && typeFilter === 'all' && (
                  <Button onClick={() => setIsCreateDrawerOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Client
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Filter and Sort Controls */}
                <div className="px-2 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
                  {/* Search Bar - Left Side */}
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                      placeholder="Search clients..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="text-sm pl-10"
                    />
                  </div>
                  
                  {/* Filters and Sort - Right Side */}
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="prospect">Prospect</option>
                      <option value="archived">Archived</option>
                      <option value="past">Past</option>
                    </select>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="all">All Types</option>
                      <option value="lender">Lender</option>
                      <option value="broker">Broker</option>
                      <option value="developer">Developer</option>
                      <option value="borrower">Borrower</option>
                    </select>
                    <ArrowUpDown className="w-4 h-4 text-gray-500 ml-2" />
                    <select
                      value={`${sortBy}-${sortOrder}`}
                      onChange={(e) => {
                        const [newSortBy, newSortOrder] = e.target.value.split('-');
                        setSortBy(newSortBy as any);
                        setSortOrder(newSortOrder as any);
                      }}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                      <option value="lastActivity-desc">Last Activity (Newest)</option>
                      <option value="lastActivity-asc">Last Activity (Oldest)</option>
                      <option value="projects-desc">Projects (Most)</option>
                      <option value="projects-asc">Projects (Fewest)</option>
                    </select>
                    <Button
                      variant={showArchived ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowArchived(!showArchived)}
                      className="ml-2 h-8 px-3 text-xs"
                    >
                      <Archive className="w-3 h-3 mr-1" />
                      Archive
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-200">
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Client Name</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Projects</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Last Activity</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Tags</TableHead>
                      <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedClients.map((client) => {
                      const clientId = client._id as Id<"clients">;
                      return (
                        <ClientDataLoader key={clientId} clientId={clientId}>
                          {(data) => (
                            <TableRow 
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() => router.push(`/clients/${clientId}`)}
                            >
                              <TableCell>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {client.name}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Created {new Date(client.createdAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-gray-900">
                                  {data.projectCount > 0 ? (
                                    <span className="font-medium">{data.projectCount} {data.projectCount === 1 ? 'project' : 'projects'}</span>
                                  ) : (
                                    <span className="text-gray-400">No projects</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-gray-600">
                                  {formatLastActivity(data.lastActivityDate)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {getStatusBadge(client.status)}
                                  {getTypeBadge(client.type)}
                                </div>
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => router.push(`/clients/${clientId}`)}
                                    className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                                  >
                                    View
                                  </Button>
                                  <Popover open={openPopoverId === clientId} onOpenChange={(open) => setOpenPopoverId(open ? clientId : null)}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                      >
                                        <MoreVertical className="w-4 h-4" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-48 p-1" align="end">
                                      <div className="flex flex-col">
                                        <button
                                          onClick={() => {
                                            setArchiveClientId(clientId);
                                            setOpenPopoverId(null);
                                          }}
                                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 rounded-md text-left"
                                        >
                                          <Archive className="w-4 h-4" />
                                          Archive
                                        </button>
                                        <button
                                          onClick={() => {
                                            setDeleteClientId(clientId);
                                            setOpenPopoverId(null);
                                          }}
                                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 rounded-md text-left text-red-600"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                          Delete
                                        </button>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </ClientDataLoader>
                      );
                    })}
                  </TableBody>
                </Table>
                
                {/* Pagination */}
                {filteredAndSortedClients.length > ITEMS_PER_PAGE && (
                  <div className="px-2 py-4 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {startIndex + 1}-{Math.min(endIndex, filteredAndSortedClients.length)} of {filteredAndSortedClients.length} clients
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="h-8 px-3 text-xs"
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-gray-600 px-2">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="h-8 px-3 text-xs"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Create Client Drawer */}
        <CreateClientDrawer
          isOpen={isCreateDrawerOpen}
          onClose={() => setIsCreateDrawerOpen(false)}
          onSuccess={() => {
            setIsCreateDrawerOpen(false);
          }}
        />

        {/* Archive Confirmation Dialog */}
        <AlertDialog open={!!archiveClientId} onOpenChange={(open) => !open && setArchiveClientId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive Client?</AlertDialogTitle>
              <AlertDialogDescription>
                This will archive the client. You can restore them later by changing their status.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => archiveClientId && handleArchive(archiveClientId)}>
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteClientId} onOpenChange={(open) => !open && setDeleteClientId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Client?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the client and all associated data. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => deleteClientId && handleDelete(deleteClientId)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

