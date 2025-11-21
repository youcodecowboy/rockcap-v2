'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useProjects, useClient, useClients } from '@/lib/clientStorage';
import { useDocumentsByProject, useDocuments } from '@/lib/documentStorage';
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
import { Card, CardContent } from '@/components/ui/card';
import { FolderKanban, Building2, FileText, Filter, ArrowUpDown, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

// Component to get project data (documents and clients)
function ProjectDataLoader({ projectId, children }: { projectId: Id<"projects">, children: (data: any) => React.ReactNode }) {
  const documents = useDocumentsByProject(projectId) || [];
  const project = useQuery(api.projects.get, { id: projectId });
  
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
    
    // Count unique clients
    const clientIds = new Set<string>();
    project?.clientRoles?.forEach((role: any) => {
      const clientId = (role.clientId as any)?._id || role.clientId;
      if (clientId) clientIds.add(clientId as string);
    });
    
    return {
      documentCount: documents.length,
      clientCount: clientIds.size,
      lastUploadedFile,
      lastActivityDate,
    };
  }, [documents, project]);
  
  return <>{children(data)}</>;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'lastActivity' | 'documents'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;
  
  const projects = useProjects() || [];
  const allDocuments = useDocuments() || [];
  const clients = useClients() || [];

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

  // Calculate metrics
  const metrics = useMemo(() => {
    const activeProjects = projects.filter((p: any) => p.status === 'active').length;
    const projectDocuments = allDocuments.filter((d: any) => d.projectId).length;
    
    // Count unique clients from projects
    const clientIds = new Set<string>();
    projects.forEach((p: any) => {
      p.clientRoles?.forEach((role: any) => {
        const clientId = (role.clientId as any)?._id || role.clientId;
        if (clientId) clientIds.add(clientId as string);
      });
    });
    
    return {
      totalProjects: projects.length,
      activeProjects,
      totalDocuments: projectDocuments,
      totalClients: clientIds.size,
    };
  }, [projects, allDocuments]);

  // Filter and sort projects
  const filteredAndSortedProjects = useMemo(() => {
    let filtered = [...projects];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((p: any) => 
        p.name?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.address?.toLowerCase().includes(query) ||
        p.city?.toLowerCase().includes(query) ||
        p.state?.toLowerCase().includes(query) ||
        p.loanNumber?.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((p: any) => p.status === statusFilter);
    }
    
    // Sort projects
    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        const comparison = a.name.localeCompare(b.name);
        return sortOrder === 'asc' ? comparison : -comparison;
      }
      // For other sorts, we'd need to load the data first
      return 0;
    });
    
    return filtered;
  }, [projects, searchQuery, statusFilter, sortBy, sortOrder]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredAndSortedProjects.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedProjects = filteredAndSortedProjects.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sortBy, sortOrder]);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Completed</Badge>;
      case 'on-hold':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">On Hold</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Cancelled</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Inactive</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
              Project Database
            </h1>
            <p className="mt-2 text-gray-600" style={{ fontWeight: 400 }}>
              View and manage all projects
            </p>
          </div>
          <Button
            onClick={() => router.push('/projects/new')}
            className="bg-black text-white hover:bg-gray-800 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <CompactMetricCard
            label="Total Projects"
            value={metrics.totalProjects}
            icon={FolderKanban}
            iconColor="purple"
            className="bg-black text-white"
          />
          <CompactMetricCard
            label="Active Projects"
            value={metrics.activeProjects}
            icon={FolderKanban}
            iconColor="green"
            className="bg-black text-white"
          />
          <CompactMetricCard
            label="Total Documents"
            value={metrics.totalDocuments}
            icon={FileText}
            iconColor="orange"
            className="bg-black text-white"
          />
          <CompactMetricCard
            label="Associated Clients"
            value={metrics.totalClients}
            icon={Building2}
            iconColor="blue"
            className="bg-black text-white"
          />
        </div>

        {/* Table Section */}
        <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
          <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-white" />
              <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                Projects
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                {filteredAndSortedProjects.length} {filteredAndSortedProjects.length === 1 ? 'Project' : 'Projects'}
              </span>
            </div>
          </div>
          <CardContent className="pt-0 pb-6">
            {filteredAndSortedProjects.length === 0 ? (
              <div className="p-12 text-center">
                <FolderKanban className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-900 font-medium mb-1">No projects found</p>
                <p className="text-sm text-gray-500 mb-4">
                  {searchQuery.trim() || statusFilter !== 'all' 
                    ? 'Try adjusting your search or filters'
                    : 'Create your first project or upload files to create projects automatically.'}
                </p>
                {!searchQuery.trim() && statusFilter === 'all' && (
                  <Button onClick={() => router.push('/projects/new')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Project
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
                      placeholder="Search projects..."
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
                      <option value="completed">Completed</option>
                      <option value="on-hold">On Hold</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="inactive">Inactive</option>
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
                      <option value="documents-desc">Documents (Most)</option>
                      <option value="documents-asc">Documents (Fewest)</option>
                    </select>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-200">
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Project Name</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Clients</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Documents</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Last Activity</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Tags</TableHead>
                      <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProjects.map((project: any) => {
                      const projectId = project._id as Id<"projects">;
                      
                      return (
                        <ProjectDataLoader key={projectId} projectId={projectId}>
                          {(data) => (
                            <TableRow 
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() => router.push(`/projects/${projectId}`)}
                            >
                              <TableCell>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {project.name}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Created {new Date(project.createdAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-gray-900">
                                  {data.clientCount > 0 ? (
                                    <span className="font-medium">{data.clientCount} {data.clientCount === 1 ? 'client' : 'clients'}</span>
                                  ) : (
                                    <span className="text-gray-400">No clients</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-gray-900">
                                  {data.documentCount > 0 ? (
                                    <span className="font-medium">{data.documentCount} {data.documentCount === 1 ? 'document' : 'documents'}</span>
                                  ) : (
                                    <span className="text-gray-400">No documents</span>
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
                                  {getStatusBadge(project.status)}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/projects/${projectId}`);
                                  }}
                                  className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                                >
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          )}
                        </ProjectDataLoader>
                      );
                    })}
                  </TableBody>
                </Table>
                
                {/* Pagination */}
                {filteredAndSortedProjects.length > ITEMS_PER_PAGE && (
                  <div className="px-2 py-4 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {startIndex + 1}-{Math.min(endIndex, filteredAndSortedProjects.length)} of {filteredAndSortedProjects.length} projects
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
      </div>
    </div>
  );
}
