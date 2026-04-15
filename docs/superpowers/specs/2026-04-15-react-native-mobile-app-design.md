# RockCap Mobile App — React Native Design Spec

**Date:** 2026-04-15
**Status:** Phase 1 Design
**Branch:** To be created from `main`

---

## 1. Overview

Build a React Native (Expo) mobile app for RockCap that replicates the core mobile web experience as a native iPhone application. The app connects to the existing Convex backend — no API layer, no backend changes, no refactoring of the existing web app.

### Primary Use Case

Field use by property lending professionals during site visits. Users need to:

- Access and browse documents quickly, switching between multiple open docs (tab navigation)
- View client and project intelligence summaries on-site
- Capture site photos directly into project folders
- Create tasks and notes on the fly between meetings
- Receive push notifications for flags, messages, and document updates

### What This Is NOT

- Not a full desktop replacement — no advanced modeling, complex checklists, or heavy settings
- Not an offline-first app (Phase 1) — read caching with graceful degradation
- Not a chat agent integration (deferred to future chat overhaul/rewrite)

---

## 2. Repository Structure

The mobile app is a sibling directory in the existing repo. No restructuring, no monorepo tooling, no changes to the existing web app.

```
rockcap-v2/
├── model-testing-app/          # Existing Next.js web app (UNCHANGED)
│   ├── convex/                 # Shared Convex backend (both apps use this)
│   ├── src/
│   └── package.json
│
├── mobile-app/                 # NEW — Expo React Native app
│   ├── app/                    # Expo Router file-based screens
│   │   ├── _layout.tsx         # Root layout (Clerk + Convex providers)
│   │   ├── sign-in.tsx         # Auth screen
│   │   └── (tabs)/             # Bottom tab navigator
│   │       ├── _layout.tsx     # Tab bar configuration
│   │       ├── index.tsx       # Dashboard
│   │       ├── clients.tsx     # Client list (→ stack for detail)
│   │       ├── docs.tsx        # Document library (→ stack for viewer)
│   │       └── inbox.tsx       # Flags & notifications
│   ├── components/             # Native UI components
│   ├── lib/                    # Mobile-specific utilities (cache, offline queue)
│   ├── assets/                 # App icon, splash screen, fonts
│   ├── app.json                # Expo configuration
│   ├── tsconfig.json
│   └── package.json
│
├── CLAUDE.md
└── (everything else unchanged)
```

### Convex Connection

The mobile app imports Convex functions directly from the existing web app directory:

```ts
import { api } from "../../model-testing-app/convex/_generated/api";
```

No duplication, no API wrapper. Same queries, same mutations, same real-time subscriptions.

**Note:** Expo uses Metro bundler, which by default only resolves modules within the project root. To import from the sibling `model-testing-app/convex/` directory, the mobile app's `metro.config.js` must be configured with `watchFolders` pointing to the parent directory and `nodeModulesPaths` to resolve dependencies correctly. This is a standard pattern for Expo monorepo setups.

### Future Additions (Not Phase 1)

When the chat agent overhaul happens, the repo will gain:

```
rockcap-v2/
├── packages/agent-core/        # Shared agent brain (skills, tools, prompts)
├── mcp-server/                 # MCP server for Claude/LLM access
```

At that point, npm workspaces will be introduced to link the shared package. Not before.

---

