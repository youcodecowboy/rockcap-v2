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
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function isUrgentType(type: string): boolean {
  return type === 'task' || type === 'reminder' || type === 'flag';
}

export default function NotificationsSection({ notifications, unreadCount }: NotificationsSectionProps) {
  const count = unreadCount ?? 0;

  return (
    <div className="border-t border-[var(--m-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2 bg-[var(--m-bg-subtle)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.5px] font-medium text-[var(--m-text-tertiary)]">
            Notifications
          </span>
          {count > 0 && (
            <span className="bg-[var(--m-error)] text-white text-[9px] font-semibold px-1.5 py-px rounded-full leading-none">
              {count}
            </span>
          )}
        </div>
        <button className="text-[10px] text-[var(--m-accent-indicator)]">View all →</button>
      </div>

      {/* Items or empty state */}
      {!notifications || notifications.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center">
          <span className="text-[11px] text-[var(--m-text-tertiary)]">No new notifications</span>
        </div>
      ) : (
        notifications.map((n) => (
          <div
            key={n._id}
            className="flex items-start gap-2.5 px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
          >
            <div
              className={`w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0 ${
                isUrgentType(n.type) ? 'bg-[var(--m-error)]' : 'bg-[var(--m-accent-indicator)]'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[var(--m-text-primary)] leading-snug">{n.title}</div>
              <div className="text-[10px] text-[var(--m-text-tertiary)] mt-0.5">
                {formatTimestamp(n.createdAt)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
