'use client';

import { useState, useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import FolderBrowser from '@/app/(desktop)/docs/components/FolderBrowser';
import FileList from '@/app/(desktop)/docs/components/FileList';
import FileDetailPanel from '@/app/(desktop)/docs/components/FileDetailPanel';
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
  uploaderInitials?: string;
  isInternal?: boolean;
}

interface ClientDocumentLibraryProps {
  clientId: Id<"clients">;
  clientName: string;
  clientType?: string;
  compact?: boolean; // For embedding in smaller spaces
}

export default function ClientDocumentLibrary({
  clientId,
  clientName,
  clientType,
  compact = false,
}: ClientDocumentLibraryProps) {
  const updateClient = useMutation(api.clients.update);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);

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
    setTimeout(() => setSelectedDocument(null), 300);
  }, []);

  return (
    <div className={`flex ${compact ? 'h-[500px]' : 'h-full'} overflow-hidden bg-white`}>
      {/* Folder Browser */}
      <FolderBrowser
        clientId={clientId}
        clientName={clientName}
        clientType={clientType}
        selectedFolder={selectedFolder}
        onFolderSelect={handleFolderSelect}
        onClientTypeChange={(newType) => updateClient({ id: clientId, type: newType })}
      />

      {/* File List */}
      <FileList
        clientId={clientId}
        clientName={clientName}
        clientType={clientType}
        selectedFolder={selectedFolder}
        onFileSelect={handleFileSelect}
      />

      {/* File Detail Panel */}
      {selectedDocument && (
        <FileDetailPanel
          document={selectedDocument}
          isOpen={isDetailPanelOpen}
          onClose={handleCloseDetailPanel}
          onDelete={handleCloseDetailPanel}
        />
      )}
    </div>
  );
}
