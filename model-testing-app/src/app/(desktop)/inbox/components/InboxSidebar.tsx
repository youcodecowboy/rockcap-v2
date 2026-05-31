'use client';

import { Flag, Bell, AtSign, CheckCircle2, Inbox } from 'lucide-react';
import { useColors } from '@/lib/useColors';

export type InboxFilter = 'all' | 'flags' | 'notifications' | 'mentions' | 'resolved';

interface FilterTab {
  key: InboxFilter;
  label: string;
  icon: React.ElementType;
}

const FILTER_TABS: FilterTab[] = [
  { key: 'all', label: 'All', icon: Inbox },
  { key: 'flags', label: 'Flags', icon: Flag },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'mentions', label: 'Mentions', icon: AtSign },
  { key: 'resolved', label: 'Resolved', icon: CheckCircle2 },
];

interface InboxSidebarProps {
  activeFilter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  counts: Record<InboxFilter, number>;
  children: React.ReactNode;
}

export default function InboxSidebar({
  activeFilter,
  onFilterChange,
  counts,
  children,
}: InboxSidebarProps) {
  const colors = useColors();
  return (
    <div
      className="w-[350px] flex-shrink-0 flex flex-col h-full"
      style={{ background: colors.bg.light, borderRight: `1px solid ${colors.border.default}` }}
    >
      {/* Filter Tabs */}
      <div className="px-3 pt-3 pb-0" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFilter === tab.key;
            const count = counts[tab.key] || 0;
            return (
              <button
                key={tab.key}
                onClick={() => onFilterChange(tab.key)}
                className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 9,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  borderRadius: '4px 4px 0 0',
                  color: isActive ? colors.text.primary : colors.text.muted,
                  background: isActive ? colors.bg.card : 'transparent',
                  border: `1px solid ${isActive ? colors.border.default : 'transparent'}`,
                  borderBottomColor: isActive ? colors.bg.card : 'transparent',
                  marginBottom: isActive ? -1 : 0,
                  transition: 'color 100ms linear, background 100ms linear',
                }}
              >
                <Icon size={13} />
                {tab.label}
                {count > 0 && (
                  <span
                    className="ml-1 flex items-center justify-center px-1"
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 2,
                      fontSize: 9,
                      fontWeight: 600,
                      background: isActive ? colors.text.primary : colors.bg.cardAlt,
                      color: isActive ? colors.bg.card : colors.text.muted,
                    }}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Item List */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
