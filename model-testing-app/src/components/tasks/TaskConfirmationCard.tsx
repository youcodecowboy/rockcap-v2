'use client';

import { Panel, Row, Button } from '@/components/layouts';
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

interface TaskConfirmationCardProps {
  task: ParsedTask;
  clientName?: string;
  projectName?: string;
  assigneeNames: string[];
  onConfirm: () => void;
  onEdit: () => void;
  isCreating: boolean;
}

function priorityTone(priority: string, colors: ColorPalette): string {
  switch (priority) {
    case 'high': return colors.accent.red;
    case 'medium': return colors.accent.yellow;
    case 'low': return colors.accent.blue;
    default: return colors.accent.yellow;
  }
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
  const colors = useColors();
  const formatDate = (d?: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <Panel title="Here's your task">
      <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, marginBottom: 10 }}>{task.title}</div>
      {task.description && (
        <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{task.description}</p>
      )}
      <div>
        <Row label="Client" value={clientName || 'Personal'} />
        <Row label="Project" value={projectName || '—'} />
        <Row label="Due" value={formatDate(task.dueDate)} mono />
        <Row
          label="Priority"
          value={task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          pill={priorityTone(task.priority, colors)}
        />
        <Row label="Assigned" value={assigneeNames.join(', ') || 'You'} />
      </div>

      <div className="flex gap-2.5" style={{ marginTop: 14 }}>
        <Button variant="secondary" onClick={onEdit} disabled={isCreating} style={{ flex: 1, justifyContent: 'center' }}>
          Edit
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={isCreating} style={{ flex: 2, justifyContent: 'center' }}>
          {isCreating ? 'Creating...' : 'Create Task'}
        </Button>
      </div>
    </Panel>
  );
}
