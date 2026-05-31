'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  Flag,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Send,
  Loader2,
} from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { Button, StatusPill, EmptyState, SkeletonText, Field } from '@/components/layouts';
import ThreadEntry from './ThreadEntry';
import EntityContextHeader from '@/components/threads/EntityContextHeader';
import { relativeTime, getInitial } from '@/components/threads/utils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface FlagDetailPanelProps {
  flagId: string;
}

export default function FlagDetailPanel({ flagId }: FlagDetailPanelProps) {
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
    } catch {
      // Flag may already be deleted or unauthorized
    }
  }, [removeMutation, typedFlagId]);

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
      <div className="h-full p-6">
        <SkeletonText lines={6} />
      </div>
    );
  }

  // Not found
  if (flag === null) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <EmptyState icon={<Flag size={28} />} title="Flag not found" />
      </div>
    );
  }

  const isOpen = flag.status === 'open';
  const creatorName = userMap.get(flag.createdBy) || null;
  const assigneeName = userMap.get(flag.assignedTo) || null;

  return (
    <div className="flex flex-col h-full" style={{ background: colors.bg.base }}>
      {/* Entity context header */}
      <EntityContextHeader
        entityType={flag.entityType}
        entityId={flag.entityId}
        clientId={flag.clientId}
        projectId={flag.projectId}
      />

      {/* Action bar */}
      <div
        className="flex items-center justify-between px-5 py-2"
        style={{ borderBottom: `1px solid ${colors.border.light}` }}
      >
        <StatusPill
          label={flag.status}
          tone={isOpen ? colors.accent.orange : colors.accent.green}
        />
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

      {/* Flag metadata */}
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
        <p style={{ fontSize: 12, color: colors.text.muted }} className="flex items-center flex-wrap gap-1">
          <span>Flagged by</span>
          <span style={{ fontWeight: 500, color: colors.text.secondary }}>{creatorName || 'loading...'}</span>
          <span>{'\u00b7'}</span>
          <span>{relativeTime(flag.createdAt)}</span>
          <span>{'\u00b7 Priority:'}</span>
          <StatusPill
            label={flag.priority}
            tone={flag.priority === 'urgent' ? colors.accent.red : colors.text.muted}
          />
        </p>
        <p className="mt-1" style={{ fontSize: 12, color: colors.text.muted }}>
          Assigned to:{' '}
          <span style={{ fontWeight: 500, color: colors.text.secondary }}>{assigneeName || 'loading...'}</span>
        </p>
      </div>

      {/* Original note */}
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: colors.accent.orange,
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {getInitial(creatorName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                {creatorName || 'Unknown'}
              </span>
              <span className="flex-shrink-0" style={{ fontSize: 11, color: colors.text.dim }}>
                {relativeTime(flag.createdAt)}
              </span>
            </div>
            <p
              className="mt-1 whitespace-pre-wrap"
              style={{ fontSize: 13, color: colors.text.secondary }}
            >
              {flag.note}
            </p>
          </div>
        </div>
      </div>

      {/* Thread timeline */}
      <div className="flex-1 overflow-y-auto">
        {thread && thread.length > 0 ? (
          <div>
            {thread.map((entry) => (
              <div key={entry._id} style={{ borderBottom: `1px solid ${colors.border.light}` }}>
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
            <p style={{ fontSize: 12, color: colors.text.dim }}>No replies yet</p>
          </div>
        ) : null}
        <div ref={threadEndRef} />
      </div>

      {/* Reply bar */}
      <div
        className="pl-5 pr-20 py-3"
        style={{ borderTop: `1px solid ${colors.border.default}`, background: colors.bg.card }}
      >
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Reply">
              <textarea
                ref={textareaRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write a reply..."
                rows={1}
                style={{
                  width: '100%',
                  resize: 'none',
                  padding: '7px 10px',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  color: colors.text.primary,
                  background: colors.bg.card,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  outline: 'none',
                }}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resolveOnSend}
                onChange={(e) => setResolveOnSend(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: colors.accent.green }}
              />
              <span className="whitespace-nowrap" style={{ fontSize: 11, color: colors.text.muted }}>
                Resolve & send
              </span>
            </label>
            <Button
              variant="primary"
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
          Press {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '\u2318' : 'Ctrl'}+Enter to send
        </p>
      </div>
    </div>
  );
}
