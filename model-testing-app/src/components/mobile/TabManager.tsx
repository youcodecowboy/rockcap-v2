'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useTabs } from '@/contexts/TabContext';

export default function TabManager() {
  const { tabs, activeTabId, switchTab, closeTab } = useTabs();
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center bg-[var(--m-bg)] border-b border-[var(--m-border)] px-3 h-[var(--m-tab-bar-h)]">
      <div
        ref={scrollRef}
        className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide"
      >
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => { switchTab(tab.id); router.push(tab.route); }}
              className={`relative flex items-center gap-1 px-2.5 py-1 text-[11px] whitespace-nowrap flex-shrink-0 transition-colors rounded-sm ${
                isActive
                  ? 'text-[var(--m-text-primary)] font-medium'
                  : 'text-[var(--m-text-tertiary)]'
              }`}
            >
              <span className="max-w-[100px] truncate">{tab.title}</span>
              {tabs.length > 1 && tab.id !== 'dashboard' && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="ml-0.5 p-0.5 rounded-sm text-[var(--m-text-tertiary)] hover:text-[var(--m-text-secondary)]"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              )}
              {/* Active indicator — bottom bar */}
              {isActive && (
                <span className="absolute bottom-0 left-1.5 right-1.5 h-[1.5px] bg-[var(--m-accent-indicator)] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
