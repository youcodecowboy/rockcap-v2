'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface IntelligenceFieldsListProps {
  fields: any[] | undefined | null;
  defaultExpanded?: boolean;
}

export default function IntelligenceFieldsList({ fields, defaultExpanded = false }: IntelligenceFieldsListProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!fields || fields.length === 0) return null;

  function confidenceBadge(confidence: number) {
    if (confidence >= 0.9) {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0fdf4] text-[var(--m-success)]">High</span>;
    }
    if (confidence >= 0.7) {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fefce8] text-[var(--m-warning)]">Med</span>;
    }
    return <span className="text-[10px] px-1.5 py-0.5 rounded text-[var(--m-error)]">Low</span>;
  }

  function scopeBadge(scope: string) {
    if (scope === 'client') {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fefce8] text-[var(--m-warning)]">C</span>;
    }
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--m-accent-subtle)] text-[var(--m-accent-indicator)]">P</span>;
  }

  return (
    <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <span className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase">
          Intelligence Fields ({fields.length})
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[var(--m-text-tertiary)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--m-text-tertiary)]" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {fields.map((field: any, i: number) => (
            <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-[var(--m-border-subtle)] last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-[var(--m-text-primary)] truncate">{field.label}</div>
                <div className="text-[11px] text-[var(--m-text-secondary)] truncate">{field.value}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {confidenceBadge(field.confidence)}
                {scopeBadge(field.scope)}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-[var(--m-text-tertiary)] pt-1">
            Fields saved to client/project intelligence when filed
          </p>
        </div>
      )}
    </div>
  );
}
