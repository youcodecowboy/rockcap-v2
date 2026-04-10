# Mobile Upload V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the toy mobile upload with the real desktop bulk upload pipeline — createBatch + BulkQueueProcessor + fileBatch — with a mobile-native frontend showing full V4 analysis output.

**Architecture:** State lives in Convex (bulkUploadBatches + bulkUploadItems), not React context. The `/m-upload` page checks for pending batches on mount and resumes at the correct phase. Processing uses the existing `createBulkQueueProcessor` factory. Filing uses the existing `fileBatch` mutation.

**Tech Stack:** Next.js 16, React, Convex (useQuery/useMutation), BulkQueueProcessor, lucide-react, Tailwind + var(--m-*) CSS variables

---

### Task 1: Clean Up V1 — Remove UploadContext + Old Components

**Files:**
- Remove: `src/contexts/UploadContext.tsx`
- Modify: `src/app/(mobile)/layout.tsx` — remove UploadProvider
- Remove all files in: `src/app/(mobile)/m-upload/components/` (FilePicker, ProcessingScreen, ReviewFlow, DocReview, CompletionSummary, CategorySheet, FilingSheet, FilingSheet)
- Remove: `src/app/(mobile)/m-upload/page.tsx`

- [ ] **Step 1: Remove UploadProvider from layout**

In `src/app/(mobile)/layout.tsx`, remove the `UploadProvider` import and wrapper. The file currently has:

```tsx
import { UploadProvider } from '@/contexts/UploadContext';
```

And wraps children with `<UploadProvider>`. Remove both. The layout should go back to:

```tsx
<MessengerProvider>
  <MobileLayoutProvider>
    <TabProvider>
      <MobileShell>{children}</MobileShell>
    </TabProvider>
  </MobileLayoutProvider>
</MessengerProvider>
```

- [ ] **Step 2: Delete old files**

```bash
rm src/contexts/UploadContext.tsx
rm src/app/\(mobile\)/m-upload/page.tsx
rm -rf src/app/\(mobile\)/m-upload/components/
```

- [ ] **Step 3: Create stub page so route still exists**

```typescript
// src/app/(mobile)/m-upload/page.tsx
'use client';

export default function MobileUploadPage() {
  return <div className="p-4 text-[var(--m-text-tertiary)]">Upload V2 — coming soon</div>;
}
```

- [ ] **Step 4: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds, `/m-upload` in route list.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(mobile): remove upload V1 — UploadContext, old components"
```

---

### Task 2: Upload Setup Page — Scope, Client, Project, Folder, Files

**Files:**
- Create: `src/app/(mobile)/m-upload/components/UploadSetup.tsx`
- Create: `src/app/(mobile)/m-upload/components/ScopeToggle.tsx`
- Create: `src/app/(mobile)/m-upload/components/ShortcodeInput.tsx`
- Create: `src/app/(mobile)/m-upload/components/FolderSheet.tsx`
- Modify: `src/app/(mobile)/m-upload/page.tsx`

This is the largest task — the full setup form.

- [ ] **Step 1: Create ScopeToggle component**

```typescript
// src/app/(mobile)/m-upload/components/ScopeToggle.tsx
'use client';

type Scope = 'client' | 'internal' | 'personal';

interface ScopeToggleProps {
  value: Scope;
  onChange: (scope: Scope) => void;
}

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'client', label: 'Client' },
  { value: 'internal', label: 'Internal' },
  { value: 'personal', label: 'Personal' },
];

