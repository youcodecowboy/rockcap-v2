# Unified Inbox & Messaging Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-to-user messaging via a dual-mode chat overlay (Assistant + Messenger), named multi-thread conversations, a mobile inbox for flags + notifications, mobile notification bell, and a "send to message" shortcut on document viewers.

**Architecture:** Two new Convex tables (`conversations`, `directMessages`) power messaging. The existing chat overlay (mobile `ChatOverlay`, desktop `ChatAssistantDrawer`) becomes dual-mode with a toggle between Assistant and Messenger. The mobile inbox at `/m-inbox` contains only Flags + Notifications tabs (NO messages). Entity references are attached via a hierarchical picker (Clients → Projects → Documents). Conversations have required `title` and optional `clientId`/`projectId` for project scoping.

**Tech Stack:** Next.js 16 (App Router), Convex (backend + real-time), React, Tailwind CSS, Lucide React icons, Clerk auth

---

## File Structure

### New Files
```
convex/
  conversations.ts                       # Conversation CRUD + queries (NO dedup, named threads)
  directMessages.ts                      # Message CRUD + queries

src/contexts/
  MessengerContext.tsx                   # Shared state: active mode, open conversation, pre-populated new message

src/components/messages/
  ReferenceChip.tsx                      # Shared entity reference pill (icon + name, clickable)

src/components/chat/                     # Shared messenger components (used by mobile + desktop chat)
  MessengerPanel.tsx                     # Dual-mode messenger root — library | thread | new form
  ConversationLibrary.tsx                # List of conversations
  ConversationThread.tsx                 # Message thread for one conversation
  MessageBubble.tsx                      # Individual message display
  MessageComposer.tsx                    # Text input + "+" picker + send
  EntityPicker.tsx                       # Hierarchical picker (Clients → Projects → Documents)
  NewConversationForm.tsx                # Form for new thread: title, participants, optional client/project
  ModeToggle.tsx                         # Segmented control (Assistant | Messages)

src/app/(mobile)/m-inbox/
  page.tsx                               # Mobile inbox with 2 tabs (Flags, Notifications)
  components/
    InboxTabs.tsx                        # Tab bar (Flags, Notifications)
    MobileFlagList.tsx                   # Flag list
    MobileFlagDetail.tsx                 # Flag detail + thread
    MobileNotificationList.tsx           # Notification list
```

### Modified Files
```
convex/schema.ts                                  # Add conversations, directMessages tables, add "message" notification type
src/components/mobile/MobileHeader.tsx             # Add bell icon with badge
src/components/mobile/StickyFooter.tsx             # Replace Tasks with Inbox
src/components/mobile/MobileNavDrawer.tsx          # Add Inbox item
src/components/mobile/ChatOverlay.tsx              # Add mode toggle, render MessengerPanel
src/components/ChatAssistantDrawer.tsx             # Add mode toggle, render MessengerPanel
src/components/NotificationDropdown.tsx            # Add messages section
src/app/(mobile)/m-docs/components/DocumentViewer.tsx  # Add "send to message" icon in header
```

---

## Task 1: Schema — Add Conversations & Messages Tables

**Files:**
- Modify: `convex/schema.ts:1675-1694` (notification type union) and `:3321` (end of schema, before closing `});`)

- [ ] **Step 1.1: Add `"message"` to notification type union**

In `convex/schema.ts` notifications table (around line 1677), add `v.literal("message")`:

```typescript
// Change from:
    type: v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task"),
      v.literal("changelog"),
      v.literal("flag"),
      v.literal("mention")
    ),

// To:
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
    title: v.string(),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    lastMessageAt: v.optional(v.string()),
    lastMessagePreview: v.optional(v.string()),
    lastMessageSenderId: v.optional(v.id("users")),
    readCursors: v.optional(v.any()),
    createdAt: v.string(),
    createdBy: v.id("users"),
  })
    .index("by_lastMessage", ["lastMessageAt"])
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"]),

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

- [ ] **Step 1.3: Run `npx convex codegen`**

Run: `npx convex codegen`
Expected: Types regenerated without errors.

- [ ] **Step 1.4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add conversations and directMessages tables to schema"
```

---

## Task 2: Backend — Conversations Module

**Files:**
- Create: `convex/conversations.ts`

- [ ] **Step 2.1: Create conversations.ts**

Create `convex/conversations.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";

// ============================================================================
// Queries
// ============================================================================

export const getMyConversations = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const allConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessage")
      .order("desc")
      .collect();

    // Filter to conversations where current user is a participant
    let myConversations = allConversations.filter((c) =>
      c.participantIds.some((pid: any) => pid === user._id)
    );

    if (args.clientId) {
      myConversations = myConversations.filter((c) => c.clientId === args.clientId);
    }
    if (args.projectId) {
      myConversations = myConversations.filter((c) => c.projectId === args.projectId);
    }

    // Enrich with participants, unread counts, and optional entity names
    const enriched = await Promise.all(
      myConversations.map(async (conv) => {
        const participants = await Promise.all(
          conv.participantIds.map(async (pid: any) => {
            const u = await ctx.db.get(pid);
            return u ? { id: u._id, name: u.name || u.email || "Unknown" } : null;
          })
        );

        // Unread count
        const readCursors = (conv.readCursors || {}) as Record<string, string>;
        const myReadCursor = readCursors[user._id];

        const messages = await ctx.db
          .query("directMessages")
          .withIndex("by_conversation", (q: any) => q.eq("conversationId", conv._id))
          .collect();

        let unreadCount = 0;
        if (myReadCursor) {
          unreadCount = messages.filter(
            (m) => m._id > myReadCursor && m.senderId !== user._id
          ).length;
        } else {
          unreadCount = messages.filter((m) => m.senderId !== user._id).length;
        }

        // Optional entity names
        let clientName: string | undefined;
        let projectName: string | undefined;
        if (conv.clientId) {
          const client = await ctx.db.get(conv.clientId);
          clientName = client?.name;
        }
        if (conv.projectId) {
          const project = await ctx.db.get(conv.projectId);
          projectName = project?.name;
        }

        return {
          ...conv,
          participants: participants.filter(Boolean),
          unreadCount,
          clientName,
          projectName,
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

    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }

    const participants = await Promise.all(
      conv.participantIds.map(async (pid: any) => {
        const u = await ctx.db.get(pid);
        return u ? { id: u._id, name: u.name || u.email || "Unknown" } : null;
      })
    );

    let clientName: string | undefined;
    let projectName: string | undefined;
    if (conv.clientId) {
      const client = await ctx.db.get(conv.clientId);
      clientName = client?.name;
    }
    if (conv.projectId) {
      const project = await ctx.db.get(conv.projectId);
      projectName = project?.name;
    }

    return {
      ...conv,
      participants: participants.filter(Boolean),
      clientName,
      projectName,
      currentUserId: user._id,
    };
  },
});

export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    const allConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessage")
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
        .collect();

      if (myReadCursor) {
        total += messages.filter(
          (m) => m._id > myReadCursor && m.senderId !== user._id
        ).length;
      } else {
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
    title: v.string(),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    // Ensure creator is in participant list
    const allParticipants = args.participantIds.includes(user._id)
      ? args.participantIds
      : [user._id, ...args.participantIds];

    if (!args.title.trim()) {
      throw new Error("Conversation title is required");
    }

    // NO 1:1 deduplication — users can create multiple named threads with the same people
    const id = await ctx.db.insert("conversations", {
      participantIds: allParticipants,
      title: args.title.trim(),
      clientId: args.clientId,
      projectId: args.projectId,
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

export const rename = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");
    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }
    if (!args.title.trim()) throw new Error("Title cannot be empty");

    await ctx.db.patch(args.conversationId, { title: args.title.trim() });
  },
});
```

