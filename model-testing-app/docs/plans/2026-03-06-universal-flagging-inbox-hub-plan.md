# Universal Flagging & Inbox Hub — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a universal flagging system with threaded conversations and auto-logged activity, plus a modernized Inbox hub as the central notification/flag management surface.

**Architecture:** New `flags` and `flagThreadEntries` Convex tables with backend CRUD. A reusable `FlagCreationModal` component wired into three-dot menus across all entity types. A fully rebuilt `/inbox` page with left sidebar filters + detail panel. Activity auto-logging via a shared helper called from existing Convex mutations. Six new chat tools in the flag domain.

**Tech Stack:** Next.js 16, Convex (real-time backend), Tailwind CSS, shadcn/ui, Lucide icons, Clerk auth

**Design Doc:** `docs/plans/2026-03-06-universal-flagging-inbox-hub-design.md`

---

## Task 1: Add `flags` and `flagThreadEntries` tables to Convex schema

**Files:**
- Modify: `convex/schema.ts:3225` (before closing `});`)

**Step 1: Add the flags table definition**

Insert before the closing `});` at line 3226 of `convex/schema.ts`:

```typescript
  // ============================================================================
  // FLAGS - Universal flagging system for cross-team collaboration
  // ============================================================================

  flags: defineTable({
    entityType: v.union(
      v.literal("document"),
      v.literal("meeting"),
      v.literal("task"),
      v.literal("project"),
      v.literal("client"),
      v.literal("checklist_item")
    ),
    entityId: v.string(),
    createdBy: v.id("users"),
    assignedTo: v.id("users"), // Defaults to creator if unassigned
    note: v.string(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    priority: v.union(v.literal("normal"), v.literal("urgent")),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    createdAt: v.string(),
  })
    .index("by_assignedTo", ["assignedTo"])
    .index("by_createdBy", ["createdBy"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_status", ["status"])
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_assignedTo_status", ["assignedTo", "status"]),

  flagThreadEntries: defineTable({
    flagId: v.id("flags"),
    entryType: v.union(v.literal("message"), v.literal("activity")),
    userId: v.optional(v.id("users")),
    content: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.string(),
  })
    .index("by_flag", ["flagId", "createdAt"]),
```

**Step 2: Add "flag" to the notification type union**

In `convex/schema.ts` at line 1632-1637, update the notifications type union:

```typescript
    type: v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task"),
      v.literal("changelog"),
      v.literal("flag")
    ),
```

**Step 3: Run Convex codegen**

Run: `npx convex codegen`
Expected: Success, updated `convex/_generated/` types

**Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add flags and flagThreadEntries tables to schema"
```

---

## Task 2: Update notifications backend to support "flag" type

**Files:**
- Modify: `convex/notifications.ts:27-31` (create mutation type union)
- Modify: `convex/notifications.ts:63-67` (getByUser query type union)

**Step 1: Update the `create` mutation type union**

At line 27-31 in `convex/notifications.ts`, add `v.literal("flag")`:

```typescript
    type: v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task"),
      v.literal("changelog"),
      v.literal("flag")
    ),
```

**Step 2: Update the `getByUser` query type union**

Find the same union pattern in the `getByUser` query args (~line 63) and add `v.literal("flag")` there too. Repeat for any other functions that reference this union (search for `v.literal("changelog")` in the file to find all instances).

**Step 3: Commit**

```bash
git add convex/notifications.ts
git commit -m "feat: add flag type to notification create and query functions"
```

---

## Task 3: Create `convex/flags.ts` — Flag CRUD backend

**Files:**
- Create: `convex/flags.ts`

**Step 1: Create the flags Convex module**

Create `convex/flags.ts` with the following functions. Follow the existing pattern from `convex/notifications.ts` and `convex/comments.ts`:

```typescript
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";

const FLAG_ENTITY_TYPES = v.union(
  v.literal("document"),
  v.literal("meeting"),
  v.literal("task"),
  v.literal("project"),
  v.literal("client"),
  v.literal("checklist_item")
);

// Query: Get flags assigned to the current user
export const getMyFlags = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    let q = ctx.db
      .query("flags")
      .withIndex("by_assignedTo", (q) => q.eq("assignedTo", user._id));
    const flags = await q.collect();
    const filtered = args.status
      ? flags.filter((f) => f.status === args.status)
      : flags;
    return filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
});