## 3. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Expo SDK 52+ with Expo Router v4 | File-based routing (same mental model as Next.js), managed builds via EAS |
| Language | TypeScript 5.9 | Match existing codebase |
| Styling | NativeWind v4 (Tailwind for RN) | Closest translation from existing Tailwind mobile UI |
| Navigation | Expo Router (React Navigation under the hood) | Bottom tabs + stack navigators |
| Backend | Convex (`convex/react`) | Same hooks, same real-time sync as web app |
| Auth | `@clerk/clerk-expo` + `expo-secure-store` | Same Clerk instance, native token storage |
| Icons | `lucide-react-native` | Match existing icon set |
| Camera | `expo-camera` | Site photo capture |
| File picker | `expo-document-picker` | Upload non-photo documents |
| File storage | `expo-file-system` | Offline document cache |
| Local storage | `@react-native-async-storage/async-storage` | Offline query data cache |
| PDF viewer | `react-native-pdf` | Native PDF rendering (better than PDF.js) |
| Push notifications | `expo-notifications` | Flag/message/document alerts |
| Location | `expo-location` (optional) | GPS metadata on captured photos |
| Network detection | `@react-native-community/netinfo` | Offline state detection |

### Dependencies NOT Needed on Mobile

These stay in the web app only:

- Handsontable / HyperFormula (spreadsheet UI — WebView fallback if needed)
- Tiptap (rich text — use simpler native text input for notes)
- react-big-calendar (desktop calendar view)
- pdfjs-dist (replaced by react-native-pdf)
- canvas (server-side, not needed)

---

## 4. Navigation Architecture

### Bottom Tab Bar (4 Tabs)

Matches the existing `StickyFooter.tsx` layout:

| Tab | Icon | Screen | Stack Depth |
|-----|------|--------|-------------|
| Home | `LayoutDashboard` | Dashboard | 1 (no sub-navigation) |
| Clients | `Building` | Client list → Client detail | 2-3 levels deep |
| Docs | `File` | Document library → Folder → Document viewer | 3-4 levels deep |
| Inbox | `Mail` | Notifications + Flags → Flag thread | 2 levels deep |

### Additional Stack Screens (Pushed Over Tabs)

- Upload flow (camera capture + document picker + batch review)
- Task creation / detail
- Note creation / editor
- Daily brief (full view)
- Settings

### Document Tab Manager

The browser-tab navigation pattern from `TabContext.tsx` / `TabManager.tsx` is replicated inside the Documents screen:

- Horizontal scrollable tab bar at the top of the document area
- Users open documents into tabs, switch between them without losing position
- Max 12 tabs, dashboard always pinned
- Close tabs with X button, auto-switch to last tab on close
- Tab state managed via React Context (same pattern as web)

This is the core UX for field use — open an appraisal, a set of plans, and an inspection report, then jump between them while on-site.

---

## 5. Screen Specifications

### 5.1 Dashboard

**Purpose:** Home base. Morning check-in, quick actions, at-a-glance status.

**Content:**
- Time-of-day greeting with user name
- Daily brief summary card (from `dailyBriefs` table)
- Quick action buttons: Upload, New Task, New Note
- Up-next section: today's tasks and upcoming events
- Recent notifications (last 5-10)
- Recent flags/messages

**Convex Queries:**
- `tasks.getByUser` — all active tasks (filtered client-side for today/overdue)
- `events.getNextEvent` — upcoming calendar event
- `notifications.getRecent` — recent notifications (`{ limit: 3, includeRead: false }`)
- `notifications.getUnreadCount` — badge count
- `flags.getMyFlags` — open flags (`{ status: 'open' }`)
- `conversations.getUnreadCount` — unread message count
- `dailyBriefs.getToday` — today's brief
- `reminders.getUpcoming` — next upcoming reminder (`{ limit: 1 }`)

**Design Notes:**
- Scrollable single-column layout
- Cards for each section with consistent styling
- Pull-to-refresh

### 5.2 Clients

**Purpose:** Browse clients, view intelligence and project details on-site.

**Screens:**
1. **Client list** — searchable, filterable by status (active/prospect/archived)
2. **Client detail** — tabbed interface:
   - Overview (company info, key contacts, stage note)
   - Documents (by project folder)
   - Notes (client-level notes)
   - Tasks (active tasks for this client)
   - Projects (project list with status)
   - Intelligence (client intelligence summary — key field use case)

