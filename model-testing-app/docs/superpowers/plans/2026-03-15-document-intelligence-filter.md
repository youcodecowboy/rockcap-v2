# Document Intelligence Filter — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "filter by document" feature to the Intelligence tab so users can see all intelligence extracted from a single document, with active vs superseded distinction.

**Architecture:** Client-side filtering of existing `knowledgeItems` and `supersededItemsRaw` by `sourceDocumentId`. Two entry points (inline card button + top-level dropdown). One new filtered view component. No new Convex mutations — uses the already-loaded `documents` query to resolve folder/category grouping for the dropdown.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, Convex (queries only), Vitest

---

## File Structure

| File | Responsibility | Status |
|------|---------------|--------|
| `src/components/intelligence/intelligenceUtils.ts` | Add `sourceDocumentId` to `EvidenceEntry`, add `deriveContributingDocuments()` helper | Modify |
| `src/components/intelligence/DocumentFilterDropdown.tsx` | Folder-grouped document picker dropdown with optional search | Create |
| `src/components/intelligence/DocumentFilteredView.tsx` | Filtered view: banner + category-grouped cards with active/superseded styling | Create |
| `src/components/intelligence/IntelligenceCard.tsx` | Add inline filter button next to source document name | Modify |
| `src/components/intelligence/IntelligenceCardList.tsx` | Thread `onDocumentFilter` callback to cards | Modify |
| `src/components/IntelligenceTab.tsx` | Add `documentFilter` state, filtering logic, contributing docs memo, folder resolution, render filtered view, export `KnowledgeItemUI`, thread callbacks | Modify |
| `src/__tests__/intelligenceUtils.test.ts` | Tests for `deriveContributingDocuments` helper | Modify |

---

## Chunk 1: Data Plumbing & Utilities

### Task 1: Add `sourceDocumentId` to types and evidence trail construction

**Files:**
- Modify: `src/components/intelligence/intelligenceUtils.ts:115-120`
- Modify: `src/components/IntelligenceTab.tsx:418-425` (HistoryItem)
- Modify: `src/components/IntelligenceTab.tsx:1366-1380` (client evidence trail construction)
- Modify: `src/components/IntelligenceTab.tsx:1775-1791` (project evidence trail construction — in `ProjectIntelligenceTab`)

- [ ] **Step 1: Add `sourceDocumentId` to `EvidenceEntry` type**

In `src/components/intelligence/intelligenceUtils.ts`, update the `EvidenceEntry` interface:

```typescript
export interface EvidenceEntry {
  fieldPath: string;
  value: unknown;
  confidence: number;
  sourceDocumentName?: string;
  sourceDocumentId?: string;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Add `sourceDocumentId` to `HistoryItem` interface**

In `src/components/IntelligenceTab.tsx`, update the `HistoryItem` interface (~line 418):

```typescript
interface HistoryItem {
  _id: Id<"knowledgeItems">;
  value: unknown;
  valueType: string;
  sourceDocumentName?: string;
  sourceDocumentId?: string;
  addedAt: string;
  status: string;
}
```

- [ ] **Step 3: Thread `sourceDocumentId` through history construction (client scope)**

In `src/components/IntelligenceTab.tsx`, in the `historyByFieldPath` memo (~line 1218), add `sourceDocumentId` when pushing items:

For active items block (~line 1226):
```typescript
historyMap[item.fieldPath].push({
  _id: item._id,
  value: item.value,
  valueType: item.valueType,
  sourceDocumentName: item.sourceDocumentName,
  sourceDocumentId: item.sourceDocumentId ? String(item.sourceDocumentId) : undefined,
  addedAt: item.addedAt,
  status: item.status,
});
```

For superseded items block (~line 1242):
```typescript
historyMap[item.fieldPath].push({
  _id: item._id,
  value: item.value,
  valueType: item.valueType,
  sourceDocumentName: item.sourceDocumentName,
  sourceDocumentId: item.sourceDocumentId ? String(item.sourceDocumentId) : undefined,
  addedAt: item.addedAt,
  status: item.status,
});
```

- [ ] **Step 4: Thread `sourceDocumentId` into evidence trail entries (client scope)**

In the evidence trail construction memo (~line 1367), add `sourceDocumentId`:

```typescript
trail.push({
  fieldPath,
  value: item.value,
  confidence: 0.9,
  sourceDocumentName: item.sourceDocumentName,
  sourceDocumentId: item.sourceDocumentId,
});
```

- [ ] **Step 5: Repeat Steps 3-4 for `ProjectIntelligenceTab`**

The `ProjectIntelligenceTab` component (~line 1506) has its own `historyByFieldPath` and evidence trail memos. Apply the same `sourceDocumentId` threading there. The patterns are identical — find the corresponding history construction and evidence trail push blocks.

- [ ] **Step 6: Export `KnowledgeItemUI` type**

In `src/components/IntelligenceTab.tsx`, change `interface KnowledgeItemUI` (~line 96) to `export interface KnowledgeItemUI`.

- [ ] **Step 7: Verify build passes**

Run: `npx next build`
Expected: Build passes with no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/intelligence/intelligenceUtils.ts src/components/IntelligenceTab.tsx
git commit -m "feat: thread sourceDocumentId through evidence trail and history types"
```