// Query: Get flags created by the current user
export const getMyCreatedFlags = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", user._id))
      .collect();
    const filtered = args.status
      ? flags.filter((f) => f.status === args.status)
      : flags;
    return filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
});

// Query: Get flags for a specific entity
export const getByEntity = query({
  args: {
    entityType: FLAG_ENTITY_TYPES,
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("flags")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();
  },
});

// Query: Get open flag count for an entity (for flag indicators)
export const getOpenCountByEntity = query({
  args: {
    entityType: FLAG_ENTITY_TYPES,
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();
    return flags.filter((f) => f.status === "open").length;
  },
});

// Query: Get a single flag by ID
export const get = query({
  args: { flagId: v.id("flags") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.flagId);
  },
});

// Query: Get thread entries for a flag
export const getThread = query({
  args: { flagId: v.id("flags") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("flagThreadEntries")
      .withIndex("by_flag", (q) => q.eq("flagId", args.flagId))
      .collect();
  },
});

// Query: Get all inbox items for the current user (flags + notifications)
export const getInboxItems = query({
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
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const filter = args.filter || "all";

    if (filter === "resolved") {
      const resolvedFlags = await ctx.db
        .query("flags")
        .withIndex("by_assignedTo", (q) => q.eq("assignedTo", user._id))
        .collect();
      return {
        flags: resolvedFlags
          .filter((f) => f.status === "resolved")
          .sort((a, b) => new Date(b.resolvedAt || b.createdAt).getTime() - new Date(a.resolvedAt || a.createdAt).getTime()),
        notifications: [],
      };
    }

    // Get open flags assigned to user
    const flags = filter === "notifications"
      ? []
      : (await ctx.db
          .query("flags")
          .withIndex("by_assignedTo", (q) => q.eq("assignedTo", user._id))
          .collect()
        ).filter((f) => f.status === "open");

    // Get notifications
    const notifications = filter === "flags"
      ? []
      : await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

    // TODO: "mentions" filter — flags where user is mentioned in thread but not assignee

    return {
      flags: flags.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      notifications: notifications.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    };
  },
});

// Mutation: Create a flag
export const create = mutation({
  args: {
    entityType: FLAG_ENTITY_TYPES,
    entityId: v.string(),
    assignedTo: v.optional(v.id("users")),
    note: v.string(),
    priority: v.optional(v.union(v.literal("normal"), v.literal("urgent"))),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();
    const assignedTo = args.assignedTo || user._id;

    const flagId = await ctx.db.insert("flags", {
      entityType: args.entityType,
      entityId: args.entityId,
      createdBy: user._id,
      assignedTo,
      note: args.note,
      status: "open",
      priority: args.priority || "normal",
      clientId: args.clientId,
      projectId: args.projectId,
      createdAt: now,
    });

    // Create notification for assigned user (if not self)
    if (assignedTo !== user._id) {
      await ctx.db.insert("notifications", {
        userId: assignedTo,
        type: "flag",
        title: "New flag assigned to you",
        message: args.note,
        relatedId: flagId,
        isRead: false,
        createdAt: now,
      });
    }

    return flagId;
  },
});

// Mutation: Reply to a flag thread
export const reply = mutation({
  args: {
    flagId: v.id("flags"),
    content: v.string(),
    resolve: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();
    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("Flag not found");

    // Add thread entry
    const entryId = await ctx.db.insert("flagThreadEntries", {
      flagId: args.flagId,
      entryType: "message",
      userId: user._id,
      content: args.content,
      createdAt: now,
    });

    // Resolve if requested
    if (args.resolve) {
      await ctx.db.patch(args.flagId, {
        status: "resolved",
        resolvedBy: user._id,
        resolvedAt: now,
      });
    }

    // Notify other participants
    const threadEntries = await ctx.db
      .query("flagThreadEntries")
      .withIndex("by_flag", (q) => q.eq("flagId", args.flagId))
      .collect();

    const participantIds = new Set<string>();
    participantIds.add(flag.createdBy);
    participantIds.add(flag.assignedTo);
    for (const entry of threadEntries) {
      if (entry.userId) participantIds.add(entry.userId);
    }
    participantIds.delete(user._id); // Don't notify self

    for (const participantId of participantIds) {
      await ctx.db.insert("notifications", {
        userId: participantId as any,
        type: "flag",
        title: args.resolve ? "Flag resolved" : "New reply on flag",
        message: args.content,
        relatedId: args.flagId,
        isRead: false,
        createdAt: now,
      });
    }

    return entryId;
  },
});

