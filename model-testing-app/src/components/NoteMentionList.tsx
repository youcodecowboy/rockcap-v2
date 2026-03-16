'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { Building2, FolderKanban, User } from 'lucide-react';

export interface MentionItem {
  id: string;
  label: string;
  type: 'user' | 'client' | 'project';
}

interface NoteMentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

const NoteMentionList = forwardRef<any, NoteMentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          if (items[selectedIndex]) {
            command(items[selectedIndex]);
          }
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-sm text-zinc-400">
          No results
        </div>
      );
    }

    const iconForType = (type: MentionItem['type']) => {
      switch (type) {
        case 'user':
          return <User className="w-4 h-4 text-blue-500 shrink-0" />;
        case 'client':
          return <Building2 className="w-4 h-4 text-amber-500 shrink-0" />;
        case 'project':
          return <FolderKanban className="w-4 h-4 text-purple-500 shrink-0" />;
      }
    };

    const labelForType = (type: MentionItem['type']) => {
      switch (type) {
        case 'user':
          return 'user';
        case 'client':
          return 'client';
        case 'project':
          return 'project';
      }
    };

    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-y-auto w-64">
        {items.map((item, i) => (
          <button
            key={`${item.type}-${item.id}`}
            className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
              i === selectedIndex ? 'bg-zinc-100 dark:bg-zinc-800' : ''
            }`}
            onClick={() => command(item)}
          >
            {iconForType(item.type)}
            <span className="truncate">{item.label}</span>
            <span className="text-xs text-zinc-400 ml-auto shrink-0">
              {labelForType(item.type)}
            </span>
          </button>
        ))}
      </div>
    );
  }
);

NoteMentionList.displayName = 'NoteMentionList';

export default NoteMentionList;
