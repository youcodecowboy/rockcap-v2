'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Circle, CheckCircle2 } from 'lucide-react';

interface ProjectTasksTabProps {
  projectId: string;
}

export default function ProjectTasksTab({ projectId }: ProjectTasksTabProps) {
  const tasks = useQuery(api.tasks.getByProject, { projectId: projectId as Id<'projects'> });
  const updateTask = useMutation(api.tasks.update);
  const [completedExpanded, setCompletedExpanded] = useState(false);

  if (tasks === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading tasks...
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        No tasks yet
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

  return (
    <div>
      {/* Active section */}
      {activeTasks.length > 0 && (
        <div>
          <div className="px-[var(--m-page-px)] py-2 text-[12px] font-semibold text-[var(--m-text-secondary)]">
            Active ({activeTasks.length})
          </div>
          {activeTasks.map((task) => (
            <button
              key={task._id}
              type="button"
              onClick={() => toggleTask(task._id, task.status)}
              className="flex w-full items-center gap-2.5 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left"
            >
              <Circle className="h-5 w-5 shrink-0 text-[var(--m-text-tertiary)]" />
              <span className="text-[13px] text-[var(--m-text-primary)] truncate">{task.title}</span>
              {getDueBadge(task.dueDate)}
            </button>
          ))}
        </div>
      )}

      {/* Completed section */}
      {completedTasks.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setCompletedExpanded(!completedExpanded)}
            className="flex w-full items-center px-[var(--m-page-px)] py-2 text-[12px] font-semibold text-[var(--m-text-secondary)]"
          >
            Completed ({completedTasks.length})
            <span className="ml-1 text-[10px]">{completedExpanded ? '\u25B2' : '\u25BC'}</span>
          </button>
          {completedExpanded &&
            completedTasks.map((task) => (
              <button
                key={task._id}
                type="button"
                onClick={() => toggleTask(task._id, task.status)}
                className="flex w-full items-center gap-2.5 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                <span className="text-[13px] text-[var(--m-text-tertiary)] line-through truncate">
                  {task.title}
                </span>
                {getDueBadge(task.dueDate)}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
