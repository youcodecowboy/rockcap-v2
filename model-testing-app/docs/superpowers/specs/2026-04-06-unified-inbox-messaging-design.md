# Unified Inbox & Messaging System Design

**Date:** 2026-04-06  
**Status:** Draft v2 — revised after review  
**Scope:** Dual-mode chat overlay (AI + Messenger), user-to-user messaging with named threads, mobile inbox for flags/notifications, document-to-message shortcut

## Revision History

- **v2 (2026-04-06):** Repurposed chat overlay as dual-mode panel (Assistant | Messenger) instead of adding a messages tab to mobile inbox. Removed 1:1 conversation deduplication to support multiple named threads between the same users. Added document viewer "send" icon. Inbox page now focused on flags + notifications only.
- **v1 (2026-04-06):** Initial design with separate mobile inbox page containing messages tab.

---

## 1. Problem Statement

RockCap has a functional but fragmented collaboration system:
- **Flags** exist with threaded replies, but only on desktop's `/inbox` page
- **Notifications** are created from 6 sources but the mobile dashboard only shows 3 recent items with no full view
- **No user-to-user messaging** exists — users can only flag items or comment on documents
- **Mobile has no inbox** — no way to see flags, respond to threads, or receive notifications beyond the dashboard summary
- **Desktop notification bell** exists in the header (`NotificationDropdown`) but functions as an upload status tracker with notifications bolted on — not a clean notification center

Users need a way to communicate directly about documents and projects without leaving the platform, and they need that experience to work across desktop and mobile.

---

## 2. Goals

1. **Dual-Mode Chat Overlay** — repurpose existing chat FAB to toggle between AI Assistant and Messenger modes on mobile AND desktop
2. **Named Multi-Thread Messaging** — users can create multiple named conversations with the same person(s) (e.g., one per project or topic)
3. **Mobile Inbox for Flags & Notifications** — full inbox page showing flagged items and notification history (no messages tab — messages live in chat overlay)
4. **Notification Bell on Mobile** — quick-access notification indicator in mobile header
5. **Document References in Messages** — attach documents, projects, and clients to messages via a picker (hierarchy: clients → projects → documents)
6. **Document Viewer "Send" Shortcut** — icon in document header to start a new message with the document pre-attached

---

## 3. Design Decisions

### 3.1 Messaging Data Model

**Decision:** Two new Convex tables — `conversations` and `directMessages`.

**Why conversations, not just messages?**  
A conversation table provides a natural grouping for message threads, supports both 1:1 and small group chats, enables "last message" previews in conversation lists without scanning all messages, and allows per-user read tracking. This mirrors the pattern Slack/Teams use at small scale.

**`conversations` table:**
```typescript
conversations: defineTable({
  // Participants
  participantIds: v.array(v.id("users")),
  
  // REQUIRED: conversations are named — supports multiple threads between same users
  title: v.string(),                       // User-provided name (e.g., "Wimbledon Park - Valuation")
  
  // Optional entity context — ties thread to a project/client for organization
  clientId: v.optional(v.id("clients")),
  projectId: v.optional(v.id("projects")),
  
  // Denormalized for list rendering
  lastMessageAt: v.optional(v.string()),   // ISO timestamp of last message
  lastMessagePreview: v.optional(v.string()), // First 80 chars of last message
  lastMessageSenderId: v.optional(v.id("users")),
  
  // Per-user read tracking (Map<userId, lastReadMessageId>)
  readCursors: v.optional(v.any()),        // { [userId]: messageId }
  
  createdAt: v.string(),
  createdBy: v.id("users"),
})
  .index("by_lastMessage", ["lastMessageAt"])
  .index("by_client", ["clientId"])
  .index("by_project", ["projectId"])
```

> **Index note:** Convex doesn't support array element indexing, so we'll query by `lastMessageAt` descending and filter by participant client-side. For a handful of users (<20), this is efficient. If scale matters later, add a `conversationMembers` junction table.