---

### Task 2: Add `deriveContributingDocuments` utility and tests

**Files:**
- Modify: `src/components/intelligence/intelligenceUtils.ts`
- Modify: `src/__tests__/intelligenceUtils.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/intelligenceUtils.test.ts`:

```typescript
import {
  // ... existing imports ...
  deriveContributingDocuments,
} from '@/components/intelligence/intelligenceUtils';

describe('deriveContributingDocuments', () => {
  it('returns empty array when no items have sourceDocumentId', () => {
    const items = [
      { fieldPath: 'contact.email', value: 'a@b.com', sourceDocumentName: 'doc.pdf' },
    ];
    expect(deriveContributingDocuments(items as any, [])).toEqual([]);
  });

  it('aggregates field counts per document', () => {
    const items = [
      { sourceDocumentId: 'doc1', sourceDocumentName: 'Valuation.pdf', fieldPath: 'a' },
      { sourceDocumentId: 'doc1', sourceDocumentName: 'Valuation.pdf', fieldPath: 'b' },
      { sourceDocumentId: 'doc2', sourceDocumentName: 'Lender Note.docx', fieldPath: 'c' },
    ];
    const result = deriveContributingDocuments(items as any, []);
    expect(result).toHaveLength(2);
    expect(result.find(d => d.id === 'doc1')?.fieldCount).toBe(2);
    expect(result.find(d => d.id === 'doc2')?.fieldCount).toBe(1);
  });

  it('combines active and superseded items', () => {
    const active = [
      { sourceDocumentId: 'doc1', sourceDocumentName: 'A.pdf', fieldPath: 'x' },
    ];
    const superseded = [
      { sourceDocumentId: 'doc1', sourceDocumentName: 'A.pdf', fieldPath: 'y' },
      { sourceDocumentId: 'doc2', sourceDocumentName: 'B.pdf', fieldPath: 'z' },
    ];
    const result = deriveContributingDocuments(active as any, superseded as any);
    expect(result).toHaveLength(2);
    expect(result.find(d => d.id === 'doc1')?.fieldCount).toBe(2);
    expect(result.find(d => d.id === 'doc2')?.fieldCount).toBe(1);
  });

  it('uses "Unknown" for missing document names', () => {
    const items = [{ sourceDocumentId: 'doc1', fieldPath: 'a' }];
    const result = deriveContributingDocuments(items as any, []);
    expect(result[0].name).toBe('Unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/intelligenceUtils.test.ts`
Expected: FAIL — `deriveContributingDocuments` is not exported.

- [ ] **Step 3: Implement `deriveContributingDocuments`**

Add to `src/components/intelligence/intelligenceUtils.ts`:

