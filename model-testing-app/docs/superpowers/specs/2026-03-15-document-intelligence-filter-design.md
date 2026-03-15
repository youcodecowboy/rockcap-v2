# Document Intelligence Filter — Design Spec

## Summary

Add a "filter by document" feature to the Intelligence tab, allowing users to see all intelligence extracted from a single document in one view. Two entry points: an inline filter button on each intelligence card, and a top-level document dropdown. The filtered view shows all fields from the selected document grouped by category, with visual distinction between active values and superseded ones.

## Motivation

Users currently see intelligence organized by category (Contact Info, Financial, etc.) with each field showing its source document. But there's no way to answer "what did this specific document contribute?" — you'd have to scan every category looking for cards referencing that document. This feature inverts the view: pick a document, see everything it contributed.

## Approach

**Client-side filtering only (Approach A).** All intelligence data (knowledge items + evidence trail) is already loaded in the React state. We filter it by `sourceDocumentId` — no new Convex queries needed except one lightweight query to resolve folder names for the document dropdown.

## Data Flow

### State

New state in `IntelligenceTab`:

```typescript
const [documentFilter, setDocumentFilter] = useState<{
  documentId: string;
  documentName: string;
} | null>(null);
```

When `documentFilter` is set, the main content area switches from the normal category view to the document-filtered view. Setting it to `null` returns to normal.

### Prerequisite: Thread `sourceDocumentId` Through Evidence Trail

The current `EvidenceEntry` type in `intelligenceUtils.ts` only has `fieldPath`, `value`, `confidence`, and `sourceDocumentName`. The `HistoryItem` interface in `IntelligenceTab.tsx` also lacks `sourceDocumentId`. The evidence trail construction in `IntelligenceTab.tsx` (both client and project paths) only pushes `fieldPath`, `value`, `confidence`, and `sourceDocumentName`.

**Required changes:**

1. Add `sourceDocumentId?: string` to the `EvidenceEntry` type in `intelligenceUtils.ts`
2. Add `sourceDocumentId?: string` to the `HistoryItem` interface in `IntelligenceTab.tsx`
3. Thread `sourceDocumentId` through when building evidence trail entries from `knowledgeItems` and `supersededItemsRaw` (both have `sourceDocumentId` as `Id<"documents">`)
4. Pass `String(item.sourceDocumentId)` into evidence trail construction

### Filtering Logic

When `documentFilter` is active:

1. Scan `knowledgeItems` (active items) for items where `String(sourceDocumentId) === documentFilter.documentId` — these are the **active values** from this document
2. Scan `supersededItemsRaw` for items where `String(sourceDocumentId) === documentFilter.documentId` — these are **superseded values** from this document
3. For each item, tag it as **active** or **superseded** based on its `status` field
4. For superseded items, look up the current active value for that `fieldPath` from `knowledgeItems` to show "replaced by X from Document Y"
5. Group results by category using existing `getCategoryForField()` utility
6. Only show categories that have at least one field from the selected document

**Filtering happens in `IntelligenceTab`** (the data orchestrator), not inside child components. Only filtered, pre-computed results are passed to `DocumentFilteredView`.

### Document List Derivation

The list of documents available for filtering is derived from **`knowledgeItems` + `supersededItemsRaw`** (both reliably have `sourceDocumentId`):

```typescript
const contributingDocuments = useMemo(() => {
  const docMap = new Map<string, { id: string; name: string; fieldCount: number }>();
  const allItems = [...knowledgeItems, ...(supersededItemsRaw || [])];
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
}, [knowledgeItems, supersededItemsRaw]);
```

### Folder Resolution

One additional Convex query to group documents by folder in the dropdown:

- When `isClientScope`: query `clientFolders` by `clientId` to get all folders for this client
- When project scope: query `projectFolders` by `projectId` to get all folders for this project
- For each contributing document, look up its `folderId` against the fetched folders to get the folder `name`
- Documents have `folderId: v.optional(v.string())` and `folderType: "client" | "project"` — use `folderType` to determine which table to look up
- Documents without a `folderId` go under an "Unfiled" group

**Note:** We need the document records to get `folderId`. The `knowledgeItems` don't carry `folderId`. Two options:
- Use the existing `documents` query already loaded in `IntelligenceTab` (for the Documents Summary view) — join contributing document IDs against it
- If the documents query isn't available in client scope, add a lightweight batch query

The existing `documents` query (line ~1519 in `IntelligenceTab.tsx`) is already loaded for the Documents Summary view, so we can join against it without an additional query.

## UI Components

### Entry Point 1: Inline Filter Button (IntelligenceCard)

**Location:** Next to the source document name in the card footer, between the document link and the timestamp.

**Component:** A small ghost button with a Lucide `Filter` icon.

**Behavior:** `onClick` calls `onDocumentFilter({ documentId, documentName })` — a new callback prop threaded from `IntelligenceTab` through `IntelligenceCardList` to `IntelligenceCard`.

