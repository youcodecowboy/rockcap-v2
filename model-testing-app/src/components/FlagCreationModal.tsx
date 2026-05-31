'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Flag, Loader2, AlertCircle } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { Modal, Field, Select, Textarea, Button } from '@/components/layouts';

interface FlagCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "document" | "meeting" | "task" | "project" | "client" | "checklist_item";
  entityId: string;
  entityName: string;
  entityContext?: string;
  clientId?: string;
  projectId?: string;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function FlagCreationModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  entityContext,
  clientId,
  projectId,
}: FlagCreationModalProps) {
  const colors = useColors();
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createFlag = useMutation(api.flags.create);
  const users = useQuery(api.users.getAll);

  const resetForm = () => {
    setNote('');
    setPriority('normal');
    setAssignedTo('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!note.trim()) {
      setError('Please add a note describing the issue.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createFlag({
        entityType,
        entityId,
        note: note.trim(),
        priority,
        ...(assignedTo ? { assignedTo: assignedTo as Id<"users"> } : {}),
        ...(clientId ? { clientId: clientId as Id<"clients"> } : {}),
        ...(projectId ? { projectId: projectId as Id<"projects"> } : {}),
      });

      toast.success('Flag created successfully');
      handleClose();
    } catch (err) {
      console.error('Failed to create flag:', err);
      setError(err instanceof Error ? err.message : 'Failed to create flag. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const entityTypeLabel =
    entityType === 'checklist_item'
      ? 'Checklist Item'
      : entityType.charAt(0).toUpperCase() + entityType.slice(1);

  const priorityButton = (value: 'normal' | 'urgent', label: string) => {
    const isActive = priority === value;
    const tone = value === 'urgent' ? colors.accent.red : colors.text.primary;
    return (
      <button
        type="button"
        onClick={() => setPriority(value)}
        style={{
          flex: 1,
          padding: '7px 12px',
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 4,
          cursor: 'pointer',
          transition: 'background 100ms linear, border-color 100ms linear',
          color: isActive ? '#ffffff' : colors.text.secondary,
          background: isActive ? tone : colors.bg.card,
          border: `1px solid ${isActive ? tone : colors.border.default}`,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Create Flag"
      width={448}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant={priority === 'urgent' ? 'danger' : 'primary'}
            onClick={handleSubmit}
            disabled={isSubmitting || !note.trim()}
          >
            {isSubmitting ? (
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
            ) : (
              <>
                <Flag style={{ width: 14, height: 14 }} />
                Create Flag
              </>
            )}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Entity info header */}
        <div
          style={{
            borderRadius: 4,
            border: `1px solid ${colors.border.default}`,
            background: colors.bg.cardAlt,
            padding: 12,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.text.muted,
              marginBottom: 4,
            }}
          >
            {entityTypeLabel}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: colors.text.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entityName}
          </div>
          {entityContext && (
            <div
              style={{
                fontSize: 11,
                color: colors.text.muted,
                marginTop: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entityContext}
            </div>
          )}
        </div>

        {/* Priority toggle */}
        <Field label="Priority">
          <div style={{ display: 'flex', gap: 8 }}>
            {priorityButton('normal', 'Normal')}
            {priorityButton('urgent', 'Urgent')}
          </div>
        </Field>

        {/* Assign to */}
        <Field label="Assign to">
          <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Self (default)</option>
            {users?.map((user) => (
              <option key={user._id} value={user._id}>
                {user.name || user.email}
              </option>
            ))}
          </Select>
        </Field>

        {/* Note */}
        <Field label="Note *">
          <Textarea
            placeholder="Describe the issue or action needed…"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (error) setError(null);
            }}
            rows={4}
            style={{ resize: 'none' }}
          />
        </Field>

        {/* Error */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 4,
              fontSize: 13,
              color: colors.accent.red,
              background: `${colors.accent.red}15`,
              border: `1px solid ${colors.accent.red}40`,
            }}
          >
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
