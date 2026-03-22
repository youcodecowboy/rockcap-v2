'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface PermanentDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'client' | 'project';
  entityName: string;
  entityId: string;
  relatedCounts?: { documents?: number; projects?: number; tasks?: number };
  onDeleted: () => void;
}

export default function PermanentDeleteModal({
  isOpen,
  onClose,
  entityType,
  entityName,
  entityId,
  relatedCounts,
  onDeleted,
}: PermanentDeleteModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteClient = useMutation(api.clients.permanentDelete);
  const deleteProject = useMutation(api.projects.permanentDelete);

  const isConfirmed = confirmText === entityName;

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    try {
      if (entityType === 'client') {
        await deleteClient({ id: entityId as Id<'clients'> });
      } else {
        await deleteProject({ id: entityId as Id<'projects'> });
      }
      toast.success(`${entityName} permanently deleted`);
      setConfirmText('');
      onClose();
      onDeleted();
    } catch (error) {
      console.error('Permanent delete failed:', error);
      toast.error('Failed to permanently delete. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const impactParts: string[] = [];
  if (relatedCounts?.documents) impactParts.push(`${relatedCounts.documents} documents`);
  if (relatedCounts?.projects) impactParts.push(`${relatedCounts.projects} projects`);
  if (relatedCounts?.tasks) impactParts.push(`${relatedCounts.tasks} tasks`);
  const impactText = impactParts.length > 0
    ? ` including ${impactParts.join(', ')}`
    : '';

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) { setConfirmText(''); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-red-600 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <AlertDialogTitle className="text-red-600">
              Permanently delete {entityName}?
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This will permanently delete this {entityType} and all associated data{impactText}. <strong>This cannot be undone.</strong>
              </p>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">
                  Type <strong>{entityName}</strong> to confirm:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={entityName}
                  autoFocus
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Forever'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
