# Unified Inbox & Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-to-user messaging, a full mobile inbox (messages + flags + notifications), a mobile notification bell, and integrate messaging into the existing desktop inbox.

**Architecture:** Two new Convex tables (`conversations`, `directMessages`) power a messaging system shared across desktop and mobile. The mobile gets a new `/m-inbox` page with 3 tabs (Messages, Flags, Notifications). The desktop `/inbox` page gains a "Messages" tab. Entity references (documents, projects, clients) can be attached to messages via a structured picker. The mobile header gets a notification bell, and the bottom nav swaps Tasks for Inbox.

**Tech Stack:** Next.js 16 (App Router), Convex (backend + real-time), React, Tailwind CSS, Lucide React icons, Clerk auth

---

## File Structure

### New Files
```
convex/
  conversations.ts              # Conversation CRUD + queries
  directMessages.ts             # Message CRUD + queries

src/components/messages/
  ReferenceChip.tsx             # Shared entity reference pill (icon + name, clickable)

src/app/(mobile)/m-inbox/
  page.tsx                      # Mobile inbox page with 3 tabs
  components/
    InboxTabs.tsx               # Tab bar (Messages | Flags | Notifications)
    ConversationList.tsx        # List of conversations with preview
    ConversationView.tsx        # Message thread for a conversation
    MessageBubble.tsx           # Individual message display
    MessageComposer.tsx         # Text input + reference picker + send
    EntityPicker.tsx            # Bottom sheet for attaching entities
    MobileFlagList.tsx          # Flags assigned to user
    MobileFlagDetail.tsx        # Flag thread with reply
    MobileNotificationList.tsx  # Full notification list

src/app/(desktop)/inbox/components/
  ConversationDetailPanel.tsx   # Desktop message thread (right panel)
  NewConversationDialog.tsx     # Dialog to pick user(s) and start conversation
```

### Modified Files
```
convex/schema.ts                                    # Add conversations + directMessages tables, add "message" notification type
src/components/mobile/MobileHeader.tsx               # Add bell icon with badge
src/components/mobile/StickyFooter.tsx               # Replace Tasks with Inbox
src/components/mobile/MobileNavDrawer.tsx            # Add Inbox nav item
src/app/(desktop)/inbox/page.tsx                     # Add "messages" filter + conversation queries
src/app/(desktop)/inbox/components/InboxSidebar.tsx  # Add Messages tab
src/app/(desktop)/inbox/components/InboxItemList.tsx # Handle conversation items
src/app/(desktop)/inbox/components/InboxDetailPanel.tsx # Route to ConversationDetailPanel
src/components/NotificationDropdown.tsx              # Add unread messages section
```

---

## Task 1: Schema — Add Conversations & Messages Tables

**Files:**
- Modify: `convex/schema.ts:1675-1694` (notification type union) and `:3321` (end of schema, before closing `});`)

- [ ] **Step 1.1: Add `"message"` to notification type union**

In `convex/schema.ts`, find the notifications table definition (line 1677) and add the new literal:

```typescript
// Old:
    type: v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task"),
      v.literal("changelog"),
      v.literal("flag"),
      v.literal("mention")
    ),

// New:
    type: v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task"),
      v.literal("changelog"),
      v.literal("flag"),
      v.literal("mention"),
      v.literal("message")
    ),
```

- [ ] **Step 1.2: Add `conversations` and `directMessages` tables**

In `convex/schema.ts`, before the closing `});` (line 3322), add:

```typescript
  // ============================================================================
  // Direct Messaging
  // ============================================================================

  conversations: defineTable({
    participantIds: v.array(v.id("users")),
    title: v.optional(v.string()),
    lastMessageAt: v.optional(v.string()),
    lastMessagePreview: v.optional(v.string()),
    lastMessageSenderId: v.optional(v.id("users")),
    readCursors: v.optional(v.any()),
    createdAt: v.string(),
    createdBy: v.id("users"),
  })
    .index("by_lastMessage", ["lastMessageAt"]),

  directMessages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    content: v.string(),
    references: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("document"),
            v.literal("project"),
            v.literal("client")
          ),
          id: v.string(),
          name: v.string(),
          meta: v.optional(v.any()),
        })
      )
    ),
    isEdited: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  })
    .index("by_conversation", ["conversationId", "createdAt"])
    .index("by_sender", ["senderId"]),
```

- [ ] **Step 1.3: Run `npx convex codegen` to regenerate types**

Run: `npx convex codegen`
Expected: Types regenerated successfully, no errors.

- [ ] **Step 1.4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add conversations and directMessages tables to schema"
```

---

## Task 2: Backend — Conversations Module

**Files:**
- Create: `convex/conversations.ts`

- [ ] **Step 2.1: Create conversations.ts with queries and mutations**

Create `convex/conversations.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";

// ============================================================================
// Queries
// ============================================================================

export const getMyConversations = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    // Fetch all conversations, sorted by most recent message
    const allConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessage")
      .order("desc")
      .collect();

    // Filter to conversations where current user is a participant
    const myConversations = allConversations.filter((c) =>
      c.participantIds.some((pid: any) => pid === user._id)
    );

    // Enrich with participant names and unread counts
    const enriched = await Promise.all(
      myConversations.map(async (conv) => {
        // Fetch participant user records
        const participants = await Promise.all(
          conv.participantIds
            .filter((pid: any) => pid !== user._id)
            .map(async (pid: any) => {
              const u = await ctx.db.get(pid);
              return u ? { id: u._id, name: u.name || u.email || "Unknown" } : null;
            })
        );

        // Calculate unread count
        const readCursors = (conv.readCursors || {}) as Record<string, string>;
        const myReadCursor = readCursors[user._id];
        let unreadCount = 0;

        if (myReadCursor) {
          const messages = await ctx.db
            .query("directMessages")
            .withIndex("by_conversation", (q: any) => q.eq("conversationId", conv._id))
            .order("desc")
            .collect();
          unreadCount = messages.filter(
            (m) => m._id > myReadCursor && m.senderId !== user._id
          ).length;
        } else if (conv.lastMessageAt) {
          // Never read — count all messages from others
          const messages = await ctx.db
            .query("directMessages")
            .withIndex("by_conversation", (q: any) => q.eq("conversationId", conv._id))
            .collect();
          unreadCount = messages.filter((m) => m.senderId !== user._id).length;
        }

        return {
          ...conv,
          participants: participants.filter(Boolean),
          unreadCount,
        };
      })
    );

    return enriched;
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const conv = await ctx.db.get(args.id);
    if (!conv) throw new Error("Conversation not found");

    // Verify user is a participant
    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }

    // Enrich with participant names
    const participants = await Promise.all(
      conv.participantIds.map(async (pid: any) => {
        const u = await ctx.db.get(pid);
        return u ? { id: u._id, name: u.name || u.email || "Unknown" } : null;
      })
    );

    return { ...conv, participants: participants.filter(Boolean) };
  },
});

export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    const allConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessage")
      .order("desc")
      .collect();

    const myConversations = allConversations.filter((c) =>
      c.participantIds.some((pid: any) => pid === user._id)
    );

    let total = 0;
    for (const conv of myConversations) {
      const readCursors = (conv.readCursors || {}) as Record<string, string>;
      const myReadCursor = readCursors[user._id];

      const messages = await ctx.db
        .query("directMessages")
        .withIndex("by_conversation", (q: any) => q.eq("conversationId", conv._id))
        .order("desc")
        .collect();

      if (myReadCursor) {
        total += messages.filter(
          (m) => m._id > myReadCursor && m.senderId !== user._id
        ).length;
      } else if (messages.length > 0) {
        total += messages.filter((m) => m.senderId !== user._id).length;
      }
    }

    return total;
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    participantIds: v.array(v.id("users")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    // Ensure creator is in participant list
    const allParticipants = args.participantIds.includes(user._id)
      ? args.participantIds
      : [user._id, ...args.participantIds];

    // For 1:1 conversations, deduplicate
    if (allParticipants.length === 2 && !args.title) {
      const sorted = [...allParticipants].sort();
      const existing = await ctx.db
        .query("conversations")
        .withIndex("by_lastMessage")
        .collect();

      const duplicate = existing.find((c) => {
        if (c.participantIds.length !== 2) return false;
        const cSorted = [...c.participantIds].sort();
        return cSorted[0] === sorted[0] && cSorted[1] === sorted[1];
      });

      if (duplicate) return duplicate._id;
    }

    const id = await ctx.db.insert("conversations", {
      participantIds: allParticipants,
      title: args.title,
      createdAt: now,
      createdBy: user._id,
    });

    return id;
  },
});

