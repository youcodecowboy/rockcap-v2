'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface MissingFieldItem {
  key: string;
  label: string;
  priority: 'critical' | 'important' | 'optional';
}

interface IntelligenceMissingFieldsProps {
  missingFields: MissingFieldItem[];
  onAddField?: (fieldKey: string) => void;
  className?: string;
}

const PRIORITY_ORDER: Record<MissingFieldItem['priority'], number> = {
  critical: 0,
  important: 1,
  optional: 2,
};

function priorityTone(priority: MissingFieldItem['priority'], colors: ColorPalette): string {
  switch (priority) {
    case 'critical':
      return colors.accent.red;
    case 'important':
      return colors.accent.orange;
    case 'optional':
    default:
      return colors.text.muted;
  }
}

function getPriorityLabel(priority: MissingFieldItem['priority']): string | null {
  switch (priority) {
    case 'critical':
      return 'critical';
    case 'important':
      return 'important';
    default:
      return null;
  }
}

function Chip({
  tone,
  clickable,
  onClick,
  children,
}: {
  tone: string;
  clickable: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    borderRadius: 2,
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.04em',
    fontWeight: 500,
    border: `1px solid ${tone}40`,
    color: tone,
    background: clickable && hover ? `${tone}20` : `${tone}12`,
    transition: 'background 100ms linear',
    textAlign: 'left',
  };
  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={style}
      >
        {children}
      </button>
    );
  }
  return <span style={style}>{children}</span>;
}

export function IntelligenceMissingFields({
  missingFields,
  onAddField,
  className,
}: IntelligenceMissingFieldsProps) {
  const colors = useColors();

  if (!missingFields || missingFields.length === 0) {
    return null;
  }

  const sorted = [...missingFields].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );

  return (
    <div className={cn('space-y-2', className)}>
      <p
        style={{
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 500,
          color: colors.text.muted,
        }}
      >
        Missing Fields ({missingFields.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((field) => {
          const priorityLabel = getPriorityLabel(field.priority);
          const tone = priorityTone(field.priority, colors);
          const isClickable = !!onAddField;

          return (
            <Chip
              key={field.key}
              tone={tone}
              clickable={isClickable}
              onClick={isClickable ? () => onAddField!(field.key) : undefined}
            >
              <span>{field.label}</span>
              {priorityLabel && <span style={{ opacity: 0.7 }}>· {priorityLabel}</span>}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
