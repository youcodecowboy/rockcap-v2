'use client';

import { useState } from 'react';
import { Calendar, Clock, MapPin, Users, Building2, FolderKanban, AlertCircle, Repeat, Bell, ChevronDown, Plus, X } from 'lucide-react';
import { Button, Input, Textarea, Select } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';

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

interface PersonOption {
  name: string;
  email: string;
  source: 'user' | 'contact';
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
  people?: PersonOption[];
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function priorityTone(priority: string, colors: ColorPalette): string {
  switch (priority) {
    case 'high': return colors.accent.red;
    case 'medium': return colors.accent.yellow;
    case 'low': return colors.accent.blue;
    default: return colors.accent.yellow;
  }
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
  const d = new Date(dateStr);
  // Use local date parts to avoid timezone offset issues
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toTimeInputValue(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Parse "YYYY-MM-DD" as local date (not UTC) */
function parseLocalDate(dateStr: string, hours = 0, minutes = 0): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hours, minutes, 0, 0);
}

type EditingField = null | 'title' | 'date' | 'taskTime' | 'time' | 'location' | 'client' | 'project' | 'description' | 'attendees';

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
  people,
}: EditableConfirmationCardProps) {
  const colors = useColors();
  const [editing, setEditing] = useState<EditingField>(null);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendeeSearch, setAttendeeSearch] = useState('');

  const cyclePriority = () => {
    if (mode !== 'task' || !task || !onTaskChange) return;
    const order: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(task.priority) + 1) % 3];
    onTaskChange({ ...task, priority: next });
  };

  // ── Date/time updates (timezone-safe) ──────────────────────

  const updateTaskDate = (dateStr: string) => {
    if (!task || !onTaskChange) return;
    if (!dateStr) { onTaskChange({ ...task, dueDate: undefined }); return; }
    const existing = task.dueDate ? new Date(task.dueDate) : null;
    const hours = existing ? existing.getHours() : 17;
    const mins = existing ? existing.getMinutes() : 0;
    const newDate = parseLocalDate(dateStr, hours, mins);
    onTaskChange({ ...task, dueDate: newDate.toISOString() });
    setEditing(null);
  };

  const updateTaskTime = (timeStr: string) => {
    if (!task || !onTaskChange) return;
    if (!timeStr) {
      // Clear time — set to date-only (end of day)
      if (task.dueDate) {
        const d = new Date(task.dueDate);
        d.setHours(23, 59, 0, 0);
        onTaskChange({ ...task, dueDate: d.toISOString() });
      }
      setEditing(null);
      return;
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    const d = task.dueDate ? new Date(task.dueDate) : new Date();
    d.setHours(hours, minutes, 0, 0);
    onTaskChange({ ...task, dueDate: d.toISOString() });
    setEditing(null);
  };

  const updateEventDate = (dateStr: string) => {
    if (!event || !onEventChange || !dateStr) return;
    const existingStart = event.startTime ? new Date(event.startTime) : new Date();
    const newStart = parseLocalDate(dateStr, existingStart.getHours(), existingStart.getMinutes());
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

  // ── Attendee management ────────────────────────────────────

  const currentAttendees = event?.attendees || [];

  const addAttendee = (value: string) => {
    if (!value.trim() || !event || !onEventChange) return;
    const updated = [...currentAttendees, value.trim()];
    onEventChange({ ...event, attendees: updated });
    setAttendeeInput('');
  };

  const removeAttendee = (index: number) => {
    if (!event || !onEventChange) return;
    const updated = currentAttendees.filter((_, i) => i !== index);
    onEventChange({ ...event, attendees: updated });
  };

  // ── Derived values ─────────────────────────────────────────

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

  const hasTaskTime = task?.dueDate ? new Date(task.dueDate).getHours() !== 23 : false;

  // ── Render helpers ─────────────────────────────────────────

  const rowButtonStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '8px 0',
  };
  const rowTextStyle: React.CSSProperties = { fontSize: 13, color: colors.text.secondary, flex: 1, textAlign: 'left' };

  return (
    <div style={{ margin: '0 16px 16px' }}>
      <div
        style={{
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {/* Header + Title */}
        <div style={{ padding: '14px 16px 8px' }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
            {mode === 'task' ? 'New Task' : 'New Meeting'}
          </div>
          {editing === 'title' ? (
            <div style={{ marginTop: 6 }}>
              <Input
                autoFocus
                defaultValue={mode === 'task' ? task?.title : event?.title}
                onBlur={e => {
                  const val = e.target.value;
                  if (mode === 'task' && task && onTaskChange) onTaskChange({ ...task, title: val });
                  else if (mode === 'meeting' && event && onEventChange) onEventChange({ ...event, title: val });
                  setEditing(null);
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </div>
          ) : (
            <h3
              onClick={() => setEditing('title')}
              style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary, marginTop: 4, cursor: 'pointer' }}
            >
              {(mode === 'task' ? task?.title : event?.title) || 'Tap to set title'}
            </h3>
          )}
        </div>

        <div style={{ padding: '0 16px 12px' }}>
          {/* ── Date ── */}
          {editing === 'date' ? (
            <div style={{ padding: '8px 0' }}>
              <Input
                type="date"
                autoFocus
                defaultValue={toDateInputValue(mode === 'task' ? task?.dueDate : event?.startTime)}
                onChange={e => mode === 'task' ? updateTaskDate(e.target.value) : updateEventDate(e.target.value)}
                onBlur={() => setEditing(null)}
              />
            </div>
          ) : (
            <button onClick={() => setEditing('date')} className="flex items-center gap-3 w-full" style={rowButtonStyle}>
              <Calendar size={16} color={colors.text.muted} />
              <span style={rowTextStyle}>
                {mode === 'task'
                  ? (task?.dueDate ? formatDate(task.dueDate) : 'Set date')
                  : (event?.startTime ? formatDate(event.startTime) : 'Set date')
                }
              </span>
              <ChevronDown size={12} color={colors.text.dim} />
            </button>
          )}

          {/* ── Task Time (optional) ── */}
          {mode === 'task' && task?.dueDate && (
            editing === 'taskTime' ? (
              <div className="flex gap-2" style={{ padding: '8px 0' }}>
                <div className="flex-1">
                  <Input
                    type="time"
                    autoFocus
                    defaultValue={hasTaskTime ? toTimeInputValue(task.dueDate) : ''}
                    onChange={e => updateTaskTime(e.target.value)}
                    onBlur={() => setEditing(null)}
                  />
                </div>
                {hasTaskTime && (
                  <Button variant="secondary" size="sm" onClick={() => updateTaskTime('')}>Clear</Button>
                )}
              </div>
            ) : (
              <button onClick={() => setEditing('taskTime')} className="flex items-center gap-3 w-full" style={rowButtonStyle}>
                <Clock size={16} color={colors.text.muted} />
                <span style={rowTextStyle}>{hasTaskTime ? formatTime(task.dueDate) : 'Add time (optional)'}</span>
                <ChevronDown size={12} color={colors.text.dim} />
              </button>
            )
          )}

          {/* ── Meeting Time ── */}
          {mode === 'meeting' && (
            editing === 'time' ? (
              <div style={{ padding: '8px 0' }}>
                <Input
                  type="time"
                  autoFocus
                  defaultValue={toTimeInputValue(event?.startTime)}
                  onChange={e => updateEventTime(e.target.value)}
                  onBlur={() => setEditing(null)}
                />
              </div>
            ) : (
              <button onClick={() => setEditing('time')} className="flex items-center gap-3 w-full" style={rowButtonStyle}>
                <Clock size={16} color={colors.text.muted} />
                <span style={rowTextStyle}>
                  {event?.startTime && event?.endTime
                    ? `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`
                    : 'Set time'
                  }
                </span>
                <ChevronDown size={12} color={colors.text.dim} />
              </button>
            )
          )}

          {/* ── Location (meetings) ── */}
          {mode === 'meeting' && (
            editing === 'location' ? (
              <div style={{ padding: '8px 0' }}>
                <Input
                  type="text"
                  autoFocus
                  defaultValue={event?.location || ''}
                  placeholder="Enter location..."
                  onBlur={e => updateLocation(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
              </div>
            ) : (
              <button onClick={() => setEditing('location')} className="flex items-center gap-3 w-full" style={rowButtonStyle}>
                <MapPin size={16} color={colors.text.muted} />
                <span style={rowTextStyle}>{event?.location || 'Add location'}</span>
                <ChevronDown size={12} color={colors.text.dim} />
              </button>
            )
          )}

          {/* ── Priority (tasks) ── */}
          {mode === 'task' && task && (
            <button onClick={cyclePriority} className="flex items-center gap-3 w-full" style={rowButtonStyle}>
              <AlertCircle size={16} color={colors.text.muted} />
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  padding: '2px 6px',
                  borderRadius: 2,
                  background: `${priorityTone(task.priority, colors)}20`,
                  color: priorityTone(task.priority, colors),
                  border: `1px solid ${priorityTone(task.priority, colors)}40`,
                }}
              >
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
            </button>
          )}

          {/* ── Client ── */}
          {editing === 'client' ? (
            <div style={{ padding: '8px 0' }}>
              <Select
                autoFocus
                value={activeClientId || ''}
                onChange={e => updateClient(e.target.value)}
                onBlur={() => setEditing(null)}
              >
                <option value="">Personal (no client)</option>
                {clients?.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </Select>
            </div>
          ) : (
            <button onClick={() => setEditing('client')} className="flex items-center gap-3 w-full" style={rowButtonStyle}>
              <Building2 size={16} color={colors.text.muted} />
              <span style={rowTextStyle}>{resolvedClientName || 'Personal'}</span>
              <ChevronDown size={12} color={colors.text.dim} />
            </button>
          )}

          {/* ── Project ── */}
          {editing === 'project' ? (
            <div style={{ padding: '8px 0' }}>
              <Select
                autoFocus
                value={activeProjectId || ''}
                onChange={e => updateProject(e.target.value)}
                onBlur={() => setEditing(null)}
              >
                <option value="">No project</option>
                {filteredProjects?.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </Select>
            </div>
          ) : (
            <button onClick={() => setEditing('project')} className="flex items-center gap-3 w-full" style={rowButtonStyle}>
              <FolderKanban size={16} color={colors.text.muted} />
              <span style={rowTextStyle}>{resolvedProjectName || '—'}</span>
              <ChevronDown size={12} color={colors.text.dim} />
            </button>
          )}

          {/* ── Attendees (meetings) ── */}
          {mode === 'meeting' && (
            <>
              <button onClick={() => { setEditing(editing === 'attendees' ? null : 'attendees'); setAttendeeSearch(''); }} className="flex items-center gap-3 w-full" style={rowButtonStyle}>
                <Users size={16} color={colors.text.muted} />
                <span style={rowTextStyle}>
                  {currentAttendees.length > 0 ? `${currentAttendees.length} attendee${currentAttendees.length !== 1 ? 's' : ''}` : 'Add attendees'}
                </span>
                <ChevronDown size={12} color={colors.text.dim} />
              </button>

              {editing === 'attendees' && (
                <div style={{ paddingBottom: 8, paddingLeft: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Current attendees */}
                  {currentAttendees.map((a, i) => (
                    <div key={i} className="flex items-center gap-2" style={{ padding: '2px 0' }}>
                      <span style={{ flex: 1, fontSize: 13, color: colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a}</span>
                      <button onClick={() => removeAttendee(i)} style={{ background: 'transparent', border: 'none', color: colors.text.muted, cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  {/* Search/add input */}
                  <Input
                    type="text"
                    value={attendeeSearch}
                    onChange={e => setAttendeeSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && attendeeSearch.trim()) {
                        e.preventDefault();
                        addAttendee(attendeeSearch);
                        setAttendeeSearch('');
                      }
                    }}
                    placeholder="Search people or type email..."
                  />

                  {/* People suggestions */}
                  {attendeeSearch.trim().length > 0 && (
                    <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, overflow: 'hidden', maxHeight: 150, overflowY: 'auto' }}>
                      {(people || [])
                        .filter(p => {
                          const q = attendeeSearch.toLowerCase();
                          const alreadyAdded = currentAttendees.some(a => a === p.email || a === p.name);
                          return !alreadyAdded && (p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
                        })
                        .slice(0, 6)
                        .map((p, i) => (
                          <button
                            key={`${p.email}-${i}`}
                            onClick={() => { addAttendee(p.email); setAttendeeSearch(''); }}
                            className="flex items-center gap-2 w-full text-left"
                            style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border.light}`, background: 'transparent', cursor: 'pointer' }}
                          >
                            <div className="flex-1 min-w-0">
                              <div style={{ fontSize: 13, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                              <div style={{ fontSize: 11, color: colors.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                            </div>
                            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase', color: colors.text.muted, background: colors.bg.cardAlt, padding: '2px 6px', borderRadius: 2, flexShrink: 0 }}>
                              {p.source === 'user' ? 'Team' : 'Contact'}
                            </span>
                          </button>
                        ))
                      }
                      {/* Manual email option */}
                      {attendeeSearch.includes('@') && (
                        <button
                          onClick={() => { addAttendee(attendeeSearch); setAttendeeSearch(''); }}
                          className="flex items-center gap-2 w-full text-left"
                          style={{ padding: '8px 12px', background: 'transparent', cursor: 'pointer' }}
                        >
                          <Plus size={12} color={colors.text.muted} />
                          <span style={{ fontSize: 13, color: colors.text.secondary }}>Add "{attendeeSearch}"</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Assignees (tasks — display only for now) ── */}
          {mode === 'task' && (
            <div className="flex items-center gap-3" style={{ padding: '8px 0' }}>
              <Users size={16} color={colors.text.muted} />
              <span style={{ fontSize: 13, color: colors.text.secondary }}>
                {assigneeNames.length > 0 ? assigneeNames.join(', ') : 'You'}
              </span>
            </div>
          )}

          {/* ── Description ── */}
          {editing === 'description' ? (
            <div style={{ padding: '8px 0' }}>
              <Textarea
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
              />
            </div>
          ) : (
            <button onClick={() => setEditing('description')} className="flex items-center gap-3 w-full" style={rowButtonStyle}>
              <span style={{ fontSize: 13, color: colors.text.muted, marginLeft: 28 }}>
                {(mode === 'task' ? task?.description : event?.description) || '+ Add description'}
              </span>
            </button>
          )}

          {/* ── Recurrence (display only) ── */}
          {mode === 'meeting' && event?.recurrence && (
            <div className="flex items-center gap-3" style={{ padding: '8px 0' }}>
              <Repeat size={16} color={colors.text.muted} />
              <span style={{ fontSize: 13, color: colors.text.secondary }}>{event.recurrence}</span>
            </div>
          )}

          {/* ── Reminders (display only) ── */}
          {mode === 'meeting' && event?.reminders && event.reminders.length > 0 && (
            <div className="flex items-center gap-3" style={{ padding: '8px 0' }}>
              <Bell size={16} color={colors.text.muted} />
              <span style={{ fontSize: 13, color: colors.text.secondary }}>
                {event.reminders.map(r => `${r.minutes}min ${r.method}`).join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2" style={{ padding: '0 16px 16px' }}>
          <Button variant="secondary" onClick={onEdit} disabled={isCreating} style={{ flex: 1, justifyContent: 'center' }}>
            Edit with AI
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isCreating} style={{ flex: 2, justifyContent: 'center' }}>
            {isCreating ? 'Creating...' : mode === 'task' ? 'Create Task' : 'Create Meeting'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export type { ParsedTask, ParsedEvent };
