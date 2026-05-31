'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import PermanentDeleteModal from './PermanentDeleteModal';
import { useColors } from '@/lib/useColors';
import { Button } from '@/components/layouts';

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
  const colors = useColors();
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '12px 16px',
          background: `${colors.accent.yellow}15`,
          borderLeft: `3px solid ${colors.accent.yellow}`,
          border: `1px solid ${colors.accent.yellow}40`,
          borderRadius: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.text.primary }}>
          <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, color: colors.accent.yellow }} />
          <span>
            This {entityType} was moved to trash on {formattedDate}.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Button variant="primary" size="sm" onClick={handleRestore} disabled={isRestoring}>
            {isRestoring ? 'Restoring…' : 'Restore'}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowPermanentDelete(true)}>
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