// Mutation: Resolve a flag (without a reply)
export const resolve = mutation({
  args: { flagId: v.id("flags") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    await ctx.db.patch(args.flagId, {
      status: "resolved",
      resolvedBy: user._id,
      resolvedAt: now,
    });

    return args.flagId;
  },
});

// Mutation: Reopen a resolved flag
export const reopen = mutation({
  args: { flagId: v.id("flags") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    await ctx.db.patch(args.flagId, {
      status: "open",
      resolvedBy: undefined,
      resolvedAt: undefined,
    });

    return args.flagId;
  },
});

// Mutation: Delete a flag and its thread entries
export const remove = mutation({
  args: { flagId: v.id("flags") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("Flag not found");

    // Delete all thread entries
    const entries = await ctx.db
      .query("flagThreadEntries")
      .withIndex("by_flag", (q) => q.eq("flagId", args.flagId))
      .collect();
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    // Delete the flag
    await ctx.db.delete(args.flagId);
    return args.flagId;
  },
});

// Internal mutation: Log activity on a flag thread (called from other mutations)
export const logActivity = mutation({
  args: {
    entityType: FLAG_ENTITY_TYPES,
    entityId: v.string(),
    userId: v.id("users"),
    content: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Find open flags for this entity
    const openFlags = await ctx.db
      .query("flags")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();
    const activeFlags = openFlags.filter((f) => f.status === "open");

    if (activeFlags.length === 0) return;

    // Log activity entry on each open flag
    for (const flag of activeFlags) {
      await ctx.db.insert("flagThreadEntries", {
        flagId: flag._id,
        entryType: "activity",
        userId: args.userId,
        content: args.content,
        metadata: args.metadata,
        createdAt: now,
      });
    }
  },
});
```

**Step 2: Run Convex codegen**

Run: `npx convex codegen`

**Step 3: Commit**

```bash
git add convex/flags.ts
git commit -m "feat: add flags Convex module with full CRUD, thread, and activity logging"
```

---

## Task 4: Add activity auto-logging to document mutations

**Files:**
- Modify: `convex/documents.ts:1034-1093` (moveDocument mutation)
- Modify: `convex/documents.ts` (other relevant mutations — update, moveDocumentCrossScope)

**Step 1: Add activity logging to `moveDocument`**

At the end of the `moveDocument` handler (before `return args.documentId` at line 1092), add:

```typescript
    // Log activity on any open flags for this document
    await ctx.runMutation(api.flags.logActivity, {
      entityType: "document",
      entityId: args.documentId,
      userId: user._id, // Note: you'll need to get the authenticated user at the top of this handler
      content: `moved document to ${args.isBaseDocument ? "Base Documents" : args.targetProjectName || "project"}`,
      metadata: {
        action: "moved",
        to: args.isBaseDocument ? "Base Documents" : args.targetProjectName,
      },
    });
