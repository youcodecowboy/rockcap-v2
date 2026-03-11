# Searchable Type Dropdowns Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make document type, category, and folder dropdowns searchable in the bulk review table, and allow users to create custom document types inline.

**Architecture:** Extract the existing searchable dropdown pattern from BulkUpload.tsx into a reusable `SearchableSelect` component. Replace all three Select dropdowns in BulkReviewTable with it. Add a `createFromBulkReview` mutation to the existing `fileTypeDefinitions` Convex table. Wire up `ConvexHttpClient` in the V4 route so the AI classifier can load custom types.

**Tech Stack:** Next.js 16, Convex, React, shadcn/ui, Radix UI, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-11-searchable-type-dropdowns-design.md`

---

## Chunk 1: SearchableSelect Component + BulkUpload Refactor

### Task 1: Create `SearchableSelect` Component

**Files:**
- Create: `src/components/ui/searchable-select.tsx`

This component extracts the search/filter/dropdown pattern already used in `src/components/BulkUpload.tsx` (lines 917-981 for client, similar for project) into a generic reusable component.

- [ ] **Step 1: Create the SearchableSelect component**

Create `src/components/ui/searchable-select.tsx` with this implementation:

```tsx
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `searchable-select.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/searchable-select.tsx
git commit -m "feat: add SearchableSelect reusable component"
```

### Task 2: Refactor BulkUpload Client/Project Selectors

**Files:**
- Modify: `src/components/BulkUpload.tsx`

Replace the inline client and project search dropdowns with the new `SearchableSelect` component. This validates the component works before applying it to the review table.

- [ ] **Step 1: Refactor the client selector**

In `src/components/BulkUpload.tsx`:

1. Add import at top:
```tsx
import { SearchableSelect } from '@/components/ui/searchable-select';
```

2. Remove the following state variables (lines ~148-154):
   - `clientSearchQuery`, `showClientResults` — managed internally by SearchableSelect
   - `projectSearchQuery`, `showProjectResults` — managed internally by SearchableSelect
   - `clientDropdownRef`, `projectDropdownRef` — managed internally by SearchableSelect

3. Keep the `filteredClients` and `filteredProjects` useMemo hooks but convert them to option format, or replace inline.

4. Replace the client selector JSX (lines ~917-981) — the `<div className="relative" ref={clientDropdownRef}>` block — with:

```tsx
<SearchableSelect
  options={(clients || []).map((c) => ({
    value: c._id,
    label: c.name,
  }))}
  value={selectedClientId}
  onSelect={(val) => {
    setSelectedClientId(val);
    setSelectedProjectId('');
  }}
  placeholder="Search for a client..."
  disabled={isUploading}
  renderOption={(option) => {
    const client = clients?.find((c) => c._id === option.value);
    return (
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div>
          <div className="text-sm font-medium">{option.label}</div>
          {client?.companyName && (
            <div className="text-xs text-muted-foreground">{client.companyName}</div>
          )}
        </div>
      </div>
    );
  }}
/>
```

5. Similarly refactor the project selector to use `SearchableSelect` (with `renderOption` if needed for rich rendering).

