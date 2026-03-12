'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  LayoutGrid,
  List,
  Upload,
  FolderOpen,
  FileText,
  ArrowUpDown,
  FolderInput,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import FileCard from './FileCard';
import DirectUploadModal from './DirectUploadModal';
import InternalUploadModal from './InternalUploadModal';
import LinkAsVersionModal from './LinkAsVersionModal';
import BulkMoveModal from './BulkMoveModal';
import { cn } from '@/lib/utils';

interface FolderSelection {
  type: 'client' | 'project' | 'internal' | 'personal';
  folderId: string;
  folderName: string;
  projectId?: Id<"projects">;
}

type DocumentScope = 'client' | 'internal' | 'personal';

interface Document {
  _id: Id<"documents">;
  fileName: string;
  documentCode?: string;
  summary: string;
  category: string;
  fileTypeDetected?: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  fileStorageId?: Id<"_storage">;
  clientName?: string;
  projectName?: string;
  hasNotes?: boolean;
  noteCount?: number;
  version?: string;
  previousVersionId?: string;
  versionNote?: string;
}

interface VersionGroup {
  head: Document;
  versions: Document[];
}

interface FileListProps {
  clientId: Id<"clients"> | null;
  clientName?: string;
  clientType?: string;
  selectedFolder: FolderSelection | null;
  isInbox?: boolean;
  onFileSelect: (document: Document) => void;
  projectFilter?: Id<"projects">;
  scope?: DocumentScope;
}

type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';

