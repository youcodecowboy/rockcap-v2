'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, FolderInput, Building2, FolderKanban } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type DestinationType = 'project' | 'client';

interface BulkMoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentIds: string[];
  currentClientId?: Id<'clients'>;
  currentProjectId?: Id<'projects'>;
  onMoveComplete?: () => void;
}

export default function BulkMoveModal({
  isOpen,
  onClose,
  documentIds,
  currentClientId,
  currentProjectId,
  onMoveComplete,
}: BulkMoveModalProps) {
  const [selectedClientId, setSelectedClientId] = useState<Id<'clients'> | null>(
    currentClientId || null
  );
  const [destinationType, setDestinationType] = useState<DestinationType>('project');
  const [selectedProjectId, setSelectedProjectId] = useState<Id<'projects'> | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedClientId(currentClientId || null);
      setDestinationType('project');
      setSelectedProjectId(null);
      setSelectedFolderId(null);
    }
  }, [isOpen, currentClientId]);

  // Reset downstream selections when client changes
  useEffect(() => {
    setSelectedProjectId(null);
    setSelectedFolderId(null);
  }, [selectedClientId]);

  // Reset folder when project changes
  useEffect(() => {
    setSelectedFolderId(null);
  }, [selectedProjectId]);

  // Reset project and folder when destination type changes
  useEffect(() => {
    setSelectedProjectId(null);
    setSelectedFolderId(null);
  }, [destinationType]);

  // Queries
  const clients = useQuery(api.clients.list, {}) || [];
  const projects = useQuery(
    api.projects.getByClient,
    selectedClientId ? { clientId: selectedClientId } : 'skip'
  ) || [];
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    destinationType === 'client' && selectedClientId
      ? { clientId: selectedClientId }
      : 'skip'
  ) || [];
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    destinationType === 'project' && selectedProjectId
      ? { projectId: selectedProjectId }
      : 'skip'
  ) || [];

  const bulkMove = useMutation(api.documents.bulkMove);

  const activeFolders = destinationType === 'client' ? clientFolders : projectFolders;

  const canMove =
    !!selectedClientId &&
    !!selectedFolderId &&
    (destinationType === 'client' || !!selectedProjectId);

  const handleMove = async () => {
    if (!canMove || !selectedClientId || !selectedFolderId) return;

    setIsMoving(true);
    try {
      const result = await bulkMove({
        documentIds: documentIds as Id<'documents'>[],
        targetScope: 'client',
        targetClientId: selectedClientId,
        targetProjectId:
          destinationType === 'project' && selectedProjectId ? selectedProjectId : undefined,
        targetFolderId: selectedFolderId,
        targetFolderType: destinationType,
      });

      toast.success(
        `Successfully moved ${(result as any)?.movedCount ?? documentIds.length} document${documentIds.length !== 1 ? 's' : ''}`
      );
      onMoveComplete?.();
      onClose();
    } catch (error) {
      console.error('Failed to bulk move documents:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to move documents');
    } finally {
      setIsMoving(false);
    }
  };

  const selectedClient = clients.find((c) => c._id === selectedClientId);
  const selectedProject = projects.find((p) => p._id === selectedProjectId);
  const selectedFolder = activeFolders.find((f: any) => f.folderType === selectedFolderId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="w-5 h-5" />
            Move {documentIds.length} Document{documentIds.length !== 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            Choose a destination to move the selected documents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Client Selector */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Client
            </Label>
            <Select
              value={selectedClientId ?? ''}
              onValueChange={(val) => setSelectedClientId(val as Id<'clients'>)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a client..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client._id} value={client._id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destination Type Toggle */}
          {selectedClientId && (
            <div className="space-y-1.5">
              <Label>Destination Type</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDestinationType('project')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md border text-sm font-medium transition-colors',
                    destinationType === 'project'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <FolderKanban className="w-4 h-4" />
                  Project Folder
                </button>
                <button
                  type="button"
                  onClick={() => setDestinationType('client')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md border text-sm font-medium transition-colors',
                    destinationType === 'client'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <Building2 className="w-4 h-4" />
                  Client Folder
                </button>
              </div>
            </div>
          )}

          {/* Project Selector (only for project destination type) */}
          {selectedClientId && destinationType === 'project' && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <FolderKanban className="w-3.5 h-3.5" />
                Project
              </Label>
              <Select
                value={selectedProjectId ?? ''}
                onValueChange={(val) => setSelectedProjectId(val as Id<'projects'>)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Folder Selector */}
          {selectedClientId &&
            (destinationType === 'client' || selectedProjectId) &&
            activeFolders.length > 0 && (
              <div className="space-y-1.5">
                <Label>Folder</Label>
                <div className="max-h-44 overflow-y-auto space-y-1 rounded-md border border-gray-200 p-1">
                  {activeFolders.map((folder: any) => (
                    <button
                      key={folder._id}
                      type="button"
                      onClick={() => setSelectedFolderId(folder.folderType)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                        selectedFolderId === folder.folderType
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      )}
                    >
                      {folder.name}
                      {folder.description && (
                        <span className="ml-2 text-xs text-gray-400">{folder.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* No folders available message */}
          {selectedClientId &&
            (destinationType === 'client' || selectedProjectId) &&
            activeFolders.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-2">
                No folders available for this destination.
              </p>
            )}

          {/* Summary */}
          {canMove && selectedClient && selectedFolder && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="font-medium text-gray-700 mb-1">Moving to:</div>
              <div className="text-gray-600">
                {selectedClient.name}
                {destinationType === 'project' && selectedProject && (
                  <> &rsaquo; {selectedProject.name}</>
                )}
                {' '}&rsaquo; {selectedFolder.name}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isMoving}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={!canMove || isMoving}>
            {isMoving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Moving...
              </>
            ) : (
              `Move ${documentIds.length} Document${documentIds.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
