'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, FileText } from 'lucide-react';

import DocsSidebar from './components/DocsSidebar';
import FolderBrowser from './components/FolderBrowser';
import FileList from './components/FileList';
import FileDetailPanel from './components/FileDetailPanel';
import BreadcrumbNav from './components/BreadcrumbNav';

interface FolderSelection {
  type: 'client' | 'project';
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
}

export default function DocsPage() {
  // State
  const [selectedClientId, setSelectedClientId] = useState<Id<"clients"> | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection | null>(null);
  const [isInboxSelected, setIsInboxSelected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);

  // Queries
  const selectedClient = useQuery(
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

  // Handlers
  const handleClientSelect = useCallback((clientId: Id<"clients"> | null) => {
    setSelectedClientId(clientId);
    setSelectedFolder(null);
    setIsInboxSelected(false);
    setSelectedDocument(null);
  }, []);

  const handleInboxSelect = useCallback(() => {
    setSelectedClientId(null);
    setSelectedFolder(null);
    setIsInboxSelected(true);
    setSelectedDocument(null);
  }, []);

  const handleFolderSelect = useCallback((folder: FolderSelection | null) => {
    setSelectedFolder(folder);
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

  const handleHomeClick = useCallback(() => {
    setSelectedClientId(null);
    setSelectedFolder(null);
    setIsInboxSelected(false);
    setSelectedDocument(null);
  }, []);

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
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/docs/queue">
            <Button variant="default" size="sm" className="relative">
              <Clock className="w-4 h-4 mr-2" />
              Review Queue
              {queueCount > 0 && (
                <Badge variant="secondary" className="ml-2 bg-white text-blue-600">
                  {queueCount}
                </Badge>
              )}
            </Button>
          </Link>
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
        />

        {/* Column 2: Folder Browser */}
        {selectedClientId && selectedClient && !isInboxSelected && (
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
          selectedFolder={selectedFolder}
          isInbox={isInboxSelected}
          onFileSelect={handleFileSelect}
        />

        {/* File Detail Panel (Slide-out) */}
        <FileDetailPanel
          document={selectedDocument}
          isOpen={isDetailPanelOpen}
          onClose={handleCloseDetailPanel}
          onDelete={handleDeleteDocument}
        />
      </div>
    </div>
  );
}
