import Link from 'next/link';

interface UpNextItem {
  type: 'task' | 'reminder' | 'event';
  title: string;
  context: string; // e.g. client name
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
    card: 'bg-[#fef2f2] border border-[#fecaca]',
    label: 'text-[#991b1b]',
    subtitle: 'text-[#92400e]',
    badge: 'bg-[#fecaca] text-[#991b1b]',
    badgeText: 'OVERDUE',
  },
  today: {
    card: 'bg-[#fefce8] border border-[#fef08a]',
    label: 'text-[#a16207]',
    subtitle: 'text-[#92400e]',
    badge: 'bg-[#fef08a] text-[#a16207]',
    badgeText: 'DUE TODAY',
  },
  future: {
    card: 'bg-[var(--m-bg-subtle)] border border-[var(--m-border)]',
    label: 'text-[var(--m-text-tertiary)]',
    subtitle: 'text-[var(--m-text-tertiary)]',
    badge: 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]',
    badgeText: 'UPCOMING',
  },
};

export default function UpNextCard({ item }: UpNextCardProps) {
  if (!item) return null;

  const urgency = getUrgency(item.dueDate);
  const style = urgencyStyles[urgency];
  const relativeTime = formatRelativeTime(item.dueDate);

  return (
    <Link href={item.href} className="block mx-[var(--m-page-px)] mb-4">
      <div className={`px-3.5 py-3 rounded-lg ${style.card}`}>
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className={`text-[9px] uppercase tracking-[0.5px] font-semibold mb-1 ${style.label}`}>
              Up Next
            </div>
            <div className="text-[12px] font-medium text-[var(--m-text-primary)] truncate">
              {item.title}
            </div>
            <div className={`text-[10px] mt-0.5 ${style.subtitle}`}>
              {item.context} · {relativeTime}
            </div>
          </div>
          <div className={`text-[9px] font-semibold px-2 py-0.5 rounded flex-shrink-0 ml-3 mt-3 ${style.badge}`}>
            {style.badgeText}
          </div>
        </div>
      </div>
    </Link>
  );
}

export type { UpNextItem };
