'use client';

import { Search, X } from 'lucide-react';

interface ContactSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ContactSearchBar({ value, onChange }: ContactSearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--m-text-tertiary)]" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search contacts..."
        className="w-full pl-9 pr-8 py-2.5 bg-white border border-[var(--m-border)] rounded-lg text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none focus:border-[var(--m-accent)]"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--m-text-tertiary)]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
