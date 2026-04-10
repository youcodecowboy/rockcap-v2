'use client';

import { Id } from '../../../convex/_generated/dataModel';

interface Task {
  _id: Id<'tasks'>;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled' | 'paused';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  clientId?: Id<'clients'>;
  clientName?: string;
}

interface TaskListItemProps {
  task: Task;
  onTap: () => void;
  onToggleComplete: () => void;
}

function getDueLabel(dueDate?: string): { text: string; color: string } | null {
  if (!dueDate) return null;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(new Date(dueDate).getFullYear(), new Date(dueDate).getMonth(), new Date(dueDate).getDate());
  const diffDays = Math.round((dueDay.getTime() - todayStart.getTime()) / 86400000);

  if (diffDays < 0) return { text: `Overdue ${Math.abs(diffDays)}d`, color: 'text-red-600' };
  if (diffDays === 0) return { text: 'Due today', color: 'text-amber-600' };
  if (diffDays === 1) return { text: 'Tomorrow', color: 'text-[var(--m-text-tertiary)]' };
  if (diffDays < 7) {
    const due = new Date(dueDate);
    return { text: due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), color: 'text-[var(--m-text-tertiary)]' };
  }
  const due = new Date(dueDate);
  return { text: due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), color: 'text-[var(--m-text-tertiary)]' };
}

const priorityColors: Record<string, string> = {
  high: 'border-red-500',
  medium: 'border-amber-500',
  low: 'border-blue-500',
};

const priorityBadge: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-red-50', text: 'text-red-700', label: 'High' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Med' },
  low: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Low' },
};

export default function TaskListItem({ task, onTap, onToggleComplete }: TaskListItemProps) {
  const dueLabel = getDueLabel(task.dueDate);
  const isOverdue = dueLabel?.text.startsWith('Overdue');
  const checkBorder = isOverdue ? 'border-red-500' : (priorityColors[task.priority || 'medium']);
  const badge = priorityBadge[task.priority || 'medium'];

  return (
    <div
      className="bg-white border border-[var(--m-border)] rounded-lg px-3 py-2.5 flex items-center gap-2.5 active:bg-[var(--m-bg-subtle)] transition-colors cursor-pointer"
      onClick={onTap}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
        className={`w-[18px] h-[18px] rounded border-2 flex-shrink-0 ${checkBorder} ${
          task.status === 'completed' ? 'bg-green-500 border-green-500' : ''
        }`}
        aria-label={task.status === 'completed' ? 'Mark incomplete' : 'Mark complete'}
      >
        {task.status === 'completed' && (
          <svg className="w-full h-full text-white" viewBox="0 0 16 16" fill="none">
            <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-semibold truncate ${
          task.status === 'completed' ? 'line-through text-[var(--m-text-tertiary)]' : 'text-[var(--m-text-primary)]'
        }`}>
          {task.title}
        </div>
        <div className="text-[11px] mt-0.5 flex items-center gap-1">
          {task.clientName && (
            <span className="text-[var(--m-text-tertiary)]">{task.clientName}</span>
          )}
          {task.clientName && dueLabel && <span className="text-[var(--m-text-tertiary)]">·</span>}
          {dueLabel && <span className={dueLabel.color}>{dueLabel.text}</span>}
        </div>
      </div>

      {badge && (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      )}
    </div>
  );
}
