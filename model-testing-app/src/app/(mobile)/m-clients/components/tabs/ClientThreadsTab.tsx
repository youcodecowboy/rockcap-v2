'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Plus, Flag, AlertTriangle } from 'lucide-react';

interface ClientThreadsTabProps {
  clientId: string;
  clientName?: string;
}

export default function ClientThreadsTab({ clientId, clientName }: ClientThreadsTabProps) {
  const [expandedFlagId, setExpandedFlagId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [newPriority, setNewPriority] = useState<'normal' | 'urgent'>('normal');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  const flags = useQuery(api.flags.getByClient, { clientId: clientId as Id<'clients'> });
  const threadEntries = useQuery(
    api.flags.getThread,
    expandedFlagId ? { flagId: expandedFlagId as Id<'flags'> } : 'skip'
  );
  const allUsers = useQuery(api.users.getAll);
  const replyMutation = useMutation(api.flags.reply);
  const createFlag = useMutation(api.flags.create);

  const handleCreate = async () => {
    if (!newNote.trim() || isCreating) return;
    setIsCreating(true);
    try {
      await createFlag({
        entityType: 'client',
        entityId: clientId,
        clientId: clientId as Id<'clients'>,
        note: newNote.trim(),
        priority: newPriority,
        ...(assigneeId ? { assignedTo: assigneeId as Id<'users'> } : {}),
      });
      setNewNote('');
      setNewPriority('normal');
      setAssigneeId('');
      setShowCreate(false);
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

  // Resolve assignee names for display on flag cards
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    if (allUsers) {
      for (const u of allUsers) map.set(u._id, u.name || u.email || 'Unknown');
    }
    return map;
  }, [allUsers]);

  if (flags === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading flags...
      </div>
    );
  }

  // Create form component (reused in empty state and list view)
  const createForm = showCreate && (
    <div className="mb-3 bg-[var(--m-bg-card)] border border-[var(--m-border-subtle)] rounded-xl p-3">
      {/* Header with context */}
      <div className="flex items-center gap-2 mb-3">
        <Flag className="w-4 h-4 text-amber-500" />
        <span className="text-[13px] font-medium text-[var(--m-text-primary)]">
          Flag {clientName || 'Client'}
        </span>
      </div>

      {/* Note */}
      <textarea
        value={newNote}
        onChange={(e) => setNewNote(e.target.value)}
        placeholder="What needs attention? Describe the issue or action needed..."
        rows={3}
        className="w-full bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none resize-none"
        style={{ fontSize: '16px' }}
        autoFocus
      />

      {/* Priority toggle */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[11px] text-[var(--m-text-tertiary)]">Priority:</span>
        <button
          onClick={() => setNewPriority('normal')}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
            newPriority === 'normal'
              ? 'bg-gray-200 text-gray-800'
              : 'bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)]'
          }`}
        >
          Normal
        </button>
        <button
          onClick={() => setNewPriority('urgent')}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1 ${
            newPriority === 'urgent'
              ? 'bg-red-100 text-red-700'
              : 'bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)]'
          }`}
        >
          <AlertTriangle className="w-3 h-3" /> Urgent
        </button>
      </div>

      {/* Assign to */}
      <div className="mt-3">
        <span className="text-[11px] text-[var(--m-text-tertiary)]">Assign to:</span>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="w-full mt-1 bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none text-[14px]"
          style={{ fontSize: '16px' }}
        >
          <option value="">Myself (default)</option>
          {allUsers?.map(u => (
            <option key={u._id} value={u._id}>
              {u.name || u.email}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => { setShowCreate(false); setNewNote(''); setNewPriority('normal'); setAssigneeId(''); }}
          className="px-3 py-1.5 text-[12px] font-medium text-[var(--m-text-secondary)]"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!newNote.trim() || isCreating}
          className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[var(--m-accent)] rounded-lg disabled:opacity-40"
        >
          {isCreating ? 'Creating...' : 'Create Flag'}
        </button>
      </div>
    </div>
  );

  if (flags.length === 0 && !showCreate) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center">
        <p className="text-[12px] text-[var(--m-text-tertiary)]">No flags yet</p>
        <button
          onClick={() => setShowCreate(true)}
          className="mt-2 text-[12px] font-medium text-[var(--m-accent-indicator)]"
        >
          Create a flag
        </button>
      </div>
    );
  }

  const sortedFlags = [...flags].sort((a, b) => {
    // Open before resolved
    if (a.status === 'open' && b.status !== 'open') return -1;
    if (a.status !== 'open' && b.status === 'open') return 1;
    // Then by date descending
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="px-[var(--m-page-px)] py-3">
      {/* Create button / form */}
      {showCreate ? createForm : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 mb-3 text-[12px] font-medium text-[var(--m-accent-indicator)]"
        >
          <Plus className="w-3.5 h-3.5" /> New Flag
        </button>
      )}

      <div className="flex flex-col gap-2">
        {sortedFlags.map((flag) => {
          const isExpanded = expandedFlagId === flag._id;
          const assigneeName = flag.assignedTo ? userMap.get(flag.assignedTo) : null;
          const isUrgent = flag.priority === 'urgent';

          return (
            <div
              key={flag._id}
              className={`bg-[var(--m-bg-card)] border rounded-xl overflow-hidden ${
                isUrgent ? 'border-red-200' : 'border-[var(--m-border-subtle)]'
              }`}
            >
              {/* Header */}
              <button
                onClick={() => toggleFlag(flag._id)}
                className="w-full flex items-center gap-2 px-3 py-3 text-left"
              >
                {isUrgent && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
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
                  <div className="flex items-center gap-2 text-[11px] text-[var(--m-text-tertiary)] mt-0.5">
                    <span>{formatDate(flag.createdAt)}</span>
                    {assigneeName && (
                      <span className="bg-blue-50 text-blue-600 px-1.5 py-px rounded text-[10px]">
                        {assigneeName}
                      </span>
                    )}
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
                  <p className="text-[12px] text-[var(--m-text-secondary)] mb-3">
                    {flag.note}
                  </p>

                  {/* Thread entries */}
                  {threadEntries === undefined ? (
                    <div className="text-[11px] text-[var(--m-text-tertiary)] italic py-2">
                      Loading...
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
                      className="flex-1 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none"
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
                      className="px-3 py-2 text-[12px] font-medium text-white bg-[var(--m-accent)] rounded-lg disabled:opacity-40"
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
