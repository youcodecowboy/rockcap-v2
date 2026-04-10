'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { X, Pause, Pencil, Trash2 } from 'lucide-react';

interface TaskDetailSheetProps {
  taskId: Id<'tasks'> | null;
  isOpen: boolean;
  onClose: () => void;
  variant: 'sheet' | 'panel';
}

const statusOptions = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Done' },
] as const;

export default function TaskDetailSheet({ taskId, isOpen, onClose, variant }: TaskDetailSheetProps) {
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
        <div className="flex items-center justify-center h-full text-sm text-gray-400">
          Select a task to view details
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

  const content = (
    <div className={variant === 'sheet' ? '' : 'h-full overflow-y-auto'}>
      {variant === 'sheet' && (
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-[var(--m-border)]" />
        </div>
      )}

      <div className="px-4 pb-4">
        {/* Title + close */}
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-base font-bold text-[var(--m-text-primary)] flex-1 pr-2">
            {isEditing ? (
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full border border-[var(--m-border)] rounded px-2 py-1 text-base font-bold"
              />
            ) : task.title}
          </h2>
          {variant === 'panel' && (
            <button onClick={onClose} className="text-[var(--m-text-tertiary)]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status bar */}
        <div className="flex gap-2 mb-2">
          {statusOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                task.status === opt.value
                  ? 'bg-[var(--m-accent)] text-white border-2 border-[var(--m-accent)]'
                  : 'bg-white text-[var(--m-text-secondary)] border border-[var(--m-border)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Action row */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={handlePause}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              task.status === 'paused'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-[var(--m-bg-subtle)] text-[var(--m-text-secondary)] border-[var(--m-border)]'
            }`}
          >
            <Pause className="w-3 h-3" /> Pause
          </button>
          <button
            onClick={isEditing ? saveEdit : startEditing}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--m-bg-subtle)] text-[var(--m-text-secondary)] border border-[var(--m-border)]"
          >
            <Pencil className="w-3 h-3" /> {isEditing ? 'Save' : 'Edit'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--m-bg-subtle)] text-red-600 border border-[var(--m-border)]"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-red-700 mb-2">Delete this task? This can't be undone.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg font-medium">Delete</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1 bg-white text-xs rounded-lg border font-medium">Cancel</button>
            </div>
          </div>
        )}

        {/* Structured fields */}
        <div className="border-t border-[var(--m-border-subtle)] pt-3 space-y-2">
          {[
            { label: 'Client', value: clientName || '—' },
            { label: 'Project', value: projectName || '—' },
            { label: 'Due', value: formatDate(task.dueDate) },
            { label: 'Priority', value: task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : 'Medium' },
            { label: 'Assigned', value: assigneeNames.join(', ') || '—' },
            { label: 'Created', value: formatDate(task.createdAt) },
          ].map(field => (
            <div key={field.label} className="flex justify-between py-1.5">
              <span className="text-xs text-[var(--m-text-tertiary)] font-medium">{field.label}</span>
              <span className="text-xs text-[var(--m-text-primary)] font-semibold">{field.value}</span>
            </div>
          ))}
        </div>

        {/* Description */}
        {(task.description || isEditing) && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider mb-1">Description</div>
            {isEditing ? (
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                className="w-full border border-[var(--m-border)] rounded-lg p-2 text-sm min-h-[60px]"
              />
            ) : (
              <p className="text-sm text-[var(--m-text-secondary)] leading-relaxed">{task.description}</p>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Notes</span>
          </div>
          {isEditing ? (
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Add notes..."
              className="w-full border border-[var(--m-border)] rounded-lg p-2 text-sm min-h-[60px] bg-[var(--m-bg-subtle)]"
            />
          ) : (
            <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg p-2.5 text-xs text-[var(--m-text-secondary)] min-h-[40px]">
              {task.notes || 'No notes yet'}
            </div>
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
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 max-h-[75vh] overflow-y-auto shadow-xl animate-slide-up">
        {content}
      </div>
    </>
  );
}
