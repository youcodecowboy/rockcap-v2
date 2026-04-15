# Unified Tasks & Events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge tasks and events into one chronological view with a Task/Meeting mode toggle in the AI creation flow, editable confirmation cards, and Google-synced event actions.

**Architecture:** The existing `/m-tasks` page fetches both tasks and events, normalizes them into a unified `ScheduleItem` type, and renders them interleaved by date. The AI agent route accepts a `mode` param to switch between task and meeting system prompts. A new `EditableConfirmationCard` replaces the read-only `TaskConfirmationCard`.

**Tech Stack:** Next.js, Convex (existing mutations), React, Tailwind, Anthropic Claude Haiku 4.5, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-15-unified-tasks-events-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/tasks/EventListItem.tsx` | List item rendering for events (calendar icon, time range, location, Google badge) |
| `src/components/tasks/EventDetailSheet.tsx` | Event detail view — editable for local, read-only with actions for Google-synced |
| `src/components/tasks/EditableConfirmationCard.tsx` | Editable confirmation card for both tasks and events |
| `src/components/tasks/CreationModeToggle.tsx` | Task/Meeting toggle buttons |

### Modified Files
| File | Change |
|------|--------|
| `src/components/tasks/groupTasksByDate.ts` | Generalize to accept items with flexible date field |
| `src/components/tasks/TaskSummaryPills.tsx` | Add "Meetings Today" pill |
| `src/app/(mobile)/m-tasks/components/TasksContent.tsx` | Fetch events, merge with tasks, render unified list |
| `src/components/tasks/TaskCreationFlow.tsx` | Add mode toggle, manual creation, editable card, event creation |
| `src/app/api/tasks/agent/route.ts` | Accept mode param, add meeting system prompt |

---

### Task 1: Generalize groupTasksByDate

**Files:**
- Modify: `src/components/tasks/groupTasksByDate.ts`

- [ ] **Step 1: Update the function to accept a date extractor**

Replace the contents of `src/components/tasks/groupTasksByDate.ts` with:

```typescript
interface ScheduleItem {
  _id: string;
  [key: string]: any;
}

interface ScheduleGroup<T> {
  label: string;
  color: string;
  tasks: T[];
}

export function groupByDate<T extends ScheduleItem>(
  items: T[],
  getDate: (item: T) => string | undefined,
): ScheduleGroup<T>[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);

  const groups: Map<string, { label: string; color: string; tasks: T[] }> = new Map();

  for (const item of items) {
    let key: string;
    let label: string;
    let color: string;

    const dateStr = getDate(item);

    if (!dateStr) {
      key = 'no-date';
      label = 'No Due Date';
      color = 'text-[var(--m-text-tertiary)]';
    } else {
      const itemDay = new Date(dateStr);
      const itemDayStart = new Date(itemDay.getFullYear(), itemDay.getMonth(), itemDay.getDate());
      const diffDays = Math.round((itemDayStart.getTime() - todayStart.getTime()) / 86400000);

      if (diffDays < 0) {
        key = 'overdue';
        label = 'Overdue';
        color = 'text-red-600';
      } else if (diffDays === 0) {
        key = 'today';
        label = 'Today';
        color = 'text-amber-600';
      } else if (diffDays === 1) {
        key = 'tomorrow';
        label = 'Tomorrow';
        color = 'text-[var(--m-text-secondary)]';
      } else {
        const ds = dateStr.split('T')[0];
        key = ds;
        label = itemDayStart.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        color = 'text-[var(--m-text-secondary)]';
      }
    }

    if (!groups.has(key)) {
      groups.set(key, { label, color, tasks: [] });
    }
    groups.get(key)!.tasks.push(item);
  }

  return Array.from(groups.values());
}

// Backward-compatible alias
export function groupTasksByDate<T extends ScheduleItem>(tasks: T[]): ScheduleGroup<T>[] {
  return groupByDate(tasks, (t) => t.dueDate);
}
```

- [ ] **Step 2: Build check**

Run: `npx next build 2>&1 | tail -5`
Expected: Build passes (backward-compatible alias preserves existing callers).

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/groupTasksByDate.ts
git commit -m "refactor(tasks): generalize groupTasksByDate to accept flexible date extractor"
```

