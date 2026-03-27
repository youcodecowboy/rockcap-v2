# Threads & Flagging Overhaul -- Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface threads everywhere users work (document drawer, client/project pages, inbox) and enrich flag detail with real entity context, replacing bare IDs with resolved names, badges, and actionable links.

**Architecture:** No schema changes. New Convex queries resolve entity IDs server-side. Shared `src/components/threads/` directory holds reusable thread components. Existing inbox components updated to consume enriched data.

**Tech Stack:** Convex queries, React client components, Tailwind CSS, shadcn/ui (Tabs, Sheet, Badge, Button, Dialog), Lucide React icons

**Spec:** `docs/superpowers/specs/2026-03-16-threads-overhaul-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `convex/flags.ts` | Modify | Add 5 new queries: `getByClient`, `getByProject`, `getEntityContext`, `getInboxItemsEnriched`, `getOpenCountByClient`, `getOpenCountByProject` |
| `src/components/threads/utils.ts` | Create | Shared `relativeTime()` + `getInitial()` helpers |
| `src/components/threads/ThreadEntry.tsx` | Create (move) | Move from `src/app/inbox/components/ThreadEntry.tsx`, import shared utils |
| `src/components/threads/EntityContextHeader.tsx` | Create | Rich entity info card component |
| `src/components/threads/ThreadDetailView.tsx` | Create | Single thread view extracted from FlagDetailPanel |
| `src/components/threads/ThreadListView.tsx` | Create | Scrollable thread list component |
| `src/components/threads/ThreadPanel.tsx` | Create | Top-level list/detail state manager |
| `src/components/threads/index.ts` | Create | Barrel export |
| `src/app/inbox/components/FlagDetailPanel.tsx` | Modify | Use EntityContextHeader, fix reply bar padding |
| `src/app/inbox/components/InboxItemList.tsx` | Modify | Show entity names, type badges |
| `src/app/inbox/components/ThreadEntry.tsx` | Modify | Re-export from shared location |
| `src/app/inbox/page.tsx` | Modify | Switch to `getInboxItemsEnriched` |
| `src/app/docs/components/FileDetailPanel.tsx` | Modify | Add 5th "Threads" tab |
| `src/app/clients/[clientId]/page.tsx` | Modify | Add Threads tab |
| `src/app/clients/[clientId]/components/ClientThreadsTab.tsx` | Create | Client threads tab wrapper |
| `src/app/clients/[clientId]/projects/[projectId]/page.tsx` | Modify | Replace Communications placeholder with Threads |
| `src/app/clients/[clientId]/projects/[projectId]/components/ProjectThreadsTab.tsx` | Create | Project threads tab wrapper |

---

## Chunk 1: Shared Utilities and Convex Backend

### Task 1: Create shared thread utilities

**File:** Create `src/components/threads/utils.ts`

- [ ] **Step 1: Create the shared utils file**

```typescript
// src/components/threads/utils.ts

/**
 * Shared thread utilities — extracted from duplicated code in:
 * - src/app/inbox/components/ThreadEntry.tsx
 * - src/app/inbox/components/FlagDetailPanel.tsx
 * - src/app/inbox/components/InboxItemList.tsx
 */

export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function getInitial(name: string | null | undefined): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  document: 'Document',
  meeting: 'Meeting',
  task: 'Task',
  project: 'Project',
  client: 'Client',
  checklist_item: 'Checklist',
};

export const ENTITY_TYPE_SHORT: Record<string, string> = {
  document: 'DOC',
  meeting: 'MTG',
  task: 'TASK',
  project: 'PROJ',
  client: 'CLIENT',
  checklist_item: 'CHECK',
};

export function buildEntityLink(
  entityType: string,
  entityId: string,
  clientId?: string,
  projectId?: string
): string {
  switch (entityType) {
    case 'document':
      return `/docs/reader/${entityId}`;
    case 'meeting':
      return clientId ? `/clients/${clientId}` : '/inbox';
    case 'task':
      return '/tasks';
    case 'project':
      return clientId ? `/clients/${clientId}/projects/${entityId}` : '/inbox';
    case 'client':
      return `/clients/${entityId}`;
    case 'checklist_item':
      return clientId ? `/clients/${clientId}` : '/inbox';
    default:
      return '/inbox';
  }
}
```

### Task 2: Add new Convex queries

**File:** Modify `convex/flags.ts` (append after the existing `getInboxItems` query at line 246, before the Mutations section)

- [ ] **Step 2: Add `getByClient` query**

Insert after line 246 (after the closing of `getInboxItems`) and before the `// Mutations` comment at line 248:

```typescript
// Get flags for a specific client
export const getByClient = query({
  args: {
    clientId: v.id("clients"),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    let flags = await ctx.db
      .query("flags")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();

    if (args.status) {
      flags = flags.filter((f) => f.status === args.status);
    }

    // Sort by createdAt descending
    flags.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return flags;
  },
});
```

- [ ] **Step 3: Add `getByProject` query**

```typescript
// Get flags for a specific project
export const getByProject = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    let flags = await ctx.db
      .query("flags")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();

    if (args.status) {
      flags = flags.filter((f) => f.status === args.status);
    }

    // Sort by createdAt descending
    flags.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return flags;
  },
});
```

- [ ] **Step 4: Add `getOpenCountByClient` query**

```typescript
// Get count of open flags for a client
export const getOpenCountByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();

    return flags.filter((f) => f.status === "open").length;
  },
});
```

- [ ] **Step 5: Add `getOpenCountByProject` query**

```typescript
// Get count of open flags for a project
export const getOpenCountByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();

    return flags.filter((f) => f.status === "open").length;
  },
});
```

- [ ] **Step 6: Add `getEntityContext` query**

This query resolves an entity ID to a display-friendly shape. It reads from multiple tables depending on entityType.

