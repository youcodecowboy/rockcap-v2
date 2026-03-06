'use client';

import { Flag, Bell, AtSign } from 'lucide-react';

// Relative time helper
function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export interface InboxItem {
  kind: 'flag' | 'notification';
  id: string;
  createdAt: string;
  data: {
    note?: string;
    title?: string;
    message?: string;
    priority?: 'normal' | 'urgent';
    status?: string;
    type?: string;
    entityType?: string;
    isRead?: boolean;
  };
}

interface InboxItemListProps {
  items: InboxItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function getIcon(item: InboxItem) {
  if (item.kind === 'flag') {
    return <Flag className="h-4 w-4 text-orange-500 flex-shrink-0" />;
  }
  if (item.data.type === 'flag') {
    return <AtSign className="h-4 w-4 text-blue-500 flex-shrink-0" />;
  }
  return <Bell className="h-4 w-4 text-gray-400 flex-shrink-0" />;
}

function getTitle(item: InboxItem): string {
  if (item.kind === 'flag') {
    const entity = item.data.entityType
      ? item.data.entityType.charAt(0).toUpperCase() + item.data.entityType.slice(1)
      : 'Item';
    return `Flag: ${entity}`;
  }
  return item.data.title || 'Notification';
}

function getPreview(item: InboxItem): string {
  const text = item.kind === 'flag' ? item.data.note : item.data.message;
  if (!text) return '';
  return text.length > 60 ? text.substring(0, 60) + '...' : text;
}

function isUnread(item: InboxItem): boolean {
  if (item.kind === 'flag') {
    return item.data.status === 'open';
  }
  return item.data.isRead === false;
}

export default function InboxItemList({ items, selectedId, onSelect }: InboxItemListProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 px-4">
        <p className="text-sm text-gray-400">No items to show</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.map((item) => {
        const selected = item.id === selectedId;
        const unread = isUnread(item);
        const urgent = item.kind === 'flag' && item.data.priority === 'urgent';

        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full text-left px-4 py-3 transition-colors ${
              selected
                ? 'bg-white border-l-2 border-l-gray-900'
                : 'hover:bg-gray-100 border-l-2 border-l-transparent'
            } ${urgent && !selected ? 'border-l-red-500' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getIcon(item)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm truncate ${
                      unread ? 'font-semibold text-gray-900' : 'font-normal text-gray-700'
                    }`}
                  >
                    {getTitle(item)}
                  </span>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                    {relativeTime(item.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{getPreview(item)}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