---

### Task 2: Create EventListItem Component

**Files:**
- Create: `src/components/tasks/EventListItem.tsx`

- [ ] **Step 1: Create the event list item component**

```typescript
'use client';

import { Calendar } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';

interface EventItem {
  _id: Id<'events'>;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  location?: string;
  status?: string;
  syncStatus?: string;
  clientId?: Id<'clients'>;
  clientName?: string;
}

interface EventListItemProps {
  event: EventItem;
  onTap: () => void;
}

function formatTimeRange(startTime: string, endTime: string, allDay?: boolean): string {
  if (allDay) return 'All day';
  const start = new Date(startTime);
  const end = new Date(endTime);
  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function EventListItem({ event, onTap }: EventListItemProps) {
  const isGoogleSynced = event.syncStatus === 'synced';
  const timeLabel = formatTimeRange(event.startTime, event.endTime, event.allDay);

  return (
    <button
      onClick={onTap}
      className="flex items-start gap-3 w-full text-left px-4 py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] border-l-[3px] border-l-indigo-400"
    >
      <div className="relative mt-0.5">
        <Calendar className="w-[16px] h-[16px] text-indigo-500 flex-shrink-0" />
        {isGoogleSynced && (
          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-white flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4285F4]" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-[var(--m-text-primary)] truncate">
          {event.title}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[12px] text-indigo-500 font-medium">{timeLabel}</span>
          {event.location && (
            <>
              <span className="text-[12px] text-[var(--m-text-tertiary)]">·</span>
              <span className="text-[12px] text-[var(--m-text-tertiary)] truncate">{event.location}</span>
            </>
          )}
        </div>
        {event.clientName && (
          <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">{event.clientName}</div>
        )}
      </div>
    </button>
  );
}

export type { EventItem };
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tasks/EventListItem.tsx
git commit -m "feat(tasks): add EventListItem component for unified schedule view"
```

---

### Task 3: Create EventDetailSheet Component

**Files:**
- Create: `src/components/tasks/EventDetailSheet.tsx`

- [ ] **Step 1: Create the event detail sheet**

```typescript
'use client';

import { useState } from 'react';
import { X, Calendar, MapPin, Clock, Users, Building2, FolderKanban, ExternalLink, Plus, FileText } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

interface EventDetailSheetProps {
  event: any;
  isOpen: boolean;
  onClose: () => void;
  onCreateTaskFromEvent?: (eventTitle: string, eventDate: string, clientId?: string, projectId?: string) => void;
}

function formatDateTime(startTime: string, endTime: string, allDay?: boolean): string {
  if (allDay) {
    return new Date(startTime).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const start = new Date(startTime);
  const end = new Date(endTime);
  const datePart = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeFmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timeFmt(start)} – ${timeFmt(end)}`;
}