> **No 1:1 deduplication:** Unlike v1, users can create multiple conversations with the same person(s). A user might have "Project X discussion" and "Project Y discussion" both with the same colleague. The `title` field makes each thread distinct and scannable.

**`directMessages` table:**
```typescript
directMessages: defineTable({
  conversationId: v.id("conversations"),
  senderId: v.id("users"),
  
  // Content
  content: v.string(),                     // Plain text message body
  
  // Entity references (documents, projects, clients linked to this message)
  references: v.optional(v.array(v.object({
    type: v.union(
      v.literal("document"),
      v.literal("project"),
      v.literal("client")
    ),
    id: v.string(),                        // Entity ID
    name: v.string(),                      // Denormalized display name
    meta: v.optional(v.any()),             // Extra context (e.g., document category, project shortcode)
  }))),
  
  // Status
  isEdited: v.optional(v.boolean()),
  isDeleted: v.optional(v.boolean()),      // Soft delete — shows "message deleted"
  
  createdAt: v.string(),
  updatedAt: v.optional(v.string()),
})
  .index("by_conversation", ["conversationId", "createdAt"])
  .index("by_sender", ["senderId"])
```

**Why plain text, not rich text?**  
This is an internal messaging tool for a small team, not a document editor. Plain text with structured entity references keeps the UI fast, the editor simple, and the messages scannable. Rich text (TipTap) adds complexity with minimal value for short-form communication.

**Why structured `references` array instead of inline @ mentions?**  
Notes use TipTap with inline mentions because they're long-form documents where inline references make sense. Messages are short — a structured references array renders as clickable chips below the message text, is easier to parse, and doesn't require a rich text editor. This keeps message composition fast (important on mobile).

### 3.2 Dual-Mode Chat Overlay (NEW — replaces messages in inbox)

**Decision:** The existing chat overlay (mobile `ChatOverlay`, desktop `ChatAssistantButton` panel) becomes a dual-mode panel with a top toggle switching between **Assistant** and **Messenger** modes.

**Why repurpose the chat overlay instead of a dedicated page?**
- The chat FAB is already the "conversation" affordance in the app — users already expect it to contain conversations
- Avoids cluttering mobile with another full page
- Chat state persists across pages — you can navigate while a conversation is open
- Works consistently on desktop and mobile with the same mental model

**Mode toggle:**
```
┌─────────────────────────┐
│  [Assistant] [Messages] │  ← segmented control at top
├─────────────────────────┤
│                         │
│   (mode content)        │
│                         │
└─────────────────────────┘
```

**Assistant mode:** Existing AI chat behavior — unchanged.

**Messenger mode — conversation library view:**
- List of conversations sorted by `lastMessageAt` descending
- Each row: participant avatar(s), thread title, last message preview, time, unread badge
- "New Conversation" button at the top
- Optional project/client chip shown if thread has entity context
- Tap conversation → enters thread view (within overlay)

**Messenger mode — thread view:**
- Header: back arrow + thread title + participants
- Message bubbles (scrollable, newest at bottom)
- Composer with "+" entity picker and send button
- Back arrow returns to conversation library

**State persistence:** The overlay remembers which mode was active and which conversation was open between open/close cycles within a session.

### 3.3 Mobile Inbox Page (Flags + Notifications only)

**Decision:** Mobile inbox page at `/m-inbox` with 2 tabs: **Flags** and **Notifications**. Messages live in the chat overlay instead.

**Tab structure:**
| Tab | Content | Badge |
|-----|---------|-------|
| **Flags** | Open flags assigned to user → tap for flag detail + thread | Open flag count |
| **Notifications** | All notifications (reminders, mentions, uploads, changelog, new messages) | Unread notification count |

**Why keep the inbox page at all?** 
- Users need a historical view of notifications they've received
- Flags have threading/resolution workflows that need dedicated space
- The chat overlay is optimized for real-time conversation, not browsing historical triage items

**Navigation flow:**
```
Bell icon / bottom nav → Inbox → [Flags | Notifications]
                                    ↓           ↓
                              Flag Detail  Notification
                              (w/ thread)  Detail/Navigate
```

