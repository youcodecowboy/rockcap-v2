'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Building2, Building, User, FolderKanban, FileText, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type DocumentScope = 'client' | 'internal' | 'personal';

interface MoveDocumentCrossScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: Id<"documents">;
  currentScope: DocumentScope;
  currentClientId?: Id<"clients">;
  currentProjectId?: Id<"projects">;
  currentFolderId?: string;
  onMoveComplete?: () => void;
}

export default function MoveDocumentCrossScopeModal({
  isOpen,
  onClose,
  documentId,
  currentScope,
  currentClientId,
  currentProjectId,
  currentFolderId,
  onMoveComplete,
}: MoveDocumentCrossScopeModalProps) {
  const [selectedScope, setSelectedScope] = useState<DocumentScope>(currentScope);
  const [selectedClientId, setSelectedClientId] = useState<Id<"clients"> | null>(currentClientId || null);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | 'base-documents' | null>(
    currentProjectId || (currentScope === 'client' && !currentProjectId ? 'base-documents' : null)
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId || null);
  const [isMoving, setIsMoving] = useState(false);

  // Reset selections when scope changes
  useEffect(() => {
    if (selectedScope !== currentScope) {
      setSelectedClientId(null);
      setSelectedProjectId(null);
      setSelectedFolderId(null);
    }
  }, [selectedScope, currentScope]);

  // Queries
  const clients = useQuery(api.clients.list, {}) || [];
  const projects = useQuery(
    api.projects.getByClient,
    selectedScope === 'client' && selectedClientId ? { clientId: selectedClientId } : 'skip'
  ) || [];
  const internalFolders = useQuery(
    api.internalFolders.list,
    selectedScope === 'internal' ? {} : 'skip'
  ) || [];
  const personalFolders = useQuery(
    api.personalFolders.list,
    selectedScope === 'personal' ? {} : 'skip'
  ) || [];
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    selectedScope === 'client' && selectedClientId && selectedProjectId === 'base-documents'
      ? { clientId: selectedClientId }
      : 'skip'
  ) || [];
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    selectedScope === 'client' && selectedProjectId && selectedProjectId !== 'base-documents'
      ? { projectId: selectedProjectId as Id<"projects"> }
      : 'skip'
  ) || [];

  const moveDocument = useMutation(api.documents.moveDocumentCrossScope);

  // Check if current location matches selection
  const isCurrentLocation = () => {
    if (selectedScope !== currentScope) return false;
    if (selectedScope === 'client') {
      return selectedClientId === currentClientId &&
        ((selectedProjectId === 'base-documents' && !currentProjectId) ||
         (selectedProjectId === currentProjectId));
    }
    return selectedFolderId === currentFolderId;
  };

  // Can we move?
  const canMove = () => {
    if (isCurrentLocation()) return false;
    if (selectedScope === 'client') {
      return !!selectedClientId && !!selectedProjectId;
    }
    return !!selectedFolderId;
  };

  const handleMove = async () => {
    if (!canMove()) return;

    setIsMoving(true);
    try {
      const isBaseDocument = selectedProjectId === 'base-documents';
      const projectId = isBaseDocument ? undefined : (selectedProjectId as Id<"projects">);

      // Determine folder and folder type for client scope
      const targetFolderId = selectedFolderId || undefined;
      const targetFolderType: 'client' | 'project' | undefined =
        (selectedScope === 'client' && selectedFolderId)
          ? (isBaseDocument ? 'client' : 'project')
          : undefined;

      await moveDocument({
        documentId,
        targetScope: selectedScope,
        targetClientId: selectedScope === 'client' ? selectedClientId! : undefined,
        targetProjectId: projectId,
        targetIsBaseDocument: selectedScope === 'client' ? isBaseDocument : undefined,
        targetFolderId,
        targetFolderType,
      });

      onMoveComplete?.();
      onClose();
    } catch (error) {
      console.error('Failed to move document:', error);
      alert(error instanceof Error ? error.message : 'Failed to move document');
    } finally {
      setIsMoving(false);
    }
  };

  const scopeTabs = [
    { id: 'client' as const, label: 'Client Documents', icon: Building2 },
    { id: 'internal' as const, label: 'RockCap Internal', icon: Building },
    { id: 'personal' as const, label: 'Personal', icon: User },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move Document</DialogTitle>
          <DialogDescription>
            Choose where to move this document. You can move between clients, internal, or personal spaces.
          </DialogDescription>
        </DialogHeader>

        {/* Scope Tabs */}
        <div className="flex border-b border-gray-200">
          {scopeTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedScope(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors",
                  selectedScope === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Destination Selection */}
        <div className="py-4 max-h-80 overflow-y-auto">
          {selectedScope === 'client' && (
            <div className="space-y-4">
              {/* Client Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Client
                </label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {clients.map((client) => (
                    <button
                      key={client._id}
                      onClick={() => {
                        setSelectedClientId(client._id);
                        setSelectedProjectId(null);
                        setSelectedFolderId(null);
                      }}
                      className={cn(
                        "w-full text-left p-2 rounded-md text-sm transition-colors",
                        selectedClientId === client._id
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "hover:bg-gray-50 border border-transparent"
                      )}
                    >
                      {client.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project Selection */}
              {selectedClientId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Destination
                  </label>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    <button
                      onClick={() => {
                        setSelectedProjectId('base-documents');
                        setSelectedFolderId(null);
                      }}
                      className={cn(
                        "w-full text-left p-2 rounded-md text-sm transition-colors flex items-center gap-2",
                        selectedProjectId === 'base-documents'
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "hover:bg-gray-50 border border-transparent"
                      )}
                    >
                      <FileText className="w-4 h-4" />
                      Base Documents
                    </button>
                    {projects.map((project) => (
                      <button
                        key={project._id}
                        onClick={() => {
                          setSelectedProjectId(project._id);
                          setSelectedFolderId(null);
                        }}
                        className={cn(
                          "w-full text-left p-2 rounded-md text-sm transition-colors flex items-center gap-2",
                          selectedProjectId === project._id
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "hover:bg-gray-50 border border-transparent"
                        )}
                      >
                        <FolderKanban className="w-4 h-4" />
                        {project.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Folder Selection (optional) */}
              {selectedProjectId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Folder (optional)
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    <button
                      onClick={() => setSelectedFolderId(null)}
                      className={cn(
                        "w-full text-left p-2 rounded-md text-sm transition-colors",
                        selectedFolderId === null
                          ? "bg-gray-100 text-gray-700"
                          : "hover:bg-gray-50"
                      )}
                    >
                      No specific folder
                    </button>
                    {(selectedProjectId === 'base-documents' ? clientFolders : projectFolders).map((folder: any) => (
                      <button
                        key={folder._id}
                        onClick={() => setSelectedFolderId(folder.folderType)}
                        className={cn(
                          "w-full text-left p-2 rounded-md text-sm transition-colors pl-4",
                          selectedFolderId === folder.folderType
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "hover:bg-gray-50 border border-transparent"
                        )}
                      >
                        {folder.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedScope === 'internal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Internal Folder
              </label>
              <div className="space-y-1">
                {internalFolders.map((folder: any) => (
                  <button
                    key={folder._id}
                    onClick={() => setSelectedFolderId(folder.folderType)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-colors",
                      selectedFolderId === folder.folderType
                        ? "border-blue-500 bg-blue-50"
                        : currentScope === 'internal' && currentFolderId === folder.folderType
                        ? "border-gray-200 bg-gray-50 opacity-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    <div className="font-medium text-gray-900">{folder.name}</div>
                    {folder.description && (
                      <div className="text-xs text-gray-500 mt-1">{folder.description}</div>
                    )}
                    {currentScope === 'internal' && currentFolderId === folder.folderType && (
                      <div className="text-xs text-gray-500 mt-1">Current location</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedScope === 'personal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Personal Folder
              </label>
              <div className="space-y-1">
                {personalFolders.map((folder: any) => (
                  <button
                    key={folder._id}
                    onClick={() => setSelectedFolderId(folder.folderType)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-colors",
                      selectedFolderId === folder.folderType
                        ? "border-purple-500 bg-purple-50"
                        : currentScope === 'personal' && currentFolderId === folder.folderType
                        ? "border-gray-200 bg-gray-50 opacity-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    <div className="font-medium text-gray-900">{folder.name}</div>
                    {folder.description && (
                      <div className="text-xs text-gray-500 mt-1">{folder.description}</div>
                    )}
                    {currentScope === 'personal' && currentFolderId === folder.folderType && (
                      <div className="text-xs text-gray-500 mt-1">Current location</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        {canMove() && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="font-medium text-gray-700 mb-1">Moving to:</div>
            <div className="flex items-center gap-1 text-gray-600">
              {selectedScope === 'client' && (
                <>
                  <span>{clients.find(c => c._id === selectedClientId)?.name}</span>
                  <ChevronRight className="w-4 h-4" />
                  <span>
                    {selectedProjectId === 'base-documents'
                      ? 'Base Documents'
                      : projects.find(p => p._id === selectedProjectId)?.name}
                  </span>
                  {selectedFolderId && (
                    <>
                      <ChevronRight className="w-4 h-4" />
                      <span>
                        {(selectedProjectId === 'base-documents' ? clientFolders : projectFolders)
                          .find((f: any) => f.folderType === selectedFolderId)?.name}
                      </span>
                    </>
                  )}
                </>
              )}
              {selectedScope === 'internal' && (
                <>
                  <Building className="w-4 h-4" />
                  <span>RockCap Internal</span>
                  <ChevronRight className="w-4 h-4" />
                  <span>{internalFolders.find((f: any) => f.folderType === selectedFolderId)?.name}</span>
                </>
              )}
              {selectedScope === 'personal' && (
                <>
                  <User className="w-4 h-4" />
                  <span>Personal</span>
                  <ChevronRight className="w-4 h-4" />
                  <span>{personalFolders.find((f: any) => f.folderType === selectedFolderId)?.name}</span>
                </>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isMoving}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={!canMove() || isMoving}>
            {isMoving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Moving...
              </>
            ) : (
              'Move Document'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
