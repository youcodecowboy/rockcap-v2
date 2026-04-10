'use client';

export type UploadScope = 'client' | 'internal' | 'personal';

interface ScopeToggleProps {
  value: UploadScope;
  onChange: (scope: UploadScope) => void;
}

const SCOPES: { key: UploadScope; label: string }[] = [
  { key: 'client', label: 'Client' },
  { key: 'internal', label: 'Internal' },
  { key: 'personal', label: 'Personal' },
];

export default function ScopeToggle({ value, onChange }: ScopeToggleProps) {
  return (
    <div className="flex gap-2">
      {SCOPES.map(({ key, label }) => {
        const isSelected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-colors ${
              isSelected
                ? 'bg-[var(--m-text-primary)] text-white'
                : 'bg-[var(--m-bg-subtle)] border border-[var(--m-border)] text-[var(--m-text-secondary)]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
