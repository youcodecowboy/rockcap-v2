'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import MetricCard from '@/components/MetricCard';
import { FolderKanban, Building2, FileText, Download, Filter, ArrowUpDown } from 'lucide-react';

// Component to render client name in filter dropdown
function ClientOption({ clientId }: { clientId: string }) {
  const client = useClient(clientId as Id<"clients">);
  return client ? <option value={clientId}>{client.name}</option> : null;
}

// Component to render client cell
function ClientCell({ clientId }: { clientId: Id<"clients"> }) {
  const router = useRouter();
  const client = useClient(clientId);
  return client ? (
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/clients/${clientId}`);
      }}
      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
    >
      {client.name}
    </Button>
  ) : (
    <span className="text-sm text-gray-400">—</span>
  );
}

// Component to get project data (documents)
function ProjectDataLoader({ projectId, children }: { projectId: Id<"projects">, children: (data: any) => React.ReactNode }) {
  const documents = useDocumentsByProject(projectId) || [];
  
  const data = useMemo(() => {
    // Find most recently uploaded document
    const sortedDocs = [...documents].sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    const lastUploadedFile = sortedDocs.length > 0 ? sortedDocs[0] : null;
    
    return {
      documentCount: documents.length,
      lastUploadedFile,
      lastUploadedDate: lastUploadedFile ? new Date(lastUploadedFile.uploadedAt) : null,
    };
  }, [documents]);
  
  return <>{children(data)}</>;
}

export default function ProjectsPage() {
  const router = useRouter();
  const projects = useProjects() || [];
  const allDocuments = useDocuments() || [];
  const clients = useClients() || [];
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');

  const formatDate = (date: Date | null) => {
    if (!date) return '—';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatDateTime = (date: Date | null) => {
    if (!date) return '—';
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get unique client IDs from projects
  const uniqueClientIds = useMemo(() => {
    const clientIds = new Set<string>();
    projects.forEach((project: any) => {
      project.clientRoles?.forEach((role: any) => {
        const clientId = (role.clientId as any)?._id || role.clientId;
        if (clientId) clientIds.add(clientId as string);
      });
    });
    return Array.from(clientIds);
  }, [projects]);

  const filteredProjects = selectedClientFilter === 'all'
    ? projects
    : projects.filter((p: any) => 
        p.clientRoles?.some((role: any) => {
          const clientId = (role.clientId as any)?._id || role.clientId;
          return (clientId as string) === selectedClientFilter;
        })
      );

  // Calculate metrics
  const metrics = useMemo(() => {
    const activeProjects = projects.filter((p: any) => p.status === 'active').length;
    const projectDocuments = allDocuments.filter((d: any) => d.projectId).length;
    
    return {
      totalProjects: projects.length,
      activeProjects,
      totalDocuments: projectDocuments,
      totalClients: clients.length,
    };
  }, [projects, allDocuments, clients]);

  // Get last updated time
  const lastUpdated = useMemo(() => {
    if (projects.length === 0) return null;
    const dates = projects.map((p: any) => new Date(p.createdAt).getTime());
    const mostRecent = new Date(Math.max(...dates));
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - mostRecent.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  }, [projects]);

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Project Database</h1>
              <p className="mt-2 text-gray-600">
                View and manage all projects
              </p>
            </div>
            <div className="flex items-center gap-3">
              {uniqueClientIds.length > 1 && (
                <select
                  value={selectedClientFilter}
                  onChange={(e) => setSelectedClientFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="all">All Clients</option>
                  {uniqueClientIds.map(clientId => (
                    <ClientOption key={clientId} clientId={clientId} />
                  ))}
                </select>
              )}
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
              <Button variant="outline" size="sm">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Sort
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
          {lastUpdated && (
            <p className="text-sm text-gray-500">Last updated: {lastUpdated}</p>
          )}
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            label="Total Projects"
            value={metrics.totalProjects}
            icon={FolderKanban}
            iconColor="purple"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
          <MetricCard
            label="Active Projects"
            value={metrics.activeProjects}
            icon={FolderKanban}
            iconColor="green"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
          <MetricCard
            label="Total Documents"
            value={metrics.totalDocuments}
            icon={FileText}
            iconColor="orange"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
          <MetricCard
            label="Associated Clients"
            value={metrics.totalClients}
            icon={Building2}
            iconColor="blue"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {filteredProjects.length === 0 ? (
            <div className="p-12 text-center">
              <FolderKanban className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-900 font-medium mb-1">No projects found</p>
              <p className="text-sm text-gray-500">
                {selectedClientFilter !== 'all' ? 'Try selecting a different client filter.' : 'Projects will appear here once created.'}
              </p>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    {filteredProjects.length} {filteredProjects.length === 1 ? 'Project' : 'Projects'}
                  </h2>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Project Name</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Client</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Documents</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Last Uploaded File</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Last Uploaded</TableHead>
                    <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {filteredProjects.map((project: any) => {
                  const projectId = project._id as Id<"projects">;
                  // Get first client from clientRoles
                  const firstClientRole = project.clientRoles?.[0];
                  const firstClientId = firstClientRole ? ((firstClientRole.clientId as any)?._id || firstClientRole.clientId) as Id<"clients"> : null;
                  
                  return (
                    <ProjectDataLoader key={projectId} projectId={projectId}>
                      {(data) => (
                        <TableRow 
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => router.push(`/projects/${projectId}`)}
                        >
                          <TableCell>
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                                <span className="text-purple-600 font-semibold text-sm">
                                  {project.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {project.name}
                                </div>
                                <div className="text-sm text-gray-500">
                                  Created {new Date(project.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {firstClientId ? (
                              <ClientCell clientId={firstClientId} />
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-900">
                              <span className="font-medium">{data.documentCount}</span>
                              <span className="text-gray-500 ml-1">
                                {data.documentCount === 1 ? 'document' : 'documents'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {data.lastUploadedFile ? (
                              <div className="text-sm">
                                <div className="text-gray-900 font-medium truncate max-w-xs">
                                  {data.lastUploadedFile.fileName}
                                </div>
                                <div className="flex gap-2 mt-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {data.lastUploadedFile.fileTypeDetected}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {data.lastUploadedFile.category}
                                  </Badge>
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-500">
                              {formatDate(data.lastUploadedDate)}
                            </div>
                            {data.lastUploadedDate && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {formatDateTime(data.lastUploadedDate)}
                              </div>
                            )}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

