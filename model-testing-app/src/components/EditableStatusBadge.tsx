'use client';

import { ChevronDown } from 'lucide-react';
import { useColors } from '@/lib/useColors';

type ClientStatus = 'prospect' | 'active' | 'archived' | 'past';

interface EditableStatusBadgeProps {
  status: ClientStatus | undefined;
  onStatusChange: (status: ClientStatus) => void;
  className?: string;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const STATUS_LABELS: Record<ClientStatus, string> = {
  prospect: 'Prospective',
  active: 'Active',
  archived: 'Archived',
  past: 'Inactive',
};

function statusTone(status: ClientStatus, colors: ReturnType<typeof useColors>): string {
  switch (status) {
    case 'prospect':
      return colors.accent.blue;
    case 'active':
      return colors.accent.green;
    case 'archived':
    case 'past':
    default:
      return colors.text.muted;
  }
}

// Token-styled inline-editable status pill. A transparent native <select>
// overlays a StatusPill-style chip so the edit/save logic stays identical.
export default function EditableStatusBadge({
  status,
  onStatusChange,
  className = '',
}: EditableStatusBadgeProps) {
  const colors = useColors();
  const currentStatus = status || 'active';
  const tone = statusTone(currentStatus, colors);

  return (
    <span className={className} style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px',
          borderRadius: 2,
          fontFamily: MONO,
          fontSize: 9,
          lineHeight: 1.3,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          background: `${tone}20`,
          color: tone,
          border: `1px solid ${tone}40`,
          cursor: 'pointer',
        }}
      >
        {STATUS_LABELS[currentStatus]}
        <ChevronDown style={{ width: 10, height: 10, opacity: 0.6 }} />
      </span>
      <select
        value={currentStatus}
        onChange={(e) => onStatusChange(e.target.value as ClientStatus)}
        aria-label="Change status"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          appearance: 'none',
        }}
      >
        {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((value) => (
          <option key={value} value={value}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </select>
    </span>
  );
}
