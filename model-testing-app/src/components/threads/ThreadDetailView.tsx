'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import {
  Flag,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Send,
  Loader2,
  ChevronLeft,
} from 'lucide-react';
import ThreadEntry from './ThreadEntry';
import EntityContextHeader from './EntityContextHeader';
import { relativeTime, getInitial, ENTITY_TYPE_LABELS } from './utils';

interface ThreadDetailViewProps {
  flagId: string;
  onBack: () => void;
  showEntityContext?: boolean;
  compact?: boolean;
}

export default function ThreadDetailView({
  flagId,
  onBack,
  showEntityContext = false,
  compact = false,
}: ThreadDetailViewProps) {
  const typedFlagId = flagId as Id<'flags'>;

  // Queries
  const flag = useQuery(api.flags.get, { id: typedFlagId });
  const thread = useQuery(api.flags.getThread, { flagId: typedFlagId });

  // Collect all user IDs for batch fetch
  const userIds = useMemo(() => {
    const ids = new Set<string>();
    if (flag) {
      ids.add(flag.createdBy);
      ids.add(flag.assignedTo);
      if (flag.resolvedBy) ids.add(flag.resolvedBy);
    }
    if (thread) {
      for (const entry of thread) {
        if (entry.userId) ids.add(entry.userId);
      }
    }
    return [...ids] as Id<'users'>[];
  }, [flag, thread]);

  const users = useQuery(
    api.users.getByIds,
    userIds.length > 0 ? { userIds } : 'skip'
  );

  // Build user name map
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    if (users) {
      for (const u of users) {
        map.set(u._id, u.name || u.email || 'Unknown');
      }
    }
    return map;
  }, [users]);

  // Mutations
  const replyMutation = useMutation(api.flags.reply);
  const resolveMutation = useMutation(api.flags.resolve);
  const reopenMutation = useMutation(api.flags.reopen);
  const removeMutation = useMutation(api.flags.remove);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [resolveOnSend, setResolveOnSend] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [replyText]);

  // Scroll to bottom when thread updates
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const handleSend = useCallback(async () => {
    if (!replyText.trim() || isSending) return;
    setIsSending(true);
    try {
      await replyMutation({
        flagId: typedFlagId,
        content: replyText.trim(),
        resolve: resolveOnSend,
      });
      setReplyText('');
      setResolveOnSend(false);
    } finally {
      setIsSending(false);
    }
  }, [replyText, isSending, replyMutation, typedFlagId, resolveOnSend]);

  const handleResolve = useCallback(async () => {
    if (isResolving) return;
    setIsResolving(true);
    try {
      await resolveMutation({ id: typedFlagId });
    } finally {
      setIsResolving(false);
    }
  }, [isResolving, resolveMutation, typedFlagId]);

  const handleReopen = useCallback(async () => {
    if (isResolving) return;
    setIsResolving(true);
    try {
      await reopenMutation({ id: typedFlagId });
    } finally {
      setIsResolving(false);
    }
  }, [isResolving, reopenMutation, typedFlagId]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete this flag? This cannot be undone.')) return;
    try {
      await removeMutation({ id: typedFlagId });
      onBack();
    } catch {
      // Flag may already be deleted or unauthorized
    }
  }, [removeMutation, typedFlagId, onBack]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Loading state
  if (flag === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Not found
  if (flag === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Flag className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">Flag not found</p>
        </div>
      </div>
    );
  }

  const isOpen = flag.status === 'open';
  const noteFirstLine = flag.note.split('\n')[0];
  const creatorName = userMap.get(flag.createdBy) || null;
  const assigneeName = userMap.get(flag.assignedTo) || null;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 1. Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-gray-500" />
          </button>
          <span className="text-sm font-semibold text-gray-900 truncate">
            {noteFirstLine}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${
              isOpen
                ? 'bg-orange-50 text-orange-600'
                : 'bg-green-50 text-green-600'
            }`}
          >
            {flag.status}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isOpen ? (
            <button
              onClick={handleResolve}
              disabled={isResolving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
            >
              {isResolving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Resolve
            </button>
          ) : (
            <button
              onClick={handleReopen}
              disabled={isResolving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded transition-colors disabled:opacity-50"
            >
              {isResolving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Reopen
            </button>
          )}
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      {/* 2. Entity context header (optional) */}
      {showEntityContext && (
        <EntityContextHeader
          entityType={flag.entityType}
          entityId={flag.entityId}
          clientId={flag.clientId}
          projectId={flag.projectId}
          compact={compact}
        />
      )}

      {/* 3. Metadata bar */}
      <div className="px-5 py-3 border-b border-gray-50">
        <p className="text-xs text-gray-500">
          Flagged by{' '}
          <span className="font-medium text-gray-700">{creatorName || 'loading...'}</span>
          {' \u00b7 '}
          {relativeTime(flag.createdAt)}
          {' \u00b7 Priority: '}
          <span
            className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold uppercase ${
              flag.priority === 'urgent'
                ? 'bg-red-50 text-red-600'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {flag.priority}
          </span>
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Assigned to:{' '}
          <span className="font-medium text-gray-700">{assigneeName || 'loading...'}</span>
        </p>
      </div>

      {/* 4. Original note */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-medium">
            {getInitial(creatorName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-900">
                {creatorName || 'Unknown'}
              </span>
              <span className="text-[11px] text-gray-400 flex-shrink-0">
                {relativeTime(flag.createdAt)}
              </span>
            </div>
            <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{flag.note}</p>
          </div>
        </div>
      </div>

      {/* 5. Thread timeline */}
      <div className="flex-1 overflow-y-auto">
        {thread && thread.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {thread.map((entry) => (
              <ThreadEntry
                key={entry._id}
                entryType={entry.entryType}
                userName={entry.userId ? userMap.get(entry.userId) || null : null}
                content={entry.content}
                createdAt={entry.createdAt}
                metadata={entry.metadata as Record<string, unknown> | undefined}
              />
            ))}
          </div>
        ) : thread !== undefined ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-xs text-gray-300">No replies yet</p>
          </div>
        ) : null}
        <div ref={threadEndRef} />
      </div>

      {/* 6. Reply bar */}
      <div className="border-t border-gray-200 px-5 py-3 bg-white">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a reply..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          />
          <div className="flex items-center gap-3 flex-shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resolveOnSend}
                onChange={(e) => setResolveOnSend(e.target.checked)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500 h-3.5 w-3.5"
              />
              <span className="text-[11px] text-gray-500 whitespace-nowrap">Resolve & send</span>
            </label>
            <button
              onClick={handleSend}
              disabled={!replyText.trim() || isSending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </button>
          </div>
        </div>
        <p className="text-[10px] text-gray-300 mt-1.5">
          Press {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '\u2318' : 'Ctrl'}+Enter to send
        </p>
      </div>
    </div>
  );
}
