'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { KnownDataCard, SourceInfo } from './KnownDataCard';
import { MissingDataList, MissingField } from './MissingDataList';
import { CompletenessBar } from './CompletenessIndicator';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export interface KnownField {
  key: string;
  label: string;
  value: string | number | undefined;
  source?: SourceInfo;
  editable?: boolean;
  multiline?: boolean;
  type?: 'text' | 'email' | 'tel' | 'url' | 'number';
  secondaryValue?: string;
  isCritical?: boolean;
}

interface IntelligenceSectionProps {
  title: string;
  icon?: ReactNode;
  knownFields: KnownField[];
  missingFields: MissingField[];
  onEditField?: (key: string, value: string) => void;
  onAddField?: (key: string, value: string) => void;
  showCompleteness?: boolean;
  className?: string;
  emptyState?: ReactNode;
  gridCols?: 1 | 2 | 3;
}

export function IntelligenceSection({
  title,
  icon,
  knownFields,
  missingFields,
  onEditField,
  onAddField,
  showCompleteness = true,
  className,
  emptyState,
  gridCols = 2,
}: IntelligenceSectionProps) {
  const filledCount = knownFields.filter((f) => f.value !== undefined && f.value !== '').length;
  const totalCount = knownFields.length + missingFields.length;
  const criticalMissing = missingFields.filter((f) => f.priority === 'critical').length;
  const isComplete = missingFields.length === 0 && filledCount === knownFields.length;

  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  }[gridCols];

  // No data at all
  if (knownFields.length === 0 && missingFields.length === 0) {
    return emptyState ? (
      <div className={className}>{emptyState}</div>
    ) : null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {isComplete ? (
            <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Complete
            </Badge>
          ) : criticalMissing > 0 ? (
            <Badge variant="outline" className="text-xs border-red-300 text-red-700 bg-red-50">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {criticalMissing} critical missing
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Completeness Bar */}
      {showCompleteness && totalCount > 0 && (
        <CompletenessBar filled={filledCount} total={totalCount} />
      )}

      {/* Known Data Section */}
      {filledCount > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            What We Know
            <span className="text-xs text-gray-400 font-normal">({filledCount} fields)</span>
          </h4>
          <div className={cn('grid gap-3', gridColsClass)}>
            {knownFields
              .filter((f) => f.value !== undefined && f.value !== '')
              .map((field) => (
                <KnownDataCard
                  key={field.key}
                  label={field.label}
                  value={field.value}
                  source={field.source}
                  editable={field.editable ?? true}
                  onEdit={onEditField ? (value) => onEditField(field.key, value) : undefined}
                  multiline={field.multiline}
                  type={field.type}
                  secondaryValue={field.secondaryValue}
                  isCritical={field.isCritical}
                />
              ))}
          </div>
        </div>
      )}

      {/* Missing Data Section */}
      {missingFields.length > 0 && (
        <MissingDataList
          fields={missingFields}
          onAddField={onAddField}
          title="Still Needed"
          defaultExpanded={filledCount === 0}
        />
      )}

      {/* Empty Known Data State */}
      {filledCount === 0 && missingFields.length > 0 && (
        <div className="text-center py-4 text-sm text-gray-500">
          No data captured yet. Add information manually or upload relevant documents.
        </div>
      )}
    </div>
  );
}

// Utility function to separate known vs unknown fields
export function categorizeFields<T extends Record<string, unknown>>(
  data: T,
  fieldDefinitions: Array<{
    key: keyof T;
    label: string;
    priority?: 'critical' | 'important' | 'optional';
    expectedSource?: string;
    multiline?: boolean;
    type?: 'text' | 'email' | 'tel' | 'url' | 'number';
    isCritical?: boolean;
    getSource?: (data: T) => SourceInfo | undefined;
    getSecondaryValue?: (data: T) => string | undefined;
  }>
): { known: KnownField[]; missing: MissingField[] } {
  const known: KnownField[] = [];
  const missing: MissingField[] = [];

  for (const field of fieldDefinitions) {
    const value = data[field.key];
    const hasValue = value !== undefined && value !== null && value !== '';

    if (hasValue) {
      known.push({
        key: field.key as string,
        label: field.label,
        value: value as string | number,
        source: field.getSource?.(data),
        multiline: field.multiline,
        type: field.type,
        isCritical: field.isCritical,
        secondaryValue: field.getSecondaryValue?.(data),
      });
    } else {
      missing.push({
        key: field.key as string,
        label: field.label,
        priority: field.priority,
        expectedSource: field.expectedSource,
        multiline: field.multiline,
        type: field.type,
      });
    }
  }

  return { known, missing };
}

// Export component for creating section summaries in sidebar
interface SectionSummaryProps {
  label: string;
  filled: number;
  total: number;
  criticalMissing?: number;
  isActive?: boolean;
  onClick?: () => void;
}

export function SectionSummary({
  label,
  filled,
  total,
  criticalMissing = 0,
  isActive = false,
  onClick,
}: SectionSummaryProps) {
  const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
  const isComplete = filled === total && total > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors',
        isActive ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50',
        criticalMissing > 0 && !isActive && 'border-l-2 border-l-red-400'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn('text-sm truncate', isActive ? 'font-medium text-blue-900' : 'text-gray-700')}>
          {label}
        </span>
        {isComplete && (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {criticalMissing > 0 && (
          <Badge variant="destructive" className="text-[9px] px-1 py-0">
            {criticalMissing}
          </Badge>
        )}
        <span className={cn(
          'text-xs',
          isComplete ? 'text-green-600' : percentage >= 50 ? 'text-blue-600' : 'text-gray-400'
        )}>
          {filled}/{total}
        </span>
      </div>
    </button>
  );
}