```

Note: If the mutation doesn't already get the authenticated user, use `internal` functions or call `ctx.db.query("users")` to resolve the user. Check the existing pattern in the mutation. Alternatively, use `ctx.runMutation` with the internal API if `logActivity` is made an `internalMutation`.

**Step 2: Add to other document mutations**

Apply the same pattern to:
- `moveDocumentCrossScope` (~line 1097) — log scope changes
- `update` (~line 687) — log renames (if `fileName` changed)
- `unlinkVersion` (~line 1936) — log version unlinks

**Step 3: Add activity logging to task mutations**

In `convex/tasks.ts`, add activity logging to:
- Status changes: `"changed task status to {newStatus}"`
- Reassignment: `"reassigned task to {userName}"`

**Step 4: Add activity logging to meeting mutations**

In `convex/meetings.ts`, add activity logging to:
- `updateMeeting`: `"updated meeting details"`
- `updateActionItemStatus`: `"marked action item '{title}' as {status}"`

**Step 5: Commit**

```bash
git add convex/documents.ts convex/tasks.ts convex/meetings.ts
git commit -m "feat: add flag activity auto-logging to document, task, and meeting mutations"
```

---

## Task 5: Create `FlagCreationModal` component

**Files:**
- Create: `src/components/FlagCreationModal.tsx`

**Step 1: Build the modal component**

Use the `@skill frontend-design` skill for enterprise minimalistic styling. The modal should follow the existing modal patterns in the codebase (see `CreateMeetingModal.tsx` for reference).

Props interface:

```typescript
interface FlagCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "document" | "meeting" | "task" | "project" | "client" | "checklist_item";
  entityId: string;
  entityName: string; // Display name of the entity being flagged
  entityContext?: string; // e.g., "Client: Meridian Dev > Project: Phase 2"
  clientId?: string;
  projectId?: string;
}
```

Features:
- Entity info header (auto-populated from props)
- User selector dropdown (query `api.users.getAll`)
- Priority toggle: Normal / Urgent
- Note textarea
- Cancel / Create Flag buttons
- On submit: call `api.flags.create` mutation
- Close on success with toast notification

**Step 2: Commit**

```bash
git add src/components/FlagCreationModal.tsx
git commit -m "feat: add FlagCreationModal component"
```

---

## Task 6: Wire flag creation into three-dot menus

**Files:**
- Modify: `src/app/docs/components/FileCard.tsx:161-209` (document three-dot menu)
- Modify: Other entity components with three-dot menus (meetings, tasks, projects, clients)

**Step 1: Add "Flag for Review" to FileCard dropdown**

In `FileCard.tsx`, import `FlagCreationModal` and add state for it. In `renderDropdownItems()`, add after the "Move to Folder" item:

```tsx
<DropdownMenuSeparator />
<DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, () => setFlagModalOpen(true))}>
  <Flag className="w-4 h-4 mr-2" />
  Flag for Review
</DropdownMenuItem>
```

Render the `FlagCreationModal` in the component return, passing the document info.

**Step 2: Repeat for other entity menus**

Add the same "Flag for Review" menu item to:
- Meeting cards (find the three-dot menu component for meetings)
- Task rows
- Project page header/menu
- Client page header/menu
- Knowledge checklist items

Each integration follows the same pattern: add state, add menu item, render modal.

**Step 3: Commit**

```bash
git add src/app/docs/components/FileCard.tsx [other modified files]
git commit -m "feat: wire FlagCreationModal into three-dot menus across all entity types"
```

---

## Task 7: Build the Inbox page — Layout and sidebar

**Files:**
- Rewrite: `src/app/inbox/page.tsx` (currently 33-line placeholder)
- Create: `src/app/inbox/components/InboxSidebar.tsx`
- Create: `src/app/inbox/components/InboxItemList.tsx`
- Create: `src/app/inbox/components/InboxDetailPanel.tsx`

**Step 1: Create the Inbox layout**

Use the `@skill frontend-design` skill for enterprise minimalistic styling. The page layout is a two-column split:
- Left: ~320px sidebar with filter tabs + item list
- Right: Detail panel (flag thread view or notification detail)

Main page (`src/app/inbox/page.tsx`):

```tsx
'use client';

