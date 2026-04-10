'use client';

import Link from 'next/link';
import { MessageSquare, Flag, ChevronRight } from 'lucide-react';

interface FlagItem {
  _id: string;
  status: string;
  priority?: string;
  entityType?: string;
  note?: string;
  createdAt: string;
}

interface ConversationItem {
  _id: string;
  title?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  unreadCount?: number;
}

interface MessagesFlagsSectionProps {
  flags: FlagItem[] | undefined;
  conversations: ConversationItem[] | undefined;
  openFlagCount: number;
  unreadMessageCount: number;
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

export default function MessagesFlagsSection({
  flags,
  conversations,
  openFlagCount,
  unreadMessageCount,
}: MessagesFlagsSectionProps) {
  const recentFlags = (flags ?? []).slice(0, 2);
  const recentConversations = (conversations ?? []).slice(0, 2);
  const totalCount = openFlagCount + unreadMessageCount;

  return (
    <div className="border-t border-[var(--m-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2 bg-[var(--m-bg-subtle)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">
            Messages & Flags
          </span>
          {totalCount > 0 && (
            <span className="bg-[var(--m-error)] text-white text-[10px] font-semibold px-1.5 py-px rounded-full leading-none">
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
        </div>
        <Link href="/m-inbox" className="text-[11px] text-[var(--m-accent-indicator)]">
          View all →
        </Link>
      </div>

      {/* Content */}
      {recentConversations.length === 0 && recentFlags.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center">
          <span className="text-[12px] text-[var(--m-text-tertiary)]">No messages or flags</span>
        </div>
      ) : (
        <>
          {/* Recent messages */}
          {recentConversations.map((conv) => (
            <Link
              key={conv._id}
              href="/m-inbox"
              className="flex items-center gap-2.5 px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
            >
              <div className="w-7 h-7 rounded-full bg-[var(--m-accent-indicator)]/10 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                    {conv.title || 'Conversation'}
                  </span>
                  {conv.lastMessageAt && (
                    <span className="text-[10px] text-[var(--m-text-tertiary)] ml-2 flex-shrink-0">
                      {formatTimestamp(conv.lastMessageAt)}
                    </span>
                  )}
                </div>
                {conv.lastMessagePreview && (
                  <div className="text-[11px] text-[var(--m-text-tertiary)] truncate mt-0.5">
                    {conv.lastMessagePreview}
                  </div>
                )}
              </div>
              {(conv.unreadCount ?? 0) > 0 && (
                <span className="bg-[var(--m-accent-indicator)] text-white text-[9px] font-semibold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0">
                  {conv.unreadCount}
                </span>
              )}
              <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-placeholder)] flex-shrink-0" />
            </Link>
          ))}

          {/* Recent flags */}
          {recentFlags.map((flag) => (
            <Link
              key={flag._id}
              href="/m-inbox"
              className="flex items-center gap-2.5 px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                flag.priority === 'urgent'
                  ? 'bg-[var(--m-error)]/10'
                  : 'bg-amber-500/10'
              }`}>
                <Flag className={`w-3.5 h-3.5 ${
                  flag.priority === 'urgent'
                    ? 'text-[var(--m-error)]'
                    : 'text-amber-500'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                    {flag.note || 'Flag'}
                  </span>
                  {flag.entityType && (
                    <span className="text-[9px] font-semibold uppercase text-[var(--m-text-tertiary)] bg-[var(--m-bg-subtle)] px-1 py-px rounded flex-shrink-0">
                      {flag.entityType}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-[var(--m-text-tertiary)] mt-0.5">
                  {formatTimestamp(flag.createdAt)}
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-placeholder)] flex-shrink-0" />
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
