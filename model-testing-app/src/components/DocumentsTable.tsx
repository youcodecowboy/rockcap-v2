'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ChevronRight, 
  Building2, 
  FolderKanban, 
  FileText,
  Eye,
  ArrowUpDown,
  Search,
  ExternalLink,
  ChevronLeft,
  Settings,
  Move,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Id } from '../../convex/_generated/dataModel';
import React from 'react';
import { useClients, useUpdateClient } from '@/lib/clientStorage';
import EditableStatusBadge from '@/components/EditableStatusBadge';
import EditableClientTypeBadge from '@/components/EditableClientTypeBadge';
import ConfigureFileNamesModal from '@/components/ConfigureFileNamesModal';
import DirectUploadButton from '@/components/DirectUploadButton';
import MoveDocumentModal from '@/components/MoveDocumentModal';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useDeleteDocument } from '@/lib/documentStorage';
import { Badge } from '@/components/ui/badge';

// Types
interface Document {
  _id: Id<"documents">;
  fileName: string;
  documentCode?: string;
  summary: string;
  category: string;
  uploadedAt: string;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  clientName?: string;
  projectName?: string;
  isBaseDocument?: boolean;
  isQueued?: boolean; // Flag for queued documents
  queueJobId?: Id<"fileUploadQueue">; // Queue job ID for queued documents
}

interface ProjectGroup {
  projectId: Id<"projects"> | 'no-project';
  projectName: string;
  documents: Document[];
}

interface ClientGroup {
  clientId: Id<"clients">;
  clientName: string;
  projects: ProjectGroup[];
  totalDocuments: number;
}

interface DocumentsTableProps {
  documents: Document[];
  showFilters?: boolean;
  onFiltersChange?: (show: boolean) => void;
}

type SortColumn = 'client' | 'project' | 'code' | 'fileName' | 'category' | 'date';
type SortDirection = 'asc' | 'desc';

type NavigationState = 
  | { type: 'all' }
  | { type: 'client'; clientId: string; clientName: string }
  | { type: 'project'; clientId: string; clientName: string; projectId: string; projectName: string }
  | { type: 'baseDocuments'; clientId: string; clientName: string };

