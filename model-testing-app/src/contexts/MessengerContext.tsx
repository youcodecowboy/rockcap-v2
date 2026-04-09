'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import type { EntityReference } from '@/components/messages/ReferenceChip';

export type ChatMode = 'assistant' | 'messenger';
export type MessengerView = 'library' | 'thread' | 'new';

interface PrePopulatedMessage {
  references?: EntityReference[];
  suggestedTitle?: string;
}

interface MessengerContextType {
  isChatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;
  view: MessengerView;
  setView: (view: MessengerView) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  prePopulated: PrePopulatedMessage | null;
  setPrePopulated: (data: PrePopulatedMessage | null) => void;
  startNewMessage: (data: PrePopulatedMessage) => void;
  openConversation: (conversationId: string) => void;
}

const MessengerContext = createContext<MessengerContextType | undefined>(undefined);

export function MessengerProvider({ children }: { children: ReactNode }) {
  const [isChatOpen, setChatOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>('assistant');
  const [view, setView] = useState<MessengerView>('library');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [prePopulated, setPrePopulated] = useState<PrePopulatedMessage | null>(null);

  const startNewMessage = (data: PrePopulatedMessage) => {
    setMode('messenger');
    setView('new');
    setActiveConversationId(null);
    setPrePopulated(data);
    setChatOpen(true);
  };

  const openConversation = (conversationId: string) => {
    setMode('messenger');
    setView('thread');
    setActiveConversationId(conversationId);
    setChatOpen(true);
  };

  return (
    <MessengerContext.Provider
      value={{
        isChatOpen,
        setChatOpen,
        mode,
        setMode,
        view,
        setView,
        activeConversationId,
        setActiveConversationId,
        prePopulated,
        setPrePopulated,
        startNewMessage,
        openConversation,
      }}
    >
      {children}
    </MessengerContext.Provider>
  );
}

export function useMessenger() {
  const ctx = useContext(MessengerContext);
  if (!ctx) throw new Error('useMessenger must be used within MessengerProvider');
  return ctx;
}
