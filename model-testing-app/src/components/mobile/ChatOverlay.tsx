'use client';

import { useEffect } from 'react';
import { X, Paperclip, ArrowUp } from 'lucide-react';
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative mt-auto h-[85vh] bg-zinc-900 rounded-t-2xl flex flex-col z-10">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm">
              🤖
            </div>
            <div>
              <div className="text-sm font-semibold text-white">RockCap Assistant</div>
              {activeTab && activeTab.type !== 'dashboard' && (
                <div className="text-xs text-zinc-500">Context: {activeTab.title}</div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 flex items-center justify-center">
          <div className="text-center">
            <div className="text-zinc-500 text-sm">Chat assistant</div>
            <div className="text-zinc-600 text-xs mt-1">Coming soon — API integration in a later phase</div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 flex items-center justify-center bg-zinc-800 rounded-full text-zinc-400 flex-shrink-0">
              <Paperclip className="w-4 h-4" />
            </button>
            <div className="flex-1 bg-zinc-800 rounded-2xl px-4 py-2.5 text-sm text-zinc-500">
              Ask anything...
            </div>
            <button className="w-9 h-9 flex items-center justify-center bg-blue-600 rounded-full text-white flex-shrink-0">
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