**Convex Queries:**
- `clients.list`, `clients.get`
- `projects.getByClient`
- `documents.getByClient`, `documents.getByProject`
- `intelligence.getClientIntelligence`, `intelligence.getProjectIntelligence`
- `tasks.getByClient`
- `notes.getByClient`
- `contacts.getByClient`

**Design Notes:**
- Client intelligence is the primary value for field use — prioritise this in the UI
- Project intelligence should be accessible from client detail via project list

### 5.3 Documents (with Tab Navigation)

**Purpose:** The primary screen. Browse, open, and switch between documents.

**Screens:**
1. **Document library** — folder tree navigation (client → project → folder → documents)
2. **Document detail** — metadata, classification, notes, intelligence
3. **Document viewer** — full-screen document rendering
4. **Tab bar** — horizontal scrollable tabs for open documents

**Document Rendering by Type:**

| File Type | Renderer | Notes |
|-----------|----------|-------|
| PDF | `react-native-pdf` | Native iOS PDFKit, excellent quality |
| Images (JPG/PNG) | Native `Image` component | Pinch-to-zoom via `react-native-gesture-handler` |
| DOCX | WebView + Mammoth | Convert to HTML server-side or on-device, render in WebView |
| XLSX | WebView | Wrap existing Handsontable renderer, load via URL with `?embedded=true` |

**Convex Queries:**
- `documents.getByFolder`, `documents.getByClient`, `documents.getByProject`
- `documents.get`, `documents.getFileUrl`
- `documentNotes.getByDocument`
- `clientFolders`, `projectFolders` queries for folder structure

**Design Notes:**
- Tab manager is the core interaction pattern — must feel fast and fluid
- Document viewer should support swipe gestures for page navigation
- Folder breadcrumbs for orientation in deep hierarchies

### 5.4 Upload + Camera Capture

**Purpose:** Capture site photos and upload documents from the field.

**Flows:**

1. **Camera capture (site photos):**
   - Open camera via `expo-camera`
   - Capture photo
   - Select client + project (or use current context)
   - Photo uploads to Convex storage
   - Document record created and filed to "Captured Photos" folder
   - Optional: GPS coordinates attached via `expo-location`
   - No analysis pipeline — these are site photos, not documents to classify

2. **Document upload:**
   - Pick files via `expo-document-picker`
   - Select client + project
   - Creates a bulk upload batch
   - Files upload to Convex storage
   - Batch sent through existing `/api/v4-analyze` pipeline on Vercel
   - Review flow shows analysis results for each document

**Convex Mutations:**
- `files.generateUploadUrl` — get signed upload URL
- `documents.create` — create document record (for photos)
- `bulkUpload.createBatch`, `bulkUpload.addItemToBatch` — batch upload flow

**Backend Change Required:**
- Add "Captured Photos" to default project folder templates in Convex

### 5.5 Tasks

**Purpose:** Quick task management on the go.

**Content:**
- Task list with day strip (today / upcoming / overdue)
- Summary metrics pills (total active, due today, overdue)
- Task detail sheet (slide-up panel)
- Quick task creation form
- Complete/update tasks inline with swipe or tap

**Convex Queries:**
- `tasks.getByUser`, `tasks.getByDateRange`, `tasks.getMetrics`

**Convex Mutations:**
- `tasks.create`, `tasks.complete`, `tasks.update`

### 5.6 Inbox / Flags

**Purpose:** View and respond to flags, notifications, and messages.

**Content:**
- Notification list with read/unread indicators
- Flag list with status (open/resolved)
- Flag detail with thread view (replies)
- Reply to flags inline

**Push Notifications (via `expo-notifications`):**
- New flag created on a document/client/project you're involved with
- Reply to a flag thread you're part of
- Document status changes (analysis complete, filed)
- Task assignments and reminders
- Direct messages

**Convex Queries:**
- `flags.getInboxItemsEnriched`, `flags.getThread`
- `notifications.getByUser`, `notifications.getUnreadCount`