- [ ] **Step 2.2: Run `npx convex codegen`**

Run: `npx convex codegen`
Expected: No errors.

- [ ] **Step 2.3: Commit**

```bash
git add convex/conversations.ts
git commit -m "feat: add conversations Convex module with named multi-thread support"
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
    const limit = args.limit || 100;

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

    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");
    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }

    const messageId = await ctx.db.insert("directMessages", {
      conversationId: args.conversationId,
      senderId: user._id,
      content: args.content,
      references: args.references,
      createdAt: now,
    });

    const preview =
      args.content.length > 80
        ? args.content.substring(0, 80) + "..."
        : args.content;

    await ctx.db.patch(conv._id, {
      lastMessageAt: now,
      lastMessagePreview: preview,
      lastMessageSenderId: user._id,
    });

    // Create notifications for other participants (with 60s cooldown)
    const readCursors = (conv.readCursors || {}) as Record<string, string>;
    const userName = user.name || user.email || "Someone";

    for (const pid of conv.participantIds) {
      if (pid === user._id) continue;

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
        title: `${userName} · ${conv.title}`,
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
    if (message.senderId !== user._id)
      throw new Error("Can only edit own messages");

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
    if (message.senderId !== user._id)
      throw new Error("Can only delete own messages");

    await ctx.db.patch(args.messageId, {
      isDeleted: true,
      content: "",
      references: undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});
```

- [ ] **Step 3.2: Run `npx convex codegen`**

Run: `npx convex codegen`
Expected: No errors.

- [ ] **Step 3.3: Commit**

```bash
git add convex/directMessages.ts
git commit -m "feat: add directMessages Convex module with send, edit, remove"
```

---

## Task 4: Messenger Context

**Files:**
- Create: `src/contexts/MessengerContext.tsx`

- [ ] **Step 4.1: Create MessengerContext**

Create `src/contexts/MessengerContext.tsx`:

```tsx
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import type { EntityReference } from '@/components/messages/ReferenceChip';

export type ChatMode = 'assistant' | 'messenger';
export type MessengerView = 'library' | 'thread' | 'new';

interface PrePopulatedMessage {
  references?: EntityReference[];
  suggestedTitle?: string;
}

interface MessengerContextType {
  // Mode (Assistant vs Messenger)
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;

  // Which view inside messenger
  view: MessengerView;
  setView: (view: MessengerView) => void;

  // Active conversation (when in thread view)
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;

  // Pre-populated data for new conversation form
  prePopulated: PrePopulatedMessage | null;
  setPrePopulated: (data: PrePopulatedMessage | null) => void;

  // Helper: open messenger in new conversation mode with prefilled data
  startNewMessage: (data: PrePopulatedMessage) => void;
}

const MessengerContext = createContext<MessengerContextType | undefined>(undefined);

export function MessengerProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ChatMode>('assistant');
  const [view, setView] = useState<MessengerView>('library');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [prePopulated, setPrePopulated] = useState<PrePopulatedMessage | null>(null);

  const startNewMessage = (data: PrePopulatedMessage) => {
    setMode('messenger');
    setView('new');
    setActiveConversationId(null);
    setPrePopulated(data);
  };

  return (
    <MessengerContext.Provider
      value={{
        mode,
        setMode,
        view,
        setView,
        activeConversationId,
        setActiveConversationId,
        prePopulated,
        setPrePopulated,
        startNewMessage,
      }}
    >
      {children}
    </MessengerContext.Provider>
  );
}

export function useMessenger() {
  const ctx = useContext(MessengerContext);
  if (!ctx) throw new Error('useMessenger must be used within MessengerProvider');
  return ctx;
}
```

- [ ] **Step 4.2: Wire MessengerProvider into app providers**

Find the top-level providers file (likely `src/components/Providers.tsx` or `src/app/layout.tsx`) and wrap children with `<MessengerProvider>`. This makes messenger state available across both the mobile ChatOverlay and the desktop ChatAssistantDrawer AND the document viewer "send" button.

- [ ] **Step 4.3: Commit**

```bash
git add src/contexts/MessengerContext.tsx
git commit -m "feat: add MessengerContext for shared chat overlay state"
```

---

## Task 5: Shared ReferenceChip Component

**Files:**
- Create: `src/components/messages/ReferenceChip.tsx`

- [ ] **Step 5.1: Create ReferenceChip**

Create `src/components/messages/ReferenceChip.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { File, FolderKanban, Building, X } from 'lucide-react';

export interface EntityReference {
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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors}`}>
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
```

- [ ] **Step 5.2: Commit**

```bash
git add src/components/messages/ReferenceChip.tsx
git commit -m "feat: add shared ReferenceChip component for entity references"
```

---

## Task 6: Messenger — Mode Toggle

**Files:**
- Create: `src/components/chat/ModeToggle.tsx`

- [ ] **Step 6.1: Create ModeToggle component**

Create `src/components/chat/ModeToggle.tsx`:

```tsx
'use client';

import { BotMessageSquare, MessagesSquare } from 'lucide-react';
import { useMessenger } from '@/contexts/MessengerContext';

interface ModeToggleProps {
  unreadMessageCount?: number;
  variant?: 'mobile' | 'desktop';
}

