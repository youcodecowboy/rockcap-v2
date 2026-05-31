'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button, Select, Modal, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  LayoutGrid,
  List,
  Upload,
  FolderOpen,
  FileText,
  FolderInput,
  FolderPlus,
  Trash2,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import FileCard from './FileCard';
import DirectUploadModal from './DirectUploadModal';
import InternalUploadModal from './InternalUploadModal';
import LinkAsVersionModal from './LinkAsVersionModal';
import BulkMoveModal from './BulkMoveModal';
import RenameDocumentDialog from '@/components/RenameDocumentDialog';
import { FolderSelection } from '@/types/folders';

type DocumentScope = 'client' | 'internal' | 'personal';

interface Document {
  _id: Id<"documents">;
  fileName: string;
  displayName?: string;
  documentCode?: string;
  customFieldValues?: Record<string, string>;
  summary: string;
  category: string;
  fileTypeDetected?: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  fileStorageId?: Id<"_storage">;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
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
  onFolderSelect?: (folder: FolderSelection) => void;
  onCreateSubfolder?: () => void;
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
  onFolderSelect,
  onCreateSubfolder,
  scope = 'client',
}: FileListProps) {
  const colors = useColors();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [draggingDocIds, setDraggingDocIds] = useState<Set<string>>(new Set());
  const [linkVersionDoc, setLinkVersionDoc] = useState<Document | null>(null);
  const [showLinkVersionModal, setShowLinkVersionModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [renamingDoc, setRenamingDoc] = useState<Document | null>(null);
  const bulkDeleteMutation = useMutation(api.documents.bulkDelete);

  // Convex client for on-demand queries
  const convex = useConvex();

  // Get client data for rename dialog metadata
  const client = useQuery(
    api.clients.get,
    clientId ? { id: clientId } : "skip"
  );

  // Get project name if we have a project folder selected
  const project = useQuery(
    api.projects.get,
    selectedFolder?.projectId ? { id: selectedFolder.projectId } : "skip"
  );

  const unlinkVersion = useMutation(api.documents.unlinkVersion);
  const duplicateDocument = useMutation(api.documents.duplicateDocument);

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

  // Notes for the "notes" folder — virtual items from the Notes section
  const isNotesFolder = selectedFolder?.folderId === 'notes' && selectedFolder?.type === 'project';
  const projectNotesForFolder = useQuery(
    api.notes.getByProjectForFolder,
    isNotesFolder && selectedFolder?.projectId
      ? { projectId: selectedFolder.projectId }
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

  // Unified item type for mixed documents + notes in the notes folder
  type NoteItem = {
    _type: 'note';
    _id: string;
    title: string;
    emoji?: string;
    updatedAt: string;
    createdAt: string;
    wordCount?: number;
    isDraft?: boolean;
    tags: string[];
  };

  const noteItems: NoteItem[] = useMemo(() => {
    if (!isNotesFolder || !projectNotesForFolder) return [];
    return projectNotesForFolder.map(note => ({
      _type: 'note' as const,
      _id: note._id,
      title: note.title,
      emoji: note.emoji ?? undefined,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
      wordCount: note.wordCount ?? undefined,
      isDraft: note.isDraft ?? undefined,
      tags: note.tags,
    }));
  }, [isNotesFolder, projectNotesForFolder]);

  // Sort documents
  const sortedDocuments = useMemo(() => {
    const docs = [...documents];

    switch (sortBy) {
      case 'date-desc':
        return docs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      case 'date-asc':
        return docs.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
      case 'name-asc':
        return docs.sort((a, b) => (a.displayName || a.documentCode || a.fileName).localeCompare(b.displayName || b.documentCode || b.fileName));
      case 'name-desc':
        return docs.sort((a, b) => (b.displayName || b.documentCode || b.fileName).localeCompare(a.displayName || a.documentCode || a.fileName));
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

  const handleFileDragStart = useCallback((e: React.DragEvent, docId: string) => {
    // If the dragged doc is in the selection, drag all selected; otherwise just this one
    const idsToMove = selectedDocIds.has(docId)
      ? Array.from(selectedDocIds)
      : [docId];

    e.dataTransfer.setData("application/x-document-ids", JSON.stringify(idsToMove));
    e.dataTransfer.effectAllowed = "move";

    setDraggingDocIds(new Set(idsToMove));

    // Clean up on drag end
    const handleDragEnd = () => {
      setDraggingDocIds(new Set());
      document.removeEventListener("dragend", handleDragEnd);
    };
    document.addEventListener("dragend", handleDragEnd);
  }, [selectedDocIds]);

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
      link.download = doc.displayName || doc.documentCode || doc.fileName;
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

  const handleDuplicate = useCallback(async (documentId: Id<"documents">, fileName: string) => {
    try {
      await duplicateDocument({ documentId });
      toast.success(`Duplicated "${fileName}"`);
    } catch (error) {
      toast.error("Failed to duplicate document");
    }
  }, [duplicateDocument]);

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
    onRename: () => setRenamingDoc(doc),
    onDuplicate: () => handleDuplicate(doc._id, doc.fileName),
    onOpenReader: () => handleOpenReader(doc),
    onLinkAsVersion: () => handleLinkAsVersion(doc),
    onUnlinkVersion: () => handleUnlinkVersion(doc),
    onDragStart: (e: React.DragEvent) => handleFileDragStart(e, doc._id),
    isDragging: draggingDocIds.has(doc._id),
  });

  // Empty state
  if (!isInbox && !selectedFolder) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: colors.bg.light }}>
        <EmptyState
          icon={<FolderOpen className="w-16 h-16" />}
          title="Select a folder"
          body="Choose a folder from the sidebar to view its contents"
        />
      </div>
    );
  }

  // Allow upload in folder views (client scope needs clientId, internal/personal just need folder)
  const canUpload = selectedFolder && !isInbox && (
    scope === 'client' ? clientId : true
  );

  const headerCell: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: colors.text.dim,
    fontWeight: 500,
  };

  const renderListHeader = () => (
    <div
      className="flex items-center h-7 px-3 select-none sticky top-0 z-10"
      style={{ borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light, ...headerCell }}
    >
      <div className="w-5 flex-shrink-0 flex items-center justify-center">
        <input
          type="checkbox"
          checked={sortedDocuments.length > 0 && selectedDocIds.size === sortedDocuments.length}
          onChange={handleSelectAll}
          style={{ width: 12, height: 12, accentColor: colors.accent.blue, cursor: 'pointer' }}
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
              <div className="ml-5" style={{ borderLeft: `1px solid ${colors.border.default}` }}>
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

      {/* Note items from Notes section */}
      {noteItems.map(note => (
        <div
          key={`note-${note._id}`}
          onClick={() => router.push(`/notes?note=${note._id}`)}
          className="flex items-center px-3 py-2 cursor-pointer group"
          style={{ borderBottom: `1px solid ${colors.border.light}`, transition: 'background 100ms linear' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {/* Spacer for expand chevron */}
          <div className="flex-shrink-0 w-5" />
          {/* Spacer for checkbox */}
          <div className="flex-shrink-0 w-5" />
          {/* Name block */}
          <div className="flex-1 min-w-0 pl-2 pr-4">
            <div className="flex items-center gap-1.5 min-w-0">
              <Pencil className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.accent.yellow }} />
              <span className="text-[13px] font-medium truncate" style={{ color: colors.text.primary }}>
                {note.emoji ? `${note.emoji} ` : ''}{note.title || 'Untitled Note'}
              </span>
              <StatusPill label="Note" tone={colors.accent.yellow} />
              {note.isDraft && (
                <StatusPill label="Draft" tone={colors.text.muted} />
              )}
            </div>
          </div>
          {/* Type */}
          <div className="flex-shrink-0 w-32 hidden md:block text-[12px] truncate pr-3" style={{ color: colors.text.muted }}>
            Note
          </div>
          {/* Category */}
          <div className="flex-shrink-0 w-32 hidden lg:flex items-center gap-1.5 pr-3">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: colors.accent.yellow }} />
            <span className="text-[12px] truncate" style={{ color: colors.text.muted }}>Notes</span>
          </div>
          {/* Date */}
          <div className="flex-shrink-0 w-20 hidden sm:block text-[12px] tabular-nums text-right" style={{ color: colors.text.dim }}>
            {new Date(note.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          {/* Size placeholder — show word count */}
          <div className="flex-shrink-0 w-16 hidden sm:block text-[12px] tabular-nums text-right" style={{ color: colors.text.dim }}>
            {note.wordCount ? `${note.wordCount}w` : '—'}
          </div>
          {/* Actions spacer */}
          <div className="flex-shrink-0 w-7 ml-1" />
        </div>
      ))}
    </div>
  );

  // View-toggle segment button
  const viewToggleBtn = (active: boolean): React.CSSProperties => ({
    padding: 6,
    background: active ? colors.bg.cardAlt : colors.bg.card,
    color: active ? colors.text.primary : colors.text.muted,
    cursor: 'pointer',
    transition: 'background 100ms linear',
    border: 'none',
  });

  return (
    <div className="flex-1 flex flex-col h-full min-w-0" style={{ background: colors.bg.card }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-3 gap-2 flex-wrap"
        style={{ borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-5 h-5 flex-shrink-0" style={{ color: colors.accent.yellow }} />
          {/* Breadcrumb navigation for subfolders */}
          {selectedFolder?.parentPath && selectedFolder.parentPath.length > 0 && onFolderSelect ? (
            <div className="flex items-center gap-1 min-w-0">
              {selectedFolder.parentPath.map((ancestor, i) => (
                <span key={i} className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onFolderSelect({
                      type: selectedFolder.type,
                      folderId: ancestor.folderId,
                      folderName: ancestor.folderName,
                      projectId: selectedFolder.projectId,
                    })}
                    className="text-sm hover:underline"
                    style={{ color: colors.text.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    {ancestor.folderName}
                  </button>
                  <ChevronRight className="w-3 h-3" style={{ color: colors.text.dim }} />
                </span>
              ))}
              <h2 className="font-semibold truncate" style={{ color: colors.text.primary }}>{getTitle()}</h2>
            </div>
          ) : (
            <h2 className="font-semibold truncate" style={{ color: colors.text.primary }}>{getTitle()}</h2>
          )}
          <span className="text-sm flex-shrink-0" style={{ color: colors.text.muted }}>
            ({sortedDocuments.length + noteItems.length} {(sortedDocuments.length + noteItems.length) === 1 ? 'item' : 'items'})
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bulk selection actions */}
          {selectedDocIds.size > 0 && (
            <StatusPill label={`${selectedDocIds.size} selected`} tone={colors.accent.blue} />
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={selectedDocIds.size === 0}
            onClick={() => setShowBulkMoveModal(true)}
          >
            <FolderInput className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Move</span>
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={selectedDocIds.size === 0}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </Button>

          {/* New Folder — only for project folders */}
          {selectedFolder?.type === 'project' && onCreateSubfolder && (
            <Button variant="secondary" size="sm" onClick={onCreateSubfolder}>
              <FolderPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Folder</span>
            </Button>
          )}

          {/* Sort */}
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            style={{ width: 140, padding: '4px 10px' }}
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="size-desc">Largest first</option>
            <option value="size-asc">Smallest first</option>
          </Select>

          {/* View Toggle */}
          <div
            className="flex overflow-hidden flex-shrink-0"
            style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4 }}
          >
            <button onClick={() => setViewMode('list')} style={viewToggleBtn(viewMode === 'list')} aria-label="List view">
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('grid')} style={viewToggleBtn(viewMode === 'grid')} aria-label="Grid view">
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Upload Button */}
          {canUpload && (
            <Button variant="primary" size="sm" onClick={() => setShowUploadModal(true)}>
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          )}
        </div>
      </div>

      {/* File Content */}
      <div className="flex-1 overflow-auto">
        {sortedDocuments.length === 0 && noteItems.length === 0 ? (
          <div
            className="flex items-center justify-center h-full"
            onDragOver={canUpload ? handleDragOver : undefined}
            onDragLeave={canUpload ? handleDragLeave : undefined}
            onDrop={canUpload ? handleDrop : undefined}
          >
            <div
              className="text-center py-12 px-8 max-w-md mx-4"
              style={{
                borderRadius: 4,
                cursor: canUpload ? 'pointer' : undefined,
                border: isDragOver
                  ? `2px dashed ${colors.accent.blue}`
                  : canUpload
                    ? `2px dashed ${colors.border.mid}`
                    : undefined,
                background: isDragOver ? `${colors.accent.blue}10` : undefined,
                transition: 'background 100ms linear, border-color 100ms linear',
              }}
              onClick={() => canUpload && setShowUploadModal(true)}
            >
              {isDragOver ? (
                <>
                  <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: colors.accent.blue }} />
                  <h3 className="text-lg font-medium mb-1" style={{ color: colors.accent.blue }}>Drop files here</h3>
                  <p className="text-sm" style={{ color: colors.accent.blue }}>
                    Release to upload to {selectedFolder?.folderName}
                  </p>
                </>
              ) : (
                <>
                  <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: colors.text.dim }} />
                  <h3 className="text-lg font-medium mb-1" style={{ color: colors.text.primary }}>No files</h3>
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    {isInbox
                      ? 'No unfiled documents. Great job!'
                      : 'This folder is empty.'}
                  </p>
                  {canUpload && (
                    <p className="text-sm mt-2" style={{ color: colors.text.dim }}>
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
            {/* Note items in grid */}
            {noteItems.map(note => (
              <div
                key={`note-${note._id}`}
                onClick={() => router.push(`/notes?note=${note._id}`)}
                className="cursor-pointer group"
                style={{
                  background: colors.bg.card,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  padding: 16,
                  transition: 'border-color 100ms linear',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.border.mid; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border.default; }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div style={{ padding: 8, background: `${colors.accent.yellow}15`, borderRadius: 4 }}>
                    <Pencil className="w-8 h-8" style={{ color: colors.accent.yellow }} />
                  </div>
                  <StatusPill label="Note" tone={colors.accent.yellow} />
                </div>
                <div className="mb-2">
                  <div className="font-medium text-sm truncate" style={{ color: colors.text.primary }}>
                    {note.emoji ? `${note.emoji} ` : ''}{note.title || 'Untitled Note'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {note.isDraft && (
                    <StatusPill label="Draft" tone={colors.text.muted} />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs" style={{ color: colors.text.dim }}>
                  <span>{new Date(note.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  {note.wordCount && <span>{note.wordCount} words</span>}
                </div>
              </div>
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
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={`Delete ${selectedDocIds.size} document${selectedDocIds.size !== 1 ? 's' : ''}?`}
        footer={
          <>
            <Button variant="secondary" disabled={isBulkDeleting} onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleBulkDelete} disabled={isBulkDeleting}>
              {isBulkDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: colors.text.muted }}>
          This will permanently delete the selected documents. This action cannot be undone.
        </p>
      </Modal>

      {/* Bulk Move Modal */}
      <BulkMoveModal
        isOpen={showBulkMoveModal}
        onClose={() => setShowBulkMoveModal(false)}
        documentIds={Array.from(selectedDocIds)}
        currentClientId={clientId || undefined}
        currentProjectId={selectedFolder?.projectId}
        onMoveComplete={() => setSelectedDocIds(new Set())}
      />

      {/* Rename Document Dialog */}
      {renamingDoc && (
        <RenameDocumentDialog
          isOpen={!!renamingDoc}
          onClose={() => setRenamingDoc(null)}
          document={renamingDoc}
          clientMetadata={client?.metadata}
          projectMetadata={project?.metadata}
          clientCode={client?.metadata?.documentNaming?.code || ""}
          projectCode={project?.projectShortcode || ""}
        />
      )}
    </div>
  );
}