**Visibility:** Only shown when the card has a `sourceDocumentId`.

### Entry Point 2: Document Dropdown (top-level in IntelligenceTab)

**Location:** In the main content area header, above the category card list. This is a **top-level control** in `IntelligenceTab`, not per-category, since document filtering is a cross-category feature that replaces the entire main content area.

**Component:** A button labeled "By Document" with a `FileText` icon and chevron. Opens a dropdown/popover.

**Dropdown structure:**
- Documents grouped by folder name (folder icon + folder name as group header)
- Each document row shows: document icon, truncated document name, field count badge
- "Unfiled" group at the bottom for documents without folders
- Optional search/filter input at top if the list is long (>10 documents)

**Behavior:** Selecting a document sets `documentFilter`. The dropdown closes.

### Filtered View: Document Intelligence View

**Replaces** the normal `IntelligenceCardList` + `IntelligenceMissingFields` content when `documentFilter` is active.

**Structure:**

1. **Banner** (top of main content area):
   - Back arrow button (`ArrowLeft` icon) — clears `documentFilter`
   - Document icon (`FileText`) + document name
   - Field count on the right ("12 fields extracted")
   - Light blue background (`bg-blue-50`, `border-blue-200`)

2. **Category sections** (below banner):
   - Each category that has fields from this document gets a section
   - Category header: Lucide icon + category name + field count
   - Categories separated by subtle divider

3. **Field cards** within each category:
   - **Active values**: Green left border or green background tint (`bg-green-50`, `border-green-200`), "Active" badge in green
   - **Superseded values**: Grey/muted styling (`bg-gray-50`, `border-gray-200`, reduced opacity), "Superseded" badge in grey, with a note showing the current value and which document replaced it
   - Each card shows: field label, value, confidence percentage, active/superseded badge

### Sidebar Behavior

When document filter is active:
- The sidebar remains visible and functional
- The active category highlight is removed (since we're showing cross-category data)
- Clicking a sidebar category clears the document filter and returns to normal view — the `onSelectCategory` handler in `IntelligenceTab` must call both `setActiveSidebarCategory(name)` and `setDocumentFilter(null)`

## Files to Modify

| File | Change |
|------|--------|
| `src/components/IntelligenceTab.tsx` | Add `documentFilter` state, filtering/derivation logic, render `DocumentFilteredView` when filter active, update sidebar `onSelectCategory` to clear filter, export `KnowledgeItemUI` type, thread `onDocumentFilter` callback down to card list |
| `src/components/intelligence/IntelligenceCardList.tsx` | Accept and thread `onDocumentFilter` callback to cards |
| `src/components/intelligence/IntelligenceCard.tsx` | Add inline filter button next to source document name, accept `onDocumentFilter` callback |
| `src/components/intelligence/DocumentFilteredView.tsx` | **New file** — the filtered view with banner + category-grouped cards |
| `src/components/intelligence/DocumentFilterDropdown.tsx` | **New file** — the folder-grouped document picker dropdown |
| `src/components/intelligence/intelligenceUtils.ts` | Add `sourceDocumentId` to `EvidenceEntry` type, add helper to derive contributing documents |

## New Files

### `DocumentFilteredView.tsx`

Props (receives pre-filtered data from `IntelligenceTab`):
- `documentName: string`
- `items: Array<{ fieldPath: string; label: string; value: string; confidence: number; category: string; status: 'active' | 'superseded'; replacedBy?: { value: string; documentName: string } }>`
- `onBack: () => void`

Responsibilities:
- Group pre-filtered items by category
- Render banner + category sections + field cards with active/superseded styling
- Handle back navigation

### `DocumentFilterDropdown.tsx`

Props:
- `documents: Array<{ id: string; name: string; fieldCount: number; folderName?: string }>`
- `onSelect: (doc: { documentId: string; documentName: string }) => void`

Responsibilities:
- Group documents by `folderName`
- Render dropdown with search (if >10 docs)
- Show field counts per document

## Edge Cases

1. **Document with no active values**: All its extractions were superseded. Show the document in the dropdown (it still contributed), and in filtered view all cards appear as "Superseded".
2. **Document not in knowledge items**: Documents that were analyzed but produced no intelligence extractions won't appear in the dropdown. This is correct — no intelligence to show.
3. **Multiple knowledge items for same field from same document**: Possible if a document was re-analyzed. Show the most recent one (by `addedAt`).
4. **No folder assigned**: Documents without `folderId` appear under "Unfiled" in the dropdown.
5. **Zero contributing documents**: If no documents have contributed intelligence (fresh client), the "By Document" dropdown button should be hidden or disabled.

## Non-Goals

- No new Convex mutations or backend changes
- No document-level analytics or statistics beyond field count
- No ability to edit/delete intelligence from within the filtered view (use the normal view for that)
- No URL-based deep linking to a specific document filter (can be added later)
