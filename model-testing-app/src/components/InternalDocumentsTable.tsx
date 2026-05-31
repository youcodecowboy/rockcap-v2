/**
 * @deprecated This component is deprecated and will be removed in a future version.
 * The document library has been redesigned to use a 3-pane layout with:
 * - DocsSidebar (src/app/docs/components/DocsSidebar.tsx)
 * - FolderBrowser (src/app/docs/components/FolderBrowser.tsx)
 * - FileList (src/app/docs/components/FileList.tsx)
 * 
 * Internal documents concept has been removed - all documents are now
 * associated with a client and stored in the unified documents table.
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, IconButton, Input, Select, Field, DataTable, EmptyState, Modal, type Column } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  ChevronRight,
  FolderKanban,
  FileText,
  Eye,
  ArrowUpDown,
  ChevronLeft,
  Move,
  Trash2,
} from 'lucide-react';
import { Id } from '../../convex/_generated/dataModel';
import DocumentCodeEditor from '@/components/DocumentCodeEditor';
import {
  useUpdateInternalDocumentCode,
  useDeleteInternalDocument,
  useUpdateInternalDocumentFolder,
  useInternalDocumentFolders,
  useCreateInternalDocumentFolder,
} from '@/lib/documentStorage';

// Types
interface InternalDocument {
  _id: Id<"internalDocuments">;
  fileName: string;
  documentCode: string;
  summary: string;
  category: string;
  uploadedAt: string;
  folderId?: string;
  linkedClientId?: Id<"clients">;
  clientName?: string;
  linkedProjectIds?: Id<"projects">[];
  projectNames?: string[];
}

interface Folder {
  _id: Id<"internalFolders">;
  name: string;
  createdAt: string;
}

interface FolderGroup {
  folderId: string | null;
  folderName: string;
  folderRecordId?: Id<"internalFolders">;
  documents: InternalDocument[];
}

interface InternalDocumentsTableProps {
  documents: InternalDocument[];
  showFilters?: boolean;
  onFiltersChange?: (show: boolean) => void;
  onCreateFolderClick?: () => void;
}

type SortColumn = 'code' | 'fileName' | 'category' | 'date';
type SortDirection = 'asc' | 'desc';

type NavigationState = 
  | { type: 'all' }
  | { type: 'folder'; folderId: string; folderName: string };

export default function InternalDocumentsTable({ 
  documents, 
  showFilters: externalShowFilters, 
  onFiltersChange
}: InternalDocumentsTableProps) {
  const router = useRouter();
  const colors = useColors();
  const updateDocumentCode = useUpdateInternalDocumentCode();
  const deleteDocument = useDeleteInternalDocument();
  const updateFolder = useUpdateInternalDocumentFolder();
  const createFolder = useCreateInternalDocumentFolder();
  const folders = useInternalDocumentFolders() || [];
  
  // Navigation state
  const [navState, setNavState] = useState<NavigationState>({ type: 'all' });
  const [navHistory, setNavHistory] = useState<NavigationState[]>([{ type: 'all' }]);
  const [navHistoryIndex, setNavHistoryIndex] = useState(0);
  
  // State
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filters, setFilters] = useState({
    code: '',
    fileName: '',
    category: '',
  });
  const [internalShowFilters, setInternalShowFilters] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedDocumentForMove, setSelectedDocumentForMove] = useState<Id<"internalDocuments"> | null>(null);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Listen for create folder event from window
  useEffect(() => {
    const handleCreateFolder = () => {
      setShowCreateFolderDialog(true);
    };
    window.addEventListener('createFolder', handleCreateFolder);
    return () => window.removeEventListener('createFolder', handleCreateFolder);
  }, []);
  
  // Use external showFilters if provided, otherwise use internal state
  const showFilters = externalShowFilters !== undefined ? externalShowFilters : internalShowFilters;
  const setShowFilters = onFiltersChange || setInternalShowFilters;
  
  // Navigation functions
  const navigateToFolder = (folderId: string | 'unorganized', folderName: string) => {
    const newState: NavigationState = { type: 'folder', folderId, folderName };
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
  
  // Group documents by folder
  const groupedData = useMemo(() => {
    // Filter documents - don't apply navigation filter here, we want all documents for grouping
    const filtered = documents.filter(doc => {
      // Apply column filters only
      if (filters.code && !doc.documentCode.toLowerCase().includes(filters.code.toLowerCase())) {
        return false;
      }
      if (filters.fileName && !doc.fileName.toLowerCase().includes(filters.fileName.toLowerCase())) {
        return false;
      }
      if (filters.category && !doc.category.toLowerCase().includes(filters.category.toLowerCase())) {
        return false;
      }
      return true;
    });
    
    // Group by folder
    const folderMap = new Map<string | null, FolderGroup>();
    
    // Add all folders (including empty ones)
    folders.forEach((folder: Folder) => {
      if (!folderMap.has(folder._id)) {
        folderMap.set(folder._id, {
          folderId: folder._id,
          folderName: folder.name,
          folderRecordId: folder._id,
          documents: [],
        });
      }
    });
    
    // Add unorganized folder
    if (!folderMap.has(null)) {
      folderMap.set(null, {
        folderId: null,
        folderName: 'Unorganized',
        documents: [],
      });
    }
    
    // Add documents to their folders
    filtered.forEach(doc => {
      const folderId = doc.folderId || null;
      
      // Find the folder record if folderId exists
      if (folderId && !folderMap.has(folderId)) {
        // Try to find folder in folders list
        const folderRecord = folders.find((f: Folder) => f._id === folderId);
        if (folderRecord) {
          folderMap.set(folderId, {
            folderId,
            folderName: folderRecord.name,
            folderRecordId: folderRecord._id,
            documents: [],
          });
        } else {
          // Folder ID exists but folder record not found - use ID as name
          folderMap.set(folderId, {
            folderId,
            folderName: folderId,
            documents: [],
          });
        }
      }
      
      if (folderMap.has(folderId)) {
        folderMap.get(folderId)!.documents.push(doc);
      }
    });
    
    // Convert to array and sort
    const grouped = Array.from(folderMap.values());
    
    // Sort documents within each folder
    grouped.forEach(folder => {
      folder.documents.sort((a, b) => {
        let comparison = 0;
        switch (sortColumn) {
          case 'code':
            comparison = a.documentCode.localeCompare(b.documentCode);
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
    
    // Sort folders (Unorganized last)
    grouped.sort((a, b) => {
      if (a.folderId === null && b.folderId !== null) return 1;
      if (a.folderId !== null && b.folderId === null) return -1;
      if (a.folderId === null && b.folderId === null) return 0;
      return (a.folderName || '').localeCompare(b.folderName || '');
    });
    
    return grouped;
  }, [documents, folders, filters, sortColumn, sortDirection, navState]);
  
  // Get current view data based on navigation state
  const currentViewData: InternalDocument[] | FolderGroup[] = useMemo(() => {
    if (navState.type === 'all') {
      return groupedData;
    } else {
      // Folder view - filter documents directly
      let folderDocuments: InternalDocument[] = [];
      
      if (navState.folderId === 'unorganized') {
        // Get all documents without a folderId
        folderDocuments = documents.filter(doc => !doc.folderId);
      } else {
        // Get documents with matching folderId
        folderDocuments = documents.filter(doc => doc.folderId === navState.folderId);
      }
      
      // Apply column filters
      folderDocuments = folderDocuments.filter(doc => {
        if (filters.code && !doc.documentCode.toLowerCase().includes(filters.code.toLowerCase())) {
          return false;
        }
        if (filters.fileName && !doc.fileName.toLowerCase().includes(filters.fileName.toLowerCase())) {
          return false;
        }
        if (filters.category && !doc.category.toLowerCase().includes(filters.category.toLowerCase())) {
          return false;
        }
        return true;
      });
      
      // Sort documents
      folderDocuments.sort((a, b) => {
        let comparison = 0;
        switch (sortColumn) {
          case 'code':
            comparison = a.documentCode.localeCompare(b.documentCode);
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
      
      return folderDocuments;
    }
  }, [documents, navState, filters, sortColumn, sortDirection]);
  
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
  
  const handleMoveDocument = async (documentId: Id<"internalDocuments">, folderId: string | Id<"internalFolders"> | null) => {
    try {
      // Convert folderId to ID or null for unorganized
      const folderIdValue = folderId === null || folderId === 'none' ? null : (folderId as Id<"internalFolders">);
      await updateFolder({ id: documentId, folderId: folderIdValue });
      setShowMoveDialog(false);
      setSelectedDocumentForMove(null);
    } catch (error) {
      console.error('Failed to move document:', error);
    }
  };
  
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await createFolder({ name: newFolderName.trim() });
      setShowCreateFolderDialog(false);
      setNewFolderName('');
    } catch (error: any) {
      alert(error.message || 'Failed to create folder');
    }
  };
  
  const handleDeleteDocument = async (id: Id<"internalDocuments">) => {
    if (confirm('Are you sure you want to delete this internal document?')) {
      await deleteDocument({ id });
    }
  };
  
  const handleUpdateDocumentCode = async (id: Id<"internalDocuments">, newCode: string) => {
    await updateDocumentCode({ id, documentCode: newCode });
  };
  
  const HeaderSort = ({ label, col }: { label: string; col: SortColumn }) => (
    <button
      onClick={() => handleSort(col)}
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

  const docColumns: Column<InternalDocument>[] = [
    {
      key: 'code',
      header: 'Document Code',
      render: (doc) => (
        <DocumentCodeEditor
          documentCode={doc.documentCode}
          fileName={doc.fileName}
          onSave={(newCode) => handleUpdateDocumentCode(doc._id, newCode)}
          isInternal={true}
        />
      ),
    },
    {
      key: 'fileName',
      header: 'File Name',
      render: (doc) => <span title={doc.fileName} style={{ color: colors.text.muted, fontSize: 11 }}>{doc.fileName}</span>,
    },
    { key: 'category', header: 'Category', render: (doc) => <span style={{ color: colors.text.secondary }}>{doc.category}</span> },
    { key: 'date', header: 'Date', mono: true, render: (doc) => <span style={{ color: colors.text.secondary }}>{formatDate(doc.uploadedAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      width: 140,
      align: 'right',
      render: (doc) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/docs/${doc._id}`)}>
            <Eye size={12} />
            View
          </Button>
          <IconButton label="Move to folder" onClick={() => { setSelectedDocumentForMove(doc._id); setShowMoveDialog(true); }}>
            <Move size={12} />
          </IconButton>
          <IconButton label="Delete" onClick={() => handleDeleteDocument(doc._id)}>
            <Trash2 size={12} style={{ color: colors.accent.red }} />
          </IconButton>
        </div>
      ),
    },
  ];

  const folderColumns: Column<FolderGroup>[] = [
    {
      key: 'folder',
      header: 'Folder',
      render: (folder) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChevronRight size={16} style={{ color: colors.text.dim }} />
          <FolderKanban size={16} style={{ color: colors.text.muted }} />
          <span style={{ fontWeight: 500, color: colors.text.primary }}>{folder.folderName}</span>
        </div>
      ),
    },
    {
      key: 'count',
      header: 'Documents',
      render: (folder) => (
        <span style={{ color: colors.text.muted }}>
          {folder.documents.length} document{folder.documents.length !== 1 ? 's' : ''}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 80,
      align: 'right',
      render: (folder) =>
        folder.folderId ? (
          <IconButton
            label="Delete folder"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Implement folder deletion
            }}
          >
            <Trash2 size={12} style={{ color: colors.accent.red }} />
          </IconButton>
        ) : null,
    },
  ];

  const docCount = (currentViewData as InternalDocument[]).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Breadcrumbs and Navigation */}
      {navState.type !== 'all' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 12, borderBottom: `1px solid ${colors.border.default}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconButton label="Back" onClick={navigateBack} disabled={navHistoryIndex === 0}>
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton label="Forward" onClick={navigateForward} disabled={navHistoryIndex >= navHistory.length - 1}>
              <ChevronRight size={16} />
            </IconButton>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.text.muted }}>
              <button onClick={navigateToAll} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.text.muted, font: 'inherit' }}>
                All Documents
              </button>
              <ChevronRight size={12} />
              <span style={{ color: colors.text.primary, fontWeight: 500 }}>{navState.folderName}</span>
            </div>
          </div>
          <span style={{ fontSize: 12, color: colors.text.muted, whiteSpace: 'nowrap' }}>
            {docCount} document{docCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Sort + Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
        <span style={{ marginRight: 4 }}>Sort:</span>
        <HeaderSort label="Code" col="code" />
        <HeaderSort label="File Name" col="fileName" />
        <HeaderSort label="Category" col="category" />
        <HeaderSort label="Date" col="date" />
      </div>

      {showFilters && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Input placeholder="Filter code..." value={filters.code} onChange={(e) => setFilters({ ...filters, code: e.target.value })} />
          <Input placeholder="Filter file name..." value={filters.fileName} onChange={(e) => setFilters({ ...filters, fileName: e.target.value })} />
          <Input placeholder="Filter category..." value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} />
        </div>
      )}

      {navState.type === 'folder' ? (
        <DataTable
          rows={currentViewData as InternalDocument[]}
          getRowKey={(doc) => doc._id}
          columns={docColumns}
          empty={<EmptyState icon={<FileText size={32} />} title="No documents in this folder" body="Try adjusting your filters" />}
        />
      ) : (
        <DataTable
          rows={currentViewData as FolderGroup[]}
          getRowKey={(folder) => folder.folderId || 'unorganized'}
          onRowClick={(folder) => {
            const folderIdToNavigate = folder.folderId === null ? 'unorganized' : folder.folderId;
            navigateToFolder(folderIdToNavigate, folder.folderName);
          }}
          columns={folderColumns}
          empty={<EmptyState icon={<FileText size={32} />} title="No documents found" body="Try adjusting your filters" />}
        />
      )}

      {/* Move Document Dialog */}
      <Modal
        open={showMoveDialog}
        onClose={() => setShowMoveDialog(false)}
        title="Move Document to Folder"
        footer={
          <Button variant="secondary" onClick={() => setShowMoveDialog(false)}>
            Cancel
          </Button>
        }
      >
        <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
          Select a folder to move this document to, or leave unorganized.
        </p>
        <Field label="Folder">
          <Select
            defaultValue=""
            onChange={async (e) => {
              const value = e.target.value;
              if (selectedDocumentForMove) {
                if (value === 'none') {
                  await handleMoveDocument(selectedDocumentForMove, null);
                } else if (value === 'new') {
                  const folderName = prompt('Enter folder name:');
                  if (folderName && folderName.trim()) {
                    try {
                      const newFolderId = await createFolder({ name: folderName.trim() });
                      await handleMoveDocument(selectedDocumentForMove, newFolderId);
                    } catch (error: any) {
                      alert(error.message || 'Failed to create folder');
                    }
                  }
                } else if (value) {
                  await handleMoveDocument(selectedDocumentForMove, value);
                }
              }
            }}
          >
            <option value="" disabled>Select a folder</option>
            <option value="none">Unorganized</option>
            <option value="new">+ Create New Folder</option>
            {folders.map((folder: Folder) => (
              <option key={folder._id} value={folder._id}>
                {folder.name}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      {/* Create Folder Dialog */}
      <Modal
        open={showCreateFolderDialog}
        onClose={() => setShowCreateFolderDialog(false)}
        title="Create New Folder"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateFolderDialog(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create Folder
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
          Enter a name for the new folder. Folders are created when you move documents to them.
        </p>
        <Field label="Folder Name">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="e.g., Marketing Materials"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateFolder();
              }
            }}
          />
        </Field>
      </Modal>
    </div>
  );
}

