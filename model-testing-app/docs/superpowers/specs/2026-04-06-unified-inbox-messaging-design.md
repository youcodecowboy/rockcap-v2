# Unified Inbox & Messaging System Design

**Date:** 2026-04-06  
**Status:** Draft — awaiting review  
**Scope:** Mobile inbox, user-to-user messaging, desktop enhancements, notification improvements

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

1. **Mobile Inbox** — full-featured inbox with flags, notifications, and messages on mobile
2. **User-to-User Messaging** — direct messaging between users with document/project references
3. **Desktop Messaging** — add messaging tab to existing desktop inbox
4. **Notification Bell on Mobile** — quick-access notification indicator in mobile header
5. **Document References in Messages** — attach documents, projects, and clients to messages (like @ mentions in notes)

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
  
  // Optional metadata
  title: v.optional(v.string()),           // For named group chats, null for 1:1
  
  // Denormalized for list rendering
  lastMessageAt: v.optional(v.string()),   // ISO timestamp of last message
  lastMessagePreview: v.optional(v.string()), // First 80 chars of last message
  lastMessageSenderId: v.optional(v.id("users")),
  
  // Per-user read tracking (Map<userId, lastReadMessageId>)
  readCursors: v.optional(v.any()),        // { [userId]: messageId }
  
  createdAt: v.string(),
  createdBy: v.id("users"),
})
  .index("by_participant", ["participantIds"])   // Can't index arrays — see note below
  .index("by_lastMessage", ["lastMessageAt"])
```

> **Index note:** Convex doesn't support array element indexing, so we'll query by `lastMessageAt` descending and filter by participant client-side. For a handful of users (<20), this is efficient. If scale matters later, add a `conversationMembers` junction table.

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

### 3.2 Mobile Inbox Architecture

**Decision:** New mobile page at `/m-inbox` with 3 tabs: Messages, Flags, Notifications.

**Tab structure:**
| Tab | Content | Badge |
|-----|---------|-------|
| **Messages** | Conversation list → tap for message thread | Unread message count |
| **Flags** | Open flags assigned to user → tap for flag detail + thread | Open flag count |
| **Notifications** | All notifications (reminders, mentions, uploads, changelog) | Unread notification count |

**Why 3 tabs instead of the desktop's 5?**  
Desktop has All / Flags / Notifications / Mentions / Resolved. On mobile, screen real estate is limited and the mental model should be simpler. "Messages" is the new primary tab. Flags and Notifications cover the rest. "Mentions" is a subset of Notifications (filter within tab). "Resolved" is accessible via a toggle within the Flags tab (show resolved / show open).

**Navigation flow:**
```
Bottom nav → Inbox → [Messages | Flags | Notifications]
                       ↓          ↓           ↓
              Conversation    Flag Detail   Notification
              (message list)  (w/ thread)   Detail/Navigate