### 3.4 Desktop Inbox (no changes to tabs)

**Decision:** Desktop `/inbox` page keeps its existing 5 tabs (All, Flags, Notifications, Mentions, Resolved). No Messages tab. Messaging happens via the desktop chat panel's new Messenger mode.

**Why no Messages tab?** Consistency with mobile — messages are a chat-overlay concern, not an inbox-page concern. The "All" tab still merges flags and notifications. Message-related notifications (type: `"message"`) still appear in the Notifications tab.

### 3.4 Mobile Notification Bell

**Decision:** Add a bell icon to the mobile header between the search button and UserButton.

**Behavior:**
- Shows red badge with unread count (notifications + unread messages + open flags)
- Tap navigates to `/m-inbox` (not a dropdown — dropdowns are awkward on mobile)
- Badge calculation: `unreadNotifications + unreadMessages + openFlags`

**Why navigate instead of dropdown?**  
The desktop uses a dropdown because there's room. On mobile, a dropdown would cover the content and feel cramped. Tapping the bell takes you to the full inbox where you have room to triage.

### 3.5 Desktop Notification Bell Enhancement

**Decision:** The existing `NotificationDropdown` stays as-is, but add an unread messages section that opens the chat panel in Messenger mode.

The bell already shows notifications and upload progress. We'll add a "Messages" section to the dropdown showing the 3 most recent unread messages. Clicking a message opens the desktop chat panel (not the inbox page) in Messenger mode with that conversation selected.

### 3.6 Mobile Bottom Nav Change

**Decision:** Replace "Tasks" in the bottom nav with "Inbox" (Mail icon with badge).

**Updated bottom nav:** Home | Clients | [Chat FAB] | Docs | Inbox

**Why replace Tasks?**  
- Tasks is also accessible via the navigation drawer (hamburger menu)
- Inbox is a higher-frequency destination — users check flags/notifications multiple times per day
- The chat FAB (now dual-mode: Assistant + Messenger) stays as the center floating button — messaging is reachable from any page
- Tasks remains accessible via dashboard and nav drawer

**Important:** The Inbox button goes to `/m-inbox` (flags + notifications). The chat FAB above it handles messaging. These are two separate affordances:
- **Inbox page** (bottom nav) = historical triage (flags, notifications)  
- **Chat FAB** (center button) = active conversation (AI or messenger)

### 3.7 Entity Reference Picker in Messages (Hierarchical)

**Decision:** "+" button in message composer opens a hierarchical picker that mirrors the real entity structure: **Clients → Projects → Documents**.

**Flow (mobile bottom sheet):**
1. User taps "+" button in composer
2. Bottom sheet opens showing: tabs for **Clients**, **Projects**, **Documents**, plus a "Browse by Client" hierarchical view
3. User can either:
   - **Flat search:** Tap a tab and search by name across all entities of that type
   - **Hierarchical browse:** Start from Clients → tap a client → see their projects → tap a project → see documents in that project
4. At any level, tap an entity to attach it as a reference
5. Multiple references allowed per message (max 5)

**Why hierarchical?**  
Users think in terms of "the Wimbledon Park valuation report" — they navigate mentally from client to project to document. A flat search works for known item names, but the hierarchy helps when users are exploring or aren't sure of the exact filename. Supporting both covers both use cases.

### 3.8 Document Viewer "Send to Message" Shortcut (NEW)

**Decision:** Add a small "send" icon to the document viewer header (same line as the document title) that initiates a new message with the document pre-attached as a reference.

**Flow:**
1. User views a document (desktop or mobile document viewer)
2. User taps the send icon next to the document title
3. Chat overlay opens in Messenger mode
4. A "New Conversation" flow appears with:
   - The document already attached as a reference chip
   - Participant picker to choose recipient(s)
   - Title input (can auto-suggest based on document name, e.g., "Re: Valuation Report.pdf")
5. User fills in recipients + title, writes initial message, sends
6. The new conversation opens in the chat overlay

