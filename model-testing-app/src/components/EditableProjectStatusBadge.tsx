'use client';

import { ChevronDown } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { projectStatusTone } from '@/components/layouts';

type ProjectStatus = 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled';

interface EditableProjectStatusBadgeProps {
  status: ProjectStatus | undefined;
  onStatusChange: (status: ProjectStatus) => void;
  className?: string;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  completed: 'Completed',
  'on-hold': 'On Hold',
  cancelled: 'Cancelled',
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function EditableProjectStatusBadge({
  status,
  onStatusChange,
  className = '',
}: EditableProjectStatusBadgeProps) {
  const colors = useColors();
  const currentStatus = status || 'active';
  const tone = projectStatusTone(currentStatus, colors);

  return (
    <div className={className} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        value={currentStatus}
        onChange={(e) => onStatusChange(e.target.value as ProjectStatus)}
        style={{
          appearance: 'none',
          cursor: 'pointer',
          fontFamily: MONO,
          fontSize: 9,
          lineHeight: 1.3,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          padding: '2px 20px 2px 6px',
          borderRadius: 2,
          background: `${tone}20`,
          color: tone,
          border: `1px solid ${tone}40`,
          outline: 'none',
        }}
      >
        {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((value) => (
          <option key={value} value={value} style={{ color: colors.text.primary, background: colors.bg.card }}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </select>
      <ChevronDown
        size={11}
        style={{ position: 'absolute', right: 5, color: tone, pointerEvents: 'none', opacity: 0.7 }}
      />
    </div>
  );
}