export default function DocumentsTable({ documents, showFilters: externalShowFilters, onFiltersChange }: DocumentsTableProps) {
  const router = useRouter();
  
  // Fetch clients data for status/type
  const allClients = useClients();
  const updateClient = useUpdateClient();
  const deleteDocument = useDeleteDocument();
  
  // Query queued documents (needs_confirmation status)
  const queuedJobs = useQuery(api.fileQueue.getJobs, { 
    status: 'needs_confirmation',
    limit: 100 
  }) || [];
  
  // Create client lookup map
  const clientMap = useMemo(() => {
    const map = new Map<string, { status?: string; type?: string; createdAt?: string }>();
    allClients?.forEach(client => {
      map.set(client._id, {
        status: client.status,
        type: client.type,
        createdAt: client.createdAt,
      });
    });
    return map;
  }, [allClients]);
  
  // Navigation state (like folder navigation)
  const [navState, setNavState] = useState<NavigationState>({ type: 'all' });
  const [navHistory, setNavHistory] = useState<NavigationState[]>([{ type: 'all' }]);
  const [navHistoryIndex, setNavHistoryIndex] = useState(0);
  
  // State
  const [sortColumn, setSortColumn] = useState<SortColumn>('client');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState({
    client: '',
    project: '',
    code: '',
    fileName: '',
    category: '',
    status: '',
    type: '',
  });
  const [internalShowFilters, setInternalShowFilters] = useState(false);
  
  // Use external showFilters if provided, otherwise use internal state
  const showFilters = externalShowFilters !== undefined ? externalShowFilters : internalShowFilters;
  const setShowFilters = onFiltersChange || setInternalShowFilters;
  const [showConfigureModal, setShowConfigureModal] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [selectedDocumentForMove, setSelectedDocumentForMove] = useState<{
    id: Id<"documents">;
    clientId: Id<"clients">;
    projectId?: Id<"projects"> | 'base-documents';
    isBaseDocument?: boolean;
  } | null>(null);
  
  // Handlers for status/type changes
  const handleStatusChange = async (clientId: string, newStatus: 'prospect' | 'active' | 'archived' | 'past') => {
    await updateClient({
      id: clientId as Id<"clients">,
      status: newStatus,
    });
  };
  
  const handleTypeChange = async (clientId: string, newType: 'lender' | 'developer' | 'broker') => {
    await updateClient({
      id: clientId as Id<"clients">,
      type: newType,
    });
  };
  
  // Navigation functions
  const navigateToClient = (clientId: string, clientName: string) => {
    const newState: NavigationState = { type: 'client', clientId, clientName };
    setNavState(newState);
    // Add to history and remove any forward history
    const newHistory = navHistory.slice(0, navHistoryIndex + 1);
    newHistory.push(newState);
    setNavHistory(newHistory);
    setNavHistoryIndex(newHistory.length - 1);
  };
  
  const navigateToProject = (clientId: string, clientName: string, projectId: string, projectName: string) => {
    const newState: NavigationState = { type: 'project', clientId, clientName, projectId, projectName };
    setNavState(newState);
    const newHistory = navHistory.slice(0, navHistoryIndex + 1);
    newHistory.push(newState);
    setNavHistory(newHistory);
    setNavHistoryIndex(newHistory.length - 1);
  };
  
  const navigateToBaseDocuments = (clientId: string, clientName: string) => {
    const newState: NavigationState = { type: 'baseDocuments', clientId, clientName };
    setNavState(newState);
    const newHistory = navHistory.slice(0, navHistoryIndex + 1);
    newHistory.push(newState);
    setNavHistory(newHistory);
    setNavHistoryIndex(newHistory.length - 1);
  };
  
  const navigateBack = () => {
    if (navHistoryIndex > 0) {
      const newIndex = navHistoryIndex - 1;
      setNavHistoryIndex(newIndex);
      setNavState(navHistory[newIndex]);
    }
  };
  
  const navigateForward = () => {
    if (navHistoryIndex < navHistory.length - 1) {
      const newIndex = navHistoryIndex + 1;
      setNavHistoryIndex(newIndex);
      setNavState(navHistory[newIndex]);
    }
  };
  
  const navigateToAll = () => {
    const newState: NavigationState = { type: 'all' };
    setNavState(newState);
    const newHistory = navHistory.slice(0, navHistoryIndex + 1);
    newHistory.push(newState);
    setNavHistory(newHistory);
    setNavHistoryIndex(newHistory.length - 1);
  };
  
  // Sort handler
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };
  
  // Convert queued jobs to document-like objects, filtered by navigation state
  const queuedDocuments = useMemo(() => {
    return queuedJobs
      .filter(job => {
        const analysisResult = job.analysisResult as any;
        const jobClientId = analysisResult?.clientId;
        const jobProjectId = analysisResult?.projectId;
        
        // Only include queued documents that match current navigation state
        if (navState.type === 'all') {
          // Show all queued documents with a client
          return !!jobClientId;
        } else if (navState.type === 'client') {
          // Show queued documents for this client (with or without project)
          return jobClientId === navState.clientId;
        } else if (navState.type === 'project') {
          // Show queued documents for this client and project
          if (navState.projectId === 'no-project') {
            // Show queued documents with this client and no project
            return jobClientId === navState.clientId && (!jobProjectId || jobProjectId === null || jobProjectId === undefined);
          } else {
            // Show queued documents with this client and project
            return jobClientId === navState.clientId && jobProjectId === navState.projectId;
          }
        } else if (navState.type === 'baseDocuments') {
          // Base documents don't have queued items typically, but include if they match client
          return jobClientId === navState.clientId && (!jobProjectId || jobProjectId === null || jobProjectId === undefined);
        }
        return false;
      })
      .map(job => {
        const analysisResult = job.analysisResult as any;
        return {
          _id: `queue-${job._id}` as Id<"documents">, // Temporary ID for queued items
          fileName: job.fileName,
          documentCode: undefined,
          summary: analysisResult?.summary || '',
          category: analysisResult?.category || 'Uncategorized',
          uploadedAt: job.createdAt,
          clientId: analysisResult?.clientId as Id<"clients"> | undefined,
          projectId: analysisResult?.projectId as Id<"projects"> | undefined,
          clientName: analysisResult?.clientName || analysisResult?.suggestedClientName || undefined,
          projectName: analysisResult?.projectName || analysisResult?.suggestedProjectName || undefined,
          isBaseDocument: false,
          isQueued: true,
          queueJobId: job._id,
        } as Document;
      });
  }, [queuedJobs, navState]);

  // Group and filter documents
  const groupedData = useMemo(() => {
    // Merge regular documents with queued documents
    const allDocs = [...documents, ...queuedDocuments];
    
    // Filter documents based on navigation state
    let filtered = allDocs.filter(doc => {
      // Apply navigation filter
      if (navState.type === 'client' && doc.clientId !== navState.clientId) {
        return false;
      }
      if (navState.type === 'project') {
        // Handle "no-project" case: check if projectId is undefined/null when navState.projectId is 'no-project'
        if (navState.projectId === 'no-project') {
          // Keep documents with matching client and no project (undefined or null)
          if (doc.clientId !== navState.clientId || (doc.projectId !== undefined && doc.projectId !== null)) {
            return false;
          }
        } else {
          // Regular project filter
          if (doc.clientId !== navState.clientId || doc.projectId !== navState.projectId) {
            return false;
          }
        }
      }
      
      // Apply column filters
      if (filters.client && !doc.clientName?.toLowerCase().includes(filters.client.toLowerCase())) {
        return false;
      }
      if (filters.project && !doc.projectName?.toLowerCase().includes(filters.project.toLowerCase())) {
        return false;
      }
      if (filters.code && !doc.documentCode?.toLowerCase().includes(filters.code.toLowerCase())) {
        return false;
      }
      if (filters.fileName && !doc.fileName.toLowerCase().includes(filters.fileName.toLowerCase())) {
        return false;
      }
      if (filters.category && !doc.category.toLowerCase().includes(filters.category.toLowerCase())) {
        return false;
      }
      // Filter by status/type if in all view
      if (navState.type === 'all' && filters.status) {
        const clientStatusData = clientMap.get(doc.clientId || '');
        if (!clientStatusData || clientStatusData.status !== filters.status) {
          return false;
        }
      }
      if (navState.type === 'all' && filters.type) {
        const clientTypeData = clientMap.get(doc.clientId || '');
        if (!clientTypeData || clientTypeData.type !== filters.type) {
          return false;
        }
      }
      return true;
    });
    
    // Group by client
    const clientGroupMap = new Map<string, ClientGroup>();
    
    filtered.forEach(doc => {
      const clientId = doc.clientId || 'unknown';
      const clientName = doc.clientName || 'Unknown Client';
      
      if (!clientGroupMap.has(clientId)) {
        clientGroupMap.set(clientId, {
          clientId: clientId as Id<"clients">,
          clientName,
          projects: [],
          totalDocuments: 0,
        });
      }
      
      const client = clientGroupMap.get(clientId)!;
      client.totalDocuments++;
      
      // Handle base documents separately
      if (doc.isBaseDocument) {
        // Find or create Base Documents project
        let baseProject = client.projects.find(p => p.projectId === 'base-documents');
        if (!baseProject) {
          baseProject = {
            projectId: 'base-documents' as Id<"projects"> | 'no-project',
            projectName: 'Base Documents',
            documents: [],
          };
          // Insert at the beginning
          client.projects.unshift(baseProject);
        }
        baseProject.documents.push(doc);
      } else {
        // Regular project documents
        const projectId = doc.projectId || 'no-project';
        const projectName = doc.projectName || 'No Project';
        
        let project = client.projects.find(p => p.projectId === projectId);
        if (!project) {
          project = {
            projectId: projectId as Id<"projects"> | 'no-project',
            projectName,
            documents: [],
          };
          client.projects.push(project);
        }
        
        project.documents.push(doc);
      }
    });
    
    // Ensure every client has a Base Documents folder (even if empty)
    clientGroupMap.forEach((client) => {
      const hasBaseDocuments = client.projects.some(p => p.projectId === 'base-documents');
      if (!hasBaseDocuments) {
        client.projects.unshift({
          projectId: 'base-documents' as Id<"projects"> | 'no-project',
          projectName: 'Base Documents',
          documents: [],
        });
      }
    });
    
    // Convert to array and sort
    const grouped = Array.from(clientGroupMap.values());
    
    // Sort based on selected column
    grouped.forEach(client => {
      client.projects.sort((a, b) => {
        if (sortColumn === 'project') {
          return sortDirection === 'asc' 
            ? a.projectName.localeCompare(b.projectName)
            : b.projectName.localeCompare(a.projectName);
        }
        return 0;
      });
      
      client.projects.forEach(project => {
        project.documents.sort((a, b) => {
          let comparison = 0;
          switch (sortColumn) {
            case 'code':
              comparison = (a.documentCode || '').localeCompare(b.documentCode || '');
              break;
            case 'fileName':
              comparison = a.fileName.localeCompare(b.fileName);
              break;
            case 'category':
              comparison = a.category.localeCompare(b.category);
              break;
            case 'date':
              comparison = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
              break;
          }
          return sortDirection === 'asc' ? comparison : -comparison;
        });
      });
    });
    
    grouped.sort((a, b) => {
      if (sortColumn === 'client') {
        return sortDirection === 'asc'
          ? a.clientName.localeCompare(b.clientName)
          : b.clientName.localeCompare(a.clientName);
      }
      return 0;
    });
    
    return grouped;
  }, [documents, queuedDocuments, filters, sortColumn, sortDirection, navState]);
  
  // Get current view data based on navigation state
  const currentViewData = useMemo(() => {
    if (navState.type === 'all') {
      return groupedData;
    } else if (navState.type === 'client') {
      const client = groupedData.find(c => c.clientId === navState.clientId);
      return client ? [client] : [];
    } else if (navState.type === 'baseDocuments') {
      // Base Documents view - show flat list of documents
      const client = groupedData.find(c => c.clientId === navState.clientId);
      if (!client) return [];
      const baseProject = client.projects.find(p => p.projectId === 'base-documents');
      return baseProject ? [{ ...client, projects: [baseProject] }] : [];
    } else {
      // Project view - show flat list of documents
      const client = groupedData.find(c => c.clientId === navState.clientId);
      if (!client) return [];
      const project = client.projects.find(p => p.projectId === navState.projectId);
      return project ? [{ ...client, projects: [project] }] : [];
    }
  }, [groupedData, navState]);
  
  // Get flat document list for project/base documents view
  const projectDocuments = useMemo(() => {
    if (navState.type === 'project' || navState.type === 'baseDocuments') {
      const client = groupedData.find(c => c.clientId === navState.clientId);
      if (!client) return [];
      const projectId = navState.type === 'baseDocuments' ? 'base-documents' : navState.projectId;
      const project = client.projects.find(p => p.projectId === projectId);
      return project ? project.documents : [];
    }
    return [];
  }, [groupedData, navState]);
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };
  
  const handleDeleteDocument = async (id: Id<"documents">) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocument({ id });
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Breadcrumbs and Navigation */}
      {(navState.type !== 'all') && (
        <div className="flex items-center justify-between gap-4 pb-3 border-b">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={navigateBack}
                disabled={navHistoryIndex === 0}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={navigateForward}
                disabled={navHistoryIndex >= navHistory.length - 1}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <button
                onClick={navigateToAll}
                className="hover:text-gray-900 transition-colors"
              >
                All Documents
              </button>
              {navState.type === 'client' && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-gray-900 font-medium">{navState.clientName}</span>
                </>
              )}
              {navState.type === 'baseDocuments' && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <button
                    onClick={() => navigateToClient(navState.clientId, navState.clientName)}
                    className="hover:text-gray-900 transition-colors"
                  >
                    {navState.clientName}
                  </button>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-gray-900 font-medium">Base Documents</span>
                </>
              )}
              {navState.type === 'project' && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <button
                    onClick={() => navigateToClient(navState.clientId, navState.clientName)}
                    className="hover:text-gray-900 transition-colors"
                  >
                    {navState.clientName}
                  </button>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-gray-900 font-medium">{navState.projectName}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DirectUploadButton
              clientId={navState.clientId as Id<"clients">}
              clientName={navState.clientName}
              projectId={navState.type === 'project' ? navState.projectId as Id<"projects"> : undefined}
              projectName={navState.type === 'project' ? navState.projectName : undefined}
              isBaseDocument={navState.type === 'client' || navState.type === 'baseDocuments'}
              onUploadComplete={() => {
                // Document will refresh via useQuery
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfigureModal(true)}
              className="gap-2 relative"
            >
              <Settings className="w-4 h-4" />
              Configure File Names
              {(() => {
                const docsNeedingCodes = navState.type === 'project' || navState.type === 'baseDocuments'
                  ? projectDocuments.filter(doc => !doc.documentCode || doc.documentCode.trim() === '').length
                  : currentViewData.reduce((acc, client) => 
                      acc + client.projects.flatMap(p => p.documents).filter(doc => !doc.documentCode || doc.documentCode.trim() === '').length, 
                      0
                    );
                return docsNeedingCodes > 0 ? (
                  <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-orange-500 text-white rounded-full">
                    {docsNeedingCodes}
                  </span>
                ) : null;
              })()}
            </Button>
            <span className="text-sm text-gray-500 whitespace-nowrap">
              {(() => {
                const count = navState.type === 'project' 
                  ? projectDocuments.length
                  : currentViewData.reduce((acc, client) => acc + client.totalDocuments, 0);
                return `${count} document${count !== 1 ? 's' : ''}`;
              })()}
            </span>
          </div>
        </div>
      )}
      

      {/* Configure File Names Modal */}
      {(navState.type === 'client' || navState.type === 'project' || navState.type === 'baseDocuments') && (
        <ConfigureFileNamesModal
          isOpen={showConfigureModal}
          onClose={() => setShowConfigureModal(false)}
          documents={
            navState.type === 'project' || navState.type === 'baseDocuments'
              ? projectDocuments
              : currentViewData[0]?.projects.flatMap(p => p.documents) || []
          }
          clientId={navState.clientId as Id<"clients">}
          clientName={navState.clientName}
          projectId={navState.type === 'project' ? navState.projectId as Id<"projects"> : undefined}
          projectName={navState.type === 'project' ? navState.projectName : undefined}
          onUpdate={() => {
            // Document will refresh via useQuery
            setShowConfigureModal(false);
          }}
        />
      )}
      
      {/* Table */}
      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                {navState.type !== 'project' && (
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort('client')}
                  >
                    <div className="flex items-center gap-2">
                      Client / Project / Document
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                )}
                {navState.type === 'all' && (
                  <>
                    <TableHead className="w-[80px]">Documents</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                  </>
                )}
                {navState.type === 'client' && (
                  <TableHead className="w-[80px]">Documents</TableHead>
                )}
                {navState.type !== 'all' && (
                  <>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('code')}
                    >
                      <div className="flex items-center gap-2">
                        Document Name
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('fileName')}
                    >
                      <div className="flex items-center gap-2">
                        Original File Name
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('category')}
                    >
                      <div className="flex items-center gap-2">
                        Category
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </TableHead>
                  </>
                )}
                <TableHead 
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-2">
                    Date
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
              
              {/* Filter Row */}
              {showFilters && (
                <TableRow className="bg-gray-50 border-t">
                  <TableCell></TableCell>
                  {(navState.type !== 'project' && navState.type !== 'baseDocuments') && (
                    <TableCell>
                      <Input
                        placeholder="Filter..."
                        value={filters.client}
                        onChange={(e) => setFilters({...filters, client: e.target.value})}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                  )}
                  {navState.type === 'all' && (
                    <>
                      <TableCell></TableCell>
                      <TableCell>
                        <Input
                          placeholder="Status..."
                          value={filters.status}
                          onChange={(e) => setFilters({...filters, status: e.target.value})}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Type..."
                          value={filters.type}
                          onChange={(e) => setFilters({...filters, type: e.target.value})}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                    </>
                  )}
                  {(navState.type === 'client' || navState.type === 'baseDocuments') && <TableCell></TableCell>}
                  {navState.type !== 'all' && (
                    <>
                      <TableCell>
                        <Input
                          placeholder="Filter..."
                          value={filters.code}
                          onChange={(e) => setFilters({...filters, code: e.target.value})}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Filter..."
                          value={filters.fileName}
                          onChange={(e) => setFilters({...filters, fileName: e.target.value})}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Filter..."
                          value={filters.category}
                          onChange={(e) => setFilters({...filters, category: e.target.value})}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                    </>
                  )}
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableHeader>
            
            <TableBody>
              {/* Project/Base Documents View - Flat Document List */}
              {(navState.type === 'project' || navState.type === 'baseDocuments') ? (
                projectDocuments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 font-medium">No documents found</p>
                      <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  projectDocuments.map((doc) => (
                    <TableRow 
                      key={doc._id}
                      className="hover:bg-gray-50"
                    >
                      <TableCell></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className="text-sm font-medium text-gray-900 font-mono truncate max-w-[300px]" 
                            title={doc.documentCode || doc.fileName}
                          >
                            {doc.documentCode || doc.fileName}
                          </span>
                          {doc.isQueued && (
                            <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 flex-shrink-0">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Needs Review
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-500 truncate max-w-[300px] block" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{doc.category}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{formatDate(doc.uploadedAt)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {doc.isQueued ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/uploads/${doc.queueJobId}`)}
                              className="gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              Review
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/docs/${doc._id}`)}
                                className="gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedDocumentForMove({
                                    id: doc._id,
                                    clientId: navState.clientId as Id<"clients">,
                                    projectId: navState.type === 'project' ? navState.projectId as Id<"projects"> : 'base-documents',
                                    isBaseDocument: navState.type === 'baseDocuments' || doc.isBaseDocument,
                                  });
                                  setMoveModalOpen(true);
                                }}
                                className="gap-1"
                                title="Move document"
                              >
                                <Move className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteDocument(doc._id);
                                }}
                                className="gap-1 text-red-600 hover:text-red-700"
                                title="Delete document"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )
              ) : currentViewData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={navState.type === 'all' ? 7 : navState.type === 'client' ? 8 : 7} className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600 font-medium">No documents found</p>
                    <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
                  </TableCell>
                </TableRow>
              ) : (
                currentViewData.map((client) => {
                  return (
                    <React.Fragment key={client.clientId}>
                      {/* Client Row */}
                      {navState.type === 'all' && (() => {
                        const clientData = clientMap.get(client.clientId);
                        return (
                          <TableRow 
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => navigateToClient(client.clientId, client.clientName)}
                          >
                            <TableCell>
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-gray-600" />
                                <span className="font-medium">{client.clientName}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-gray-600">{client.totalDocuments}</span>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <EditableStatusBadge
                                status={clientData?.status as 'prospect' | 'active' | 'archived' | 'past' | undefined}
                                onStatusChange={(newStatus) => handleStatusChange(client.clientId, newStatus)}
                              />
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <EditableClientTypeBadge
                                type={clientData?.type}
                                onTypeChange={(newType) => handleTypeChange(client.clientId, newType)}
                              />
                            </TableCell>
                            <TableCell>
                              {clientData?.createdAt ? (
                                <span className="text-sm text-gray-600">{formatDate(clientData.createdAt)}</span>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/clients/${client.clientId}`);
                                }}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })()}
                      
                      {/* Project Rows - Show when in client view */}
                      {navState.type === 'client' && client.projects.map((project) => {
                        const projectKey = `${client.clientId}-${project.projectId}`;
                        const isBaseDocuments = project.projectId === 'base-documents';
                        
                        return (
                          <TableRow 
                            key={projectKey}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => {
                              if (isBaseDocuments) {
                                navigateToBaseDocuments(client.clientId, client.clientName);
                              } else {
                                navigateToProject(client.clientId, client.clientName, project.projectId, project.projectName);
                              }
                            }}
                          >
                            <TableCell>
                              <div className="ml-4">
                                <ChevronRight className="w-3 h-3 text-gray-400" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 ml-4">
                                <FolderKanban className="w-4 h-4 text-gray-600" />
                                <span>{project.projectName}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-gray-600">{project.documents.length}</span>
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell>
                              {project.projectId !== 'no-project' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/projects/${project.projectId}`);
                                  }}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Configure File Names Modal */}
      {(navState.type === 'client' || navState.type === 'project') && (
        <ConfigureFileNamesModal
          isOpen={showConfigureModal}
          onClose={() => setShowConfigureModal(false)}
          documents={
            navState.type === 'project'
              ? projectDocuments
              : currentViewData[0]?.projects.flatMap(p => p.documents) || []
          }
          clientId={navState.clientId as Id<"clients">}
          clientName={navState.clientName}
          projectId={navState.type === 'project' ? navState.projectId as Id<"projects"> : undefined}
          projectName={navState.type === 'project' ? navState.projectName : undefined}
          onUpdate={() => {
            // Document will refresh via useQuery
            setShowConfigureModal(false);
          }}
        />
      )}

      {/* Move Document Modal */}
      {selectedDocumentForMove && (
        <MoveDocumentModal
          isOpen={moveModalOpen}
          onClose={() => {
            setMoveModalOpen(false);
            setSelectedDocumentForMove(null);
          }}
          documentId={selectedDocumentForMove.id}
          currentClientId={selectedDocumentForMove.clientId}
          currentProjectId={selectedDocumentForMove.projectId === 'base-documents' ? 'base-documents' : selectedDocumentForMove.projectId}
          currentIsBaseDocument={selectedDocumentForMove.isBaseDocument}
          onMoveComplete={() => {
            // Document will refresh via useQuery
          }}
        />
      )}
    </div>
  );
}

