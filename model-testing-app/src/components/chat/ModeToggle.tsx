'use client';

import { BotMessageSquare, MessagesSquare } from 'lucide-react';
import { useMessenger } from '@/contexts/MessengerContext';

interface ModeToggleProps {
  unreadMessageCount?: number;
  variant?: 'mobile' | 'desktop';
}

export default function ModeToggle({ unreadMessageCount = 0, variant = 'mobile' }: ModeToggleProps) {
  const { mode, setMode } = useMessenger();

  const isMobile = variant === 'mobile';

  return (
    <div className={`flex items-center gap-1 p-0.5 rounded-lg ${
      isMobile ? 'bg-[var(--m-bg-inset)]' : 'bg-gray-100'
    }`}>
      <button
        onClick={() => setMode('assistant')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
          mode === 'assistant'
            ? (isMobile ? 'bg-[var(--m-bg)] text-[var(--m-text-primary)] shadow-sm' : 'bg-white text-gray-900 shadow-sm')
            : (isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-500')
        }`}
      >
        <BotMessageSquare className="w-3.5 h-3.5" />
        Assistant
      </button>
      <button
        onClick={() => setMode('messenger')}
        className={`relative flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
          mode === 'messenger'
            ? (isMobile ? 'bg-[var(--m-bg)] text-[var(--m-text-primary)] shadow-sm' : 'bg-white text-gray-900 shadow-sm')
            : (isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-500')
        }`}
      >
        <MessagesSquare className="w-3.5 h-3.5" />
        Messages
        {unreadMessageCount > 0 && (
          <span className={`min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold px-1 ${
            isMobile ? 'bg-[var(--m-error)] text-white' : 'bg-red-500 text-white'
          }`}>
            {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
          </span>
        )}
      </button>
    </div>
  );
}