**Why this entry point?**  
The most common collaboration question is "Hey, have you looked at this document?" The current flow requires navigating away from the document, opening chat, starting a conversation, then searching for the same document to attach. This shortcut collapses that to one tap while the user is already looking at the document.

**Icon placement:**
- **Desktop document viewer:** In the header action bar next to existing actions (download, etc.)
- **Mobile document viewer:** In the tab header area near the document title, using the existing action footer pattern from recent mobile work

**Why not @ mentions like notes?**  
@ mention requires a rich text editor to detect the trigger character and show inline suggestions. A dedicated picker button is more discoverable on mobile (no hidden trigger), works with a plain text input, and makes it clear what you're attaching. The UX is closer to how iMessage/WhatsApp handle attachments.

### 3.8 Notification Generation for Messages

**Decision:** New message → notification for all other participants in the conversation.

- Type: `"message"` (new notification type to add to schema)
- Title: `"${senderName} sent you a message"`
- Message: First 80 chars of message content
- RelatedId: conversationId
- Only sent if recipient hasn't read the conversation recently (avoid spam for active chats)

**Cooldown logic:** If the recipient's `readCursor` for this conversation was updated in the last 60 seconds, skip the notification — they're actively reading.

---

## 4. Component Architecture

### 4.1 New Convex Functions

**`convex/conversations.ts`:**
| Function | Type | Purpose |
|----------|------|---------|
| `create` | mutation | Create new conversation (deduplicates 1:1 by participant set) |
| `getMyConversations` | query | All conversations for current user, sorted by lastMessageAt |
| `get` | query | Single conversation by ID |
| `markAsRead` | mutation | Update readCursor for current user |
| `getUnreadCount` | query | Total unread messages across all conversations |

**`convex/directMessages.ts`:**
| Function | Type | Purpose |
|----------|------|---------|
| `send` | mutation | Create message, update conversation lastMessage fields, create notifications |
| `getByConversation` | query | Paginated messages for a conversation |
| `edit` | mutation | Edit own message (sets isEdited) |
| `remove` | mutation | Soft delete own message |

**Schema updates (`convex/schema.ts`):**
- Add `conversations` table
- Add `directMessages` table
- Add `"message"` to notifications type union

### 4.2 Mobile Components

**New page: `src/app/(mobile)/m-inbox/page.tsx`**
- Tab bar: Flags | Notifications (NO messages tab)
- Uses local state for active tab

**Chat overlay (dual-mode) components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `ChatOverlay.tsx` (modified) | `src/components/mobile/` | Add mode toggle (Assistant ↔ Messenger) at top |
| `ChatModeToggle` | `src/components/mobile/chat/` | Segmented control for Assistant/Messages mode |
| `MessengerPanel` | `src/components/mobile/chat/` | Root of messenger mode — routes to library or thread view |
| `ConversationLibrary` | `src/components/mobile/chat/` | List of conversations with avatar, title, preview, time, unread badge |
| `ConversationThread` | `src/components/mobile/chat/` | Full message thread for one conversation |
| `MessageBubble` | `src/components/mobile/chat/` | Individual message with sender, time, content, reference chips |
| `MessageComposer` | `src/components/mobile/chat/` | Text input + "+" reference picker + send button |
| `EntityPicker` | `src/components/mobile/chat/` | Hierarchical bottom sheet (Clients→Projects→Documents) |
| `NewConversationForm` | `src/components/mobile/chat/` | Form to create a new thread: title + participants + optional client/project |

**Flag components (mobile port):**
| Component | Location | Purpose |
|-----------|----------|---------|
| `MobileFlagList` | `m-inbox/components/` | Flags assigned to user with status toggle |
| `MobileFlagDetail` | `m-inbox/components/` | Flag thread with reply input (adapted from desktop FlagDetailPanel) |

**Notification components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `MobileNotificationList` | `m-inbox/components/` | Full notification list with type icons and actions |