```typescript
// Resolve entity details for display in thread headers
export const getEntityContext = query({
  args: {
    entityType: v.union(
      v.literal("document"),
      v.literal("meeting"),
      v.literal("task"),
      v.literal("project"),
      v.literal("client"),
      v.literal("checklist_item")
    ),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const { entityType, entityId } = args;

    try {
      switch (entityType) {
        case "document": {
          const doc = await ctx.db.get(entityId as any);
          if (!doc) return { name: "Unknown Document", subtitle: null, badges: [] };
          return {
            name: doc.fileName || "Untitled Document",
            subtitle: [doc.clientName, doc.projectName].filter(Boolean).join(" / ") || null,
            badges: [doc.fileTypeDetected, doc.category].filter(Boolean) as string[],
            summary: doc.summary || null,
          };
        }
        case "client": {
          const client = await ctx.db.get(entityId as any);
          if (!client) return { name: "Unknown Client", subtitle: null, badges: [] };
          return {
            name: client.name,
            subtitle: null,
            badges: [client.type].filter(Boolean) as string[],
          };
        }
        case "project": {
          const project = await ctx.db.get(entityId as any);
          if (!project) return { name: "Unknown Project", subtitle: null, badges: [] };
          // Resolve client name
          let clientName: string | null = null;
          if (project.clientId) {
            const client = await ctx.db.get(project.clientId);
            clientName = client?.name || null;
          }
          return {
            name: project.name,
            subtitle: clientName,
            badges: [project.status].filter(Boolean) as string[],
          };
        }
        case "task": {
          const task = await ctx.db.get(entityId as any);
          if (!task) return { name: "Unknown Task", subtitle: null, badges: [] };
          return {
            name: task.title || "Untitled Task",
            subtitle: null,
            badges: [task.status].filter(Boolean) as string[],
          };
        }
        case "meeting": {
          const meeting = await ctx.db.get(entityId as any);
          if (!meeting) return { name: "Unknown Meeting", subtitle: null, badges: [] };
          return {
            name: meeting.title || "Untitled Meeting",
            subtitle: meeting.date || null,
            badges: [],
          };
        }
        case "checklist_item": {
          const item = await ctx.db.get(entityId as any);
          if (!item) return { name: "Unknown Requirement", subtitle: null, badges: [] };
          return {
            name: (item as any).name || "Unnamed Requirement",
            subtitle: (item as any).category || null,
            badges: [(item as any).status].filter(Boolean) as string[],
          };
        }
        default:
          return { name: entityType, subtitle: null, badges: [] };
      }
    } catch {
      return { name: `${entityType} (not found)`, subtitle: null, badges: [] };
    }
  },
});
```

- [ ] **Step 7: Add `getInboxItemsEnriched` query**

This extends `getInboxItems` by resolving entity names for each flag.

```typescript
// Get enriched inbox items with entity names resolved
export const getInboxItemsEnriched = query({
  args: {
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("flags"),
        v.literal("notifications"),
        v.literal("mentions"),
        v.literal("resolved")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const filter = args.filter || "all";
    const limit = args.limit || 50;

    const items: Array<{
      kind: "flag" | "notification";
      id: string;
      createdAt: string;
      data: any;
      entityName?: string;
      entityContext?: string;
    }> = [];

    // Fetch flags if needed
    if (filter === "all" || filter === "flags" || filter === "resolved") {
      let flags;
      if (filter === "resolved") {
        flags = await ctx.db
          .query("flags")
          .withIndex("by_assignedTo_status", (q: any) =>
            q.eq("assignedTo", user._id).eq("status", "resolved")
          )
          .collect();
      } else {
        flags = await ctx.db
          .query("flags")
          .withIndex("by_assignedTo", (q: any) =>
            q.eq("assignedTo", user._id)
          )
          .collect();

        if (filter === "flags") {
          flags = flags.filter((f) => f.status === "open");
        }
      }

      for (const flag of flags) {
        // Resolve entity name
        let entityName: string | undefined;
        let entityContext: string | undefined;
        try {
          const entity = await ctx.db.get(flag.entityId as any);
          if (entity) {
            // Try common name fields
            entityName = (entity as any).fileName || (entity as any).name || (entity as any).title;
            // For documents, add client/project context
            if (flag.entityType === "document") {
              entityContext = [(entity as any).clientName, (entity as any).projectName].filter(Boolean).join(" / ");
            }
          }
        } catch {
          // Entity may not exist or ID is invalid
        }

        items.push({
          kind: "flag",
          id: flag._id,
          createdAt: flag.createdAt,
          data: flag,
          entityName,
          entityContext,
        });
      }
    }

    // Fetch notifications if needed
    if (filter === "all" || filter === "notifications" || filter === "mentions") {
      let notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect();

      if (filter === "mentions") {
        notifications = notifications.filter((n) => n.type === "flag" || n.type === "mention");
      }

      for (const notif of notifications) {
        items.push({
          kind: "notification",
          id: notif._id,
          createdAt: notif.createdAt,
          data: notif,
        });
      }
    }

    // Sort by createdAt descending
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return items.slice(0, limit);
  },
});
```

- [ ] **Step 8: Run Convex codegen to verify**

```bash
npx convex codegen
```

- [ ] **Step 9: Commit Chunk 1**

```bash
git add convex/flags.ts src/components/threads/utils.ts
git commit -m "feat: add shared thread utils and new Convex queries for threads overhaul"
git push
```

---

## Chunk 2: Shared ThreadEntry (Move + Re-export)

### Task 3: Move ThreadEntry to shared location

- [ ] **Step 1: Create `src/components/threads/ThreadEntry.tsx`**

This is a move of the existing component with the local helpers replaced by shared utils imports:

