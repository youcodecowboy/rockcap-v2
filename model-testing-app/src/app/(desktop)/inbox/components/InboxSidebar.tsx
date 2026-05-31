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
      {/* Filter Tabs — flat underline tabs that wrap (no horizontal scroll) */}
      <div className="px-3 pt-2" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
        <div className="flex flex-wrap gap-x-3">
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFilter === tab.key;
            const count = counts[tab.key] || 0;
            return (
              <button
                key={tab.key}
                onClick={() => onFilterChange(tab.key)}
                className="flex items-center gap-1.5 py-2 whitespace-nowrap"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 9,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  color: isActive ? colors.text.primary : colors.text.muted,
                  background: 'transparent',
                  borderBottom: `2px solid ${isActive ? colors.text.primary : 'transparent'}`,
                  marginBottom: -1,
                  transition: 'color 100ms linear, border-color 100ms linear',
                }}
              >
                <Icon size={12} />
                {tab.label}
                {count > 0 && (
                  <span
                    className="flex items-center justify-center px-1"
                    style={{
                      minWidth: 16,
                      height: 16,
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