**Document viewer update:**
| Component | Change |
|-----------|--------|
| `DocumentViewer.tsx` (mobile) | Add "send to message" icon in header area — opens chat overlay in Messenger mode with new conversation form pre-populated |

**Header update:**
| Component | Change |
|-----------|--------|
| `MobileHeader.tsx` | Add bell icon with badge between search and UserButton |

**Footer update:**
| Component | Change |
|-----------|--------|
| `StickyFooter.tsx` | Replace Tasks link with Inbox link (Mail icon + badge) |
| `MobileNavDrawer.tsx` | Add "Inbox" nav item, keep Tasks in drawer |

### 4.3 Desktop Components

**Desktop chat panel (dual-mode):**
| Component | Change |
|-----------|--------|
| `ChatAssistantButton.tsx` | Add mode toggle — Assistant ↔ Messenger |

**New desktop chat components (shared with mobile where possible):**
| Component | Location | Purpose |
|-----------|----------|---------|
| `DesktopMessengerPanel` | `src/components/chat/` | Desktop messenger mode root |
| `DesktopConversationLibrary` | `src/components/chat/` | Conversation list for desktop |
| `DesktopConversationThread` | `src/components/chat/` | Message thread view for desktop |
| `DesktopMessageComposer` | `src/components/chat/` | Message input + entity reference popover |
| `DesktopEntityPicker` | `src/components/chat/` | Hierarchical entity picker popover (not a sheet) |
| `DesktopNewConversationForm` | `src/components/chat/` | Desktop form for new thread |

**Inbox page:** **NO changes** — still has 5 tabs (All, Flags, Notifications, Mentions, Resolved), no messaging tab.

**Document viewer update:**
| Component | Change |
|-----------|--------|
| `docs/reader/[documentId]/page.tsx` (desktop) | Add "send to message" icon in header bar — opens chat panel in Messenger mode with new conversation form |

**NotificationDropdown update:**
| Component | Change |
|-----------|--------|
| `NotificationDropdown.tsx` | Add "Messages" section showing 3 most recent unread messages; clicking opens chat panel in Messenger mode |

### 4.4 Shared Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ReferenceChip` | `src/components/messages/` | Reusable entity reference display |
| `ConversationAvatar` | `src/components/messages/` | User avatar(s) for conversation (single or group) |

---

## 5. Data Flow

### 5.1 Sending a Message

```
User types message + optionally attaches references
  ↓
MessageComposer calls directMessages.send({
  conversationId,
  content: "Have you looked at this?",
  references: [{ type: "document", id: "abc", name: "Valuation Report.pdf" }]
})
  ↓
directMessages.send mutation:
  1. Insert message into directMessages table
  2. Update conversation: lastMessageAt, lastMessagePreview, lastMessageSenderId
  3. For each participant (except sender):
     a. Check readCursor freshness (60s cooldown)
     b. If stale, create notification (type: "message")
  ↓
Convex reactivity updates all connected clients:
  - Recipient's conversation list updates (new preview, bumped to top)
  - Recipient's message thread updates (if viewing)
  - Recipient's notification count updates (bell badge)
  - Recipient's inbox unread count updates (bottom nav badge)
```

### 5.2 Reading Messages (Real-time)

```
User opens conversation
  ↓
ConversationView subscribes to:
  - directMessages.getByConversation({ conversationId })
  - conversations.get({ id: conversationId })
  ↓
On mount, calls conversations.markAsRead({ conversationId })
  → Updates readCursor to latest message ID
  → Recalculates unread count (badge updates)
  ↓
New messages appear in real-time via Convex reactivity
  → Auto-scroll to bottom
  → markAsRead called again
```

### 5.3 Unified Inbox Query (Updated)

The existing `getInboxItemsEnriched` query in `convex/flags.ts` will be extended (or a new `getUnifiedInbox` query created) to include conversations:

```typescript
// For "all" filter: flags + notifications + conversations (most recent message)
// For "messages" filter: conversations only
// Sorted by createdAt/lastMessageAt descending
```

---

## 6. UI Specifications

### 6.1 Mobile Inbox Page