**Convex Mutations:**
- `flags.reply`, `flags.resolve`, `flags.reopen`
- `notifications.markAsRead`, `notifications.markAllAsRead`

**Backend Addition:**
- Push notification token storage (new `pushTokens` table in Convex)
- Notification dispatch logic — when a flag/message/notification is created, check for push tokens and send via Expo Push API

### 5.7 Notes

**Purpose:** Quick note-taking during site visits.

**Content:**
- Notes list (all / by client / by project)
- Note editor with basic formatting (bold, italic, lists — no full Tiptap)
- Link notes to clients/projects

**Convex Queries:**
- `notes.getAll`, `notes.getByClient`, `notes.getByProject`

**Convex Mutations:**
- `notes.create`, `notes.update`, `notes.remove`

### 5.8 Daily Brief

**Purpose:** Morning summary — read on the commute.

**Content:**
- Stats bar (tasks due, meetings today, pending flags)
- Brief sections (AI-generated summary of what's happened, what's coming)
- Schedule timeline for the day

**Convex Queries:**
- `dailyBriefs.getToday` — today's brief data
- `tasks.getByUser`, `events.getByDateRange` — schedule data

---

## 6. Offline Strategy (Phase 1)

### Read Cache

**Document files:**
- When a user views a document, the file is downloaded to device storage via `expo-file-system`
- Stored at: `FileSystem.documentDirectory/cache/docs/{documentId}.{ext}`
- On next open: load from cache instantly, check for updates in background
- Cache size managed by OS (iOS handles this automatically for document directory)

**Query data:**
- After each successful Convex query, the result is cached in AsyncStorage
- Key format: `cache:{queryName}:{argsHash}`
- When offline, queries read from cache
- When online, Convex real-time subscriptions keep data fresh automatically

### Offline Behaviour

| Action | Online | Offline |
|--------|--------|---------|
| View cached document | Instant | Instant (from cache) |
| View uncached document | Download + cache | "Document not available offline" |
| Browse client/doc lists | Live Convex data | Cached last-seen data |
| Create task / note | Saved immediately | Queued locally, synced on reconnect |
| Upload photo | Uploaded immediately | Queued locally, uploaded on reconnect |
| Chat agent | N/A (Phase 1) | N/A |

### Offline Queue

Simple queue in AsyncStorage for pending writes:

```ts
interface PendingMutation {
  id: string;
  mutation: string;        // e.g., "tasks.create"
  args: Record<string, any>;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
}
```

On reconnect (detected via NetInfo), flush queue sequentially. No conflict resolution needed — creates are idempotent by design (unique IDs generated client-side), and the scenarios where two people edit the same task offline are effectively impossible in this single-user-per-device context.

### Offline UI

- Subtle banner at top: "Offline — showing cached data"
- Pending actions show with a sync icon
- When reconnected: banner disappears, pending actions sync with brief toast confirmation

---

## 7. Push Notifications

### Infrastructure

- **Token registration:** On app launch, request push notification permissions via `expo-notifications`. Store the Expo push token in a new `pushTokens` Convex table.
- **Dispatch:** When a notifiable event occurs (flag created, message sent, task assigned), a Convex mutation checks for push tokens for the relevant users and sends via Expo Push API.
- **Deep linking:** Each notification includes a URL that opens the relevant screen (e.g., flag detail, document, task).

### Notification Types

| Event | Notification Text | Deep Link |
|-------|-------------------|-----------|
| New flag on your document | "{user} flagged {document}" | Flag detail screen |
| Flag reply | "{user} replied to flag on {document}" | Flag thread |
| Task assigned to you | "New task: {title}" | Task detail |
| Task reminder | "Reminder: {title} due {time}" | Task detail |
| Document analysis complete | "{document} has been classified" | Document detail |
| Direct message | "{user}: {preview}" | Message thread |

