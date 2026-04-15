import Link from 'next/link';
import { AlertCircle, FileText, CheckCircle, Bell } from 'lucide-react';

interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  isRead?: boolean;
}

interface NotificationsSectionProps {
  notifications: Notification[] | undefined;
  unreadCount: number | undefined;
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return '1d';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getIcon(type: string) {
  switch (type) {
    case 'task':
    case 'reminder':
      return { Icon: AlertCircle, color: 'text-[var(--m-error)]' };
    case 'flag':
      return { Icon: AlertCircle, color: 'text-[var(--m-warning)]' };
    case 'document':
      return { Icon: FileText, color: 'text-[var(--m-text-tertiary)]' };
    default:
      return { Icon: Bell, color: 'text-[var(--m-text-tertiary)]' };
  }
}

export default function NotificationsSection({ notifications, unreadCount }: NotificationsSectionProps) {
  const count = unreadCount ?? 0;

  return (
    <div className="mx-[var(--m-page-px)] mb-3">
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--m-border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">
              Notifications
            </span>
            {count > 0 && (
              <span className="bg-[var(--m-error)] text-white text-[11px] font-semibold px-1.5 py-px rounded-full leading-none">
                {count}
              </span>
            )}
          </div>
          <Link href="/m-inbox" className="text-[12px] text-[var(--m-text-tertiary)] font-medium">
            View all
          </Link>
        </div>

        {/* Items */}
        {!notifications || notifications.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <span className="text-[13px] text-[var(--m-text-tertiary)]">No new notifications</span>
          </div>
        ) : (
          notifications.map((n) => {
            const { Icon, color } = getIcon(n.type);
            return (
              <div
                key={n._id}
                className="flex items-center gap-3 px-4 py-3 border-b border-[var(--m-border-subtle)] last:border-b-0 active:bg-[var(--m-bg-subtle)]"
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-[var(--m-text-primary)] leading-snug">{n.title}</div>
                  <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5 truncate">{n.message}</div>
                </div>
                <span className="text-[11px] text-[var(--m-text-tertiary)] flex-shrink-0">
                  {formatTimestamp(n.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
