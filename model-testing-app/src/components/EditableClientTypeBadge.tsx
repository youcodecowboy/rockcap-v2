'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Built-in types with their styling
const BUILT_IN_TYPES: Record<string, { label: string; className: string }> = {
  borrower: {
    label: 'Borrower',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  lender: {
    label: 'Lender',
    className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  developer: {
    label: 'Developer',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  broker: {
    label: 'Broker',
    className: 'bg-teal-100 text-teal-800 border-teal-200',
  },
};

// Colors for custom types (cycle through these)
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

  // Check built-in types
  if (normalized === 'realestatedeveloper' || normalized === 'developer') {
    return BUILT_IN_TYPES.developer;
  }
  if (BUILT_IN_TYPES[normalized]) {
    return BUILT_IN_TYPES[normalized];
  }

  // Custom type — assign a color based on hash
  const hash = type.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const colorClass = CUSTOM_TYPE_COLORS[hash % CUSTOM_TYPE_COLORS.length];
  return {
    label: type.charAt(0).toUpperCase() + type.slice(1),
    className: colorClass,
  };
}

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
  className = ''
}: EditableClientTypeBadgeProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  const currentType = type?.toLowerCase() || 'borrower';
  const config = getTypeConfig(currentType);

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
    // Don't add if already exists
    if (allTypes.some((t) => t.key === key)) return;
    onAddCustomType?.(trimmed);
    onTypeChange(key);
    setNewTypeName('');
    setShowAddDialog(false);
  };

  return (
    <>
      <Select
        value={currentType}
        onValueChange={(value) => {
          if (value === '__add_new__') {
            setShowAddDialog(true);
            return;
          }
          onTypeChange(value);
        }}
      >
        <SelectTrigger
          className={cn(
            "h-auto border rounded-md cursor-pointer hover:opacity-80 transition-opacity shadow-none",
            compact ? "py-0 px-1.5" : "py-0.5 px-2",
            config.className,
            "data-[state=open]:ring-2 data-[state=open]:ring-blue-500 data-[state=open]:ring-offset-1",
            "focus:ring-0 focus-visible:ring-0",
            "[&>svg]:hidden",
            className
          )}
        >
          <div className="flex items-center gap-1">
            <span className={cn("font-medium", compact ? "text-[9px]" : "text-xs")}>{config.label}</span>
            <ChevronDown className={cn("opacity-60", compact ? "w-2.5 h-2.5" : "w-3 h-3")} />
          </div>
        </SelectTrigger>
        <SelectContent>
          {allTypes.map((t) => (
            <SelectItem key={t.key} value={t.key}>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", t.className.split(' ')[0])} />
                <span>{t.label}</span>
              </div>
            </SelectItem>
          ))}
          {onAddCustomType && (
            <>
              <div className="border-t my-1" />
              <SelectItem value="__add_new__">
                <div className="flex items-center gap-2 text-gray-500">
                  <Plus className="w-3 h-3" />
                  <span>Add new type...</span>
                </div>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>

      {/* Add new type dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Add Client Type</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <Input
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="e.g. Investor, Fund Manager, Surveyor"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
            />
            <p className="text-xs text-gray-500 mt-2">
              This type will be available across all clients.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setNewTypeName(''); }}>
              Cancel
            </Button>
            <Button onClick={handleAddType} disabled={!newTypeName.trim()}>
              Add Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Export for use in sidebar filters
export { BUILT_IN_TYPES, getTypeConfig };