// Left sidebar (filter tabs + item list) | Right detail panel
// URL params: ?filter=all|flags|notifications|mentions|resolved&selected={id}
```

**Step 2: Build InboxSidebar with filter tabs**

Filter tabs: All, Flags, Notifications, Mentions, Resolved
Each tab shows unread count badge.
Below tabs: scrollable list of inbox items sorted by time.

**Step 3: Build InboxItemList**

Each item shows:
- Type icon (Flag, Bell, AtSign for mentions)
- Entity name
- Preview text (truncated note/message)
- Timestamp (relative: "2h ago")
- Unread bold dot
- Urgent flags get a red accent

**Step 4: Commit**

```bash
git add src/app/inbox/
git commit -m "feat: build inbox page layout with sidebar filters and item list"
```

---

## Task 8: Build the Inbox detail panel — Flag thread view

**Files:**
- Create: `src/app/inbox/components/FlagDetailPanel.tsx`
- Create: `src/app/inbox/components/ThreadEntry.tsx`

**Step 1: Build FlagDetailPanel**

Shows:
- Entity info header with clickable link to navigate to the entity
- Flag metadata (creator, time, priority badge, status)
- Thread timeline (messages + activity entries interleaved)
- Reply input bar at bottom
- "Resolve flag" checkbox next to Send
- Resolve / Reopen / Delete buttons in header

**Step 2: Build ThreadEntry component**

Two variants:
- `message`: User avatar, name, timestamp, message text
- `activity`: System icon (e.g., move icon), activity description, timestamp — styled differently (muted, smaller)

**Step 3: Build reply functionality**

Reply input calls `api.flags.reply` mutation. If "Resolve" checkbox is checked, pass `resolve: true`.

**Step 4: Commit**

```bash
git add src/app/inbox/components/
git commit -m "feat: build flag detail panel with threaded timeline and reply functionality"
```

---

## Task 9: Update NotificationDropdown to handle flag notifications

**Files:**
- Modify: `src/components/NotificationDropdown.tsx:204-215` (icon switch), `136-148` (click handler)

**Step 1: Add flag icon to the notification type switch**

In the `getNotificationIcon()` function (~line 204), add a case for `"flag"`:

```tsx
case "flag":
  return <Flag className="h-4 w-4 text-orange-500" />;
```

**Step 2: Add flag click handler**

In the notification click handler (~line 136), add navigation for flag notifications:

```tsx
case "flag":
  router.push(`/inbox?flag=${notification.relatedId}`);
  break;
```

**Step 3: Commit**

```bash
git add src/components/NotificationDropdown.tsx
git commit -m "feat: add flag notification rendering and click-to-inbox navigation"
```

---

## Task 10: Add flag indicator badges to entity components

**Files:**
- Modify: `src/app/docs/components/FileCard.tsx` (document list)
- Modify: Other entity display components as needed

**Step 1: Create a reusable FlagIndicator component**

Create `src/components/FlagIndicator.tsx`:

```tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Flag } from 'lucide-react';

interface FlagIndicatorProps {
  entityType: "document" | "meeting" | "task" | "project" | "client" | "checklist_item";
  entityId: string;
}

export function FlagIndicator({ entityType, entityId }: FlagIndicatorProps) {
  const count = useQuery(api.flags.getOpenCountByEntity, { entityType, entityId });
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-orange-500" title={`${count} open flag${count > 1 ? 's' : ''}`}>
      <Flag className="h-3 w-3" />
      {count > 1 && <span className="text-xs">{count}</span>}
    </span>
  );
}
```

**Step 2: Add FlagIndicator to FileCard**

In the document list row, add `<FlagIndicator entityType="document" entityId={document._id} />` next to the filename.

**Step 3: Add to other entity displays**

Repeat for meeting cards, task rows, project headers, client pages.

**Step 4: Commit**

```bash
git add src/components/FlagIndicator.tsx src/app/docs/components/FileCard.tsx [other files]
git commit -m "feat: add flag indicator badges to documents, meetings, tasks, projects, clients"
```

---

## Task 11: Add inbox unread count badge to sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx:45` (inbox nav item)

**Step 1: Add unread count query**

Create a query hook or inline `useQuery` that counts open flags assigned to the current user. Display as a badge next to the Inbox label in the sidebar.

Since the Sidebar component currently uses a simple `NavItem` array, you may need to add a special case for the Inbox item to render a badge. Follow the pattern from `NotificationDropdown.tsx` for badge styling.

