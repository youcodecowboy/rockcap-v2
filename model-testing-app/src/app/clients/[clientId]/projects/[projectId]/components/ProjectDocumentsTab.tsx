'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Upload,
  Briefcase,
} from 'lucide-react';
import FolderBrowser from '@/app/docs/components/FolderBrowser';
import FileList from '@/app/docs/components/FileList';
import FileDetailPanel from '@/app/docs/components/FileDetailPanel';

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

interface ProjectDocumentsTabProps {
  projectId: Id<"projects">;
  clientId: Id<"clients">;
  clientRoles: any[];
}

export default function ProjectDocumentsTab({
  projectId,
  clientId,
  clientRoles,
}: ProjectDocumentsTabProps) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set([clientId]));
  const [selectedClient, setSelectedClient] = useState<Id<"clients"> | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);

  // Get all clients
  const allClients = useQuery(api.clients.list, {}) || [];
  
  // Get documents for this project
  const projectDocuments = useQuery(api.documents.getByProject, { projectId }) || [];

  // Map client roles to full client data
  const clientsWithRoles = useMemo(() => {
    // Start with the main client
    const mainClient = allClients.find((c: any) => c._id === clientId);
    const clients: any[] = [];
    
    if (mainClient) {
      clients.push({
        client: mainClient,
        role: 'Primary',
        isPrimary: true,
      });
    }

    // Add other clients from client roles
    clientRoles.forEach((role: any) => {
      const roleClientId = (role.clientId as any)?._id || role.clientId;
      if (roleClientId !== clientId) {
        const clientData = allClients.find((c: any) => c._id === roleClientId);
        if (clientData) {
          clients.push({
            client: clientData,
            role: role.role || clientData.type || 'Associated',
            isPrimary: false,
          });
        }
      }
    });

    return clients;
  }, [clientRoles, allClients, clientId]);

  // Group documents by client
  const documentsByClient = useMemo(() => {
    const groups: Record<string, any[]> = {};
    
    // Initialize groups for all associated clients
    clientsWithRoles.forEach((cr: any) => {
      groups[cr.client._id] = [];
    });

    // Group documents
    projectDocuments.forEach((doc: any) => {
      const docClientId = doc.clientId;
      if (docClientId && groups[docClientId]) {
        groups[docClientId].push(doc);
      }
    });

    return groups;
  }, [projectDocuments, clientsWithRoles]);

  const toggleClient = (cId: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(cId)) {
      newExpanded.delete(cId);
      if (selectedClient === cId) {
        setSelectedClient(null);
        setSelectedFolder(null);
      }
    } else {
      newExpanded.add(cId);
      setSelectedClient(cId as Id<"clients">);
    }
    setExpandedClients(newExpanded);
  };

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

  const getRoleBadgeClass = (role: string) => {
    const r = role.toLowerCase();
    if (r === 'borrower' || r === 'primary') {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    if (r === 'lender') {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // If no clients, show empty state
  if (clientsWithRoles.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Associated Clients</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Add clients to this project to manage their documents.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 mb-4">
        Documents are organized by the client they belong to. Expand a client section to browse and manage their project folders.
      </p>

      {clientsWithRoles.map((clientRole: any) => {
        const cId = clientRole.client._id;
        const isExpanded = expandedClients.has(cId);
        const docs = documentsByClient[cId] || [];
        const isActiveClient = selectedClient === cId;

        return (
          <Card key={cId} className="overflow-hidden">
            {/* Client Header */}
            <button
              onClick={() => toggleClient(cId)}
              className="w-full flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                clientRole.client.type?.toLowerCase() === 'lender' 
                  ? 'bg-blue-100' 
                  : 'bg-green-100'
              }`}>
                <Building2 className={`w-6 h-6 ${
                  clientRole.client.type?.toLowerCase() === 'lender'
                    ? 'text-blue-600'
                    : 'text-green-600'
                }`} />
              </div>
              
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {clientRole.client.name}
                  </h3>
                  <Badge className={getRoleBadgeClass(clientRole.role)}>
                    {clientRole.role}
                  </Badge>
                  {clientRole.isPrimary && (
                    <Badge variant="outline" className="text-xs">Primary</Badge>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {docs.length} document{docs.length !== 1 ? 's' : ''} in this project
                </p>
              </div>

              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              )}
            </button>

            {/* Expanded Content - Document Browser */}
            {isExpanded && (
              <div className="border-t border-gray-200">
                <div className="flex h-[500px]">
                  {/* Folder Browser for this client */}
                  <FolderBrowser
                    clientId={cId as Id<"clients">}
                    clientName={clientRole.client.name}
                    clientType={clientRole.client.type}
                    selectedFolder={isActiveClient ? selectedFolder : null}
                    onFolderSelect={(folder) => {
                      setSelectedClient(cId as Id<"clients">);
                      handleFolderSelect(folder);
                    }}
                  />

                  {/* File List */}
                  {isActiveClient && selectedFolder ? (
                    <FileList
                      clientId={cId as Id<"clients">}
                      clientName={clientRole.client.name}
                      clientType={clientRole.client.type}
                      selectedFolder={selectedFolder}
                      onFileSelect={handleFileSelect}
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center bg-gray-50">
                      <div className="text-center">
                        <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-1">Select a folder</h3>
                        <p className="text-sm text-gray-500 max-w-xs">
                          Choose a folder from {clientRole.client.name}'s project folders to view documents
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}

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