6. Remove the outside-click `useEffect` hooks for client/project dropdowns (they're now internal to SearchableSelect).

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/BulkUpload.tsx
git commit -m "refactor: use SearchableSelect for client/project selectors in BulkUpload"
```

---

## Chunk 2: Convex Mutation + CreateCustomTypeModal

### Task 3: Add `createFromBulkReview` Mutation

**Files:**
- Modify: `convex/fileTypeDefinitions.ts`

Add a lightweight mutation for creating custom types from the bulk review flow. Unlike the existing `create` mutation which requires 100+ word descriptions, this accepts a brief description (10+ words).

- [ ] **Step 1: Add the mutation**

Append to `convex/fileTypeDefinitions.ts`:

```typescript
/**
 * Create a lightweight custom file type from the bulk review flow.
 * Relaxed validation: 10-word minimum description (vs 100 for full create).
 */
export const createFromBulkReview = mutation({
  args: {
    fileType: v.string(),
    category: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Validate description is at least 10 words
    const wordCount = args.description.trim().split(/\s+/).length;
    if (wordCount < 10) {
      throw new Error(`Description must be at least 10 words so the AI can recognize this type. Current: ${wordCount} words.`);
    }

    // Check uniqueness against existing fileTypeDefinitions (including inactive).
    // Note: We cannot validate against the FILE_TYPES const array here (it's a Next.js
    // module, not importable in Convex). Client-side validation in the modal covers that.
    const existing = await ctx.db
      .query("fileTypeDefinitions")
      .collect();
    const duplicate = existing.find(
      (d) => d.fileType.toLowerCase() === args.fileType.trim().toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A document type named "${duplicate.fileType}" already exists.`);
    }

    const now = new Date().toISOString();

    const id = await ctx.db.insert("fileTypeDefinitions", {
      fileType: args.fileType.trim(),
      category: args.category,
      description: args.description.trim(),
      keywords: [],
      identificationRules: [],
      isSystemDefault: false,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});
```

- [ ] **Step 2: Run codegen to verify**

Run: `npx convex codegen`
Expected: Success, no errors

- [ ] **Step 3: Commit**

```bash
git add convex/fileTypeDefinitions.ts
git commit -m "feat: add createFromBulkReview mutation for lightweight custom types"
```

### Task 4: Create `CreateCustomTypeModal` Component

**Files:**
- Create: `src/components/CreateCustomTypeModal.tsx`

A modal that captures name, category, and description when a user creates a new document type from the bulk review dropdown.

- [ ] **Step 1: Create the modal component**

Create `src/components/CreateCustomTypeModal.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FILE_CATEGORIES, FILE_TYPES } from '@/lib/categories';
import { toast } from 'sonner';

interface CreateCustomTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onCreated: (fileType: string) => void;
  existingCustomTypes?: string[];
}

const categoryOptions = FILE_CATEGORIES.map((cat) => ({
  value: cat,
  label: cat,
}));

export function CreateCustomTypeModal({
  open,
  onOpenChange,
  initialName,
  onCreated,
  existingCustomTypes = [],
}: CreateCustomTypeModalProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [saving, setSaving] = useState(false);

  const createCustomType = useMutation(api.fileTypeDefinitions.createFromBulkReview);

  // Reset form when modal opens with new name
  React.useEffect(() => {
    if (open) {
      setName(initialName);
      setCategory('');
      setDescription('');
      setNameError('');
      setDescriptionError('');
      setSaving(false);
    }
  }, [open, initialName]);

  const validateName = (val: string): boolean => {
    const trimmed = val.trim();
    if (!trimmed) {
      setNameError('Name is required');
      return false;
    }
    // Check against built-in FILE_TYPES
    const isBuiltIn = FILE_TYPES.some(
      (t) => t.toLowerCase() === trimmed.toLowerCase()
    );
    if (isBuiltIn) {
      setNameError(`"${trimmed}" already exists as a built-in type`);
      return false;
    }
    // Check against existing custom types
    const isCustomDuplicate = existingCustomTypes.some(
      (t) => t.toLowerCase() === trimmed.toLowerCase()
    );
    if (isCustomDuplicate) {
      setNameError(`"${trimmed}" already exists as a custom type`);
      return false;
    }
    setNameError('');
    return true;
  };

  const validateDescription = (val: string): boolean => {
    const wordCount = val.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 10) {
      setDescriptionError(`At least 10 words needed so the AI can recognize this type (currently ${wordCount})`);
      return false;
    }
    setDescriptionError('');
    return true;
  };

  const handleSave = async () => {
    const nameValid = validateName(name);
    const descValid = validateDescription(description);
    if (!nameValid || !descValid || !category) return;

    setSaving(true);
    try {
      await createCustomType({
        fileType: name.trim(),
        category,
        description: description.trim(),
      });
      onCreated(name.trim());
      onOpenChange(false);
    } catch (error: any) {
      // Server-side validation errors (e.g. duplicate name race condition)
      if (error.message?.includes('already exists')) {
        setNameError(error.message);
      } else {
        toast.error('Failed to create custom type. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Custom Document Type</DialogTitle>
          <DialogDescription>
            Add a new document type so it can be used for classification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="custom-type-name">Name</Label>
            <Input
              id="custom-type-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) validateName(e.target.value);
              }}
              placeholder="e.g. Development Appraisal"
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <SearchableSelect
              options={categoryOptions}
              value={category}
              onSelect={setCategory}
              placeholder="Select a category..."
            />
            {!category && saving && (
              <p className="text-xs text-destructive">Category is required</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-type-description">Description</Label>
            <Textarea
              id="custom-type-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (descriptionError) validateDescription(e.target.value);
              }}
              placeholder="Briefly describe this document type so the AI can recognize it in future uploads..."
              rows={3}
            />
            {descriptionError && (
              <p className="text-xs text-destructive">{descriptionError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !category}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/CreateCustomTypeModal.tsx
git commit -m "feat: add CreateCustomTypeModal for inline custom type creation"
```

---

## Chunk 3: BulkReviewTable Integration

### Task 5: Replace Dropdowns in BulkReviewTable

**Files:**
- Modify: `src/components/BulkReviewTable.tsx`

Replace the three Radix `Select` dropdowns (type, category, folder) with `SearchableSelect`. Wire up custom type creation for the type column.

- [ ] **Step 1: Add imports and load custom types**

At the top of `src/components/BulkReviewTable.tsx`:

1. Add imports:
```tsx
import { SearchableSelect, SearchableSelectOption } from '@/components/ui/searchable-select';
import { CreateCustomTypeModal } from '@/components/CreateCustomTypeModal';
```

2. Inside the component function, add state for the modal:
```tsx
const [createTypeModalOpen, setCreateTypeModalOpen] = useState(false);
const [createTypeInitialName, setCreateTypeInitialName] = useState('');
const [createTypeForItemId, setCreateTypeForItemId] = useState<Id<"bulkUploadItems"> | null>(null);
```

3. Query custom types from Convex:
```tsx
const customTypes = useQuery(api.fileTypeDefinitions.getAll);
```

4. Build the combined type options (memoized):
```tsx
const typeOptions: SearchableSelectOption[] = useMemo(() => {
  const standard = FILE_TYPES.map((t) => ({ value: t, label: t, group: 'Standard' }));
  const custom = (customTypes || [])
    .filter((ct) => !ct.isSystemDefault)
    .map((ct) => ({ value: ct.fileType, label: ct.fileType, group: 'Custom Types' }));
  return [...standard, ...custom];
}, [customTypes]);

const categoryOptions: SearchableSelectOption[] = useMemo(
  () => CATEGORIES.map((c) => ({ value: c, label: c })),
  []
);
```

- [ ] **Step 2: Replace the Type column dropdown**

Replace the Select block in the Type `<TableCell>` (lines ~916-930) with:

```tsx
<SearchableSelect
  options={typeOptions}
  value={item.fileTypeDetected || ''}
  onSelect={(value) => handleUpdateField(item._id, 'fileTypeDetected', value)}
  placeholder="Type..."
  compact
  allowCreate
  groupSeparator
  onCreateNew={(query) => {
    setCreateTypeInitialName(query);
    setCreateTypeForItemId(item._id);
    setCreateTypeModalOpen(true);
  }}
/>
```

Keep the existing Sparkles icon + Tooltip wrapper around it.

- [ ] **Step 3: Replace the Category column dropdown**

Replace the Select block in the Category `<TableCell>` (lines ~947-961) with:

```tsx
<SearchableSelect
  options={categoryOptions}
  value={item.category || ''}
  onSelect={(value) => handleUpdateField(item._id, 'category', value)}
  placeholder="..."
  compact
/>
```

- [ ] **Step 4: Replace the Folder column dropdown**

Replace the Select block in the Folder `<TableCell>` (lines ~978-1009). Convert `folderOptions` to `SearchableSelectOption[]` format:

```tsx
const folderSelectOptions: SearchableSelectOption[] = useMemo(
  () => folderOptions.map((f) => ({
    value: f.value,
    label: f.label,
    group: f.isCustom ? 'Custom Folders' : 'Standard',
  })),
  [folderOptions]
);
```

Then replace the Select with:

```tsx
<SearchableSelect
  options={folderSelectOptions}
  value={item.targetFolder || ''}
  onSelect={(value) => handleUpdateField(item._id, 'targetFolder', value)}
  placeholder="..."
  compact
  groupSeparator
/>
```

- [ ] **Step 5: Add the CreateCustomTypeModal at the bottom of the component**

Before the closing `</div>` or `</TooltipProvider>`, add:

```tsx
<CreateCustomTypeModal
  open={createTypeModalOpen}
  onOpenChange={setCreateTypeModalOpen}
  initialName={createTypeInitialName}
  existingCustomTypes={(customTypes || []).filter(ct => !ct.isSystemDefault).map(ct => ct.fileType)}
  onCreated={(fileType) => {
    if (createTypeForItemId) {
      handleUpdateField(createTypeForItemId, 'fileTypeDetected', fileType);
    }
    setCreateTypeForItemId(null);
  }}
/>
```

- [ ] **Step 6: Clean up unused imports**

Remove the `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` imports from the top of BulkReviewTable.tsx if they are no longer used anywhere in the file. (Check if any other Select usage remains first — e.g. version column, other UI.)

- [ ] **Step 7: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/components/BulkReviewTable.tsx
git commit -m "feat: replace Select dropdowns with SearchableSelect in bulk review table"
```

---

## Chunk 4: V4 AI Classification Integration

### Task 6: Wire Up ConvexHttpClient in V4 Route

**Files:**
- Modify: `src/app/api/v4-analyze/route.ts`

The V4 classification pipeline already has `loadConvexReferences()` which loads from `fileTypeDefinitions`, but the route never passes a `ConvexHttpClient`. Wire it up so the AI can classify against custom types.

- [ ] **Step 1: Add ConvexHttpClient to the V4 route**

In `src/app/api/v4-analyze/route.ts`, around lines 143-151 where the config is built:

1. Add import at top:
```typescript
import { ConvexHttpClient } from 'convex/browser';
```

2. Create the client and pass it in the config:
```typescript
// ── Build pipeline config ──
const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
const useMock = !anthropicApiKey;

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexClient = convexUrl ? new ConvexHttpClient(convexUrl) : undefined;

const config: V4PipelineConfig = {
  ...DEFAULT_V4_CONFIG,
  anthropicApiKey,
  useMock,
  convexClient,
};
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v4-analyze/route.ts
git commit -m "feat: wire ConvexHttpClient into V4 route for custom type classification"
```

---

## Chunk 5: Build Verification + Final Commit

### Task 7: Full Build Verification

- [ ] **Step 1: Run full build**

Run: `npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Fix any build errors**

If errors occur, fix them and re-run the build.

- [ ] **Step 3: Final commit and push**

```bash
git add -A
git commit -m "fix: resolve any build issues from searchable dropdown implementation"
git push
```

(Only commit if there were fixes needed. If build passed clean, just push.)

```bash
git push
```
