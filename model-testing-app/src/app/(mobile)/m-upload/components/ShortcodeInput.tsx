'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Check, Loader2, Pencil } from 'lucide-react';

interface ShortcodeInputProps {
  projectId?: string;
  projectName?: string;
  value: string;
  onChange: (shortcode: string) => void;
}

export default function ShortcodeInput({ projectId, projectName, value, onChange }: ShortcodeInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedValue, setDebouncedValue] = useState(value);

  // Auto-suggest shortcode when project name changes and no shortcode set
  const suggestion = useQuery(
    api.projects.suggestShortcode,
    projectName && !value ? { name: projectName } : 'skip'
  );

  // Check availability of current input
  const isAvailable = useQuery(
    api.projects.isShortcodeAvailable,
    debouncedValue.length >= 2
      ? {
          shortcode: debouncedValue,
          excludeProjectId: projectId ? (projectId as Id<'projects'>) : undefined,
        }
      : 'skip'
  );

  // Apply suggestion when it arrives
  useEffect(() => {
    if (suggestion && suggestion.isAvailable && !value) {
      onChange(suggestion.shortcode);
      setLocalValue(suggestion.shortcode);
      setDebouncedValue(suggestion.shortcode);
    }
  }, [suggestion, value, onChange]);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
    setDebouncedValue(value);
  }, [value]);

  const handleChange = useCallback(
    (raw: string) => {
      const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      setLocalValue(cleaned);
      onChange(cleaned);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedValue(cleaned);
      }, 400);
    },
    [onChange]
  );

  // If project already has a shortcode and we're not editing, show badge
  if (value && !isEditing) {
    return (
      <div className="flex items-center gap-2">
        <span className="px-2.5 py-1 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-md text-[13px] font-mono text-[var(--m-text-primary)]">
          {value}
        </span>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1 text-[12px] text-[var(--m-text-secondary)]"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
        {isAvailable === true && (
          <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="e.g. PROJ1"
        maxLength={10}
        className="flex-1 px-3 py-2 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg text-[13px] font-mono text-[var(--m-text-primary)] placeholder:text-[var(--m-text-tertiary)] outline-none focus:border-[var(--m-text-secondary)]"
        style={{ fontSize: '16px' }}
        autoFocus={isEditing}
        onBlur={() => {
          if (value) setIsEditing(false);
        }}
      />
      <div className="flex-shrink-0 w-6 flex items-center justify-center">
        {debouncedValue.length >= 2 && isAvailable === undefined && (
          <Loader2 className="w-4 h-4 text-[var(--m-text-tertiary)] animate-spin" />
        )}
        {isAvailable === true && (
          <Check className="w-4 h-4 text-green-600" />
        )}
        {isAvailable === false && (
          <span className="text-[11px] text-red-500 font-medium whitespace-nowrap">Taken</span>
        )}
      </div>
    </div>
  );
}