export default function ModeToggle({ unreadMessageCount = 0, variant = 'mobile' }: ModeToggleProps) {
  const { mode, setMode } = useMessenger();

  const isMobile = variant === 'mobile';

  return (
    <div className={`flex items-center gap-1 p-0.5 rounded-lg ${
      isMobile ? 'bg-[var(--m-bg-inset)]' : 'bg-gray-100'
    }`}>
      <button
        onClick={() => setMode('assistant')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
          mode === 'assistant'
            ? (isMobile ? 'bg-[var(--m-bg)] text-[var(--m-text-primary)] shadow-sm' : 'bg-white text-gray-900 shadow-sm')
            : (isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-500')
        }`}
      >
        <BotMessageSquare className="w-3.5 h-3.5" />
        Assistant
      </button>
      <button
        onClick={() => setMode('messenger')}
        className={`relative flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
          mode === 'messenger'
            ? (isMobile ? 'bg-[var(--m-bg)] text-[var(--m-text-primary)] shadow-sm' : 'bg-white text-gray-900 shadow-sm')
            : (isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-500')
        }`}
      >
        <MessagesSquare className="w-3.5 h-3.5" />
        Messages
        {unreadMessageCount > 0 && (
          <span className={`min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold px-1 ${
            isMobile ? 'bg-[var(--m-error)] text-white' : 'bg-red-500 text-white'
          }`}>
            {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
          </span>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 6.2: Commit**

```bash
git add src/components/chat/ModeToggle.tsx
git commit -m "feat: add dual-mode toggle for Assistant/Messages switching"
```

---

## Task 7: Messenger — Message Bubble

**Files:**
- Create: `src/components/chat/MessageBubble.tsx`

- [ ] **Step 7.1: Create MessageBubble**

Create `src/components/chat/MessageBubble.tsx`:

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
  variant?: 'mobile' | 'desktop';
}

function formatTime(dateString: string): string {
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
  variant = 'mobile',
}: MessageBubbleProps) {
  const isMobile = variant === 'mobile';

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[80%] ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (
          <span className={`${isMobile ? 'text-[10px] text-[var(--m-text-tertiary)]' : 'text-[11px] text-gray-500'} ml-1 mb-0.5 block`}>
            {senderName}
          </span>
        )}
        <div
          className={`px-3 py-2 rounded-2xl ${
            isMine
              ? (isMobile ? 'bg-[var(--m-accent)] text-white rounded-br-sm' : 'bg-gray-900 text-white rounded-br-sm')
              : (isMobile ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] rounded-bl-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm')
          }`}
        >
          {isDeleted ? (
            <p className="text-[13px] italic opacity-60">This message was deleted</p>
          ) : (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{content}</p>
          )}
        </div>

        {references && references.length > 0 && !isDeleted && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {references.map((ref, i) => (
              <ReferenceChip key={`${ref.type}-${ref.id}-${i}`} reference={ref} />
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className={`${isMobile ? 'text-[10px] text-[var(--m-text-tertiary)]' : 'text-[10px] text-gray-400'}`}>
            {formatTime(createdAt)}
          </span>
          {isEdited && !isDeleted && (
            <span className={`${isMobile ? 'text-[10px] text-[var(--m-text-tertiary)]' : 'text-[10px] text-gray-400'}`}>
              edited
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.2: Commit**

```bash
git add src/components/chat/MessageBubble.tsx
git commit -m "feat: add shared MessageBubble component"
```

---

## Task 8: Messenger — Entity Picker (Hierarchical)

**Files:**
- Create: `src/components/chat/EntityPicker.tsx`

- [ ] **Step 8.1: Create hierarchical EntityPicker**

Create `src/components/chat/EntityPicker.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { X, File, FolderKanban, Building, Search, ChevronRight, ArrowLeft } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { EntityReference } from '@/components/messages/ReferenceChip';

type PickerMode = 'flat' | 'hierarchical';
type FlatTab = 'clients' | 'projects' | 'documents';
type HierarchicalLevel = 'clients' | 'projects' | 'documents';

interface EntityPickerProps {
  onSelect: (ref: EntityReference) => void;
  onClose: () => void;
  variant?: 'mobile' | 'desktop';
}

export default function EntityPicker({ onSelect, onClose, variant = 'mobile' }: EntityPickerProps) {
  const [mode, setMode] = useState<PickerMode>('hierarchical');
  const [flatTab, setFlatTab] = useState<FlatTab>('documents');
  const [level, setLevel] = useState<HierarchicalLevel>('clients');
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [selectedProject, setSelectedProject] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const allDocuments = useQuery(api.documents.getRecent, { limit: 100 });

  const isMobile = variant === 'mobile';

  // Hierarchical filtered items
  const hierarchicalItems = (() => {
    const q = search.toLowerCase();

    if (level === 'clients') {
      return (clients || [])
        .filter((c: any) => !q || c.name?.toLowerCase().includes(q))
        .slice(0, 50);
    }

    if (level === 'projects' && selectedClient) {
      return (projects || [])
        .filter((p: any) => {
          if (p.clientRoles) {
            return p.clientRoles.some((r: any) => r.clientId === selectedClient.id);
          }
          return p.clientId === selectedClient.id;
        })
        .filter((p: any) => !q || p.name?.toLowerCase().includes(q))
        .slice(0, 50);
    }

    if (level === 'documents' && selectedProject) {
      return (allDocuments || [])
        .filter((d: any) => d.projectId === selectedProject.id)
        .filter((d: any) => !q || d.fileName?.toLowerCase().includes(q))
        .slice(0, 50);
    }

    return [];
  })();

  // Flat search items
  const flatItems = (() => {
    const q = search.toLowerCase();

    if (flatTab === 'clients') {
      return (clients || [])
        .filter((c: any) => !q || c.name?.toLowerCase().includes(q))
        .slice(0, 30);
    }
    if (flatTab === 'projects') {
      return (projects || [])
        .filter((p: any) => !q || p.name?.toLowerCase().includes(q))
        .slice(0, 30);
    }
    return (allDocuments || [])
      .filter((d: any) => !q || d.fileName?.toLowerCase().includes(q))
      .slice(0, 30);
  })();

  const handleHierarchicalClick = (item: any) => {
    if (level === 'clients') {
      setSelectedClient({ id: item._id, name: item.name });
      setLevel('projects');
      setSearch('');
    } else if (level === 'projects') {
      setSelectedProject({ id: item._id, name: item.name });
      setLevel('documents');
      setSearch('');
    } else if (level === 'documents') {
      onSelect({
        type: 'document',
        id: item._id,
        name: item.fileName || 'Untitled',
        meta: { clientId: selectedClient?.id, projectId: selectedProject?.id },
      });
    }
  };

  const handleFlatClick = (item: any) => {
    if (flatTab === 'clients') {
      onSelect({ type: 'client', id: item._id, name: item.name || 'Unknown' });
    } else if (flatTab === 'projects') {
      onSelect({ type: 'project', id: item._id, name: item.name || 'Untitled', meta: {} });
    } else {
      onSelect({
        type: 'document',
        id: item._id,
        name: item.fileName || 'Untitled',
        meta: { clientId: item.clientId },
      });
    }
  };

  const goBack = () => {
    if (level === 'documents') {
      setLevel('projects');
      setSelectedProject(null);
    } else if (level === 'projects') {
      setLevel('clients');
      setSelectedClient(null);
    }
    setSearch('');
  };

  // Shared content rendering
  const content = (
    <>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-200'}`}>
        <span className={`text-[14px] font-semibold ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
          Attach Reference
        </span>
        <button onClick={onClose} className={`p-1 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode switcher */}
      <div className={`flex gap-1 px-4 py-2 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-100'}`}>
        <button
          onClick={() => { setMode('hierarchical'); setSearch(''); }}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            mode === 'hierarchical'
              ? (isMobile ? 'bg-[var(--m-accent)] text-white' : 'bg-gray-900 text-white')
              : (isMobile ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]' : 'bg-gray-100 text-gray-600')
          }`}
        >
          Browse
        </button>
        <button
          onClick={() => { setMode('flat'); setSearch(''); }}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            mode === 'flat'
              ? (isMobile ? 'bg-[var(--m-accent)] text-white' : 'bg-gray-900 text-white')
              : (isMobile ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]' : 'bg-gray-100 text-gray-600')
          }`}
        >
          Search
        </button>
      </div>

      {/* Hierarchical mode */}
      {mode === 'hierarchical' && (
        <>
          {/* Breadcrumb */}
          <div className={`flex items-center gap-1.5 px-4 py-2 text-[11px] ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-500'}`}>
            {level !== 'clients' && (
              <button onClick={goBack} className={`p-0.5 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <span>Clients</span>
            {selectedClient && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="truncate max-w-[100px]">{selectedClient.name}</span>
              </>
            )}
            {selectedProject && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="truncate max-w-[100px]">{selectedProject.name}</span>
              </>
            )}
          </div>
        </>
      )}

      {/* Flat tab selector */}
      {mode === 'flat' && (
        <div className={`flex border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-100'}`}>
          {(['clients', 'projects', 'documents'] as FlatTab[]).map((tab) => {
            const Icon = tab === 'clients' ? Building : tab === 'projects' ? FolderKanban : File;
            const active = flatTab === tab;
            return (
              <button
                key={tab}
                onClick={() => { setFlatTab(tab); setSearch(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium capitalize border-b-2 ${
                  active
                    ? (isMobile ? 'text-[var(--m-text-primary)] border-[var(--m-accent)]' : 'text-gray-900 border-gray-900')
                    : (isMobile ? 'text-[var(--m-text-tertiary)] border-transparent' : 'text-gray-400 border-transparent')
                }`}
              >
                <Icon className="w-3 h-3" />
                {tab}
              </button>
            );
          })}
        </div>
      )}

      {/* Search input */}
      <div className="px-4 py-2">
        <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${isMobile ? 'bg-[var(--m-bg-inset)]' : 'bg-gray-50'}`}>
          <Search className={`w-4 h-4 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className={`flex-1 bg-transparent text-[13px] outline-none ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {mode === 'hierarchical' ? (
          hierarchicalItems.length === 0 ? (
            <p className={`text-center text-[12px] py-6 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
              No items found
            </p>
          ) : (
            hierarchicalItems.map((item: any) => {
              const Icon = level === 'clients' ? Building : level === 'projects' ? FolderKanban : File;
              const displayName = level === 'documents' ? item.fileName : item.name;
              const isLeaf = level === 'documents';
              return (
                <button
                  key={item._id}
                  onClick={() => handleHierarchicalClick(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left ${
                    isMobile ? 'active:bg-[var(--m-bg-subtle)]' : 'hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${
                    level === 'clients' ? 'text-green-500' : level === 'projects' ? 'text-purple-500' : 'text-blue-500'
                  }`} />
                  <span className={`flex-1 text-[13px] truncate ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
                    {displayName || 'Untitled'}
                  </span>
                  {!isLeaf && <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`} />}
                </button>
              );
            })
          )
        ) : (
          flatItems.length === 0 ? (
            <p className={`text-center text-[12px] py-6 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
              No results found
            </p>
          ) : (
            flatItems.map((item: any) => {
              const Icon = flatTab === 'clients' ? Building : flatTab === 'projects' ? FolderKanban : File;
              const displayName = flatTab === 'documents' ? item.fileName : item.name;
              return (
                <button
                  key={item._id}
                  onClick={() => handleFlatClick(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left ${
                    isMobile ? 'active:bg-[var(--m-bg-subtle)]' : 'hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${
                    flatTab === 'clients' ? 'text-green-500' : flatTab === 'projects' ? 'text-purple-500' : 'text-blue-500'
                  }`} />
                  <span className={`flex-1 text-[13px] truncate ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
                    {displayName || 'Untitled'}
                  </span>
                </button>
              );
            })
          )
        )}
      </div>
    </>
  );

  // Mobile bottom sheet
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col justify-end">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-[var(--m-bg)] rounded-t-2xl max-h-[75vh] flex flex-col">
          {content}
        </div>
      </div>
    );
  }

  // Desktop popover (centered modal for simplicity)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[420px] max-h-[520px] flex flex-col">
        {content}
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2: Commit**

```bash
git add src/components/chat/EntityPicker.tsx
git commit -m "feat: add hierarchical entity picker (browse + flat search)"
```

---

## Task 9: Messenger — Message Composer

**Files:**
- Create: `src/components/chat/MessageComposer.tsx`

- [ ] **Step 9.1: Create MessageComposer**

Create `src/components/chat/MessageComposer.tsx`:

```tsx
'use client';

import { useState, useRef } from 'react';
import { Plus, Send } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import ReferenceChip, { type EntityReference } from '@/components/messages/ReferenceChip';
import EntityPicker from './EntityPicker';

interface MessageComposerProps {
  conversationId: Id<'conversations'>;
  variant?: 'mobile' | 'desktop';
}

export default function MessageComposer({ conversationId, variant = 'mobile' }: MessageComposerProps) {
  const [text, setText] = useState('');
  const [references, setReferences] = useState<EntityReference[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useMutation(api.directMessages.send);

  const isMobile = variant === 'mobile';

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
    if (isMobile) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    } else {
      // Desktop: Cmd/Ctrl+Enter to send
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
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
      <div className={`border-t px-3 py-2 ${
        isMobile ? 'border-[var(--m-border)] bg-[var(--m-bg)] pb-[env(safe-area-inset-bottom)]' : 'border-gray-200'
      }`}>
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
        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowPicker(true)}
            className={`p-2 flex-shrink-0 ${
              isMobile ? 'text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]' : 'text-gray-400 hover:text-gray-600'
            }`}
            aria-label="Attach reference"
          >
            <Plus className="w-5 h-5" />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMobile ? 'Message…' : 'Type a message… (Cmd+Enter to send)'}
            rows={1}
            className={`flex-1 resize-none rounded-2xl px-3 py-2 text-[13px] outline-none max-h-24 leading-snug ${
              isMobile
                ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)]'
                : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-gray-300'
            }`}
            style={{ minHeight: '36px' }}
          />
          <button
            onClick={handleSend}
            disabled={sending || (!text.trim() && references.length === 0)}
            className={`p-2 flex-shrink-0 ${
              isMobile
                ? 'text-[var(--m-accent)] disabled:text-[var(--m-text-placeholder)] active:opacity-70'
                : 'text-gray-900 disabled:text-gray-300 hover:bg-gray-50 rounded-lg'
            }`}
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showPicker && (
        <EntityPicker
          onSelect={addReference}
          onClose={() => setShowPicker(false)}
          variant={variant}
        />
      )}
    </>
  );
}
```

- [ ] **Step 9.2: Commit**

```bash
git add src/components/chat/MessageComposer.tsx
git commit -m "feat: add shared MessageComposer with entity picker"
```

---

## Task 10: Messenger — Conversation Thread & Library

**Files:**
- Create: `src/components/chat/ConversationThread.tsx`
- Create: `src/components/chat/ConversationLibrary.tsx`

- [ ] **Step 10.1: Create ConversationThread**

Create `src/components/chat/ConversationThread.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useMessenger } from '@/contexts/MessengerContext';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';

interface ConversationThreadProps {
  conversationId: string;
  variant?: 'mobile' | 'desktop';
}

export default function ConversationThread({ conversationId, variant = 'mobile' }: ConversationThreadProps) {
  const { setView, setActiveConversationId } = useMessenger();
  const convId = conversationId as Id<'conversations'>;
  const conversation = useQuery(api.conversations.get, { id: convId });
  const messages = useQuery(api.directMessages.getByConversation, { conversationId: convId });
  const markAsRead = useMutation(api.conversations.markAsRead);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isMobile = variant === 'mobile';

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

  const handleBack = () => {
    setActiveConversationId(null);
    setView('library');
  };

  if (!conversation) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className={`animate-spin rounded-full h-6 w-6 border-b-2 ${isMobile ? 'border-[var(--m-accent)]' : 'border-gray-900'}`} />
      </div>
    );
  }

  const currentUserId = conversation.currentUserId;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className={`flex items-center gap-3 px-3 py-2.5 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-200'}`}>
        <button
          onClick={handleBack}
          className={`p-1 ${isMobile ? 'text-[var(--m-text-secondary)] active:text-[var(--m-text-primary)]' : 'text-gray-500 hover:text-gray-900'}`}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className={`text-[13px] font-semibold truncate ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
            {conversation.title}
          </h2>
          <p className={`text-[10px] truncate ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-500'}`}>
            {conversation.participants
              .filter((p: any) => p.id !== currentUserId)
              .map((p: any) => p.name)
              .join(', ')}
            {conversation.projectName && ` · ${conversation.projectName}`}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {!messages || messages.length === 0 ? (
          <div className="text-center py-8">
            <p className={`text-[12px] ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
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
              variant={variant}
            />
          ))
        )}
      </div>

      {/* Composer */}
      <MessageComposer conversationId={convId} variant={variant} />
    </div>
  );
}
```

- [ ] **Step 10.2: Create ConversationLibrary**

Create `src/components/chat/ConversationLibrary.tsx`:

```tsx
'use client';

import { Plus, MessagesSquare } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useMessenger } from '@/contexts/MessengerContext';

interface ConversationLibraryProps {
  variant?: 'mobile' | 'desktop';
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

export default function ConversationLibrary({ variant = 'mobile' }: ConversationLibraryProps) {
  const { setView, setActiveConversationId } = useMessenger();
  const conversations = useQuery(api.conversations.getMyConversations, {});

  const isMobile = variant === 'mobile';

  const openConversation = (id: string) => {
    setActiveConversationId(id);
    setView('thread');
  };

  const startNew = () => {
    setView('new');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* New conversation button */}
      <div className={`px-3 py-2 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-200'}`}>
        <button
          onClick={startNew}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-medium ${
            isMobile ? 'bg-[var(--m-accent)] text-white active:opacity-80' : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          New Conversation
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {!conversations || conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <MessagesSquare className={`w-8 h-8 mb-2 ${isMobile ? 'text-[var(--m-text-placeholder)]' : 'text-gray-300'}`} />
            <p className={`text-[12px] ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
              No conversations yet
            </p>
          </div>
        ) : (
          conversations.map((conv: any) => {
            const initial = conv.participants?.[0]?.name ? getInitials(conv.participants[0].name) : '?';
            const unread = conv.unreadCount > 0;
            const scopeLabel = conv.projectName || conv.clientName;

            return (
              <button
                key={conv._id}
                onClick={() => openConversation(conv._id)}
                className={`w-full flex items-center gap-3 px-3 py-3 border-b text-left ${
                  isMobile
                    ? 'border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]'
                    : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isMobile ? 'bg-[var(--m-accent-subtle)]' : 'bg-blue-50'
                }`}>
                  <span className={`text-[12px] font-semibold ${isMobile ? 'text-[var(--m-accent)]' : 'text-blue-700'}`}>
                    {initial}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[13px] truncate ${
                      unread
                        ? (isMobile ? 'font-semibold text-[var(--m-text-primary)]' : 'font-semibold text-gray-900')
                        : (isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900')
                    }`}>
                      {conv.title}
                    </span>
                    <span className={`text-[10px] flex-shrink-0 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`}>
                      {formatTime(conv.lastMessageAt || conv.createdAt)}
                    </span>
                  </div>
                  {scopeLabel && (
                    <p className={`text-[10px] truncate ${isMobile ? 'text-[var(--m-accent)]' : 'text-blue-600'}`}>
                      {scopeLabel}
                    </p>
                  )}
                  {conv.lastMessagePreview && (
                    <p className={`text-[11px] truncate mt-0.5 ${
                      unread
                        ? (isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600')
                        : (isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400')
                    }`}>
                      {conv.lastMessagePreview}
                    </p>
                  )}
                </div>

                {unread && (
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isMobile ? 'bg-[var(--m-accent-indicator)]' : 'bg-blue-500'}`} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 10.3: Commit**

```bash
git add src/components/chat/ConversationThread.tsx src/components/chat/ConversationLibrary.tsx
git commit -m "feat: add conversation library and thread view components"
```

---

## Task 11: Messenger — New Conversation Form

**Files:**
- Create: `src/components/chat/NewConversationForm.tsx`

- [ ] **Step 11.1: Create NewConversationForm**

Create `src/components/chat/NewConversationForm.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Check, Search } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useMessenger } from '@/contexts/MessengerContext';
import ReferenceChip from '@/components/messages/ReferenceChip';

interface NewConversationFormProps {
  variant?: 'mobile' | 'desktop';
}

export default function NewConversationForm({ variant = 'mobile' }: NewConversationFormProps) {
  const { setView, setActiveConversationId, prePopulated, setPrePopulated } = useMessenger();
  const [title, setTitle] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [firstMessage, setFirstMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const allUsers = useQuery(api.users.getAll);
  const createConversation = useMutation(api.conversations.create);
  const sendMessage = useMutation(api.directMessages.send);

  const isMobile = variant === 'mobile';

  // Pre-populate title from suggestedTitle if provided
  useEffect(() => {
    if (prePopulated?.suggestedTitle && !title) {
      setTitle(prePopulated.suggestedTitle);
    }
  }, [prePopulated]);

  const filteredUsers = (allUsers || []).filter((u: any) => {
    const q = userSearch.toLowerCase();
    return !q || (u.name || u.email || '').toLowerCase().includes(q);
  });

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleBack = () => {
    setPrePopulated(null);
    setView('library');
  };

  const handleCreate = async () => {
    if (!title.trim() || selectedUserIds.length === 0 || creating) return;
    setCreating(true);
    try {
      const conversationId = await createConversation({
        participantIds: selectedUserIds as Id<'users'>[],
        title: title.trim(),
        clientId: prePopulated?.references?.find((r) => r.type === 'client')?.id as any,
        projectId: prePopulated?.references?.find((r) => r.type === 'project')?.id as any,
      });

      // Send first message if any
      if (firstMessage.trim() || prePopulated?.references) {
        await sendMessage({
          conversationId: conversationId as Id<'conversations'>,
          content: firstMessage.trim(),
          references: prePopulated?.references,
        });
      }

      setPrePopulated(null);
      setActiveConversationId(conversationId as string);
      setView('thread');
    } finally {
      setCreating(false);
    }
  };

  const canCreate = title.trim().length > 0 && selectedUserIds.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className={`flex items-center gap-3 px-3 py-2.5 border-b ${isMobile ? 'border-[var(--m-border)]' : 'border-gray-200'}`}>
        <button
          onClick={handleBack}
          className={`p-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-500 hover:text-gray-900'}`}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className={`text-[13px] font-semibold ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
          New Conversation
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Title */}
        <div>
          <label className={`block text-[11px] font-medium mb-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600'}`}>
            Thread Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Wimbledon Park - Valuation"
            className={`w-full px-3 py-2 rounded-lg text-[13px] outline-none ${
              isMobile
                ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)]'
                : 'bg-gray-50 border border-gray-200 text-gray-900 focus:border-gray-300'
            }`}
          />
        </div>

        {/* Pre-populated references */}
        {prePopulated?.references && prePopulated.references.length > 0 && (
          <div>
            <label className={`block text-[11px] font-medium mb-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600'}`}>
              Attached References
            </label>
            <div className="flex flex-wrap gap-1">
              {prePopulated.references.map((ref, i) => (
                <ReferenceChip key={`${ref.type}-${ref.id}-${i}`} reference={ref} />
              ))}
            </div>
          </div>
        )}

        {/* User picker */}
        <div>
          <label className={`block text-[11px] font-medium mb-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600'}`}>
            Participants
          </label>
          <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 mb-2 ${isMobile ? 'bg-[var(--m-bg-inset)]' : 'bg-gray-50 border border-gray-200'}`}>
            <Search className={`w-4 h-4 ${isMobile ? 'text-[var(--m-text-tertiary)]' : 'text-gray-400'}`} />
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users..."
              className={`flex-1 bg-transparent text-[13px] outline-none ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}
            />
          </div>
          <div className={`max-h-40 overflow-y-auto rounded-lg ${isMobile ? 'bg-[var(--m-bg-inset)]/30' : 'bg-gray-50'}`}>
            {filteredUsers.map((user: any) => {
              const selected = selectedUserIds.includes(user._id);
              return (
                <button
                  key={user._id}
                  onClick={() => toggleUser(user._id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left ${
                    selected
                      ? (isMobile ? 'bg-[var(--m-accent-subtle)]' : 'bg-blue-50')
                      : ''
                  } ${isMobile ? 'active:bg-[var(--m-bg-subtle)]' : 'hover:bg-gray-100'}`}
                >
                  <span className={`flex-1 text-[12px] truncate ${isMobile ? 'text-[var(--m-text-primary)]' : 'text-gray-900'}`}>
                    {user.name || user.email}
                  </span>
                  {selected && <Check className={`w-3.5 h-3.5 ${isMobile ? 'text-[var(--m-accent)]' : 'text-blue-600'}`} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* First message */}
        <div>
          <label className={`block text-[11px] font-medium mb-1 ${isMobile ? 'text-[var(--m-text-secondary)]' : 'text-gray-600'}`}>
            First Message (optional)
          </label>
          <textarea
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            placeholder="Kick off the conversation..."
            rows={3}
            className={`w-full px-3 py-2 rounded-lg text-[13px] outline-none resize-none ${
              isMobile
                ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)]'
                : 'bg-gray-50 border border-gray-200 text-gray-900 focus:border-gray-300'
            }`}
          />
        </div>
      </div>

      {/* Footer */}
      <div className={`px-3 py-2 border-t ${isMobile ? 'border-[var(--m-border)] pb-[env(safe-area-inset-bottom)]' : 'border-gray-200'}`}>
        <button
          onClick={handleCreate}
          disabled={!canCreate || creating}
          className={`w-full py-2.5 rounded-lg text-[13px] font-medium ${
            canCreate && !creating
              ? (isMobile ? 'bg-[var(--m-accent)] text-white active:opacity-80' : 'bg-gray-900 text-white hover:bg-gray-800')
              : (isMobile ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-placeholder)]' : 'bg-gray-100 text-gray-400')
          }`}
        >
          {creating ? 'Creating...' : 'Create Conversation'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2: Commit**

```bash
git add src/components/chat/NewConversationForm.tsx
git commit -m "feat: add new conversation form with named threads and pre-populated references"
```

---

## Task 12: Messenger — Panel Router

**Files:**
- Create: `src/components/chat/MessengerPanel.tsx`

- [ ] **Step 12.1: Create MessengerPanel**

Create `src/components/chat/MessengerPanel.tsx`:

```tsx
'use client';

import { useMessenger } from '@/contexts/MessengerContext';
import ConversationLibrary from './ConversationLibrary';
import ConversationThread from './ConversationThread';
import NewConversationForm from './NewConversationForm';

interface MessengerPanelProps {
  variant?: 'mobile' | 'desktop';
}

export default function MessengerPanel({ variant = 'mobile' }: MessengerPanelProps) {
  const { view, activeConversationId } = useMessenger();

  if (view === 'thread' && activeConversationId) {
    return <ConversationThread conversationId={activeConversationId} variant={variant} />;
  }

  if (view === 'new') {
    return <NewConversationForm variant={variant} />;
  }

  return <ConversationLibrary variant={variant} />;
}
```

- [ ] **Step 12.2: Commit**

```bash
git add src/components/chat/MessengerPanel.tsx
git commit -m "feat: add MessengerPanel routing between library, thread, and new views"
```

---

## Task 13: Mobile Chat Overlay — Dual-Mode Integration

**Files:**
- Modify: `src/components/mobile/ChatOverlay.tsx`

- [ ] **Step 13.1: Update ChatOverlay to be dual-mode**

Replace `src/components/mobile/ChatOverlay.tsx` with:

```tsx
'use client';

import { useEffect } from 'react';
import { X, Paperclip, ArrowUp, BotMessageSquare } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTabs } from '@/contexts/TabContext';
import { useMessenger } from '@/contexts/MessengerContext';
import ModeToggle from '@/components/chat/ModeToggle';
import MessengerPanel from '@/components/chat/MessengerPanel';

interface ChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatOverlay({ isOpen, onClose }: ChatOverlayProps) {
  const { tabs, activeTabId } = useTabs();
  const { mode } = useMessenger();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const unreadMessages = useQuery(api.conversations.getUnreadCount, {});

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative mt-auto h-[85vh] bg-[var(--m-bg)] rounded-t-xl flex flex-col z-10 shadow-2xl">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header with mode toggle */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--m-border)]">
          <ModeToggle unreadMessageCount={unreadMessages ?? 0} variant="mobile" />
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Assistant mode */}
        {mode === 'assistant' && (
          <>
            <div className="flex items-center gap-2.5 px-4 py-2 border-b border-[var(--m-border-subtle)]">
              <div className="w-7 h-7 bg-[var(--m-accent)] rounded-md flex items-center justify-center">
                <BotMessageSquare className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <div className="text-[13px] font-medium text-[var(--m-text-primary)]">Assistant</div>
                {activeTab && activeTab.type !== 'dashboard' && (
                  <div className="text-[11px] text-[var(--m-text-tertiary)]">{activeTab.title}</div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-6 flex items-center justify-center">
              <div className="text-center">
                <div className="text-[var(--m-text-tertiary)] text-[13px]">Chat assistant</div>
                <div className="text-[var(--m-text-placeholder)] text-[11px] mt-1">
                  API integration in a later phase
                </div>
              </div>
            </div>
            <div className="px-3 py-2.5 border-t border-[var(--m-border)] pb-[max(0.625rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 flex items-center justify-center text-[var(--m-text-tertiary)] flex-shrink-0">
                  <Paperclip className="w-4 h-4" />
                </button>
                <div className="flex-1 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 text-[13px] text-[var(--m-text-placeholder)]">
                  Ask anything…
                </div>
                <button className="w-8 h-8 flex items-center justify-center bg-[var(--m-accent)] rounded-lg text-white flex-shrink-0">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* Messenger mode */}
        {mode === 'messenger' && <MessengerPanel variant="mobile" />}
      </div>
    </div>
  );
}
```

- [ ] **Step 13.2: Commit**

```bash
git add src/components/mobile/ChatOverlay.tsx
git commit -m "feat: add dual-mode chat overlay with messenger integration"
```

---

## Task 14: Desktop Chat Drawer — Dual-Mode Integration

**Files:**
- Read: `src/components/ChatAssistantDrawer.tsx` (to understand current structure)
- Modify: `src/components/ChatAssistantDrawer.tsx`

- [ ] **Step 14.1: Read current ChatAssistantDrawer**

Run: Read the file `src/components/ChatAssistantDrawer.tsx` to understand its current structure. This file currently contains the desktop AI assistant drawer.

- [ ] **Step 14.2: Add mode toggle and messenger rendering**

Modify `src/components/ChatAssistantDrawer.tsx` to:

1. Import `useMessenger`, `ModeToggle`, `MessengerPanel`, `useQuery`, `api`
2. Add unread messages query: `const unreadMessages = useQuery(api.conversations.getUnreadCount, {});`
3. Destructure `mode` from `useMessenger()`
4. Add the `<ModeToggle unreadMessageCount={unreadMessages ?? 0} variant="desktop" />` to the drawer header
5. Wrap the existing assistant content in `{mode === 'assistant' && (...)}` 
6. Add `{mode === 'messenger' && <MessengerPanel variant="desktop" />}` below

The exact structure depends on the current drawer layout. Preserve the existing assistant UI entirely — only add the toggle and messenger conditional rendering.

- [ ] **Step 14.3: Commit**

```bash
git add src/components/ChatAssistantDrawer.tsx
git commit -m "feat: add dual-mode support to desktop chat assistant drawer"
```

---

## Task 15: Mobile Header — Notification Bell

**Files:**
- Modify: `src/components/mobile/MobileHeader.tsx`

- [ ] **Step 15.1: Add bell icon with badge**

Replace `src/components/mobile/MobileHeader.tsx`:

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
    (unreadNotifications ?? 0) + (openFlags?.length ?? 0) + (unreadMessages ?? 0);

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
            aria-label="Inbox"
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

- [ ] **Step 15.2: Commit**

```bash
git add src/components/mobile/MobileHeader.tsx
git commit -m "feat: add notification bell with unread badge to mobile header"
```

---

## Task 16: Mobile Bottom Nav — Replace Tasks with Inbox

**Files:**
- Modify: `src/components/mobile/StickyFooter.tsx`
- Modify: `src/components/mobile/MobileNavDrawer.tsx`

- [ ] **Step 16.1: Update StickyFooter**

Replace `src/components/mobile/StickyFooter.tsx`:

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

  const inboxBadge = (unreadNotifications ?? 0) + (openFlags?.length ?? 0);

  const isActive = (href: string) => {
    if (href === '/m-dashboard') return pathname === '/m-dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[var(--m-bg)] border-t border-[var(--m-border)] z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[var(--m-footer-h)] px-2">
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 min-w-[44px]"
            >
              <Icon
                className={`w-[18px] h-[18px] ${
                  active ? 'text-[var(--m-text-primary)]' : 'text-[var(--m-text-tertiary)]'
                }`}
              />
              <span
                className={`text-[9px] tracking-wide uppercase ${
                  active
                    ? 'text-[var(--m-text-primary)] font-medium'
                    : 'text-[var(--m-text-tertiary)]'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Chat FAB — now dual-mode (Assistant + Messenger) */}
        <button
          onClick={onChatOpen}
          className="flex items-center justify-center w-11 h-11 -mt-4 bg-[var(--m-accent)] rounded-full shadow-md"
          aria-label="Open chat"
        >
          <MessageCircle className="w-[18px] h-[18px] text-white" />
        </button>

        {navItems.slice(2).map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const showBadge = item.href === '/m-inbox' && inboxBadge > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center gap-0.5 min-w-[44px]"
            >
              <Icon
                className={`w-[18px] h-[18px] ${
                  active ? 'text-[var(--m-text-primary)]' : 'text-[var(--m-text-tertiary)]'
                }`}
              />
              {showBadge && (
                <span className="absolute -top-1 right-1 bg-[var(--m-error)] text-white text-[8px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5 leading-none">
                  {inboxBadge > 9 ? '9+' : inboxBadge}
                </span>
              )}
              <span
                className={`text-[9px] tracking-wide uppercase ${
                  active
                    ? 'text-[var(--m-text-primary)] font-medium'
                    : 'text-[var(--m-text-tertiary)]'
                }`}
              >
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

- [ ] **Step 16.2: Update MobileNavDrawer**

In `src/components/mobile/MobileNavDrawer.tsx`, update imports and `navItems`:

```typescript
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

- [ ] **Step 16.3: Commit**

```bash
git add src/components/mobile/StickyFooter.tsx src/components/mobile/MobileNavDrawer.tsx
git commit -m "feat: replace Tasks with Inbox in mobile bottom nav and drawer"
```

---

## Task 17: Mobile Inbox — Page Shell & Tabs (Flags + Notifications only)

**Files:**
- Create: `src/app/(mobile)/m-inbox/page.tsx`
- Create: `src/app/(mobile)/m-inbox/components/InboxTabs.tsx`

- [ ] **Step 17.1: Create InboxTabs**

Create `src/app/(mobile)/m-inbox/components/InboxTabs.tsx`:

```tsx
'use client';

import { Flag, Bell } from 'lucide-react';

export type MobileInboxTab = 'flags' | 'notifications';

interface InboxTabsProps {
  activeTab: MobileInboxTab;
  onTabChange: (tab: MobileInboxTab) => void;
  counts: { flags: number; notifications: number };
}

const TABS: Array<{ key: MobileInboxTab; label: string; icon: React.ElementType }> = [
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

- [ ] **Step 17.2: Create mobile inbox page**

Create `src/app/(mobile)/m-inbox/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import InboxTabs, { type MobileInboxTab } from './components/InboxTabs';
import MobileFlagList from './components/MobileFlagList';
import MobileNotificationList from './components/MobileNotificationList';

export default function MobileInboxPage() {
  const [activeTab, setActiveTab] = useState<MobileInboxTab>('flags');

  const openFlags = useQuery(api.flags.getMyFlags, { status: 'open' });
  const unreadNotifications = useQuery(api.notifications.getUnreadCount, {});

  const counts = {
    flags: openFlags?.length ?? 0,
    notifications: unreadNotifications ?? 0,
  };

  return (
    <div className="flex flex-col h-full">
      <InboxTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'flags' && <MobileFlagList />}
        {activeTab === 'notifications' && <MobileNotificationList />}
      </div>
    </div>
  );
}
```

- [ ] **Step 17.3: Commit**

```bash
git add src/app/\(mobile\)/m-inbox/page.tsx src/app/\(mobile\)/m-inbox/components/InboxTabs.tsx
git commit -m "feat: create mobile inbox page with Flags and Notifications tabs"
```

---

## Task 18: Mobile Inbox — Flag List & Detail

**Files:**
- Create: `src/app/(mobile)/m-inbox/components/MobileFlagList.tsx`
- Create: `src/app/(mobile)/m-inbox/components/MobileFlagDetail.tsx`

- [ ] **Step 18.1: Create MobileFlagList**

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
    return <MobileFlagDetail flagId={selectedFlagId} onBack={() => setSelectedFlagId(null)} />;
  }

  return (
    <div>
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

- [ ] **Step 18.2: Create MobileFlagDetail**

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
          <span
            className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
              flag.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
            }`}
          >
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-[var(--m-page-px)] py-3">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-[var(--m-text-primary)]">
              {userMap[flag.createdBy] || 'Unknown'}
            </span>
            <span className="text-[10px] text-[var(--m-text-tertiary)]">{formatTime(flag.createdAt)}</span>
          </div>
          <p className="text-[13px] text-[var(--m-text-primary)] whitespace-pre-wrap leading-relaxed">
            {flag.note}
          </p>
        </div>

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
                  <span className="text-[10px] text-[var(--m-text-tertiary)]">{formatTime(entry.createdAt)}</span>
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

- [ ] **Step 18.3: Commit**

```bash
git add src/app/\(mobile\)/m-inbox/components/MobileFlagList.tsx src/app/\(mobile\)/m-inbox/components/MobileFlagDetail.tsx
git commit -m "feat: add mobile flag list and detail with thread"
```

---

## Task 19: Mobile Inbox — Notification List

**Files:**
- Create: `src/app/(mobile)/m-inbox/components/MobileNotificationList.tsx`

- [ ] **Step 19.1: Create MobileNotificationList**

Create `src/app/(mobile)/m-inbox/components/MobileNotificationList.tsx`:

```tsx
'use client';

import { Clock, CheckSquare, History, Flag, AtSign, Bell, MessageSquare } from 'lucide-react';
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
                    unread ? 'font-semibold text-[var(--m-text-primary)]' : 'text-[var(--m-text-primary)]'
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

- [ ] **Step 19.2: Commit**

```bash
git add src/app/\(mobile\)/m-inbox/components/MobileNotificationList.tsx
git commit -m "feat: add mobile notification list component"
```

---

## Task 20: Document Viewer — "Send to Message" Icon

**Files:**
- Read: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx` (to find header area)
- Modify: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx`

- [ ] **Step 20.1: Read the DocumentViewer to find header location**

Run: Read `src/app/(mobile)/m-docs/components/DocumentViewer.tsx` to find the header area where the document title is rendered.

- [ ] **Step 20.2: Add send icon next to document title**

In `src/app/(mobile)/m-docs/components/DocumentViewer.tsx`:

1. Import `Send` from `lucide-react`
2. Import `useMessenger` from `@/contexts/MessengerContext`
3. Import `useChatDrawer` hook (or equivalent for opening the chat overlay from mobile)
4. Get `startNewMessage` from messenger context
5. Add a button next to the document title:

```tsx
<button
  onClick={() => {
    startNewMessage({
      references: [{
        type: 'document',
        id: document._id,
        name: document.fileName || 'Untitled',
        meta: { clientId: document.clientId, projectId: document.projectId },
      }],
      suggestedTitle: `Re: ${document.fileName || 'Document'}`,
    });
    // Open the chat overlay (may need to use the mobile chat drawer context)
    onOpenChat?.();
  }}
  className="p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-accent)]"
  aria-label="Send to message"
>
  <Send className="w-4 h-4" />
</button>
```

The exact integration depends on how the mobile DocumentViewer currently receives props and how the chat overlay is opened from inside it. The parent component (likely `m-docs/page.tsx`) may need to pass an `onOpenChat` callback down.

- [ ] **Step 20.3: Add same icon to desktop document viewer**

Find the desktop document viewer (likely at `src/app/(desktop)/docs/reader/[documentId]/...`) and add the same `Send` icon button in its header action bar. Use `useChatDrawer` from `@/contexts/ChatDrawerContext` to open the drawer.

- [ ] **Step 20.4: Commit**

```bash
git add src/app/\(mobile\)/m-docs/components/DocumentViewer.tsx src/app/\(desktop\)/docs/
git commit -m "feat: add send-to-message icon on document viewer headers"
```

---

## Task 21: Desktop Notification Dropdown — Add Messages Section

**Files:**
- Modify: `src/components/NotificationDropdown.tsx`

- [ ] **Step 21.1: Add messages section**

In `src/components/NotificationDropdown.tsx`:

1. Add query: `const unreadConversations = useQuery(api.conversations.getMyConversations, {})?.filter((c: any) => c.unreadCount > 0)?.slice(0, 3) || [];`
2. Add a "Messages" section at the top of the dropdown showing up to 3 unread conversations
3. Each row renders title + last preview + click handler that:
   - Closes the dropdown
   - Opens the chat drawer via `useChatDrawer` 
   - Sets messenger mode to 'messenger' and activeConversationId via `useMessenger`

The exact implementation matches the existing row patterns in the file. Keep the existing notifications + uploads sections intact.

- [ ] **Step 21.2: Commit**

```bash
git add src/components/NotificationDropdown.tsx
git commit -m "feat: add unread messages section to desktop notification dropdown"
```

---

## Task 22: Build Verification & Final Commit

- [ ] **Step 22.1: Run `npx convex codegen`**

Run: `npx convex codegen`
Expected: Success.

- [ ] **Step 22.2: Run `npx next build`**

Run: `npx next build`
Expected: Build passes. Fix any type errors, missing imports, or type mismatches.

- [ ] **Step 22.3: Fix any build errors**

Common issues to watch for:
- Missing `as any` casts on Convex ID types
- Optional chaining on query results that might be undefined
- Import path adjustments for the new shared `src/components/chat/` folder

- [ ] **Step 22.4: Final commit and push**

```bash
git add -A
git commit -m "feat: unified inbox & messaging with dual-mode chat overlay (v2)"
git push origin mobile
```