```typescript
// src/components/threads/ThreadEntry.tsx
'use client';

import { RefreshCw, ArrowRight, Activity } from 'lucide-react';
import { relativeTime, getInitial } from './utils';

interface ThreadEntryProps {
  entryType: 'message' | 'activity';
  userName: string | null;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

function getActivityIcon(content: string) {
  const lower = content.toLowerCase();
  if (lower.includes('reopen')) return <RefreshCw className="h-3.5 w-3.5 text-gray-400" />;
  if (lower.includes('resolve')) return <ArrowRight className="h-3.5 w-3.5 text-gray-400" />;
  return <Activity className="h-3.5 w-3.5 text-gray-400" />;
}

export default function ThreadEntry({ entryType, userName, content, createdAt }: ThreadEntryProps) {
  if (entryType === 'activity') {
    return (
      <div className="flex items-center gap-3 py-2.5 px-4">
        <div className="flex items-center justify-center w-6 h-6">
          {getActivityIcon(content)}
        </div>
        <div className="flex-1 min-w-0 border-l border-dashed border-gray-200 pl-3">
          <p className="text-xs text-gray-400">
            {userName && <span className="text-gray-500">{userName}</span>}
            {userName && ' \u00b7 '}
            {content}
            <span className="ml-2 text-gray-300">{relativeTime(createdAt)}</span>
          </p>
        </div>
      </div>
    );
  }

  // Message variant
  return (
    <div className="flex items-start gap-3 py-3 px-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-800 text-white flex items-center justify-center text-xs font-medium">
        {getInitial(userName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-900">
            {userName || 'Unknown'}
          </span>
          <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
            {relativeTime(createdAt)}
          </span>
        </div>
        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/inbox/components/ThreadEntry.tsx` to re-export**

Replace the entire contents of the old file with a re-export:

```typescript
// src/app/inbox/components/ThreadEntry.tsx
// Re-export from shared location for backward compatibility
export { default } from '@/components/threads/ThreadEntry';
```

This preserves the existing import in `FlagDetailPanel.tsx` at line 17 (`import ThreadEntry from './ThreadEntry'`) without requiring any change there yet.

- [ ] **Step 3: Commit Chunk 2**

```bash
git add src/components/threads/ThreadEntry.tsx src/app/inbox/components/ThreadEntry.tsx
git commit -m "feat: move ThreadEntry to shared threads directory with re-export"
git push
```

---

## Chunk 3: EntityContextHeader Component

### Task 4: Create EntityContextHeader

- [ ] **Step 1: Create `src/components/threads/EntityContextHeader.tsx`**

