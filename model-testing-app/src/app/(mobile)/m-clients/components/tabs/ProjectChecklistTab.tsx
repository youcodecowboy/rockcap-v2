'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';

interface ProjectChecklistTabProps {
  projectId: string;
}

const nextStatus = (current: string) => {
  if (current === 'missing') return 'pending_review';
  if (current === 'pending_review') return 'fulfilled';
  return 'missing';
};

const statusConfig: Record<string, { label: string; classes: string }> = {
  missing: { label: 'Missing', classes: 'bg-red-100 text-red-700' },
  pending_review: { label: 'Pending', classes: 'bg-amber-100 text-amber-700' },
  fulfilled: { label: 'Fulfilled', classes: 'bg-green-100 text-green-700' },
};

export default function ProjectChecklistTab({ projectId }: ProjectChecklistTabProps) {
  const items = useQuery(api.knowledgeLibrary.getChecklistByProject, {
    projectId: projectId as Id<'projects'>,
  });
  const updateItemStatus = useMutation(api.knowledgeLibrary.updateItemStatus);

  if (items === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading checklist...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        No checklist items
      </div>
    );
  }

  const total = items.length;
  const fulfilled = items.filter((i) => i.status === 'fulfilled').length;
  const percentage = Math.round((fulfilled / total) * 100);

  // Group items by category
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.category || 'Other';
    const group = grouped.get(key);
    if (group) {
      group.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return (
    <div>
      {/* Progress bar */}
      <div className="px-[var(--m-page-px)] pt-4 pb-3">
        <div className="h-2.5 rounded-full bg-[var(--m-bg-inset)]">
          <div
            className="h-2.5 rounded-full bg-green-500 transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-[var(--m-text-tertiary)]">
          {percentage}% &middot; {fulfilled}/{total} fulfilled
        </p>
      </div>

      {/* Grouped checklist items */}
      {Array.from(grouped.entries()).map(([category, categoryItems]) => (
        <div key={category}>
          {/* Category header */}
          <div className="border-y border-[var(--m-border-subtle)] bg-[var(--m-bg-subtle)] px-[var(--m-page-px)] py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
              {category}
            </span>
          </div>

          {/* Items */}
          {categoryItems.map((item) => {
            const config = statusConfig[item.status] || statusConfig.missing;
            return (
              <div
                key={item._id}
                className="flex items-center gap-2.5 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]"
              >
                <button
                  type="button"
                  className={`text-[10px] px-2 py-1 rounded-full font-medium flex-shrink-0 active:opacity-70 ${config.classes}`}
                  onClick={() =>
                    updateItemStatus({
                      checklistItemId: item._id as Id<'knowledgeChecklistItems'>,
                      status: nextStatus(item.status),
                    })
                  }
                >
                  {config.label}
                </button>
                <div className="min-w-0">
                  <p className="text-[13px] text-[var(--m-text-primary)] truncate">
                    {item.name}
                  </p>
                  {item.primaryDocument && (
                    <p className="text-[11px] text-[var(--m-text-tertiary)] truncate">
                      {item.primaryDocument.documentName}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
