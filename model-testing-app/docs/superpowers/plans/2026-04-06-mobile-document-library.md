# Mobile Document Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 5-state drill-down document browser for mobile: scope/client list → client detail → (optional) project folders → folder contents → full-screen document viewer with 6 tabs.

**Architecture:** Single `DocsContent` client component manages a navigation stack (push/pop array of screen states). Each screen is a standalone component that receives nav callbacks. The DocumentViewer renders as a full-screen overlay. All data from Convex `useQuery` hooks. Shared FileRow/FolderRow/FileTypeBadge components used across screens.

**Tech Stack:** Next.js 16, React 19, Convex (useQuery), Tailwind CSS 4, Lucide React. Mobile design tokens from `MOBILE_DESIGN_SYSTEM.md`.

**Design Spec:** `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md`

---

### Task 1: Scaffold, navigation state machine, and shared components

**Files:**
- Modify: `src/app/(mobile)/m-docs/page.tsx`
- Create: `src/app/(mobile)/m-docs/components/DocsContent.tsx`
- Create: `src/app/(mobile)/m-docs/components/shared/FileTypeBadge.tsx`
- Create: `src/app/(mobile)/m-docs/components/shared/FileRow.tsx`
- Create: `src/app/(mobile)/m-docs/components/shared/FolderRow.tsx`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/app/\(mobile\)/m-docs/components/shared
mkdir -p src/app/\(mobile\)/m-docs/components/DocumentViewerTabs
```

- [ ] **Step 2: Create FileTypeBadge**

Create `src/app/(mobile)/m-docs/components/shared/FileTypeBadge.tsx`:

```tsx
function getTypeInfo(fileType: string): { label: string; bg: string; text: string } {
  const t = fileType.toLowerCase();
  if (t.includes('pdf')) return { label: 'PDF', bg: 'bg-[#fef2f2]', text: 'text-[#991b1b]' };
  if (t.includes('word') || t.includes('doc')) return { label: 'DOC', bg: 'bg-[#eff6ff]', text: 'text-[#1e40af]' };
  if (t.includes('sheet') || t.includes('xls') || t.includes('csv')) return { label: 'XLS', bg: 'bg-[#f0fdf4]', text: 'text-[#166534]' };
  if (t.includes('image') || t.includes('jpg') || t.includes('jpeg') || t.includes('png') || t.includes('gif')) return { label: 'IMG', bg: 'bg-[#faf5ff]', text: 'text-[#6b21a8]' };
  return { label: 'FILE', bg: 'bg-[var(--m-bg-subtle)]', text: 'text-[var(--m-text-secondary)]' };
}

interface FileTypeBadgeProps {
  fileType: string;
}

export default function FileTypeBadge({ fileType }: FileTypeBadgeProps) {
  const { label, bg, text } = getTypeInfo(fileType);
  return (
    <div className={`w-8 h-8 rounded-md ${bg} flex items-center justify-center flex-shrink-0`}>
      <span className={`text-[9px] font-bold ${text}`}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create FileRow**

Create `src/app/(mobile)/m-docs/components/shared/FileRow.tsx`:

```tsx
import FileTypeBadge from './FileTypeBadge';

interface FileRowProps {
  fileName: string;
  displayName?: string;
  fileType: string;
  category?: string;
  fileSize: number;
  uploadedAt: string;
  onTap: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function FileRow({ fileName, displayName, fileType, category, fileSize, uploadedAt, onTap }: FileRowProps) {
  const name = displayName || fileName;
  const parts = [category, formatFileSize(fileSize), formatDate(uploadedAt)].filter(Boolean);

  return (
    <button
      onClick={onTap}
      className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
    >
      <FileTypeBadge fileType={fileType} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">{name}</div>
        <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">{parts.join(' · ')}</div>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Create FolderRow**

Create `src/app/(mobile)/m-docs/components/shared/FolderRow.tsx`:

```tsx
import { Folder } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

interface FolderRowProps {
  name: string;
  docCount: number;
  variant?: 'client' | 'project';
  onTap: () => void;
}

export default function FolderRow({ name, docCount, variant = 'client', onTap }: FolderRowProps) {
  const iconBg = variant === 'project' ? 'bg-[#eff6ff]' : 'bg-[#fef3c7]';
  const iconColor = variant === 'project' ? 'text-[#1e40af]' : 'text-[#a16207]';

  return (
    <button
      onClick={onTap}
      className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
    >
      <div className={`w-7 h-7 rounded-md ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Folder className={`w-3.5 h-3.5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--m-text-primary)]">{name}</div>
        <div className="text-[10px] text-[var(--m-text-tertiary)]">{docCount} document{docCount !== 1 ? 's' : ''}</div>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-placeholder)] flex-shrink-0" />
    </button>
  );
}
```

- [ ] **Step 5: Create DocsContent with navigation state machine**

Create `src/app/(mobile)/m-docs/components/DocsContent.tsx`:

```tsx
'use client';

import { useState, useCallback } from 'react';

export type NavScreen =
  | { screen: 'list' }
  | { screen: 'client'; clientId: string; clientName: string }
  | { screen: 'projectFolders'; clientId: string; clientName: string; projectId: string; projectName: string }
  | { screen: 'folder'; clientId: string; clientName: string; projectId?: string; projectName?: string; folderRecordId: string; folderTypeKey: string; folderName: string; folderLevel: 'client' | 'project' }
  | { screen: 'viewer'; documentId: string };

// folderRecordId = the _id of the clientFolders/projectFolders record (for resolving children via parentFolderId)
// folderTypeKey = the folderType string key (for querying documents via documents.getByFolder)

