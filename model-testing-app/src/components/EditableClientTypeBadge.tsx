'use client';

import { useState, type CSSProperties } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { Modal, Field, Input, Button } from '@/components/layouts';

// Built-in types. `className` is retained for backward-compatible exports;
// `tone` drives the canon token styling.
const BUILT_IN_TYPES: Record<string, { label: string; className: string }> = {
  borrower: { label: 'Borrower', className: 'bg-green-100 text-green-800 border-green-200' },
  lender: { label: 'Lender', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  developer: { label: 'Developer', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  broker: { label: 'Broker', className: 'bg-teal-100 text-teal-800 border-teal-200' },
};

// Map a type key onto a palette accent key.
const BUILT_IN_ACCENTS: Record<string, keyof ReturnType<typeof useColors>['accent']> = {
  borrower: 'green',
  lender: 'indigo',
  developer: 'yellow',
  broker: 'teal',
};

const CUSTOM_TYPE_ACCENTS: Array<keyof ReturnType<typeof useColors>['accent']> = [
  'red',
  'cyan',
  'purple',
  'orange',
  'green',
  'blue',
];

// Retained for backward-compatible custom-type styling in any external consumer.
const CUSTOM_TYPE_COLORS = [
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-lime-100 text-lime-800 border-lime-200',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
];

function getTypeConfig(type: string): { label: string; className: string } {
  const normalized = type.toLowerCase().replace(/[-_]/g, '');

  if (normalized === 'realestatedeveloper' || normalized === 'developer') {
    return BUILT_IN_TYPES.developer;
  }
  if (BUILT_IN_TYPES[normalized]) {
    return BUILT_IN_TYPES[normalized];
  }

  const hash = type.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const colorClass = CUSTOM_TYPE_COLORS[hash % CUSTOM_TYPE_COLORS.length];
  return {
    label: type.charAt(0).toUpperCase() + type.slice(1),
    className: colorClass,
  };
}

function getTypeTone(type: string, colors: ReturnType<typeof useColors>): string {
  const normalized = type.toLowerCase().replace(/[-_]/g, '');
  const builtin = normalized === 'realestatedeveloper' ? 'developer' : normalized;
  if (BUILT_IN_ACCENTS[builtin]) return colors.accent[BUILT_IN_ACCENTS[builtin]];
  const hash = type.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors.accent[CUSTOM_TYPE_ACCENTS[hash % CUSTOM_TYPE_ACCENTS.length]];
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface EditableClientTypeBadgeProps {
  type: string | undefined;
  onTypeChange: (type: string) => void;
  customTypes?: string[];
  onAddCustomType?: (type: string) => void;
  compact?: boolean;
  className?: string;
}

export default function EditableClientTypeBadge({
  type,
  onTypeChange,
  customTypes = [],
  onAddCustomType,
  compact = false,
  className = '',
}: EditableClientTypeBadgeProps) {
  const colors = useColors();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  const currentType = type?.toLowerCase() || 'borrower';
  const config = getTypeConfig(currentType);
  const tone = getTypeTone(currentType, colors);

  // All available types: built-in + custom
  const allTypes = [
    ...Object.entries(BUILT_IN_TYPES).map(([key, cfg]) => ({ key, ...cfg })),
    ...customTypes
      .filter((ct) => !BUILT_IN_TYPES[ct.toLowerCase()])
      .map((ct) => ({ key: ct.toLowerCase(), ...getTypeConfig(ct) })),
  ];

  const handleAddType = () => {
    const trimmed = newTypeName.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (allTypes.some((t) => t.key === key)) return;
    onAddCustomType?.(trimmed);
    onTypeChange(key);
    setNewTypeName('');
    setShowAddDialog(false);
  };

  const handleChange = (value: string) => {
    if (value === '__add_new__') {
      setShowAddDialog(true);
      return;
    }
    onTypeChange(value);
  };

  // Compact: bare mono text; default: tone-filled pill. A transparent native
  // <select> overlay preserves the existing edit logic without shadcn Select.
  const pillStyle: CSSProperties = compact
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 2px',
        fontFamily: MONO,
        fontSize: 9,
        lineHeight: 1.4,
        color: colors.text.muted,
        cursor: 'pointer',
      }
    : {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: 2,
        fontFamily: MONO,
        fontSize: 9,
        lineHeight: 1.3,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: `${tone}20`,
        color: tone,
        border: `1px solid ${tone}40`,
        cursor: 'pointer',
      };

  return (
    <>
      <span className={className} style={{ position: 'relative', display: 'inline-flex' }}>
        <span style={pillStyle}>
          {config.label}
          {!compact && <ChevronDown style={{ width: 10, height: 10, opacity: 0.6 }} />}
        </span>
        <select
          value={currentType}
          onChange={(e) => handleChange(e.target.value)}
          aria-label="Change client type"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            appearance: 'none',
          }}
        >
          {allTypes.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
          {onAddCustomType && <option value="__add_new__">Add new type…</option>}
        </select>
      </span>

      {/* Add new type modal */}
      <Modal
        open={showAddDialog}
        onClose={() => {
          setShowAddDialog(false);
          setNewTypeName('');
        }}
        title="Add Client Type"
        width={360}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowAddDialog(false);
                setNewTypeName('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddType} disabled={!newTypeName.trim()}>
              <Plus style={{ width: 14, height: 14 }} />
              Add Type
            </Button>
          </>
        }
      >
        <Field label="Type name" hint="This type will be available across all clients.">
          <Input
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder="e.g. Investor, Fund Manager, Surveyor"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
          />
        </Field>
      </Modal>
    </>
  );
}

// Export for use in sidebar filters
export { BUILT_IN_TYPES, getTypeConfig };
