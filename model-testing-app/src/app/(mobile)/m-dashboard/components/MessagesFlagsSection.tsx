'use client';

import Link from 'next/link';
import { MessageSquare, Flag } from 'lucide-react';

interface EnrichedItem {
  kind: 'flag' | 'notification';
  id: string;
  createdAt: string;
  data: {
    note?: string;
    priority?: string;
    entityType?: string;
    status?: string;
  };
  entityName?: string;
  entityContext?: string;
}

interface ConversationItem {
  _id: string;
  title?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  unreadCount?: number;
}

interface MessagesFlagsSectionProps {
  enrichedFlags: EnrichedItem[];
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
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return '1d';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function MessagesFlagsSection({
  enrichedFlags,
  conversations,
  openFlagCount,
  unreadMessageCount,
}: MessagesFlagsSectionProps) {
  const recentFlags = enrichedFlags.slice(0, 2);
  const recentConversations = (conversations ?? []).slice(0, 2);
  const totalCount = openFlagCount + unreadMessageCount;

  return (
    <div className="mx-[var(--m-page-px)] mb-3">
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--m-border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">
              Messages & Flags
            </span>
            {totalCount > 0 && (
              <span className="bg-[var(--m-error)] text-white text-[11px] font-semibold px-1.5 py-px rounded-full leading-none">
                {totalCount > 99 ? '99+' : totalCount}
              </span>
            )}
          </div>
          <Link href="/m-inbox" className="text-[12px] text-[var(--m-text-tertiary)] font-medium">
            View all
          </Link>
        </div>

        {/* Content */}
        {recentConversations.length === 0 && recentFlags.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <span className="text-[13px] text-[var(--m-text-tertiary)]">No messages or flags</span>
          </div>
        ) : (
          <>
            {recentConversations.map((conv) => (
              <Link
                key={conv._id}
                href="/m-inbox"
                className="flex items-center gap-3 px-4 py-3 border-b border-[var(--m-border-subtle)] last:border-b-0 active:bg-[var(--m-bg-subtle)]"
              >
                <MessageSquare className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-[var(--m-text-primary)] truncate">
                    {conv.title || 'Conversation'}
                  </div>
                  {conv.lastMessagePreview && (
                    <div className="text-[12px] text-[var(--m-text-tertiary)] truncate mt-0.5">
                      {conv.lastMessagePreview}
                    </div>
                  )}
                </div>
                {conv.lastMessageAt && (
                  <span className="text-[11px] text-[var(--m-text-tertiary)] flex-shrink-0">
                    {formatTimestamp(conv.lastMessageAt)}
                  </span>
                )}
                {(conv.unreadCount ?? 0) > 0 && (
                  <span className="bg-[var(--m-bg-brand)] text-[var(--m-text-on-brand)] text-[9px] font-semibold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                    {conv.unreadCount}
                  </span>
                )}
              </Link>
            ))}

            {recentFlags.map((item) => {
              const flag = item.data;
              const subtitle = [item.entityName, item.entityContext].filter(Boolean).join(' · ') || 'No context';
              return (
                <Link
                  key={item.id}
                  href="/m-inbox"
                  className="flex items-center gap-3 px-4 py-3 border-b border-[var(--m-border-subtle)] last:border-b-0 active:bg-[var(--m-bg-subtle)]"
                >
                  <Flag className={`w-4 h-4 flex-shrink-0 ${
                    flag.priority === 'urgent' ? 'text-[var(--m-error)]' : 'text-[var(--m-warning)]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-[var(--m-text-primary)] truncate">
                      {flag.note || 'Flag'}
                    </div>
                    <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
                      {subtitle}
                    </div>
                  </div>
                  <span className="text-[11px] text-[var(--m-text-tertiary)] flex-shrink-0">
                    {formatTimestamp(item.createdAt)}
                  </span>
                </Link>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
