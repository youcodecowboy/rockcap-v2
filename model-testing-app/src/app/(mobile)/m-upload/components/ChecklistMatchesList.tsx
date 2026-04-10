'use client';

import { Check } from 'lucide-react';

interface ChecklistMatchesListProps {
  matches: any[] | undefined | null;
}

export default function ChecklistMatchesList({ matches }: ChecklistMatchesListProps) {
  if (!matches || matches.length === 0) return null;

  return (
    <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3">
      <div className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-3">
        Checklist Matches ({matches.length})
      </div>
      <div className="space-y-2">
        {matches.map((match: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[var(--m-success)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-[var(--m-text-primary)] truncate">
                {match.itemName || match.name}
              </div>
              <div className="text-[10px] text-[var(--m-text-tertiary)]">
                {match.category}{match.confidence != null ? ` \u00b7 ${Math.round(match.confidence * 100)}% match` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
