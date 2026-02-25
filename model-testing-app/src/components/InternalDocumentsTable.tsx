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
  FolderKanban, 
  FileText,
  Eye,
  ArrowUpDown,
  ChevronLeft,
  Move,
  Trash2,
  Plus,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  
  return (
    <div className="space-y-4">
      {/* Breadcrumbs and Navigation */}
      {navState.type !== 'all' && (
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
              <ChevronRight className="w-3 h-3" />
              <span className="text-gray-900 font-medium">{navState.folderName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 whitespace-nowrap">
              {(currentViewData as InternalDocument[]).length} document{(currentViewData as InternalDocument[]).length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}
      
      {/* Table */}
      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                {navState.type === 'all' && (
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      Folder
                    </div>
                  </TableHead>
                )}
                <TableHead 
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('code')}
                >
                  <div className="flex items-center gap-2">
                    Document Code
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('fileName')}
                >
                  <div className="flex items-center gap-2">
                    File Name
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
                  {navState.type === 'all' && <TableCell></TableCell>}
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
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableHeader>
            
            <TableBody>
              {/* Folder View - Flat Document List */}
              {navState.type === 'folder' ? (
                (currentViewData as InternalDocument[]).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 font-medium">No documents in this folder</p>
                      <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  (currentViewData as InternalDocument[]).map((doc) => (
                    <TableRow 
                      key={doc._id}
                      className="hover:bg-gray-50"
                    >
                      <TableCell></TableCell>
                      <TableCell>
                        <DocumentCodeEditor
                          documentCode={doc.documentCode}
                          fileName={doc.fileName}
                          onSave={(newCode) => handleUpdateDocumentCode(doc._id, newCode)}
                          isInternal={true}
                        />
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
                              setSelectedDocumentForMove(doc._id);
                              setShowMoveDialog(true);
                            }}
                            className="gap-1"
                            title="Move to folder"
                          >
                            <Move className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc._id)}
                            className="gap-1 text-red-600 hover:text-red-700"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )
              ) : currentViewData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600 font-medium">No documents found</p>
                    <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
                  </TableCell>
                </TableRow>
              ) : (
                (currentViewData as FolderGroup[]).map((folder) => (
                      <TableRow 
                        key={folder.folderId || 'unorganized'}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          const folderIdToNavigate = folder.folderId === null ? 'unorganized' : folder.folderId;
                          navigateToFolder(folderIdToNavigate, folder.folderName);
                        }}
                      >
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FolderKanban className="w-4 h-4 text-gray-600" />
                            <span className="font-medium">{folder.folderName}</span>
                          </div>
                        </TableCell>
                        <TableCell colSpan={4}>
                          <span className="text-sm text-gray-600">{folder.documents.length} document{folder.documents.length !== 1 ? 's' : ''}</span>
                        </TableCell>
                        <TableCell>
                          {folder.folderId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO: Implement folder deletion
                              }}
                              className="text-red-600 hover:text-red-700"
                              title="Delete folder"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      
      {/* Move Document Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Document to Folder</DialogTitle>
            <DialogDescription>
              Select a folder to move this document to, or leave unorganized.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folderSelect">Folder</Label>
              <Select
                onValueChange={async (value) => {
                  if (selectedDocumentForMove) {
                    if (value === 'none') {
                      await handleMoveDocument(selectedDocumentForMove, null);
                    } else if (value === 'new') {
                      // Create new folder - prompt for name
                      const folderName = prompt('Enter folder name:');
                      if (folderName && folderName.trim()) {
                        try {
                          const newFolderId = await createFolder({ name: folderName.trim() });
                          await handleMoveDocument(selectedDocumentForMove, newFolderId);
                        } catch (error: any) {
                          alert(error.message || 'Failed to create folder');
                        }
                      }
                    } else {
                      await handleMoveDocument(selectedDocumentForMove, value);
                    }
                  }
                }}
              >
                <SelectTrigger id="folderSelect">
                  <SelectValue placeholder="Select a folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unorganized</SelectItem>
                  <SelectItem value="new">+ Create New Folder</SelectItem>
                  {folders.map((folder: Folder) => (
                    <SelectItem key={folder._id} value={folder._id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder. Folders are created when you move documents to them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newFolderName">Folder Name</Label>
              <Input
                id="newFolderName"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g., Marketing Materials"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateFolder();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
    </div>
  );
}

