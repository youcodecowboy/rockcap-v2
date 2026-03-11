'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onSelect: (value: string) => void;
  placeholder?: string;
  allowCreate?: boolean;
  onCreateNew?: (query: string) => void;
  compact?: boolean;
  disabled?: boolean;
  groupSeparator?: boolean;
  renderOption?: (option: SearchableSelectOption) => React.ReactNode;
}

export function SearchableSelect({
  options,
  value,
  onSelect,
  placeholder = 'Search...',
  allowCreate = false,
  onCreateNew,
  compact = false,
  disabled = false,
  groupSeparator = false,
  renderOption,
}: SearchableSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Group options if groupSeparator is enabled
  const groupedEntries = useMemo(() => {
    if (!groupSeparator) return filtered.map((o) => ({ type: 'option' as const, option: o }));

    const entries: Array<
      | { type: 'option'; option: SearchableSelectOption }
      | { type: 'separator'; label: string }
    > = [];
    let lastGroup: string | undefined;

    for (const option of filtered) {
      if (option.group && option.group !== lastGroup) {
        if (lastGroup !== undefined) {
          entries.push({ type: 'separator', label: option.group });
        }
        lastGroup = option.group;
      }
      entries.push({ type: 'option', option });
    }
    return entries;
  }, [filtered, groupSeparator]);

  // Flat list of only option entries for keyboard navigation indexing
  const optionEntries = useMemo(
    () => groupedEntries.filter((e) => e.type === 'option') as Array<{ type: 'option'; option: SearchableSelectOption }>,
    [groupedEntries]
  );

  const showCreateOption =
    allowCreate && query.trim() && !filtered.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option-index]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleSelect = (val: string) => {
    onSelect(val);
    setIsOpen(false);
    setQuery('');
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect('');
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = optionEntries.length + (showCreateOption ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < optionEntries.length) {
        handleSelect(optionEntries[highlightedIndex].option.value);
      } else if (showCreateOption && highlightedIndex === optionEntries.length) {
        onCreateNew?.(query.trim());
        setIsOpen(false);
        setQuery('');
        setHighlightedIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
      setHighlightedIndex(-1);
    }
  };

  const triggerClasses = compact
    ? 'h-7 text-xs px-2'
    : 'h-9 text-sm px-3';

  const dropdownItemClasses = compact ? 'text-xs' : 'text-sm';

  return (
    <div className="relative flex-1" ref={containerRef}>
      {isOpen ? (
        <div className="relative">
          <Search className={cn(
            'absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground',
            compact ? 'w-3 h-3' : 'w-4 h-4'
          )} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
            className={cn(
              'w-full rounded-md border border-input bg-transparent outline-none',
              'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              compact ? 'h-7 text-xs pl-7 pr-2' : 'h-9 text-sm pl-8 pr-3'
            )}
            disabled={disabled}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!disabled) {
              setIsOpen(true);
              setQuery('');
              setHighlightedIndex(-1);
            }
          }}
          disabled={disabled}
          className={cn(
            'w-full flex items-center justify-between rounded-md border border-input bg-transparent',
            'hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50',
            triggerClasses
          )}
        >
          <span className={cn('truncate', !selectedOption && 'text-muted-foreground')}>
            {selectedOption?.label || placeholder}
          </span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {value && (
              <span
                role="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
              </span>
            )}
            <ChevronDown className={cn('text-muted-foreground', compact ? 'w-3 h-3' : 'w-4 h-4')} />
          </div>
        </button>
      )}

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-[100] w-full mt-1 bg-white border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {groupedEntries.map((entry, idx) => {
            if (entry.type === 'separator') {
              return (
                <div
                  key={`sep-${entry.label}`}
                  className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-t mt-1"
                >
                  {entry.label}
                </div>
              );
            }

            const optionIdx = optionEntries.indexOf(entry as { type: 'option'; option: SearchableSelectOption });
            return (
              <button
                key={entry.option.value}
                type="button"
                data-option-index={optionIdx}
                onClick={() => handleSelect(entry.option.value)}
                className={cn(
                  'w-full text-left px-2 py-1.5 hover:bg-accent flex items-center gap-2',
                  dropdownItemClasses,
                  highlightedIndex === optionIdx && 'bg-accent',
                  entry.option.value === value && 'font-medium'
                )}
              >
                {renderOption ? renderOption(entry.option) : entry.option.label}
              </button>
            );
          })}

          {showCreateOption && (
            <button
              type="button"
              data-option-index={optionEntries.length}
              onClick={() => {
                onCreateNew?.(query.trim());
                setIsOpen(false);
                setQuery('');
                setHighlightedIndex(-1);
              }}
              className={cn(
                'w-full text-left px-2 py-1.5 hover:bg-accent flex items-center gap-2 border-t text-primary',
                dropdownItemClasses,
                highlightedIndex === optionEntries.length && 'bg-accent'
              )}
            >
              <Plus className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
              Create &quot;{query.trim()}&quot;
            </button>
          )}

          {filtered.length === 0 && !showCreateOption && (
            <div className={cn('px-2 py-3 text-center text-muted-foreground', dropdownItemClasses)}>
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
