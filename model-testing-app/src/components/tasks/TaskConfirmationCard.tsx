'use client';

interface ParsedTask {
  title: string;
  description?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  assignedTo: string[];
  clientId?: string;
  projectId?: string;
}

interface TaskConfirmationCardProps {
  task: ParsedTask;
  clientName?: string;
  projectName?: string;
  assigneeNames: string[];
  onConfirm: () => void;
  onEdit: () => void;
  isCreating: boolean;
}

export default function TaskConfirmationCard({
  task,
  clientName,
  projectName,
  assigneeNames,
  onConfirm,
  onEdit,
  isCreating,
}: TaskConfirmationCardProps) {
  const formatDate = (d?: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const priorityLabel: Record<string, { color: string }> = {
    high: { color: 'text-red-700' },
    medium: { color: 'text-amber-700' },
    low: { color: 'text-blue-700' },
  };

  return (
    <div className="bg-white border-t border-[var(--m-border)] rounded-t-2xl p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="flex justify-center mb-3">
        <div className="w-9 h-1 rounded-full bg-[var(--m-border)]" />
      </div>
      <div className="text-[15px] font-bold text-[var(--m-text-primary)] mb-3">Here&apos;s your task</div>

      <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg p-3.5">
        <div className="text-sm font-bold text-[var(--m-text-primary)] mb-3">{task.title}</div>
        {task.description && (
          <p className="text-xs text-[var(--m-text-secondary)] mb-3">{task.description}</p>
        )}
        <div className="space-y-2">
          {[
            { label: 'Client', value: clientName || 'Personal' },
            { label: 'Project', value: projectName || '—' },
            { label: 'Due', value: formatDate(task.dueDate) },
            { label: 'Priority', value: task.priority.charAt(0).toUpperCase() + task.priority.slice(1), color: priorityLabel[task.priority]?.color },
            { label: 'Assigned', value: assigneeNames.join(', ') || 'You' },
          ].map(field => (
            <div key={field.label} className="flex justify-between">
              <span className="text-xs text-[var(--m-text-tertiary)]">{field.label}</span>
              <span className={`text-xs font-semibold ${field.color || 'text-[var(--m-text-primary)]'}`}>{field.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2.5 mt-3.5">
        <button
          onClick={onEdit}
          disabled={isCreating}
          className="flex-1 py-3 bg-[var(--m-bg-subtle)] text-[var(--m-text-secondary)] rounded-lg text-sm font-semibold border border-[var(--m-border)]"
        >
          Edit
        </button>
        <button
          onClick={onConfirm}
          disabled={isCreating}
          className="flex-[2] py-3 bg-[var(--m-accent)] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {isCreating ? 'Creating...' : 'Create Task'}
        </button>
      </div>
    </div>
  );
}
