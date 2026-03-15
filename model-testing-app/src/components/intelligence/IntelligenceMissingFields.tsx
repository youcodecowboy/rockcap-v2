'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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

function getPriorityStyles(priority: MissingFieldItem['priority']): string {
  switch (priority) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100';
    case 'important':
      return 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100';
    case 'optional':
    default:
      return 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200';
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

export function IntelligenceMissingFields({
  missingFields,
  onAddField,
  className,
}: IntelligenceMissingFieldsProps) {
  if (!missingFields || missingFields.length === 0) {
    return null;
  }

  const sorted = [...missingFields].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Missing Fields ({missingFields.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((field) => {
          const priorityLabel = getPriorityLabel(field.priority);
          const chipStyles = getPriorityStyles(field.priority);
          const isClickable = !!onAddField;

          const chipContent = (
            <>
              <span className="text-xs font-medium">{field.label}</span>
              {priorityLabel && (
                <span className="text-[10px] opacity-70 ml-0.5">· {priorityLabel}</span>
              )}
            </>
          );

          if (isClickable) {
            return (
              <button
                key={field.key}
                onClick={() => onAddField(field.key)}
                className={cn(
                  'inline-flex items-center px-2 py-1 rounded-full border text-left transition-colors',
                  chipStyles
                )}
              >
                {chipContent}
              </button>
            );
          }

          return (
            <span
              key={field.key}
              className={cn(
                'inline-flex items-center px-2 py-1 rounded-full border',
                chipStyles
              )}
            >
              {chipContent}
            </span>
          );
        })}
      </div>
    </div>
  );
}
