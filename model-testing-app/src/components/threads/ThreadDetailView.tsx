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
import { Button, IconButton, StatusPill, EmptyState, SkeletonText } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import ThreadEntry from './ThreadEntry';
import EntityContextHeader from './EntityContextHeader';
import { relativeTime, getInitial } from './utils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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
  const colors = useColors();
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
  const [replyFocused, setReplyFocused] = useState(false);
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
      <div className="h-full px-5 py-4" style={{ background: colors.bg.card }}>
        <SkeletonText lines={6} />
      </div>
    );
  }

  // Not found
  if (flag === null) {
    return (
      <div className="flex items-center justify-center h-full px-5" style={{ background: colors.bg.card }}>
        <EmptyState icon={<Flag className="w-8 h-8" />} title="Flag not found" />
      </div>
    );
  }

  const isOpen = flag.status === 'open';
  const noteFirstLine = flag.note.split('\n')[0];
  const creatorName = userMap.get(flag.createdBy) || null;
  const assigneeName = userMap.get(flag.assignedTo) || null;

  return (
    <div className="flex flex-col h-full" style={{ background: colors.bg.card }}>
      {/* 1. Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${colors.border.default}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconButton label="Back" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <span className="text-sm font-semibold truncate" style={{ color: colors.text.primary }}>
            {noteFirstLine}
          </span>
          <span className="flex-shrink-0">
            <StatusPill
              label={flag.status}
              tone={isOpen ? colors.accent.orange : colors.accent.green}
            />
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isOpen ? (
            <Button
              variant="primary"
              size="sm"
              accent={colors.accent.green}
              onClick={handleResolve}
              disabled={isResolving}
            >
              {isResolving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Resolve
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReopen}
              disabled={isResolving}
            >
              {isResolving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Reopen
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
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
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
        <p className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: colors.text.muted }}>
          <span>
            Flagged by{' '}
            <span className="font-medium" style={{ color: colors.text.secondary }}>
              {creatorName || 'loading...'}
            </span>
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}>
            · {relativeTime(flag.createdAt)} ·
          </span>
          <span>Priority:</span>
          <StatusPill
            label={flag.priority}
            tone={flag.priority === 'urgent' ? colors.accent.red : colors.text.muted}
          />
        </p>
        <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
          Assigned to:{' '}
          <span className="font-medium" style={{ color: colors.text.secondary }}>
            {assigneeName || 'loading...'}
          </span>
        </p>
      </div>

      {/* 4. Original note */}
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
            style={{ background: colors.accent.orange, color: '#ffffff' }}
          >
            {getInitial(creatorName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium" style={{ color: colors.text.primary }}>
                {creatorName || 'Unknown'}
              </span>
              <span
                className="flex-shrink-0"
                style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}
              >
                {relativeTime(flag.createdAt)}
              </span>
            </div>
            <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: colors.text.secondary }}>
              {flag.note}
            </p>
          </div>
        </div>
      </div>

      {/* 5. Thread timeline */}
      <div className="flex-1 overflow-y-auto">
        {thread && thread.length > 0 ? (
          <div>
            {thread.map((entry, i) => (
              <div
                key={entry._id}
                style={i > 0 ? { borderTop: `1px solid ${colors.border.light}` } : undefined}
              >
                <ThreadEntry
                  entryType={entry.entryType}
                  userName={entry.userId ? userMap.get(entry.userId) || null : null}
                  content={entry.content}
                  createdAt={entry.createdAt}
                  metadata={entry.metadata as Record<string, unknown> | undefined}
                />
              </div>
            ))}
          </div>
        ) : thread !== undefined ? (
          <div className="flex items-center justify-center py-12">
            <p style={{ fontSize: 11, color: colors.text.dim }}>No replies yet</p>
          </div>
        ) : null}
        <div ref={threadEndRef} />
      </div>

      {/* 6. Reply bar */}
      <div
        className="px-5 py-3"
        style={{ borderTop: `1px solid ${colors.border.default}`, background: colors.bg.card }}
      >
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setReplyFocused(true)}
            onBlur={() => setReplyFocused(false)}
            placeholder="Write a reply..."
            rows={1}
            className="flex-1 resize-none"
            style={{
              padding: '7px 10px',
              fontSize: 12,
              fontFamily: 'inherit',
              color: colors.text.primary,
              background: colors.bg.card,
              border: `1px solid ${replyFocused ? colors.accent.blue : colors.border.default}`,
              borderRadius: 4,
              outline: 'none',
              transition: 'border-color 100ms linear',
            }}
          />
          <div className="flex items-center gap-3 flex-shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resolveOnSend}
                onChange={(e) => setResolveOnSend(e.target.checked)}
                className="h-3.5 w-3.5"
                style={{ accentColor: colors.accent.green }}
              />
              <span className="whitespace-nowrap" style={{ fontSize: 11, color: colors.text.muted }}>
                Resolve & send
              </span>
            </label>
            <Button
              variant="primary"
              size="sm"
              accent={colors.text.primary}
              onClick={handleSend}
              disabled={!replyText.trim() || isSending}
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </div>
        </div>
        <p className="mt-1.5" style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}>
          Press {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}+Enter to send
        </p>
      </div>
    </div>
  );
}