**Step 2: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add unread flag count badge to inbox sidebar nav item"
```

---

## Task 12: Add flag tools to the chat tool registry

**Files:**
- Create: `src/lib/tools/domains/flag.tools.ts`
- Modify: `src/lib/tools/types.ts:12-28` (add "flag" to TOOL_DOMAINS)
- Modify: `src/lib/tools/registry.ts:87-104` (register FLAG_TOOLS)
- Modify: `src/lib/tools/executor.ts` (add flag handlers to dispatch table)

**Step 1: Add "flag" to TOOL_DOMAINS**

In `src/lib/tools/types.ts` line 12-28, add `"flag"` to the array:

```typescript
export const TOOL_DOMAINS = [
  "client",
  "project",
  "document",
  "folder",
  "checklist",
  "task",
  "note",
  "contact",
  "reminder",
  "event",
  "knowledgeBank",
  "intelligence",
  "internalDocument",
  "fileQueue",
  "meeting",
  "flag",
] as const;
```

**Step 2: Create flag.tools.ts**

Create `src/lib/tools/domains/flag.tools.ts` following the pattern from `meeting.tools.ts`:

Define 6 tools:
- `getFlags` (read) — get flags by entity, user, or status
- `getFlagThread` (read) — get thread entries for a flag
- `createFlag` (write, requiresConfirmation: true) — create a flag
- `replyToFlag` (write, requiresConfirmation: true) — reply to a flag thread
- `resolveFlag` (write, requiresConfirmation: true) — resolve a flag
- `deleteFlag` (delete, requiresConfirmation: true) — delete a flag

Context relevance: all tools relevant to all contexts (flag is universal).

**Step 3: Register in registry.ts**

Import `FLAG_TOOLS` and add to the constructor array in `registry.ts` line 87-104.

Add "flag" to `CLIENT_CONTEXT_DOMAINS` and `PROJECT_CONTEXT_DOMAINS` arrays, and add core flag tools to `GLOBAL_WRITE_TOOLS`.

**Step 4: Add handlers to executor.ts**

Add flag handlers to the dispatch table following the existing pattern:

```typescript
  // ==========================================================================
  // FLAG
  // ==========================================================================
  getFlags: async (params, client) =>
    client.query(api.flags.getByEntity, {
      entityType: params.entityType,
      entityId: params.entityId,
    }),

  getFlagThread: async (params, client) =>
    client.query(api.flags.getThread, {
      flagId: params.flagId as Id<"flags">,
    }),

  createFlag: async (params, client) =>
    client.mutation(api.flags.create, {
      entityType: params.entityType,
      entityId: params.entityId,
      assignedTo: params.assignedTo ? (params.assignedTo as Id<"users">) : undefined,
      note: params.note,
      priority: params.priority,
      clientId: params.clientId ? (params.clientId as Id<"clients">) : undefined,
      projectId: params.projectId ? (params.projectId as Id<"projects">) : undefined,
    }),

  replyToFlag: async (params, client) =>
    client.mutation(api.flags.reply, {
      flagId: params.flagId as Id<"flags">,
      content: params.content,
      resolve: params.resolve,
    }),

  resolveFlag: async (params, client) =>
    client.mutation(api.flags.resolve, {
      flagId: params.flagId as Id<"flags">,
    }),

  deleteFlag: async (params, client) =>
    client.mutation(api.flags.remove, {
      flagId: params.flagId as Id<"flags">,
    }),
```

**Step 5: Commit**

```bash
git add src/lib/tools/domains/flag.tools.ts src/lib/tools/types.ts src/lib/tools/registry.ts src/lib/tools/executor.ts
git commit -m "feat: add flag domain with 6 tools to chat tool registry"
```

---

## Task 13: Build and verify

**Step 1: Run the build**

Run: `npx next build`
Expected: Build succeeds with no errors

**Step 2: Fix any build errors**

Address any TypeScript errors, missing imports, or type mismatches.

**Step 3: Final commit and push**

```bash
git add -A
git commit -m "fix: resolve build errors for universal flagging feature"
git push origin main
```

---

## Task Summary

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Schema tables + notification type | Small |
| 2 | Notifications backend update | Small |
| 3 | `convex/flags.ts` full CRUD | Medium |
| 4 | Activity auto-logging hooks | Medium |
| 5 | FlagCreationModal component | Medium |
| 6 | Wire into three-dot menus | Medium |
| 7 | Inbox page layout + sidebar | Large (use frontend-design skill) |
| 8 | Inbox detail panel + thread | Large (use frontend-design skill) |
| 9 | NotificationDropdown flag support | Small |
| 10 | Flag indicator badges | Small |
| 11 | Sidebar inbox badge | Small |
| 12 | Chat tool integration | Medium |
| 13 | Build + verify + push | Small |