### New Convex Table

```ts
pushTokens: defineTable({
  userId: v.id("users"),
  token: v.string(),
  platform: v.literal("ios"),
  createdAt: v.number(),
  lastUsedAt: v.number(),
}).index("by_user", ["userId"])
```

---

## 8. Captured Photos Folder

### Folder Template Change

Add "Captured Photos" as a default folder in the project folder template structure. This is a small additive change to the existing `folderTemplates` configuration in Convex.

### Photo Metadata

Each captured photo is stored as a standard `documents` record using the existing "Photographs" category (which already exists in `fileTypeDefinitions` as "Site Photographs"):

- `category`: "Photographs" (existing category)
- `fileType`: "Site Photographs" (existing file type definition)
- `scope`: "client-specific"
- `source`: "mobile-capture" (new field or stored in metadata)
- GPS coordinates (if user grants location permission): stored in document metadata
- Capture timestamp: standard `_creationTime`
- Captured by: standard `uploadedBy` field

### No Analysis Pipeline

Site photos do not go through the V4 analysis pipeline. They are filed directly:
1. Upload to Convex storage → get `fileStorageId`
2. Create document record with category "Photographs", filed to "Captured Photos" folder
3. Done

---

## 9. Authentication Flow

### Setup

```tsx
// mobile-app/app/_layout.tsx
import { ClerkProvider } from '@clerk/clerk-expo';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import * as SecureStore from 'expo-secure-store';

const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <Stack />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

### Flow

1. App launches → Clerk checks for stored token in secure keychain
2. If no token → show sign-in screen (Clerk's prebuilt UI or custom)
3. If token valid → Clerk provides JWT to Convex automatically
4. `useStoreUser()` syncs Clerk user to Convex `users` table (same as web)
5. App renders authenticated screens

Same Clerk instance, same Convex auth config. No changes to backend auth.

---

## 10. Phasing Summary

### Phase 1 (This Spec)
- Expo app setup with Clerk + Convex
- Dashboard, Clients, Documents (with tab navigation), Upload + Camera, Tasks, Inbox/Flags, Notes, Daily Brief
- Offline read cache
- Push notifications
- "Captured Photos" folder addition
- Apple Developer account + TestFlight distribution

### Phase 2 (Future — Chat Overhaul)
- Chat agent integration (rewritten from scratch)
- `packages/agent-core/` shared package extraction
- MCP server for Claude/LLM access to app data
- npm workspaces to link shared package
- Enhanced offline: "Going on site" prep mode for pre-downloading documents

### Phase 3 (Future — Polish)
- Full offline write queue with conflict resolution
- Settings screen
- Contacts screen
- Google Calendar deep integration on mobile
- App Store public release

---

## 11. Backend Changes Required (Phase 1)

Minimal and entirely additive:

1. **New table:** `pushTokens` — stores Expo push notification tokens per user
2. **New mutations:** `pushTokens.register`, `pushTokens.remove` — token management
3. **Folder template update:** Add "Captured Photos" to default project folder template
4. **Push dispatch logic:** When flags/notifications/messages are created, send push notifications to registered devices via Expo Push API

No schema migrations. No changes to existing tables. No changes to existing queries or mutations.

---

## 12. Development & Deployment

### Local Development
```bash
cd mobile-app
npm install
npx expo start
# Scan QR code with iPhone camera → app opens in Expo Go
```

### Building for iPhone
```bash
# One-time setup
npm install -g eas-cli
eas login
eas build:configure

# Build for iOS (runs in Expo's cloud)
eas build --platform ios --profile preview  # TestFlight build

# Submit to App Store
eas submit --platform ios
```

### Requirements
- Apple Developer Account ($99/year) — required for TestFlight and App Store
- Expo account (free) — for EAS build service
- No Xcode required for building (EAS builds in cloud)
- Xcode only needed if adding custom native modules (unlikely for Phase 1)
