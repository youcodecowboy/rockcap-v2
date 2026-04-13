'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Circle, CheckCircle2, Plus } from 'lucide-react';
import TaskCreationFlow from '@/components/tasks/TaskCreationFlow';
import { groupTasksByDate } from '@/components/tasks/groupTasksByDate';

interface ClientTasksTabProps {
  clientId: string;
  clientName?: string;
}

export default function ClientTasksTab({ clientId, clientName }: ClientTasksTabProps) {
  const tasks = useQuery(api.tasks.getByClient, { clientId: clientId as Id<'clients'> });
  const updateTask = useMutation(api.tasks.update);
  const [showCreation, setShowCreation] = useState(false);

  if (showCreation) {
    return (
      <TaskCreationFlow
        onTaskCreated={() => setShowCreation(false)}
        onClose={() => setShowCreation(false)}
        initialClientId={clientId}
        initialClientName={clientName}
      />
    );
  }

  if (tasks === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading tasks...
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center">
        <p className="text-[12px] text-[var(--m-text-tertiary)]">No tasks yet</p>
        <button
          onClick={() => setShowCreation(true)}
          className="mt-2 text-[12px] font-medium text-[var(--m-accent-indicator)]"
        >
          Create a task
        </button>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  const activeTasks = tasks
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

  const completedTasks = tasks
    .filter((t) => t.status === 'completed')
    .sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

  const groupedActive = groupTasksByDate(activeTasks);

  // Define the sections we always want to show (with empty states)
  const standardSections = [
    { key: 'overdue', label: 'Overdue', color: 'text-red-600', emptyText: 'No overdue tasks' },
    { key: 'today', label: 'Due Today', color: 'text-amber-600', emptyText: 'Nothing due today' },
    { key: 'tomorrow', label: 'Tomorrow', color: 'text-[var(--m-text-secondary)]', emptyText: 'Nothing due tomorrow' },
  ];

  // Build display: standard sections (always shown) + any additional date groups
  const standardKeys = new Set(['overdue', 'today', 'tomorrow']);
  const groupMap = new Map(groupedActive.map(g => {
    // Map group labels back to keys for matching
    if (g.label === 'Overdue') return ['overdue', g];
    if (g.label === 'Due Today') return ['today', g];
    if (g.label === 'Tomorrow') return ['tomorrow', g];
    return [g.label, g];
  }));

  // Extra groups beyond the standard three (future dates, no due date)
  const extraGroups = groupedActive.filter(g =>
    g.label !== 'Overdue' && g.label !== 'Due Today' && g.label !== 'Tomorrow'
  );

  function getDueBadge(dueDate: string | undefined | null) {
    if (!dueDate) return null;
    const dateStr = dueDate.split('T')[0];
    const isOverdue = dateStr < today;
    const isDueToday = dateStr === today;

    let className = 'bg-gray-100 text-gray-600';
    if (isOverdue) className = 'bg-red-100 text-red-700';
    else if (isDueToday) className = 'bg-amber-100 text-amber-700';

    const d = new Date(dueDate);
    const day = d.getUTCDate();
    const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
    const label = `${day} ${month}`;

    return (
      <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${className}`}>
        {label}
      </span>
    );
  }

  async function toggleTask(taskId: Id<'tasks'>, currentStatus: string) {
    const newStatus = currentStatus === 'completed' ? 'todo' : 'completed';
    await updateTask({ id: taskId, status: newStatus });
  }

  function renderTaskRow(task: any) {
    const isComplete = task.status === 'completed';
    return (
      <button
        key={task._id}
        type="button"
        onClick={() => toggleTask(task._id, task.status)}
        className="flex w-full items-center gap-2.5 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left"
      >
        {isComplete ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
        ) : (
          <Circle className="h-5 w-5 shrink-0 text-[var(--m-text-tertiary)]" />
        )}
        <span className={`text-[13px] truncate ${isComplete ? 'text-[var(--m-text-tertiary)] line-through' : 'text-[var(--m-text-primary)]'}`}>
          {task.title}
        </span>
        {getDueBadge(task.dueDate)}
      </button>
    );
  }

  function renderSection(label: string, color: string, sectionTasks: any[], emptyText?: string) {
    return (
      <div key={label} className="mt-1">
        <div className={`px-[var(--m-page-px)] py-2 text-[11px] font-semibold uppercase tracking-wider ${color}`}>
          {label}
          {sectionTasks.length > 0 && (
            <span className="text-[var(--m-text-tertiary)] font-normal ml-1.5">({sectionTasks.length})</span>
          )}
        </div>
        {sectionTasks.length > 0 ? (
          sectionTasks.map(renderTaskRow)
        ) : emptyText ? (
          <div className="px-[var(--m-page-px)] py-3 text-[12px] text-[var(--m-text-tertiary)]">
            {emptyText}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {/* New task button */}
      <div className="px-[var(--m-page-px)] pt-3">
        <button
          onClick={() => setShowCreation(true)}
          className="flex items-center gap-1.5 mb-1 text-[12px] font-medium text-[var(--m-accent-indicator)]"
        >
          <Plus className="w-3.5 h-3.5" /> New Task
        </button>
      </div>

      {/* Standard sections (always visible with empty states) */}
      {standardSections.map(s => {
        const group = groupMap.get(s.key);
        return renderSection(s.label, s.color, group?.tasks || [], s.emptyText);
      })}

      {/* Additional date sections (upcoming dates, no due date) */}
      {extraGroups.map(g => renderSection(g.label, g.color, g.tasks))}

      {/* Completed section (expanded by default) */}
      {renderSection('Completed', 'text-green-600', completedTasks, 'No completed tasks')}
    </div>
  );
}