**Tab bar** (top of page, below header):
- 3 equal-width tabs with icons and labels
- Active tab: accent underline + bold text
- Badge counts on each tab

**Messages tab — Conversation List:**
- Each row: Avatar | Name + time | Message preview (1 line) | Unread dot
- Unread conversations: bold name, blue dot on right
- Tap → navigate to ConversationView
- FAB: "New Message" button (bottom-right, above footer)
- Pull-to-refresh

**Messages tab — Conversation View:**
- Header: Back arrow + participant name(s) + avatar
- Messages: WhatsApp-style bubbles (sent = right/accent, received = left/gray)
- Reference chips: rendered below message text as small clickable cards
- Composer: text input + "+" button (left) + send button (right)
- Auto-scroll to bottom on new messages

**Flags tab:**
- List of open flags with: entity type badge, entity name, flag note preview, time, priority indicator
- Toggle: "Open" / "Resolved" at top
- Tap → MobileFlagDetail (entity context + thread + reply)

**Notifications tab:**
- List of notifications with: type icon, title, message preview, time
- Unread: bold with accent dot
- Tap → navigate to relevant entity (document, project, etc.) or mark as read
- "Mark all as read" button at top

### 6.2 Mobile Notification Bell

**Location:** Mobile header, right section, between search icon and UserButton.

**Visual:**
- Bell icon (18px, matching existing icon sizes)
- Red badge (top-right): combined count = unread notifications + unread messages + open flags
- Shows "9+" if >9

**Interaction:** Single tap → navigate to `/m-inbox`

### 6.3 Desktop Messages in Inbox

**Left panel (conversation list):**
- Same width as existing inbox sidebar items
- Each row: Avatar | Name | Time | Preview (1 line) | Unread indicator
- "New Conversation" button at top of list

**Right panel (conversation detail):**
- Header: Participant name(s) + avatar(s)
- Message thread: scrollable, newest at bottom
- Each message: sender avatar, name, time, content, reference chips
- Composer at bottom: text input + entity reference popover trigger + send

### 6.4 Entity Reference Picker

**Mobile (bottom sheet):**
- 3 tabs: Documents | Projects | Clients
- Search input at top
- Results list: icon + name + subtitle (category for docs, client for projects)
- Tap to add → chip appears above composer
- Max 5 references per message

**Desktop (popover):**
- Same 3-tab structure
- Triggered by "+" button or keyboard shortcut
- Narrower than mobile sheet, positioned near composer

### 6.5 Reference Chip Rendering

```
┌─────────────────────────┐
│ 📄 Valuation Report.pdf │  ← document reference
└─────────────────────────┘
┌──────────────────────────┐
│ 🏗️ Wimbledon Park 28    │  ← project reference
└──────────────────────────┘
```

- Small rounded pill with entity type icon + name
- Tap/click → navigate to entity
- In composer: shows with "x" to remove
- In message: shows without "x", clickable

---

## 7. Notification Type Updates

### 7.1 Schema Change

Add `"message"` to the notification type union:

```typescript
type: v.union(
  v.literal("file_upload"),
  v.literal("reminder"),
  v.literal("task"),
  v.literal("changelog"),
  v.literal("flag"),
  v.literal("mention"),
  v.literal("message")     // NEW
)
```

### 7.2 Notification Creation Rules

| Event | Notification Type | Recipients | Cooldown |
|-------|------------------|------------|----------|
| New message | `"message"` | All participants except sender | 60s since last readCursor update |
| New conversation created | `"message"` | All participants except creator | None |
| Flag created | `"flag"` | Assigned user | None (existing) |
| Flag reply | `"flag"` | All flag participants | None (existing) |
| Note mention | `"mention"` | Mentioned users | None (existing) |

---

## 8. Conversation Rules

### 8.1 1:1 Deduplication

When creating a conversation between two users, check if one already exists with exactly those two participantIds. If so, return the existing conversation instead of creating a duplicate. This ensures the same two people always share one conversation thread.

### 8.2 Group Conversations

