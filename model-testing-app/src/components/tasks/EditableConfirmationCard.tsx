'use client';

import { useState } from 'react';
import { Calendar, Clock, MapPin, Users, Building2, FolderKanban, AlertCircle, Repeat, Bell } from 'lucide-react';

interface ParsedTask {
  title: string;
  description?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  assignedTo: string[];
  clientId?: string;
  projectId?: string;
}

interface ParsedEvent {
  title: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  location?: string;
  attendees?: string[];
  clientId?: string;
  projectId?: string;
  reminders?: { method: string; minutes: number }[];
  recurrence?: string;
  videoLink?: string;
}

interface EditableConfirmationCardProps {
  mode: 'task' | 'meeting';
  task?: ParsedTask;
  event?: ParsedEvent;
  clientName?: string;
  projectName?: string;
  assigneeNames: string[];
  onConfirm: () => void;
  onEdit: () => void;
  isCreating: boolean;
  onTaskChange?: (task: ParsedTask) => void;
  onEventChange?: (event: ParsedEvent) => void;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Not set';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function EditableConfirmationCard({
  mode,
  task,
  event,
  clientName,
  projectName,
  assigneeNames,
  onConfirm,
  onEdit,
  isCreating,
  onTaskChange,
  onEventChange,
}: EditableConfirmationCardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(mode === 'task' ? task?.title || '' : event?.title || '');

  const handleTitleSave = () => {
    setEditingTitle(false);
    if (mode === 'task' && task && onTaskChange) {
      onTaskChange({ ...task, title: titleValue });
    } else if (mode === 'meeting' && event && onEventChange) {
      onEventChange({ ...event, title: titleValue });
    }
  };

  const priorityColors: Record<string, string> = {
    high: 'text-red-700 bg-red-50',
    medium: 'text-amber-700 bg-amber-50',
    low: 'text-blue-700 bg-blue-50',
  };

  const cyclePriority = () => {
    if (mode !== 'task' || !task || !onTaskChange) return;
    const order: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(task.priority) + 1) % 3];
    onTaskChange({ ...task, priority: next });
  };

  return (
    <div className="mx-4 mb-4">
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <div className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-[0.05em]">
            {mode === 'task' ? 'New Task' : 'New Meeting'}
          </div>
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
              className="w-full text-[16px] font-semibold text-[var(--m-text-primary)] bg-transparent border-b border-[var(--m-accent)] outline-none mt-1 pb-1"
            />
          ) : (
            <h3
              onClick={() => setEditingTitle(true)}
              className="text-[16px] font-semibold text-[var(--m-text-primary)] mt-1 cursor-pointer"
            >
              {titleValue || 'Tap to set title'}
            </h3>
          )}
        </div>

        <div className="px-4 pb-3 space-y-2">
          <div className="flex items-center gap-3 py-1.5">
            <Calendar className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[13px] text-[var(--m-text-secondary)]">
              {mode === 'task'
                ? formatDate(task?.dueDate)
                : event?.startTime ? `${formatDate(event.startTime)} · ${formatTime(event.startTime)}` : 'Not set'
              }
            </span>
          </div>

          {mode === 'meeting' && event?.endTime && (
            <div className="flex items-center gap-3 py-1.5">
              <Clock className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)]">
                {formatTime(event.startTime)} – {formatTime(event.endTime)}
              </span>
            </div>
          )}

          {mode === 'meeting' && (
            <div className="flex items-center gap-3 py-1.5">
              <MapPin className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)]">
                {event?.location || 'No location'}
              </span>
            </div>
          )}

          {mode === 'task' && task && (
            <button onClick={cyclePriority} className="flex items-center gap-3 py-1.5 w-full text-left">
              <AlertCircle className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className={`text-[13px] font-medium px-2 py-0.5 rounded ${priorityColors[task.priority]}`}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
            </button>
          )}

          <div className="flex items-center gap-3 py-1.5">
            <Building2 className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[13px] text-[var(--m-text-secondary)]">{clientName || 'Personal'}</span>
          </div>

          <div className="flex items-center gap-3 py-1.5">
            <FolderKanban className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[13px] text-[var(--m-text-secondary)]">{projectName || '—'}</span>
          </div>

          <div className="flex items-center gap-3 py-1.5">
            <Users className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[13px] text-[var(--m-text-secondary)]">
              {assigneeNames.length > 0 ? assigneeNames.join(', ') : 'You'}
            </span>
          </div>

          {mode === 'meeting' && event?.recurrence && (
            <div className="flex items-center gap-3 py-1.5">
              <Repeat className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)]">{event.recurrence}</span>
            </div>
          )}

          {mode === 'meeting' && event?.reminders && event.reminders.length > 0 && (
            <div className="flex items-center gap-3 py-1.5">
              <Bell className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)]">
                {event.reminders.map(r => `${r.minutes}min ${r.method}`).join(', ')}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={onEdit}
            disabled={isCreating}
            className="flex-1 py-2.5 text-[13px] font-medium text-[var(--m-text-secondary)] border border-[var(--m-border)] rounded-lg active:bg-[var(--m-bg-subtle)] disabled:opacity-50"
          >
            Edit with AI
          </button>
          <button
            onClick={onConfirm}
            disabled={isCreating}
            className="flex-[2] py-2.5 text-[13px] font-medium text-[var(--m-text-on-brand)] bg-[var(--m-bg-brand)] rounded-lg active:opacity-80 disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : mode === 'task' ? 'Create Task' : 'Create Meeting'}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { ParsedTask, ParsedEvent };
