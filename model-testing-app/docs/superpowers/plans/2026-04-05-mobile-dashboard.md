# Mobile Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional mobile dashboard with greeting, quick actions, up-next card, notifications, and segmented recents — all powered by real Convex data.

**Architecture:** Single `DashboardContent` client component orchestrates all Convex `useQuery` hooks in parallel. Six presentational sub-components in a local `components/` directory. No shared components created — everything is dashboard-local until a second consumer exists.

**Tech Stack:** Next.js 16, React 19, Convex (useQuery), Clerk (useUser), Tailwind CSS 4, Lucide React icons. Mobile design tokens from `MOBILE_DESIGN_SYSTEM.md`.

**Design Spec:** `docs/superpowers/specs/2026-04-05-mobile-dashboard-design.md`

---

### Task 1: Scaffold dashboard structure

**Files:**
- Modify: `src/app/(mobile)/m-dashboard/page.tsx`
- Create: `src/app/(mobile)/m-dashboard/components/DashboardContent.tsx`

- [ ] **Step 1: Create the components directory**

```bash
mkdir -p src/app/\(mobile\)/m-dashboard/components
```

- [ ] **Step 2: Create DashboardContent client component shell**

Create `src/app/(mobile)/m-dashboard/components/DashboardContent.tsx`:

```tsx
'use client';

import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';

export default function DashboardContent() {
  const { user } = useUser();
  const firstName = user?.firstName || 'there';

  // All queries fire in parallel
  const taskMetrics = useQuery(api.tasks.getMetrics, {});
  const tasks = useQuery(api.tasks.getByUser, {});
  const nextReminder = useQuery(api.reminders.getUpcoming, { limit: 1 });
  const nextEvent = useQuery(api.events.getNextEvent, {});
  const notifications = useQuery(api.notifications.getRecent, { limit: 3, includeRead: false });
  const unreadCount = useQuery(api.notifications.getUnreadCount, {});
  const projects = useQuery(api.projects.list, {});
  const clients = useQuery(api.clients.list, {});
  const recentDocs = useQuery(api.documents.getRecent, { limit: 3 });

  return (
    <div>
      <div className="px-[var(--m-page-px)] pt-5 pb-1.5">
        <h1 className="text-[17px] font-medium text-[var(--m-text-primary)] tracking-[-0.01em]">
          Hello, {firstName}
        </h1>
        <p className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">
          Loading...
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update page.tsx to import DashboardContent**

Replace `src/app/(mobile)/m-dashboard/page.tsx`:

```tsx
import DashboardContent from './components/DashboardContent';

export default function MobileDashboard() {
  return <DashboardContent />;
}
```

- [ ] **Step 4: Verify build**

```bash
npx next build
```

Expected: Build passes, `/m-dashboard` route listed.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(mobile\)/m-dashboard/
git commit -m "feat(mobile): scaffold dashboard with Convex queries"
```

---

### Task 2: DashboardGreeting component

**Files:**
- Create: `src/app/(mobile)/m-dashboard/components/DashboardGreeting.tsx`
- Modify: `src/app/(mobile)/m-dashboard/components/DashboardContent.tsx`

- [ ] **Step 1: Create DashboardGreeting**

Create `src/app/(mobile)/m-dashboard/components/DashboardGreeting.tsx`:

```tsx
interface DashboardGreetingProps {
  firstName: string;
  overdueCount: number | undefined;
  unreadCount: number | undefined;
}

export default function DashboardGreeting({ firstName, overdueCount, unreadCount }: DashboardGreetingProps) {
  const parts: string[] = [];
  if (overdueCount && overdueCount > 0) {
    parts.push(`${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''}`);
  }
  if (unreadCount && unreadCount > 0) {
    parts.push(`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`);
  }

  const subtitle = parts.length > 0 ? parts.join(' · ') : 'All caught up';

  return (
    <div className="px-[var(--m-page-px)] pt-5 pb-1.5">
      <h1 className="text-[17px] font-medium text-[var(--m-text-primary)] tracking-[-0.01em]">
        Hello, {firstName}
      </h1>
      <p className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">
        {subtitle}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Wire into DashboardContent**

In `DashboardContent.tsx`, replace the inline greeting JSX with:

```tsx
import DashboardGreeting from './DashboardGreeting';
```

Then compute the overdue count and render:

```tsx
// Compute overdue task count
const overdueCount = tasks
  ? tasks.filter(t =>
      t.status !== 'completed' && t.status !== 'cancelled' &&
      t.dueDate && new Date(t.dueDate) < new Date()
    ).length
  : undefined;
