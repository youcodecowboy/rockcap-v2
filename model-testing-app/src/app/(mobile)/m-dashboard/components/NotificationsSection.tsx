'use client';

import Link from 'next/link';
import { AlertCircle, FileText, CheckCircle, Bell, Flag, Clock, CheckSquare, AtSign, MessageSquare } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';

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

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  reminder: { icon: Clock, color: 'text-blue-500' },
  task: { icon: CheckSquare, color: 'text-purple-500' },
  flag: { icon: Flag, color: 'text-orange-500' },
  mention: { icon: AtSign, color: 'text-blue-500' },
  message: { icon: MessageSquare, color: 'text-[var(--m-accent)]' },
  file_upload: { icon: FileText, color: 'text-gray-500' },
  changelog: { icon: CheckCircle, color: 'text-green-500' },
};

export default function NotificationsSection({ notifications, unreadCount }: NotificationsSectionProps) {
  const count = unreadCount ?? 0;
  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);

  const handleTap = (n: Notification) => {
    if (!n.isRead) {
      markAsRead({ id: n._id as Id<'notifications'> });
    }
  };

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
          <div className="flex items-center gap-3">
            {count > 0 && (
              <button
                onClick={() => markAllAsRead({})}
                className="text-[12px] text-[var(--m-accent)] font-medium active:opacity-70"
              >
                Mark all read
              </button>
            )}
            <Link href="/m-inbox" className="text-[12px] text-[var(--m-text-tertiary)] font-medium">
              View all
            </Link>
          </div>
        </div>

        {/* Items */}
        {!notifications || notifications.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <span className="text-[13px] text-[var(--m-text-tertiary)]">No new notifications</span>
          </div>
        ) : (
          notifications.map((n) => {
            const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.file_upload;
            const Icon = config.icon;
            const unread = !n.isRead;

            return (
              <button
                key={n._id}
                onClick={() => handleTap(n)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--m-border-subtle)] last:border-b-0 active:bg-[var(--m-bg-subtle)] text-left ${
                  unread ? 'bg-[var(--m-accent-subtle)]/30' : ''
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] leading-snug ${
                    unread ? 'font-semibold text-[var(--m-text-primary)]' : 'font-medium text-[var(--m-text-primary)]'
                  }`}>
                    {n.title}
                  </div>
                  <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5 truncate">{n.message}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-[var(--m-text-tertiary)]">
                    {formatTimestamp(n.createdAt)}
                  </span>
                  {unread && (
                    <div className="w-2 h-2 rounded-full bg-[var(--m-accent-indicator)]" />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
