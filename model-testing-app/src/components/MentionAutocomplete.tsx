'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Building2, FolderKanban } from 'lucide-react';

interface MentionAutocompleteProps {
  query: string;
  onSelect: (mention: { type: 'client' | 'project'; name: string; id: string }) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export default function MentionAutocomplete({
  query,
  onSelect,
  onClose,
  position,
}: MentionAutocompleteProps) {
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter by query
  const q = query.toLowerCase();
  const filteredClients = (clients || [])
    .filter((c) => c.name?.toLowerCase().includes(q))
    .slice(0, 5)
    .map((c) => ({ type: 'client' as const, name: c.name, id: c._id }));

  const filteredProjects = (projects || [])
    .filter((p) => p.name?.toLowerCase().includes(q))
    .slice(0, 5)
    .map((p) => ({ type: 'project' as const, name: p.name, id: p._id }));

  const items = [...filteredClients, ...filteredProjects];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onSelect, onClose]);

  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-y-auto w-64 text-gray-900 dark:text-zinc-100"
      style={{ bottom: position.top, left: position.left }}
    >
      {items.map((item, i) => (
        <button
          key={`${item.type}-${item.id}`}
          className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm text-gray-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
            i === selectedIndex ? 'bg-zinc-100 dark:bg-zinc-800' : ''
          }`}
          onClick={() => onSelect(item)}
        >
          {item.type === 'client' ? (
            <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
          ) : (
            <FolderKanban className="w-4 h-4 text-green-500 shrink-0" />
          )}
          <span className="truncate">{item.name}</span>
          <span className="text-xs text-zinc-400 ml-auto shrink-0">
            {item.type}
          </span>
        </button>
      ))}
    </div>
  );
}
