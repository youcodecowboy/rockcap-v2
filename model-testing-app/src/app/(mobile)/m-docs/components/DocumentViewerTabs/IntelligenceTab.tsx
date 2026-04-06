'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';

interface IntelligenceTabProps {
  documentId: string;
}

function confidenceClass(pct: number): string {
  if (pct >= 80) return 'bg-green-100 text-green-800';
  if (pct >= 60) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

export default function IntelligenceTab({ documentId }: IntelligenceTabProps) {
  const items = useQuery(api.documents.getDocumentIntelligence, {
    documentId: documentId as Id<'documents'>,
  });

  if (items === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
        Loading...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
        <p>No intelligence extracted yet</p>
        <p className="mt-1">Run analysis from the desktop app</p>
      </div>
    );
  }

  // Group items by category
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const cat = item.category ?? 'Other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  return (
    <div className="pb-6">
      {Array.from(grouped.entries()).map(([category, groupItems]) => (
        <div key={category}>
          {/* Section header */}
          <div className="px-[var(--m-page-px)] py-2 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
            <p className="text-[12px] font-semibold text-[var(--m-text-secondary)] uppercase tracking-wide">
              {category}
            </p>
          </div>

          {/* Items */}
          {groupItems.map((item) => {
            const confPct =
              item.normalizationConfidence !== undefined
                ? Math.round(item.normalizationConfidence * 100)
                : undefined;

            return (
              <div
                key={item._id}
                className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]"
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[12px] text-[var(--m-text-tertiary)]">
                    {item.label ?? item.fieldPath}
                  </span>
                  {confPct !== undefined && (
                    <span
                      className={[
                        'inline-flex items-center px-2 py-0.5 text-[11px] rounded-full shrink-0',
                        confidenceClass(confPct),
                      ].join(' ')}
                    >
                      {confPct}%
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-[var(--m-text-primary)]">
                  {String(item.value ?? '')}
                </p>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
