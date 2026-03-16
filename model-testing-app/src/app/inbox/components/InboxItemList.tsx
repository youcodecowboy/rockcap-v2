'use client';

import { Flag, Bell, AtSign } from 'lucide-react';
import { relativeTime, ENTITY_TYPE_SHORT } from '@/components/threads/utils';

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
  entityName?: string;
  entityContext?: string;
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
    if (item.entityName) {
      return item.entityName;
    }
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
                  <div className="flex items-center gap-1.5 min-w-0">
                    {item.kind === 'flag' && item.data.entityType && (
                      <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-gray-100 text-gray-500 uppercase tracking-wide flex-shrink-0">
                        {ENTITY_TYPE_SHORT[item.data.entityType] || item.data.entityType}
                      </span>
                    )}
                    <span
                      className={`text-sm truncate ${
                        unread ? 'font-semibold text-gray-900' : 'font-normal text-gray-700'
                      }`}
                    >
                      {getTitle(item)}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                    {relativeTime(item.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{getPreview(item)}</p>
                {item.entityContext && (
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.entityContext}</p>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
