# Mobile Clients & Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/m-clients` mobile area with searchable client list, 9-tab client detail, 6-tab project detail, and document viewer integration.

**Architecture:** Single-route push/pop navigation state machine (same pattern as `DocsContent.tsx`). Client and project detail screens use a horizontally scrollable tab bar with full-page tab content. Doc tabs embed nested navigators for folder drill-down. All data from Convex reactive queries.

**Tech Stack:** Next.js 16, React, Convex (`useQuery`/`useMutation`), Tailwind CSS 4 with `--m-` design tokens, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md`

---

## File Structure

```
src/app/(mobile)/m-clients/
├── page.tsx                           ← shell wrapper
└── components/
    ├── ClientsContent.tsx             ← nav state machine (list → client → project)
    ├── ClientList.tsx                 ← searchable alphabetical client list
    ├── ClientDetail.tsx               ← header + 9-tab bar + tab content router
    ├── ProjectDetail.tsx              ← header + 6-tab bar + tab content router
    └── tabs/
        ├── ClientOverviewTab.tsx      ← summary cards with shortcuts
        ├── ClientProjectsTab.tsx      ← project list rows
        ├── ClientDocsTab.tsx          ← nested folder navigator (reuses m-docs components)
        ├── ClientIntelligenceTab.tsx   ← knowledge items list
        ├── ClientNotesTab.tsx         ← notes list + lightweight composer
        ├── ClientTasksTab.tsx         ← active/completed task list with toggle
        ├── ClientChecklistTab.tsx     ← checklist with progress bar + status cycling
        ├── ClientMeetingsTab.tsx      ← meeting summaries with accordion expand
        ├── ClientThreadsTab.tsx       ← flag threads with inline reply
        ├── ProjectOverviewTab.tsx     ← project summary cards
        ├── ProjectDocsTab.tsx         ← project-scoped nested folder navigator
        ├── ProjectTasksTab.tsx        ← project-scoped tasks
        ├── ProjectIntelligenceTab.tsx ← project-scoped knowledge items
        ├── ProjectChecklistTab.tsx    ← project-scoped checklist
        └── ProjectNotesTab.tsx        ← project-scoped notes
```

---

### Task 1: Page Shell + Navigation State Machine

**Files:**
- Create: `src/app/(mobile)/m-clients/page.tsx`
- Create: `src/app/(mobile)/m-clients/components/ClientsContent.tsx`

- [ ] **Step 1: Create the page shell**

```tsx
// src/app/(mobile)/m-clients/page.tsx
'use client';

import ClientsContent from './components/ClientsContent';

export default function MobileClientsPage() {
  return <ClientsContent />;
}
```

- [ ] **Step 2: Create the navigation state machine**

```tsx
// src/app/(mobile)/m-clients/components/ClientsContent.tsx
'use client';

import { useState, useCallback } from 'react';
import { useTabs } from '@/contexts/TabContext';
import ClientList from './ClientList';
import ClientDetail from './ClientDetail';
import ProjectDetail from './ProjectDetail';

export type NavScreen =
  | { screen: 'list' }
  | { screen: 'client'; clientId: string; clientName: string }
  | { screen: 'project'; clientId: string; clientName: string; projectId: string; projectName: string };