export const markAsRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    // Get latest message ID
    const latestMessage = await ctx.db
      .query("directMessages")
      .withIndex("by_conversation", (q: any) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .first();

    if (!latestMessage) return;

    const readCursors = (conv.readCursors || {}) as Record<string, string>;
    readCursors[user._id] = latestMessage._id;

    await ctx.db.patch(conv._id, { readCursors });
  },
});
```

- [ ] **Step 2.2: Run `npx convex codegen` to verify types**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 2.3: Commit**

```bash
git add convex/conversations.ts
git commit -m "feat: add conversations Convex module with queries and mutations"
```

---

## Task 3: Backend — Direct Messages Module

**Files:**
- Create: `convex/directMessages.ts`

- [ ] **Step 3.1: Create directMessages.ts**

Create `convex/directMessages.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";

// ============================================================================
// Queries
// ============================================================================

export const getByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const limit = args.limit || 50;

    // Verify user is a participant
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");
    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }

    const messages = await ctx.db
      .query("directMessages")
      .withIndex("by_conversation", (q: any) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .take(limit);

    // Enrich with sender names
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const senderMap: Record<string, string> = {};
    for (const sid of senderIds) {
      const u = await ctx.db.get(sid);
      senderMap[sid as string] = u?.name || u?.email || "Unknown";
    }

    return messages.map((m) => ({
      ...m,
      senderName: senderMap[m.senderId as string] || "Unknown",
    }));
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    references: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("document"),
            v.literal("project"),
            v.literal("client")
          ),
          id: v.string(),
          name: v.string(),
          meta: v.optional(v.any()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    // Verify user is a participant
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");
    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }

    // Insert message
    const messageId = await ctx.db.insert("directMessages", {
      conversationId: args.conversationId,
      senderId: user._id,
      content: args.content,
      references: args.references,
      createdAt: now,
    });

    // Update conversation with last message info
    const preview =
      args.content.length > 80
        ? args.content.substring(0, 80) + "..."
        : args.content;

    await ctx.db.patch(conv._id, {
      lastMessageAt: now,
      lastMessagePreview: preview,
      lastMessageSenderId: user._id,
    });

    // Create notifications for other participants (with cooldown)
    const readCursors = (conv.readCursors || {}) as Record<string, string>;
    const userName = user.name || user.email || "Someone";

    for (const pid of conv.participantIds) {
      if (pid === user._id) continue;

      // Check cooldown: skip if they read within last 60 seconds
      const cursorId = readCursors[pid as string];
      if (cursorId) {
        const cursorMsg = await ctx.db.get(cursorId as any);
        if (cursorMsg) {
          const cursorTime = new Date(cursorMsg.createdAt).getTime();
          const nowTime = new Date(now).getTime();
          if (nowTime - cursorTime < 60_000) continue;
        }
      }

      await ctx.db.insert("notifications", {
        userId: pid,
        type: "message",
        title: `${userName} sent you a message`,
        message: preview,
        relatedId: conv._id as string,
        isRead: false,
        createdAt: now,
      });
    }

    return messageId;
  },
});