export default function EventDetailSheet({ event, isOpen, onClose, onCreateTaskFromEvent }: EventDetailSheetProps) {
  const [notes, setNotes] = useState(event?.metadata?.notes || '');
  const [showNotes, setShowNotes] = useState(false);
  const updateEvent = useMutation(api.events.update);

  if (!isOpen || !event) return null;

  const isGoogleSynced = event.syncStatus === 'synced';
  const isReadOnly = isGoogleSynced;

  const handleSaveNotes = async () => {
    await updateEvent({
      id: event._id,
      metadata: { ...(event.metadata || {}), notes },
    });
    setShowNotes(false);
  };

  const handleCreateTask = () => {
    if (onCreateTaskFromEvent) {
      onCreateTaskFromEvent(
        `Follow up: ${event.title}`,
        event.startTime,
        event.clientId,
        event.projectId,
      );
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg-card)] rounded-t-2xl max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-8 h-1 bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              {isGoogleSynced && (
                <span className="text-[10px] font-semibold text-[#4285F4] bg-blue-50 px-1.5 py-0.5 rounded">Google</span>
              )}
            </div>
            <h2 className="text-[18px] font-semibold text-[var(--m-text-primary)] mt-1">{event.title}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--m-text-tertiary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Details */}
        <div className="px-4 space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[14px] text-[var(--m-text-primary)]">
              {formatDateTime(event.startTime, event.endTime, event.allDay)}
            </span>
          </div>

          {event.location && (
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[14px] text-[var(--m-text-primary)]">{event.location}</span>
            </div>
          )}

          {event.description && (
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-[var(--m-text-tertiary)] mt-0.5" />
              <span className="text-[14px] text-[var(--m-text-secondary)]">{event.description}</span>
            </div>
          )}

          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-start gap-3">
              <Users className="w-4 h-4 text-[var(--m-text-tertiary)] mt-0.5" />
              <div className="text-[14px] text-[var(--m-text-secondary)]">
                {event.attendees.map((a: any) => a.name || a.email).join(', ')}
              </div>
            </div>
          )}

          {event.googleCalendarUrl && (
            <a
              href={event.googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[13px] text-[#4285F4] font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Google Calendar
            </a>
          )}
        </div>

        {/* Notes area */}
        {showNotes && (
          <div className="px-4 pb-4">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add personal notes about this event..."
              rows={3}
              className="w-full text-[14px] text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg px-3 py-2 resize-none bg-transparent outline-none"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setShowNotes(false)} className="flex-1 py-2 text-[13px] text-[var(--m-text-secondary)] border border-[var(--m-border)] rounded-lg">Cancel</button>
              <button onClick={handleSaveNotes} className="flex-1 py-2 text-[13px] text-[var(--m-text-on-brand)] bg-[var(--m-bg-brand)] rounded-lg">Save</button>
            </div>
          </div>
        )}

        {/* Action buttons (Google-synced events) */}
        {isReadOnly && (
          <div className="px-4 pb-6 space-y-2">
            <div className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-[0.05em] mb-1">Actions</div>
            <button
              onClick={() => setShowNotes(true)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-[13px] font-medium text-[var(--m-text-primary)] bg-[var(--m-bg-subtle)] rounded-lg active:bg-[var(--m-bg-inset)]"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
              Add Notes
            </button>
            <button
              onClick={handleCreateTask}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-[13px] font-medium text-[var(--m-text-primary)] bg-[var(--m-bg-subtle)] rounded-lg active:bg-[var(--m-bg-inset)]"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
              Create Task from This
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tasks/EventDetailSheet.tsx
git commit -m "feat(tasks): add EventDetailSheet with read-only Google event actions"
```

---

### Task 4: Update TaskSummaryPills with Meetings Count

**Files:**
- Modify: `src/components/tasks/TaskSummaryPills.tsx`

- [ ] **Step 1: Add meetingsToday to the metrics interface and add a new pill**

Add `meetingsToday: number` to the `TaskMetrics` interface:

```typescript
interface TaskMetrics {
  total: number;
  todo: number;
  inProgress: number;
  completed: number;
  paused: number;
  dueToday: number;
  overdue: number;
  meetingsToday: number;
}
```

Add a 7th pill to the pills array (it becomes a 4+3 grid or we replace Paused with Meetings Today since it's more useful):

Replace the "Paused" pill definition with:
```typescript
  { key: 'meetingsToday' as const, label: 'Meetings', icon: CalendarDays, border: 'border-l-indigo-400', iconColor: 'text-indigo-500', textColor: 'text-indigo-700' },
```

Add `CalendarDays` to the lucide-react import.

- [ ] **Step 2: Build check**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/TaskSummaryPills.tsx
git commit -m "feat(tasks): add Meetings Today pill to summary metrics"
```

---

### Task 5: Create CreationModeToggle and EditableConfirmationCard

**Files:**
- Create: `src/components/tasks/CreationModeToggle.tsx`
- Create: `src/components/tasks/EditableConfirmationCard.tsx`

- [ ] **Step 1: Create the mode toggle**

```typescript
'use client';

interface CreationModeToggleProps {
  mode: 'task' | 'meeting';
  onModeChange: (mode: 'task' | 'meeting') => void;
}

export default function CreationModeToggle({ mode, onModeChange }: CreationModeToggleProps) {
  return (
    <div className="flex gap-1 p-1 bg-[var(--m-bg-subtle)] rounded-lg">
      <button
        onClick={() => onModeChange('task')}
        className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
          mode === 'task'
            ? 'bg-[var(--m-bg-card)] text-[var(--m-text-primary)] shadow-sm'
            : 'text-[var(--m-text-tertiary)]'
        }`}
      >
        Task
      </button>
      <button
        onClick={() => onModeChange('meeting')}
        className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
          mode === 'meeting'
            ? 'bg-[var(--m-bg-card)] text-[var(--m-text-primary)] shadow-sm'
            : 'text-[var(--m-text-tertiary)]'
        }`}
      >
        Meeting
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create the editable confirmation card**

```typescript
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
        {/* Header */}
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

        {/* Fields */}
        <div className="px-4 pb-3 space-y-2">
          {/* Date/Time */}
          <div className="flex items-center gap-3 py-1.5">
            <Calendar className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[13px] text-[var(--m-text-secondary)]">
              {mode === 'task'
                ? formatDate(task?.dueDate)
                : event?.startTime ? `${formatDate(event.startTime)} · ${formatTime(event.startTime)}` : 'Not set'
              }
            </span>
          </div>

          {/* Duration (events only) */}
          {mode === 'meeting' && event?.endTime && (
            <div className="flex items-center gap-3 py-1.5">
              <Clock className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)]">
                {formatTime(event.startTime)} – {formatTime(event.endTime)}
              </span>
            </div>
          )}

          {/* Location (events only) */}
          {mode === 'meeting' && (
            <div className="flex items-center gap-3 py-1.5">
              <MapPin className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)]">
                {event?.location || 'No location'}
              </span>
            </div>
          )}

          {/* Priority (tasks only) */}
          {mode === 'task' && task && (
            <button onClick={cyclePriority} className="flex items-center gap-3 py-1.5 w-full text-left">
              <AlertCircle className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className={`text-[13px] font-medium px-2 py-0.5 rounded ${priorityColors[task.priority]}`}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
            </button>
          )}

          {/* Client */}
          <div className="flex items-center gap-3 py-1.5">
            <Building2 className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[13px] text-[var(--m-text-secondary)]">{clientName || 'Personal'}</span>
          </div>

          {/* Project */}
          <div className="flex items-center gap-3 py-1.5">
            <FolderKanban className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[13px] text-[var(--m-text-secondary)]">{projectName || '—'}</span>
          </div>

          {/* Assignees/Attendees */}
          <div className="flex items-center gap-3 py-1.5">
            <Users className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[13px] text-[var(--m-text-secondary)]">
              {assigneeNames.length > 0 ? assigneeNames.join(', ') : 'You'}
            </span>
          </div>

          {/* Recurrence (events only) */}
          {mode === 'meeting' && event?.recurrence && (
            <div className="flex items-center gap-3 py-1.5">
              <Repeat className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-secondary)]">{event.recurrence}</span>
            </div>
          )}

          {/* Reminders (events only) */}
          {mode === 'meeting' && event?.reminders && event.reminders.length > 0 && (
            <div className="flex items-center gap-3 py-1.5">
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
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/CreationModeToggle.tsx src/components/tasks/EditableConfirmationCard.tsx
git commit -m "feat(tasks): add CreationModeToggle and EditableConfirmationCard components"
```

---

### Task 6: Update AI Agent Route for Meeting Mode

**Files:**
- Modify: `src/app/api/tasks/agent/route.ts`

- [ ] **Step 1: Add mode param and meeting system prompt**

Add `mode` to the request body parsing (after line 19 where the body is destructured):

The body destructure becomes:
```typescript
const { messages, context, mode = 'task' } = await request.json();
```

Add the meeting system prompt after the existing task system prompt. The key change is wrapping the existing `systemPrompt` in a conditional:

```typescript
const taskSystemPrompt = `...existing prompt unchanged...`;

const meetingSystemPrompt = `You are a meeting/event creation assistant for a UK property finance team. Your job is to parse natural language descriptions into structured calendar events.

CURRENT USER: ${currentUserName} (ID: ${context.userId})

AVAILABLE CLIENTS:
${clientList}

AVAILABLE PROJECTS:
${projectList}

TEAM MEMBERS (potential attendees):
${userList}

INSTRUCTIONS:
1. Parse the user's message to extract: title, start date/time, end date/time or duration, location, description, attendees, client, project, reminders, recurrence, and video link.
2. Be smart about matching names — "bayfield" matches "Bayfield Homes", "john" matches team members.
3. Default duration to 1 hour if not specified.
4. If the user specifies a time, set start and end. If only a date, make it a 1-hour meeting at 10:00.
5. Interpret relative dates: "tomorrow" = next day, "friday" = next Friday. Today is ${new Date().toISOString().split('T')[0]}.
6. For recurrence, use simple descriptions: "weekly", "daily", "monthly", "every Tuesday".
7. For reminders, default to 30 minutes popup if not specified.
8. Attendees should be matched to team member IDs when possible.

RESPONSE FORMAT:
When you have enough info, respond with ONLY a JSON block:
\`\`\`json
{
  "type": "event",
  "event": {
    "title": "Meeting title",
    "description": "Optional description",
    "startTime": "2026-04-11T14:00:00.000Z",
    "endTime": "2026-04-11T15:00:00.000Z",
    "duration": 60,
    "location": "42 High St or omit",
    "attendees": ["user-id-1"],
    "clientId": "client-id or omit",
    "projectId": "project-id or omit",
    "reminders": [{"method": "popup", "minutes": 30}],
    "recurrence": "weekly or omit",
    "videoLink": "url or omit"
  }
}
\`\`\`

When you need more info:
\`\`\`json
{
  "type": "message",
  "content": "Your follow-up question"
}
\`\`\`

ALWAYS respond with a JSON block. Never respond with plain text.`;

const systemPrompt = mode === 'meeting' ? meetingSystemPrompt : taskSystemPrompt;
```

- [ ] **Step 2: Build check**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/agent/route.ts
git commit -m "feat(tasks): add meeting mode system prompt to AI agent route"
```

---

### Task 7: Rework TaskCreationFlow for Dual Mode

**Files:**
- Modify: `src/components/tasks/TaskCreationFlow.tsx`

- [ ] **Step 1: Add mode toggle, event state, manual creation, and use EditableConfirmationCard**

This is the largest change. The key modifications to `TaskCreationFlow.tsx`:

1. Import new components:
```typescript
import CreationModeToggle from './CreationModeToggle';
import EditableConfirmationCard, { type ParsedEvent } from './EditableConfirmationCard';
```

2. Add new state:
```typescript
const [mode, setMode] = useState<'task' | 'meeting'>('task');
const [parsedEvent, setParsedEvent] = useState<ParsedEvent | null>(null);
const [manualMode, setManualMode] = useState(false);
```

3. Update `sendMessage` to pass mode to the API:
```typescript
body: JSON.stringify({
  messages: [...currentMessages, { role: 'user', content: userMessage }],
  context: { userId: currentUser?._id, clients: clientContext, projects: projectContext, users: userContext },
  mode,
}),
```

4. Update the response handler to handle `type: 'event'` responses:
```typescript
if (result.type === 'event') {
  setParsedEvent(result.event);
}
```

5. Add `handleConfirmEvent` function for event creation:
```typescript
const handleConfirmEvent = async () => {
  if (!parsedEvent) return;
  setIsCreating(true);
  try {
    const eventId = await createEvent({
      title: parsedEvent.title,
      description: parsedEvent.description,
      startTime: parsedEvent.startTime!,
      endTime: parsedEvent.endTime!,
      location: parsedEvent.location,
      clientId: parsedEvent.clientId ? parsedEvent.clientId as Id<'clients'> : undefined,
      projectId: parsedEvent.projectId ? parsedEvent.projectId as Id<'projects'> : undefined,
      attendees: parsedEvent.attendees?.map(id => ({ name: id })),
      reminders: parsedEvent.reminders?.map(r => ({ method: r.method as 'email' | 'popup', minutes: r.minutes })),
      recurrence: parsedEvent.recurrence,
      conferenceData: parsedEvent.videoLink ? { videoLink: parsedEvent.videoLink } : undefined,
    });
    onTaskCreated(String(eventId));

    // Push to Google Calendar (on by default for meetings)
    if (addToCalendar && parsedEvent.startTime) {
      try {
        await fetch('/api/google/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: parsedEvent.title,
            description: parsedEvent.description,
            startTime: parsedEvent.startTime,
            endTime: parsedEvent.endTime,
            allDay: false,
          }),
        });
      } catch (err) {
        console.error('Failed to push event to Google Calendar:', err);
      }
    }
  } catch (err) {
    console.error('Failed to create event:', err);
  } finally {
    setIsCreating(false);
  }
};
```

6. Add mutation: `const createEvent = useMutation(api.events.create);`

7. Initialize `addToCalendar` based on mode — default true for meetings when connected:
When mode changes: `useEffect(() => { setAddToCalendar(mode === 'meeting' && isGoogleConnected); }, [mode, isGoogleConnected]);`

8. Update manual mode handler:
```typescript
const handleManualCreate = () => {
  setManualMode(true);
  if (mode === 'task') {
    setParsedTask({ title: '', priority: 'medium', assignedTo: [] });
  } else {
    setParsedEvent({ title: '', startTime: new Date().toISOString(), endTime: new Date(Date.now() + 3600000).toISOString(), duration: 60 });
  }
};
```

9. Replace `TaskConfirmationCard` usage with `EditableConfirmationCard`:
```typescript
{(parsedTask || parsedEvent) && (
  <EditableConfirmationCard
    mode={mode}
    task={parsedTask || undefined}
    event={parsedEvent || undefined}
    clientName={clientName}
    projectName={projectName}
    assigneeNames={assigneeNames}
    onConfirm={mode === 'task' ? handleConfirm : handleConfirmEvent}
    onEdit={handleEdit}
    isCreating={isCreating}
    onTaskChange={setParsedTask}
    onEventChange={setParsedEvent}
  />
)}
```

10. Add mode toggle and "Skip AI" link to the input area:
```typescript
{!parsedTask && !parsedEvent && (
  <div className="px-4 pb-4 pt-2">
    <div className="mb-3">
      <CreationModeToggle mode={mode} onModeChange={setMode} />
    </div>
    {/* existing textarea + send button */}
    <button
      onClick={handleManualCreate}
      className="w-full mt-2 text-[12px] text-[var(--m-text-tertiary)] text-center py-1"
    >
      Skip AI, create manually
    </button>
  </div>
)}
```

- [ ] **Step 2: Build check**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/TaskCreationFlow.tsx
git commit -m "feat(tasks): add Task/Meeting mode toggle, editable confirmation, and manual creation"
```

---

### Task 8: Unify TasksContent to Show Tasks + Events

**Files:**
- Modify: `src/app/(mobile)/m-tasks/components/TasksContent.tsx`

- [ ] **Step 1: Fetch events and merge with tasks**

Key changes to `TasksContent.tsx`:

1. Add event imports and queries:
```typescript
import EventListItem from '@/components/tasks/EventListItem';
import EventDetailSheet from '@/components/tasks/EventDetailSheet';
import { groupByDate } from '@/components/tasks/groupTasksByDate';
```

2. Add event query and state:
```typescript
const events = useQuery(api.events.getByUser, {});
const [selectedEventId, setSelectedEventId] = useState<Id<'events'> | null>(null);
```

3. Create a unified item type and merge logic:
```typescript
type ScheduleItem = 
  | { kind: 'task'; date: string | undefined; data: any }
  | { kind: 'event'; date: string | undefined; data: any };

const unifiedItems = useMemo(() => {
  const items: ScheduleItem[] = [];
  
  // Add filtered tasks
  for (const t of displayTasks) {
    items.push({ kind: 'task', date: t.dueDate, data: t });
  }
  
  // Add events (exclude cancelled)
  if (events) {
    for (const e of events) {
      if (e.status === 'cancelled') continue;
      items.push({ kind: 'event', date: e.startTime, data: e });
    }
  }
  
  // Sort: by date, events before tasks at same time
  items.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (diff !== 0) return diff;
    return a.kind === 'event' ? -1 : 1;
  });
  
  return items;
}, [displayTasks, events]);
```

4. Update day strip counts to include events:
```typescript
const combinedDateCounts = useMemo(() => {
  const counts: Record<string, number> = { ...(dateCounts || {}) };
  if (events) {
    for (const e of events) {
      if (e.status === 'cancelled') continue;
      const dateKey = e.startTime.split('T')[0];
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    }
  }
  return counts;
}, [dateCounts, events]);
```

5. Update metrics to include meetings:
```typescript
const combinedMetrics = useMemo(() => {
  if (!metrics) return undefined;
  const today = new Date().toISOString().split('T')[0];
  const meetingsToday = events?.filter(e => 
    e.status !== 'cancelled' && e.startTime.startsWith(today)
  ).length ?? 0;
  return { ...metrics, meetingsToday };
}, [metrics, events]);
```

6. Update the list rendering to use `groupByDate` with unified items and render both types:
```typescript
{groupByDate(unifiedItems, item => item.date).map(group => (
  <div key={group.label}>
    <div className="...section header...">{group.label}</div>
    {group.tasks.map(item => 
      item.kind === 'task' ? (
        <TaskListItem
          key={item.data._id}
          task={item.data}
          onTap={() => setSelectedTaskId(item.data._id)}
          onToggleComplete={() => completeTask({ id: item.data._id })}
        />
      ) : (
        <EventListItem
          key={item.data._id}
          event={item.data}
          onTap={() => setSelectedEventId(item.data._id)}
        />
      )
    )}
  </div>
))}
```

7. Add EventDetailSheet overlay:
```typescript
<EventDetailSheet
  event={events?.find(e => e._id === selectedEventId) || null}
  isOpen={!!selectedEventId}
  onClose={() => setSelectedEventId(null)}
  onCreateTaskFromEvent={(title, date, clientId, projectId) => {
    setSelectedEventId(null);
    setShowCreation(true);
    // Pre-fill will be handled by the creation flow
  }}
/>
```

- [ ] **Step 2: Build check**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/app/\(mobile\)/m-tasks/components/TasksContent.tsx
git commit -m "feat(tasks): unify tasks and events in one chronological view"
```

---

### Task 9: Final Build & Push

- [ ] **Step 1: Full build check**

Run: `npx next build 2>&1 | tail -10`
Expected: Build passes.

- [ ] **Step 2: Push**

```bash
git push origin mobile2
```

---

## Implementation Notes

**Backward compatibility:** The `groupTasksByDate` export is preserved as an alias that calls `groupByDate` with the `dueDate` extractor. Any existing callers outside the mobile tasks page continue to work unchanged.

**Event creation mutation:** The `events.create` mutation already exists in `convex/events.ts` with full field support. No backend changes are needed — the creation flow calls it directly.

**Google Calendar toggle default:** For meetings, `addToCalendar` defaults to `true` when connected (meetings naturally belong on a calendar). For tasks, it remains `false` (opt-in).

**Desktop impact:** These changes are in shared components (`src/components/tasks/`), so the desktop tasks page may need similar updates later. For now, the desktop page continues to use `TaskConfirmationCard` since we're not modifying it — the old component still exists.
