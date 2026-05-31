'use client';

import { useState } from 'react';
import { Flag, Bell, AtSign } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { EmptyState, StatusPill } from '@/components/layouts';
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

function ItemIcon({ item, colors }: { item: InboxItem; colors: ReturnType<typeof useColors> }) {
  if (item.kind === 'flag') {
    return <Flag size={16} style={{ color: colors.accent.orange, flexShrink: 0 }} />;
  }
  if (item.data.type === 'flag') {
    return <AtSign size={16} style={{ color: colors.accent.blue, flexShrink: 0 }} />;
  }
  return <Bell size={16} style={{ color: colors.text.dim, flexShrink: 0 }} />;
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

function ItemRow({
  item,
  selected,
  onSelect,
  colors,
}: {
  item: InboxItem;
  selected: boolean;
  onSelect: (id: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [hover, setHover] = useState(false);
  const unread = isUnread(item);
  const urgent = item.kind === 'flag' && item.data.priority === 'urgent';
  const accent = selected
    ? colors.text.primary
    : urgent
      ? colors.accent.red
      : 'transparent';

  return (
    <button
      onClick={() => onSelect(item.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="w-full text-left px-4 py-3"
      style={{
        background: selected ? colors.bg.card : hover ? colors.bg.cardAlt : 'transparent',
        borderLeft: `2px solid ${accent}`,
        transition: 'background 100ms linear',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <ItemIcon item={item} colors={colors} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {item.kind === 'flag' && item.data.entityType && (
                <StatusPill
                  label={ENTITY_TYPE_SHORT[item.data.entityType] || item.data.entityType}
                  tone={colors.text.muted}
                />
              )}
              <span
                className="truncate"
                style={{
                  fontSize: 13,
                  fontWeight: unread ? 600 : 400,
                  color: unread ? colors.text.primary : colors.text.secondary,
                }}
              >
                {getTitle(item)}
              </span>
            </div>
            <span
              className="whitespace-nowrap flex-shrink-0"
              style={{ fontSize: 11, color: colors.text.dim }}
            >
              {relativeTime(item.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate" style={{ fontSize: 12, color: colors.text.muted }}>
            {getPreview(item)}
          </p>
          {item.entityContext && (
            <p className="mt-0.5 truncate" style={{ fontSize: 11, color: colors.text.dim }}>
              {item.entityContext}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function InboxItemList({ items, selectedId, onSelect }: InboxItemListProps) {
  const colors = useColors();

  if (items.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={<Bell size={20} />} title="No items to show" />
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${colors.border.light}` }}>
      {items.map((item) => (
        <div key={item.id} style={{ borderBottom: `1px solid ${colors.border.light}` }}>
          <ItemRow
            item={item}
            selected={item.id === selectedId}
            onSelect={onSelect}
            colors={colors}
          />
        </div>
      ))}
    </div>
  );
}
