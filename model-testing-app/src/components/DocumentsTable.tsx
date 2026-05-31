/**
 * @deprecated This component is deprecated and will be removed in a future version.
 * The document library has been redesigned to use a 3-pane layout with:
 * - DocsSidebar (src/app/docs/components/DocsSidebar.tsx)
 * - FolderBrowser (src/app/docs/components/FolderBrowser.tsx)  
 * - FileList (src/app/docs/components/FileList.tsx)
 * - FileCard (src/app/docs/components/FileCard.tsx)
 * 
 * See the new document library at src/app/docs/page.tsx
 */
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button, IconButton, Input, DataTable, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  ChevronRight,
  Building2,
  FolderKanban,
  FileText,
  Eye,
  ArrowUpDown,
  ExternalLink,
  ChevronLeft,
  Settings,
  Move,
  Trash2,
  AlertCircle,
} from 'lucide-react';
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
  const colors = useColors();

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
  
  const crumbBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: colors.text.muted, font: 'inherit' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Breadcrumbs and Navigation */}
      {(navState.type !== 'all') && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 12, borderBottom: `1px solid ${colors.border.default}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconButton label="Back" onClick={navigateBack} disabled={navHistoryIndex === 0}>
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton label="Forward" onClick={navigateForward} disabled={navHistoryIndex >= navHistory.length - 1}>
              <ChevronRight size={16} />
            </IconButton>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.text.muted }}>
              <button onClick={navigateToAll} style={crumbBtn}>All Documents</button>
              {navState.type === 'client' && (
                <>
                  <ChevronRight size={12} />
                  <span style={{ color: colors.text.primary, fontWeight: 500 }}>{navState.clientName}</span>
                </>
              )}
              {navState.type === 'baseDocuments' && (
                <>
                  <ChevronRight size={12} />
                  <button onClick={() => navigateToClient(navState.clientId, navState.clientName)} style={crumbBtn}>
                    {navState.clientName}
                  </button>
                  <ChevronRight size={12} />
                  <span style={{ color: colors.text.primary, fontWeight: 500 }}>Base Documents</span>
                </>
              )}
              {navState.type === 'project' && (
                <>
                  <ChevronRight size={12} />
                  <button onClick={() => navigateToClient(navState.clientId, navState.clientName)} style={crumbBtn}>
                    {navState.clientName}
                  </button>
                  <ChevronRight size={12} />
                  <span style={{ color: colors.text.primary, fontWeight: 500 }}>{navState.projectName}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <Button variant="secondary" size="sm" onClick={() => setShowConfigureModal(true)}>
              <Settings size={14} />
              Configure File Names
              {(() => {
                const docsNeedingCodes = navState.type === 'project' || navState.type === 'baseDocuments'
                  ? projectDocuments.filter(doc => !doc.documentCode || doc.documentCode.trim() === '').length
                  : currentViewData.reduce((acc, client) =>
                      acc + client.projects.flatMap(p => p.documents).filter(doc => !doc.documentCode || doc.documentCode.trim() === '').length,
                      0
                    );
                return docsNeedingCodes > 0 ? (
                  <span style={{ marginLeft: 4, padding: '1px 6px', fontSize: 9, fontWeight: 600, background: colors.accent.orange, color: '#ffffff', borderRadius: 999 }}>
                    {docsNeedingCodes}
                  </span>
                ) : null;
              })()}
            </Button>
            <span style={{ fontSize: 12, color: colors.text.muted, whiteSpace: 'nowrap' }}>
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
      
      {/* Sort + Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
        <span style={{ marginRight: 4 }}>Sort:</span>
        {navState.type === 'all' && <DocSortHeader label="Client" col="client" sortColumn={sortColumn} onSort={handleSort} />}
        {navState.type !== 'all' && (
          <>
            <DocSortHeader label="Document Name" col="code" sortColumn={sortColumn} onSort={handleSort} />
            <DocSortHeader label="File Name" col="fileName" sortColumn={sortColumn} onSort={handleSort} />
            <DocSortHeader label="Category" col="category" sortColumn={sortColumn} onSort={handleSort} />
          </>
        )}
        <DocSortHeader label="Date" col="date" sortColumn={sortColumn} onSort={handleSort} />
      </div>

      {showFilters && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(navState.type !== 'project' && navState.type !== 'baseDocuments') && (
            <Input placeholder="Filter client..." value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })} style={{ width: 180 }} />
          )}
          {navState.type === 'all' && (
            <>
              <Input placeholder="Status..." value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ width: 140 }} />
              <Input placeholder="Type..." value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} style={{ width: 140 }} />
            </>
          )}
          {navState.type !== 'all' && (
            <>
              <Input placeholder="Filter code..." value={filters.code} onChange={(e) => setFilters({ ...filters, code: e.target.value })} style={{ width: 180 }} />
              <Input placeholder="Filter file name..." value={filters.fileName} onChange={(e) => setFilters({ ...filters, fileName: e.target.value })} style={{ width: 180 }} />
              <Input placeholder="Filter category..." value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} style={{ width: 180 }} />
            </>
          )}
        </div>
      )}

      {/* Project / Base Documents view — flat document list */}
      {(navState.type === 'project' || navState.type === 'baseDocuments') ? (
        <DataTable
          rows={projectDocuments}
          getRowKey={(doc) => doc._id}
          empty={<EmptyState icon={<FileText size={32} />} title="No documents found" body="Try adjusting your filters" />}
          columns={[
            {
              key: 'name',
              header: 'Document Name',
              render: (doc) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 500, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.documentCode || doc.fileName}>
                    {doc.documentCode || doc.fileName}
                  </span>
                  {doc.isQueued && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, padding: '2px 6px', borderRadius: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, textTransform: 'uppercase', background: `${colors.accent.yellow}20`, color: colors.accent.yellow, border: `1px solid ${colors.accent.yellow}40` }}>
                      <AlertCircle size={11} />
                      Needs Review
                    </span>
                  )}
                </div>
              ),
            },
            { key: 'fileName', header: 'Original File Name', render: (doc) => <span title={doc.fileName} style={{ color: colors.text.muted, fontSize: 11 }}>{doc.fileName}</span> },
            { key: 'category', header: 'Category', render: (doc) => <span style={{ color: colors.text.secondary }}>{doc.category}</span> },
            { key: 'date', header: 'Date', mono: true, render: (doc) => <span style={{ color: colors.text.secondary }}>{formatDate(doc.uploadedAt)}</span> },
            {
              key: 'actions',
              header: 'Actions',
              width: 130,
              align: 'right',
              render: (doc) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                  {doc.isQueued ? (
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/uploads/${doc.queueJobId}`)}>
                      <Eye size={12} />
                      Review
                    </Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/docs/${doc._id}`)}>
                        <Eye size={12} />
                        View
                      </Button>
                      <IconButton
                        label="Move document"
                        onClick={() => {
                          setSelectedDocumentForMove({
                            id: doc._id,
                            clientId: navState.clientId as Id<"clients">,
                            projectId: navState.type === 'project' ? navState.projectId as Id<"projects"> : 'base-documents',
                            isBaseDocument: navState.type === 'baseDocuments' || doc.isBaseDocument,
                          });
                          setMoveModalOpen(true);
                        }}
                      >
                        <Move size={12} />
                      </IconButton>
                      <IconButton label="Delete document" onClick={() => handleDeleteDocument(doc._id)}>
                        <Trash2 size={12} style={{ color: colors.accent.red }} />
                      </IconButton>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      ) : navState.type === 'client' ? (
        /* Client view — project rows */
        <DataTable
          rows={currentViewData[0]?.projects ?? []}
          getRowKey={(project) => `${currentViewData[0]?.clientId}-${project.projectId}`}
          onRowClick={(project) => {
            const client = currentViewData[0];
            if (!client) return;
            if (project.projectId === 'base-documents') {
              navigateToBaseDocuments(client.clientId, client.clientName);
            } else {
              navigateToProject(client.clientId, client.clientName, project.projectId, project.projectName);
            }
          }}
          empty={<EmptyState icon={<FileText size={32} />} title="No documents found" body="Try adjusting your filters" />}
          columns={[
            {
              key: 'name',
              header: 'Project',
              render: (project) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FolderKanban size={16} style={{ color: colors.text.muted }} />
                  <span>{project.projectName}</span>
                </div>
              ),
            },
            { key: 'count', header: 'Documents', width: 100, render: (project) => <span style={{ color: colors.text.muted }}>{project.documents.length}</span> },
            {
              key: 'actions',
              header: 'Actions',
              width: 80,
              align: 'right',
              render: (project) =>
                project.projectId !== 'no-project' ? (
                  <IconButton label="Open project" onClick={(e) => { e.stopPropagation(); router.push(`/projects/${project.projectId}`); }}>
                    <ExternalLink size={12} />
                  </IconButton>
                ) : null,
            },
          ]}
        />
      ) : (
        /* All view — client rows */
        <DataTable
          rows={currentViewData}
          getRowKey={(client) => client.clientId}
          onRowClick={(client) => navigateToClient(client.clientId, client.clientName)}
          empty={<EmptyState icon={<FileText size={32} />} title="No documents found" body="Try adjusting your filters" />}
          columns={[
            {
              key: 'name',
              header: 'Client',
              render: (client) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={16} style={{ color: colors.text.muted }} />
                  <span style={{ fontWeight: 500 }}>{client.clientName}</span>
                </div>
              ),
            },
            { key: 'count', header: 'Documents', width: 90, render: (client) => <span style={{ color: colors.text.muted }}>{client.totalDocuments}</span> },
            {
              key: 'status',
              header: 'Status',
              width: 120,
              render: (client) => {
                const clientData = clientMap.get(client.clientId);
                return (
                  <span onClick={(e) => e.stopPropagation()}>
                    <EditableStatusBadge
                      status={clientData?.status as 'prospect' | 'active' | 'archived' | 'past' | undefined}
                      onStatusChange={(newStatus) => handleStatusChange(client.clientId, newStatus)}
                    />
                  </span>
                );
              },
            },
            {
              key: 'type',
              header: 'Type',
              width: 120,
              render: (client) => {
                const clientData = clientMap.get(client.clientId);
                return (
                  <span onClick={(e) => e.stopPropagation()}>
                    <EditableClientTypeBadge
                      type={clientData?.type}
                      onTypeChange={(newType) => handleTypeChange(client.clientId, newType)}
                    />
                  </span>
                );
              },
            },
            {
              key: 'date',
              header: 'Date',
              mono: true,
              render: (client) => {
                const clientData = clientMap.get(client.clientId);
                return clientData?.createdAt ? (
                  <span style={{ color: colors.text.secondary }}>{formatDate(clientData.createdAt)}</span>
                ) : (
                  <span style={{ color: colors.text.dim }}>—</span>
                );
              },
            },
            {
              key: 'actions',
              header: 'Actions',
              width: 80,
              align: 'right',
              render: (client) => (
                <IconButton label="Open client" onClick={(e) => { e.stopPropagation(); router.push(`/clients/${client.clientId}`); }}>
                  <ExternalLink size={12} />
                </IconButton>
              ),
            },
          ]}
        />
      )}

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

function DocSortHeader({
  label,
  col,
  sortColumn,
  onSort,
}: {
  label: string;
  col: SortColumn;
  sortColumn: SortColumn;
  onSort: (col: SortColumn) => void;
}) {
  return (
    <button
      onClick={() => onSort(col)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
        border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit',
        letterSpacing: 'inherit', textTransform: 'inherit', padding: 0,
      }}
    >
      {label}
      <ArrowUpDown size={11} style={{ opacity: sortColumn === col ? 1 : 0.4 }} />
    </button>
  );
}

