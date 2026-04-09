'use client';

import { Clock, CheckSquare, History, Flag, AtSign, Bell, MessageSquare } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  reminder: { icon: Clock, color: 'text-blue-500' },
  task: { icon: CheckSquare, color: 'text-purple-500' },
  changelog: { icon: History, color: 'text-green-500' },
  flag: { icon: Flag, color: 'text-orange-500' },
  mention: { icon: AtSign, color: 'text-blue-500' },
  message: { icon: MessageSquare, color: 'text-[var(--m-accent)]' },
  file_upload: { icon: Bell, color: 'text-gray-500' },
};

function formatTime(dateString: string): string {
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

export default function MobileNotificationList() {
  const notifications = useQuery(api.notifications.getRecent, {
    limit: 50,
    includeRead: true,
  });
  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length ?? 0;

  return (
    <div>
      {unreadCount > 0 && (
        <div className="flex justify-end px-[var(--m-page-px)] py-2 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
          <button
            onClick={() => markAllAsRead({})}
            className="text-[11px] text-[var(--m-accent)] font-medium active:opacity-70"
          >
            Mark all as read
          </button>
        </div>
      )}

      {!notifications || notifications.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[13px] text-[var(--m-text-tertiary)]">No notifications</p>
        </div>
      ) : (
        notifications.map((notif: any) => {
          const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.file_upload;
          const Icon = config.icon;
          const unread = !notif.isRead;

          return (
            <button
              key={notif._id}
              onClick={() => {
                if (unread) markAsRead({ id: notif._id });
              }}
              className={`w-full flex items-start gap-3 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left ${
                unread ? 'bg-[var(--m-accent-subtle)]/30' : ''
              }`}
            >
              <div className="mt-0.5">
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-[13px] leading-snug ${
                    unread ? 'font-semibold text-[var(--m-text-primary)]' : 'text-[var(--m-text-primary)]'
                  }`}
                >
                  {notif.title}
                </p>
                {notif.message && (
                  <p className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
                    {notif.message}
                  </p>
                )}
                <p className="text-[10px] text-[var(--m-text-tertiary)] mt-0.5">
                  {formatTime(notif.createdAt)}
                </p>
              </div>
              {unread && (
                <div className="w-2 h-2 rounded-full bg-[var(--m-accent-indicator)] mt-1.5 flex-shrink-0" />
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
