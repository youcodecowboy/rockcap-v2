'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Check, Search } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useMessenger } from '@/contexts/MessengerContext';
import ReferenceChip from '@/components/messages/ReferenceChip';

interface NewConversationFormProps {
  variant?: 'mobile' | 'desktop';
}

export default function NewConversationForm({ variant = 'mobile' }: NewConversationFormProps) {
  const { setView, setActiveConversationId, prePopulated, setPrePopulated } = useMessenger();
  const [title, setTitle] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [firstMessage, setFirstMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const allUsers = useQuery(api.users.getAll);
  const createConversation = useMutation(api.conversations.create);
  const sendMessage = useMutation(api.directMessages.send);

  const isMobile = variant === 'mobile';

  useEffect(() => {
    if (prePopulated?.suggestedTitle && !title) {
      setTitle(prePopulated.suggestedTitle);
    }
  }, [prePopulated]);

  const filteredUsers = (allUsers || []).filter((u: any) => {
    const q = userSearch.toLowerCase();
    return !q || (u.name || u.email || '').toLowerCase().includes(q);
  });

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleBack = () => {
    setPrePopulated(null);
    setView('library');
  };

  const handleCreate = async () => {
    if (!title.trim() || selectedUserIds.length === 0 || creating) return;
    setCreating(true);
    try {
      const conversationId = await createConversation({
        participantIds: selectedUserIds as Id<'users'>[],
        title: title.trim(),
        clientId: prePopulated?.references?.find((r) => r.type === 'client')?.id as any,
        projectId: prePopulated?.references?.find((r) => r.type === 'project')?.id as any,
      });

      if (firstMessage.trim() || prePopulated?.references) {
        await sendMessage({
          conversationId: conversationId as Id<'conversations'>,
          content: firstMessage.trim(),
          references: prePopulated?.references,
        });
      }

      setPrePopulated(null);
      setActiveConversationId(conversationId as string);
      setView('thread');
    } finally {
      setCreating(false);
    }
  };

  const canCreate = title.trim().length > 0 && selectedUserIds.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className={`flex items-center gap-3 px-3 py-2.5 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-200'}`}>
        <button
          onClick={handleBack}
          className={`p-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-500 hover:text-gray-900'}`}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className={`text-[13px] font-semibold ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
          New Conversation
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <div>
          <label className={`block text-[11px] font-medium mb-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600'}`}>
            Thread Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Wimbledon Park - Valuation"
            className={`w-full px-3 py-2 rounded-lg outline-none ${
              isMobile
                ? 'text-[16px] bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)]'
                : 'text-[13px] bg-gray-50 border border-gray-200 text-gray-900 focus:border-gray-300'
            }`}
          />
        </div>

        {prePopulated?.references && prePopulated.references.length > 0 && (
          <div>
            <label className={`block text-[11px] font-medium mb-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600'}`}>
              Attached References
            </label>
            <div className="flex flex-wrap gap-1">
              {prePopulated.references.map((ref, i) => (
                <ReferenceChip key={`${ref.type}-${ref.id}-${i}`} reference={ref} />
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={`block text-[11px] font-medium mb-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600'}`}>
            Participants
          </label>
          <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 mb-2 ${isMobile ? 'bg-[var(--m-bg-inset)]' : 'bg-gray-50 border border-gray-200'}`}>
            <Search className={`w-4 h-4 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`} />
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users..."
              className={`flex-1 bg-transparent outline-none ${isMobile ? 'text-[16px] text-[var(--m-text-primary)]' : 'text-[13px] text-gray-900'}`}
            />
          </div>
          <div className={`max-h-40 overflow-y-auto rounded-lg ${isMobile ? 'bg-[var(--m-bg-inset)]/30' : 'bg-gray-50'}`}>
            {filteredUsers.map((user: any) => {
              const selected = selectedUserIds.includes(user._id);
              return (
                <button
                  key={user._id}
                  onClick={() => toggleUser(user._id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left ${
                    selected
                      ? (isMobile ? 'bg-[var(--m-accent-subtle)]' : 'bg-blue-50')
                      : ''
                  } ${isMobile ? 'active:bg-[var(--m-bg-subtle)]' : 'hover:bg-gray-100'}`}
                >
                  <span className={`flex-1 text-[12px] truncate ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
                    {user.name || user.email}
                  </span>
                  {selected && <Check className={`w-3.5 h-3.5 ${isMobile ? 'text-[var(--m-accent)]' : 'text-blue-600'}`} />}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={`block text-[11px] font-medium mb-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600'}`}>
            First Message (optional)
          </label>
          <textarea
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            placeholder="Kick off the conversation..."
            rows={3}
            className={`w-full px-3 py-2 rounded-lg outline-none resize-none ${
              isMobile
                ? 'text-[16px] bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)]'
                : 'bg-gray-50 border border-gray-200 text-gray-900 focus:border-gray-300'
            }`}
          />
        </div>
      </div>

      <div className={`px-3 py-2 border-t ${isMobile ? 'border-[var(--m-border)] pb-[env(safe-area-inset-bottom)]' : 'border-gray-200'}`}>
        <button
          onClick={handleCreate}
          disabled={!canCreate || creating}
          className={`w-full py-2.5 rounded-lg text-[13px] font-medium ${
            canCreate && !creating
              ? (isMobile ? 'bg-[var(--m-accent)] text-white active:opacity-80' : 'bg-gray-900 text-white hover:bg-gray-800')
              : (isMobile ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-placeholder)]' : 'bg-gray-100 text-gray-400')
          }`}
        >
          {creating ? 'Creating...' : 'Create Conversation'}
        </button>
      </div>
    </div>
  );
}
