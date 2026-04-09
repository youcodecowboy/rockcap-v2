'use client';

import { MessagesSquare, Flag, Bell } from 'lucide-react';

export type MobileInboxTab = 'messages' | 'flags' | 'notifications';

interface InboxTabsProps {
  activeTab: MobileInboxTab;
  onTabChange: (tab: MobileInboxTab) => void;
  counts: { messages: number; flags: number; notifications: number };
}

const TABS: Array<{ key: MobileInboxTab; label: string; icon: React.ElementType }> = [
  { key: 'messages', label: 'Messages', icon: MessagesSquare },
  { key: 'flags', label: 'Flags', icon: Flag },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

export default function InboxTabs({ activeTab, onTabChange, counts }: InboxTabsProps) {
  return (
    <div className="flex border-b border-[var(--m-border)] bg-[var(--m-bg)]">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        const count = counts[tab.key] || 0;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors border-b-2 ${
              active
                ? 'text-[var(--m-text-primary)] border-[var(--m-accent)]'
                : 'text-[var(--m-text-tertiary)] border-transparent'
            }`}
          >
            <Icon className="w-[14px] h-[14px]" />
            {tab.label}
            {count > 0 && (
              <span
                className={`min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-semibold px-1 ${
                  active
                    ? 'bg-[var(--m-accent)] text-white'
                    : 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]'
                }`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