```

Replace the greeting div in the return with:

```tsx
<DashboardGreeting
  firstName={firstName}
  overdueCount={overdueCount}
  unreadCount={unreadCount ?? undefined}
/>
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-dashboard/components/
git commit -m "feat(mobile): add dashboard greeting with alert summary"
```

---

### Task 3: QuickActions component

**Files:**
- Create: `src/app/(mobile)/m-dashboard/components/QuickActions.tsx`
- Modify: `src/app/(mobile)/m-dashboard/components/DashboardContent.tsx`

- [ ] **Step 1: Create QuickActions**

Create `src/app/(mobile)/m-dashboard/components/QuickActions.tsx`:

```tsx
import Link from 'next/link';
import { Pencil, CheckSquare, Upload, UserPlus } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';

const actions: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/m-notes', label: 'New Note', icon: Pencil },
  { href: '/m-tasks', label: 'New Task', icon: CheckSquare },
  { href: '/m-docs', label: 'Upload', icon: Upload },
  { href: '/m-contacts', label: 'New Contact', icon: UserPlus },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-2 px-[var(--m-page-px)] pb-4">
      {actions.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--m-bg-subtle)] border border-[var(--m-border-subtle)] rounded-lg active:bg-[var(--m-bg-inset)]"
        >
          <div className="w-7 h-7 rounded-[7px] bg-[var(--m-bg-inset)] flex items-center justify-center flex-shrink-0">
            <Icon className="w-3.5 h-3.5 text-[var(--m-text-secondary)]" />
          </div>
          <span className="text-[12px] font-medium text-[var(--m-text-primary)]">{label}</span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add to DashboardContent**

Import and render below the greeting:

```tsx
import QuickActions from './QuickActions';
```

```tsx
<DashboardGreeting ... />
<QuickActions />
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-dashboard/components/
git commit -m "feat(mobile): add quick action buttons grid"
```

---

### Task 4: UpNextCard component

**Files:**
- Create: `src/app/(mobile)/m-dashboard/components/UpNextCard.tsx`
- Modify: `src/app/(mobile)/m-dashboard/components/DashboardContent.tsx`

- [ ] **Step 1: Create UpNextCard**

Create `src/app/(mobile)/m-dashboard/components/UpNextCard.tsx`:

```tsx
import Link from 'next/link';

interface UpNextItem {
  type: 'task' | 'reminder' | 'event';
  title: string;
  context: string; // e.g. client name
  dueDate: Date;
  href: string;
}

interface UpNextCardProps {
  item: UpNextItem | null;
}

function getUrgency(dueDate: Date): 'overdue' | 'today' | 'future' {
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) return 'overdue';
  if (diffHours < 24) return 'today';
  return 'future';
}

function formatRelativeTime(dueDate: Date): string {
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);
  const minutes = Math.floor(absDiffMs / 60000);
  const hours = Math.floor(absDiffMs / 3600000);
  const days = Math.floor(absDiffMs / 86400000);

  if (days > 0) {
    const label = `${days}d`;
    return diffMs < 0 ? `Due ${label} ago` : `In ${label}`;
  }
  if (hours > 0) {
    const label = `${hours}h`;
    return diffMs < 0 ? `Due ${label} ago` : `In ${label}`;
  }
  const label = `${Math.max(1, minutes)}m`;
  return diffMs < 0 ? `Due ${label} ago` : `In ${label}`;
}

const urgencyStyles = {
  overdue: {
    card: 'bg-[#fef2f2] border border-[#fecaca]',
    label: 'text-[#991b1b]',
    subtitle: 'text-[#92400e]',
    badge: 'bg-[#fecaca] text-[#991b1b]',
    badgeText: 'OVERDUE',
  },
  today: {
    card: 'bg-[#fefce8] border border-[#fef08a]',
    label: 'text-[#a16207]',
    subtitle: 'text-[#92400e]',
    badge: 'bg-[#fef08a] text-[#a16207]',
    badgeText: 'DUE TODAY',
  },
  future: {
    card: 'bg-[var(--m-bg-subtle)] border border-[var(--m-border)]',
    label: 'text-[var(--m-text-tertiary)]',
    subtitle: 'text-[var(--m-text-tertiary)]',
    badge: 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]',
    badgeText: 'UPCOMING',
  },
};

export default function UpNextCard({ item }: UpNextCardProps) {
  if (!item) return null;

  const urgency = getUrgency(item.dueDate);
  const style = urgencyStyles[urgency];
  const relativeTime = formatRelativeTime(item.dueDate);

  return (
    <Link href={item.href} className="block mx-[var(--m-page-px)] mb-4">
      <div className={`px-3.5 py-3 rounded-lg ${style.card}`}>
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className={`text-[9px] uppercase tracking-[0.5px] font-semibold mb-1 ${style.label}`}>
              Up Next
            </div>
            <div className="text-[12px] font-medium text-[var(--m-text-primary)] truncate">
              {item.title}
            </div>
            <div className={`text-[10px] mt-0.5 ${style.subtitle}`}>
              {item.context} · {relativeTime}
            </div>
          </div>
          <div className={`text-[9px] font-semibold px-2 py-0.5 rounded flex-shrink-0 ml-3 mt-3 ${style.badge}`}>
            {style.badgeText}
          </div>
        </div>
      </div>
    </Link>
  );
}

export type { UpNextItem };
```

