'use client';

import { useState, useCallback } from 'react';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import FolderBrowser from '@/app/docs/components/FolderBrowser';
import FileList from '@/app/docs/components/FileList';
import FileDetailPanel from '@/app/docs/components/FileDetailPanel';

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
}

interface ProjectDocumentsTabProps {
  projectId: Id<"projects">;
  clientId: Id<"clients">;
  clientName: string;
  clientType?: string;
}

export default function ProjectDocumentsTab({
  projectId,
  clientId,
  clientName,
  clientType,
}: ProjectDocumentsTabProps) {
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
    <div className="flex h-full overflow-hidden bg-white">
      {/* Folder Browser */}
      <FolderBrowser
        clientId={clientId}
        clientName={clientName}
        clientType={clientType}
        selectedFolder={selectedFolder}
        onFolderSelect={handleFolderSelect}
        projectFilter={projectId}
      />

      {/* File List */}
      <FileList
        clientId={clientId}
        clientName={clientName}
        clientType={clientType}
        selectedFolder={selectedFolder}
        onFileSelect={handleFileSelect}
        projectFilter={projectId}
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
