'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button, Modal, Field, Input } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  const colors = useColors();
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

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={`Permanently delete ${entityName}?`}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={!isConfirmed || isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete Forever'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.accent.red }}>
          <AlertTriangle size={18} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>This action cannot be undone</span>
        </div>
        <p style={{ fontSize: 12, color: colors.text.secondary }}>
          This will permanently delete this {entityType} and all associated data{impactText}.{' '}
          <strong style={{ color: colors.text.primary }}>This cannot be undone.</strong>
        </p>
        <Field label={`Type ${entityName} to confirm`}>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={entityName}
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}