export const edit = mutation({
  args: {
    messageId: v.id("directMessages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== user._id) throw new Error("Can only edit own messages");

    await ctx.db.patch(args.messageId, {
      content: args.content,
      isEdited: true,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { messageId: v.id("directMessages") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== user._id) throw new Error("Can only delete own messages");

    await ctx.db.patch(args.messageId, {
      isDeleted: true,
      content: "",
      references: undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});
```

- [ ] **Step 3.2: Run `npx convex codegen` to verify**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 3.3: Commit**

```bash
git add convex/directMessages.ts
git commit -m "feat: add directMessages Convex module with send, edit, remove"
```

---

## Task 4: Shared Component — ReferenceChip

**Files:**
- Create: `src/components/messages/ReferenceChip.tsx`

- [ ] **Step 4.1: Create the ReferenceChip component**

Create `src/components/messages/ReferenceChip.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { File, FolderKanban, Building, X } from 'lucide-react';

interface EntityReference {
  type: 'document' | 'project' | 'client';
  id: string;
  name: string;
  meta?: any;
}

interface ReferenceChipProps {
  reference: EntityReference;
  removable?: boolean;
  onRemove?: () => void;
}

const ICON_MAP = {
  document: File,
  project: FolderKanban,
  client: Building,
};

const COLOR_MAP = {
  document: 'bg-blue-50 text-blue-700 border-blue-200',
  project: 'bg-purple-50 text-purple-700 border-purple-200',
  client: 'bg-green-50 text-green-700 border-green-200',
};

function getEntityHref(ref: EntityReference): string {
  switch (ref.type) {
    case 'document':
      return `/docs/reader/${ref.id}`;
    case 'project':
      return ref.meta?.clientId
        ? `/clients/${ref.meta.clientId}/projects/${ref.id}`
        : '#';
    case 'client':
      return `/clients/${ref.id}`;
    default:
      return '#';
  }
}

export default function ReferenceChip({ reference, removable, onRemove }: ReferenceChipProps) {
  const Icon = ICON_MAP[reference.type];
  const colors = COLOR_MAP[reference.type];

  const content = (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors}`}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate max-w-[140px]">{reference.name}</span>
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );

  if (removable) return content;

  return (
    <Link href={getEntityHref(reference)} className="hover:opacity-80 transition-opacity">
      {content}
    </Link>
  );
}

export type { EntityReference };
```

- [ ] **Step 4.2: Commit**

```bash
git add src/components/messages/ReferenceChip.tsx
git commit -m "feat: add shared ReferenceChip component for entity references"
```

---

## Task 5: Mobile Header — Notification Bell

**Files:**
- Modify: `src/components/mobile/MobileHeader.tsx`

- [ ] **Step 5.1: Add bell icon with unread badge**

Replace the full content of `src/components/mobile/MobileHeader.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Search, Bell } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import MobileNavDrawer from './MobileNavDrawer';

export default function MobileHeader() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const router = useRouter();

  const unreadNotifications = useQuery(api.notifications.getUnreadCount, {});
  const openFlags = useQuery(api.flags.getMyFlags, { status: 'open' });
  const unreadMessages = useQuery(api.conversations.getUnreadCount, {});

  const totalUnread =
    (unreadNotifications ?? 0) +
    (openFlags?.length ?? 0) +
    (unreadMessages ?? 0);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-[var(--m-header-h)] bg-[var(--m-bg)] border-b border-[var(--m-border)] z-40 flex items-center justify-between px-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 -ml-1 text-[var(--m-text-secondary)] active:text-[var(--m-text-primary)]"
            aria-label="Open navigation menu"
          >
            <Menu className="w-[18px] h-[18px]" />
          </button>
          <span
            className="text-[1.125rem] font-normal tracking-[-0.01em] text-[var(--m-text-primary)]"
            style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
          >
            RockCap
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            className="p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]"
            aria-label="Search"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => router.push('/m-inbox')}
            className="relative p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]"
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-[var(--m-error)] text-white text-[9px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full px-1 leading-none">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
          <div className="w-6 h-6">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <MobileNavDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
```

- [ ] **Step 5.2: Verify no build errors**

Run: `npx next build`
Expected: Build succeeds (may have warnings about missing `/m-inbox` page — that's expected, we'll create it next)

- [ ] **Step 5.3: Commit**

```bash
git add src/components/mobile/MobileHeader.tsx
git commit -m "feat: add notification bell with unread badge to mobile header"
```

---

## Task 6: Mobile Bottom Nav — Replace Tasks with Inbox

**Files:**
- Modify: `src/components/mobile/StickyFooter.tsx`
- Modify: `src/components/mobile/MobileNavDrawer.tsx`

- [ ] **Step 6.1: Update StickyFooter to replace Tasks with Inbox**

In `src/components/mobile/StickyFooter.tsx`, replace the `navItems` array and add unread badge support:

```tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Building, File, Mail, MessageCircle } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

interface StickyFooterProps {
  onChatOpen: () => void;
}

const navItems = [
  { href: '/m-dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/m-clients', label: 'Clients', icon: Building },
  { href: '/m-docs', label: 'Docs', icon: File },
  { href: '/m-inbox', label: 'Inbox', icon: Mail },
];

export default function StickyFooter({ onChatOpen }: StickyFooterProps) {
  const pathname = usePathname();

  const unreadNotifications = useQuery(api.notifications.getUnreadCount, {});
  const openFlags = useQuery(api.flags.getMyFlags, { status: 'open' });
  const unreadMessages = useQuery(api.conversations.getUnreadCount, {});

  const inboxBadge =
    (unreadNotifications ?? 0) +
    (openFlags?.length ?? 0) +
    (unreadMessages ?? 0);

  const isActive = (href: string) => {
    if (href === '/m-dashboard') return pathname === '/m-dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[var(--m-bg)] border-t border-[var(--m-border)] z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[var(--m-footer-h)] px-2">
        {navItems.slice(0, 2).map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 min-w-[44px]"
            >
              <Icon className={`w-[18px] h-[18px] ${active ? 'text-[var(--m-text-primary)]' : 'text-[var(--m-text-tertiary)]'}`} />
              <span className={`text-[9px] tracking-wide uppercase ${active ? 'text-[var(--m-text-primary)] font-medium' : 'text-[var(--m-text-tertiary)]'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Chat FAB */}
        <button
          onClick={onChatOpen}
          className="flex items-center justify-center w-11 h-11 -mt-4 bg-[var(--m-accent)] rounded-full shadow-md"
          aria-label="Open chat assistant"
        >
          <MessageCircle className="w-[18px] h-[18px] text-white" />
        </button>

        {navItems.slice(2).map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const showBadge = item.href === '/m-inbox' && inboxBadge > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center gap-0.5 min-w-[44px]"
            >
              <Icon className={`w-[18px] h-[18px] ${active ? 'text-[var(--m-text-primary)]' : 'text-[var(--m-text-tertiary)]'}`} />
              {showBadge && (
                <span className="absolute -top-1 right-1 bg-[var(--m-error)] text-white text-[8px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5 leading-none">
                  {inboxBadge > 9 ? '9+' : inboxBadge}
                </span>
              )}
              <span className={`text-[9px] tracking-wide uppercase ${active ? 'text-[var(--m-text-primary)] font-medium' : 'text-[var(--m-text-tertiary)]'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6.2: Add Inbox to MobileNavDrawer**

In `src/components/mobile/MobileNavDrawer.tsx`, add `Mail` to imports and add Inbox item to `navItems`:

```typescript
// Update imports:
import {
  X,
  LayoutDashboard,
  Building,
  File,
  CheckSquare,
  FileText,
  ContactRound,
  Mail,
} from 'lucide-react';

// Update navItems array:
const navItems = [
  { href: '/m-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/m-clients', label: 'Clients', icon: Building },
  { href: '/m-docs', label: 'Documents', icon: File },
  { href: '/m-inbox', label: 'Inbox', icon: Mail },
  { href: '/m-tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/m-notes', label: 'Notes', icon: FileText },
  { href: '/m-contacts', label: 'Contacts', icon: ContactRound },
];
```

- [ ] **Step 6.3: Commit**

```bash
git add src/components/mobile/StickyFooter.tsx src/components/mobile/MobileNavDrawer.tsx
git commit -m "feat: replace Tasks with Inbox in mobile bottom nav, add to drawer"
```

---

## Task 7: Mobile Inbox Page — Shell & Tabs

**Files:**
- Create: `src/app/(mobile)/m-inbox/page.tsx`
- Create: `src/app/(mobile)/m-inbox/components/InboxTabs.tsx`

- [ ] **Step 7.1: Create InboxTabs component**

Create `src/app/(mobile)/m-inbox/components/InboxTabs.tsx`:

```tsx
'use client';

import { MessageSquare, Flag, Bell } from 'lucide-react';

export type MobileInboxTab = 'messages' | 'flags' | 'notifications';

interface InboxTabsProps {
  activeTab: MobileInboxTab;
  onTabChange: (tab: MobileInboxTab) => void;
  counts: { messages: number; flags: number; notifications: number };
}

const TABS: Array<{ key: MobileInboxTab; label: string; icon: React.ElementType }> = [
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'flags', label: 'Flags', icon: Flag },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

export default function InboxTabs({ activeTab, onTabChange, counts }: InboxTabsProps) {
  return (
    <div className="flex border-b border-[var(--m-border)] bg-[var(--m-bg)]">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        const count = counts[tab.key] || 0;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors border-b-2 ${
              active
                ? 'text-[var(--m-text-primary)] border-[var(--m-accent)]'
                : 'text-[var(--m-text-tertiary)] border-transparent'
            }`}
          >
            <Icon className="w-[14px] h-[14px]" />
            {tab.label}
            {count > 0 && (
              <span
                className={`min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-semibold px-1 ${
                  active
                    ? 'bg-[var(--m-accent)] text-white'
                    : 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]'
                }`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7.2: Create the mobile inbox page**

Create `src/app/(mobile)/m-inbox/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import InboxTabs, { type MobileInboxTab } from './components/InboxTabs';
import ConversationList from './components/ConversationList';
import MobileFlagList from './components/MobileFlagList';
import MobileNotificationList from './components/MobileNotificationList';

export default function MobileInboxPage() {
  const [activeTab, setActiveTab] = useState<MobileInboxTab>('messages');

  // Queries for badge counts
  const conversations = useQuery(api.conversations.getMyConversations, {});
  const openFlags = useQuery(api.flags.getMyFlags, { status: 'open' });
  const unreadNotifications = useQuery(api.notifications.getUnreadCount, {});

  const counts = {
    messages: conversations?.reduce((sum, c) => sum + (c.unreadCount || 0), 0) ?? 0,
    flags: openFlags?.length ?? 0,
    notifications: unreadNotifications ?? 0,
  };

  return (
    <div className="flex flex-col h-full">
      <InboxTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'messages' && <ConversationList conversations={conversations} />}
        {activeTab === 'flags' && <MobileFlagList />}
        {activeTab === 'notifications' && <MobileNotificationList />}
      </div>
    </div>
  );
}
```

- [ ] **Step 7.3: Commit**

```bash
git add src/app/\(mobile\)/m-inbox/
git commit -m "feat: create mobile inbox page shell with tab navigation"
```

---

## Task 8: Mobile Messages — Conversation List

**Files:**
- Create: `src/app/(mobile)/m-inbox/components/ConversationList.tsx`

- [ ] **Step 8.1: Create ConversationList component**

Create `src/app/(mobile)/m-inbox/components/ConversationList.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import ConversationView from './ConversationView';

interface Participant {
  id: string;
  name: string;
}

interface ConversationItem {
  _id: string;
  participantIds: string[];
  title?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageSenderId?: string;
  participants: Participant[];
  unreadCount: number;
  createdAt: string;
}

interface ConversationListProps {
  conversations: ConversationItem[] | undefined;
}

function formatTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

export default function ConversationList({ conversations }: ConversationListProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);

  // If a conversation is selected, show the message thread
  if (selectedConversationId) {
    return (
      <ConversationView
        conversationId={selectedConversationId}
        onBack={() => setSelectedConversationId(null)}
      />
    );
  }

  return (
    <div className="relative h-full">
      {!conversations || conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <p className="text-[13px] text-[var(--m-text-tertiary)] mb-1">No conversations yet</p>
          <p className="text-[11px] text-[var(--m-text-tertiary)]">
            Start a new message to collaborate with your team
          </p>
        </div>
      ) : (
        <div>
          {conversations.map((conv) => {
            const displayName =
              conv.title || conv.participants.map((p) => p.name).join(', ') || 'Unknown';
            const initial = conv.participants[0]?.name
              ? getInitials(conv.participants[0].name)
              : '?';
            const unread = conv.unreadCount > 0;

            return (
              <button
                key={conv._id}
                onClick={() => setSelectedConversationId(conv._id)}
                className="w-full flex items-center gap-3 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[var(--m-accent-subtle)] flex items-center justify-center flex-shrink-0">
                  <span className="text-[13px] font-semibold text-[var(--m-accent)]">
                    {initial}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[13px] truncate ${
                        unread
                          ? 'font-semibold text-[var(--m-text-primary)]'
                          : 'font-normal text-[var(--m-text-primary)]'
                      }`}
                    >
                      {displayName}
                    </span>
                    <span className="text-[11px] text-[var(--m-text-tertiary)] flex-shrink-0">
                      {formatTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  {conv.lastMessagePreview && (
                    <p
                      className={`text-[12px] mt-0.5 truncate ${
                        unread
                          ? 'text-[var(--m-text-secondary)]'
                          : 'text-[var(--m-text-tertiary)]'
                      }`}
                    >
                      {conv.lastMessagePreview}
                    </p>
                  )}
                </div>

                {/* Unread dot */}
                {unread && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--m-accent-indicator)] flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* New Message FAB */}
      <button
        onClick={() => setShowNewMessage(true)}
        className="fixed right-4 bottom-[calc(var(--m-footer-h)+env(safe-area-inset-bottom)+16px)] w-12 h-12 bg-[var(--m-accent)] rounded-full shadow-lg flex items-center justify-center active:opacity-80 z-20"
        aria-label="New message"
      >
        <Plus className="w-5 h-5 text-white" />
      </button>
    </div>
  );
}
```

- [ ] **Step 8.2: Commit**

```bash
git add src/app/\(mobile\)/m-inbox/components/ConversationList.tsx
git commit -m "feat: add mobile conversation list component"
```

---

## Task 9: Mobile Messages — Conversation View, Bubbles, & Composer

**Files:**
- Create: `src/app/(mobile)/m-inbox/components/ConversationView.tsx`
- Create: `src/app/(mobile)/m-inbox/components/MessageBubble.tsx`
- Create: `src/app/(mobile)/m-inbox/components/MessageComposer.tsx`

- [ ] **Step 9.1: Create MessageBubble component**

Create `src/app/(mobile)/m-inbox/components/MessageBubble.tsx`:

```tsx
'use client';

import ReferenceChip, { type EntityReference } from '@/components/messages/ReferenceChip';

interface MessageBubbleProps {
  content: string;
  senderName: string;
  isMine: boolean;
  isDeleted?: boolean;
  isEdited?: boolean;
  createdAt: string;
  references?: EntityReference[];
}

function formatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({
  content,
  senderName,
  isMine,
  isDeleted,
  isEdited,
  createdAt,
  references,
}: MessageBubbleProps) {
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[80%] ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (
          <span className="text-[10px] text-[var(--m-text-tertiary)] ml-1 mb-0.5 block">
            {senderName}
          </span>
        )}
        <div
          className={`px-3 py-2 rounded-2xl ${
            isMine
              ? 'bg-[var(--m-accent)] text-white rounded-br-sm'
              : 'bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] rounded-bl-sm'
          }`}
        >
          {isDeleted ? (
            <p className="text-[13px] italic opacity-60">This message was deleted</p>
          ) : (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{content}</p>
          )}
        </div>

        {/* References */}
        {references && references.length > 0 && !isDeleted && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {references.map((ref, i) => (
              <ReferenceChip key={`${ref.type}-${ref.id}-${i}`} reference={ref} />
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-[var(--m-text-tertiary)]">
            {formatMessageTime(createdAt)}
          </span>
          {isEdited && !isDeleted && (
            <span className="text-[10px] text-[var(--m-text-tertiary)]">edited</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2: Create MessageComposer component**

Create `src/app/(mobile)/m-inbox/components/MessageComposer.tsx`:

```tsx
'use client';

import { useState, useRef } from 'react';
import { Plus, Send } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import ReferenceChip, { type EntityReference } from '@/components/messages/ReferenceChip';
import EntityPicker from './EntityPicker';

interface MessageComposerProps {
  conversationId: Id<'conversations'>;
}

export default function MessageComposer({ conversationId }: MessageComposerProps) {
  const [text, setText] = useState('');
  const [references, setReferences] = useState<EntityReference[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useMutation(api.directMessages.send);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && references.length === 0) return;
    if (sending) return;

    setSending(true);
    try {
      await sendMessage({
        conversationId,
        content: trimmed,
        references: references.length > 0 ? references : undefined,
      });
      setText('');
      setReferences([]);
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addReference = (ref: EntityReference) => {
    if (references.length >= 5) return;
    if (references.some((r) => r.type === ref.type && r.id === ref.id)) return;
    setReferences([...references, ref]);
    setShowPicker(false);
  };

  const removeReference = (index: number) => {
    setReferences(references.filter((_, i) => i !== index));
  };

  return (
    <>
      <div className="border-t border-[var(--m-border)] bg-[var(--m-bg)] px-3 py-2 pb-[env(safe-area-inset-bottom)]">
        {/* Reference chips */}
        {references.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {references.map((ref, i) => (
              <ReferenceChip
                key={`${ref.type}-${ref.id}-${i}`}
                reference={ref}
                removable
                onRemove={() => removeReference(i)}
              />
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowPicker(true)}
            className="p-2 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)] flex-shrink-0"
            aria-label="Attach reference"
          >
            <Plus className="w-5 h-5" />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-2xl bg-[var(--m-bg-inset)] px-3 py-2 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none max-h-24 leading-snug"
            style={{ minHeight: '36px' }}
          />
          <button
            onClick={handleSend}
            disabled={sending || (!text.trim() && references.length === 0)}
            className="p-2 text-[var(--m-accent)] disabled:text-[var(--m-text-placeholder)] flex-shrink-0 active:opacity-70"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Entity picker bottom sheet */}
      {showPicker && (
        <EntityPicker
          onSelect={addReference}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 9.3: Create ConversationView component**

Create `src/app/(mobile)/m-inbox/components/ConversationView.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';

interface ConversationViewProps {
  conversationId: string;
  onBack: () => void;
}

export default function ConversationView({ conversationId, onBack }: ConversationViewProps) {
  const convId = conversationId as Id<'conversations'>;
  const conversation = useQuery(api.conversations.get, { id: convId });
  const messages = useQuery(api.directMessages.getByConversation, {
    conversationId: convId,
  });
  const markAsRead = useMutation(api.conversations.markAsRead);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark as read on mount and when new messages arrive
  useEffect(() => {
    if (messages && messages.length > 0) {
      markAsRead({ conversationId: convId });
    }
  }, [messages?.length, convId, markAsRead]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--m-accent)]" />
      </div>
    );
  }

  const displayName =
    conversation.title ||
    conversation.participants
      .filter((p: any) => p.id !== conversation.createdBy)
      .map((p: any) => p.name)
      .join(', ') ||
    'Conversation';

  // Determine current user ID from participants
  const allParticipantIds = conversation.participantIds as string[];
  const otherParticipantIds = conversation.participants.map((p: any) => p.id);
  const currentUserId = allParticipantIds.find(
    (pid) => !otherParticipantIds.includes(pid) || conversation.participants.length === allParticipantIds.length
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--m-border)] bg-[var(--m-bg)]">
        <button
          onClick={onBack}
          className="p-1 text-[var(--m-text-secondary)] active:text-[var(--m-text-primary)]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-[var(--m-text-primary)] truncate">
            {displayName}
          </h2>
          <p className="text-[11px] text-[var(--m-text-tertiary)]">
            {conversation.participants.length} participant{conversation.participants.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {!messages || messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[12px] text-[var(--m-text-tertiary)]">
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          messages.map((msg: any) => (
            <MessageBubble
              key={msg._id}
              content={msg.content}
              senderName={msg.senderName}
              isMine={msg.senderId === currentUserId}
              isDeleted={msg.isDeleted}
              isEdited={msg.isEdited}
              createdAt={msg.createdAt}
              references={msg.references}
            />
          ))
        )}
      </div>

      {/* Composer */}
      <MessageComposer conversationId={convId} />
    </div>
  );
}
```

- [ ] **Step 9.4: Commit**

```bash
git add src/app/\(mobile\)/m-inbox/components/MessageBubble.tsx src/app/\(mobile\)/m-inbox/components/MessageComposer.tsx src/app/\(mobile\)/m-inbox/components/ConversationView.tsx
git commit -m "feat: add mobile conversation view with message bubbles and composer"
```

---

## Task 10: Mobile Messages — Entity Picker Bottom Sheet

**Files:**
- Create: `src/app/(mobile)/m-inbox/components/EntityPicker.tsx`

- [ ] **Step 10.1: Create EntityPicker component**

Create `src/app/(mobile)/m-inbox/components/EntityPicker.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { X, File, FolderKanban, Building, Search } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { EntityReference } from '@/components/messages/ReferenceChip';

type PickerTab = 'documents' | 'projects' | 'clients';

interface EntityPickerProps {
  onSelect: (ref: EntityReference) => void;
  onClose: () => void;
}

const TABS: Array<{ key: PickerTab; label: string; icon: React.ElementType }> = [
  { key: 'documents', label: 'Docs', icon: File },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'clients', label: 'Clients', icon: Building },
];

export default function EntityPicker({ onSelect, onClose }: EntityPickerProps) {
  const [activeTab, setActiveTab] = useState<PickerTab>('documents');
  const [search, setSearch] = useState('');

  const documents = useQuery(api.documents.getRecent, { limit: 50 });
  const projects = useQuery(api.projects.list, {});
  const clients = useQuery(api.clients.list, {});

  const filteredItems = (() => {
    const q = search.toLowerCase();

    if (activeTab === 'documents') {
      const docs = documents || [];
      return docs
        .filter((d: any) => !q || d.fileName?.toLowerCase().includes(q))
        .slice(0, 20)
        .map((d: any) => ({
          type: 'document' as const,
          id: d._id,
          name: d.fileName || 'Untitled',
          subtitle: d.category || d.fileTypeDetected || '',
          meta: { clientId: d.clientId },
        }));
    }

    if (activeTab === 'projects') {
      const projs = projects || [];
      return projs
        .filter((p: any) => !q || p.name?.toLowerCase().includes(q))
        .slice(0, 20)
        .map((p: any) => ({
          type: 'project' as const,
          id: p._id,
          name: p.name || 'Untitled',
          subtitle: p.shortcode || '',
          meta: {},
        }));
    }

    const cls = clients || [];
    return cls
      .filter((c: any) => !q || c.name?.toLowerCase().includes(q))
      .slice(0, 20)
      .map((c: any) => ({
        type: 'client' as const,
        id: c._id,
        name: c.name || 'Unknown',
        subtitle: c.type || '',
        meta: {},
      }));
  })();

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-[var(--m-bg)] rounded-t-2xl max-h-[70vh] flex flex-col">
        {/* Handle & close */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--m-border)]">
          <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">
            Attach Reference
          </span>
          <button onClick={onClose} className="p-1 text-[var(--m-text-tertiary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--m-border)]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSearch(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium border-b-2 ${
                  active
                    ? 'text-[var(--m-text-primary)] border-[var(--m-accent)]'
                    : 'text-[var(--m-text-tertiary)] border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 bg-[var(--m-bg-inset)] rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="flex-1 bg-transparent text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pb-[env(safe-area-inset-bottom)]">
          {filteredItems.length === 0 ? (
            <p className="text-center text-[12px] text-[var(--m-text-tertiary)] py-6">
              No results found
            </p>
          ) : (
            filteredItems.map((item) => {
              const Icon = TABS.find((t) => t.key === activeTab + 's' || t.key === activeTab)?.icon || File;
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() =>
                    onSelect({
                      type: item.type,
                      id: item.id,
                      name: item.name,
                      meta: item.meta,
                    })
                  }
                  className="w-full flex items-center gap-3 py-2.5 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left"
                >
                  <div className="w-8 h-8 rounded-md bg-[var(--m-bg-inset)] flex items-center justify-center flex-shrink-0">
                    {activeTab === 'documents' && <File className="w-4 h-4 text-blue-500" />}
                    {activeTab === 'projects' && <FolderKanban className="w-4 h-4 text-purple-500" />}
                    {activeTab === 'clients' && <Building className="w-4 h-4 text-green-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[var(--m-text-primary)] truncate">{item.name}</p>
                    {item.subtitle && (
                      <p className="text-[11px] text-[var(--m-text-tertiary)]">{item.subtitle}</p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2: Commit**

```bash
git add src/app/\(mobile\)/m-inbox/components/EntityPicker.tsx
git commit -m "feat: add entity picker bottom sheet for document/project/client references"
```

---

## Task 11: Mobile Inbox — Flag List & Detail

**Files:**
- Create: `src/app/(mobile)/m-inbox/components/MobileFlagList.tsx`
- Create: `src/app/(mobile)/m-inbox/components/MobileFlagDetail.tsx`

- [ ] **Step 11.1: Create MobileFlagList component**

Create `src/app/(mobile)/m-inbox/components/MobileFlagList.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ENTITY_TYPE_SHORT } from '@/components/threads/utils';
import MobileFlagDetail from './MobileFlagDetail';

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function MobileFlagList() {
  const [showResolved, setShowResolved] = useState(false);
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);

  const flags = useQuery(api.flags.getMyFlags, {
    status: showResolved ? 'resolved' : 'open',
  });

  if (selectedFlagId) {
    return (
      <MobileFlagDetail
        flagId={selectedFlagId}
        onBack={() => setSelectedFlagId(null)}
      />
    );
  }

  return (
    <div>
      {/* Toggle */}
      <div className="flex gap-2 px-[var(--m-page-px)] py-2 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        <button
          onClick={() => setShowResolved(false)}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            !showResolved
              ? 'bg-[var(--m-accent)] text-white'
              : 'bg-[var(--m-bg)] text-[var(--m-text-secondary)] border border-[var(--m-border)]'
          }`}
        >
          Open
        </button>
        <button
          onClick={() => setShowResolved(true)}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            showResolved
              ? 'bg-[var(--m-accent)] text-white'
              : 'bg-[var(--m-bg)] text-[var(--m-text-secondary)] border border-[var(--m-border)]'
          }`}
        >
          Resolved
        </button>
      </div>

      {!flags || flags.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[13px] text-[var(--m-text-tertiary)]">
            No {showResolved ? 'resolved' : 'open'} flags
          </p>
        </div>
      ) : (
        flags.map((flag: any) => (
          <button
            key={flag._id}
            onClick={() => setSelectedFlagId(flag._id)}
            className={`w-full flex items-start gap-3 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left ${
              flag.priority === 'urgent' ? 'border-l-2 border-l-[var(--m-error)]' : ''
            }`}
          >
            <Flag
              className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                flag.priority === 'urgent' ? 'text-[var(--m-error)]' : 'text-orange-500'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {flag.entityType && (
                  <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] uppercase tracking-wide">
                    {ENTITY_TYPE_SHORT[flag.entityType] || flag.entityType}
                  </span>
                )}
                <span className="text-[11px] text-[var(--m-text-tertiary)]">
                  {formatTime(flag.createdAt)}
                </span>
              </div>
              <p className="text-[13px] text-[var(--m-text-primary)] mt-0.5 line-clamp-2">
                {flag.note}
              </p>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 11.2: Create MobileFlagDetail component**

Create `src/app/(mobile)/m-inbox/components/MobileFlagDetail.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Flag, CheckCircle2, RotateCcw } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { ENTITY_TYPE_SHORT } from '@/components/threads/utils';

interface MobileFlagDetailProps {
  flagId: string;
  onBack: () => void;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MobileFlagDetail({ flagId, onBack }: MobileFlagDetailProps) {
  const fId = flagId as Id<'flags'>;
  const flag = useQuery(api.flags.get, { id: fId });
  const thread = useQuery(api.flags.getThread, { flagId: fId });
  const reply = useMutation(api.flags.reply);
  const resolve = useMutation(api.flags.resolve);
  const reopen = useMutation(api.flags.reopen);

  const [replyText, setReplyText] = useState('');
  const [resolveOnSend, setResolveOnSend] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Batch fetch user names
  const userIds = [
    flag?.createdBy,
    flag?.assignedTo,
    flag?.resolvedBy,
    ...(thread?.map((t: any) => t.userId) || []),
  ].filter(Boolean);
  const uniqueUserIds = [...new Set(userIds)] as Id<'users'>[];
  const users = useQuery(
    api.users.getByIds,
    uniqueUserIds.length > 0 ? { ids: uniqueUserIds } : 'skip'
  );

  const userMap: Record<string, string> = {};
  if (users) {
    for (const u of users) {
      if (u) userMap[u._id] = u.name || u.email || 'Unknown';
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.length]);

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await reply({
        flagId: fId,
        content: replyText.trim(),
        resolve: resolveOnSend,
      });
      setReplyText('');
      setResolveOnSend(false);
    } finally {
      setSending(false);
    }
  };

  if (!flag) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--m-accent)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--m-border)] bg-[var(--m-bg)]">
        <button onClick={onBack} className="p-1 text-[var(--m-text-secondary)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Flag className={`w-4 h-4 ${flag.priority === 'urgent' ? 'text-[var(--m-error)]' : 'text-orange-500'}`} />
          {flag.entityType && (
            <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] uppercase tracking-wide">
              {ENTITY_TYPE_SHORT[flag.entityType] || flag.entityType}
            </span>
          )}
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
            flag.status === 'open'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-green-50 text-green-700'
          }`}>
            {flag.status}
          </span>
        </div>
        {flag.status === 'open' ? (
          <button
            onClick={() => resolve({ flagId: fId })}
            className="p-1.5 text-green-600 active:opacity-70"
            aria-label="Resolve"
          >
            <CheckCircle2 className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => reopen({ flagId: fId })}
            className="p-1.5 text-[var(--m-text-secondary)] active:opacity-70"
            aria-label="Reopen"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-[var(--m-page-px)] py-3">
        {/* Original note */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-[var(--m-text-primary)]">
              {userMap[flag.createdBy] || 'Unknown'}
            </span>
            <span className="text-[10px] text-[var(--m-text-tertiary)]">
              {formatTime(flag.createdAt)}
            </span>
          </div>
          <p className="text-[13px] text-[var(--m-text-primary)] whitespace-pre-wrap leading-relaxed">
            {flag.note}
          </p>
        </div>

        {/* Thread entries */}
        {thread?.map((entry: any) => (
          <div
            key={entry._id}
            className={`mb-3 ${
              entry.entryType === 'activity'
                ? 'flex items-center gap-2 text-[11px] text-[var(--m-text-tertiary)] italic'
                : ''
            }`}
          >
            {entry.entryType === 'message' ? (
              <>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-[var(--m-text-primary)]">
                    {entry.userId ? userMap[entry.userId] || 'Unknown' : 'System'}
                  </span>
                  <span className="text-[10px] text-[var(--m-text-tertiary)]">
                    {formatTime(entry.createdAt)}
                  </span>
                </div>
                <p className="text-[13px] text-[var(--m-text-primary)] whitespace-pre-wrap leading-relaxed">
                  {entry.content}
                </p>
              </>
            ) : (
              <>
                <span className="text-[var(--m-text-tertiary)]">—</span>
                <span>{entry.content}</span>
                <span>{formatTime(entry.createdAt)}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Reply input */}
      {flag.status === 'open' && (
        <div className="border-t border-[var(--m-border)] bg-[var(--m-bg)] px-3 py-2 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--m-text-secondary)]">
              <input
                type="checkbox"
                checked={resolveOnSend}
                onChange={(e) => setResolveOnSend(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
              />
              Resolve on send
            </label>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Reply..."
              rows={1}
              className="flex-1 resize-none rounded-2xl bg-[var(--m-bg-inset)] px-3 py-2 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none max-h-24"
              style={{ minHeight: '36px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !replyText.trim()}
              className="px-3 py-2 bg-[var(--m-accent)] text-white rounded-full text-[12px] font-medium disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11.3: Commit**

```bash
git add src/app/\(mobile\)/m-inbox/components/MobileFlagList.tsx src/app/\(mobile\)/m-inbox/components/MobileFlagDetail.tsx
git commit -m "feat: add mobile flag list and flag detail with thread"
```

---

## Task 12: Mobile Inbox — Notification List

**Files:**
- Create: `src/app/(mobile)/m-inbox/components/MobileNotificationList.tsx`

- [ ] **Step 12.1: Create MobileNotificationList component**

Create `src/app/(mobile)/m-inbox/components/MobileNotificationList.tsx`:

```tsx
'use client';

import { Clock, CheckSquare, History, Flag, AtSign, Bell, MessageSquare, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  reminder: { icon: Clock, color: 'text-blue-500' },
  task: { icon: CheckSquare, color: 'text-purple-500' },
  changelog: { icon: History, color: 'text-green-500' },
  flag: { icon: Flag, color: 'text-orange-500' },
  mention: { icon: AtSign, color: 'text-blue-500' },
  message: { icon: MessageSquare, color: 'text-[var(--m-accent)]' },
  file_upload: { icon: Bell, color: 'text-gray-500' },
};

function formatTime(dateString: string): string {
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

export default function MobileNotificationList() {
  const notifications = useQuery(api.notifications.getRecent, {
    limit: 50,
    includeRead: true,
  });
  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length ?? 0;

  return (
    <div>
      {/* Header actions */}
      {unreadCount > 0 && (
        <div className="flex justify-end px-[var(--m-page-px)] py-2 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
          <button
            onClick={() => markAllAsRead({})}
            className="text-[11px] text-[var(--m-accent)] font-medium active:opacity-70"
          >
            Mark all as read
          </button>
        </div>
      )}

      {!notifications || notifications.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[13px] text-[var(--m-text-tertiary)]">No notifications</p>
        </div>
      ) : (
        notifications.map((notif: any) => {
          const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.file_upload;
          const Icon = config.icon;
          const unread = !notif.isRead;

          return (
            <button
              key={notif._id}
              onClick={() => {
                if (unread) markAsRead({ id: notif._id });
              }}
              className={`w-full flex items-start gap-3 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left ${
                unread ? 'bg-[var(--m-accent-subtle)]/30' : ''
              }`}
            >
              <div className="mt-0.5">
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-[13px] leading-snug ${
                    unread
                      ? 'font-semibold text-[var(--m-text-primary)]'
                      : 'text-[var(--m-text-primary)]'
                  }`}
                >
                  {notif.title}
                </p>
                {notif.message && (
                  <p className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
                    {notif.message}
                  </p>
                )}
                <p className="text-[10px] text-[var(--m-text-tertiary)] mt-0.5">
                  {formatTime(notif.createdAt)}
                </p>
              </div>
              {unread && (
                <div className="w-2 h-2 rounded-full bg-[var(--m-accent-indicator)] mt-1.5 flex-shrink-0" />
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 12.2: Commit**

```bash
git add src/app/\(mobile\)/m-inbox/components/MobileNotificationList.tsx
git commit -m "feat: add mobile notification list component"
```

---

## Task 13: Desktop Inbox — Add Messages Tab & Conversation Panel

**Files:**
- Modify: `src/app/(desktop)/inbox/page.tsx`
- Modify: `src/app/(desktop)/inbox/components/InboxSidebar.tsx`
- Modify: `src/app/(desktop)/inbox/components/InboxItemList.tsx`
- Modify: `src/app/(desktop)/inbox/components/InboxDetailPanel.tsx`
- Create: `src/app/(desktop)/inbox/components/ConversationDetailPanel.tsx`
- Create: `src/app/(desktop)/inbox/components/NewConversationDialog.tsx`

- [ ] **Step 13.1: Update InboxSidebar — add Messages tab**

In `src/app/(desktop)/inbox/components/InboxSidebar.tsx`, add `MessageSquare` import and Messages tab:

```typescript
// Update imports:
import { Flag, Bell, AtSign, CheckCircle2, Inbox, MessageSquare } from 'lucide-react';

// Update type:
export type InboxFilter = 'all' | 'messages' | 'flags' | 'notifications' | 'mentions' | 'resolved';

// Update FILTER_TABS:
const FILTER_TABS: FilterTab[] = [
  { key: 'all', label: 'All', icon: Inbox },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'flags', label: 'Flags', icon: Flag },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'mentions', label: 'Mentions', icon: AtSign },
  { key: 'resolved', label: 'Resolved', icon: CheckCircle2 },
];
```

- [ ] **Step 13.2: Update InboxItemList — handle conversation items**

In `src/app/(desktop)/inbox/components/InboxItemList.tsx`, update the `InboxItem` interface and rendering to handle conversations:

```typescript
// Update imports:
import { Flag, Bell, AtSign, MessageSquare } from 'lucide-react';
import { relativeTime, ENTITY_TYPE_SHORT } from '@/components/threads/utils';

// Update InboxItem interface:
export interface InboxItem {
  kind: 'flag' | 'notification' | 'conversation';
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
    // Conversation fields
    lastMessagePreview?: string;
    participantNames?: string;
    unreadCount?: number;
  };
  entityName?: string;
  entityContext?: string;
}

// Update getIcon:
function getIcon(item: InboxItem) {
  if (item.kind === 'conversation') {
    return <MessageSquare className="h-4 w-4 text-blue-500 flex-shrink-0" />;
  }
  if (item.kind === 'flag') {
    return <Flag className="h-4 w-4 text-orange-500 flex-shrink-0" />;
  }
  if (item.data.type === 'flag') {
    return <AtSign className="h-4 w-4 text-blue-500 flex-shrink-0" />;
  }
  return <Bell className="h-4 w-4 text-gray-400 flex-shrink-0" />;
}

// Update getTitle:
function getTitle(item: InboxItem): string {
  if (item.kind === 'conversation') {
    return item.data.participantNames || 'Conversation';
  }
  if (item.kind === 'flag') {
    if (item.entityName) return item.entityName;
    const entity = item.data.entityType
      ? item.data.entityType.charAt(0).toUpperCase() + item.data.entityType.slice(1)
      : 'Item';
    return `Flag: ${entity}`;
  }
  return item.data.title || 'Notification';
}

// Update getPreview:
function getPreview(item: InboxItem): string {
  if (item.kind === 'conversation') {
    return item.data.lastMessagePreview || '';
  }
  const text = item.kind === 'flag' ? item.data.note : item.data.message;
  if (!text) return '';
  return text.length > 60 ? text.substring(0, 60) + '...' : text;
}

// Update isUnread:
function isUnread(item: InboxItem): boolean {
  if (item.kind === 'conversation') {
    return (item.data.unreadCount || 0) > 0;
  }
  if (item.kind === 'flag') {
    return item.data.status === 'open';
  }
  return item.data.isRead === false;
}
```

- [ ] **Step 13.3: Create ConversationDetailPanel**

Create `src/app/(desktop)/inbox/components/ConversationDetailPanel.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Send, Plus } from 'lucide-react';
import ReferenceChip, { type EntityReference } from '@/components/messages/ReferenceChip';

interface ConversationDetailPanelProps {
  conversationId: string;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function ConversationDetailPanel({ conversationId }: ConversationDetailPanelProps) {
  const convId = conversationId as Id<'conversations'>;
  const conversation = useQuery(api.conversations.get, { id: convId });
  const messages = useQuery(api.directMessages.getByConversation, { conversationId: convId });
  const markAsRead = useMutation(api.conversations.markAsRead);
  const sendMessage = useMutation(api.directMessages.send);

  const [text, setText] = useState('');
  const [references, setReferences] = useState<EntityReference[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages && messages.length > 0) {
      markAsRead({ conversationId: convId });
    }
  }, [messages?.length, convId, markAsRead]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && references.length === 0) return;
    if (sending) return;

    setSending(true);
    try {
      await sendMessage({
        conversationId: convId,
        content: trimmed,
        references: references.length > 0 ? references : undefined,
      });
      setText('');
      setReferences([]);
    } finally {
      setSending(false);
    }
  };

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
      </div>
    );
  }

  const displayName =
    conversation.title ||
    conversation.participants.map((p: any) => p.name).join(', ');

  // Determine current user
  const allParticipantIds = conversation.participantIds as string[];
  const knownIds = conversation.participants.map((p: any) => p.id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
        <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
          <span className="text-sm font-semibold text-blue-700">
            {(conversation.participants[0]?.name || '?')[0].toUpperCase()}
          </span>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{displayName}</h2>
          <p className="text-xs text-gray-500">
            {conversation.participants.length + 1} participants
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {messages?.map((msg: any, i: number) => {
          const isMine = !knownIds.includes(msg.senderId);
          const showDate =
            i === 0 ||
            new Date(msg.createdAt).toDateString() !==
              new Date(messages[i - 1].createdAt).toDateString();

          return (
            <div key={msg._id}>
              {showDate && (
                <div className="text-center my-4">
                  <span className="text-[11px] text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                    {formatDateSeparator(msg.createdAt)}
                  </span>
                </div>
              )}
              <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}>
                <div className={`max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}>
                  {!isMine && (
                    <span className="text-[11px] text-gray-500 ml-1 mb-0.5 block">
                      {msg.senderName}
                    </span>
                  )}
                  <div
                    className={`px-3.5 py-2 rounded-2xl ${
                      isMine
                        ? 'bg-gray-900 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                    }`}
                  >
                    {msg.isDeleted ? (
                      <p className="text-sm italic opacity-60">This message was deleted</p>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.references && msg.references.length > 0 && !msg.isDeleted && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : ''}`}>
                      {msg.references.map((ref: EntityReference, j: number) => (
                        <ReferenceChip key={`${ref.type}-${ref.id}-${j}`} reference={ref} />
                      ))}
                    </div>
                  )}
                  <div className={`flex gap-1 mt-0.5 ${isMine ? 'justify-end' : ''}`}>
                    <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                    {msg.isEdited && !msg.isDeleted && (
                      <span className="text-[10px] text-gray-400">edited</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 px-6 py-3">
        {references.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {references.map((ref, i) => (
              <ReferenceChip
                key={`${ref.type}-${ref.id}-${i}`}
                reference={ref}
                removable
                onRemove={() => setReferences(references.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message... (Cmd+Enter to send)"
            rows={1}
            className="flex-1 resize-none rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-300 max-h-32"
            style={{ minHeight: '38px' }}
          />
          <button
            onClick={handleSend}
            disabled={sending || (!text.trim() && references.length === 0)}
            className="p-2 text-gray-900 disabled:text-gray-300 hover:bg-gray-50 rounded-lg"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 13.4: Create NewConversationDialog**

Create `src/app/(desktop)/inbox/components/NewConversationDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { X, Search, Check } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';

interface NewConversationDialogProps {
  onCreated: (conversationId: string) => void;
  onClose: () => void;
}

export default function NewConversationDialog({ onCreated, onClose }: NewConversationDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const allUsers = useQuery(api.users.getAll);
  const createConversation = useMutation(api.conversations.create);

  const filteredUsers = (allUsers || []).filter((u: any) =>
    !search || (u.name || u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (selectedUserIds.length === 0 || creating) return;
    setCreating(true);
    try {
      const id = await createConversation({
        participantIds: selectedUserIds as Id<'users'>[],
      });
      onCreated(id as string);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[400px] max-h-[500px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">New Conversation</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {filteredUsers.map((user: any) => {
            const selected = selectedUserIds.includes(user._id);
            return (
              <button
                key={user._id}
                onClick={() => toggleUser(user._id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                  {(user.name || user.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{user.name || user.email}</p>
                  {user.name && (
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  )}
                </div>
                {selected && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={selectedUserIds.length === 0 || creating}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg disabled:opacity-40 hover:bg-gray-800"
          >
            Start Conversation
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 13.5: Update InboxDetailPanel to route to conversations**

Replace `src/app/(desktop)/inbox/components/InboxDetailPanel.tsx`:

```tsx
'use client';

import { Inbox, Bell } from 'lucide-react';
import FlagDetailPanel from './FlagDetailPanel';
import ConversationDetailPanel from './ConversationDetailPanel';

interface InboxDetailPanelProps {
  selectedId: string | null;
  selectedKind: 'flag' | 'notification' | 'conversation' | null;
}

function NotificationDetail({ id }: { id: string }) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900">Notification</h2>
      </div>
      <p className="text-sm text-gray-500">
        Notification details will be shown here.
      </p>
      <p className="text-[10px] text-gray-300 mt-4 font-mono">{id}</p>
    </div>
  );
}

export default function InboxDetailPanel({ selectedId, selectedKind }: InboxDetailPanelProps) {
  if (!selectedId || !selectedKind) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">Select an item to view details</p>
        </div>
      </div>
    );
  }

  if (selectedKind === 'flag') {
    return <FlagDetailPanel flagId={selectedId} />;
  }

  if (selectedKind === 'conversation') {
    return <ConversationDetailPanel conversationId={selectedId} />;
  }

  return <NotificationDetail id={selectedId} />;
}
```

- [ ] **Step 13.6: Update inbox page.tsx for messages filter and conversation data**

Replace `src/app/(desktop)/inbox/page.tsx`:

```tsx
'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import InboxSidebar, { type InboxFilter } from './components/InboxSidebar';
import InboxItemList, { type InboxItem } from './components/InboxItemList';
import InboxDetailPanel from './components/InboxDetailPanel';
import NewConversationDialog from './components/NewConversationDialog';

const VALID_FILTERS: InboxFilter[] = ['all', 'messages', 'flags', 'notifications', 'mentions', 'resolved'];

function InboxPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [showNewConversation, setShowNewConversation] = useState(false);

  const filterParam = searchParams.get('filter') as InboxFilter | null;
  const activeFilter: InboxFilter =
    filterParam && VALID_FILTERS.includes(filterParam) ? filterParam : 'all';
  const selectedId = searchParams.get('selected') || searchParams.get('flag') || null;

  // Existing queries
  const allItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'all' });
  const flagItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'flags' });
  const notifItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'notifications' });
  const mentionItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'mentions' });
  const resolvedItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'resolved' });

  // Conversations query
  const conversations = useQuery(api.conversations.getMyConversations, {});

  // Convert conversations to InboxItems
  const conversationItems: InboxItem[] = useMemo(() => {
    if (!conversations) return [];
    return conversations.map((c: any) => ({
      kind: 'conversation' as const,
      id: c._id,
      createdAt: c.lastMessageAt || c.createdAt,
      data: {
        lastMessagePreview: c.lastMessagePreview || '',
        participantNames: c.participants?.map((p: any) => p.name).join(', ') || 'Unknown',
        unreadCount: c.unreadCount || 0,
      },
    }));
  }, [conversations]);

  // Current filter items
  const currentItems: InboxItem[] = useMemo(() => {
    if (activeFilter === 'messages') return conversationItems;

    const itemMap: Record<string, typeof allItems> = {
      all: allItems,
      flags: flagItems,
      notifications: notifItems,
      mentions: mentionItems,
      resolved: resolvedItems,
    };

    const baseItems = (itemMap[activeFilter] || []) as InboxItem[];

    // For "all", merge conversations with flags+notifications
    if (activeFilter === 'all') {
      const merged = [...baseItems, ...conversationItems];
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return merged;
    }

    return baseItems;
  }, [activeFilter, allItems, flagItems, notifItems, mentionItems, resolvedItems, conversationItems]);

  const counts = useMemo(
    () => ({
      all: (allItems?.length || 0) + conversationItems.length,
      messages: conversationItems.length,
      flags: flagItems?.length || 0,
      notifications: notifItems?.length || 0,
      mentions: mentionItems?.length || 0,
      resolved: resolvedItems?.length || 0,
    }),
    [allItems, flagItems, notifItems, mentionItems, resolvedItems, conversationItems]
  );

  // Determine kind of selected item
  const selectedKind = useMemo(() => {
    if (!selectedId || !currentItems) return null;
    const item = currentItems.find((i) => i.id === selectedId);
    return item?.kind || null;
  }, [selectedId, currentItems]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.delete('flag');
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const handleFilterChange = useCallback(
    (filter: InboxFilter) => {
      updateParams({ filter: filter === 'all' ? null : filter, selected: null });
    },
    [updateParams]
  );

  const handleSelect = useCallback(
    (id: string) => {
      updateParams({ selected: id });
    },
    [updateParams]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white">
      <InboxSidebar
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
        counts={counts}
      >
        {activeFilter === 'messages' && (
          <div className="px-3 py-2 border-b border-gray-100">
            <button
              onClick={() => setShowNewConversation(true)}
              className="w-full text-xs text-center py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800"
            >
              New Conversation
            </button>
          </div>
        )}
        <InboxItemList
          items={currentItems || []}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </InboxSidebar>

      <div className="flex-1 min-w-0">
        <InboxDetailPanel selectedId={selectedId} selectedKind={selectedKind} />
      </div>

      {showNewConversation && (
        <NewConversationDialog
          onCreated={(id) => {
            setShowNewConversation(false);
            updateParams({ filter: 'messages', selected: id });
          }}
          onClose={() => setShowNewConversation(false)}
        />
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      }
    >
      <InboxPageContent />
    </Suspense>
  );
}
```

- [ ] **Step 13.7: Commit**

```bash
git add src/app/\(desktop\)/inbox/
git commit -m "feat: add Messages tab and conversation detail panel to desktop inbox"
```

---

## Task 14: Desktop Notification Dropdown — Add Messages Section

**Files:**
- Modify: `src/components/NotificationDropdown.tsx`

- [ ] **Step 14.1: Add unread messages section to NotificationDropdown**

In `src/components/NotificationDropdown.tsx`, add a messages query and render a small section above the existing notifications. Find the component body and add after the existing Convex imports:

```typescript
// Add to existing imports
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

// Inside the component, add this query alongside existing ones:
const conversations = useQuery(api.conversations.getMyConversations, {});
const unreadConversations = conversations?.filter((c: any) => c.unreadCount > 0)?.slice(0, 3) || [];
```

Then add a messages section in the dropdown JSX, before the existing notifications section. Render each unread conversation as a clickable row linking to `/inbox?filter=messages&selected=${conv._id}`.

Due to the file being 531 lines, the exact insertion point will depend on the current structure. The section should match existing notification row styling (icon, title, message preview, time).

- [ ] **Step 14.2: Commit**

```bash
git add src/components/NotificationDropdown.tsx
git commit -m "feat: add unread messages section to desktop notification dropdown"
```

---

## Task 15: Build Verification & Final Commit

- [ ] **Step 15.1: Run `npx convex codegen`**

Run: `npx convex codegen`
Expected: Success, all types generated

- [ ] **Step 15.2: Run `npx next build`**

Run: `npx next build`
Expected: Build passes. Fix any type errors or import issues that arise.

- [ ] **Step 15.3: Fix any build errors**

Address any TypeScript errors, missing imports, or type mismatches found during the build. Common issues:
- Missing `as any` casts on Convex ID types
- Import paths needing adjustment
- Optional chaining on potentially undefined query results

- [ ] **Step 15.4: Final commit and push**

```bash
git add -A
git commit -m "feat: unified inbox with messaging, mobile notifications, and desktop enhancements"
git push origin mobile
```
