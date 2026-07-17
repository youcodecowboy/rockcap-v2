'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import Link from 'next/link';
import { Button, Skeleton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Clock, FileText, Building, User } from 'lucide-react';

import DocsSidebar, { DocumentScope } from './components/DocsSidebar';
import FolderBrowser from './components/FolderBrowser';
import FileList from './components/FileList';
import FileDetailPanel from './components/FileDetailPanel';
import BreadcrumbNav from './components/BreadcrumbNav';
import MoveDocumentCrossScopeModal from '@/components/MoveDocumentCrossScopeModal';
import KnowledgeGraphDrawer from '@/components/knowledge/KnowledgeGraphDrawer';
import { FolderSelection } from '@/types/folders';

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
  savedAt?: string;
  fileStorageId?: Id<"_storage">;
  clientName?: string;
  projectName?: string;
  version?: string;
  previousVersionId?: string;
  uploaderInitials?: string;
  isInternal?: boolean;
  scope?: 'client' | 'internal' | 'personal';
}

function DocsPageContent() {
  const colors = useColors();
  // URL params for deep linking
  const searchParams = useSearchParams();
  const urlClientId = searchParams.get('clientId');

  // State - Document scope
  const [activeScope, setActiveScope] = useState<DocumentScope>('client');

  // State - Client documents
  const [selectedClientId, setSelectedClientId] = useState<Id<"clients"> | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection | null>(null);

  // State - Internal documents
  const [selectedInternalFolder, setSelectedInternalFolder] = useState<FolderSelection | null>(null);

  // State - Personal documents
  const [selectedPersonalFolder, setSelectedPersonalFolder] = useState<FolderSelection | null>(null);

  // State - Common
  const [isInboxSelected, setIsInboxSelected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isGraphOpen, setIsGraphOpen] = useState(false);

  // Initialize from URL params on mount
  useEffect(() => {
    if (urlClientId && !initializedFromUrl) {
      setSelectedClientId(urlClientId as Id<"clients">);
      setInitializedFromUrl(true);
    }
  }, [urlClientId, initializedFromUrl]);

  // Queries
  const selectedClient = useQuery(
    // @ts-ignore - Convex type instantiation depth issue
    api.clients.get,
    selectedClientId ? { id: selectedClientId } : "skip"
  );

  const selectedProject = useQuery(
    api.projects.get,
    selectedFolder?.projectId ? { id: selectedFolder.projectId } : "skip"
  );

  const pendingJobs = useQuery(api.fileQueue.getJobs, {
    status: 'needs_confirmation',
    limit: 100
  });
  const queueCount = pendingJobs?.length || 0;

  // Mutations
  const deleteDocument = useMutation(api.documents.remove);
  const updateClient = useMutation(api.clients.update);

  // Handlers - Scope change
  const handleScopeChange = useCallback((scope: DocumentScope) => {
    setActiveScope(scope);
    setIsInboxSelected(false);
    setSelectedDocument(null);
    // Don't clear selections - DocsSidebar handles clearing when switching
  }, []);

  // Handlers - Client documents
  const handleClientSelect = useCallback((clientId: Id<"clients"> | null) => {
    setSelectedClientId(clientId);
    setSelectedFolder(null);
    setIsInboxSelected(false);
    setSelectedDocument(null);
  }, []);

  const handleFolderSelect = useCallback((folder: FolderSelection | null) => {
    setSelectedFolder(folder);
    setSelectedDocument(null);
  }, []);

  // Handlers - Internal documents
  const handleInternalFolderSelect = useCallback((folder: FolderSelection | null) => {
    setSelectedInternalFolder(folder);
    setIsInboxSelected(false);
    setSelectedDocument(null);
  }, []);

  // Handlers - Personal documents
  const handlePersonalFolderSelect = useCallback((folder: FolderSelection | null) => {
    setSelectedPersonalFolder(folder);
    setIsInboxSelected(false);
    setSelectedDocument(null);
  }, []);

  // Handlers - Common
  const handleInboxSelect = useCallback(() => {
    setSelectedClientId(null);
    setSelectedFolder(null);
    setSelectedInternalFolder(null);
    setSelectedPersonalFolder(null);
    setIsInboxSelected(true);
    setSelectedDocument(null);
  }, []);

  const handleFileSelect = useCallback((document: Document) => {
    setSelectedDocument(document);
    setIsDetailPanelOpen(true);
  }, []);

  const handleCloseDetailPanel = useCallback(() => {
    setIsDetailPanelOpen(false);
    // Keep selectedDocument for a moment to allow animation
    setTimeout(() => setSelectedDocument(null), 300);
  }, []);

  const handleDeleteDocument = useCallback(async () => {
    if (!selectedDocument) return;

    if (!confirm(`Are you sure you want to delete "${selectedDocument.fileName}"?`)) {
      return;
    }

    try {
      await deleteDocument({ id: selectedDocument._id });
      handleCloseDetailPanel();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete file');
    }
  }, [selectedDocument, deleteDocument, handleCloseDetailPanel]);

  const handleMoveDocument = useCallback(() => {
    if (!selectedDocument) return;
    setIsMoveModalOpen(true);
  }, [selectedDocument]);

  const handleMoveComplete = useCallback(() => {
    setIsMoveModalOpen(false);
    handleCloseDetailPanel();
  }, [handleCloseDetailPanel]);

  const handleHomeClick = useCallback(() => {
    setSelectedClientId(null);
    setSelectedFolder(null);
    setSelectedInternalFolder(null);
    setSelectedPersonalFolder(null);
    setIsInboxSelected(false);
    setSelectedDocument(null);
  }, []);

  // Get the current folder based on scope
  const getCurrentFolder = (): FolderSelection | null => {
    switch (activeScope) {
      case 'client':
        return selectedFolder;
      case 'internal':
        return selectedInternalFolder;
      case 'personal':
        return selectedPersonalFolder;
      default:
        return null;
    }
  };

  // Get scope label for breadcrumb
  const getScopeLabel = () => {
    switch (activeScope) {
      case 'internal':
        return 'RockCap Internal';
      case 'personal':
        return 'Personal';
      default:
        return null;
    }
  };

  const currentFolder = getCurrentFolder();

  return (
    <div className="h-screen flex flex-col" style={{ background: colors.bg.base }}>
      {/* Header */}
      <header
        className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}` }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" style={{ color: colors.accent.blue }} />
            <h1 style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary }}>
              Document Library
            </h1>
          </div>

          {/* Breadcrumb */}
          <div className="hidden md:block">
            {activeScope === 'client' ? (
              <BreadcrumbNav
                clientName={selectedClient?.name}
                projectName={selectedProject?.name}
                folderName={selectedFolder?.folderName}
                isInbox={isInboxSelected}
                onHomeClick={handleHomeClick}
                onClientClick={() => {
                  setSelectedFolder(null);
                  setSelectedDocument(null);
                }}
                onProjectClick={() => {
                  if (selectedFolder?.projectId) {
                    setSelectedFolder(null);
                  }
                }}
              />
            ) : (
              <div className="flex items-center gap-2" style={{ fontSize: 12, color: colors.text.secondary }}>
                <button
                  onClick={handleHomeClick}
                  style={{ background: 'transparent', border: 'none', color: colors.text.secondary, cursor: 'pointer' }}
                >
                  Documents
                </button>
                <span style={{ color: colors.text.dim }}>/</span>
                <span className="flex items-center gap-1.5">
                  {activeScope === 'internal' ? (
                    <Building className="w-3.5 h-3.5" />
                  ) : (
                    <User className="w-3.5 h-3.5" />
                  )}
                  {getScopeLabel()}
                </span>
                {currentFolder && (
                  <>
                    <span style={{ color: colors.text.dim }}>/</span>
                    <span style={{ fontWeight: 500, color: colors.text.primary }}>
                      {currentFolder.folderName}
                    </span>
                  </>
                )}
                {isInboxSelected && (
                  <>
                    <span style={{ color: colors.text.dim }}>/</span>
                    <span style={{ fontWeight: 500, color: colors.text.primary }}>Inbox</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Review Queue - hidden for V1, only show if there are pending items from legacy flow */}
          {queueCount > 0 && (
            <Link href="/docs/queue">
              <Button variant="primary" size="sm" accent={colors.accent.blue}>
                <Clock className="w-4 h-4" />
                Review Queue
                <span
                  style={{
                    marginLeft: 4,
                    padding: '0 6px',
                    borderRadius: 2,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 10,
                    background: colors.bg.card,
                    color: colors.accent.blue,
                  }}
                >
                  {queueCount}
                </span>
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Main Content - 3 Pane Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Sidebar */}
        <DocsSidebar
          selectedClientId={selectedClientId}
          onClientSelect={handleClientSelect}
          onInboxSelect={handleInboxSelect}
          isInboxSelected={isInboxSelected}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeScope={activeScope}
          onScopeChange={handleScopeChange}
          selectedInternalFolder={selectedInternalFolder}
          onInternalFolderSelect={handleInternalFolderSelect}
          selectedPersonalFolder={selectedPersonalFolder}
          onPersonalFolderSelect={handlePersonalFolderSelect}
          onOpenKnowledgeGraph={selectedClientId ? () => setIsGraphOpen(true) : undefined}
        />

        {/* Column 2: Folder Browser - only show for client scope with selected client */}
        {activeScope === 'client' && selectedClientId && selectedClient && !isInboxSelected && (
          <FolderBrowser
            clientId={selectedClientId}
            clientName={selectedClient.name}
            clientType={selectedClient.type}
            selectedFolder={selectedFolder}
            onFolderSelect={handleFolderSelect}
            onClientTypeChange={(newType) => updateClient({ id: selectedClientId, type: newType })}
          />
        )}

        {/* Column 3: File List */}
        <FileList
          clientId={selectedClientId}
          clientName={selectedClient?.name}
          clientType={selectedClient?.type}
          selectedFolder={currentFolder}
          isInbox={isInboxSelected}
          onFileSelect={handleFileSelect}
          onFolderSelect={handleFolderSelect}
          scope={activeScope}
        />

        {/* File Detail Panel (Slide-out) */}
        <FileDetailPanel
          document={selectedDocument}
          isOpen={isDetailPanelOpen}
          onClose={handleCloseDetailPanel}
          onDelete={handleDeleteDocument}
          onMove={handleMoveDocument}
        />

        {/* Move Document Modal */}
        {selectedDocument && (
          <MoveDocumentCrossScopeModal
            isOpen={isMoveModalOpen}
            onClose={() => setIsMoveModalOpen(false)}
            documentId={selectedDocument._id}
            currentScope={selectedDocument.scope || 'client'}
            currentClientId={selectedClientId || undefined}
            currentProjectId={selectedFolder?.projectId}
            currentFolderId={
              activeScope === 'client'
                ? selectedFolder?.folderId
                : activeScope === 'internal'
                ? selectedInternalFolder?.folderId
                : selectedPersonalFolder?.folderId
            }
            onMoveComplete={handleMoveComplete}
          />
        )}
      </div>

      {/* Knowledge Graph Drawer — overlays all panes (fixed, page-level mount) */}
      {isGraphOpen && selectedClientId && selectedClient && (
        <KnowledgeGraphDrawer
          entryEntityType="client"
          entryEntityId={selectedClientId}
          entryName={selectedClient.name}
          onClose={() => setIsGraphOpen(false)}
        />
      )}
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function DocsPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center p-6" style={{ width: '100%' }}><Skeleton width={240} height={12} /></div>}>
      <DocsPageContent />
    </Suspense>
  );
}
