import Link from 'next/link';
import { Sparkles, ChevronRight } from 'lucide-react';

export default function DailyBriefWidget() {
  return (
    <Link href="/m-brief" className="block mx-[var(--m-page-px)] mb-3">
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] px-4 py-3.5 flex items-center gap-3 active:bg-[var(--m-bg-subtle)]">
        <div className="w-9 h-9 rounded-[10px] bg-[var(--m-bg-brand)] flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-[var(--m-text-on-brand)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-[var(--m-text-primary)]">
            Daily Brief
          </div>
          <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
            Your AI-generated morning summary
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-[var(--m-text-placeholder)] flex-shrink-0" />
      </div>
    </Link>
  );
}
