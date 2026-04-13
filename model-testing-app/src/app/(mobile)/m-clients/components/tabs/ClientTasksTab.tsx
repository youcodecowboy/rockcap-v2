'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Circle, CheckCircle2, Plus } from 'lucide-react';

interface ClientTasksTabProps {
  clientId: string;
}

export default function ClientTasksTab({ clientId }: ClientTasksTabProps) {
  const tasks = useQuery(api.tasks.getByClient, { clientId: clientId as Id<'clients'> });
  const updateTask = useMutation(api.tasks.update);
  const createTask = useMutation(api.tasks.create);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTask = async () => {
    if (!newTitle.trim() || isCreating) return;
    setIsCreating(true);
    try {
      await createTask({
        title: newTitle.trim(),
        clientId: clientId as Id<'clients'>,
        ...(newDueDate ? { dueDate: new Date(newDueDate).toISOString() } : {}),
      });
      setNewTitle('');
      setNewDueDate('');
      setShowNewTask(false);
    } finally {
      setIsCreating(false);
    }
  };

  if (tasks === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading tasks...
      </div>
    );
  }

  if (tasks.length === 0 && !showNewTask) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center">
        <p className="text-[12px] text-[var(--m-text-tertiary)]">No tasks yet</p>
        <button
          onClick={() => setShowNewTask(true)}
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
      {/* New task */}
      <div className="px-[var(--m-page-px)] pt-3">
        {showNewTask ? (
          <div className="bg-[var(--m-bg-card)] border border-[var(--m-border-subtle)] rounded-xl p-3 mb-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Task title"
              className="w-full bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none"
              style={{ fontSize: '16px' }}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTask(); }}
            />
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="w-full mt-2 bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none text-[14px]"
              style={{ fontSize: '16px' }}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => { setShowNewTask(false); setNewTitle(''); setNewDueDate(''); }}
                className="px-3 py-1.5 text-[12px] font-medium text-[var(--m-text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                disabled={!newTitle.trim() || isCreating}
                className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[var(--m-accent)] rounded-lg disabled:opacity-40"
              >
                {isCreating ? 'Creating...' : 'Add Task'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewTask(true)}
            className="flex items-center gap-1.5 mb-2 text-[12px] font-medium text-[var(--m-accent-indicator)]"
          >
            <Plus className="w-3.5 h-3.5" /> New Task
          </button>
        )}
      </div>

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
            <span className="ml-1 text-[10px]">{completedExpanded ? '▲' : '▼'}</span>
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
