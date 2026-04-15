import Link from 'next/link';

interface UpNextItem {
  type: 'task' | 'reminder' | 'event';
  title: string;
  context: string;
  dueDate: Date;
  href: string;
}

interface UpNextCardProps {
  item: UpNextItem | null;
}

function getUrgency(dueDate: Date): 'overdue' | 'today' | 'future' {
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) return 'overdue';
  if (diffHours < 24) return 'today';
  return 'future';
}

function formatRelativeTime(dueDate: Date): string {
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);
  const minutes = Math.floor(absDiffMs / 60000);
  const hours = Math.floor(absDiffMs / 3600000);
  const days = Math.floor(absDiffMs / 86400000);

  if (days > 0) {
    const label = `${days}d`;
    return diffMs < 0 ? `Due ${label} ago` : `In ${label}`;
  }
  if (hours > 0) {
    const label = `${hours}h`;
    return diffMs < 0 ? `Due ${label} ago` : `In ${label}`;
  }
  const label = `${Math.max(1, minutes)}m`;
  return diffMs < 0 ? `Due ${label} ago` : `In ${label}`;
}

const urgencyStyles = {
  overdue: {
    border: 'border-l-[var(--m-error)]',
    label: 'text-[var(--m-error)]',
    badge: 'bg-red-50 text-[#991b1b]',
    badgeText: 'OVERDUE',
  },
  today: {
    border: 'border-l-[var(--m-warning)]',
    label: 'text-[var(--m-warning)]',
    badge: 'bg-amber-50 text-[#92400e]',
    badgeText: 'DUE TODAY',
  },
  future: {
    border: 'border-l-[var(--m-text-tertiary)]',
    label: 'text-[var(--m-text-tertiary)]',
    badge: 'bg-[var(--m-bg-subtle)] text-[var(--m-text-secondary)]',
    badgeText: 'UPCOMING',
  },
};

export default function UpNextCard({ item }: UpNextCardProps) {
  if (!item) return null;

  const urgency = getUrgency(item.dueDate);
  const style = urgencyStyles[urgency];
  const relativeTime = formatRelativeTime(item.dueDate);

  return (
    <Link href={item.href} className="block mx-[var(--m-page-px)] mb-3">
      <div className={`px-4 py-3.5 bg-[var(--m-bg-card)] border border-[var(--m-border)] border-l-4 ${style.border} rounded-[var(--m-card-radius)]`}>
        <div className="flex justify-between items-center mb-1.5">
          <span className={`text-[10px] uppercase tracking-[0.5px] font-semibold ${style.label}`}>
            Up Next
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${style.badge}`}>
            {style.badgeText}
          </span>
        </div>
        <div className="text-[14px] font-semibold text-[var(--m-text-primary)]">
          {item.title}
        </div>
        <div className="text-[12px] text-[var(--m-text-tertiary)] mt-1">
          {item.context} · {relativeTime}
        </div>
      </div>
    </Link>
  );
}

export type { UpNextItem };
