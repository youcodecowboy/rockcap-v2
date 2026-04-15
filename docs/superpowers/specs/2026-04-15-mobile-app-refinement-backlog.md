# RockCap Mobile App — Refinement Backlog

**Date:** 2026-04-15
**Status:** Active
**Context:** Post-initial build refinement. The mobile app is functional but needs depth to match the mobile web experience (currently ~45/100, target ~85/100).

---

## BL5: Dashboard Component Alignment

**Priority:** Medium
**Effort:** Medium

### Problem
- Dashboard sections not matching mobile web layout (icons, spacing, card design)
- Navigation from dashboard items broken — tapping notifications/flags/messages doesn't navigate properly
- Flags and messages sections show "NaN" for timestamps or counts
- No tags or context shown on dashboard items (who flagged, which client, etc.)

### Fix Required
- Audit every dashboard card against the web version's `DashboardContent.tsx` components
- Fix `formatRelativeTime` — handle cases where `_creationTime` is undefined or in unexpected format
- Add null checks for all `.length` and date accesses
- Ensure all tappable items navigate correctly:
  - Notification items → `/inbox` (notifications tab)
  - Flag items → `/inbox` (flags tab)
  - Conversation items → `/inbox` (messages tab)
  - Task items → `/tasks`
  - Brief card → `/brief`
  - Client items in recents → `/clients/{clientId}`
  - Project items in recents → `/clients` (with project context)
- Add entity context to flags (which client/project they belong to)
- Add sender/assignee info to messages

### Convex Queries
- Existing queries are correct, just need better null handling and data extraction

---

## BL6: Docs — Recent Clients Tri-Card Design

**Priority:** Medium
**Effort:** Small

### Problem
The docs screen goes straight to a client list. The mobile web has a "Recent Clients" section at the top showing the 3 most recently accessed clients as horizontal cards before the full list.

### Fix Required
- Add a horizontal ScrollView at the top of the docs index screen
- Show 3 cards for recently accessed clients (based on `lastAccessedAt` field or recent doc activity)
- Each card: client name, project count, doc count
- Cards are tappable — navigate into that client's project/folder structure
- Below the recent cards, show the full client list as currently implemented

### Convex Queries
- `api.clients.list` — sort/filter by `lastAccessedAt` client-side for recents
- `api.documents.getFolderCounts` — per-client doc counts for the cards

---

## BL7: Docs — Folder Document Counts

**Priority:** Quick win
**Effort:** Small

### Problem
Folders in the docs navigator don't show how many documents they contain. Users navigate into empty folders without knowing they're empty.

### Fix Required
- At the **project level**: show document count next to each project name
- At the **folder level**: show document count next to each folder name
- Use data from `api.documents.getFolderCounts` (already queried but not displayed at all levels)
- Gray out or add "(empty)" indicator for folders with 0 documents

### Data Source
`api.documents.getFolderCounts` returns:
```ts
{
  clientFolders: Record<string, number>,
  projectFolders: Record<projectId, Record<folderType, number>>,
  clientTotal: number
}
```

Match folder items by `folderType` key against the counts.

---

## BL8: Docs — Three-Dot Action Menu on Documents

**Priority:** Medium
**Effort:** Medium

### Problem
No inline actions on documents. The mobile web has a three-dot menu on each document row with: Move, Duplicate, Flag, Delete.

### Fix Required
- Add a `...` (MoreVertical) icon button on each document row in the folder contents view
- On press, show an action sheet (React Native `ActionSheetIOS` or a custom bottom sheet modal) with:
  - **Move** — navigate to folder picker (can be "Coming soon" for Phase 1)
  - **Duplicate** — call `api.documents.duplicateDocument` mutation
  - **Flag** — call `api.flags.create` mutation with document context
  - **Delete** — confirm dialog, then call `api.documents.remove` mutation
- The action sheet pattern is standard iOS — use `ActionSheetIOS.showActionSheetWithOptions` on iOS

### Convex Mutations
- `api.documents.duplicateDocument` — `{ documentId }`
- `api.documents.remove` — `{ id }`
- `api.flags.create` — `{ entityType: 'document', entityId, clientId, note, priority }`

---

## BL9: Notifications Mark-as-Read Broken

**Priority:** Quick win
**Effort:** Small

### Problem
Notifications show 99+ badge count permanently. Mark-as-read doesn't work — notifications can't be opened or dismissed.

