'use client';

import { Flag, Bell, AtSign, CheckCircle2, Inbox } from 'lucide-react';

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
  return (
    <div className="w-[350px] flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      {/* Filter Tabs */}
      <div className="border-b border-gray-200 px-3 pt-3 pb-0">
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFilter === tab.key;
            const count = counts[tab.key] || 0;
            return (
              <button
                key={tab.key}
                onClick={() => onFilterChange(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-gray-900 border border-gray-200 border-b-white -mb-px'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {count > 0 && (
                  <span
                    className={`ml-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-semibold px-1 ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
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