- Supported but optional for v1 — the data model supports it
- Groups have an optional `title` field
- No member add/remove in v1 — set at creation time
- Max 10 participants (practical limit for small team)

### 8.3 Message Editing & Deletion

- Users can edit their own messages (sets `isEdited: true`, shows "edited" label)
- Users can delete their own messages (soft delete — shows "This message was deleted")
- No admin/moderator deletion in v1

### 8.4 Read Tracking

- `readCursors` on conversation stores `{ [userId]: lastReadMessageId }`
- Unread count = messages after the user's read cursor
- Read cursor updates on conversation open and as new messages arrive while viewing

---

## 9. Out of Scope (v1)

- **Push notifications** (web push / mobile push) — UI notifications only for now
- **Typing indicators** — nice-to-have, not essential for small team
- **Message reactions** (emoji reactions) — simple for now
- **File attachments** (images, PDFs uploaded in messages) — use entity references instead
- **Message search** — can add later
- **Read receipts** (showing who has read) — readCursors exist but UI doesn't expose "seen by"
- **Conversation archiving/muting**

---

## 10. Migration & Backward Compatibility

- **No breaking changes** — all new tables, new notification type is additive
- **Desktop inbox** gains a tab but existing tabs unchanged
- **Mobile bottom nav** swaps Tasks → Inbox (Tasks remains in drawer + dashboard)
- **Existing notification bell** gains message section but existing behavior preserved

---

## 11. File Structure (New Files)

```
convex/
  conversations.ts                       # New: conversation CRUD + queries (NO 1:1 dedup)
  directMessages.ts                      # New: message CRUD + queries

src/components/messages/
  ReferenceChip.tsx                      # New: shared entity reference pill

src/components/chat/                     # NEW: shared messenger components
  MessengerMode.tsx                      # New: dual-mode messenger root (works mobile + desktop)
  ConversationLibrary.tsx                # New: conversation list
  ConversationThread.tsx                 # New: message thread view
  MessageBubble.tsx                      # New: individual message
  MessageComposer.tsx                    # New: input + "+" picker + send
  EntityPicker.tsx                       # New: hierarchical picker (sheet on mobile, popover on desktop)
  NewConversationForm.tsx                # New: form with title, participants, optional client/project

src/app/(mobile)/m-inbox/                # Inbox page (flags + notifications only)
  page.tsx                               # New: mobile inbox with 2 tabs
  components/
    InboxTabs.tsx                        # New: tab bar (Flags, Notifications)
    MobileFlagList.tsx                   # New: mobile flag list
    MobileFlagDetail.tsx                 # New: mobile flag detail + thread
    MobileNotificationList.tsx           # New: full notification list
```

**Modified files:**
```
convex/schema.ts                                # Add conversations, directMessages tables; add "message" notification type
convex/flags.ts                                  # (unchanged in v2 — no messages in inbox query)
src/components/mobile/MobileHeader.tsx           # Add bell icon with badge
src/components/mobile/StickyFooter.tsx           # Replace Tasks with Inbox
src/components/mobile/MobileNavDrawer.tsx        # Add Inbox nav item
src/components/mobile/ChatOverlay.tsx            # Make dual-mode (Assistant + Messenger)
src/components/ChatAssistantButton.tsx           # Make dual-mode on desktop
src/components/NotificationDropdown.tsx          # Add messages section (opens chat panel)
src/app/(mobile)/m-docs/components/DocumentViewer.tsx  # Add "send to message" icon
src/app/(desktop)/docs/reader/[documentId]/...   # Add "send to message" icon to desktop doc viewer
```

**Files NOT modified (unlike v1):**
- `src/app/(desktop)/inbox/page.tsx` — no Messages tab
- `src/app/(desktop)/inbox/components/InboxSidebar.tsx` — no Messages tab
- `src/app/(desktop)/inbox/components/InboxItemList.tsx` — no conversation items
- `src/app/(desktop)/inbox/components/InboxDetailPanel.tsx` — no conversation detail panel