export default function FileList({
  clientId,
  clientName,
  clientType,
  selectedFolder,
  isInbox = false,
  onFileSelect,
  scope = 'client',
}: FileListProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [linkVersionDoc, setLinkVersionDoc] = useState<Document | null>(null);
  const [showLinkVersionModal, setShowLinkVersionModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const bulkDeleteMutation = useMutation(api.documents.bulkDelete);

  // Convex client for on-demand queries
  const convex = useConvex();

  // Get project name if we have a project folder selected
  const project = useQuery(
    api.projects.get,
    selectedFolder?.projectId ? { id: selectedFolder.projectId } : "skip"
  );

  const unlinkVersion = useMutation(api.documents.unlinkVersion);

  // Drag handlers for the empty folder drop zone
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (selectedFolder && clientId) {
      setIsDragOver(true);
    }
  }, [selectedFolder, clientId]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (selectedFolder && clientId) {
      const files = Array.from(e.dataTransfer.files);
      setDroppedFiles(files);
      setShowUploadModal(true);
    }
  }, [selectedFolder, clientId]);

  // Queries based on context
  const unfiledDocuments = useQuery(
    api.documents.getUnfiled,
    isInbox ? {} : "skip"
  );

  // Client scope - folder documents
  const folderDocuments = useQuery(
    api.documents.getByFolder,
    scope === 'client' && selectedFolder && clientId && (selectedFolder.type === 'client' || selectedFolder.type === 'project')
      ? {
          clientId,
          folderType: selectedFolder.folderId,
          level: selectedFolder.type as 'client' | 'project',
          projectId: selectedFolder.projectId,
        }
      : "skip"
  );

  // Internal/Personal scope - documents by scope
  const scopedDocuments = useQuery(
    api.documents.getByScope,
    (scope === 'internal' || scope === 'personal') && selectedFolder
      ? {
          scope: scope as 'internal' | 'personal',
          folderId: selectedFolder.folderId,
        }
      : "skip"
  );

  const deleteDocument = useMutation(api.documents.remove);

  // Get documents based on context and scope
  const documents = useMemo(() => {
    if (isInbox) {
      return unfiledDocuments || [];
    }

    // Internal or personal scope
    if (scope === 'internal' || scope === 'personal') {
      return scopedDocuments || [];
    }

    // Client scope (default)
    return folderDocuments || [];
  }, [isInbox, unfiledDocuments, folderDocuments, scopedDocuments, scope]);

  // Sort documents
  const sortedDocuments = useMemo(() => {
    const docs = [...documents];

    switch (sortBy) {
      case 'date-desc':
        return docs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      case 'date-asc':
        return docs.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
      case 'name-asc':
        return docs.sort((a, b) => (a.documentCode || a.fileName).localeCompare(b.documentCode || b.fileName));
      case 'name-desc':
        return docs.sort((a, b) => (b.documentCode || b.fileName).localeCompare(a.documentCode || a.fileName));
      case 'size-desc':
        return docs.sort((a, b) => b.fileSize - a.fileSize);
      case 'size-asc':
        return docs.sort((a, b) => a.fileSize - b.fileSize);
      default:
        return docs;
    }
  }, [documents, sortBy]);

  // Build version groups from the flat document list
  const versionGroups = useMemo(() => {
    // Cast to our local Document type for consistent handling
    const docs: Document[] = sortedDocuments as Document[];
    const docById = new Map<string, Document>();
    const hasNext = new Set<string>(); // docs that are someone's previousVersionId

    docs.forEach(doc => {
      docById.set(doc._id, doc);
      if (doc.previousVersionId) {
        hasNext.add(doc.previousVersionId);
      }
    });

    // Find all docs that are in a chain
    const inChain = new Set<string>();
    docs.forEach(doc => {
      if (doc.previousVersionId) {
        inChain.add(doc._id);
        if (docById.has(doc.previousVersionId)) {
          inChain.add(doc.previousVersionId);
        }
      }
    });

    // Find heads: docs in a chain where nobody in this folder points to them as previousVersionId
    const heads = docs.filter(doc => inChain.has(doc._id) && !hasNext.has(doc._id));
    const chainMembers = new Set<string>();

    const groups: VersionGroup[] = [];

    heads.forEach(head => {
      const chain: Document[] = [head];
      chainMembers.add(head._id);
      let current: Document = head;

      // Walk backwards from head to build the chain
      while (current.previousVersionId && docById.has(current.previousVersionId)) {
        const prev = docById.get(current.previousVersionId)!;
        chain.unshift(prev); // prepend (oldest first)
        chainMembers.add(prev._id);
        current = prev;
      }

      if (chain.length > 1) {
        groups.push({ head, versions: chain });
      } else {
        // Single doc that has previousVersionId pointing outside this folder — treat as standalone
        chainMembers.delete(head._id);
      }
    });

    // Standalone docs (not in any chain within this folder)
    const standalone = docs.filter(doc => !chainMembers.has(doc._id));

    return { groups, standalone };
  }, [sortedDocuments]);

  const toggleSelection = useCallback((docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }, []);

  const handleBulkDelete = async () => {
    if (selectedDocIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const result = await bulkDeleteMutation({
        documentIds: Array.from(selectedDocIds) as Id<"documents">[],
      });
      toast.success(`Deleted ${result.deletedCount} document${result.deletedCount !== 1 ? 's' : ''}`);
      setSelectedDocIds(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete documents');
    } finally {
      setIsBulkDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSelectAll = useCallback(() => {
    if (selectedDocIds.size === sortedDocuments.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(sortedDocuments.map(d => d._id)));
    }
  }, [selectedDocIds.size, sortedDocuments]);

  // Clear selection on folder change
  useEffect(() => {
    setSelectedDocIds(new Set());
  }, [selectedFolder?.folderId, selectedFolder?.projectId]);

  const toggleGroup = useCallback((headId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(headId)) next.delete(headId);
      else next.add(headId);
      return next;
    });
  }, []);

  const handleDownload = async (doc: Document) => {
    if (!doc.fileStorageId) {
      alert('File not available for download');
      return;
    }

    try {
      const fileUrl = await convex.query(api.documents.getFileUrl, {
        storageId: doc.fileStorageId
      });

      if (!fileUrl) {
        throw new Error('Could not get file URL');
      }

      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = doc.fileName;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file');
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Are you sure you want to delete "${doc.fileName}"?`)) {
      return;
    }

    try {
      await deleteDocument({ id: doc._id });
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete file');
    }
  };

  const handleView = (doc: Document) => {
    onFileSelect(doc);
  };

  const handleOpenReader = (doc: Document) => {
    router.push(`/docs/reader/${doc._id}`);
  };

  const handleLinkAsVersion = (doc: Document) => {
    setLinkVersionDoc(doc);
    setShowLinkVersionModal(true);
  };

  const handleUnlinkVersion = async (doc: Document) => {
    if (!confirm(`Unlink "${doc.documentCode || doc.fileName}" from its version chain?`)) return;
    try {
      await unlinkVersion({ documentId: doc._id });
    } catch (error) {
      console.error('Unlink error:', error);
      alert('Failed to unlink version');
    }
  };

  // Title based on context
  const getTitle = () => {
    if (isInbox) return 'Inbox';
    if (selectedFolder) return selectedFolder.folderName;
    return 'Select a folder';
  };

  // Shared props builder for FileCard
  const fileCardProps = (doc: Document) => ({
    document: doc,
    onClick: () => handleView(doc),
    onView: () => handleView(doc),
    onDownload: () => handleDownload(doc),
    onDelete: () => handleDelete(doc),
    onOpenReader: () => handleOpenReader(doc),
    onLinkAsVersion: () => handleLinkAsVersion(doc),
    onUnlinkVersion: () => handleUnlinkVersion(doc),
  });

  // Empty state
  if (!isInbox && !selectedFolder) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">Select a folder</h3>
          <p className="text-sm text-gray-500">
            Choose a folder from the sidebar to view its contents
          </p>
        </div>
      </div>
    );
  }

  // Allow upload in folder views (client scope needs clientId, internal/personal just need folder)
  const canUpload = selectedFolder && !isInbox && (
    scope === 'client' ? clientId : true
  );

  const renderListHeader = () => (
    <div className="flex items-center h-7 px-3 border-b border-gray-200 bg-gray-50/80 text-[10px] font-medium text-gray-400 uppercase tracking-wider select-none sticky top-0 z-10">
      <div className="w-5 flex-shrink-0 flex items-center justify-center">
        <Checkbox
          checked={sortedDocuments.length > 0 && selectedDocIds.size === sortedDocuments.length}
          onCheckedChange={handleSelectAll}
          className="h-3 w-3"
        />
      </div>
      <div className="w-5 flex-shrink-0" />
      <div className="flex-1 pl-2">Name</div>
      <div className="w-32 flex-shrink-0 hidden md:block pr-3">Type</div>
      <div className="w-32 flex-shrink-0 hidden lg:block pr-3">Category</div>
      <div className="w-20 flex-shrink-0 hidden sm:block text-right">Date</div>
      <div className="w-16 flex-shrink-0 hidden sm:block text-right">Size</div>
      <div className="w-7 flex-shrink-0 ml-1" />
    </div>
  );

  const renderListView = () => (
    <div>
      {renderListHeader()}

      {/* Version groups */}
      {versionGroups.groups.map(group => {
        const isExpanded = expandedGroups.has(group.head._id);
        const olderVersions = group.versions.filter(v => v._id !== group.head._id);

        return (
          <div key={group.head._id}>
            <FileCard
              {...fileCardProps(group.head)}
              viewMode="list"
              isSelected={selectedDocIds.has(group.head._id)}
              onSelectionChange={() => toggleSelection(group.head._id)}
              versionCount={group.versions.length}
              isVersionExpanded={isExpanded}
              onToggleVersions={() => toggleGroup(group.head._id)}
            />

            {isExpanded && (
              <div className="border-l border-gray-200 ml-5">
                {olderVersions.map(version => (
                  <FileCard
                    key={version._id}
                    {...fileCardProps(version)}
                    viewMode="list"
                    isSelected={selectedDocIds.has(version._id)}
                    onSelectionChange={() => toggleSelection(version._id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Standalone documents */}
      {versionGroups.standalone.map(doc => (
        <FileCard
          key={doc._id}
          {...fileCardProps(doc)}
          viewMode="list"
          isSelected={selectedDocIds.has(doc._id)}
          onSelectionChange={() => toggleSelection(doc._id)}
        />
      ))}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-white h-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <h2 className="font-semibold text-gray-900 truncate">{getTitle()}</h2>
          <span className="text-sm text-gray-500 flex-shrink-0">
            ({sortedDocuments.length} {sortedDocuments.length === 1 ? 'file' : 'files'})
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bulk selection actions */}
          {selectedDocIds.size > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedDocIds.size} selected
            </Badge>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 h-8"
            disabled={selectedDocIds.size === 0}
            onClick={() => setShowBulkMoveModal(true)}>
            <FolderInput className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Move</span>
          </Button>
          <Button size="sm" variant="outline"
            className="gap-1.5 h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={selectedDocIds.size === 0}
            onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </Button>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <ArrowUpDown className="w-3 h-3 mr-1 flex-shrink-0" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Newest first</SelectItem>
              <SelectItem value="date-asc">Oldest first</SelectItem>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
              <SelectItem value="name-desc">Name Z-A</SelectItem>
              <SelectItem value="size-desc">Largest first</SelectItem>
              <SelectItem value="size-asc">Smallest first</SelectItem>
            </SelectContent>
          </Select>

          {/* View Toggle */}
          <div className="flex border border-gray-200 rounded-md overflow-hidden flex-shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === 'list'
                  ? "bg-gray-100 text-gray-900"
                  : "bg-white text-gray-500 hover:text-gray-900"
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === 'grid'
                  ? "bg-gray-100 text-gray-900"
                  : "bg-white text-gray-500 hover:text-gray-900"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Upload Button */}
          {canUpload && (
            <Button
              size="sm"
              className="gap-1.5 h-8 flex-shrink-0"
              onClick={() => setShowUploadModal(true)}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          )}
        </div>
      </div>

      {/* File Content */}
      <div className="flex-1 overflow-auto">
        {sortedDocuments.length === 0 ? (
          <div
            className="flex items-center justify-center h-full"
            onDragOver={canUpload ? handleDragOver : undefined}
            onDragLeave={canUpload ? handleDragLeave : undefined}
            onDrop={canUpload ? handleDrop : undefined}
          >
            <div
              className={cn(
                "text-center py-12 px-8 rounded-xl transition-all max-w-md mx-4",
                canUpload && "cursor-pointer",
                isDragOver
                  ? "border-2 border-dashed border-blue-500 bg-blue-50"
                  : canUpload
                    ? "border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    : ""
              )}
              onClick={() => canUpload && setShowUploadModal(true)}
            >
              {isDragOver ? (
                <>
                  <Upload className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-blue-700 mb-1">Drop files here</h3>
                  <p className="text-sm text-blue-600">
                    Release to upload to {selectedFolder?.folderName}
                  </p>
                </>
              ) : (
                <>
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No files</h3>
                  <p className="text-sm text-gray-500">
                    {isInbox
                      ? 'No unfiled documents. Great job!'
                      : 'This folder is empty.'}
                  </p>
                  {canUpload && (
                    <p className="text-sm text-gray-400 mt-2">
                      Drag & drop files here or click to upload
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedDocuments.map((doc) => (
              <FileCard
                key={doc._id}
                {...fileCardProps(doc)}
                viewMode="grid"
              />
            ))}
          </div>
        ) : (
          renderListView()
        )}
      </div>

      {/* Upload Modal - Client scope */}
      {canUpload && scope === 'client' && clientId && clientName && clientType && selectedFolder && (
        <DirectUploadModal
          isOpen={showUploadModal}
          onClose={() => { setShowUploadModal(false); setDroppedFiles([]); }}
          clientId={clientId}
          clientName={clientName}
          clientType={clientType}
          folderType={selectedFolder.folderId}
          folderName={selectedFolder.folderName}
          level={selectedFolder.type as 'client' | 'project'}
          projectId={selectedFolder.projectId}
          projectName={project?.name}
          initialFiles={droppedFiles}
        />
      )}

      {/* Upload Modal - Internal/Personal scope */}
      {canUpload && (scope === 'internal' || scope === 'personal') && selectedFolder && (
        <InternalUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          scope={scope}
          folderId={selectedFolder.folderId}
          folderName={selectedFolder.folderName}
        />
      )}

      {/* Link as Version Modal */}
      {linkVersionDoc && (
        <LinkAsVersionModal
          isOpen={showLinkVersionModal}
          onClose={() => { setShowLinkVersionModal(false); setLinkVersionDoc(null); }}
          sourceDocument={linkVersionDoc}
          folderDocuments={sortedDocuments.filter(d => d._id !== linkVersionDoc._id)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedDocIds.size} document{selectedDocIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected documents. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isBulkDeleting} className="bg-red-600 hover:bg-red-700">
              {isBulkDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Move Modal */}
      <BulkMoveModal
        isOpen={showBulkMoveModal}
        onClose={() => setShowBulkMoveModal(false)}
        documentIds={Array.from(selectedDocIds)}
        currentClientId={clientId || undefined}
        currentProjectId={selectedFolder?.projectId}
        onMoveComplete={() => setSelectedDocIds(new Set())}
      />
    </div>
  );
}