- [ ] **Step 2: Add Up Next resolution logic to DashboardContent**

In `DashboardContent.tsx`, add the import and resolution logic:

```tsx
import UpNextCard, { type UpNextItem } from './UpNextCard';
```

Add this function inside the component, after the queries:

```tsx
// Resolve the single most urgent "up next" item
const resolveUpNext = (): UpNextItem | null => {
  const candidates: UpNextItem[] = [];
  const clientMap = new Map(clients?.map(c => [c._id, c.name]) ?? []);

  // Most urgent active task with a due date
  if (tasks) {
    const activeTasks = tasks
      .filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.dueDate)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
    const top = activeTasks[0];
    if (top && top.dueDate) {
      candidates.push({
        type: 'task',
        title: top.title,
        context: (top.clientId && clientMap.get(top.clientId)) || 'No client',
        dueDate: new Date(top.dueDate),
        href: '/m-tasks',
      });
    }
  }

  // Most urgent reminder
  if (nextReminder && nextReminder.length > 0) {
    const r = nextReminder[0];
    candidates.push({
      type: 'reminder',
      title: r.title,
      context: (r.clientId && clientMap.get(r.clientId)) || 'Reminder',
      dueDate: new Date(r.scheduledFor),
      href: '/m-tasks',
    });
  }

  // Next event
  if (nextEvent) {
    candidates.push({
      type: 'event',
      title: nextEvent.title,
      context: nextEvent.location || 'No location',
      dueDate: new Date(nextEvent.startTime),
      href: '/m-tasks',
    });
  }

  if (candidates.length === 0) return null;

  // Sort: most overdue first, then soonest upcoming
  const now = Date.now();
  candidates.sort((a, b) => {
    const aOverdue = a.dueDate.getTime() < now;
    const bOverdue = b.dueDate.getTime() < now;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  return candidates[0];
};

const upNextItem = resolveUpNext();
```

Render below QuickActions:

```tsx
<QuickActions />
<UpNextCard item={upNextItem} />
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-dashboard/components/
git commit -m "feat(mobile): add Up Next card with urgency styling"
```

---

### Task 5: NotificationsSection component

**Files:**
- Create: `src/app/(mobile)/m-dashboard/components/NotificationsSection.tsx`
- Modify: `src/app/(mobile)/m-dashboard/components/DashboardContent.tsx`

- [ ] **Step 1: Create NotificationsSection**

Create `src/app/(mobile)/m-dashboard/components/NotificationsSection.tsx`:

