'use client';

import Link from 'next/link';
import { Sparkles, ChevronRight } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';

export default function DailyBriefWidget() {
  const brief = useQuery(api.dailyBriefs.getToday, {});
  const content = brief?.content;

  const subtitle = content?.summary
    ? `${content.summary.overdue} overdue · ${content.summary.meetings} meetings · ${content.summary.openFlags} flags`
    : 'Your AI-generated morning summary';

  const hasAttention = content?.attentionNeeded?.items?.length > 0;

  return (
    <Link href="/m-brief" className="block mx-[var(--m-page-px)] mb-3">
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] px-4 py-3.5 active:bg-[var(--m-bg-subtle)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-[var(--m-bg-brand)] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-[var(--m-text-on-brand)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-[var(--m-text-primary)]">
              Daily Brief
            </div>
            <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
              {subtitle}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--m-text-placeholder)] flex-shrink-0" />
        </div>

        {hasAttention && (
          <div className="mt-2.5 pt-2.5 border-t border-[var(--m-border-subtle)]">
            {content.attentionNeeded.items.slice(0, 2).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className={`text-[11px] ${item.urgency === 'high' ? 'text-[var(--m-error)]' : 'text-[var(--m-warning)]'}`}>
                  {item.type === 'flag' ? 'F' : '!'}
                </span>
                <span className="text-[12px] text-[var(--m-text-secondary)] truncate">{item.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
