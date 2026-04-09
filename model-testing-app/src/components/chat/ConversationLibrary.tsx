'use client';

import { Plus, MessagesSquare } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useMessenger } from '@/contexts/MessengerContext';

interface ConversationLibraryProps {
  variant?: 'mobile' | 'desktop';
}

function formatTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

export default function ConversationLibrary({ variant = 'mobile' }: ConversationLibraryProps) {
  const { openConversation, setView, setMode, setChatOpen } = useMessenger();
  const conversations = useQuery(api.conversations.getMyConversations, {});

  const isMobile = variant === 'mobile';

  const startNew = () => {
    setMode('messenger');
    setView('new');
    setChatOpen(true);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className={`px-3 py-2 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-200'}`}>
        <button
          onClick={startNew}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-medium ${
            isMobile ? 'bg-[var(--m-accent)] text-white active:opacity-80' : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          New Conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!conversations || conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <MessagesSquare className={`w-8 h-8 mb-2 ${isMobile ? 'text-[var(--m-text-placeholder)]' : 'text-gray-300'}`} />
            <p className={`text-[12px] ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
              No conversations yet
            </p>
          </div>
        ) : (
          conversations.map((conv: any) => {
            const initial = conv.participants?.[0]?.name ? getInitials(conv.participants[0].name) : '?';
            const unread = conv.unreadCount > 0;
            const scopeLabel = conv.projectName || conv.clientName;

            return (
              <button
                key={conv._id}
                onClick={() => openConversation(conv._id)}
                className={`w-full flex items-center gap-3 px-3 py-3 border-b text-left ${
                  isMobile
                    ? 'border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]'
                    : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isMobile ? 'bg-[var(--m-accent-subtle)]' : 'bg-blue-50'
                }`}>
                  <span className={`text-[12px] font-semibold ${isMobile ? 'text-[var(--m-accent)]' : 'text-blue-700'}`}>
                    {initial}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[13px] truncate ${
                      unread
                        ? (isMobile ? 'font-semibold text-[var(--m-text-primary)]' : 'font-semibold text-gray-900')
                        : (isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900')
                    }`}>
                      {conv.title}
                    </span>
                    <span className={`text-[10px] flex-shrink-0 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
                      {formatTime(conv.lastMessageAt || conv.createdAt)}
                    </span>
                  </div>
                  {scopeLabel && (
                    <p className={`text-[10px] truncate ${isMobile ? 'text-[var(--m-accent)]' : 'text-blue-600'}`}>
                      {scopeLabel}
                    </p>
                  )}
                  {conv.lastMessagePreview && (
                    <p className={`text-[11px] truncate mt-0.5 ${
                      unread
                        ? (isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600')
                        : (isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400')
                    }`}>
                      {conv.lastMessagePreview}
                    </p>
                  )}
                </div>

                {unread && (
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isMobile ? 'bg-[var(--m-accent-indicator)]' : 'bg-blue-500'}`} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
