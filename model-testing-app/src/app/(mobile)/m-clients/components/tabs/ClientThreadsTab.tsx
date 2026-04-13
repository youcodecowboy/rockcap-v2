'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Plus } from 'lucide-react';

interface ClientThreadsTabProps {
  clientId: string;
}

export default function ClientThreadsTab({ clientId }: ClientThreadsTabProps) {
  const [expandedFlagId, setExpandedFlagId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadNote, setNewThreadNote] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const flags = useQuery(api.flags.getByClient, { clientId: clientId as Id<'clients'> });
  const threadEntries = useQuery(
    api.flags.getThread,
    expandedFlagId ? { flagId: expandedFlagId as Id<'flags'> } : 'skip'
  );
  const replyMutation = useMutation(api.flags.reply);
  const createFlag = useMutation(api.flags.create);

  const handleCreateThread = async () => {
    if (!newThreadNote.trim() || isCreating) return;
    setIsCreating(true);
    try {
      await createFlag({
        entityType: 'client',
        entityId: clientId,
        note: newThreadNote.trim(),
        priority: 'normal',
      });
      setNewThreadNote('');
      setShowNewThread(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleReply = async (flagId: string) => {
    if (!replyText.trim()) return;
    await replyMutation({ flagId: flagId as Id<'flags'>, content: replyText.trim() });
    setReplyText('');
  };

  const toggleFlag = (flagId: string) => {
    setExpandedFlagId(prev => (prev === flagId ? null : flagId));
    setReplyText('');
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (flags === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading threads...
      </div>
    );
  }

  if (flags.length === 0 && !showNewThread) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center">
        <p className="text-[12px] text-[var(--m-text-tertiary)]">No threads yet</p>
        <button
          onClick={() => setShowNewThread(true)}
          className="mt-2 text-[12px] font-medium text-[var(--m-accent-indicator)]"
        >
          Start a thread
        </button>
      </div>
    );
  }

  const sortedFlags = [...flags].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="px-[var(--m-page-px)] py-3">
      {/* New thread button / composer */}
      {showNewThread ? (
        <div className="mb-3 bg-[var(--m-bg-card)] border border-[var(--m-border-subtle)] rounded-xl p-3">
          <div className="text-[13px] font-medium text-[var(--m-text-primary)] mb-2">New Thread</div>
          <textarea
            value={newThreadNote}
            onChange={(e) => setNewThreadNote(e.target.value)}
            placeholder="What's this thread about?"
            rows={3}
            className="w-full bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none resize-none"
            style={{ fontSize: '16px' }}
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => { setShowNewThread(false); setNewThreadNote(''); }}
              className="px-3 py-1.5 text-[12px] font-medium text-[var(--m-text-secondary)]"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateThread}
              disabled={!newThreadNote.trim() || isCreating}
              className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[var(--m-accent)] rounded-lg disabled:opacity-40"
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNewThread(true)}
          className="flex items-center gap-1.5 mb-3 text-[12px] font-medium text-[var(--m-accent-indicator)]"
        >
          <Plus className="w-3.5 h-3.5" /> New Thread
        </button>
      )}

      <div className="flex flex-col gap-2">
        {sortedFlags.map((flag) => {
          const isExpanded = expandedFlagId === flag._id;

          return (
            <div
              key={flag._id}
              className="bg-[var(--m-bg-card)] border border-[var(--m-border-subtle)] rounded-xl overflow-hidden"
            >
              {/* Collapsed header */}
              <button
                onClick={() => toggleFlag(flag._id)}
                className="w-full flex items-center gap-2 px-3 py-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                      {flag.note}
                    </span>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                        flag.status === 'open'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {flag.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">
                    {formatDate(flag.createdAt)}
                  </div>
                </div>
                <svg
                  className={`shrink-0 w-4 h-4 text-[var(--m-text-tertiary)] transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3">
                  {/* Full flag note */}
                  <p className="text-[12px] text-[var(--m-text-secondary)] mb-3">
                    {flag.note}
                  </p>

                  {/* Thread entries */}
                  {threadEntries === undefined ? (
                    <div className="text-[11px] text-[var(--m-text-tertiary)] italic py-2">
                      Loading thread...
                    </div>
                  ) : threadEntries.length === 0 ? (
                    <div className="text-[11px] text-[var(--m-text-tertiary)] py-2">
                      No replies yet
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {threadEntries.map((entry) => (
                        <div key={entry._id}>
                          {entry.entryType === 'message' ? (
                            <div className="pl-3 border-l-2 border-blue-300 py-2">
                              <p className="text-[12px] text-[var(--m-text-primary)]">
                                {entry.content}
                              </p>
                              <div className="text-[10px] text-[var(--m-text-placeholder)] mt-0.5">
                                {formatDate(entry.createdAt)}
                              </div>
                            </div>
                          ) : (
                            <div className="py-2 text-[11px] italic text-[var(--m-text-tertiary)]">
                              <p>{entry.content}</p>
                              <div className="text-[10px] text-[var(--m-text-placeholder)] mt-0.5">
                                {formatDate(entry.createdAt)}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply input */}
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[var(--m-border-subtle)]">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Add a reply..."
                      className="flex-1 bg-[var(--m-bg-inset)] text-[13px] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)]"
                      style={{ fontSize: '16px' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && replyText.trim()) {
                          handleReply(flag._id);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleReply(flag._id)}
                      disabled={!replyText.trim()}
                      className="px-3 py-2 text-[12px] font-medium text-white bg-black rounded-lg disabled:opacity-40"
                    >
                      Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
