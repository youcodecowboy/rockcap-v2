'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useMessenger } from '@/contexts/MessengerContext';
import { useTabs } from '@/contexts/TabContext';
import type { EntityReference } from '@/components/messages/ReferenceChip';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';

interface ConversationThreadProps {
  conversationId: string;
  variant?: 'mobile' | 'desktop';
}

export default function ConversationThread({ conversationId, variant = 'mobile' }: ConversationThreadProps) {
  const { setView, setActiveConversationId, setChatOpen } = useMessenger();
  const convId = conversationId as Id<'conversations'>;
  const conversation = useQuery(api.conversations.get, { id: convId });
  const messages = useQuery(api.directMessages.getByConversation, { conversationId: convId });
  const markAsRead = useMutation(api.conversations.markAsRead);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const tabs = (() => { try { return useTabs(); } catch { return null; } })();

  const isMobile = variant === 'mobile';

  // Mobile: open documents in tab viewer, clients/projects via mobile route
  // Desktop: no handler (ReferenceChip falls back to <Link> with desktop routes)
  const handleReferencePress = useCallback((ref: EntityReference) => {
    if (!isMobile) return;
    setChatOpen(false);
    if (ref.type === 'document') {
      tabs?.openTab({
        type: 'docs',
        title: ref.name,
        route: '/m-docs',
        params: { documentId: ref.id },
      });
      router.push('/m-docs');
    } else if (ref.type === 'client') {
      router.push('/m-clients');
    } else if (ref.type === 'project') {
      router.push('/m-clients');
    }
  }, [isMobile, setChatOpen, tabs, router]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      markAsRead({ conversationId: convId });
    }
  }, [messages?.length, convId, markAsRead]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  const handleBack = () => {
    setActiveConversationId(null);
    setView('library');
  };

  if (!conversation) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className={`animate-spin rounded-full h-6 w-6 border-b-2 ${isMobile ? 'border-[var(--m-accent)]' : 'border-gray-900'}`} />
      </div>
    );
  }

  const currentUserId = conversation.currentUserId;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className={`flex items-center gap-3 px-3 py-2.5 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-200'}`}>
        <button
          onClick={handleBack}
          className={`p-1 ${isMobile ? 'text-[var(--m-text-secondary)] active:text-[var(--m-text-primary)]' : 'text-gray-500 hover:text-gray-900'}`}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className={`text-[13px] font-semibold truncate ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
            {conversation.title}
          </h2>
          <p className={`text-[10px] truncate ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-500'}`}>
            {conversation.participants
              .filter((p: any) => p.id !== currentUserId)
              .map((p: any) => p.name)
              .join(', ')}
            {conversation.projectName && ` · ${conversation.projectName}`}
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {!messages || messages.length === 0 ? (
          <div className="text-center py-8">
            <p className={`text-[12px] ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          messages.map((msg: any) => (
            <MessageBubble
              key={msg._id}
              content={msg.content}
              senderName={msg.senderName}
              isMine={msg.senderId === currentUserId}
              isDeleted={msg.isDeleted}
              isEdited={msg.isEdited}
              createdAt={msg.createdAt}
              references={msg.references}
              variant={variant}
              onReferencePress={isMobile ? handleReferencePress : undefined}
            />
          ))
        )}
      </div>

      <MessageComposer conversationId={convId} variant={variant} />
    </div>
  );
}