```typescript
export interface ContributingDocument {
  id: string;
  name: string;
  fieldCount: number;
}

export function deriveContributingDocuments(
  activeItems: Array<{ sourceDocumentId?: unknown; sourceDocumentName?: string; fieldPath: string }>,
  supersededItems: Array<{ sourceDocumentId?: unknown; sourceDocumentName?: string; fieldPath: string }>,
): ContributingDocument[] {
  const docMap = new Map<string, ContributingDocument>();
  const allItems = [...activeItems, ...supersededItems];

  for (const item of allItems) {
    if (!item.sourceDocumentId) continue;
    const docId = String(item.sourceDocumentId);
    const existing = docMap.get(docId);
    if (existing) {
      existing.fieldCount++;
    } else {
      docMap.set(docId, {
        id: docId,
        name: item.sourceDocumentName || 'Unknown',
        fieldCount: 1,
      });
    }
  }

  return Array.from(docMap.values());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/intelligenceUtils.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/intelligence/intelligenceUtils.ts src/__tests__/intelligenceUtils.test.ts
git commit -m "feat: add deriveContributingDocuments utility with tests"
```

---

## Chunk 2: New UI Components

### Task 3: Create `DocumentFilterDropdown` component

**Files:**
- Create: `src/components/intelligence/DocumentFilterDropdown.tsx`

- [ ] **Step 1: Create the dropdown component**

Create `src/components/intelligence/DocumentFilterDropdown.tsx`:

```typescript
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { FileText, FolderOpen, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ContributingDocument } from './intelligenceUtils';

interface DocumentWithFolder extends ContributingDocument {
  folderName?: string;
}

interface DocumentFilterDropdownProps {
  documents: DocumentWithFolder[];
  onSelect: (doc: { documentId: string; documentName: string }) => void;
}

export function DocumentFilterDropdown({ documents, onSelect }: DocumentFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Group documents by folder
  const groupedDocs = useMemo(() => {
    const filtered = searchQuery.trim()
      ? documents.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : documents;

    const groups = new Map<string, DocumentWithFolder[]>();
    for (const doc of filtered) {
      const folder = doc.folderName || 'Unfiled';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(doc);
    }

    // Sort: named folders first (alphabetical), "Unfiled" last
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Unfiled') return 1;
      if (b === 'Unfiled') return -1;
      return a.localeCompare(b);
    });

    return sorted;
  }, [documents, searchQuery]);

  if (documents.length === 0) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs text-gray-600 gap-1.5"
        onClick={() => setIsOpen(!isOpen)}
      >
        <FileText className="w-3 h-3" />
        By Document
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 max-h-[320px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Search input (show if >10 documents) */}
          {documents.length > 10 && (
            <div className="sticky top-0 bg-white border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                  autoFocus
                />
              </div>
            </div>
          )}

          {groupedDocs.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">No documents found</div>
          ) : (
            groupedDocs.map(([folderName, docs]) => (
              <div key={folderName}>
                {/* Folder header */}
                <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                  <FolderOpen className="w-3 h-3" />
                  {folderName}
                </div>
                {/* Document rows */}
                {docs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 border-b border-gray-50 last:border-b-0 transition-colors"
                    onClick={() => {
                      onSelect({ documentId: doc.id, documentName: doc.name });
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-xs">{doc.name}</span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">
                      {doc.fieldCount} {doc.fieldCount === 1 ? 'field' : 'fields'}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build`
Expected: Build passes (component not yet rendered anywhere, but types should resolve).

- [ ] **Step 3: Commit**

```bash
git add src/components/intelligence/DocumentFilterDropdown.tsx
git commit -m "feat: add DocumentFilterDropdown component with folder grouping"
```

---

### Task 4: Create `DocumentFilteredView` component

**Files:**
- Create: `src/components/intelligence/DocumentFilteredView.tsx`

- [ ] **Step 1: Create the filtered view component**

Create `src/components/intelligence/DocumentFilteredView.tsx`:

