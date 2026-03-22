'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import PermanentDeleteModal from './PermanentDeleteModal';

interface RestorationBannerProps {
  entityType: 'client' | 'project';
  entityName: string;
  entityId: string;
  deletedAt?: string;
  relatedCounts?: { documents?: number; projects?: number; tasks?: number };
  onRestored?: () => void;
  onPermanentlyDeleted?: () => void;
}

export default function RestorationBanner({
  entityType,
  entityName,
  entityId,
  deletedAt,
  relatedCounts,
  onRestored,
  onPermanentlyDeleted,
}: RestorationBannerProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [showPermanentDelete, setShowPermanentDelete] = useState(false);

  const restoreClient = useMutation(api.clients.restore);
  const restoreProject = useMutation(api.projects.restore);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      if (entityType === 'client') {
        await restoreClient({ id: entityId as Id<'clients'> });
      } else {
        await restoreProject({ id: entityId as Id<'projects'> });
      }
      toast.success(`${entityName} restored`);
      onRestored?.();
    } catch (error) {
      console.error('Restore failed:', error);
      toast.error('Failed to restore. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  const formattedDate = deletedAt
    ? new Date(deletedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'an unknown date';

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            This {entityType} was moved to trash on {formattedDate}.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            onClick={handleRestore}
            disabled={isRestoring}
            className="h-7 text-xs"
          >
            {isRestoring ? 'Restoring...' : 'Restore'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 text-xs"
            onClick={() => setShowPermanentDelete(true)}
          >
            Delete Permanently
          </Button>
        </div>
      </div>

      <PermanentDeleteModal
        isOpen={showPermanentDelete}
        onClose={() => setShowPermanentDelete(false)}
        entityType={entityType}
        entityName={entityName}
        entityId={entityId}
        relatedCounts={relatedCounts}
        onDeleted={() => onPermanentlyDeleted?.()}
      />
    </>
  );
}