```tsx
interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  isRead?: boolean;
}

interface NotificationsSectionProps {
  notifications: Notification[] | undefined;
  unreadCount: number | undefined;
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function isUrgentType(type: string): boolean {
  return type === 'task' || type === 'reminder' || type === 'flag';
}

export default function NotificationsSection({ notifications, unreadCount }: NotificationsSectionProps) {
  const count = unreadCount ?? 0;

  return (
    <div className="border-t border-[var(--m-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2 bg-[var(--m-bg-subtle)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.5px] font-medium text-[var(--m-text-tertiary)]">
            Notifications
          </span>
          {count > 0 && (
            <span className="bg-[var(--m-error)] text-white text-[9px] font-semibold px-1.5 py-px rounded-full leading-none">
              {count}
            </span>
          )}
        </div>
        <button className="text-[10px] text-[var(--m-accent-indicator)]">View all →</button>
      </div>

      {/* Items or empty state */}
      {!notifications || notifications.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center">
          <span className="text-[11px] text-[var(--m-text-tertiary)]">No new notifications</span>
        </div>
      ) : (
        notifications.map((n) => (
          <div
            key={n._id}
            className="flex items-start gap-2.5 px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
          >
            <div
              className={`w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0 ${
                isUrgentType(n.type) ? 'bg-[var(--m-error)]' : 'bg-[var(--m-accent-indicator)]'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[var(--m-text-primary)] leading-snug">{n.title}</div>
              <div className="text-[10px] text-[var(--m-text-tertiary)] mt-0.5">
                {formatTimestamp(n.createdAt)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add to DashboardContent**

Import and render below UpNextCard:

```tsx
import NotificationsSection from './NotificationsSection';
```

```tsx
<UpNextCard item={upNextItem} />
<NotificationsSection notifications={notifications} unreadCount={unreadCount} />
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-dashboard/components/
git commit -m "feat(mobile): add notifications section with urgency dots"
```

---

### Task 6: RecentsSection component

**Files:**
- Create: `src/app/(mobile)/m-dashboard/components/RecentsSection.tsx`
- Modify: `src/app/(mobile)/m-dashboard/components/DashboardContent.tsx`

- [ ] **Step 1: Create RecentsSection**

Create `src/app/(mobile)/m-dashboard/components/RecentsSection.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

type TabKey = 'projects' | 'clients' | 'docs';

interface Project {
  _id: string;
  name: string;
  clientRoles: { clientId: string; role: string }[];
  status?: string;
}

interface Client {
  _id: string;
  name: string;
  lastAccessedAt?: string;
}

interface Document {
  _id: string;
  fileName: string;
  displayName?: string;
  clientName?: string;
  category?: string;
  fileType?: string;
  uploadedAt: string;
}

interface RecentsSectionProps {
  projects: Project[] | undefined;
  clients: Client[] | undefined;
  documents: Document[] | undefined;
  // Lookup maps for resolving names
  clientMap: Map<string, string>;
  taskCountByProject: Map<string, number>;
  projectCountByClient: Map<string, number>;
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'clients', label: 'Clients' },
  { key: 'docs', label: 'Docs' },
];

function formatRelativeDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function RecentRow({ title, subtitle, href }: { title: string; subtitle: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-[var(--m-text-primary)] truncate">{title}</div>
        <div className="text-[10px] text-[var(--m-text-tertiary)] mt-0.5 truncate">{subtitle}</div>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-placeholder)] flex-shrink-0 ml-2" />
    </Link>
  );
}

export default function RecentsSection({
  projects,
  clients,
  documents,
  clientMap,
  taskCountByProject,
  projectCountByClient,
}: RecentsSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('projects');

  const recentProjects = (projects ?? []).slice(0, 3);
  const recentClients = (clients ?? []).slice(0, 3);
  const recentDocs = (documents ?? []).slice(0, 3);

  const viewAllLinks: Record<TabKey, { href: string; label: string }> = {
    projects: { href: '/m-clients', label: 'View all projects' },
    clients: { href: '/m-clients', label: 'View all clients' },
    docs: { href: '/m-docs', label: 'View all documents' },
  };

  return (
    <div className="border-t border-[var(--m-border)] mt-1">
      {/* Segmented tab bar */}
      <div className="flex bg-[var(--m-bg-subtle)]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 text-center py-2.5 text-[11px] transition-colors ${
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
      <div>
        {activeTab === 'projects' && (
          <>
            {recentProjects.length === 0 ? (
              <div className="px-[var(--m-page-px)] py-6 text-center text-[11px] text-[var(--m-text-tertiary)]">
                No projects yet
              </div>
            ) : (
              recentProjects.map(project => {
                const clientName = project.clientRoles[0]
                  ? clientMap.get(project.clientRoles[0].clientId) ?? 'Unknown client'
                  : 'No client';
                const taskCount = taskCountByProject.get(project._id) ?? 0;
                return (
                  <RecentRow
                    key={project._id}
                    title={project.name}
                    subtitle={`${clientName} · ${taskCount} task${taskCount !== 1 ? 's' : ''}`}
                    href="/m-clients"
                  />
                );
              })
            )}
          </>
        )}

        {activeTab === 'clients' && (
          <>
            {recentClients.length === 0 ? (
              <div className="px-[var(--m-page-px)] py-6 text-center text-[11px] text-[var(--m-text-tertiary)]">
                No clients yet
              </div>
            ) : (
              recentClients.map(client => {
                const projectCount = projectCountByClient.get(client._id) ?? 0;
                const lastAccessed = formatRelativeDate(client.lastAccessedAt);
                const parts = [`${projectCount} project${projectCount !== 1 ? 's' : ''}`];
                if (lastAccessed) parts.push(`Last accessed ${lastAccessed.toLowerCase()}`);
                return (
                  <RecentRow
                    key={client._id}
                    title={client.name}
                    subtitle={parts.join(' · ')}
                    href="/m-clients"
                  />
                );
              })
            )}
          </>
        )}

        {activeTab === 'docs' && (
          <>
            {recentDocs.length === 0 ? (
              <div className="px-[var(--m-page-px)] py-6 text-center text-[11px] text-[var(--m-text-tertiary)]">
                No documents yet
              </div>
            ) : (
              recentDocs.map(doc => {
                const name = doc.displayName || doc.fileName;
                const parts = [doc.clientName || 'Unassigned'];
                if (doc.category) parts.push(doc.category);
                return (
                  <RecentRow
                    key={doc._id}
                    title={name}
                    subtitle={parts.join(' · ')}
                    href="/m-docs"
                  />
                );
              })
            )}
          </>
        )}

        {/* View all link */}
        <div className="py-2.5 text-center">
          <Link
            href={viewAllLinks[activeTab].href}
            className="text-[11px] font-medium text-[var(--m-accent-indicator)]"
          >
            {viewAllLinks[activeTab].label} →
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Compute lookup maps and wire into DashboardContent**

In `DashboardContent.tsx`, add the import:

```tsx
import RecentsSection from './RecentsSection';
```

Add lookup map computation after the queries:

```tsx
// Build lookup maps for RecentsSection
const clientMap = new Map(clients?.map(c => [c._id, c.name]) ?? []);

const taskCountByProject = new Map<string, number>();
if (tasks) {
  for (const t of tasks) {
    if (t.projectId && t.status !== 'completed' && t.status !== 'cancelled') {
      taskCountByProject.set(t.projectId, (taskCountByProject.get(t.projectId) ?? 0) + 1);
    }
  }
}

const projectCountByClient = new Map<string, number>();
if (projects) {
  for (const p of projects) {
    for (const role of p.clientRoles) {
      projectCountByClient.set(role.clientId, (projectCountByClient.get(role.clientId) ?? 0) + 1);
    }
  }
}
```

Note: `clientMap` is already computed if you created it in Task 4 for the `resolveUpNext` function. If so, move it above `resolveUpNext` so both sections can share it. Do not duplicate it.

Render below NotificationsSection:

```tsx
<NotificationsSection notifications={notifications} unreadCount={unreadCount} />
<RecentsSection
  projects={projects}
  clients={clients}
  documents={recentDocs}
  clientMap={clientMap}
  taskCountByProject={taskCountByProject}
  projectCountByClient={projectCountByClient}
/>
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-dashboard/components/
git commit -m "feat(mobile): add segmented recents section with projects/clients/docs tabs"
```

---

### Task 7: Final assembly, cleanup, and verification

**Files:**
- Modify: `src/app/(mobile)/m-dashboard/components/DashboardContent.tsx` (final cleanup)

- [ ] **Step 1: Review DashboardContent for completeness**

The final `DashboardContent.tsx` should have this structure in its return:

```tsx
return (
  <div>
    <DashboardGreeting
      firstName={firstName}
      overdueCount={overdueCount}
      unreadCount={unreadCount ?? undefined}
    />
    <QuickActions />
    <UpNextCard item={upNextItem} />
    <NotificationsSection notifications={notifications} unreadCount={unreadCount} />
    <RecentsSection
      projects={projects}
      clients={clients}
      documents={recentDocs}
      clientMap={clientMap}
      taskCountByProject={taskCountByProject}
      projectCountByClient={projectCountByClient}
    />
  </div>
);
```

Verify all imports are present and no unused imports remain.

- [ ] **Step 2: Delete the old MobilePlaceholder import**

The old `page.tsx` imported `MobilePlaceholder`. The new one imports `DashboardContent`. Verify the old import is gone.

- [ ] **Step 3: Full build verification**

```bash
npx next build
```

Expected: Build passes with no warnings related to mobile dashboard files.

- [ ] **Step 4: Visual verification**

```bash
npx next dev --turbopack
```

Open `http://localhost:3000/m-dashboard?mobile=true` in the browser. Verify:
- Greeting shows user's first name
- Quick action grid renders 4 buttons
- Up Next card appears if there are tasks/reminders/events with due dates
- Notifications section shows unread notifications or "No new notifications"
- Recents tabs switch between Projects, Clients, Docs
- All sections use the mobile design tokens (no blue active nav, no emojis, utilitarian look)

- [ ] **Step 5: Final commit and push**

```bash
git add src/app/\(mobile\)/m-dashboard/
git commit -m "feat(mobile): complete dashboard with all sections wired to Convex data"
git push origin mobile
```
