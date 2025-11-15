'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useClients, useProjectsByClient, useProjects } from '@/lib/clientStorage';
import { useDocumentsByClient, useDocuments } from '@/lib/documentStorage';
import { Id } from '../../convex/_generated/dataModel';
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
import { Building2, FolderKanban, FileText, TrendingUp, Download, Filter, ArrowUpDown } from 'lucide-react';

// Component to get client data (projects and documents)
function ClientDataLoader({ clientId, children }: { clientId: Id<"clients">, children: (data: any) => React.ReactNode }) {
  const projects = useProjectsByClient(clientId) || [];
  const documents = useDocumentsByClient(clientId) || [];
  
  const data = useMemo(() => {
    // Find most recently uploaded document
    const sortedDocs = [...documents].sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    const lastUploadedFile = sortedDocs.length > 0 ? sortedDocs[0] : null;
    
    return {
      projects,
      documents,
      projectCount: projects.length,
      documentCount: documents.length,
      lastUploadedFile,
      lastUploadedDate: lastUploadedFile ? new Date(lastUploadedFile.uploadedAt) : null,
    };
  }, [projects, documents]);
  
  return <>{children(data)}</>;
}

export default function ClientsPage() {
  const router = useRouter();
  const clients = useClients() || [];
  const allProjects = useProjects() || [];
  const allDocuments = useDocuments() || [];

  // Calculate metrics
  const metrics = useMemo(() => {
    return {
      totalClients: clients.length,
      totalProjects: allProjects.length,
      totalDocuments: allDocuments.length,
      activeClients: clients.length, // Could be calculated based on recent activity
    };
  }, [clients, allProjects, allDocuments]);

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

  // Get last updated time (most recent client creation or update)
  const lastUpdated = useMemo(() => {
    if (clients.length === 0) return null;
    const dates = clients.map(c => new Date(c.createdAt).getTime());
    const mostRecent = new Date(Math.max(...dates));
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - mostRecent.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  }, [clients]);

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Client Database</h1>
              <p className="mt-2 text-gray-600">
                Manage and view all clients
              </p>
            </div>
            <div className="flex items-center gap-3">
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
            label="Total Clients"
            value={metrics.totalClients}
            icon={Building2}
            iconColor="blue"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
          <MetricCard
            label="Active Clients"
            value={metrics.activeClients}
            icon={Building2}
            iconColor="green"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
          <MetricCard
            label="Total Projects"
            value={metrics.totalProjects}
            icon={FolderKanban}
            iconColor="purple"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
          <MetricCard
            label="Total Documents"
            value={metrics.totalDocuments}
            icon={FileText}
            iconColor="orange"
            trend={{ value: 0, isPositive: true, period: 'vs last month' }}
          />
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {clients.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-900 font-medium mb-1">No clients found</p>
              <p className="text-sm text-gray-500 mb-4">
                Upload files to create clients automatically.
              </p>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    {clients.length} {clients.length === 1 ? 'Client' : 'Clients'}
                  </h2>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Client Name</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Projects</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Documents</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Last Uploaded File</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-700 uppercase">Last Uploaded</TableHead>
                    <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {clients.map((client) => {
                  const clientId = (client._id || client.id) as Id<"clients">;
                  return (
                    <ClientDataLoader key={clientId} clientId={clientId}>
                      {(data) => (
                        <TableRow 
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => router.push(`/clients/${clientId}`)}
                        >
                          <TableCell>
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-blue-600 font-semibold text-sm">
                                  {client.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {client.name}
                                </div>
                                <div className="text-sm text-gray-500">
                                  Created {new Date(client.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-900">
                              {data.projectCount > 0 ? (
                                <div className="space-y-1">
                                  <div className="font-medium">{data.projectCount} {data.projectCount === 1 ? 'project' : 'projects'}</div>
                                  <div className="flex flex-wrap gap-1">
                                    {data.projects.slice(0, 2).map((project: any) => {
                                      const projectId = (project._id || project.id) as Id<"projects">;
                                      return (
                                        <Button
                                          key={projectId}
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/projects/${projectId}`);
                                          }}
                                          className="text-xs px-2 py-1 h-auto bg-blue-50 text-blue-700 hover:bg-blue-100"
                                        >
                                          {project.name}
                                        </Button>
                                      );
                                    })}
                                    {data.projects.length > 2 && (
                                      <span className="text-xs text-gray-500">
                                        +{data.projects.length - 2} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">No projects</span>
                              )}
                            </div>
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
                                router.push(`/clients/${clientId}`);
                              }}
                              className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      )}
                    </ClientDataLoader>
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

