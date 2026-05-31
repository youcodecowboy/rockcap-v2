'use client';

import { Search, X } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { Input, IconButton } from '@/components/layouts';

interface ContactSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ContactSearchBar({ value, onChange }: ContactSearchBarProps) {
  const colors = useColors();
  return (
    <div className="relative">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
        style={{ color: colors.text.muted }}
      />
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search contacts..."
        style={{ paddingLeft: 34, paddingRight: 34 }}
      />
      {value && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <IconButton label="Clear search" onClick={() => onChange('')}>
            <X className="w-3.5 h-3.5" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
