'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Plus } from 'lucide-react';
import TaskSummaryPills from '@/components/tasks/TaskSummaryPills';
import TaskDayStrip, { getWeekRange } from '@/components/tasks/TaskDayStrip';
import TaskListItem from '@/components/tasks/TaskListItem';
import TaskDetailSheet from '@/components/tasks/TaskDetailSheet';
import TaskCreationFlow from '@/components/tasks/TaskCreationFlow';
import EventListItem from '@/components/tasks/EventListItem';
import EventDetailSheet from '@/components/tasks/EventDetailSheet';
import { groupByDate } from '@/components/tasks/groupTasksByDate';

type StatusFilter = 'active' | 'completed' | 'all';

export default function TasksContent() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<'tasks'> | null>(null);
  const [showCreation, setShowCreation] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [selectedEventId, setSelectedEventId] = useState<Id<'events'> | null>(null);

  const tasks = useQuery(api.tasks.getByUser, { includeCreated: true, includeAssigned: true });
  const events = useQuery(api.events.getByUser, {});
  const metrics = useQuery(api.tasks.getMetrics, {});
  const clients = useQuery(api.clients.list, {});
  const completeTask = useMutation(api.tasks.complete);

  const dateRange = useMemo(() => getWeekRange(weekOffset), [weekOffset]);

  const dateCounts = useQuery(api.tasks.getByDateRange, dateRange);

  const enhancedTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.map(t => ({
      ...t,
      clientName: t.clientId ? clients?.find(c => c._id === t.clientId)?.name : undefined,
    }));
  }, [tasks, clients]);

  const displayTasks = useMemo(() => {
    let filtered = enhancedTasks.filter(t => {
      if (t.status === 'cancelled') return false;
      if (statusFilter === 'active') return t.status !== 'completed';
      if (statusFilter === 'completed') return t.status === 'completed';
      return true; // 'all'
    });

    if (selectedDate) {
      filtered = filtered.filter(t => {
        if (!t.dueDate) return false;
        return t.dueDate.split('T')[0] === selectedDate;
      });
    }

    const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return filtered.sort((a, b) => {
      // Active tasks before completed in 'all' view
      if (statusFilter === 'all') {
        const aComplete = a.status === 'completed' ? 1 : 0;
        const bComplete = b.status === 'completed' ? 1 : 0;
        if (aComplete !== bComplete) return aComplete - bComplete;
      }

      const now = new Date().toISOString();
      const aOverdue = a.dueDate && a.dueDate < now ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < now ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;

      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      return (priorityWeight[a.priority || 'medium'] || 1) - (priorityWeight[b.priority || 'medium'] || 1);
    });
  }, [enhancedTasks, selectedDate, statusFilter]);

  type ScheduleItem =
    | { kind: 'task'; _id: string; date: string | undefined; data: any }
    | { kind: 'event'; _id: string; date: string | undefined; data: any };

  const unifiedItems = useMemo(() => {
    const items: ScheduleItem[] = [];

    for (const t of displayTasks) {
      items.push({ kind: 'task', _id: t._id, date: t.dueDate, data: t });
    }

    if (events) {
      for (const e of events) {
        if (e.status === 'cancelled') continue;
        // When filtering by date, only include events on that date
        if (selectedDate) {
          const eventDate = e.startTime?.split('T')[0];
          if (eventDate !== selectedDate) continue;
        }
        items.push({ kind: 'event', _id: e._id, date: e.startTime, data: e });
      }
    }

    items.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (diff !== 0) return diff;
      return a.kind === 'event' ? -1 : 1;
    });

    return items;
  }, [displayTasks, events, selectedDate]);

  const combinedDateCounts = useMemo(() => {
    const counts: Record<string, number> = { ...(dateCounts || {}) };
    if (events) {
      for (const e of events) {
        if (e.status === 'cancelled') continue;
        const dateKey = e.startTime?.split('T')[0];
        if (dateKey) {
          counts[dateKey] = (counts[dateKey] || 0) + 1;
        }
      }
    }
    return counts;
  }, [dateCounts, events]);

  const combinedMetrics = useMemo(() => {
    if (!metrics) return undefined;
    const today = new Date().toISOString().split('T')[0];
    const meetingsToday = events?.filter(e =>
      e.status !== 'cancelled' && e.startTime?.startsWith(today)
    ).length ?? 0;
    return { ...metrics, meetingsToday };
  }, [metrics, events]);

  const filterCounts = useMemo(() => {
    const active = enhancedTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
    const completed = enhancedTasks.filter(t => t.status === 'completed').length;
    return { active, completed, all: active + completed };
  }, [enhancedTasks]);

  const sectionLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    : 'All Tasks';

  // Group unified items by date for sectioned display (only when not filtering by a specific date)
  const groupedItems = useMemo(() => {
    if (selectedDate) return null; // flat list when filtering by day
    return groupByDate(unifiedItems, item => item.date);
  }, [unifiedItems, selectedDate]);

  const handleToggleComplete = async (taskId: Id<'tasks'>) => {
    await completeTask({ id: taskId });
  };

  if (showCreation) {
    return (
      <TaskCreationFlow
        onTaskCreated={() => setShowCreation(false)}
        onClose={() => setShowCreation(false)}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-var(--m-header-h)-var(--m-footer-h))]">
      <div className="px-[var(--m-page-px)] pt-3 space-y-3">
        <TaskSummaryPills metrics={combinedMetrics} />
        <TaskDayStrip
          dateCounts={combinedDateCounts}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
        />
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1.5 px-[var(--m-page-px)] mt-3 pb-2">
        {([
          { key: 'active' as StatusFilter, label: 'Active', count: filterCounts.active },
          { key: 'completed' as StatusFilter, label: 'Done', count: filterCounts.completed },
          { key: 'all' as StatusFilter, label: 'All', count: filterCounts.all },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-[var(--m-text-primary)] text-[var(--m-bg)]'
                : 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]'
            }`}
          >
            {f.label}
            <span className={`ml-1 ${statusFilter === f.key ? 'opacity-70' : 'opacity-50'}`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-[var(--m-border)] mx-[var(--m-page-px)]" />

      <div className="flex-1 px-[var(--m-page-px)] pb-20">
        {unifiedItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--m-text-tertiary)]">
              {selectedDate ? 'No tasks or events on this day' : 'No tasks yet'}
            </p>
            <button
              onClick={() => setShowCreation(true)}
              className="mt-2 text-sm text-[var(--m-accent)] font-medium"
            >
              Create a task
            </button>
          </div>
        ) : groupedItems ? (
          /* Date-grouped sections */
          groupedItems.map(group => (
            <div key={group.label} className="mt-3">
              <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${group.color}`}>
                {group.label}
                <span className="text-[var(--m-text-tertiary)] font-normal ml-1.5">({group.tasks.length})</span>
              </div>
              <div className="space-y-1.5">
                {group.tasks.map(item =>
                  item.kind === 'task' ? (
                    <TaskListItem
                      key={item.data._id}
                      task={item.data}
                      onTap={() => setSelectedTaskId(item.data._id)}
                      onToggleComplete={() => handleToggleComplete(item.data._id)}
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
            </div>
          ))
        ) : (
          /* Flat list when filtering by specific date */
          <div className="mt-2.5">
            <div className="text-[11px] font-semibold text-[var(--m-text-secondary)] uppercase tracking-wider mb-1.5">
              {sectionLabel}
            </div>
            <div className="space-y-1.5">
              {unifiedItems.map(item =>
                item.kind === 'task' ? (
                  <TaskListItem
                    key={item.data._id}
                    task={item.data}
                    onTap={() => setSelectedTaskId(item.data._id)}
                    onToggleComplete={() => handleToggleComplete(item.data._id)}
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
          </div>
        )}
      </div>

      <button
        onClick={() => setShowCreation(true)}
        className="fixed bottom-[calc(var(--m-footer-h)+env(safe-area-inset-bottom)+1rem)] right-4 bg-[var(--m-accent)] text-white rounded-full shadow-lg flex items-center gap-1.5 px-4 py-3 z-20"
        aria-label="Create new task"
      >
        <Plus className="w-4 h-4" />
        <span className="text-sm font-semibold">New Task</span>
      </button>

      <TaskDetailSheet
        taskId={selectedTaskId}
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        variant="sheet"
      />

      <EventDetailSheet
        event={events?.find(e => e._id === selectedEventId) || null}
        isOpen={!!selectedEventId}
        onClose={() => setSelectedEventId(null)}
        onCreateTaskFromEvent={() => {
          setSelectedEventId(null);
          setShowCreation(true);
        }}
      />
    </div>
  );
}