### Fix Required
- Check `NotificationItem.tsx` — the `markAsRead` mutation call may have wrong argument format
- Check the `api.notifications.markAsRead` mutation signature — it may expect `{ id }` or `{ notificationId }`
- Check `api.notifications.markAllAsRead` — verify it works and is wired to the "Mark all read" button
- The unread count query `api.notifications.getUnreadCount` should update reactively after marking read
- Ensure the badge in the tab bar and header updates when notifications are marked read

### Likely Issue
The mutation is being called with `{ id: notification._id }` but the Convex function may expect `{ notificationId: notification._id }` or similar. Read the actual Convex mutation to confirm the argument name.

### Convex Functions to Check
- `model-testing-app/convex/notifications.ts` — `markAsRead` args shape
- `model-testing-app/convex/notifications.ts` — `markAllAsRead` args shape

---

## BL10: Header — Logo Font + Size

**Priority:** Quick win
**Effort:** Small

### Problem
- The "RockCap" logo text uses a default system font. The desktop/web version uses a specific font.
- The header bar is too thin — needs to be ~20% taller.

### Fix Required
1. **Font**: Check what font the web app uses for the RockCap logo. Load it via `expo-font` if it's a custom font, or use the closest system font match.
2. **Height**: Increase the header's bottom padding from `pb-3` to `pb-5` (or increase the overall height). The current safe-area top padding (`pt-14`) is correct for the status bar — just increase the content area below it.
3. **Logo size**: Increase from `text-lg` to `text-xl` or `text-2xl`.

### Font Loading (if custom font needed)
```tsx
// In _layout.tsx
import { useFonts } from 'expo-font';

const [fontsLoaded] = useFonts({
  'RockCap-Logo': require('../assets/fonts/logo-font.otf'),
});
```

If the web uses a standard Google Font, it can be loaded via `@expo-google-fonts/[font-name]`.

---

## BL11: Notes — Rich Text Editor

**Priority:** Large (next session)
**Effort:** Large

### Problem
Notes are plain text with no formatting. The web version uses Tiptap with:
- Heading styles (H1, H2, H3)
- Bold, italic, underline, strikethrough
- Bullet lists, numbered lists, task lists
- @mentions (users, clients, projects)
- Inline commands (slash menu)
- Tags, linked clients/projects
- Emoji selector

### Fix Required (Phase approach)

**Phase A (Minimum viable):**
- Use a WebView-based rich text editor (e.g., `react-native-pell-rich-editor` or embed a lightweight HTML editor in a WebView)
- Support basic formatting: bold, italic, lists, headings
- Toolbar at the bottom with formatting buttons
- Save content as Tiptap-compatible JSON

**Phase B (Full parity):**
- @mentions with user/client/project picker
- Slash command menu
- Tag management
- Client/project linking UI
- Emoji picker

### Consideration
True Tiptap parity in React Native is extremely difficult. The pragmatic approach is either:
1. WebView wrapping the actual web Tiptap editor (reuse existing code)
2. A simpler native editor with basic formatting that outputs Tiptap-compatible JSON
3. Accept that mobile notes are plain text with metadata (tags, links) and rich editing happens on web

Option 3 is the most honest — mobile is for quick capture, web is for rich editing.

---

## BL12: Tasks/Meetings — View/Edit + AI Assistance

**Priority:** Large (next session)
**Effort:** Large

### Problem
- Tasks and meetings can't be opened to view full details or edit them
- No AI-assisted task/meeting creation flow like the web version's `TaskCreationFlow`
- The web version has a chat-like UI where you describe a task in natural language and AI parses it into structured fields

### Fix Required (Phase approach)

**Phase A (View/Edit):**
- Task detail sheet (slide-up panel or full screen) showing all fields
- Editable fields: title, description, due date, priority, assignee, client, project
- Date picker for due date
- Priority selector
- Meeting detail view with summary, key points, action items

**Phase B (AI Assistance):**
- Requires the chat agent to be integrated (deferred to chat overhaul)
- The web version calls `/api/tasks/parse` to convert natural language → structured task
- This could work as a standalone API call without the full chat agent
- Chat-like UI: user types description → AI returns parsed task → user confirms → task created

### Dependencies
- Phase B depends on the chat agent / API route being accessible from the mobile app
- The `/api/tasks/parse` endpoint on Vercel could be called directly from mobile

---

## Execution Priority

### Quick Wins (This Session)
1. **BL9**: Fix notification mark-as-read
2. **BL10**: Header font + size
3. **BL7**: Folder doc counts

### Medium (This Session if Time Permits)
4. **BL5**: Dashboard NaN fixes + navigation
5. **BL6**: Recent clients tri-card in docs
6. **BL8**: Three-dot action menu

### Large (Next Session)
7. **BL11**: Rich text notes
8. **BL12**: Task view/edit + AI assistance
