'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { X, Pause, Pencil, Trash2, Save } from 'lucide-react';
import { Button, IconButton, Field, Input, Textarea, Row, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

interface TaskDetailSheetProps {
  taskId: Id<'tasks'> | null;
  isOpen: boolean;
  onClose: () => void;
  variant: 'sheet' | 'panel';
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const statusOptions = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Done' },
] as const;

export default function TaskDetailSheet({ taskId, isOpen, onClose, variant }: TaskDetailSheetProps) {
  const colors = useColors();
  const task = useQuery(api.tasks.get, taskId ? { id: taskId } : 'skip');
  const updateTask = useMutation(api.tasks.update);
  const removeTask = useMutation(api.tasks.remove);
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const allUsers = useQuery(api.users.getAll, {});

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!task || !isOpen) {
    if (variant === 'panel') {
      return (
        <div className="flex items-center justify-center h-full" style={{ padding: 24 }}>
          <EmptyState title="Select a task to view details" />
        </div>
      );
    }
    return null;
  }

  const clientName = task.clientId ? clients?.find(c => c._id === task.clientId)?.name : undefined;
  const projectName = task.projectId ? projects?.find(p => p._id === task.projectId)?.name : undefined;
  const assigneeNames = task.assignedTo
    ? (Array.isArray(task.assignedTo)
        ? task.assignedTo.map(id => {
            const u = allUsers?.find(u => u._id === id);
            return u?.name || u?.email || 'Unknown';
          })
        : [allUsers?.find(u => u._id === (task.assignedTo as any))?.name || 'Unknown']
      )
    : [];

  const handleStatusChange = async (newStatus: string) => {
    await updateTask({ id: task._id, status: newStatus as any });
  };

  const handlePause = async () => {
    await updateTask({ id: task._id, status: 'paused' });
  };

  const handleDelete = async () => {
    await removeTask({ id: task._id });
    onClose();
  };

  const startEditing = () => {
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditNotes(task.notes || '');
    setIsEditing(true);
  };

  const saveEdit = async () => {
    await updateTask({
      id: task._id,
      title: editTitle || undefined,
      description: editDescription || undefined,
      notes: editNotes || undefined,
    });
    setIsEditing(false);
  };

  const formatDate = (d?: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const sectionLabel = (text: string) => (
    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500, marginBottom: 6 }}>
      {text}
    </div>
  );

  const content = (
    <div className={variant === 'sheet' ? '' : 'h-full overflow-y-auto'}>
      {variant === 'sheet' && (
        <div className="flex justify-center" style={{ paddingTop: 12, paddingBottom: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: colors.border.mid }} />
        </div>
      )}

      <div style={{ padding: 16 }}>
        {/* Title + close */}
        <div className="flex items-start justify-between" style={{ marginBottom: 12 }}>
          <div className="flex-1" style={{ paddingRight: 8 }}>
            {isEditing ? (
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            ) : (
              <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary }}>{task.title}</h2>
            )}
          </div>
          {variant === 'panel' && (
            <IconButton label="Close" onClick={onClose}>
              <X size={16} />
            </IconButton>
          )}
        </div>

        {/* Status bar */}
        <div className="flex gap-2" style={{ marginBottom: 8 }}>
          {statusOptions.map(opt => {
            const active = task.status === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 3,
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 100ms linear',
                  border: `1px solid ${active ? colors.accent.blue : colors.border.default}`,
                  background: active ? `${colors.accent.blue}20` : colors.bg.card,
                  color: active ? colors.accent.blue : colors.text.secondary,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Action row */}
        <div className="flex gap-2" style={{ marginBottom: 16 }}>
          <Button variant="secondary" size="sm" onClick={handlePause} accent={colors.accent.yellow}
            style={task.status === 'paused' ? { background: `${colors.accent.yellow}20`, borderColor: `${colors.accent.yellow}40`, color: colors.accent.yellow } : undefined}>
            <Pause size={12} /> Pause
          </Button>
          <Button variant="secondary" size="sm" onClick={isEditing ? saveEdit : startEditing}>
            {isEditing ? <Save size={12} /> : <Pencil size={12} />} {isEditing ? 'Save' : 'Edit'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(true)} style={{ color: colors.accent.red }}>
            <Trash2 size={12} /> Delete
          </Button>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div style={{ background: `${colors.accent.red}15`, border: `1px solid ${colors.accent.red}40`, borderRadius: 4, padding: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 11, color: colors.accent.red, marginBottom: 8 }}>Delete this task? This can't be undone.</p>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={handleDelete}>Delete</Button>
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Structured fields */}
        <div style={{ borderTop: `1px solid ${colors.border.light}`, paddingTop: 12 }}>
          <Row label="Client" value={clientName || '—'} />
          <Row label="Project" value={projectName || '—'} />
          <Row label="Due" value={formatDate(task.dueDate)} mono />
          <Row label="Priority" value={task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : 'Medium'} />
          <Row label="Assigned" value={assigneeNames.join(', ') || '—'} />
          <Row label="Created" value={formatDate(task.createdAt)} mono />
        </div>

        {/* Description */}
        {(task.description || isEditing) && (
          <div style={{ marginTop: 16 }}>
            {isEditing ? (
              <Field label="Description">
                <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
              </Field>
            ) : (
              <>
                {sectionLabel('Description')}
                <p style={{ fontSize: 12, color: colors.text.secondary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{task.description}</p>
              </>
            )}
          </div>
        )}

        {/* Notes */}
        <div style={{ marginTop: 16 }}>
          {isEditing ? (
            <Field label="Notes">
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Add notes..." rows={3} />
            </Field>
          ) : (
            <>
              {sectionLabel('Notes')}
              <div style={{ background: colors.bg.cardAlt, border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 10, fontSize: 12, color: colors.text.secondary, minHeight: 40 }}>
                {task.notes || 'No notes yet'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (variant === 'panel') {
    return content;
  }

  // Sheet mode
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 overflow-y-auto animate-slide-up"
        style={{
          background: colors.bg.card,
          borderTop: `1px solid ${colors.border.default}`,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          maxHeight: '75vh',
        }}
      >
        {content}
      </div>
    </>
  );
}