export default function ClientsContent() {
  const [navStack, setNavStack] = useState<NavScreen[]>([{ screen: 'list' }]);
  const { tabs, activeTabId } = useTabs();

  // Support deep-link from dashboard via tab params
  const activeTab = tabs.find(t => t.id === activeTabId);
  // TODO: on mount, if activeTab?.params?.clientId exists, auto-push client detail

  const push = useCallback((screen: NavScreen) => {
    setNavStack(prev => [...prev, screen]);
  }, []);

  const pop = useCallback(() => {
    setNavStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  const currentScreen = navStack[navStack.length - 1];

  return (
    <div className="min-h-[60vh]">
      {currentScreen.screen === 'list' && (
        <ClientList
          onSelectClient={(clientId, clientName) =>
            push({ screen: 'client', clientId, clientName })
          }
        />
      )}
      {currentScreen.screen === 'client' && (
        <ClientDetail
          clientId={currentScreen.clientId}
          clientName={currentScreen.clientName}
          onBack={pop}
          onSelectProject={(projectId, projectName) =>
            push({
              screen: 'project',
              clientId: currentScreen.clientId,
              clientName: currentScreen.clientName,
              projectId,
              projectName,
            })
          }
        />
      )}
      {currentScreen.screen === 'project' && (
        <ProjectDetail
          clientId={currentScreen.clientId}
          clientName={currentScreen.clientName}
          projectId={currentScreen.projectId}
          projectName={currentScreen.projectName}
          onBack={pop}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it builds**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds (ClientList, ClientDetail, ProjectDetail don't exist yet — create stubs)

Create stub files for the three missing components:

```tsx
// src/app/(mobile)/m-clients/components/ClientList.tsx
'use client';
export default function ClientList({ onSelectClient }: { onSelectClient: (id: string, name: string) => void }) {
  return <div className="px-[var(--m-page-px)] py-8 text-center text-[13px] text-[var(--m-text-tertiary)]">Client list loading...</div>;
}
```

```tsx
// src/app/(mobile)/m-clients/components/ClientDetail.tsx
'use client';
export default function ClientDetail({ clientId, clientName, onBack, onSelectProject }: {
  clientId: string; clientName: string; onBack: () => void;
  onSelectProject: (projectId: string, projectName: string) => void;
}) {
  return <div className="px-[var(--m-page-px)] py-8 text-center text-[13px] text-[var(--m-text-tertiary)]">{clientName} detail</div>;
}
```

```tsx
// src/app/(mobile)/m-clients/components/ProjectDetail.tsx
'use client';
export default function ProjectDetail({ clientId, clientName, projectId, projectName, onBack }: {
  clientId: string; clientName: string; projectId: string; projectName: string; onBack: () => void;
}) {
  return <div className="px-[var(--m-page-px)] py-8 text-center text-[13px] text-[var(--m-text-tertiary)]">{projectName} detail</div>;
}
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(mobile)/m-clients/"
git commit -m "feat(mobile): clients nav state machine + page shell"
```

---

### Task 2: Client List (Searchable)

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/ClientList.tsx`

- [ ] **Step 1: Implement searchable client list**

Replace the stub with the full implementation. Follow the exact pattern from `DocsList.tsx` client rows:

```tsx
// src/app/(mobile)/m-clients/components/ClientList.tsx
'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ChevronRight } from 'lucide-react';

interface ClientListProps {
  onSelectClient: (clientId: string, clientName: string) => void;
}

export default function ClientList({ onSelectClient }: ClientListProps) {
  const [query, setQuery] = useState('');

  const clients = useQuery(api.clients.list, {});
  const clientDocCounts = useQuery(api.documents.getClientDocumentCounts, {});
  const projects = useQuery(api.projects.list, {});

  const projectCountByClient = useMemo(() => {
    const map = new Map<string, number>();
    if (!projects) return map;
    for (const p of projects) {
      if (p.isDeleted) continue;
      for (const cr of p.clientRoles ?? []) {
        map.set(cr.clientId, (map.get(cr.clientId) ?? 0) + 1);
      }
    }
    return map;
  }, [projects]);

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = query.toLowerCase().trim();
    const list = clients.filter(c => !c.isDeleted);
    if (!q) return list.sort((a, b) => a.name.localeCompare(b.name));
    return list
      .filter(c => c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, query]);

  const isLoading = clients === undefined;

  return (
    <div>
      {/* Search */}
      <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <input
          type="text"
          placeholder="Search clients…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full bg-[var(--m-bg-inset)] text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] rounded-lg px-3 py-2 outline-none border border-[var(--m-border-subtle)] focus:border-[var(--m-accent-indicator)]"
          style={{ fontSize: '16px' }} // prevent iOS auto-zoom
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          Loading clients...
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          {query ? 'No clients match your search' : 'No clients yet'}
        </div>
      )}

      {/* Client rows */}
      {filtered.map(client => {
        const projCount = projectCountByClient.get(client._id) ?? 0;
        const docCount = clientDocCounts?.[client._id] ?? 0;
        const meta = [
          `${projCount} project${projCount !== 1 ? 's' : ''}`,
          `${docCount} doc${docCount !== 1 ? 's' : ''}`,
        ].join(' · ');

        return (
          <button
            key={client._id}
            onClick={() => onSelectClient(client._id, client.name)}
            className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">{client.name}</span>
                {client.type && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] flex-shrink-0">
                    {client.type}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">{meta}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add "src/app/(mobile)/m-clients/components/ClientList.tsx"
git commit -m "feat(mobile): searchable client list"
```

---

### Task 3: Client Detail Shell (Header + Tab Bar + Router)

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/ClientDetail.tsx`

- [ ] **Step 1: Implement tab bar and content router**

Replace the stub. This component owns the tab bar (9 horizontally scrollable pills) and routes to the active tab's content component. Tab components that don't exist yet get inline placeholders.

```tsx
// src/app/(mobile)/m-clients/components/ClientDetail.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ChevronLeft } from 'lucide-react';

// Import tab components (stubs initially, replaced in later tasks)
import ClientOverviewTab from './tabs/ClientOverviewTab';
import ClientProjectsTab from './tabs/ClientProjectsTab';
import ClientDocsTab from './tabs/ClientDocsTab';
import ClientIntelligenceTab from './tabs/ClientIntelligenceTab';
import ClientNotesTab from './tabs/ClientNotesTab';
import ClientTasksTab from './tabs/ClientTasksTab';
import ClientChecklistTab from './tabs/ClientChecklistTab';
import ClientMeetingsTab from './tabs/ClientMeetingsTab';
import ClientThreadsTab from './tabs/ClientThreadsTab';

const CLIENT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'projects', label: 'Projects' },
  { key: 'docs', label: 'Docs' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'threads', label: 'Threads' },
] as const;

type ClientTab = typeof CLIENT_TABS[number]['key'];

interface ClientDetailProps {
  clientId: string;
  clientName: string;
  onBack: () => void;
  onSelectProject: (projectId: string, projectName: string) => void;
}

export default function ClientDetail({ clientId, clientName, onBack, onSelectProject }: ClientDetailProps) {
  const [activeTab, setActiveTab] = useState<ClientTab>('overview');
  const tabBarRef = useRef<HTMLDivElement>(null);

  const client = useQuery(api.clients.get, { id: clientId as Id<'clients'> });

  // Auto-scroll the active tab pill into view
  useEffect(() => {
    if (!tabBarRef.current) return;
    const activeEl = tabBarRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTab]);

  const switchTab = (tab: ClientTab) => setActiveTab(tab);

  const statusBadge = client?.status ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] capitalize">
      {client.status}
    </span>
  ) : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1 flex-shrink-0">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">Clients</span>
        </button>
        <div className="flex items-center gap-2 min-w-0 ml-2">
          <span className="text-[14px] font-semibold text-[var(--m-text-primary)] truncate">
            {clientName}
          </span>
          {statusBadge}
        </div>
      </div>

      {/* Tab bar */}
      <div
        ref={tabBarRef}
        className="flex gap-1.5 overflow-x-auto px-[var(--m-page-px)] py-2 border-b border-[var(--m-border)] scrollbar-none"
      >
        {CLIENT_TABS.map(tab => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              data-active={active}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap border ${
                active
                  ? 'bg-black text-white border-black'
                  : 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] border-[var(--m-border)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && (
          <ClientOverviewTab clientId={clientId} onSwitchTab={switchTab} />
        )}
        {activeTab === 'projects' && (
          <ClientProjectsTab clientId={clientId} onSelectProject={onSelectProject} />
        )}
        {activeTab === 'docs' && (
          <ClientDocsTab clientId={clientId} clientName={clientName} />
        )}
        {activeTab === 'intelligence' && (
          <ClientIntelligenceTab clientId={clientId} />
        )}
        {activeTab === 'notes' && (
          <ClientNotesTab clientId={clientId} />
        )}
        {activeTab === 'tasks' && (
          <ClientTasksTab clientId={clientId} />
        )}
        {activeTab === 'checklist' && (
          <ClientChecklistTab clientId={clientId} />
        )}
        {activeTab === 'meetings' && (
          <ClientMeetingsTab clientId={clientId} />
        )}
        {activeTab === 'threads' && (
          <ClientThreadsTab clientId={clientId} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create stub files for all 9 tab components**

Each stub follows this pattern (adjust the component name and props):

```tsx
// src/app/(mobile)/m-clients/components/tabs/ClientOverviewTab.tsx
'use client';
export default function ClientOverviewTab({ clientId, onSwitchTab }: { clientId: string; onSwitchTab: (tab: string) => void }) {
  return <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Overview coming soon</div>;
}
```

Create stubs for: `ClientOverviewTab`, `ClientProjectsTab`, `ClientDocsTab`, `ClientIntelligenceTab`, `ClientNotesTab`, `ClientTasksTab`, `ClientChecklistTab`, `ClientMeetingsTab`, `ClientThreadsTab`.

Props per stub:
- `ClientOverviewTab`: `{ clientId: string; onSwitchTab: (tab: string) => void }`
- `ClientProjectsTab`: `{ clientId: string; onSelectProject: (projectId: string, projectName: string) => void }`
- `ClientDocsTab`: `{ clientId: string; clientName: string }`
- `ClientIntelligenceTab`: `{ clientId: string }`
- `ClientNotesTab`: `{ clientId: string }`
- `ClientTasksTab`: `{ clientId: string }`
- `ClientChecklistTab`: `{ clientId: string }`
- `ClientMeetingsTab`: `{ clientId: string }`
- `ClientThreadsTab`: `{ clientId: string }`

- [ ] **Step 3: Build and verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add "src/app/(mobile)/m-clients/components/"
git commit -m "feat(mobile): client detail shell with 9-tab bar + stubs"
```

---

### Task 4: Client Overview Tab

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/tabs/ClientOverviewTab.tsx`

- [ ] **Step 1: Implement the overview tab with summary cards**

This is the landing page. Each card shows a preview of another tab and taps through to it via `onSwitchTab`.

**Queries used:**
- `api.clients.get({ id })` — client details (email, phone, type, status)
- `api.clients.getStats({ clientId })` — `{ totalProjects, activeProjects, totalDocuments, lastActivity }`
- `api.tasks.getByClient({ clientId })` — user's tasks (take first 3 active)
- `api.flags.getOpenCountByClient({ clientId })` — open flag count
- `api.knowledgeLibrary.getClientLevelChecklist({ clientId })` — checklist items for completion ratio
- `api.contacts.getByClient({ clientId })` — contacts list

Build a scrollable vertical stack of `SummaryCard` sections. Each section: header row with title + count + chevron, then 1-3 preview items below. Tapping the header calls `onSwitchTab(tabKey)`.

Key UI patterns:
- Client info card at top: name, type badge, status badge, tappable email (`mailto:`) and phone (`tel:`)
- Task card: show up to 3 active tasks with title + due date
- Flags card: open count + first 2 flag titles
- Recent docs card: just the count (link to Docs tab)
- Intelligence card: count of knowledge items (link to Intelligence tab)
- Checklist card: progress bar + `N/M fulfilled`
- Contacts card: list of contacts with name + role, inline (no separate tab)

- [ ] **Step 2: Build and verify**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/ClientOverviewTab.tsx"
git commit -m "feat(mobile): client overview tab with summary cards"
```

---

### Task 5: Client Projects Tab

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/tabs/ClientProjectsTab.tsx`

- [ ] **Step 1: Implement project list**

**Query:** `api.projects.getByClient({ clientId })` — returns array of projects where client is in `clientRoles`.

Each row: project name, status badge (active/completed/on-hold), shortcode badge if present. Subtitle: last activity date. Tap → `onSelectProject(projectId, projectName)`.

Follow the same row styling as ClientList (gap-2.5, py-3, border-b, active:bg-subtle, ChevronRight).

Filter out deleted projects (`p.isDeleted`). Sort by status (active first), then by name.

- [ ] **Step 2: Build and verify, commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/ClientProjectsTab.tsx"
git commit -m "feat(mobile): client projects tab"
```

---

### Task 6: Client Docs Tab (Nested Navigator)

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/tabs/ClientDocsTab.tsx`

- [ ] **Step 1: Implement nested doc navigator**

This tab embeds its own push/pop navigation for folder drill-down, reusing components from `m-docs`. The parent tab bar stays visible throughout.

Internal nav states:
- `folders` — shows client-level folder list (reuses pattern from `ClientDocDetail.tsx`)
- `folderContents` — shows files in a folder (reuses `FolderContents` component)
- `viewer` — shows `DocumentViewer` component

Import and reuse:
- `FolderRow` from `../../m-docs/components/shared/FolderRow`
- `FolderContents` from `../../m-docs/components/FolderContents`
- `DocumentViewer` from `../../m-docs/components/DocumentViewer`

**Queries:**
- `api.folderStructure.getAllFoldersForClient({ clientId })` — folder topology
- `api.documents.getFolderCounts({ clientId })` — doc counts per folder

The folder list renders client-level folders with counts. Tapping a folder pushes `folderContents` state. Inside `FolderContents`, tapping a file calls the `onOpenViewer` prop which pushes the `viewer` state. The viewer's `onClose` pops back.

- [ ] **Step 2: Build and verify, commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/ClientDocsTab.tsx"
git commit -m "feat(mobile): client docs tab with nested folder navigator"
```

---

### Task 7: Client Intelligence Tab

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/tabs/ClientIntelligenceTab.tsx`

- [ ] **Step 1: Implement knowledge items list**

**Query:** `api.knowledgeLibrary.getKnowledgeItemsByClient({ clientId })` — returns array of knowledge items.

Display as a flat list grouped by category (if items have a category field). Per item: key/title in bold, value below, source document name in tertiary text if available. Read-only.

If the list is empty, show: "No intelligence items yet".

- [ ] **Step 2: Build and verify, commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/ClientIntelligenceTab.tsx"
git commit -m "feat(mobile): client intelligence tab"
```

---

### Task 8: Client Notes Tab

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/tabs/ClientNotesTab.tsx`

- [ ] **Step 1: Implement notes list + lightweight composer**

**Queries:**
- `api.notes.getByClient({ clientId })` — returns array of notes with title, content (rich-text JSON), createdAt, etc.
- `api.notes.create({ clientId, title, content })` — mutation for new notes

Display: list of notes sorted by createdAt descending. Per note: title in bold, first ~80 chars of plaintext content preview, date.

Composer: "Add Note" button at top toggles open a card with:
- Title input (text, required, 16px font for iOS)
- Body textarea (plain text, 16px font for iOS)
- Submit button

On submit, call `notes.create` with `{ clientId, title, content: JSON.stringify([{ type: 'paragraph', children: [{ text: body }] }]) }` to match the rich-text schema with a minimal plain-text document.

- [ ] **Step 2: Build and verify, commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/ClientNotesTab.tsx"
git commit -m "feat(mobile): client notes tab with composer"
```

---

### Task 9: Client Tasks Tab

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/tabs/ClientTasksTab.tsx`

- [ ] **Step 1: Implement task list with active/completed sections**

**Query:** `api.tasks.getByClient({ clientId })` — returns current user's tasks for this client.

Split into two sections:
- **Active**: tasks where `status !== 'completed'`, sorted by `dueDate` ascending (soonest first, null dates last)
- **Completed**: tasks where `status === 'completed'`, collapsed by default (tap header to expand), sorted by `completedAt` descending

Per task row: title, due date badge (color-coded: overdue = red, due today = amber, future = gray), status indicator.

Toggle: tap the task row to mark complete via `api.tasks.update({ id, status: 'completed' })` or incomplete via `api.tasks.update({ id, status: 'todo' })`. Verify the exact mutation name/args during implementation.

- [ ] **Step 2: Build and verify, commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/ClientTasksTab.tsx"
git commit -m "feat(mobile): client tasks tab with toggle"
```

---

### Task 10: Client Checklist Tab

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/tabs/ClientChecklistTab.tsx`

- [ ] **Step 1: Implement checklist with progress bar + status cycling**

**Queries:**
- `api.knowledgeLibrary.getClientLevelChecklist({ clientId })` — client-only checklist items, each with `status` field (`missing` | `pending_review` | `fulfilled`), `linkedDocumentCount`, `primaryDocument`.
- `api.knowledgeLibrary.updateItemStatus({ checklistItemId, status })` — mutation to cycle status.

Progress bar at top: count items with `status === 'fulfilled'` vs total. Show percentage + `N/M fulfilled`.

Progress bar visual: a simple `div` with width percentage, green fill on gray track, same pattern as `--m-` tokens.

Items grouped by `category` field (if present). Per item:
- Name
- Status pill: `missing` (red), `pending_review` (amber), `fulfilled` (green)
- Linked document name (tertiary text) if `primaryDocument` exists
- Tap the status pill → cycle: `missing` → `pending_review` → `fulfilled` → `missing`

- [ ] **Step 2: Build and verify, commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/ClientChecklistTab.tsx"
git commit -m "feat(mobile): client checklist tab with status cycling"
```

---

### Task 11: Client Meetings Tab

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/tabs/ClientMeetingsTab.tsx`

- [ ] **Step 1: Implement meeting summaries with accordion expand**

**Query:** `api.meetings.getByClient({ clientId })` — returns array of meetings with title, meetingDate, attendees[], summary, keyPoints[], decisions[], actionItems[].

List sorted by `meetingDate` descending (newest first). Per meeting row (collapsed):
- Title (bold)
- Date (formatted as `DD MMM YYYY`) + attendee count
- Summary preview (first ~80 chars, truncated)

Tap to expand (accordion, managed via `expandedId` state):
- Full summary text
- Key points (bulleted list)
- Decisions (bulleted list)
- Action items (bulleted list with assignee + status)

Read-only — no create/edit.

- [ ] **Step 2: Build and verify, commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/ClientMeetingsTab.tsx"
git commit -m "feat(mobile): client meetings tab with accordion expand"
```

---

### Task 12: Client Threads Tab

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/tabs/ClientThreadsTab.tsx`

- [ ] **Step 1: Implement flag threads with inline reply**

**Queries:**
- `api.flags.getByClient({ clientId })` — returns array of flags (note, status, priority, createdAt)
- `api.flags.getThread({ flagId })` — returns array of thread entries for an expanded flag
- `api.flags.reply({ flagId, content })` — mutation to add a comment

List of flags sorted by createdAt descending. Per flag row (collapsed):
- Flag note/title (bold, truncate to 1 line)
- Status badge: `open` (amber) / `resolved` (green)
- Created date

Tap to expand (accordion via `expandedFlagId` state):
- Full flag note
- Thread entries list: each entry shows content, entry type badge (message/activity), date
- Reply input at bottom: text input + "Reply" button
- On submit: call `flags.reply({ flagId, content: replyText })`
- Clear input on success, thread auto-refreshes via Convex reactivity

- [ ] **Step 2: Build and verify, commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/ClientThreadsTab.tsx"
git commit -m "feat(mobile): client threads tab with inline reply"
```

---

### Task 13: Project Detail Shell (Header + Tab Bar)

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/ProjectDetail.tsx`

- [ ] **Step 1: Implement project detail with 6-tab bar**

Same pattern as `ClientDetail.tsx` but with 6 tabs: Overview, Docs, Tasks, Intelligence, Checklist, Notes.

Header: back button shows client name (← `clientName`), right side shows project name + status badge.

Create stub tab components for all 6 project tabs in `tabs/` directory:
- `ProjectOverviewTab`: `{ projectId: string; clientId: string; onSwitchTab: (tab: string) => void }`
- `ProjectDocsTab`: `{ projectId: string; clientId: string; clientName: string }`
- `ProjectTasksTab`: `{ projectId: string }`
- `ProjectIntelligenceTab`: `{ projectId: string }`
- `ProjectChecklistTab`: `{ projectId: string }`
- `ProjectNotesTab`: `{ projectId: string }`

**Query:** `api.projects.get({ id: projectId })` for status badge in header.

- [ ] **Step 2: Build and verify, commit**

```bash
git add "src/app/(mobile)/m-clients/components/ProjectDetail.tsx" "src/app/(mobile)/m-clients/components/tabs/Project*.tsx"
git commit -m "feat(mobile): project detail shell with 6-tab bar + stubs"
```

---

### Task 14: Project Tab Implementations

**Files:**
- Modify: all 6 `ProjectXxxTab.tsx` files

- [ ] **Step 1: ProjectOverviewTab**

Same card-stack pattern as ClientOverviewTab but project-scoped. Queries: `api.projects.get`, `api.projects.getStats`, `api.tasks.getActiveCountByProject`. Show: project name, status, shortcode, loan amount, doc count card, task count card, checklist progress card.

- [ ] **Step 2: ProjectDocsTab**

Same nested-navigator pattern as ClientDocsTab, but shows project-level folders only. Folder topology: `api.folderStructure.getAllFoldersForClient({ clientId })` → filter `projectFolders` for matching `projectId`. Folder contents: `api.documents.getByFolder({ clientId, projectId, folderType, level: 'project' })`. Reuse `ProjectFolderList.tsx` pattern from m-docs.

- [ ] **Step 3: ProjectTasksTab**

Same as ClientTasksTab but uses `api.tasks.getByProject({ projectId })`.

- [ ] **Step 4: ProjectIntelligenceTab**

Same as ClientIntelligenceTab but uses `api.knowledgeLibrary.getKnowledgeItemsByProject({ projectId })`.

- [ ] **Step 5: ProjectChecklistTab**

Same as ClientChecklistTab but uses `api.knowledgeLibrary.getChecklistByProject({ projectId })`.

- [ ] **Step 6: ProjectNotesTab**

Same as ClientNotesTab but uses `api.notes.getByProject({ projectId })` and `api.notes.create({ projectId, title, content })`.

- [ ] **Step 7: Build and verify all**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add "src/app/(mobile)/m-clients/components/tabs/Project*.tsx"
git commit -m "feat(mobile): all 6 project tab implementations"
```

---

### Task 15: Deep Link from Dashboard + Final Build

**Files:**
- Modify: `src/app/(mobile)/m-clients/components/ClientsContent.tsx`
- Modify: `src/app/(mobile)/m-dashboard/components/RecentsSection.tsx` (if needed)

- [ ] **Step 1: Add deep-link support to ClientsContent**

On mount, read `activeTab?.params?.clientId`. If present, auto-push the client detail screen. This allows the dashboard recents section to link directly to a client.

```tsx
// Inside ClientsContent, after state declarations:
useEffect(() => {
  const paramClientId = activeTab?.params?.clientId;
  const paramClientName = activeTab?.params?.clientName;
  if (paramClientId && paramClientName && navStack.length === 1 && navStack[0].screen === 'list') {
    push({ screen: 'client', clientId: paramClientId, clientName: paramClientName });
  }
}, [activeTab?.params?.clientId]);
```

- [ ] **Step 2: Run full build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with zero errors/warnings

- [ ] **Step 3: Commit and push**

```bash
git add -A
git commit -m "feat(mobile): deep-link support for client pages from dashboard"
git push origin mobile
```

---

## Task Summary

| Task | Component | Description | Dependencies |
|------|-----------|-------------|--------------|
| 1 | Shell + NavMachine | Page, ClientsContent, stubs | None |
| 2 | ClientList | Searchable client list | Task 1 |
| 3 | ClientDetail | Header + 9-tab bar + routing | Task 1 |
| 4 | ClientOverviewTab | Summary cards with shortcuts | Task 3 |
| 5 | ClientProjectsTab | Project list rows | Task 3 |
| 6 | ClientDocsTab | Nested folder navigator | Task 3 |
| 7 | ClientIntelligenceTab | Knowledge items list | Task 3 |
| 8 | ClientNotesTab | Notes list + composer | Task 3 |
| 9 | ClientTasksTab | Task list with toggle | Task 3 |
| 10 | ClientChecklistTab | Checklist with progress | Task 3 |
| 11 | ClientMeetingsTab | Meeting summaries accordion | Task 3 |
| 12 | ClientThreadsTab | Flag threads + reply | Task 3 |
| 13 | ProjectDetail | Header + 6-tab bar | Task 1 |
| 14 | Project Tabs (all 6) | Project-scoped tab impls | Task 13 |
| 15 | Deep Link + Final | Dashboard integration | Tasks 1-14 |

**Parallelization:** Tasks 4-12 are independent of each other (all depend on Task 3 only). Tasks 13-14 are independent of Tasks 4-12. Maximum parallelism: after Task 3 is done, Tasks 4-14 can all run in parallel.
