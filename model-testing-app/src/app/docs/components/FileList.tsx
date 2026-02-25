'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LayoutGrid,
  List,
  Upload,
  FolderOpen,
  FileText,
  ArrowUpDown,
} from 'lucide-react';
import FileCard from './FileCard';
import DirectUploadModal from './DirectUploadModal';
import InternalUploadModal from './InternalUploadModal';
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

  // Convex client for on-demand queries
  const convex = useConvex();

  // Get project name if we have a project folder selected
  const project = useQuery(
    api.projects.get,
    selectedFolder?.projectId ? { id: selectedFolder.projectId } : "skip"
  );

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

  const handleDownload = async (doc: Document) => {
    if (!doc.fileStorageId) {
      alert('File not available for download');
      return;
    }
    
    try {
      // Get the file URL from Convex storage
      const fileUrl = await convex.query(api.documents.getFileUrl, { 
        storageId: doc.fileStorageId 
      });
      
      if (!fileUrl) {
        throw new Error('Could not get file URL');
      }
      
      // Fetch the file and trigger download
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

  // Title based on context
  const getTitle = () => {
    if (isInbox) {
      return 'Inbox';
    }
    if (selectedFolder) {
      return selectedFolder.folderName;
    }
    return 'Select a folder';
  };

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
                document={doc}
                viewMode="grid"
                onClick={() => handleView(doc)}
                onView={() => handleView(doc)}
                onDownload={() => handleDownload(doc)}
                onDelete={() => handleDelete(doc)}
                onOpenReader={() => handleOpenReader(doc)}
              />
            ))}
          </div>
        ) : (
          <div>
            {sortedDocuments.map((doc) => (
              <FileCard
                key={doc._id}
                document={doc}
                viewMode="list"
                onClick={() => handleView(doc)}
                onView={() => handleView(doc)}
                onDownload={() => handleDownload(doc)}
                onDelete={() => handleDelete(doc)}
                onOpenReader={() => handleOpenReader(doc)}
              />
            ))}
          </div>
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
    </div>
  );
}
