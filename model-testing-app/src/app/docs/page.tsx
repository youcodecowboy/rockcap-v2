'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, FileText, Building, User } from 'lucide-react';

import DocsSidebar, { DocumentScope } from './components/DocsSidebar';
import FolderBrowser from './components/FolderBrowser';
import FileList from './components/FileList';
import FileDetailPanel from './components/FileDetailPanel';
import BreadcrumbNav from './components/BreadcrumbNav';
import MoveDocumentCrossScopeModal from '@/components/MoveDocumentCrossScopeModal';

interface FolderSelection {
  type: 'client' | 'project' | 'internal' | 'personal';
  folderId: string;
  folderName: string;
  projectId?: Id<"projects">;
}

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
  uploaderInitials?: string;
  isInternal?: boolean;
  scope?: 'client' | 'internal' | 'personal';
}

function DocsPageContent() {
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
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Document Library</h1>
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
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <button
                  onClick={handleHomeClick}
                  className="hover:text-gray-900 transition-colors"
                >
                  Documents
                </button>
                <span>/</span>
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
                    <span>/</span>
                    <span className="font-medium text-gray-900">
                      {currentFolder.folderName}
                    </span>
                  </>
                )}
                {isInboxSelected && (
                  <>
                    <span>/</span>
                    <span className="font-medium text-gray-900">Inbox</span>
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
              <Button variant="default" size="sm" className="relative">
                <Clock className="w-4 h-4 mr-2" />
                Review Queue
                <Badge variant="secondary" className="ml-2 bg-white text-blue-600">
                  {queueCount}
                </Badge>
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
        />

        {/* Column 2: Folder Browser - only show for client scope with selected client */}
        {activeScope === 'client' && selectedClientId && selectedClient && !isInboxSelected && (
          <FolderBrowser
            clientId={selectedClientId}
            clientName={selectedClient.name}
            clientType={selectedClient.type}
            selectedFolder={selectedFolder}
            onFolderSelect={handleFolderSelect}
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
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function DocsPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>}>
      <DocsPageContent />
    </Suspense>
  );
}