```typescript
'use client';

import { useMemo } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getCategoryForField,
  getCategoryLucideIcon,
  getConfidenceLabel,
} from './intelligenceUtils';

export interface DocumentFilterItem {
  fieldPath: string;
  label: string;
  value: string;
  confidence: number;
  category: string;
  status: 'active' | 'superseded';
  replacedBy?: { value: string; documentName: string };
}

interface DocumentFilteredViewProps {
  documentName: string;
  items: DocumentFilterItem[];
  onBack: () => void;
}

export function DocumentFilteredView({ documentName, items, onBack }: DocumentFilteredViewProps) {
  // Group items by category
  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, DocumentFilterItem[]>();
    for (const item of items) {
      const category = item.category || getCategoryForField(item.fieldPath);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(item);
    }

    // Sort: categories with active items first, then alphabetical. "Other" last.
    return Array.from(groups.entries()).sort(([a, aItems], [b, bItems]) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      const aActive = aItems.some(i => i.status === 'active');
      const bActive = bItems.some(i => i.status === 'active');
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return a.localeCompare(b);
    });
  }, [items]);

  const totalFields = items.length;
  const activeCount = items.filter(i => i.status === 'active').length;

  return (
    <div className="flex-1 overflow-auto">
      {/* Banner */}
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-blue-200">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 border-blue-300 bg-white hover:bg-blue-100"
          onClick={onBack}
          title="Back to all intelligence"
        >
          <ArrowLeft className="w-4 h-4 text-blue-700" />
        </Button>
        <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-sm font-medium text-blue-900 truncate flex-1 min-w-0">
          {documentName}
        </span>
        <span className="text-xs text-blue-600 flex-shrink-0 tabular-nums">
          {totalFields} {totalFields === 1 ? 'field' : 'fields'} extracted
          {activeCount < totalFields && ` (${activeCount} active)`}
        </span>
      </div>

      {/* Category sections */}
      <div className="p-4 space-y-6">
        {groupedByCategory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <FileText className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm">No intelligence extracted from this document</p>
          </div>
        ) : (
          groupedByCategory.map(([category, categoryItems], idx) => {
            const IconComponent = getCategoryLucideIcon(category);
            return (
              <div key={category}>
                {idx > 0 && <div className="border-t border-gray-100 -mx-4 mb-6" />}
                {/* Category header */}
                <div className="flex items-center gap-2 mb-3">
                  <IconComponent className="w-4 h-4 text-gray-600" />
                  <h3 className="text-sm font-semibold text-gray-900">{category}</h3>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {categoryItems.length} {categoryItems.length === 1 ? 'field' : 'fields'}
                  </span>
                </div>

                {/* Field cards */}
                <div className="space-y-2">
                  {categoryItems.map((item) => (
                    <div
                      key={item.fieldPath}
                      className={cn(
                        'rounded-lg border px-4 py-3 transition-colors',
                        item.status === 'active'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 border-gray-200 opacity-75'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            {item.label}
                          </span>
                          <p className={cn(
                            'mt-1 text-sm font-medium break-words',
                            item.status === 'active' ? 'text-gray-900' : 'text-gray-500'
                          )}>
                            {item.value}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0',
                              item.status === 'active'
                                ? 'bg-green-100 text-green-800 border-green-300'
                                : 'bg-gray-100 text-gray-600 border-gray-300'
                            )}
                          >
                            {item.status === 'active' ? 'Active' : 'Superseded'}
                          </Badge>
                          <span className={cn(
                            'text-xs tabular-nums',
                            item.status === 'active' ? 'text-green-700' : 'text-gray-400'
                          )}>
                            {getConfidenceLabel(item.confidence)}
                          </span>
                        </div>
                      </div>

                      {/* Superseded note: what replaced it */}
                      {item.status === 'superseded' && item.replacedBy && (
                        <p className="mt-2 text-xs text-gray-400">
                          Replaced by <span className="font-medium text-gray-500">{item.replacedBy.value}</span>
                          {item.replacedBy.documentName && (
                            <> from <span className="text-gray-500">{item.replacedBy.documentName}</span></>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build`
Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/intelligence/DocumentFilteredView.tsx
git commit -m "feat: add DocumentFilteredView component with active/superseded styling"
```

---

## Chunk 3: Wiring & Integration

### Task 5: Add inline filter button to `IntelligenceCard`

**Files:**
- Modify: `src/components/intelligence/IntelligenceCard.tsx`

- [ ] **Step 1: Add `onDocumentFilter` prop and import `Filter` icon**

In `src/components/intelligence/IntelligenceCard.tsx`:

Add `Filter` to the Lucide import:
```typescript
import {
  ChevronDown,
  ChevronUp,
  FileText,
  ExternalLink,
  Clock,
  AlertTriangle,
  History,
  Filter,
} from 'lucide-react';
```

Add to `IntelligenceCardProps` interface:
```typescript
onDocumentFilter?: (doc: { documentId: string; documentName: string }) => void;
```

Add to the destructured props:
```typescript
export function IntelligenceCard({
  // ... existing props ...
  onDocumentFilter,
}: IntelligenceCardProps) {
```

- [ ] **Step 2: Add the filter button in the source document footer**

In the source document footer section (~line 192-227), after the `ExternalLink` icon and before the separator `|`, add the filter button. Update the `sourceDocumentId` branch to include:

```typescript
{sourceDocumentId ? (
  <>
    <span
      className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
      onClick={(e) => {
        e.stopPropagation();
        window.location.href = `/docs/${sourceDocumentId}/`;
      }}
      role="link"
      tabIndex={-1}
    >
      <FileText className="w-3 h-3" />
      <span className="truncate max-w-[180px]">
        {sourceDocumentName || 'Source document'}
      </span>
      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
    </span>
    {onDocumentFilter && (
      <button
        type="button"
        className="p-0.5 rounded hover:bg-gray-100 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onDocumentFilter({
            documentId: sourceDocumentId,
            documentName: sourceDocumentName || 'Source document',
          });
        }}
        title="View all intelligence from this document"
      >
        <Filter className="w-3 h-3 text-gray-400 hover:text-gray-600" />
      </button>
    )}
  </>
) : sourceDocumentName ? (
  // ... keep existing branch unchanged ...
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build`
Expected: Build passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/intelligence/IntelligenceCard.tsx
git commit -m "feat: add inline document filter button to IntelligenceCard"
```

---

### Task 6: Thread `onDocumentFilter` through `IntelligenceCardList`

**Files:**
- Modify: `src/components/intelligence/IntelligenceCardList.tsx`

- [ ] **Step 1: Add prop to interface and pass to cards**

Add to `IntelligenceCardListProps` interface:
```typescript
onDocumentFilter?: (doc: { documentId: string; documentName: string }) => void;
```

Add to destructured props:
```typescript
export function IntelligenceCardList({
  // ... existing props ...
  onDocumentFilter,
}: IntelligenceCardListProps) {
```

Pass to each `IntelligenceCard` in the render (~line 240-256), add the prop:
```typescript
<IntelligenceCard
  key={item.fieldKey}
  // ... existing props ...
  onDocumentFilter={onDocumentFilter}
/>
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build`
Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/intelligence/IntelligenceCardList.tsx
git commit -m "feat: thread onDocumentFilter callback through IntelligenceCardList"
```

---

### Task 7: Wire up `IntelligenceTab` with state, filtering, and rendering

This is the main integration task. All changes are in `src/components/IntelligenceTab.tsx`.

**Files:**
- Modify: `src/components/IntelligenceTab.tsx`

- [ ] **Step 1: Add imports**

Add to the imports at top of file:

```typescript
import { DocumentFilterDropdown } from './intelligence/DocumentFilterDropdown';
import { DocumentFilteredView, type DocumentFilterItem } from './intelligence/DocumentFilteredView';
import { deriveContributingDocuments } from './intelligence/intelligenceUtils';
```

Verify that `api` import from Convex is already present:
```typescript
import { api } from '../../convex/_generated/api';
```
(This should already be present — just verify.)

- [ ] **Step 2: Add `documentFilter` state (client-scope component)**

In the client-scope component's state section (~line 1101-1109), add:

```typescript
const [documentFilter, setDocumentFilter] = useState<{
  documentId: string;
  documentName: string;
} | null>(null);
```

- [ ] **Step 3: Add `contributingDocuments` memo**

After the `evidenceTrail` memo (~line 1380), add:

```typescript
// Derive list of documents that contributed intelligence
const contributingDocuments = useMemo(() => {
  return deriveContributingDocuments(knowledgeItems, supersededItemsRaw || []);
}, [knowledgeItems, supersededItemsRaw]);
```

- [ ] **Step 4: Add folder resolution for document dropdown**

After `contributingDocuments`, add folder resolution using the already-loaded `documents` query:

```typescript
// Enrich contributing documents with folder names from loaded documents
const contributingDocsWithFolders = useMemo(() => {
  if (!documents) return contributingDocuments.map(d => ({ ...d, folderName: undefined }));

  // Build a map of document ID -> folder info from the loaded documents
  const docFolderMap = new Map<string, string>();

  // Use document category as the grouping label in the dropdown
  for (const doc of documents) {
    docFolderMap.set(String(doc._id), doc.category || 'Unfiled');
  }

  return contributingDocuments.map(d => ({
    ...d,
    folderName: docFolderMap.get(d.id) || 'Unfiled',
  }));
}, [contributingDocuments, documents]);
```

- [ ] **Step 5: Add filtered items computation for document view**

After `contributingDocsWithFolders`, add:

```typescript
// Compute filtered items when document filter is active
const documentFilteredItems: DocumentFilterItem[] = useMemo(() => {
  if (!documentFilter) return [];

  const items: DocumentFilterItem[] = [];
  const activeFieldDefs = isClientScope
    ? getAllClientFields(clientType === 'lender')
    : getAllProjectFields();

  // Track seen fieldPaths to deduplicate (show most recent per field)
  const seenFieldPaths = new Set<string>();

  // Active items from this document
  for (const item of knowledgeItems) {
    if (!item.sourceDocumentId || String(item.sourceDocumentId) !== documentFilter.documentId) continue;
    if (seenFieldPaths.has(item.fieldPath)) continue;
    seenFieldPaths.add(item.fieldPath);
    const fieldDef = activeFieldDefs.find(f => f.key === item.fieldPath);
    items.push({
      fieldPath: item.fieldPath,
      label: item.label || fieldDef?.label || item.fieldPath,
      value: formatDisplayValue(item.value, item.valueType) as string,
      confidence: item.normalizationConfidence ?? 0.9,
      category: getCategoryForField(item.fieldPath),
      status: 'active',
    });
  }

  // Superseded items from this document
  if (supersededItemsRaw) {
    for (const item of supersededItemsRaw) {
      if (!item.sourceDocumentId || String(item.sourceDocumentId) !== documentFilter.documentId) continue;
      if (seenFieldPaths.has(item.fieldPath)) continue;
      seenFieldPaths.add(item.fieldPath);

      // Find what replaced it (active item for same fieldPath)
      const activeItem = knowledgeItems.find(k => k.fieldPath === item.fieldPath);
      const fieldDef = activeFieldDefs.find(f => f.key === item.fieldPath);

      items.push({
        fieldPath: item.fieldPath,
        label: item.label || fieldDef?.label || item.fieldPath,
        value: formatDisplayValue(item.value, item.valueType) as string,
        confidence: item.normalizationConfidence ?? 0.9,
        category: getCategoryForField(item.fieldPath),
        status: 'superseded',
        replacedBy: activeItem
          ? {
              value: formatDisplayValue(activeItem.value, activeItem.valueType) as string,
              documentName: activeItem.sourceDocumentName || '',
            }
          : undefined,
      });
    }
  }

  return items;
}, [documentFilter, knowledgeItems, supersededItemsRaw, isClientScope, clientType]);
```

- [ ] **Step 6: Update sidebar `onSelectCategory` to clear document filter**

In the `IntelligenceSidebar` render (~line 1435), update the `onSelectCategory` handler:

```typescript
onSelectCategory={(name) => {
  setViewMode('intelligence');
  setActiveSidebarCategory(name);
  setDocumentFilter(null);
}}
```

- [ ] **Step 7: Update main content rendering**

Replace the main content area (~lines 1462-1480) to add the document filter dropdown and conditional filtered view:

```typescript
) : documentFilter ? (
  <DocumentFilteredView
    documentName={documentFilter.documentName}
    items={documentFilteredItems}
    onBack={() => setDocumentFilter(null)}
  />
) : (
  <div className="flex-1 overflow-auto p-4">
    {/* Document filter dropdown — top-level control */}
    {contributingDocsWithFolders.length > 0 && (
      <div className="flex items-center justify-end mb-3">
        <DocumentFilterDropdown
          documents={contributingDocsWithFolders}
          onSelect={(doc) => setDocumentFilter(doc)}
        />
      </div>
    )}
    <IntelligenceCardList
      items={filteredItems}
      categoryName={activeSidebarCategory}
      categoryIcon=""
      filled={activeCategoryStats.filled}
      total={activeCategoryStats.total}
      clientId={String(clientId)}
      projectId={currentProjectId ? String(currentProjectId) : undefined}
      evidenceTrail={evidenceTrail}
      onDocumentFilter={(doc) => setDocumentFilter(doc)}
    />
    <IntelligenceMissingFields
      missingFields={missingForCategory}
      onAddField={handleAddField}
      className="mt-4"
    />
  </div>
)}
```

The full conditional structure should be:
1. `viewMode === 'documents'` → DocumentsSummaryView (existing)
2. `documentFilter` is set → DocumentFilteredView (new)
3. Default → normal intelligence card list (existing, with dropdown added above)

- [ ] **Step 8: Add `documentFilter` state to `ProjectIntelligenceTab`**

In `ProjectIntelligenceTab` (~line 1534), add alongside existing state:

```typescript
const [documentFilter, setDocumentFilter] = useState<{
  documentId: string;
  documentName: string;
} | null>(null);
```

- [ ] **Step 9: Add `contributingDocuments` and folder resolution memos to `ProjectIntelligenceTab`**

After the project-scope evidence trail memo, add:

```typescript
const contributingDocuments = useMemo(() => {
  return deriveContributingDocuments(knowledgeItems, supersededItemsRaw || []);
}, [knowledgeItems, supersededItemsRaw]);