```

### 3.3 Desktop Inbox Enhancement

**Decision:** Add a "Messages" tab to the existing desktop `/inbox` page alongside existing tabs.

**Updated tabs:** All | Messages | Flags | Notifications | Mentions | Resolved

The "Messages" tab shows conversation list in the left sidebar and message thread in the right detail panel — same two-panel pattern as flags. The "All" tab now includes recent messages alongside flags and notifications, sorted by `createdAt`.

### 3.4 Mobile Notification Bell

**Decision:** Add a bell icon to the mobile header between the search button and UserButton.

**Behavior:**
- Shows red badge with unread count (notifications + unread messages + open flags)
- Tap navigates to `/m-inbox` (not a dropdown — dropdowns are awkward on mobile)
- Badge calculation: `unreadNotifications + unreadMessages + openFlags`

**Why navigate instead of dropdown?**  
The desktop uses a dropdown because there's room. On mobile, a dropdown would cover the content and feel cramped. Tapping the bell takes you to the full inbox where you have room to triage.

### 3.5 Desktop Notification Bell Enhancement

**Decision:** The existing `NotificationDropdown` stays as-is for now, but add an unread messages indicator.

The bell already shows notifications and upload progress. We'll add a "Messages" section to the dropdown showing the 3 most recent unread messages with a "View all in Inbox" link. This gives quick visibility without rebuilding the dropdown.

### 3.6 Mobile Bottom Nav Change

**Decision:** Replace "Tasks" in the bottom nav with "Inbox" (Mail icon with badge).

**Updated bottom nav:** Home | Clients | [Chat FAB] | Docs | Inbox

**Why replace Tasks?**  
- Tasks is also accessible via the navigation drawer (hamburger menu)
- Inbox is a higher-frequency destination — users check messages/flags multiple times per day
- The chat FAB (AI assistant) stays as the center floating button
- Tasks remains accessible via dashboard and nav drawer

### 3.7 Entity Reference Picker in Messages

**Decision:** "+" button in message composer that opens a searchable entity picker.

**Flow:**
1. User taps "+" button next to message input
2. Bottom sheet (mobile) or popover (desktop) opens with 3 tabs: Documents, Projects, Clients
3. User searches by name — results come from existing Convex queries
4. User taps entity → it's added as a reference chip below the message input
5. Multiple references allowed per message
6. References render as clickable chips in the message thread

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
- Tab bar: Messages | Flags | Notifications
- Uses URL params for active tab

**Message components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `ConversationList` | `m-inbox/components/` | List of conversations with avatar, name, preview, time, unread badge |
| `ConversationView` | `m-inbox/components/` | Full message thread for a conversation |
| `MessageBubble` | `m-inbox/components/` | Individual message with sender, time, content, reference chips |
| `MessageComposer` | `m-inbox/components/` | Text input + "+" reference picker + send button |
| `EntityPicker` | `m-inbox/components/` | Bottom sheet with tabs for Documents/Projects/Clients search |
| `ReferenceChip` | `m-inbox/components/` | Clickable entity reference (icon + name) |

**Flag components (mobile port):**
| Component | Location | Purpose |
|-----------|----------|---------|
| `MobileFlagList` | `m-inbox/components/` | Flags assigned to user with status toggle |
| `MobileFlagDetail` | `m-inbox/components/` | Flag thread with reply input (adapted from desktop FlagDetailPanel) |

**Notification components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `MobileNotificationList` | `m-inbox/components/` | Full notification list with type icons and actions |

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

**Inbox page updates:**
| Component | Change |
|-----------|--------|
| `inbox/page.tsx` | Add "messages" filter, query conversations |
| `InboxSidebar.tsx` | Add Messages tab with count badge |
| `InboxItemList.tsx` | Handle `kind: "conversation"` items |

**New desktop components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `ConversationDetailPanel` | `inbox/components/` | Message thread view for right panel |
| `DesktopMessageComposer` | `inbox/components/` | Message input with entity reference popover |
| `EntityReferencePopover` | `inbox/components/` | Desktop version of entity picker (popover, not sheet) |
| `NewConversationDialog` | `inbox/components/` | Dialog to start a new conversation (pick user(s)) |

**NotificationDropdown update:**
| Component | Change |
|-----------|--------|
| `NotificationDropdown.tsx` | Add "Messages" section showing 3 most recent unread messages |

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
  conversations.ts          # New: conversation CRUD + queries
  directMessages.ts         # New: message CRUD + queries

src/app/(mobile)/
  m-inbox/
    page.tsx                # New: mobile inbox with 3 tabs
    components/
      ConversationList.tsx  # New: conversation list
      ConversationView.tsx  # New: message thread
      MessageBubble.tsx     # New: individual message
      MessageComposer.tsx   # New: message input + reference picker
      EntityPicker.tsx      # New: bottom sheet entity search
      MobileFlagList.tsx    # New: mobile flag list
      MobileFlagDetail.tsx  # New: mobile flag detail + thread
      MobileNotificationList.tsx  # New: full notification list
      InboxTabs.tsx         # New: tab bar component

src/app/(desktop)/inbox/
  components/
    ConversationDetailPanel.tsx  # New: desktop message thread
    DesktopMessageComposer.tsx   # New: desktop message input
    NewConversationDialog.tsx    # New: start conversation dialog

src/components/messages/
  ReferenceChip.tsx         # New: shared entity reference display
  ConversationAvatar.tsx    # New: shared avatar component
  EntityReferencePopover.tsx # New: desktop entity picker popover
```

**Modified files:**
```
convex/schema.ts                 # Add conversations, directMessages tables; add "message" type
src/components/mobile/MobileHeader.tsx      # Add bell icon
src/components/mobile/StickyFooter.tsx      # Replace Tasks with Inbox
src/components/mobile/MobileNavDrawer.tsx   # Add Inbox nav item
src/components/NotificationDropdown.tsx     # Add messages section
src/app/(desktop)/inbox/page.tsx            # Add messages filter + query
src/app/(desktop)/inbox/components/InboxSidebar.tsx  # Add Messages tab
src/app/(desktop)/inbox/components/InboxItemList.tsx  # Handle conversation items
src/app/(desktop)/inbox/components/InboxDetailPanel.tsx  # Route to ConversationDetailPanel
convex/flags.ts                  # Extend getInboxItemsEnriched for conversations
```
