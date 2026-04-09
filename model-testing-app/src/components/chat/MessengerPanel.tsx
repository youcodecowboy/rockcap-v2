'use client';

import { useMessenger } from '@/contexts/MessengerContext';
import ConversationLibrary from './ConversationLibrary';
import ConversationThread from './ConversationThread';
import NewConversationForm from './NewConversationForm';

interface MessengerPanelProps {
  variant?: 'mobile' | 'desktop';
}

export default function MessengerPanel({ variant = 'mobile' }: MessengerPanelProps) {
  const { view, activeConversationId } = useMessenger();

  if (view === 'thread' && activeConversationId) {
    return <ConversationThread conversationId={activeConversationId} variant={variant} />;
  }

  if (view === 'new') {
    return <NewConversationForm variant={variant} />;
  }

  return <ConversationLibrary variant={variant} />;
}
