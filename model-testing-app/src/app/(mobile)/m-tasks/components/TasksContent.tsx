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
import { groupTasksByDate } from '@/components/tasks/groupTasksByDate';

export default function TasksContent() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<'tasks'> | null>(null);
  const [showCreation, setShowCreation] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const tasks = useQuery(api.tasks.getByUser, { includeCreated: true, includeAssigned: true });
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
    let filtered = enhancedTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');

    if (selectedDate) {
      filtered = filtered.filter(t => {
        if (!t.dueDate) return false;
        return t.dueDate.split('T')[0] === selectedDate;
      });
    }

    const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return filtered.sort((a, b) => {
      const now = new Date().toISOString();
      const aOverdue = a.dueDate && a.dueDate < now ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < now ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;

      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      return (priorityWeight[a.priority || 'medium'] || 1) - (priorityWeight[b.priority || 'medium'] || 1);
    });
  }, [enhancedTasks, selectedDate]);

  const sectionLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    : 'All Tasks';

  // Group tasks by date for sectioned display (only when not filtering by a specific date)
  const groupedTasks = useMemo(() => {
    if (selectedDate) return null; // flat list when filtering by day
    return groupTasksByDate(displayTasks);
  }, [displayTasks, selectedDate]);

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
        <TaskSummaryPills metrics={metrics} />
        <TaskDayStrip
          dateCounts={dateCounts}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
        />
      </div>

      <div className="border-t border-[var(--m-border)] mx-[var(--m-page-px)] mt-3" />

      <div className="flex-1 px-[var(--m-page-px)] pb-20">
        {displayTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--m-text-tertiary)]">
              {selectedDate ? 'No tasks due on this day' : 'No tasks yet'}
            </p>
            <button
              onClick={() => setShowCreation(true)}
              className="mt-2 text-sm text-[var(--m-accent)] font-medium"
            >
              Create a task
            </button>
          </div>
        ) : groupedTasks ? (
          /* Date-grouped sections */
          groupedTasks.map(group => (
            <div key={group.label} className="mt-3">
              <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${group.color}`}>
                {group.label}
                <span className="text-[var(--m-text-tertiary)] font-normal ml-1.5">({group.tasks.length})</span>
              </div>
              <div className="space-y-1.5">
                {group.tasks.map(task => (
                  <TaskListItem
                    key={task._id}
                    task={task}
                    onTap={() => setSelectedTaskId(task._id)}
                    onToggleComplete={() => handleToggleComplete(task._id)}
                  />
                ))}
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
              {displayTasks.map(task => (
                <TaskListItem
                  key={task._id}
                  task={task}
                  onTap={() => setSelectedTaskId(task._id)}
                  onToggleComplete={() => handleToggleComplete(task._id)}
                />
              ))}
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
    </div>
  );
}
