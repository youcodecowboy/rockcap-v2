'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
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
import { FolderKanban, FileText } from 'lucide-react';
import { useQuery } from 'convex/react';

interface MoveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: Id<"documents">;
  currentClientId: Id<"clients">;
  currentProjectId?: Id<"projects"> | 'base-documents';
  currentIsBaseDocument?: boolean;
  onMoveComplete?: () => void;
}

export default function MoveDocumentModal({
  isOpen,
  onClose,
  documentId,
  currentClientId,
  currentProjectId,
  currentIsBaseDocument,
  onMoveComplete,
}: MoveDocumentModalProps) {
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const moveDocument = useMutation(api.documents.moveDocument);
  
  // Get all projects for this client
  const projects = useQuery(api.projects.getByClient, { clientId: currentClientId }) || [];
  
  const destinations = [
    { id: 'base-documents', name: 'Base Documents', icon: FileText },
    ...projects.map(p => ({ id: p._id, name: p.name, icon: FolderKanban })),
  ];

  const handleMove = async () => {
    if (!selectedDestination) return;

    try {
      const isBaseDocument = selectedDestination === 'base-documents';
      const projectId = isBaseDocument ? undefined : selectedDestination as Id<"projects">;
      const project = projects.find(p => p._id === projectId);
      const projectName = project?.name;

      await moveDocument({
        documentId,
        targetClientId: currentClientId,
        targetProjectId: projectId,
        targetProjectName: projectName,
        isBaseDocument,
      });

      if (onMoveComplete) {
        onMoveComplete();
      }
      onClose();
      setSelectedDestination(null);
    } catch (error) {
      console.error('Failed to move document:', error);
      alert(error instanceof Error ? error.message : 'Failed to move document');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Document</DialogTitle>
          <DialogDescription>
            Select a destination for this document. Documents can only be moved within the same client.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-2 py-4">
          {destinations.map((dest) => {
            const Icon = dest.icon;
            const isCurrentLocation = 
              (dest.id === 'base-documents' && currentIsBaseDocument) ||
              (dest.id === currentProjectId && !currentIsBaseDocument);
            
            return (
              <button
                key={dest.id}
                onClick={() => !isCurrentLocation && setSelectedDestination(dest.id)}
                disabled={isCurrentLocation}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedDestination === dest.id
                    ? 'border-blue-500 bg-blue-50'
                    : isCurrentLocation
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-gray-600" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{dest.name}</div>
                    {isCurrentLocation && (
                      <div className="text-xs text-gray-500 mt-1">Current location</div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleMove} 
            disabled={!selectedDestination}
          >
            Move Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

