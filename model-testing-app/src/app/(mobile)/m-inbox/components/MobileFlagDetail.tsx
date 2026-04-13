'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Flag, CheckCircle2, RotateCcw, Building2, FolderKanban, FileText, ListTodo, Calendar, ClipboardCheck, ChevronRight, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
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

const ENTITY_ICONS: Record<string, any> = {
  client: Building2,
  project: FolderKanban,
  document: FileText,
  task: ListTodo,
  meeting: Calendar,
  checklist_item: ClipboardCheck,
};

function getEntityRoute(entityType: string, entityId: string, clientId?: string): string | null {
  switch (entityType) {
    case 'client': return `/m-clients?clientId=${entityId}`;
    case 'project': return `/m-clients?projectId=${entityId}`;
    case 'document': return `/m-docs?documentId=${entityId}`;
    case 'task': return `/m-tasks`;
    default: return null;
  }
}

export default function MobileFlagDetail({ flagId, onBack }: MobileFlagDetailProps) {
  const fId = flagId as Id<'flags'>;
  const router = useRouter();
  const flag = useQuery(api.flags.get, { id: fId });
  const thread = useQuery(api.flags.getThread, { flagId: fId });
  const reply = useMutation(api.flags.reply);
  const resolve = useMutation(api.flags.resolve);
  const reopen = useMutation(api.flags.reopen);

  // Resolve the entity this flag is about
  const entityContext = useQuery(
    api.flags.getEntityContext,
    flag ? { entityType: flag.entityType as any, entityId: flag.entityId } : 'skip'
  );

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
    uniqueUserIds.length > 0 ? { userIds: uniqueUserIds } : 'skip'
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
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--m-border)] bg-[var(--m-bg)]">
        <button onClick={onBack} className="p-1 text-[var(--m-text-secondary)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Flag className={`w-4 h-4 shrink-0 ${flag.priority === 'urgent' ? 'text-[var(--m-error)]' : 'text-orange-500'}`} />
          {flag.priority === 'urgent' && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700">
              <AlertTriangle className="w-3 h-3" /> Urgent
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
        {/* Entity context card — shows what the flag is about */}
        {entityContext && entityContext.name !== 'Unknown' && (() => {
          const EntityIcon = ENTITY_ICONS[flag.entityType] || Flag;
          const route = getEntityRoute(flag.entityType, flag.entityId, flag.clientId);
          return (
            <button
              onClick={() => route && router.push(route)}
              disabled={!route}
              className={`w-full flex items-center gap-2.5 p-2.5 mb-3 rounded-lg border border-[var(--m-border-subtle)] bg-[var(--m-bg-subtle)] text-left ${route ? 'active:bg-[var(--m-bg-inset)]' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <EntityIcon className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                  {entityContext.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--m-text-tertiary)]">
                    {flag.entityType.replace('_', ' ')}
                  </span>
                  {entityContext.subtitle && (
                    <span className="text-[10px] text-[var(--m-text-tertiary)]">
                      {entityContext.subtitle}
                    </span>
                  )}
                  {entityContext.badges?.map((b: string) => (
                    <span key={b} className="text-[9px] px-1 py-px rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)]">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
              {route && <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)] shrink-0" />}
            </button>
          );
        })()}

        {/* Flag details */}
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
          {/* Assigned to */}
          {flag.assignedTo && flag.assignedTo !== flag.createdBy && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--m-text-tertiary)]">
              Assigned to
              <span className="bg-blue-50 text-blue-600 px-1.5 py-px rounded font-medium">
                {userMap[flag.assignedTo] || 'Unknown'}
              </span>
            </div>
          )}
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
              className="flex-1 resize-none rounded-2xl bg-[var(--m-bg-inset)] px-3 py-2 text-[16px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none max-h-24"
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
