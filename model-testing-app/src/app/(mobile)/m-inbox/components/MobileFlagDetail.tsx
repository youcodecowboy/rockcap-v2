'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Flag, CheckCircle2, RotateCcw } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { ENTITY_TYPE_SHORT } from '@/components/threads/utils';

interface MobileFlagDetailProps {
  flagId: string;
  onBack: () => void;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MobileFlagDetail({ flagId, onBack }: MobileFlagDetailProps) {
  const fId = flagId as Id<'flags'>;
  const flag = useQuery(api.flags.get, { id: fId });
  const thread = useQuery(api.flags.getThread, { flagId: fId });
  const reply = useMutation(api.flags.reply);
  const resolve = useMutation(api.flags.resolve);
  const reopen = useMutation(api.flags.reopen);

  const [replyText, setReplyText] = useState('');
  const [resolveOnSend, setResolveOnSend] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userIds = [
    flag?.createdBy,
    flag?.assignedTo,
    flag?.resolvedBy,
    ...(thread?.map((t: any) => t.userId) || []),
  ].filter(Boolean);
  const uniqueUserIds = [...new Set(userIds)] as Id<'users'>[];
  const users = useQuery(
    api.users.getByIds,
    uniqueUserIds.length > 0 ? { ids: uniqueUserIds } : 'skip'
  );

  const userMap: Record<string, string> = {};
  if (users) {
    for (const u of users) {
      if (u) userMap[u._id] = u.name || u.email || 'Unknown';
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.length]);

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await reply({
        flagId: fId,
        content: replyText.trim(),
        resolve: resolveOnSend,
      });
      setReplyText('');
      setResolveOnSend(false);
    } finally {
      setSending(false);
    }
  };

  if (!flag) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--m-accent)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--m-border)] bg-[var(--m-bg)]">
        <button onClick={onBack} className="p-1 text-[var(--m-text-secondary)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Flag className={`w-4 h-4 ${flag.priority === 'urgent' ? 'text-[var(--m-error)]' : 'text-orange-500'}`} />
          {flag.entityType && (
            <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] uppercase tracking-wide">
              {ENTITY_TYPE_SHORT[flag.entityType] || flag.entityType}
            </span>
          )}
          <span
            className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
              flag.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
            }`}
          >
            {flag.status}
          </span>
        </div>
        {flag.status === 'open' ? (
          <button
            onClick={() => resolve({ flagId: fId })}
            className="p-1.5 text-green-600 active:opacity-70"
            aria-label="Resolve"
          >
            <CheckCircle2 className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => reopen({ flagId: fId })}
            className="p-1.5 text-[var(--m-text-secondary)] active:opacity-70"
            aria-label="Reopen"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-[var(--m-page-px)] py-3">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-[var(--m-text-primary)]">
              {userMap[flag.createdBy] || 'Unknown'}
            </span>
            <span className="text-[10px] text-[var(--m-text-tertiary)]">{formatTime(flag.createdAt)}</span>
          </div>
          <p className="text-[13px] text-[var(--m-text-primary)] whitespace-pre-wrap leading-relaxed">
            {flag.note}
          </p>
        </div>

        {thread?.map((entry: any) => (
          <div
            key={entry._id}
            className={`mb-3 ${
              entry.entryType === 'activity'
                ? 'flex items-center gap-2 text-[11px] text-[var(--m-text-tertiary)] italic'
                : ''
            }`}
          >
            {entry.entryType === 'message' ? (
              <>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-[var(--m-text-primary)]">
                    {entry.userId ? userMap[entry.userId] || 'Unknown' : 'System'}
                  </span>
                  <span className="text-[10px] text-[var(--m-text-tertiary)]">{formatTime(entry.createdAt)}</span>
                </div>
                <p className="text-[13px] text-[var(--m-text-primary)] whitespace-pre-wrap leading-relaxed">
                  {entry.content}
                </p>
              </>
            ) : (
              <>
                <span className="text-[var(--m-text-tertiary)]">—</span>
                <span>{entry.content}</span>
                <span>{formatTime(entry.createdAt)}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {flag.status === 'open' && (
        <div className="border-t border-[var(--m-border)] bg-[var(--m-bg)] px-3 py-2 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--m-text-secondary)]">
              <input
                type="checkbox"
                checked={resolveOnSend}
                onChange={(e) => setResolveOnSend(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
              />
              Resolve on send
            </label>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Reply..."
              rows={1}
              className="flex-1 resize-none rounded-2xl bg-[var(--m-bg-inset)] px-3 py-2 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none max-h-24"
              style={{ minHeight: '36px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !replyText.trim()}
              className="px-3 py-2 bg-[var(--m-accent)] text-white rounded-full text-[12px] font-medium disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
