'use client';

import { Id } from '../../../convex/_generated/dataModel';
import { StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';

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

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function getDueLabel(dueDate: string | undefined, colors: ColorPalette): { text: string; color: string } | null {
  if (!dueDate) return null;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(new Date(dueDate).getFullYear(), new Date(dueDate).getMonth(), new Date(dueDate).getDate());
  const diffDays = Math.round((dueDay.getTime() - todayStart.getTime()) / 86400000);

  if (diffDays < 0) return { text: `Overdue ${Math.abs(diffDays)}d`, color: colors.accent.red };
  if (diffDays === 0) return { text: 'Due today', color: colors.accent.yellow };
  if (diffDays === 1) return { text: 'Tomorrow', color: colors.text.muted };
  if (diffDays < 7) {
    const due = new Date(dueDate);
    return { text: due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), color: colors.text.muted };
  }
  const due = new Date(dueDate);
  return { text: due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), color: colors.text.muted };
}

function priorityTone(priority: string | undefined, colors: ColorPalette): string {
  switch (priority) {
    case 'high': return colors.accent.red;
    case 'medium': return colors.accent.yellow;
    case 'low': return colors.accent.blue;
    default: return colors.accent.yellow;
  }
}

function statusTone(status: string, colors: ColorPalette): string {
  switch (status) {
    case 'in_progress': return colors.accent.blue;
    case 'paused': return colors.accent.yellow;
    case 'completed': return colors.accent.green;
    case 'cancelled': return colors.text.dim;
    default: return colors.text.muted;
  }
}

const priorityLabel: Record<string, string> = { high: 'High', medium: 'Med', low: 'Low' };
const statusLabel: Record<string, string | null> = {
  todo: null,
  in_progress: 'In Progress',
  paused: 'Paused',
  completed: 'Done',
  cancelled: 'Cancelled',
};

export default function TaskListItem({ task, onTap, onToggleComplete }: TaskListItemProps) {
  const colors = useColors();
  const dueLabel = getDueLabel(task.dueDate, colors);
  const isOverdue = dueLabel?.text.startsWith('Overdue');
  const priority = task.priority || 'medium';
  const checkAccent = isOverdue ? colors.accent.red : priorityTone(priority, colors);
  const status = statusLabel[task.status];
  const isCompleted = task.status === 'completed';

  // Left accent color based on status
  const accentBorder = task.status === 'in_progress' ? colors.accent.blue
    : task.status === 'paused' ? colors.accent.yellow
    : isOverdue ? colors.accent.red
    : 'transparent';

  return (
    <div
      className="flex items-center gap-2.5 cursor-pointer"
      style={{
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderLeft: `3px solid ${accentBorder}`,
        borderRadius: 4,
        padding: '10px 12px',
        transition: 'background 100ms linear',
      }}
      onClick={onTap}
    >
      <button
        role="checkbox"
        aria-checked={isCompleted}
        onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
        className="flex-shrink-0"
        style={{
          width: 18,
          height: 18,
          borderRadius: 3,
          border: `2px solid ${isCompleted ? colors.accent.green : checkAccent}`,
          background: isCompleted ? colors.accent.green : 'transparent',
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
        }}
        aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
      >
        {isCompleted && (
          <svg width="100%" height="100%" viewBox="0 0 16 16" fill="none" style={{ color: '#ffffff' }}>
            <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration: isCompleted ? 'line-through' : 'none',
              color: isCompleted ? colors.text.muted : colors.text.primary,
            }}
          >
            {task.title}
          </span>
          {status && (
            <span style={{ flexShrink: 0 }}>
              <StatusPill label={status} tone={statusTone(task.status, colors)} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" style={{ marginTop: 2 }}>
          {task.clientName && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: colors.text.muted }}>{task.clientName}</span>
          )}
          {task.clientName && dueLabel && <span style={{ fontSize: 11, color: colors.text.muted }}>·</span>}
          {dueLabel && <span style={{ fontFamily: MONO, fontSize: 11, color: dueLabel.color }}>{dueLabel.text}</span>}
        </div>
      </div>

      <span style={{ flexShrink: 0 }}>
        <StatusPill label={priorityLabel[priority]} tone={priorityTone(priority, colors)} />
      </span>
    </div>
  );
}
