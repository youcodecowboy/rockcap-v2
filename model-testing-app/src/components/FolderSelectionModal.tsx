'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FolderKanban, FileText, Building2 } from 'lucide-react';
import { Id } from '../../convex/_generated/dataModel';

interface FolderSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: Id<"clients"> | null;
  projects: Array<{ _id: Id<"projects">; name: string }>;
  currentProjectId: Id<"projects"> | null;
  currentIsBaseDocument: boolean;
  onSelect: (isBaseDocument: boolean, projectId: Id<"projects"> | null) => void;
}

export default function FolderSelectionModal({
  isOpen,
  onClose,
  clientId,
  projects,
  currentProjectId,
  currentIsBaseDocument,
  onSelect,
}: FolderSelectionModalProps) {
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);

  const handleConfirm = () => {
    if (selectedDestination === 'base-documents') {
      onSelect(true, null);
    } else if (selectedDestination) {
      onSelect(false, selectedDestination as Id<"projects">);
    }
    onClose();
    setSelectedDestination(null);
  };

  const destinations = [
    { id: 'base-documents', name: 'Base Documents', icon: Building2 },
    ...projects.map(p => ({ id: p._id, name: p.name, icon: FolderKanban })),
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>File Elsewhere</DialogTitle>
          <DialogDescription>
            Choose where to file this document
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
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{dest.name}</div>
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
            onClick={handleConfirm} 
            disabled={!selectedDestination}
            className="bg-black text-white hover:bg-gray-800"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