```typescript
// src/components/threads/EntityContextHeader.tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Building2,
  FolderKanban,
  ListTodo,
  Video,
  CheckSquare,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { ENTITY_TYPE_LABELS, buildEntityLink } from './utils';

interface EntityContextHeaderProps {
  entityType: string;
  entityId: string;
  clientId?: string;
  projectId?: string;
  compact?: boolean;
}

const ENTITY_ICONS: Record<string, React.ElementType> = {
  document: FileText,
  client: Building2,
  project: FolderKanban,
  task: ListTodo,
  meeting: Video,
  checklist_item: CheckSquare,
};

const ENTITY_ICON_COLORS: Record<string, string> = {
  document: 'bg-blue-50 text-blue-600',
  client: 'bg-green-50 text-green-600',
  project: 'bg-purple-50 text-purple-600',
  task: 'bg-amber-50 text-amber-600',
  meeting: 'bg-cyan-50 text-cyan-600',
  checklist_item: 'bg-orange-50 text-orange-600',
};

export default function EntityContextHeader({
  entityType,
  entityId,
  clientId,
  projectId,
  compact = false,
}: EntityContextHeaderProps) {
  const router = useRouter();
  const entityContext = useQuery(api.flags.getEntityContext, {
    entityType: entityType as any,
    entityId,
  });

  const Icon = ENTITY_ICONS[entityType] || FileText;
  const iconColor = ENTITY_ICON_COLORS[entityType] || 'bg-gray-50 text-gray-600';
  const entityLabel = ENTITY_TYPE_LABELS[entityType] || entityType;
  const link = buildEntityLink(entityType, entityId, clientId, projectId);

  if (entityContext === undefined) {
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        <span className="text-xs text-gray-400">Loading {entityLabel.toLowerCase()}...</span>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 ${compact ? 'px-4 py-2.5' : 'px-5 py-3'} border-b border-gray-100 bg-gray-50/50`}>
      {/* Icon */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {entityLabel}
          </span>
          {entityContext.badges?.map((badge: string, i: number) => (
            <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
              {badge}
            </Badge>
          ))}
        </div>
        <div className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
          {entityContext.name}
        </div>
        {entityContext.subtitle && (
          <div className="text-xs text-gray-500 mt-0.5 truncate">
            {entityContext.subtitle}
          </div>
        )}
        {!compact && entityContext.summary && (
          <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">
            {entityContext.summary}
          </p>
        )}
      </div>

      {/* Action */}
      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 h-7 text-xs gap-1 text-gray-500 hover:text-blue-600"
        onClick={() => router.push(link)}
      >
        View
        <ExternalLink className="h-3 w-3" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit Chunk 3**

```bash
git add src/components/threads/EntityContextHeader.tsx
git commit -m "feat: add EntityContextHeader component for rich entity display in threads"
git push
```

---

## Chunk 4: ThreadDetailView Component

### Task 5: Create ThreadDetailView (extracted from FlagDetailPanel thread section)

- [ ] **Step 1: Create `src/components/threads/ThreadDetailView.tsx`**

This component extracts the thread viewing + reply functionality from FlagDetailPanel. It handles: flag loading, user resolution, thread timeline, reply bar, resolve/reopen/delete actions.

```typescript
// src/components/threads/ThreadDetailView.tsx
'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import {
  Flag,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Send,
  Loader2,
  ChevronLeft,
} from 'lucide-react';
import ThreadEntry from './ThreadEntry';
import EntityContextHeader from './EntityContextHeader';
import { relativeTime, getInitial } from './utils';

interface ThreadDetailViewProps {
  flagId: string;
  onBack: () => void;
  showEntityContext?: boolean;
  compact?: boolean;
}

export default function ThreadDetailView({
  flagId,
  onBack,
  showEntityContext = false,
  compact = false,
}: ThreadDetailViewProps) {
  const typedFlagId = flagId as Id<'flags'>;

  // Queries
  const flag = useQuery(api.flags.get, { id: typedFlagId });
  const thread = useQuery(api.flags.getThread, { flagId: typedFlagId });

  // Collect all user IDs for batch fetch
  const userIds = useMemo(() => {
    const ids = new Set<string>();
    if (flag) {
      ids.add(flag.createdBy);
      ids.add(flag.assignedTo);
      if (flag.resolvedBy) ids.add(flag.resolvedBy);
    }
    if (thread) {
      for (const entry of thread) {
        if (entry.userId) ids.add(entry.userId);
      }
    }
    return [...ids] as Id<'users'>[];
  }, [flag, thread]);

  const users = useQuery(
    api.users.getByIds,
    userIds.length > 0 ? { userIds } : 'skip'
  );

  // Build user name map
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    if (users) {
      for (const u of users) {
        map.set(u._id, u.name || u.email || 'Unknown');
      }
    }
    return map;
  }, [users]);

  // Mutations
  const replyMutation = useMutation(api.flags.reply);
  const resolveMutation = useMutation(api.flags.resolve);
  const reopenMutation = useMutation(api.flags.reopen);
  const removeMutation = useMutation(api.flags.remove);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [resolveOnSend, setResolveOnSend] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [replyText]);

  // Scroll to bottom when thread updates
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const handleSend = useCallback(async () => {
    if (!replyText.trim() || isSending) return;
    setIsSending(true);
    try {
      await replyMutation({
        flagId: typedFlagId,
        content: replyText.trim(),
        resolve: resolveOnSend,
      });
      setReplyText('');
      setResolveOnSend(false);
    } finally {
      setIsSending(false);
    }
  }, [replyText, isSending, replyMutation, typedFlagId, resolveOnSend]);

  const handleResolve = useCallback(async () => {
    if (isResolving) return;
    setIsResolving(true);
    try {
      await resolveMutation({ id: typedFlagId });
    } finally {
      setIsResolving(false);
    }
  }, [isResolving, resolveMutation, typedFlagId]);

  const handleReopen = useCallback(async () => {
    if (isResolving) return;
    setIsResolving(true);
    try {
      await reopenMutation({ id: typedFlagId });
    } finally {
      setIsResolving(false);
    }
  }, [isResolving, reopenMutation, typedFlagId]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete this flag? This cannot be undone.')) return;
    try {
      await removeMutation({ id: typedFlagId });
      onBack();
    } catch {
      // Flag may already be deleted or unauthorized
    }
  }, [removeMutation, typedFlagId, onBack]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Loading state
  if (flag === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Not found
  if (flag === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Flag className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">Flag not found</p>
        </div>
      </div>
    );
  }

  const isOpen = flag.status === 'open';
  const creatorName = userMap.get(flag.createdBy) || null;
  const assigneeName = userMap.get(flag.assignedTo) || null;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Back + Actions header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
              isOpen
                ? 'bg-orange-50 text-orange-600'
                : 'bg-green-50 text-green-600'
            }`}
          >
            {flag.status}
          </span>
          {isOpen ? (
            <button
              onClick={handleResolve}
              disabled={isResolving}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
            >
              {isResolving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Resolve
            </button>
          ) : (
            <button
              onClick={handleReopen}
              disabled={isResolving}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded transition-colors disabled:opacity-50"
            >
              {isResolving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Reopen
            </button>
          )}
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Entity context (optional) */}
      {showEntityContext && (
        <EntityContextHeader
          entityType={flag.entityType}
          entityId={flag.entityId}
          clientId={flag.clientId}
          projectId={flag.projectId}
          compact={compact}
        />
      )}

      {/* Flag metadata */}
      <div className="px-4 py-2.5 border-b border-gray-50">
        <p className="text-xs text-gray-500">
          Flagged by{' '}
          <span className="font-medium text-gray-700">{creatorName || 'loading...'}</span>
          {' \u00b7 '}
          {relativeTime(flag.createdAt)}
          {' \u00b7 '}
          <span
            className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold uppercase ${
              flag.priority === 'urgent'
                ? 'bg-red-50 text-red-600'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {flag.priority}
          </span>
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Assigned to:{' '}
          <span className="font-medium text-gray-700">{assigneeName || 'loading...'}</span>
        </p>
      </div>

      {/* Original note */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-medium">
            {getInitial(creatorName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-900">
                {creatorName || 'Unknown'}
              </span>
              <span className="text-[11px] text-gray-400 flex-shrink-0">
                {relativeTime(flag.createdAt)}
              </span>
            </div>
            <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{flag.note}</p>
          </div>
        </div>
      </div>

      {/* Thread timeline */}
      <div className="flex-1 overflow-y-auto">
        {thread && thread.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {thread.map((entry) => (
              <ThreadEntry
                key={entry._id}
                entryType={entry.entryType}
                userName={entry.userId ? userMap.get(entry.userId) || null : null}
                content={entry.content}
                createdAt={entry.createdAt}
                metadata={entry.metadata as Record<string, unknown> | undefined}
              />
            ))}
          </div>
        ) : thread !== undefined ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-gray-300">No replies yet</p>
          </div>
        ) : null}
        <div ref={threadEndRef} />
      </div>

      {/* Reply bar */}
      <div className="border-t border-gray-200 pl-4 pr-4 py-2.5 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a reply..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resolveOnSend}
                onChange={(e) => setResolveOnSend(e.target.checked)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500 h-3.5 w-3.5"
              />
              <span className="text-[11px] text-gray-500 whitespace-nowrap">Resolve</span>
            </label>
            <button
              onClick={handleSend}
              disabled={!replyText.trim() || isSending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit Chunk 4**

```bash
git add src/components/threads/ThreadDetailView.tsx
git commit -m "feat: add ThreadDetailView component extracted from FlagDetailPanel"
git push
```

---

## Chunk 5: ThreadListView and ThreadPanel

### Task 6: Create ThreadListView

- [ ] **Step 1: Create `src/components/threads/ThreadListView.tsx`**

```typescript
// src/components/threads/ThreadListView.tsx
'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ChevronRight, MessageSquare, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { relativeTime, ENTITY_TYPE_SHORT } from './utils';

interface ThreadListViewProps {
  flags: any[] | undefined;
  onSelect: (flagId: string) => void;
  showEntityBadge?: boolean;
  compact?: boolean;
}

export default function ThreadListView({
  flags,
  onSelect,
  showEntityBadge = false,
  compact = false,
}: ThreadListViewProps) {
  const [showResolved, setShowResolved] = useState(false);

  if (flags === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const openFlags = flags.filter((f) => f.status === 'open');
  const resolvedFlags = flags.filter((f) => f.status === 'resolved');

  if (flags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">No threads yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Create a flag to start a conversation
        </p>
      </div>
    );
  }

  const renderFlag = (flag: any) => {
    const isOpen = flag.status === 'open';
    const title = flag.note?.split('\n')[0] || 'Untitled flag';
    const displayTitle = title.length > 80 ? title.substring(0, 80) + '...' : title;

    return (
      <button
        key={flag._id}
        onClick={() => onSelect(flag._id)}
        className={`w-full text-left px-4 ${compact ? 'py-2.5' : 'py-3'} transition-colors hover:bg-gray-50 border-l-2 ${
          isOpen ? 'border-l-orange-400' : 'border-l-transparent'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Status dot */}
          <div className="mt-1.5 flex-shrink-0">
            <div
              className={`w-2 h-2 rounded-full ${
                isOpen ? 'bg-orange-400' : 'bg-green-400'
              }`}
            />
          </div>

          <div className="flex-1 min-w-0">
            {/* Entity badge (for client/project level views) */}
            {showEntityBadge && flag.entityType && (
              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 text-gray-500 uppercase tracking-wide mr-1.5 mb-1">
                {ENTITY_TYPE_SHORT[flag.entityType] || flag.entityType}
              </span>
            )}

            {/* Title */}
            <div className={`text-sm ${isOpen ? 'font-medium text-gray-900' : 'text-gray-500'} truncate`}>
              {displayTitle}
            </div>

            {/* Meta line */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-gray-400">
                {relativeTime(flag.createdAt)}
              </span>
              {flag.priority === 'urgent' && (
                <span className="text-[10px] font-semibold text-red-500 uppercase">
                  Urgent
                </span>
              )}
              <span
                className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium ${
                  isOpen
                    ? 'bg-orange-50 text-orange-600'
                    : 'bg-green-50 text-green-600'
                }`}
              >
                {flag.status}
              </span>
            </div>
          </div>

          <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
        </div>
      </button>
    );
  };

  return (
    <div>
      {/* Open flags */}
      {openFlags.length > 0 && (
        <div className="divide-y divide-gray-100">
          {openFlags.map(renderFlag)}
        </div>
      )}

      {/* Resolved toggle */}
      {resolvedFlags.length > 0 && (
        <>
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="w-full text-left px-4 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors border-t border-gray-100"
          >
            {showResolved ? 'Hide' : 'Show'} {resolvedFlags.length} resolved thread{resolvedFlags.length !== 1 ? 's' : ''}
          </button>
          {showResolved && (
            <div className="divide-y divide-gray-100 opacity-75">
              {resolvedFlags.map(renderFlag)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

### Task 7: Create ThreadPanel

- [ ] **Step 2: Create `src/components/threads/ThreadPanel.tsx`**

```typescript
// src/components/threads/ThreadPanel.tsx
'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThreadListView from './ThreadListView';
import ThreadDetailView from './ThreadDetailView';
import FlagCreationModal from '@/components/FlagCreationModal';

interface ThreadPanelProps {
  // Filter scope -- at least one required
  entityType?: string;
  entityId?: string;
  clientId?: string;
  projectId?: string;

  // Display options
  showEntityBadge?: boolean;
  showCreateButton?: boolean;
  compact?: boolean;

  // For flag creation -- optional entity name
  entityName?: string;
}

export default function ThreadPanel({
  entityType,
  entityId,
  clientId,
  projectId,
  showEntityBadge = false,
  showCreateButton = true,
  compact = false,
  entityName,
}: ThreadPanelProps) {
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [flagModalOpen, setFlagModalOpen] = useState(false);

  // Determine which query to use based on scope
  const entityFlags = useQuery(
    api.flags.getByEntity,
    entityType && entityId
      ? { entityType: entityType as any, entityId }
      : 'skip'
  );

  const clientFlags = useQuery(
    api.flags.getByClient,
    clientId && !entityId
      ? { clientId: clientId as Id<'clients'> }
      : 'skip'
  );

  const projectFlags = useQuery(
    api.flags.getByProject,
    projectId && !entityId && !clientId
      ? { projectId: projectId as Id<'projects'> }
      : 'skip'
  );

  // Choose the right flags based on scope
  const flags = entityId ? entityFlags : clientId ? clientFlags : projectFlags;

  // Detail view
  if (selectedFlagId) {
    return (
      <ThreadDetailView
        flagId={selectedFlagId}
        onBack={() => setSelectedFlagId(null)}
        showEntityContext={showEntityBadge}
        compact={compact}
      />
    );
  }

  // List view
  return (
    <div className="flex flex-col h-full">
      {/* Header with create button */}
      {showCreateButton && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Threads
            {flags && flags.length > 0 && (
              <span className="ml-1.5 text-gray-400">({flags.filter((f: any) => f.status === 'open').length} open)</span>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setFlagModalOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Flag
          </Button>
        </div>
      )}

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        <ThreadListView
          flags={flags}
          onSelect={setSelectedFlagId}
          showEntityBadge={showEntityBadge}
          compact={compact}
        />
      </div>

      {/* Flag creation modal */}
      {flagModalOpen && (
        <FlagCreationModal
          isOpen={flagModalOpen}
          onClose={() => setFlagModalOpen(false)}
          entityType={(entityType || 'client') as any}
          entityId={entityId || clientId || projectId || ''}
          entityName={entityName || 'Item'}
          clientId={clientId}
          projectId={projectId}
        />
      )}
    </div>
  );
}
```

### Task 8: Create barrel export

- [ ] **Step 3: Create `src/components/threads/index.ts`**

```typescript
// src/components/threads/index.ts
export { default as ThreadPanel } from './ThreadPanel';
export { default as ThreadListView } from './ThreadListView';
export { default as ThreadDetailView } from './ThreadDetailView';
export { default as ThreadEntry } from './ThreadEntry';
export { default as EntityContextHeader } from './EntityContextHeader';
export { relativeTime, getInitial, ENTITY_TYPE_LABELS, ENTITY_TYPE_SHORT, buildEntityLink } from './utils';
```

- [ ] **Step 4: Commit Chunk 5**

```bash
git add src/components/threads/ThreadListView.tsx src/components/threads/ThreadPanel.tsx src/components/threads/index.ts
git commit -m "feat: add ThreadListView and ThreadPanel shared components"
git push
```

---

## Chunk 6: Update FlagDetailPanel and InboxItemList

### Task 9: Update FlagDetailPanel with EntityContextHeader and chat bubble fix

**File:** `src/app/inbox/components/FlagDetailPanel.tsx` (407 lines)

- [ ] **Step 1: Add EntityContextHeader import**

At line 17 (after the ThreadEntry import), add:

```typescript
import EntityContextHeader from '@/components/threads/EntityContextHeader';
import { relativeTime, getInitial, ENTITY_TYPE_LABELS, buildEntityLink } from '@/components/threads/utils';
```

- [ ] **Step 2: Remove duplicated helpers**

Delete lines 24-78 (the local `relativeTime`, `getInitial`, `ENTITY_TYPE_LABELS`, and `buildEntityLink` functions). These are now imported from the shared utils.

- [ ] **Step 3: Replace entity header section**

Replace lines 237-248 (the header bar section showing `{entityLabel} {flag.entityId.slice(-6)}`) with EntityContextHeader. The existing header bar becomes:

At line ~237 inside the return, replace the first `<div>` block (the header bar) with:

```tsx
{/* Entity context header */}
<EntityContextHeader
  entityType={flag.entityType}
  entityId={flag.entityId}
  clientId={flag.clientId}
  projectId={flag.projectId}
/>

{/* Action bar */}
<div className="flex items-center justify-between px-5 py-2 border-b border-gray-100">
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
      isOpen
        ? 'bg-orange-50 text-orange-600'
        : 'bg-green-50 text-green-600'
    }`}
  >
    {flag.status}
  </span>
  <div className="flex items-center gap-2 flex-shrink-0">
    {/* ... keep existing resolve/reopen/delete buttons unchanged ... */}
  </div>
</div>
```

- [ ] **Step 4: Fix chat bubble overlap (Workstream D)**

At line ~365, change the reply bar className from:
```
className="border-t border-gray-200 px-5 py-3 bg-white"
```
to:
```
className="border-t border-gray-200 pl-5 pr-20 py-3 bg-white"
```

The `pr-20` (80px) right padding clears the floating chat button (56px wide + 24px from right edge).

- [ ] **Step 5: Commit**

```bash
git add src/app/inbox/components/FlagDetailPanel.tsx
git commit -m "feat: add EntityContextHeader to FlagDetailPanel and fix chat bubble overlap"
git push
```

### Task 10: Update InboxItemList and inbox page to use enriched data

- [ ] **Step 6: Update InboxItemList interface**

**File:** `src/app/inbox/components/InboxItemList.tsx`

Replace the local `relativeTime` function (lines 6-22) with an import:

```typescript
import { relativeTime, ENTITY_TYPE_SHORT } from '@/components/threads/utils';
```

Update the `InboxItem` interface to include the new fields:

```typescript
export interface InboxItem {
  kind: 'flag' | 'notification';
  id: string;
  createdAt: string;
  data: {
    note?: string;
    title?: string;
    message?: string;
    priority?: 'normal' | 'urgent';
    status?: string;
    type?: string;
    entityType?: string;
    isRead?: boolean;
  };
  entityName?: string;
  entityContext?: string;
}
```

- [ ] **Step 7: Update `getTitle()` to show entity name**

Replace the `getTitle` function:

```typescript
function getTitle(item: InboxItem): string {
  if (item.kind === 'flag') {
    // Show resolved entity name if available, fall back to type
    if (item.entityName) {
      return item.entityName;
    }
    const entity = item.data.entityType
      ? item.data.entityType.charAt(0).toUpperCase() + item.data.entityType.slice(1)
      : 'Item';
    return `Flag: ${entity}`;
  }
  return item.data.title || 'Notification';
}
```

- [ ] **Step 8: Add entity type badge and context line to item rendering**

In the item rendering section (around line 105), after the existing icon div, add entity type badge. Update the rendering inside the `<button>` element:

```tsx
<div className="flex items-start gap-3">
  <div className="mt-0.5">{getIcon(item)}</div>
  <div className="flex-1 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {item.kind === 'flag' && item.data.entityType && (
          <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-gray-100 text-gray-500 uppercase tracking-wide flex-shrink-0">
            {ENTITY_TYPE_SHORT[item.data.entityType] || item.data.entityType}
          </span>
        )}
        <span
          className={`text-sm truncate ${
            unread ? 'font-semibold text-gray-900' : 'font-normal text-gray-700'
          }`}
        >
          {getTitle(item)}
        </span>
      </div>
      <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
        {relativeTime(item.createdAt)}
      </span>
    </div>
    <p className="text-xs text-gray-500 mt-0.5 truncate">{getPreview(item)}</p>
    {item.entityContext && (
      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.entityContext}</p>
    )}
  </div>
</div>
```

- [ ] **Step 9: Update inbox page to use `getInboxItemsEnriched`**

**File:** `src/app/inbox/page.tsx`

Change lines 26-30 from `api.flags.getInboxItems` to `api.flags.getInboxItemsEnriched`:

```typescript
const allItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'all' });
const flagItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'flags' });
const notifItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'notifications' });
const mentionItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'mentions' });
const resolvedItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'resolved' });
```

- [ ] **Step 10: Commit**

```bash
git add src/app/inbox/components/InboxItemList.tsx src/app/inbox/page.tsx
git commit -m "feat: show entity names and type badges in inbox list"
git push
```

---

## Chunk 7: Document Drawer Threads Tab

### Task 11: Add Threads tab to FileDetailPanel

**File:** `src/app/docs/components/FileDetailPanel.tsx` (956 lines)

- [ ] **Step 1: Add imports**

Add to the Lucide imports (around line 25):

```typescript
import { MessageSquare } from 'lucide-react';
```

Add component import after the `cn` import (line 53):

```typescript
import { ThreadPanel } from '@/components/threads';
```

Add Convex query import -- the `useQuery` and `api` are already imported. Add a new query call for open flag count.

- [ ] **Step 2: Add open flag count query**

Inside the component function, after the `allChecklistItems` query (around line 188), add:

```typescript
// Query open flag count for this document
const openFlagCount = useQuery(
  api.flags.getOpenCountByEntity,
  document?._id ? { entityType: "document" as const, entityId: document._id } : "skip"
);
```

- [ ] **Step 3: Update TabsList grid from 4 to 5 columns**

At line 427, change:
```
<TabsList className="grid grid-cols-4 h-auto p-1">
```
to:
```
<TabsList className="grid grid-cols-5 h-auto p-1">
```

- [ ] **Step 4: Add Threads TabsTrigger**

After the Checklist TabsTrigger (around line 438-439), add:

```tsx
<TabsTrigger value="threads" className="text-xs px-2 py-1.5 relative">
  Threads
  {openFlagCount !== undefined && openFlagCount > 0 && (
    <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-orange-100 text-orange-600 text-[10px] font-semibold px-1">
      {openFlagCount}
    </span>
  )}
</TabsTrigger>
```

- [ ] **Step 5: Add Threads TabsContent**

After the Checklist TabsContent closing tag (around line 862), add:

```tsx
{/* Threads Tab */}
<TabsContent value="threads" className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
  <div className="h-full">
    <ThreadPanel
      entityType="document"
      entityId={document._id}
      clientId={document.clientId}
      projectId={document.projectId}
      compact
      showCreateButton
      entityName={document.fileName}
    />
  </div>
</TabsContent>
```

- [ ] **Step 6: Commit**

```bash
git add src/app/docs/components/FileDetailPanel.tsx
git commit -m "feat: add Threads tab to document drawer with flag count badge"
git push
```

---

## Chunk 8: Client Page Threads Tab

### Task 12: Create ClientThreadsTab and add to client page

- [ ] **Step 1: Create `src/app/clients/[clientId]/components/ClientThreadsTab.tsx`**

```typescript
// src/app/clients/[clientId]/components/ClientThreadsTab.tsx
'use client';

import { useState } from 'react';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ThreadPanel } from '@/components/threads';

interface ClientThreadsTabProps {
  clientId: Id<'clients'>;
  clientName: string;
}

export default function ClientThreadsTab({ clientId, clientName }: ClientThreadsTabProps) {
  return (
    <div className="h-full flex flex-col">
      <ThreadPanel
        clientId={clientId}
        showEntityBadge
        showCreateButton
        entityName={clientName}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update client page.tsx**

**File:** `src/app/clients/[clientId]/page.tsx`

Add import at the top (after line 70, the other tab component imports):

```typescript
import ClientThreadsTab from './components/ClientThreadsTab';
```

Add the open flag count query. After line 98 (`activeTasksCount`), add:

```typescript
const openFlagCount = useQuery(api.flags.getOpenCountByClient, { clientId }) || 0;
```

Note: `api.flags.getOpenCountByClient` is the new query from Chunk 1.

Update the `TabType` union (line 74) to include `'threads'`:

```typescript
type TabType = 'overview' | 'documents' | 'projects' | 'communications' | 'contacts' | 'data' | 'intelligence' | 'checklist' | 'notes' | 'meetings' | 'tasks' | 'threads';
```

Add the Threads tab entry to the tabs array. Insert after the communications entry (after line 213, which is the `communications` tab). The new entry goes at index position 6:

```typescript
{ id: 'threads', label: 'Threads', icon: MessageSquare, count: openFlagCount > 0 ? openFlagCount : undefined },
```

Note: The `MessageSquare` icon is already imported (line 37).

Add the TabsContent. In the "Edge-to-Edge Tabs" section (around line 396), add:

```tsx
<TabsContent value="threads" className="mt-0 flex-1 overflow-hidden">
  <ClientThreadsTab
    clientId={clientId}
    clientName={client.name}
  />
</TabsContent>
```

Also update the hidden-div condition (line 469) to include `'threads'`:

```typescript
className={`flex-1 overflow-auto ${['overview', 'intelligence', 'documents', 'checklist', 'notes', 'meetings', 'tasks', 'data', 'threads'].includes(activeTab) ? 'hidden' : ''}`}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/clients/[clientId]/components/ClientThreadsTab.tsx src/app/clients/[clientId]/page.tsx
git commit -m "feat: add Threads tab to client page with open flag count badge"
git push
```

---

## Chunk 9: Project Page Threads Tab

### Task 13: Create ProjectThreadsTab and update project page

- [ ] **Step 1: Create `src/app/clients/[clientId]/projects/[projectId]/components/ProjectThreadsTab.tsx`**

```typescript
// src/app/clients/[clientId]/projects/[projectId]/components/ProjectThreadsTab.tsx
'use client';

import { Id } from '../../../../../../../convex/_generated/dataModel';
import { ThreadPanel } from '@/components/threads';

interface ProjectThreadsTabProps {
  projectId: Id<'projects'>;
  clientId: Id<'clients'>;
  projectName: string;
}

export default function ProjectThreadsTab({ projectId, clientId, projectName }: ProjectThreadsTabProps) {
  return (
    <div className="h-full flex flex-col">
      <ThreadPanel
        projectId={projectId}
        showEntityBadge
        showCreateButton
        entityName={projectName}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update project page.tsx**

**File:** `src/app/clients/[clientId]/projects/[projectId]/page.tsx`

Add import (after line 53, with other component imports):

```typescript
import ProjectThreadsTab from './components/ProjectThreadsTab';
```

Add the open flag count query. After line 77 (`activeTasksCount`), add:

```typescript
const openFlagCount = useQuery(api.flags.getOpenCountByProject, { projectId }) || 0;
```

Update the `TabType` union (line 56) to include `'threads'`:

```typescript
type TabType = 'overview' | 'documents' | 'intelligence' | 'checklist' | 'threads' | 'data' | 'notes' | 'tasks';
```

Replace the communications tab entry in the tabs array (line 187). Change:

```typescript
{ id: 'communications', label: 'Communications', icon: MessageSquare },
```

to:

```typescript
{ id: 'threads', label: 'Threads', icon: MessageSquare, count: openFlagCount > 0 ? openFlagCount : undefined },
```

Replace the communications TabsContent placeholder (lines 415-423). Change the entire `<TabsContent value="communications">` block to:

```tsx
<TabsContent value="threads" className="mt-0 flex-1 overflow-hidden">
  <ProjectThreadsTab
    projectId={projectId}
    clientId={clientId}
    projectName={project.name}
  />
</TabsContent>
```

Note: Since the threads tab is now edge-to-edge, move it from the "contained tabs" section to the "edge-to-edge" section (around line 354). Add it alongside the other edge-to-edge TabsContent blocks.

Also update the hidden-div condition (line 398) to include `'threads'`:

```typescript
className={`flex-1 overflow-auto ${['intelligence', 'documents', 'checklist', 'notes', 'tasks', 'threads'].includes(activeTab) ? 'hidden' : ''}`}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/clients/[clientId]/projects/[projectId]/components/ProjectThreadsTab.tsx src/app/clients/[clientId]/projects/[projectId]/page.tsx
git commit -m "feat: replace Communications placeholder with Threads tab on project page"
git push
```

---

## Chunk 10: Final Build Verification

- [ ] **Step 1: Run build check**

```bash
npx next build
```

Fix any TypeScript or build errors that arise.

- [ ] **Step 2: Final commit and push**

If any build fixes were needed:

```bash
git add -A
git commit -m "fix: resolve build errors from threads overhaul"
git push
```

---

## Verification Checklist

After implementation, verify each scenario:

1. **Flag detail panel**: Open inbox, click a document flag. Confirm document name, type/category badges, summary, and "View" button appear instead of bare ID.
2. **Inbox sidebar**: Confirm flag items show entity name (e.g., "Proposed Roof Plan") instead of "Flag: Document", with entity type badge and context line.
3. **Document drawer Threads tab**: Open any document drawer. Confirm 5th "Threads" tab appears with open flag count badge. Click into it, view thread list, click thread, reply, resolve.
4. **Client Threads tab**: Navigate to a client, click Threads tab. Confirm threads from all entity types appear with type badges.
5. **Project Threads tab**: Navigate to a project, click Threads tab. Confirm project-scoped threads appear (replacing the placeholder Communications tab).
6. **Chat bubble fix**: On /inbox, verify the send button in the reply bar is not obscured by the floating chat button.
7. **Multiple threads**: Create 2+ flags on the same document. Confirm both appear in the document drawer Threads tab.
8. **Thread actions**: From any embedded thread context (drawer, client tab, project tab), verify: reply, resolve & send, reopen, resolve without reply.
9. **Build**: `npx next build` passes with no errors.

---

### Critical Files for Implementation
- `/Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/flags.ts` - Core backend: add 6 new queries (getByClient, getByProject, getEntityContext, getInboxItemsEnriched, getOpenCountByClient, getOpenCountByProject)
- `/Users/cowboy/rockcap/rockcap-v2/model-testing-app/src/components/threads/ThreadPanel.tsx` - Central new component: top-level list/detail state manager, used by all 3 integration points
- `/Users/cowboy/rockcap/rockcap-v2/model-testing-app/src/app/inbox/components/FlagDetailPanel.tsx` - Major modification: integrate EntityContextHeader, fix chat bubble overlap, deduplicate helpers
- `/Users/cowboy/rockcap/rockcap-v2/model-testing-app/src/app/docs/components/FileDetailPanel.tsx` - Add 5th "Threads" tab to document drawer (grid-cols-4 to 5, new TabsContent)
- `/Users/cowboy/rockcap/rockcap-v2/model-testing-app/src/app/clients/[clientId]/page.tsx` - Add Threads tab to client page tabs array and TabsContent