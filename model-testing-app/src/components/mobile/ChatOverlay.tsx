'use client';

import { useEffect } from 'react';
import { X, Paperclip, ArrowUp, BotMessageSquare } from 'lucide-react';
import { useTabs } from '@/contexts/TabContext';

interface ChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatOverlay({ isOpen, onClose }: ChatOverlayProps) {
  const { tabs, activeTabId } = useTabs();
  const activeTab = tabs.find(t => t.id === activeTabId);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative mt-auto h-[85vh] bg-[var(--m-bg)] rounded-t-xl flex flex-col z-10 shadow-2xl">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--m-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[var(--m-accent)] rounded-md flex items-center justify-center">
              <BotMessageSquare className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-[13px] font-medium text-[var(--m-text-primary)]">Assistant</div>
              {activeTab && activeTab.type !== 'dashboard' && (
                <div className="text-[11px] text-[var(--m-text-tertiary)]">{activeTab.title}</div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[var(--m-text-tertiary)] text-[13px]">Chat assistant</div>
            <div className="text-[var(--m-text-placeholder)] text-[11px] mt-1">API integration in a later phase</div>
          </div>
        </div>

        {/* Input area */}
        <div className="px-3 py-2.5 border-t border-[var(--m-border)] pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 flex items-center justify-center text-[var(--m-text-tertiary)] flex-shrink-0">
              <Paperclip className="w-4 h-4" />
            </button>
            <div className="flex-1 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 text-[13px] text-[var(--m-text-placeholder)]">
              Ask anything…
            </div>
            <button className="w-8 h-8 flex items-center justify-center bg-[var(--m-accent)] rounded-lg text-white flex-shrink-0">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
