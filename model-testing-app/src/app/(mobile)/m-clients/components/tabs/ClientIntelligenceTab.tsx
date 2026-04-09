'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';

interface ClientIntelligenceTabProps {
  clientId: string;
}

export default function ClientIntelligenceTab({ clientId }: ClientIntelligenceTabProps) {
  const items = useQuery(api.knowledgeLibrary.getKnowledgeItemsByClient, {
    clientId: clientId as Id<'clients'>,
  });

  if (items === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading intelligence...
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        No intelligence items yet
      </div>
    );
  }

  // Group items by category
  const grouped: Record<string, typeof items> = {};
  const uncategorized: typeof items = [];

  for (const item of items) {
    const cat = (item as Record<string, unknown>)?.category as string | undefined;
    if (cat) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    } else {
      uncategorized.push(item);
    }
  }

  const sortedCategories = Object.keys(grouped).sort();

  const renderItem = (item: (typeof items)[number], idx: number) => {
    const rec = item as Record<string, unknown>;
    // Knowledge items use `label` for the human-readable title and `fieldPath`
    // for the canonical ID (e.g. "company.registrationNumber"). `value` holds
    // the actual data. See convex/schema.ts knowledgeItems table definition.
    const label = (rec?.label as string) || (rec?.fieldPath as string) || 'Untitled';
    const value = rec?.value != null ? String(rec.value) : undefined;
    const sourceDocName = rec?.sourceDocumentName as string | undefined;
    const category = rec?.category as string | undefined;
    const qualifier = rec?.qualifier as string | undefined;

    return (
      <div
        key={rec?._id as string ?? idx}
        className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
              {label}{qualifier ? ` (${qualifier})` : ''}
            </div>
            {value && (
              <div className="text-[12px] text-[var(--m-text-secondary)] mt-0.5 line-clamp-3">
                {value}
              </div>
            )}
            {sourceDocName && (
              <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
                {sourceDocName}
              </div>
            )}
          </div>
          {category && (
            <span className="shrink-0 text-[10px] bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] rounded px-1.5 py-0.5 mt-0.5">
              {category}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {sortedCategories.map((cat) => (
        <div key={cat}>
          <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
            {cat}
          </div>
          {grouped[cat].map((item, idx) => renderItem(item, idx))}
        </div>
      ))}
      {uncategorized.length > 0 && (
        <>
          {sortedCategories.length > 0 && (
            <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
              Other
            </div>
          )}
          {uncategorized.map((item, idx) => renderItem(item, idx))}
        </>
      )}
    </div>
  );
}
