'use client';

import { useState } from 'react';
import { Calendar, Clock, MapPin, Users, Building2, FolderKanban, AlertCircle, Repeat, Bell, ChevronDown, X } from 'lucide-react';

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

interface ClientOption {
  _id: string;
  name: string;
}

interface ProjectOption {
  _id: string;
  name: string;
  clientRoles?: { clientId: string }[];
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
  clients?: ClientOption[];
  projects?: ProjectOption[];
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

function toDateInputValue(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().split('T')[0];
}

function toTimeInputValue(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type EditingField = null | 'title' | 'date' | 'time' | 'location' | 'client' | 'project' | 'description';

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
  clients,
  projects,
}: EditableConfirmationCardProps) {
  const [editing, setEditing] = useState<EditingField>(null);

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

  const updateTaskDate = (dateStr: string) => {
    if (!task || !onTaskChange) return;
    if (!dateStr) { onTaskChange({ ...task, dueDate: undefined }); return; }
    // Preserve existing time if present, otherwise set to end of day
    const existing = task.dueDate ? new Date(task.dueDate) : null;
    const newDate = new Date(dateStr);
    if (existing) {
      newDate.setHours(existing.getHours(), existing.getMinutes());
    } else {
      newDate.setHours(17, 0, 0, 0);
    }
    onTaskChange({ ...task, dueDate: newDate.toISOString() });
    setEditing(null);
  };

  const updateEventDate = (dateStr: string) => {
    if (!event || !onEventChange) return;
    if (!dateStr) return;
    const existingStart = event.startTime ? new Date(event.startTime) : new Date();
    const newStart = new Date(dateStr);
    newStart.setHours(existingStart.getHours(), existingStart.getMinutes());
    const duration = event.duration || 60;
    const newEnd = new Date(newStart.getTime() + duration * 60000);
    onEventChange({ ...event, startTime: newStart.toISOString(), endTime: newEnd.toISOString() });
    setEditing(null);
  };

  const updateEventTime = (timeStr: string) => {
    if (!event || !onEventChange || !timeStr) return;
    const [hours, minutes] = timeStr.split(':').map(Number);
    const start = event.startTime ? new Date(event.startTime) : new Date();
    start.setHours(hours, minutes, 0, 0);
    const duration = event.duration || 60;
    const end = new Date(start.getTime() + duration * 60000);
    onEventChange({ ...event, startTime: start.toISOString(), endTime: end.toISOString() });
    setEditing(null);
  };

  const updateLocation = (loc: string) => {
    if (!event || !onEventChange) return;
    onEventChange({ ...event, location: loc || undefined });
    setEditing(null);
  };

  const updateClient = (clientId: string) => {
    if (mode === 'task' && task && onTaskChange) {
      onTaskChange({ ...task, clientId: clientId || undefined, projectId: undefined });
    } else if (mode === 'meeting' && event && onEventChange) {
      onEventChange({ ...event, clientId: clientId || undefined, projectId: undefined });
    }
    setEditing(null);
  };

  const updateProject = (projectId: string) => {
    if (mode === 'task' && task && onTaskChange) {
      onTaskChange({ ...task, projectId: projectId || undefined });
    } else if (mode === 'meeting' && event && onEventChange) {
      onEventChange({ ...event, projectId: projectId || undefined });
    }
    setEditing(null);
  };

  const activeClientId = mode === 'task' ? task?.clientId : event?.clientId;
  const activeProjectId = mode === 'task' ? task?.projectId : event?.projectId;
  const filteredProjects = projects?.filter(p =>
    !activeClientId || p.clientRoles?.some(r => r.clientId === activeClientId)
  );

  const resolvedClientName = activeClientId
    ? clients?.find(c => c._id === activeClientId)?.name || clientName
    : clientName;
  const resolvedProjectName = activeProjectId
    ? projects?.find(p => p._id === activeProjectId)?.name || projectName
    : projectName;

  return (
    <div className="mx-4 mb-4">
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] overflow-hidden">
        {/* Header + Title */}
        <div className="px-4 pt-4 pb-2">
          <div className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-[0.05em]">
            {mode === 'task' ? 'New Task' : 'New Meeting'}
          </div>
          {editing === 'title' ? (
            <input
              autoFocus
              defaultValue={mode === 'task' ? task?.title : event?.title}
              onBlur={e => {
                const val = e.target.value;
                if (mode === 'task' && task && onTaskChange) onTaskChange({ ...task, title: val });
                else if (mode === 'meeting' && event && onEventChange) onEventChange({ ...event, title: val });
                setEditing(null);
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-full text-[16px] font-semibold text-[var(--m-text-primary)] bg-transparent border-b border-[var(--m-accent)] outline-none mt-1 pb-1"
            />
          ) : (
            <h3
              onClick={() => setEditing('title')}
              className="text-[16px] font-semibold text-[var(--m-text-primary)] mt-1"
            >
              {(mode === 'task' ? task?.title : event?.title) || 'Tap to set title'}
            </h3>
          )}
        </div>

        <div className="px-4 pb-3 space-y-0.5">
          {/* Date */}
          {editing === 'date' ? (
            <div className="py-2">
              <input
                type="date"
                autoFocus
                defaultValue={toDateInputValue(mode === 'task' ? task?.dueDate : event?.startTime)}
                onChange={e => mode === 'task' ? updateTaskDate(e.target.value) : updateEventDate(e.target.value)}
                onBlur={() => setEditing(null)}
                className="w-full text-[14px] text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg px-3 py-2 bg-transparent outline-none"
              />
            </div>
          ) : (
            <button onClick={() => setEditing('date')} className="flex items-center gap-3 py-2 w-full text-left">
              <Calendar className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)] flex-1">
                {mode === 'task'
                  ? formatDate(task?.dueDate)
                  : event?.startTime ? formatDate(event.startTime) : 'Not set'
                }
              </span>
              <ChevronDown className="w-3 h-3 text-[var(--m-text-placeholder)]" />
            </button>
          )}

          {/* Time (meetings) */}
          {mode === 'meeting' && (
            editing === 'time' ? (
              <div className="py-2">
                <input
                  type="time"
                  autoFocus
                  defaultValue={toTimeInputValue(event?.startTime)}
                  onChange={e => updateEventTime(e.target.value)}
                  onBlur={() => setEditing(null)}
                  className="w-full text-[14px] text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg px-3 py-2 bg-transparent outline-none"
                />
              </div>
            ) : (
              <button onClick={() => setEditing('time')} className="flex items-center gap-3 py-2 w-full text-left">
                <Clock className="w-4 h-4 text-[var(--m-text-tertiary)]" />
                <span className="text-[13px] text-[var(--m-text-secondary)] flex-1">
                  {event?.startTime && event?.endTime
                    ? `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`
                    : 'Set time'
                  }
                </span>
                <ChevronDown className="w-3 h-3 text-[var(--m-text-placeholder)]" />
              </button>
            )
          )}

          {/* Location (meetings) */}
          {mode === 'meeting' && (
            editing === 'location' ? (
              <div className="py-2">
                <input
                  type="text"
                  autoFocus
                  defaultValue={event?.location || ''}
                  placeholder="Enter location..."
                  onBlur={e => updateLocation(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-full text-[14px] text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg px-3 py-2 bg-transparent outline-none"
                />
              </div>
            ) : (
              <button onClick={() => setEditing('location')} className="flex items-center gap-3 py-2 w-full text-left">
                <MapPin className="w-4 h-4 text-[var(--m-text-tertiary)]" />
                <span className="text-[13px] text-[var(--m-text-secondary)] flex-1">
                  {event?.location || 'Add location'}
                </span>
                <ChevronDown className="w-3 h-3 text-[var(--m-text-placeholder)]" />
              </button>
            )
          )}

          {/* Priority (tasks) */}
          {mode === 'task' && task && (
            <button onClick={cyclePriority} className="flex items-center gap-3 py-2 w-full text-left">
              <AlertCircle className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className={`text-[13px] font-medium px-2 py-0.5 rounded ${priorityColors[task.priority]}`}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
            </button>
          )}

          {/* Client */}
          {editing === 'client' ? (
            <div className="py-2">
              <select
                autoFocus
                value={activeClientId || ''}
                onChange={e => updateClient(e.target.value)}
                onBlur={() => setEditing(null)}
                className="w-full text-[14px] text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg px-3 py-2 bg-[var(--m-bg-card)] outline-none"
              >
                <option value="">Personal (no client)</option>
                {clients?.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <button onClick={() => setEditing('client')} className="flex items-center gap-3 py-2 w-full text-left">
              <Building2 className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)] flex-1">{resolvedClientName || 'Personal'}</span>
              <ChevronDown className="w-3 h-3 text-[var(--m-text-placeholder)]" />
            </button>
          )}

          {/* Project */}
          {editing === 'project' ? (
            <div className="py-2">
              <select
                autoFocus
                value={activeProjectId || ''}
                onChange={e => updateProject(e.target.value)}
                onBlur={() => setEditing(null)}
                className="w-full text-[14px] text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg px-3 py-2 bg-[var(--m-bg-card)] outline-none"
              >
                <option value="">No project</option>
                {filteredProjects?.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <button onClick={() => setEditing('project')} className="flex items-center gap-3 py-2 w-full text-left">
              <FolderKanban className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)] flex-1">{resolvedProjectName || '—'}</span>
              <ChevronDown className="w-3 h-3 text-[var(--m-text-placeholder)]" />
            </button>
          )}

          {/* Assignees */}
          <div className="flex items-center gap-3 py-2">
            <Users className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[13px] text-[var(--m-text-secondary)]">
              {assigneeNames.length > 0 ? assigneeNames.join(', ') : 'You'}
            </span>
          </div>

          {/* Description */}
          {editing === 'description' ? (
            <div className="py-2">
              <textarea
                autoFocus
                defaultValue={mode === 'task' ? task?.description : event?.description}
                placeholder="Add description..."
                rows={3}
                onBlur={e => {
                  const val = e.target.value;
                  if (mode === 'task' && task && onTaskChange) onTaskChange({ ...task, description: val || undefined });
                  else if (mode === 'meeting' && event && onEventChange) onEventChange({ ...event, description: val || undefined });
                  setEditing(null);
                }}
                className="w-full text-[14px] text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg px-3 py-2 bg-transparent outline-none resize-none"
              />
            </div>
          ) : (
            <button onClick={() => setEditing('description')} className="flex items-center gap-3 py-2 w-full text-left">
              <span className="text-[13px] text-[var(--m-text-tertiary)] ml-7">
                {(mode === 'task' ? task?.description : event?.description) || '+ Add description'}
              </span>
            </button>
          )}

          {/* Recurrence (events, display only for now) */}
          {mode === 'meeting' && event?.recurrence && (
            <div className="flex items-center gap-3 py-2">
              <Repeat className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)]">{event.recurrence}</span>
            </div>
          )}

          {/* Reminders (events, display only for now) */}
          {mode === 'meeting' && event?.reminders && event.reminders.length > 0 && (
            <div className="flex items-center gap-3 py-2">
              <Bell className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)]">
                {event.reminders.map(r => `${r.minutes}min ${r.method}`).join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
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