export default function DocsContent() {
  const [navStack, setNavStack] = useState<NavScreen[]>([{ screen: 'list' }]);

  const currentScreen = navStack[navStack.length - 1];

  const push = useCallback((screen: NavScreen) => {
    setNavStack(prev => [...prev, screen]);
  }, []);

  const pop = useCallback(() => {
    setNavStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  // Viewer is an overlay — check if it's anywhere in the stack
  const viewerScreen = navStack.find(s => s.screen === 'viewer') as Extract<NavScreen, { screen: 'viewer' }> | undefined;
  const closeViewer = useCallback(() => {
    setNavStack(prev => prev.filter(s => s.screen !== 'viewer'));
  }, []);

  const openViewer = useCallback((documentId: string) => {
    push({ screen: 'viewer', documentId });
  }, [push]);

  // Render based on current screen (excluding viewer overlay)
  const baseScreen = viewerScreen ? navStack[navStack.length - 2] || navStack[0] : currentScreen;

  return (
    <div className="min-h-[60vh]">
      {baseScreen.screen === 'list' && (
        <div className="px-[var(--m-page-px)] py-6 text-center text-[var(--m-text-tertiary)] text-[13px]">
          DocsList placeholder — Task 2
        </div>
      )}
      {baseScreen.screen === 'client' && (
        <div className="px-[var(--m-page-px)] py-6 text-center text-[var(--m-text-tertiary)] text-[13px]">
          ClientDocDetail placeholder — Task 4
        </div>
      )}
      {baseScreen.screen === 'projectFolders' && (
        <div className="px-[var(--m-page-px)] py-6 text-center text-[var(--m-text-tertiary)] text-[13px]">
          ProjectFolderList placeholder — Task 5
        </div>
      )}
      {baseScreen.screen === 'folder' && (
        <div className="px-[var(--m-page-px)] py-6 text-center text-[var(--m-text-tertiary)] text-[13px]">
          FolderContents placeholder — Task 6
        </div>
      )}

      {/* Viewer overlay */}
      {viewerScreen && (
        <div className="fixed inset-0 z-50 bg-[var(--m-bg)]">
          <div className="px-[var(--m-page-px)] py-6 text-center text-[var(--m-text-tertiary)] text-[13px]">
            DocumentViewer placeholder — Task 7
            <button onClick={closeViewer} className="block mx-auto mt-2 text-[var(--m-accent-indicator)]">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Update page.tsx**

Replace `src/app/(mobile)/m-docs/page.tsx`:

```tsx
import DocsContent from './components/DocsContent';

export default function MobileDocs() {
  return <DocsContent />;
}
```

- [ ] **Step 7: Verify build**

```bash
npx next build
```

- [ ] **Step 8: Commit**

```bash
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): scaffold doc library with nav state machine and shared components"
```

---

### Task 2: DocsList — Clients scope (scope toggle + client list + search)

**Files:**
- Create: `src/app/(mobile)/m-docs/components/DocsList.tsx`
- Modify: `src/app/(mobile)/m-docs/components/DocsContent.tsx`

- [ ] **Step 1: Create DocsList component**

Create `src/app/(mobile)/m-docs/components/DocsList.tsx`:

```tsx
'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Search } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import FileRow from './shared/FileRow';

type Scope = 'clients' | 'internal' | 'personal';

interface DocsListProps {
  onSelectClient: (clientId: string, clientName: string) => void;
  onOpenViewer: (documentId: string) => void;
}

export default function DocsList({ onSelectClient, onOpenViewer }: DocsListProps) {
  const [scope, setScope] = useState<Scope>('clients');
  const [search, setSearch] = useState('');

  const clients = useQuery(api.clients.list, {});
  const clientDocCounts = useQuery(api.documents.getClientDocumentCounts, {});
  const projects = useQuery(api.projects.list, {});
  const internalDocs = useQuery(api.documents.getByScope, scope === 'internal' ? { scope: 'internal' } : 'skip');
  const personalDocs = useQuery(api.documents.getByScope, scope === 'personal' ? { scope: 'personal' } : 'skip');

  // Count projects per client
  const projectCountByClient = useMemo(() => {
    const map = new Map<string, number>();
    if (projects) {
      for (const p of projects) {
        if (p.isDeleted) continue;
        for (const role of p.clientRoles) {
          map.set(role.clientId, (map.get(role.clientId) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [projects]);

  // Filter clients by search
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    const list = clients.filter(c => !c.isDeleted);
    if (!search.trim()) return list.sort((a, b) => a.name.localeCompare(b.name));
    const q = search.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, search]);

  // Sort flat file lists
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'az' | 'za' | 'largest'>('newest');

  const sortDocs = (docs: any[]) => {
    const sorted = [...docs];
    switch (sortMode) {
      case 'newest': return sorted.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      case 'oldest': return sorted.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
      case 'az': return sorted.sort((a, b) => (a.displayName || a.fileName).localeCompare(b.displayName || b.fileName));
      case 'za': return sorted.sort((a, b) => (b.displayName || b.fileName).localeCompare(a.displayName || a.fileName));
      case 'largest': return sorted.sort((a, b) => b.fileSize - a.fileSize);
    }
  };

  const sortLabels: Record<string, string> = { newest: 'Newest first', oldest: 'Oldest first', az: 'A → Z', za: 'Z → A', largest: 'Largest first' };
  const sortKeys: Array<typeof sortMode> = ['newest', 'oldest', 'az', 'za', 'largest'];
  const cycleSortMode = () => {
    const idx = sortKeys.indexOf(sortMode);
    setSortMode(sortKeys[(idx + 1) % sortKeys.length]);
  };

  const scopes: { key: Scope; label: string }[] = [
    { key: 'clients', label: 'Clients' },
    { key: 'internal', label: 'Internal' },
    { key: 'personal', label: 'Personal' },
  ];

  return (
    <div>
      {/* Scope toggle */}
      <div className="flex bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        {scopes.map(s => (
          <button
            key={s.key}
            onClick={() => { setScope(s.key); setSearch(''); }}
            className={`flex-1 text-center py-2.5 text-[12px] transition-colors ${
              scope === s.key
                ? 'text-[var(--m-text-primary)] font-medium border-b-2 border-[var(--m-accent-indicator)]'
                : 'text-[var(--m-text-tertiary)] border-b-2 border-transparent'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Clients scope */}
      {scope === 'clients' && (
        <>
          <div className="px-[var(--m-page-px)] py-2.5">
            <div className="flex items-center gap-2 bg-[var(--m-bg-inset)] rounded-md px-3 py-2">
              <Search className="w-3.5 h-3.5 text-[var(--m-text-tertiary)] flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients..."
                className="flex-1 bg-transparent text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none"
              />
            </div>
          </div>

          {clients === undefined ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>
          ) : filteredClients.length === 0 ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
              {search ? 'No matching clients' : 'No clients yet'}
            </div>
          ) : (
            filteredClients.map(client => {
              const docCount = clientDocCounts?.[client._id] ?? 0;
              const projCount = projectCountByClient.get(client._id) ?? 0;
              return (
                <button
                  key={client._id}
                  onClick={() => onSelectClient(client._id, client.name)}
                  className="flex items-center justify-between w-full text-left px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
                >
                  <div>
                    <div className="text-[14px] font-medium text-[var(--m-text-primary)]">{client.name}</div>
                    <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
                      {projCount} project{projCount !== 1 ? 's' : ''} · {docCount} doc{docCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-placeholder)] flex-shrink-0" />
                </button>
              );
            })
          )}
        </>
      )}

      {/* Internal scope */}
      {scope === 'internal' && (
        <>
          <div className="px-[var(--m-page-px)] py-2.5">
            <div className="flex items-center gap-2 bg-[var(--m-bg-inset)] rounded-md px-3 py-2">
              <Search className="w-3.5 h-3.5 text-[var(--m-text-tertiary)] flex-shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..." className="flex-1 bg-transparent text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none" />
            </div>
          </div>
          <div className="px-[var(--m-page-px)] py-1.5 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)] flex justify-between items-center">
            <button onClick={cycleSortMode} className="text-[11px] text-[var(--m-text-tertiary)]">
              Sort: {sortLabels[sortMode]}
            </button>
          </div>
          {internalDocs === undefined ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>
          ) : sortDocs(internalDocs.filter(d => !d.isDeleted && (!search || (d.displayName || d.fileName).toLowerCase().includes(search.toLowerCase())))).length === 0 ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">{search ? 'No matching documents' : 'No internal documents'}</div>
          ) : (
            sortDocs(internalDocs.filter(d => !d.isDeleted && (!search || (d.displayName || d.fileName).toLowerCase().includes(search.toLowerCase())))).map(doc => (
              <FileRow
                key={doc._id}
                fileName={doc.fileName}
                displayName={doc.displayName}
                fileType={doc.fileType}
                category={doc.category}
                fileSize={doc.fileSize}
                uploadedAt={doc.uploadedAt}
                onTap={() => onOpenViewer(doc._id)}
              />
            ))
          )}
        </>
      )}

      {/* Personal scope */}
      {scope === 'personal' && (
        <>
          <div className="px-[var(--m-page-px)] py-2.5">
            <div className="flex items-center gap-2 bg-[var(--m-bg-inset)] rounded-md px-3 py-2">
              <Search className="w-3.5 h-3.5 text-[var(--m-text-tertiary)] flex-shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..." className="flex-1 bg-transparent text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none" />
            </div>
          </div>
          <div className="px-[var(--m-page-px)] py-1.5 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)] flex justify-between items-center">
            <button onClick={cycleSortMode} className="text-[11px] text-[var(--m-text-tertiary)]">
              Sort: {sortLabels[sortMode]}
            </button>
          </div>
          {personalDocs === undefined ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>
          ) : sortDocs(personalDocs.filter(d => !d.isDeleted && (!search || (d.displayName || d.fileName).toLowerCase().includes(search.toLowerCase())))).length === 0 ? (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">{search ? 'No matching documents' : 'No personal documents'}</div>
          ) : (
            sortDocs(personalDocs.filter(d => !d.isDeleted)).map(doc => (
              <FileRow
                key={doc._id}
                fileName={doc.fileName}
                displayName={doc.displayName}
                fileType={doc.fileType}
                category={doc.category}
                fileSize={doc.fileSize}
                uploadedAt={doc.uploadedAt}
                onTap={() => onOpenViewer(doc._id)}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire DocsList into DocsContent**

In `DocsContent.tsx`, import `DocsList` and replace the list placeholder:

```tsx
import DocsList from './DocsList';
```

Replace the `baseScreen.screen === 'list'` block:

```tsx
{baseScreen.screen === 'list' && (
  <DocsList
    onSelectClient={(clientId, clientName) => push({ screen: 'client', clientId, clientName })}
    onOpenViewer={openViewer}
  />
)}
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

Note: If `api.documents.getClientDocumentCounts` doesn't exist, replace with a client-side computation from `documents.list()`. If `api.documents.getByScope` doesn't accept `'skip'` as a Convex conditional arg, use `useQuery(api.documents.getByScope, scope === 'internal' ? { scope: 'internal' } : 'skip')` — Convex supports `'skip'` as the second arg to disable a query.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): add DocsList with scope toggle, client list, and flat file views"
```

---

### Task 3: ClientDocDetail (client folders + project list)

**Files:**
- Create: `src/app/(mobile)/m-docs/components/ClientDocDetail.tsx`
- Modify: `src/app/(mobile)/m-docs/components/DocsContent.tsx`

- [ ] **Step 1: Create ClientDocDetail**

Create `src/app/(mobile)/m-docs/components/ClientDocDetail.tsx`:

```tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react';
import FolderRow from './shared/FolderRow';
import { Id } from '../../../../../convex/_generated/dataModel';

interface ClientDocDetailProps {
  clientId: string;
  clientName: string;
  onBack: () => void;
  onSelectFolder: (folderRecordId: string, folderTypeKey: string, folderName: string, folderLevel: 'client' | 'project', projectId?: string, projectName?: string) => void;
  onSelectProject: (projectId: string, projectName: string) => void;
}

export default function ClientDocDetail({ clientId, clientName, onBack, onSelectFolder, onSelectProject }: ClientDocDetailProps) {
  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, { clientId: clientId as Id<'clients'> });
  const folderCounts = useQuery(api.documents.getFolderCounts, { clientId: clientId as Id<'clients'> });

  const isLoading = foldersData === undefined || folderCounts === undefined;
  const clientFolders = foldersData?.clientFolders?.filter(f => !f.parentFolderId) ?? [];
  const projectGroups = foldersData?.projectFolders ?? [];

  // Compute unfiled count: clientTotal - sum of all client folder counts
  const clientFolderCounts = folderCounts?.clientFolders ?? {};
  const filedCount = Object.values(clientFolderCounts).reduce((sum: number, n: number) => sum + n, 0);
  const unfiledCount = (folderCounts?.clientTotal ?? 0) - filedCount;

  if (isLoading) {
    return <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1 mb-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">Back</span>
        </button>
        <div className="text-[16px] font-semibold text-[var(--m-text-primary)]">{clientName}</div>
      </div>

      {/* Client-level folders */}
      <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">Client Documents</span>
      </div>
      {clientFolders.length === 0 && unfiledCount === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center text-[12px] text-[var(--m-text-tertiary)]">No client documents</div>
      ) : (
        <>
          {clientFolders.map(folder => {
            const count = clientFolderCounts[folder.folderType] ?? 0;
            return (
              <FolderRow
                key={folder._id}
                name={folder.name}
                docCount={count}
                variant="client"
                onTap={() => onSelectFolder(folder._id, folder.folderType, folder.name, 'client')}
              />
            );
          })}
          {unfiledCount > 0 && (
            <FolderRow
              name="Unfiled"
              docCount={unfiledCount}
              variant="client"
              onTap={() => onSelectFolder('unfiled', 'unfiled', 'Unfiled', 'client')}
            />
          )}
        </>
      )}

      {/* Projects section */}
      <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)] border-t border-[var(--m-border)]">
        <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">Projects</span>
      </div>
      {projectGroups.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center text-[12px] text-[var(--m-text-tertiary)]">No projects</div>
      ) : (
        projectGroups.map(group => {
          const folderCount = group.folders?.length ?? 0;
          const projectCounts = folderCounts?.projectFolders?.[group.project._id];
          const totalDocs = projectCounts ? Object.values(projectCounts).reduce((sum: number, n: number) => sum + n, 0) : 0;
          return (
            <button
              key={group.project._id}
              onClick={() => onSelectProject(group.project._id, group.project.name)}
              className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
            >
              <div className="w-7 h-7 rounded-md bg-[#eff6ff] flex items-center justify-center flex-shrink-0">
                <FolderKanban className="w-3.5 h-3.5 text-[#1e40af]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">{group.project.name}</div>
                <div className="text-[10px] text-[var(--m-text-tertiary)]">{folderCount} folder{folderCount !== 1 ? 's' : ''} · {totalDocs} doc{totalDocs !== 1 ? 's' : ''}</div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-placeholder)] flex-shrink-0" />
            </button>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into DocsContent**

Import and replace the client placeholder:

```tsx
import ClientDocDetail from './ClientDocDetail';
```

```tsx
{baseScreen.screen === 'client' && (
  <ClientDocDetail
    clientId={baseScreen.clientId}
    clientName={baseScreen.clientName}
    onBack={pop}
    onSelectFolder={(folderRecordId, folderTypeKey, folderName, folderLevel, projectId, projectName) =>
      push({ screen: 'folder', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId, projectName, folderRecordId, folderTypeKey, folderName, folderLevel })
    }
    onSelectProject={(projectId, projectName) =>
      push({ screen: 'projectFolders', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId, projectName })
    }
  />
)}
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): add ClientDocDetail with client folders and project list"
```

---

### Task 4: ProjectFolderList (intermediate project folder screen)

**Files:**
- Create: `src/app/(mobile)/m-docs/components/ProjectFolderList.tsx`
- Modify: `src/app/(mobile)/m-docs/components/DocsContent.tsx`

- [ ] **Step 1: Create ProjectFolderList**

Create `src/app/(mobile)/m-docs/components/ProjectFolderList.tsx`:

```tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ChevronLeft } from 'lucide-react';
import FolderRow from './shared/FolderRow';
import { Id } from '../../../../../convex/_generated/dataModel';

interface ProjectFolderListProps {
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  onBack: () => void;
  onSelectFolder: (folderRecordId: string, folderTypeKey: string, folderName: string) => void;
}

export default function ProjectFolderList({ clientId, clientName, projectId, projectName, onBack, onSelectFolder }: ProjectFolderListProps) {
  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, { clientId: clientId as Id<'clients'> });
  const folderCounts = useQuery(api.documents.getFolderCounts, { clientId: clientId as Id<'clients'> });

  const isLoading = foldersData === undefined;
  const projectGroup = foldersData?.projectFolders?.find(g => g.project._id === projectId);
  const folders = projectGroup?.folders?.filter(f => !f.parentFolderId) ?? [];
  const projectCounts = folderCounts?.projectFolders?.[projectId] ?? {};

  if (isLoading) {
    return <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1 mb-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">{clientName}</span>
        </button>
        <div className="text-[16px] font-semibold text-[var(--m-text-primary)]">{projectName}</div>
      </div>

      {/* Folder list */}
      {folders.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">No folders in this project</div>
      ) : (
        folders.map(folder => {
          const count = projectCounts[folder.folderType] ?? 0;
          return (
            <FolderRow
              key={folder._id}
              name={folder.name}
              docCount={count}
              variant="project"
              onTap={() => onSelectFolder(folder._id, folder.folderType, folder.name)}
            />
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into DocsContent**

Import and replace the projectFolders placeholder:

```tsx
import ProjectFolderList from './ProjectFolderList';
```

```tsx
{baseScreen.screen === 'projectFolders' && (
  <ProjectFolderList
    clientId={baseScreen.clientId}
    clientName={baseScreen.clientName}
    projectId={baseScreen.projectId}
    projectName={baseScreen.projectName}
    onBack={pop}
    onSelectFolder={(folderRecordId, folderTypeKey, folderName) =>
      push({ screen: 'folder', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId: baseScreen.projectId, projectName: baseScreen.projectName, folderRecordId, folderTypeKey, folderName, folderLevel: 'project' })
    }
  />
)}
```

- [ ] **Step 3: Verify build and commit**

```bash
npx next build
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): add ProjectFolderList intermediate screen"
```

---

### Task 5: FolderContents (file list with sort and subfolders)

**Files:**
- Create: `src/app/(mobile)/m-docs/components/FolderContents.tsx`
- Modify: `src/app/(mobile)/m-docs/components/DocsContent.tsx`

- [ ] **Step 1: Create FolderContents**

Create `src/app/(mobile)/m-docs/components/FolderContents.tsx`:

```tsx
'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ChevronLeft } from 'lucide-react';
import FileRow from './shared/FileRow';
import FolderRow from './shared/FolderRow';
import { Id } from '../../../../../convex/_generated/dataModel';

interface FolderContentsProps {
  clientId: string;
  clientName: string;
  projectId?: string;
  projectName?: string;
  folderRecordId: string;
  folderTypeKey: string;
  folderName: string;
  folderLevel: 'client' | 'project';
  onBack: () => void;
  onOpenSubfolder: (folderRecordId: string, folderTypeKey: string, folderName: string) => void;
  onOpenViewer: (documentId: string) => void;
}

type SortMode = 'newest' | 'oldest' | 'az' | 'za' | 'largest';
const sortLabels: Record<SortMode, string> = { newest: 'Newest first', oldest: 'Oldest first', az: 'A → Z', za: 'Z → A', largest: 'Largest first' };
const sortKeys: SortMode[] = ['newest', 'oldest', 'az', 'za', 'largest'];

export default function FolderContents({ clientId, clientName, projectId, projectName, folderRecordId, folderTypeKey, folderName, folderLevel, onBack, onOpenSubfolder, onOpenViewer }: FolderContentsProps) {
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  // Query documents using folderTypeKey (the string key the backend expects)
  const docs = useQuery(api.documents.getByFolder, {
    clientId: clientId as Id<'clients'>,
    folderType: folderTypeKey,
    level: folderLevel,
    ...(projectId ? { projectId: projectId as Id<'projects'> } : {}),
  });

  // Get subfolders using folderRecordId (the actual _id for parentFolderId matching)
  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, { clientId: clientId as Id<'clients'> });

  const subfolders = useMemo(() => {
    if (!foldersData) return [];
    if (folderLevel === 'client') {
      return foldersData.clientFolders?.filter(f => f.parentFolderId === folderRecordId) ?? [];
    } else {
      const projectGroup = foldersData.projectFolders?.find(g => g.project._id === projectId);
      return projectGroup?.folders?.filter(f => f.parentFolderId === folderRecordId) ?? [];
    }
  }, [foldersData, folderRecordId, folderLevel, projectId]);

  const isLoading = docs === undefined;

  const sortedDocs = useMemo(() => {
    if (!docs) return [];
    const filtered = docs.filter(d => !d.isDeleted);
    switch (sortMode) {
      case 'newest': return [...filtered].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      case 'oldest': return [...filtered].sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
      case 'az': return [...filtered].sort((a, b) => (a.displayName || a.fileName).localeCompare(b.displayName || b.fileName));
      case 'za': return [...filtered].sort((a, b) => (b.displayName || b.fileName).localeCompare(a.displayName || a.fileName));
      case 'largest': return [...filtered].sort((a, b) => b.fileSize - a.fileSize);
    }
  }, [docs, sortMode]);

  const cycleSortMode = () => {
    const idx = sortKeys.indexOf(sortMode);
    setSortMode(sortKeys[(idx + 1) % sortKeys.length]);
  };

  const backLabel = projectName || clientName;
  const contextLine = projectName ? `${projectName} · ${sortedDocs.length} document${sortedDocs.length !== 1 ? 's' : ''}` : `${sortedDocs.length} document${sortedDocs.length !== 1 ? 's' : ''}`;

  return (
    <div>
      {/* Header */}
      <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1 mb-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">{backLabel}</span>
        </button>
        <div className="text-[14px] font-semibold text-[var(--m-text-primary)]">{folderName}</div>
        <div className="text-[10px] text-[var(--m-text-tertiary)] mt-0.5">{contextLine}</div>
      </div>

      {/* Sort bar */}
      <div className="px-[var(--m-page-px)] py-1.5 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        <button onClick={cycleSortMode} className="text-[11px] text-[var(--m-text-tertiary)]">
          Sort: {sortLabels[sortMode]}
        </button>
      </div>

      {/* Subfolders */}
      {subfolders.length > 0 && subfolders.map(sf => (
        <FolderRow
          key={sf._id}
          name={sf.name}
          docCount={0}
          variant={folderType}
          onTap={() => onOpenSubfolder(sf._id, sf.folderType, sf.name)}
        />
      ))}

      {/* Files */}
      {sortedDocs.length === 0 && subfolders.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">No documents in this folder</div>
      ) : (
        sortedDocs.map(doc => (
          <FileRow
            key={doc._id}
            fileName={doc.fileName}
            displayName={doc.displayName}
            fileType={doc.fileType}
            category={doc.category}
            fileSize={doc.fileSize}
            uploadedAt={doc.uploadedAt}
            onTap={() => onOpenViewer(doc._id)}
          />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into DocsContent**

Import and replace the folder placeholder:

```tsx
import FolderContents from './FolderContents';
```

```tsx
{baseScreen.screen === 'folder' && (
  <FolderContents
    clientId={baseScreen.clientId}
    clientName={baseScreen.clientName}
    projectId={baseScreen.projectId}
    projectName={baseScreen.projectName}
    folderRecordId={baseScreen.folderRecordId}
    folderTypeKey={baseScreen.folderTypeKey}
    folderName={baseScreen.folderName}
    folderLevel={baseScreen.folderLevel}
    onBack={pop}
    onOpenSubfolder={(folderRecordId, folderTypeKey, folderName) =>
      push({ screen: 'folder', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId: baseScreen.projectId, projectName: baseScreen.projectName, folderRecordId, folderTypeKey, folderName, folderLevel: baseScreen.folderLevel })
    }
    onOpenViewer={openViewer}
  />
)}
```

- [ ] **Step 3: Verify build and commit**

```bash
npx next build
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): add FolderContents with sort and subfolder support"
```

---

### Task 6: DocumentViewer shell with tab framework

**Files:**
- Create: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx`
- Modify: `src/app/(mobile)/m-docs/components/DocsContent.tsx`

- [ ] **Step 1: Create DocumentViewer**

Create `src/app/(mobile)/m-docs/components/DocumentViewer.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { X } from 'lucide-react';
import { Id } from '../../../../../convex/_generated/dataModel';

type ViewerTab = 'preview' | 'summary' | 'classification' | 'details' | 'intelligence' | 'notes';

const tabs: { key: ViewerTab; label: string }[] = [
  { key: 'preview', label: 'Preview' },
  { key: 'summary', label: 'Summary' },
  { key: 'classification', label: 'Classification' },
  { key: 'details', label: 'Details' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'notes', label: 'Notes' },
];

interface DocumentViewerProps {
  documentId: string;
  onClose: () => void;
}

export default function DocumentViewer({ documentId, onClose }: DocumentViewerProps) {
  const [activeTab, setActiveTab] = useState<ViewerTab>('preview');

  const doc = useQuery(api.documents.get, { id: documentId as Id<'documents'> });
  const fileUrl = useQuery(api.documents.getFileUrl, doc?.fileStorageId ? { storageId: doc.fileStorageId } : 'skip');
  const markAsOpened = useMutation(api.documents.markAsOpened);

  // Mark document as opened when viewer mounts
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    markAsOpened({ documentId: documentId as Id<'documents'> }).catch(() => {});
    return () => { document.body.style.overflow = ''; };
  }, [documentId, markAsOpened]);

  if (!doc) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--m-bg)] flex items-center justify-center">
        <span className="text-[13px] text-[var(--m-text-tertiary)]">Loading...</span>
      </div>
    );
  }

  const title = doc.displayName || doc.fileName;
  const subtitleParts = [doc.category, doc.clientName, doc.projectName].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-[var(--m-bg)] flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-[var(--m-page-px)] py-3 border-b border-[var(--m-border)] flex-shrink-0">
        <div className="flex-1 min-w-0 mr-3">
          <div className="text-[14px] font-semibold text-[var(--m-text-primary)] truncate">{title}</div>
          {subtitleParts.length > 0 && (
            <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">{subtitleParts.join(' · ')}</div>
          )}
        </div>
        <button onClick={onClose} className="p-1 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)] flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable tab bar */}
      <div className="flex overflow-x-auto scrollbar-hide border-b border-[var(--m-border)] flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-shrink-0 px-3 py-2 text-[12px] whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'text-[var(--m-text-primary)] font-medium border-b-2 border-[var(--m-accent-indicator)]'
                : 'text-[var(--m-text-tertiary)] border-b-2 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'preview' && (
          <div className="p-[var(--m-page-px)] text-center text-[12px] text-[var(--m-text-tertiary)]">PreviewTab — Task 7</div>
        )}
        {activeTab === 'summary' && (
          <div className="p-[var(--m-page-px)] text-center text-[12px] text-[var(--m-text-tertiary)]">SummaryTab — Task 8</div>
        )}
        {activeTab === 'classification' && (
          <div className="p-[var(--m-page-px)] text-center text-[12px] text-[var(--m-text-tertiary)]">ClassificationTab — Task 8</div>
        )}
        {activeTab === 'details' && (
          <div className="p-[var(--m-page-px)] text-center text-[12px] text-[var(--m-text-tertiary)]">DetailsTab — Task 7</div>
        )}
        {activeTab === 'intelligence' && (
          <div className="p-[var(--m-page-px)] text-center text-[12px] text-[var(--m-text-tertiary)]">IntelligenceTab — Task 9</div>
        )}
        {activeTab === 'notes' && (
          <div className="p-[var(--m-page-px)] text-center text-[12px] text-[var(--m-text-tertiary)]">NotesTab — Task 9</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into DocsContent**

Import and replace the viewer placeholder:

```tsx
import DocumentViewer from './DocumentViewer';
```

```tsx
{viewerScreen && (
  <DocumentViewer documentId={viewerScreen.documentId} onClose={closeViewer} />
)}
```

- [ ] **Step 3: Verify build and commit**

```bash
npx next build
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): add DocumentViewer shell with tab framework"
```

---

### Task 7: PreviewTab + DetailsTab

**Files:**
- Create: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/PreviewTab.tsx`
- Create: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/DetailsTab.tsx`
- Modify: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx`

- [ ] **Step 1: Create PreviewTab**

Create `src/app/(mobile)/m-docs/components/DocumentViewerTabs/PreviewTab.tsx`:

```tsx
import FileTypeBadge from '../shared/FileTypeBadge';

interface PreviewTabProps {
  fileUrl: string | null | undefined;
  fileType: string;
  fileName: string;
  fileSize: number;
}

function isImageType(fileType: string): boolean {
  return /image\/(jpeg|jpg|png|gif|webp|svg)/i.test(fileType);
}

function isPdfType(fileType: string): boolean {
  return fileType.toLowerCase().includes('pdf');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PreviewTab({ fileUrl, fileType, fileName, fileSize }: PreviewTabProps) {
  return (
    <div className="p-[var(--m-page-px)]">
      {/* Preview area */}
      <div className="w-full aspect-[0.707] bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-md overflow-hidden flex items-center justify-center">
        {!fileUrl ? (
          <span className="text-[12px] text-[var(--m-text-tertiary)]">Loading preview...</span>
        ) : isPdfType(fileType) ? (
          <iframe src={fileUrl} className="w-full h-full" title={fileName} />
        ) : isImageType(fileType) ? (
          <img src={fileUrl} alt={fileName} className="w-full h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <FileTypeBadge fileType={fileType} />
            <span className="text-[12px] text-[var(--m-text-tertiary)]">Preview not available</span>
            <span className="text-[10px] text-[var(--m-text-placeholder)]">{formatFileSize(fileSize)}</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {fileUrl && (
        <div className="flex gap-2 mt-3">
          <a
            href={fileUrl}
            download={fileName}
            className="flex-1 py-2.5 bg-black text-white text-[12px] font-medium text-center rounded-md active:opacity-80"
          >
            Download
          </a>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] text-[12px] font-medium text-center rounded-md active:opacity-80"
          >
            Open in browser
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create DetailsTab**

Create `src/app/(mobile)/m-docs/components/DocumentViewerTabs/DetailsTab.tsx`:

```tsx
interface DetailsTabProps {
  doc: {
    fileName: string;
    displayName?: string;
    documentCode?: string;
    fileSize: number;
    fileType: string;
    version?: string;
    uploaderInitials?: string;
    uploadedAt: string;
    lastOpenedAt?: string;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DetailRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start py-2 border-b border-[var(--m-border-subtle)]">
      <span className="text-[12px] text-[var(--m-text-tertiary)] flex-shrink-0">{label}</span>
      <span className="text-[13px] text-[var(--m-text-primary)] text-right ml-4 break-all">{value}</span>
    </div>
  );
}

export default function DetailsTab({ doc }: DetailsTabProps) {
  const simplifiedType = doc.fileType.split('/').pop()?.toUpperCase() || doc.fileType;

  return (
    <div className="px-[var(--m-page-px)] py-3">
      <DetailRow label="File name" value={doc.fileName} />
      {doc.displayName && doc.displayName !== doc.fileName && (
        <DetailRow label="Display name" value={doc.displayName} />
      )}
      <DetailRow label="Document code" value={doc.documentCode} />
      <DetailRow label="File size" value={formatFileSize(doc.fileSize)} />
      <DetailRow label="File type" value={simplifiedType} />
      <DetailRow label="Version" value={doc.version} />
      <DetailRow label="Uploaded by" value={doc.uploaderInitials} />
      <DetailRow label="Uploaded" value={formatDate(doc.uploadedAt)} />
      <DetailRow label="Last opened" value={doc.lastOpenedAt ? formatDate(doc.lastOpenedAt) : undefined} />
    </div>
  );
}
```

- [ ] **Step 3: Wire tabs into DocumentViewer**

Import both tab components in `DocumentViewer.tsx`:

```tsx
import PreviewTab from './DocumentViewerTabs/PreviewTab';
import DetailsTab from './DocumentViewerTabs/DetailsTab';
```

Replace the preview and details placeholders:

```tsx
{activeTab === 'preview' && (
  <PreviewTab fileUrl={fileUrl} fileType={doc.fileType} fileName={doc.fileName} fileSize={doc.fileSize} />
)}
{activeTab === 'details' && (
  <DetailsTab doc={doc} />
)}
```

- [ ] **Step 4: Verify build and commit**

```bash
npx next build
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): add PreviewTab and DetailsTab to document viewer"
```

---

### Task 8: SummaryTab + ClassificationTab

**Files:**
- Create: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/SummaryTab.tsx`
- Create: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/ClassificationTab.tsx`
- Modify: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx`

- [ ] **Step 1: Create SummaryTab**

Create `src/app/(mobile)/m-docs/components/DocumentViewerTabs/SummaryTab.tsx`:

```tsx
interface SummaryTabProps {
  doc: {
    summary?: string;
    documentAnalysis?: {
      executiveSummary?: string;
      detailedSummary?: string;
      keyDates?: string[];
      keyAmounts?: string[];
      keyTerms?: string[];
    };
  };
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="text-[12px] font-medium text-[var(--m-text-secondary)] mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="px-2 py-0.5 bg-[var(--m-bg-inset)] rounded text-[11px] text-[var(--m-text-secondary)]">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SummaryTab({ doc }: SummaryTabProps) {
  const analysis = doc.documentAnalysis;
  const hasContent = analysis?.executiveSummary || analysis?.detailedSummary || doc.summary;

  if (!hasContent) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Document not yet analyzed
      </div>
    );
  }

  return (
    <div className="px-[var(--m-page-px)] py-3">
      {(analysis?.executiveSummary || doc.summary) && (
        <div>
          <div className="text-[12px] font-medium text-[var(--m-text-secondary)] mb-1">Summary</div>
          <p className="text-[13px] text-[var(--m-text-primary)] leading-relaxed">
            {analysis?.executiveSummary || doc.summary}
          </p>
        </div>
      )}

      {analysis?.detailedSummary && (
        <div className="mt-4">
          <div className="text-[12px] font-medium text-[var(--m-text-secondary)] mb-1">Detailed Summary</div>
          <p className="text-[13px] text-[var(--m-text-primary)] leading-relaxed">{analysis.detailedSummary}</p>
        </div>
      )}

      <ChipList label="Key Dates" items={analysis?.keyDates ?? []} />
      <ChipList label="Key Amounts" items={analysis?.keyAmounts ?? []} />
      <ChipList label="Key Terms" items={analysis?.keyTerms ?? []} />
    </div>
  );
}
```

- [ ] **Step 2: Create ClassificationTab**

Create `src/app/(mobile)/m-docs/components/DocumentViewerTabs/ClassificationTab.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ClassificationTabProps {
  doc: {
    fileTypeDetected?: string;
    category?: string;
    confidence?: number;
    classificationReasoning?: string;
    documentAnalysis?: {
      documentCharacteristics?: {
        isFinancial?: boolean;
        isLegal?: boolean;
        isIdentity?: boolean;
        isReport?: boolean;
        isDesign?: boolean;
        isCorrespondence?: boolean;
        hasMultipleProjects?: boolean;
        isInternal?: boolean;
      };
    };
  };
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'bg-[#f0fdf4] text-[#166534]' : pct >= 60 ? 'bg-[#fefce8] text-[#a16207]' : 'bg-[#fef2f2] text-[#991b1b]';
  return <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${color}`}>{pct}%</span>;
}

const characteristicLabels: Record<string, string> = {
  isFinancial: 'Financial',
  isLegal: 'Legal',
  isIdentity: 'Identity',
  isReport: 'Report',
  isDesign: 'Design',
  isCorrespondence: 'Correspondence',
  hasMultipleProjects: 'Multi-project',
  isInternal: 'Internal',
};

export default function ClassificationTab({ doc }: ClassificationTabProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  const chars = doc.documentAnalysis?.documentCharacteristics;
  const activeChars = chars
    ? Object.entries(chars).filter(([, v]) => v === true).map(([k]) => characteristicLabels[k]).filter(Boolean)
    : [];

  return (
    <div className="px-[var(--m-page-px)] py-3">
      {/* Document Type */}
      {doc.fileTypeDetected && (
        <div className="py-2 border-b border-[var(--m-border-subtle)]">
          <div className="text-[12px] text-[var(--m-text-tertiary)] mb-1">Document Type</div>
          <span className="px-2 py-0.5 bg-[var(--m-bg-inset)] rounded text-[13px] font-medium text-[var(--m-text-primary)]">
            {doc.fileTypeDetected}
          </span>
        </div>
      )}

      {/* Category */}
      {doc.category && (
        <div className="py-2 border-b border-[var(--m-border-subtle)]">
          <div className="text-[12px] text-[var(--m-text-tertiary)] mb-1">Category</div>
          <span className="px-2 py-0.5 bg-[var(--m-bg-inset)] rounded text-[13px] font-medium text-[var(--m-text-primary)]">
            {doc.category}
          </span>
        </div>
      )}

      {/* Confidence */}
      {doc.confidence != null && (
        <div className="py-2 border-b border-[var(--m-border-subtle)]">
          <div className="text-[12px] text-[var(--m-text-tertiary)] mb-1">Confidence</div>
          <ConfidenceBadge confidence={doc.confidence} />
        </div>
      )}

      {/* Characteristics */}
      {activeChars.length > 0 && (
        <div className="py-2 border-b border-[var(--m-border-subtle)]">
          <div className="text-[12px] text-[var(--m-text-tertiary)] mb-1.5">Characteristics</div>
          <div className="flex flex-wrap gap-1.5">
            {activeChars.map(c => (
              <span key={c} className="px-2 py-0.5 bg-[var(--m-bg-inset)] rounded text-[11px] text-[var(--m-text-secondary)]">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Reasoning (collapsible) */}
      {doc.classificationReasoning && (
        <div className="py-2">
          <button onClick={() => setShowReasoning(!showReasoning)} className="flex items-center gap-1 text-[12px] text-[var(--m-text-secondary)]">
            Classification Reasoning
            {showReasoning ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showReasoning && (
            <p className="mt-1.5 text-[12px] text-[var(--m-text-secondary)] leading-relaxed">{doc.classificationReasoning}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire tabs into DocumentViewer**

Import both in `DocumentViewer.tsx`:

```tsx
import SummaryTab from './DocumentViewerTabs/SummaryTab';
import ClassificationTab from './DocumentViewerTabs/ClassificationTab';
```

Replace placeholders:

```tsx
{activeTab === 'summary' && <SummaryTab doc={doc} />}
{activeTab === 'classification' && <ClassificationTab doc={doc} />}
```

- [ ] **Step 4: Verify build and commit**

```bash
npx next build
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): add SummaryTab and ClassificationTab to viewer"
```

---

### Task 9: IntelligenceTab + NotesTab

**Files:**
- Create: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/IntelligenceTab.tsx`
- Create: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/NotesTab.tsx`
- Modify: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx`

- [ ] **Step 1: Create IntelligenceTab**

Create `src/app/(mobile)/m-docs/components/DocumentViewerTabs/IntelligenceTab.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';

interface IntelligenceTabProps {
  documentId: string;
}

export default function IntelligenceTab({ documentId }: IntelligenceTabProps) {
  const items = useQuery(api.documents.getDocumentIntelligence, { documentId: documentId as Id<'documents'> });

  const grouped = useMemo(() => {
    if (!items || items.length === 0) return null;
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const cat = item.category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [items]);

  if (!items) {
    return <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>;
  }

  if (!grouped) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center">
        <div className="text-[12px] text-[var(--m-text-tertiary)]">No intelligence extracted yet</div>
        <div className="text-[10px] text-[var(--m-text-placeholder)] mt-1">Run analysis from the desktop app</div>
      </div>
    );
  }

  return (
    <div className="py-1">
      {Array.from(grouped.entries()).map(([category, categoryItems]) => (
        <div key={category}>
          <div className="px-[var(--m-page-px)] py-1.5 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
            <span className="text-[12px] font-medium text-[var(--m-text-secondary)]">{category}</span>
          </div>
          {categoryItems.map(item => (
            <div key={item._id} className="px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)]">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--m-text-tertiary)]">{item.label}</span>
                {item.normalizationConfidence != null && (
                  <span className={`text-[9px] font-medium px-1.5 py-px rounded ${
                    item.normalizationConfidence >= 0.8 ? 'bg-[#f0fdf4] text-[#166534]' :
                    item.normalizationConfidence >= 0.6 ? 'bg-[#fefce8] text-[#a16207]' :
                    'bg-[#fef2f2] text-[#991b1b]'
                  }`}>{Math.round(item.normalizationConfidence * 100)}%</span>
                )}
              </div>
              <div className="text-[13px] text-[var(--m-text-primary)] mt-0.5">
                {typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create NotesTab**

Create `src/app/(mobile)/m-docs/components/DocumentViewerTabs/NotesTab.tsx`:

```tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';

interface NotesTabProps {
  documentId: string;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NotesTab({ documentId }: NotesTabProps) {
  const notes = useQuery(api.documentNotes.getByDocument, { documentId: documentId as Id<'documents'> });

  if (!notes) {
    return <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>;
  }

  if (notes.length === 0) {
    return <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">No notes yet</div>;
  }

  return (
    <div className="py-1">
      {notes.map(note => (
        <div key={note._id} className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-medium text-[var(--m-text-primary)]">
              {note.createdByName || note.createdByInitials || 'Unknown'}
            </span>
            <span className="text-[10px] text-[var(--m-text-tertiary)]">{formatDate(note.createdAt)}</span>
          </div>
          <p className="text-[13px] text-[var(--m-text-secondary)] leading-relaxed">{note.content}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire tabs into DocumentViewer**

Import both in `DocumentViewer.tsx`:

```tsx
import IntelligenceTab from './DocumentViewerTabs/IntelligenceTab';
import NotesTab from './DocumentViewerTabs/NotesTab';
```

Replace placeholders:

```tsx
{activeTab === 'intelligence' && <IntelligenceTab documentId={documentId} />}
{activeTab === 'notes' && <NotesTab documentId={documentId} />}
```

- [ ] **Step 4: Verify build and commit**

```bash
npx next build
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): add IntelligenceTab and NotesTab to viewer"
```

---

### Task 10: Final assembly, build verification, and push

**Files:**
- Review: all files in `src/app/(mobile)/m-docs/`

- [ ] **Step 1: Verify DocsContent has all screens wired**

Read `DocsContent.tsx` and confirm all 5 screen types render their real component (no placeholders remain).

- [ ] **Step 2: Verify DocumentViewer has all 6 tabs wired**

Read `DocumentViewer.tsx` and confirm all 6 tab content blocks render their real component (no placeholders remain).

- [ ] **Step 3: Full build verification**

```bash
npx next build
```

Expected: Build passes with no warnings related to mobile docs files.

- [ ] **Step 4: Visual verification**

```bash
npx next dev --turbopack
```

Open `http://localhost:3000/m-docs?mobile=true` in the browser. Verify:
- Scope toggle switches between Clients / Internal / Personal
- Client list shows with search
- Clicking a client shows folders + projects
- Clicking a project shows its folders
- Clicking a folder shows file list with sort
- Clicking a file opens full-screen viewer
- All 6 viewer tabs render content
- Close button dismisses viewer
- Back navigation works at every level

- [ ] **Step 5: Final commit and push**

```bash
git add src/app/\(mobile\)/m-docs/
git commit -m "feat(mobile): complete document library with 4-screen drill-down and 6-tab viewer"
git push origin mobile
```
