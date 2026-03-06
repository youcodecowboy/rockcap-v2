# Universal Flagging & Inbox Hub — Design Document

**Date:** 2026-03-06
**Scope:** Tier 2 — Universal flagging across all entity types + modernized Inbox as notification hub
**Sets up:** Tier 3 — User-to-user messaging, hybrid AI+human chat

---

## Overview

A flagging system that lets users flag any entity (document, meeting, task, project, client, checklist item) with a note, optionally tag another user, and have it delivered to their inbox + bell notification. Each flag has a threaded timeline mixing human replies and auto-logged activity events (e.g., "User moved document from X to Y"). The existing `/inbox` placeholder page becomes the central hub for flags, notifications, and mentions.

---

## Data Model

### New Table: `flags`

| Field | Type | Purpose |
|-------|------|---------|
| `entityType` | `"document" \| "meeting" \| "task" \| "project" \| "client" \| "checklist_item"` | What's being flagged |
| `entityId` | `string` | ID of the flagged entity |
| `createdBy` | `Id<"users">` | Who created the flag |
| `assignedTo` | `Id<"users">` | Tagged user (defaults to creator if unassigned) |
| `note` | `string` | Initial flag message |
| `status` | `"open" \| "resolved"` | Active or archived |
| `priority` | `"normal" \| "urgent"` | Visual indicator |
| `resolvedBy` | `Id<"users">` (optional) | Who resolved it |
| `resolvedAt` | `string` (optional) | When resolved |
| `clientId` | `Id<"clients">` (optional) | For context linking |
| `projectId` | `Id<"projects">` (optional) | For context linking |
| `createdAt` | `string` | Timestamp |

**Indexes:** `by_assignedTo`, `by_createdBy`, `by_entity` (entityType + entityId), `by_status`, `by_client`, `by_project`

### New Table: `flagThreadEntries`

| Field | Type | Purpose |
|-------|------|---------|
| `flagId` | `Id<"flags">` | Parent flag |
| `entryType` | `"message" \| "activity"` | Human reply vs system event |
| `userId` | `Id<"users">` (optional) | Author (for messages) |
| `content` | `string` | Message text or activity description |
| `metadata` | `object` (optional) | Activity details (e.g., `{ action: "moved", from: "Legal", to: "Insurance" }`) |
| `createdAt` | `string` | Timestamp |

**Indexes:** `by_flag` (flagId + createdAt)

### Modified Table: `notifications`

- Add `"flag"` to the `type` union: `file_upload | reminder | task | changelog | flag`
- Flag notifications link to inbox via `relatedId` pointing to the flag ID

---

## Inbox UI

### Layout: Left Sidebar + Main Detail Panel

**Left Sidebar:**
- Filter tabs at top: All / Flags / Notifications / Mentions / Resolved
- Each tab shows a count badge for unread items
- Below filters: chronological list of items
- Each item shows: type icon, entity name, preview text, timestamp
- Unread items have a bold dot indicator
- Selecting an item loads its detail in the main panel

**Main Panel (Flag Detail):**
- Entity info header: document/meeting/task name, client > project breadcrumb, clickable link to navigate to the entity
- Flag metadata: who flagged, when, priority badge
- Thread timeline: interleaved messages and activity entries, chronologically ordered
- Reply bar at bottom: text input + Send button
- "Resolve flag" checkbox next to Send — resolve and reply in one action
- Resolve/Delete buttons in flag header

**Resolved Tab:**
- Same layout, shows archived flags
- Read-only thread view
- "Reopen" button available

**Responsive Behaviour:**
- Narrow/mobile: sidebar is full view, selecting an item pushes to detail (back button to return)

### Flag Creation Modal

Launched from three-dot menus on: documents, meetings, tasks, projects, clients, checklist items.

- Entity context auto-populated from launch point
- "Assign to" user selector (defaults to self if left empty)
- Priority toggle: Normal / Urgent
- Note text area
- Cancel / Create Flag buttons

---

## Notification Integration

### Dual Delivery: Inbox + Bell

**On flag creation (assigned to another user):**
1. Flag appears in assignee's inbox via `flags` table query (real-time via Convex `useQuery`)
2. Bell notification created: new `notifications` record with `type: "flag"`

**On thread reply:**
- Notification sent to all thread participants (creator + assignee + anyone who replied)
- Except the person who just replied

**On activity auto-log:**
- No bell notification — visible in thread only. Keeps noise low.

**Bell notification click:**
- Navigates to `/inbox?flag={flagId}` — inbox opens with that flag pre-selected

**Inbox nav item:**
- Unread count badge: open flags assigned to you + unread notifications

### Flag Indicators on Entities

Anywhere a flagged entity appears in the app, show a small flag icon:
- Document file list: flag icon next to filename
- Meeting card: flag badge
- Task row: flag indicator
- Project header: flag count if open flags exist
- Client page: flag count

Query: `flags.by_entity(entityType, entityId)` filtered to `status: "open"`. Lightweight, can be batched.

---

## Activity Auto-Logging

### Trigger Points

| Entity Type | Mutation | Activity Message |
|------------|----------|-----------------|
| Document | Move/refile | "User moved document from {folder A} to {folder B}" |
| Document | Version update | "User uploaded new version (v{x.y})" |
| Document | Rename | "User renamed document to {new name}" |
| Document | Delete | "User deleted this document" |
| Meeting | Edit | "User updated meeting details" |
| Meeting | Action item status | "User marked action item '{title}' as complete" |
| Task | Status change | "User changed status to {new status}" |
| Task | Reassign | "User reassigned task to {new user}" |
| Project | Status change | "User changed project status to {new status}" |

### Implementation

Shared helper: `logFlagActivity(entityType, entityId, userId, action, details)`

1. Queries `flags.by_entity(entityType, entityId)` for open flags
2. If none → returns immediately (zero overhead for unflagged entities)
3. If open flags → inserts `flagThreadEntries` with `entryType: "activity"` for each

Explicit calls at the end of relevant Convex mutations. No middleware pattern — readable, debuggable, and controlled.

### No Auto-Resolve

Flags are never auto-resolved. Activity is logged in the thread but the human decides when the flag is done. Flags are easy to resolve or delete manually.

---

## Chat Tool Integration

New flag tools added to the tool registry:

| Tool | Action | Description |
|------|--------|-------------|
| `createFlag` | write | Create a flag on any entity |
| `getFlags` | read | List flags by entity, user, or status |
| `getFlagThread` | read | Get thread entries for a flag |
| `replyToFlag` | write | Add a message to a flag thread |
| `resolveFlag` | write | Mark a flag as resolved |
| `deleteFlag` | delete | Remove a flag |

Domain: `flag` — available in all contexts (global, client, project).

---

## Existing Code Cleanup

As part of this build:
- Review and modernize `CommentsSection.tsx` and `convex/comments.ts` if overlap with flag threads
- Ensure `NotificationDropdown.tsx` cleanly handles the new `flag` notification type
- Replace the `/inbox` placeholder page entirely with the new inbox hub
- Audit for any deprecated notification or comment patterns that should be removed

---

## Tier 3 Foundation

This design explicitly sets up Tier 3 (user-to-user messaging):
- `flagThreadEntries` pattern is identical to a direct message thread
- Inbox hub already handles multiple item types — adding "Direct Messages" is a new filter tab
- Bell notification delivery works for any notification type
- The flag creation modal pattern (select user, write message) is the same as starting a DM