export default function ScopeToggle({ value, onChange }: ScopeToggleProps) {
  return (
    <div className="flex gap-2">
      {SCOPES.map(s => (
        <button
          key={s.value}
          onClick={() => onChange(s.value)}
          className={`flex-1 py-2.5 px-2 rounded-lg text-[13px] font-medium text-center transition-colors ${
            value === s.value
              ? 'bg-[var(--m-text-primary)] text-white'
              : 'bg-[var(--m-bg-subtle)] border border-[var(--m-border)] text-[var(--m-text-secondary)]'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create ShortcodeInput component**

```typescript
// src/app/(mobile)/m-upload/components/ShortcodeInput.tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Check, X, Loader2 } from 'lucide-react';

interface ShortcodeInputProps {
  projectName: string;
  currentShortcode?: string;
  onSet: (shortcode: string) => void;
}

export default function ShortcodeInput({ projectName, currentShortcode, onSet }: ShortcodeInputProps) {
  const [value, setValue] = useState(currentShortcode || '');
  const [isEditing, setIsEditing] = useState(!currentShortcode);

  // Auto-suggest shortcode from project name
  const suggestion = useQuery(api.projects.suggestShortcode, 
    !currentShortcode && projectName ? { name: projectName } : 'skip'
  );

  // Check availability
  const isAvailable = useQuery(api.projects.isShortcodeAvailable,
    value.length >= 2 ? { shortcode: value.toUpperCase() } : 'skip'
  );

  useEffect(() => {
    if (suggestion && !currentShortcode && !value) {
      setValue(suggestion);
    }
  }, [suggestion, currentShortcode, value]);

  if (!isEditing && currentShortcode) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] bg-[var(--m-accent-subtle)] text-[var(--m-accent-indicator)] px-2 py-0.5 rounded font-medium">
          {currentShortcode}
        </span>
        <button
          onClick={() => setIsEditing(true)}
          className="text-[11px] text-[var(--m-accent-indicator)]"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <input
        value={value}
        onChange={e => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
        placeholder="e.g. COMB"
        maxLength={10}
        style={{ fontSize: '16px' }}
        className="w-24 px-2 py-1.5 border border-[var(--m-border)] rounded-lg text-[13px] text-[var(--m-text-primary)] bg-[var(--m-bg-subtle)] outline-none"
      />
      {value.length >= 2 && isAvailable === true && (
        <Check size={14} className="text-[var(--m-success)]" />
      )}
      {value.length >= 2 && isAvailable === false && (
        <span className="text-[11px] text-[var(--m-error)]">Taken</span>
      )}
      {value.length >= 2 && isAvailable === undefined && (
        <Loader2 size={14} className="animate-spin text-[var(--m-text-tertiary)]" />
      )}
      {value.length >= 2 && isAvailable === true && (
        <button
          onClick={() => { onSet(value); setIsEditing(false); }}
          className="text-[11px] font-medium text-[var(--m-accent-indicator)]"
        >
          Set
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create FolderSheet bottom sheet**

```typescript
// src/app/(mobile)/m-upload/components/FolderSheet.tsx
'use client';

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { X, Check } from 'lucide-react';

interface FolderSheetProps {
  scope: 'client' | 'internal' | 'personal';
  clientId?: string;
  projectId?: string;
  currentFolderKey?: string;
  onSelect: (folderKey: string, folderName: string, folderLevel: 'client' | 'project') => void;
  onClose: () => void;
}

export default function FolderSheet({ scope, clientId, projectId, currentFolderKey, onSelect, onClose }: FolderSheetProps) {
  // Load folders based on scope
  const clientFolders = useQuery(api.clients.getClientFolders,
    scope === 'client' && clientId ? { clientId: clientId as Id<'clients'> } : 'skip'
  );
  const projectFolders = useQuery(api.projects.getProjectFolders,
    scope === 'client' && projectId ? { projectId: projectId as Id<'projects'> } : 'skip'
  );
  const internalFolders = useQuery(api.internalFolders.list, scope === 'internal' ? {} : 'skip');
  const personalFolders = useQuery(api.personalFolders.list, scope === 'personal' ? {} : 'skip');

  const folders = useMemo(() => {
    if (scope === 'internal') {
      return (internalFolders || []).map((f: any) => ({
        key: f.folderType || f._id,
        name: f.name,
        level: 'client' as const,
      }));
    }
    if (scope === 'personal') {
      return (personalFolders || []).map((f: any) => ({
        key: f.folderType || f._id,
        name: f.name,
        level: 'client' as const,
      }));
    }
    // Client scope: show project folders if project selected, else client folders
    const items: { key: string; name: string; level: 'client' | 'project' }[] = [];
    if (projectId && projectFolders) {
      for (const f of projectFolders) {
        items.push({ key: f.folderType, name: f.name, level: 'project' });
      }
    }
    if (clientFolders) {
      for (const f of clientFolders) {
        if (!f.parentFolderId) {
          items.push({ key: f.folderType, name: f.name, level: 'client' });
        }
      }
    }
    return items;
  }, [scope, clientFolders, projectFolders, internalFolders, personalFolders, projectId]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-2xl max-h-[60vh] flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--m-border)]">
          <h3 className="text-[15px] font-semibold text-[var(--m-text-primary)]">Select Folder</h3>
          <button onClick={onClose} className="p-1 text-[var(--m-text-tertiary)]">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <button
            onClick={() => { onSelect('', 'None', 'client'); }}
            className="w-full text-left px-3 py-2.5 rounded-lg mb-1 text-[13px] text-[var(--m-accent-indicator)] font-medium active:bg-[var(--m-bg-subtle)]"
          >
            No specific folder
          </button>
          {folders.map(f => (
            <button
              key={f.key}
              onClick={() => onSelect(f.key, f.name, f.level)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-[13px] flex items-center justify-between active:bg-[var(--m-bg-subtle)] ${
                f.key === currentFolderKey
                  ? 'text-[var(--m-text-primary)] font-medium bg-[var(--m-bg-subtle)]'
                  : 'text-[var(--m-text-primary)]'
              }`}
            >
              <span>{f.name}</span>
              {f.key === currentFolderKey && <Check size={14} className="text-[var(--m-success)]" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create UploadSetup — the main setup form**

This is the core component. Create `src/app/(mobile)/m-upload/components/UploadSetup.tsx`.

The component needs:
- **State**: scope, clientId, clientName, projectId, projectName, projectShortcode, folderKey, folderName, folderLevel, isInternal, instructions, files[], showClientSheet, showProjectSheet, showFolderSheet, instructionsExpanded
- **Queries**: `api.clients.list({})`, `api.projects.getByClient({ clientId })`, `api.users.getCurrent({})`, `api.knowledgeLibrary.getChecklistByProject({ projectId })` or `api.knowledgeLibrary.getClientLevelChecklist({ clientId })`, `api.clients.getClientFolders({ clientId })`, `api.projects.getProjectFolders({ projectId })`
- **Mutations**: `api.bulkUpload.createBatch`, `api.bulkUpload.addItemToBatch`
- **On submit**: creates batch, adds items, calls `onBatchCreated(batchId, files, batchInfo)` callback

The component receives `onBatchCreated` callback from page.tsx. It also receives optional `initialContext` for pre-fill from URL params.

Key imports:
```typescript
import { useUser } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { getUserInitials } from '@/lib/documentNaming';
import { File, Upload, X, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import ScopeToggle from './ScopeToggle';
import ShortcodeInput from './ShortcodeInput';
import FolderSheet from './FolderSheet';
```

File picker section: hidden `<input type="file" multiple accept="..." />`, drop zone button, file list with lucide icons (`FileText`, `Table`, `FileType`, `Image`, `Mail`, `File`), remove buttons.

Client/project pickers: tappable cards that open bottom sheet pickers (reuse the existing `FilingSheet.tsx` pattern — but simplified since we only need client step and project step, not the full three-step flow). Use separate sheet states rather than a single multi-step sheet.

Upload button: sticky above footer, disabled until requirements met (scope set + client selected for client scope + files added + shortcode set if project selected).

On submit flow:
1. Get `currentUser._id` for userId
2. Get uploaderInitials via `getUserInitials(user.fullName || ...)`
3. Build checklist items array from query results (filter to `missing` or `pending_review`)
4. Build available folders array from folder queries
5. Call `createBatch` with all fields
6. For each file, call `addItemToBatch` with batchId, fileName, fileSize, fileType, folderHint
7. Call `onBatchCreated(batchId, files, batchInfo)` where batchInfo matches the `BatchInfo` type from `bulkQueueProcessor.ts`

**Full code is too large for inline. The implementer should:**
- Read `src/components/BulkUpload.tsx` lines 600-850 for the desktop's batch creation flow
- Read `src/lib/bulkQueueProcessor.ts` lines 200-238 for the `BatchInfo` type
- Follow the patterns from existing mobile bottom sheets (`src/app/(mobile)/m-docs/components/MoveFileSheet.tsx`)
- Use Tailwind + `var(--m-*)` CSS variables (light theme, no dark colors)
- Black primary buttons, outlined secondary buttons
- All inputs `style={{ fontSize: '16px' }}` for iOS

- [ ] **Step 5: Update page.tsx to render UploadSetup and handle phase routing**

```typescript
// src/app/(mobile)/m-upload/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import type { BatchInfo } from '@/lib/bulkQueueProcessor';
import UploadSetup from './components/UploadSetup';

type UploadPhase =
  | { phase: 'setup' }
  | { phase: 'processing'; batchId: string; files: File[]; batchInfo: BatchInfo }
  | { phase: 'review'; batchId: string }
  | { phase: 'done'; batchId: string };

export default function MobileUploadPage() {
  const [currentPhase, setPhase] = useState<UploadPhase>({ phase: 'setup' });
  const searchParams = useSearchParams();

  // Check for pending batches on mount
  const currentUser = useQuery(api.users.getCurrent, {});
  const pendingBatches = useQuery(api.bulkUpload.getPendingBatches,
    currentUser?._id ? { userId: currentUser._id } : 'skip'
  );

  // Resume pending batch if found (one-time on mount)
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || !pendingBatches || pendingBatches.length === 0) return;
    resumedRef.current = true;
    const batch = pendingBatches[0];
    if (batch.status === 'review') {
      setPhase({ phase: 'review', batchId: batch._id });
    }
    // Don't resume 'uploading'/'processing' — processor instance is gone, user needs to start fresh or continue on desktop
  }, [pendingBatches]);

  // Read pre-fill context from URL params
  const initialContext = {
    clientId: searchParams.get('clientId') || undefined,
    clientName: searchParams.get('clientName') || undefined,
    projectId: searchParams.get('projectId') || undefined,
    projectName: searchParams.get('projectName') || undefined,
    folderTypeKey: searchParams.get('folderTypeKey') || undefined,
    folderLevel: (searchParams.get('folderLevel') as 'client' | 'project') || undefined,
    folderName: searchParams.get('folderName') || undefined,
  };

  const handleBatchCreated = (batchId: string, files: File[], batchInfo: BatchInfo) => {
    setPhase({ phase: 'processing', batchId, files, batchInfo });
  };

  switch (currentPhase.phase) {
    case 'setup':
      return (
        <UploadSetup
          initialContext={initialContext}
          onBatchCreated={handleBatchCreated}
        />
      );
    case 'processing':
      // ProcessingScreen — Task 3
      return <div className="p-4 text-[var(--m-text-tertiary)]">Processing...</div>;
    case 'review':
      // ReviewFlow — Task 5
      return <div className="p-4 text-[var(--m-text-tertiary)]">Review...</div>;
    case 'done':
      // CompletionSummary — Task 6
      return <div className="p-4 text-[var(--m-text-tertiary)]">Done!</div>;
  }
}
```

- [ ] **Step 6: Verify build passes**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(mobile): upload V2 setup page — scope, client, project, folder, files"
```

---

### Task 3: Processing Screen — BulkQueueProcessor Integration

**Files:**
- Create: `src/app/(mobile)/m-upload/components/ProcessingScreen.tsx`
- Modify: `src/app/(mobile)/m-upload/page.tsx` — wire ProcessingScreen

This is the critical integration task. It instantiates `BulkQueueProcessor` with the same callbacks the desktop uses.

- [ ] **Step 1: Create ProcessingScreen**

The component receives `batchId`, `files` (the File objects for processing), `batchInfo` (the BatchInfo for the processor), and `onComplete` callback.

Key implementation details:
- Import `createBulkQueueProcessor` from `@/lib/bulkQueueProcessor` and the `BatchInfo` type
- Use `useMutation` for: `api.bulkUpload.updateItemStatus`, `api.bulkUpload.updateItemAnalysis`, `api.bulkUpload.updateBatchStatus`, `api.files.generateUploadUrl`
- Use `useConvexClient` from `convex/react` for `getStorageUrl` callback: `convex.query(api.documents.getFileUrl, { storageId })`
- Duplicate check: `fetch('/api/check-duplicates?...')` — same pattern as desktop
- Read batch items via `useQuery(api.bulkUpload.getBatchItems, { batchId })` for reactive display
- On mount: create processor, set batchInfo, add all items, call `processQueue()`
- Use `concurrency: 1` (mobile, gentle on network)
- When batch status reaches `review`, call `onComplete` after 1s delay

Display:
- Header: "Processing..."
- Spinner animation while processing, check icon when done, alert icon if all failed
- Per-file rows read from `getBatchItems` query: pending→waiting, processing→analyzing (spinner + progress bar), ready_for_review→done (green check), error→error (red, tappable)
- Bottom hint: "You can navigate away..."
- Retry: tappable error rows (but processor handles retry internally)

Styling: Tailwind + var(--m-*), light theme, lucide icons, no emojis.

The implementer should:
- Read `src/components/BulkUpload.tsx` lines 726-850 for the exact desktop wiring pattern
- Read `src/lib/bulkQueueProcessor.ts` for `createBulkQueueProcessor`, `BatchInfo`, `BulkQueueProcessorCallbacks`
- Match the callback signatures exactly
- Use `useRef` for the processor instance (avoid re-creating on re-render)

- [ ] **Step 2: Wire ProcessingScreen in page.tsx**

Replace the processing stub with:
```tsx
case 'processing':
  return (
    <ProcessingScreen
      batchId={currentPhase.batchId}
      files={currentPhase.files}
      batchInfo={currentPhase.batchInfo}
      onComplete={() => setPhase({ phase: 'review', batchId: currentPhase.batchId })}
    />
  );
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(mobile): processing screen with BulkQueueProcessor integration"
```

---

### Task 4: Review Components — DocReviewCard + Analysis Sections

**Files:**
- Create: `src/app/(mobile)/m-upload/components/DocReviewCard.tsx`
- Create: `src/app/(mobile)/m-upload/components/DocumentAnalysisSection.tsx`
- Create: `src/app/(mobile)/m-upload/components/IntelligenceFieldsList.tsx`
- Create: `src/app/(mobile)/m-upload/components/ChecklistMatchesList.tsx`
- Create: `src/app/(mobile)/m-upload/components/CategorySheet.tsx`

These are the read-only display components for the review screen. Build them before the ReviewFlow wrapper.

- [ ] **Step 1: Create DocumentAnalysisSection (collapsible)**

Displays: purpose, entities (as pills), key amounts, key dates, document characteristics (as pills). Reads from the `documentAnalysis` field on a bulkUploadItem.

Props: `analysis: any` (the documentAnalysis object), `defaultExpanded?: boolean`

Structure: collapsible section with chevron toggle. Sub-sections: PURPOSE (text), ENTITIES (colored pills — companies blue, locations green), KEY AMOUNTS, KEY DATES, CHARACTERISTICS (gray pills for isFinancial/isLegal/isReport etc.).

Styling: `bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3`. Labels: `text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase`.

~80-100 lines.

- [ ] **Step 2: Create IntelligenceFieldsList**

Displays extracted intelligence fields with confidence and scope badges.

Props: `fields: any[]` (the extractedIntelligence.fields array), `defaultExpanded?: boolean`

Each field row: label (font-medium), value below it, right side has confidence badge (High/Med/Low) + scope badge (P/C).

Confidence colors: High (≥0.9) → `bg-[#f0fdf4] text-[var(--m-success)]`, Med (≥0.7) → `bg-[#fefce8] text-[var(--m-warning)]`, Low → `text-[var(--m-error)]`.

Scope badges: P (project) → `bg-[var(--m-accent-subtle)] text-[var(--m-accent-indicator)]`, C (client) → `bg-[#fefce8] text-[var(--m-warning)]`.

Footer text: "Fields saved to client/project intelligence when filed"

~80-100 lines.

- [ ] **Step 3: Create ChecklistMatchesList**

Displays matched checklist items with confidence percentage.

Props: `matches: any[]` (the suggestedChecklistItems array)

Each row: green check icon, item name, category + confidence text.

~50-60 lines.

- [ ] **Step 4: Create CategorySheet (bottom sheet)**

Bottom sheet for editing category + type. Same as the V1 version but with correct light-theme styling.

Props: `currentCategory: string`, `currentType: string`, `onSelect: (category, type) => void`, `onClose: () => void`

13 categories: Appraisals, Plans, Inspections, Professional Reports, KYC, Loan Terms, Legal Documents, Project Documents, Financial Documents, Insurance, Communications, Warranties, Photographs.

Searchable category list + free-text type input. Black "Apply" button.

~100 lines.

- [ ] **Step 5: Create DocReviewCard**

The main review content for one document. Reads from a single `bulkUploadItem`.

Props: `item: any` (bulkUploadItem from Convex), `batchId: string`, `onUpdate: () => void`

Sections:
1. **DOCUMENT** — `item.generatedDocumentCode` (large, bold) + `item.fileName` (small, gray)
2. **CLASSIFICATION** — tappable, shows category + type side-by-side with confidence dot + folder. Opens CategorySheet. On change, calls `updateItemDetails` mutation.
3. **FILED TO** — tappable, shows client→project + folder + internal/external. Opens sheet to edit folder. On change, calls `updateItemDetails`.
4. **EXECUTIVE SUMMARY** — `item.summary` in a card
5. **DOCUMENT ANALYSIS** — `<DocumentAnalysisSection analysis={item.documentAnalysis} />` (collapsed default)
6. **INTELLIGENCE FIELDS** — `<IntelligenceFieldsList fields={item.extractedIntelligence?.fields} />` (expanded default)
7. **CHECKLIST MATCHES** — `<ChecklistMatchesList matches={item.suggestedChecklistItems} />` (if matches exist)
8. **CLASSIFICATION REASONING** — collapsible text card (collapsed default)
9. **EMAIL METADATA** — from/to/subject/date rows (only if `item.emailMetadata` exists)

Mutations: `api.bulkUpload.updateItemDetails` for saving edits to category, fileType, targetFolder, isInternal.

~200-250 lines.

- [ ] **Step 6: Verify build passes**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(mobile): review components — DocReviewCard, analysis sections, sheets"
```

---

### Task 5: Review Flow — Navigation + Filing

**Files:**
- Create: `src/app/(mobile)/m-upload/components/ReviewFlow.tsx`
- Modify: `src/app/(mobile)/m-upload/page.tsx` — wire ReviewFlow

- [ ] **Step 1: Create ReviewFlow**

Props: `batchId: string`, `onFiled: () => void`

Queries:
- `useQuery(api.bulkUpload.getBatchItems, { batchId })` — all items
- `useQuery(api.bulkUpload.getBatch, { batchId })` — batch metadata

State: `currentIndex` (which item is shown), `isFiling` (loading state during fileBatch)

Mutations:
- `api.bulkUpload.fileBatch` — the existing desktop filing mutation
- `api.bulkUpload.deleteItems` — for deleting items (takes `{ batchId, itemIds: [itemId] }`)

Layout:
- Header: "← Back" (go to setup), "N of M" counter, "Delete" (red)
- Middle: `<DocReviewCard item={items[currentIndex]} batchId={batchId} />`
- Footer: "Previous" button (outlined, disabled on first) + "Next →" / "File All" button (black, solid)
- "File All" shown only on last item. Calls `fileBatch({ batchId })`. Shows loading spinner during filing.
- After `fileBatch` succeeds, calls `onFiled()`

Delete: calls `deleteItems({ batchId, itemIds: [currentItem._id] })`. Adjusts index. If last item deleted, go back to setup.

Filing disabled if any item has no category or no clientId (for client scope).

~120-150 lines.

- [ ] **Step 2: Wire ReviewFlow in page.tsx**

Replace the review stub:
```tsx
case 'review':
  return (
    <ReviewFlow
      batchId={currentPhase.batchId}
      onFiled={() => setPhase({ phase: 'done', batchId: currentPhase.batchId })}
    />
  );
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(mobile): review flow with navigation, editing, and fileBatch integration"
```

---

### Task 6: Completion Summary

**Files:**
- Create: `src/app/(mobile)/m-upload/components/CompletionSummary.tsx`
- Modify: `src/app/(mobile)/m-upload/page.tsx` — wire CompletionSummary

- [ ] **Step 1: Create CompletionSummary**

Props: `batchId: string`, `onUploadMore: () => void`

Queries:
- `useQuery(api.bulkUpload.getBatch, { batchId })` — batch metadata
- `useQuery(api.bulkUpload.getBatchItems, { batchId })` — filed items

Layout:
- Header bar: "Complete"
- Success icon: `CheckCircle` from lucide (green) or `AlertCircle` (amber if errors)
- Title: "N documents filed"
- Subtitle: "All files analyzed and filed" or "N failed"
- Batch context card: client → project + scope
- Document list: each item shows generatedDocumentCode, category badge (gray pill), original fileName. Tappable → navigate to `/m-docs?documentId=...` (read documentId from the filed item's linked document)
- Actions: "Upload More" (outlined) + "Done" (black solid). "Upload More" calls `onUploadMore()`. "Done" navigates to `/m-docs`.

Note: filed items may have a linked documentId. Check if `item.filedDocumentId` or similar field exists on the item after filing. The implementer should check `bulkUpload.fileBatch` return value and `getBatchItems` post-filing to find the created document IDs.

~100-120 lines.

- [ ] **Step 2: Wire CompletionSummary in page.tsx**

Replace the done stub:
```tsx
case 'done':
  return (
    <CompletionSummary
      batchId={currentPhase.batchId}
      onUploadMore={() => setPhase({ phase: 'setup' })}
    />
  );
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(mobile): completion summary with batch results and navigation"
```

---

### Task 7: Build Verification + Cleanup + Push

**Files:** Various (cleanup only)

- [ ] **Step 1: Run full build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds, `/m-upload` in route list.

- [ ] **Step 2: Verify MobileNavDrawer and FolderContents still have upload entry points**

Check that `src/components/mobile/MobileNavDrawer.tsx` still has the Upload nav item and `src/app/(mobile)/m-docs/components/FolderContents.tsx` still has the upload-from-folder button. These were added in V1 and should still work.

- [ ] **Step 3: Fix any build errors**

If TypeScript or build errors exist, fix them.

- [ ] **Step 4: Commit and push**

```bash
git push origin main
```