const contributingDocsWithFolders = useMemo(() => {
  if (!projectDocuments) return contributingDocuments.map(d => ({ ...d, folderName: undefined }));
  const docFolderMap = new Map<string, string>();
  for (const doc of projectDocuments as DocumentWithAnalysis[]) {
    docFolderMap.set(String(doc._id), doc.category || 'Unfiled');
  }
  return contributingDocuments.map(d => ({
    ...d,
    folderName: docFolderMap.get(d.id) || 'Unfiled',
  }));
}, [contributingDocuments, projectDocuments]);
```

Note: uses `projectDocuments` (not `documents`), and no `isClientScope` check needed — this is always project scope.

- [ ] **Step 10: Add `documentFilteredItems` memo to `ProjectIntelligenceTab`**

```typescript
const documentFilteredItems: DocumentFilterItem[] = useMemo(() => {
  if (!documentFilter) return [];
  const items: DocumentFilterItem[] = [];
  const allFieldDefs = getAllProjectFields();
  const seenFieldPaths = new Set<string>();

  for (const item of knowledgeItems) {
    if (!item.sourceDocumentId || String(item.sourceDocumentId) !== documentFilter.documentId) continue;
    if (seenFieldPaths.has(item.fieldPath)) continue;
    seenFieldPaths.add(item.fieldPath);
    const fieldDef = allFieldDefs.find(f => f.key === item.fieldPath);
    items.push({
      fieldPath: item.fieldPath,
      label: item.label || fieldDef?.label || item.fieldPath,
      value: formatDisplayValue(item.value, item.valueType) as string,
      confidence: item.normalizationConfidence ?? 0.9,
      category: getCategoryForField(item.fieldPath),
      status: 'active',
    });
  }

  if (supersededItemsRaw) {
    for (const item of supersededItemsRaw) {
      if (!item.sourceDocumentId || String(item.sourceDocumentId) !== documentFilter.documentId) continue;
      if (seenFieldPaths.has(item.fieldPath)) continue;
      seenFieldPaths.add(item.fieldPath);
      const activeItem = knowledgeItems.find(k => k.fieldPath === item.fieldPath);
      const fieldDef = allFieldDefs.find(f => f.key === item.fieldPath);
      items.push({
        fieldPath: item.fieldPath,
        label: item.label || fieldDef?.label || item.fieldPath,
        value: formatDisplayValue(item.value, item.valueType) as string,
        confidence: item.normalizationConfidence ?? 0.9,
        category: getCategoryForField(item.fieldPath),
        status: 'superseded',
        replacedBy: activeItem
          ? { value: formatDisplayValue(activeItem.value, activeItem.valueType) as string, documentName: activeItem.sourceDocumentName || '' }
          : undefined,
      });
    }
  }

  return items;
}, [documentFilter, knowledgeItems, supersededItemsRaw]);
```

Note: uses `getAllProjectFields()` directly (no `isClientScope` / `clientType` branching).

- [ ] **Step 11: Update `ProjectIntelligenceTab` sidebar `onSelectCategory` to clear filter**

Update the sidebar's `onSelectCategory` handler to also clear `documentFilter`:

```typescript
onSelectCategory={(name) => {
  setViewMode('intelligence');
  setActiveSidebarCategory(name);
  setDocumentFilter(null);
}}
```

- [ ] **Step 12: Update `ProjectIntelligenceTab` main content rendering**

Apply the same 3-way conditional pattern:

```typescript
) : documentFilter ? (
  <DocumentFilteredView
    documentName={documentFilter.documentName}
    items={documentFilteredItems}
    onBack={() => setDocumentFilter(null)}
  />
) : (
  <div className="flex-1 overflow-auto p-4">
    {contributingDocsWithFolders.length > 0 && (
      <div className="flex items-center justify-end mb-3">
        <DocumentFilterDropdown
          documents={contributingDocsWithFolders}
          onSelect={(doc) => setDocumentFilter(doc)}
        />
      </div>
    )}
    <IntelligenceCardList
      items={filteredItems}
      categoryName={activeSidebarCategory}
      categoryIcon=""
      filled={activeCategoryStats.filled}
      total={activeCategoryStats.total}
      clientId={String(projectId)}
      evidenceTrail={evidenceTrail}
      onDocumentFilter={(doc) => setDocumentFilter(doc)}
    />
    <IntelligenceMissingFields
      missingFields={missingForCategory}
      onAddField={handleAddField}
      className="mt-4"
    />
  </div>
)}
```

- [ ] **Step 13: Verify build passes**

Run: `npx next build`
Expected: Build passes with no errors.

- [ ] **Step 14: Commit**

```bash
git add src/components/IntelligenceTab.tsx
git commit -m "feat: wire up document intelligence filter with state, filtering, and rendering"
```

---

### Task 8: Final verification and push

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `npx next build`
Expected: Build passes.

- [ ] **Step 3: Manual smoke test**

Open the app, navigate to a client's Intelligence tab:
1. Verify the "By Document" dropdown appears in the header area
2. Click it — documents should be grouped by category/folder with field counts
3. Select a document — filtered view should show with blue banner, back arrow, category-grouped fields
4. Active fields should have green styling with "Active" badge
5. Superseded fields should have grey styling with "Superseded" badge and replacement note
6. Click back arrow — returns to normal view
7. On any intelligence card, verify the small filter icon appears next to the source document name
8. Click the filter icon — should enter the same filtered view for that document
9. Click a sidebar category while in filtered view — should clear filter and return to normal

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```
