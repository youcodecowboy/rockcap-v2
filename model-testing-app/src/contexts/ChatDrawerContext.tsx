'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface ChatDrawerContextType {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const ChatDrawerContext = createContext<ChatDrawerContextType | undefined>(undefined);

export function ChatDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ChatDrawerContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </ChatDrawerContext.Provider>
  );
}

export function useChatDrawer() {
  const context = useContext(ChatDrawerContext);
  if (context === undefined) {
    throw new Error('useChatDrawer must be used within a ChatDrawerProvider');
  }
  return context;
}

