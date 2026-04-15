# Google Calendar Integration — Design Spec

**Date:** 2026-04-15
**Branch:** mobile2
**Status:** Approved

## Overview

Two-way Google Calendar integration for RockCap mobile. Users connect their personal Google account via OAuth, enabling:
- **Inbound**: Real-time webhook sync of calendar events into RockCap for display in the Daily Brief and across the app.
- **Outbound**: Optional push of tasks to Google Calendar during task creation.

No admin/workspace access required — each user connects independently.

---

## 1. OAuth Flow & Token Management

### Google Cloud Setup
- Google Cloud project with Calendar API enabled.
- OAuth consent screen (external) with scopes: `calendar.events.readonly`, `calendar.events`.
- OAuth 2.0 Web Application credentials.
- Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`.

### Flow
1. User taps "Connect Google Calendar" → frontend calls `GET /api/google/auth` which generates the Google OAuth URL with a `state` parameter (Clerk user ID + CSRF token).
2. User sees Google consent screen, grants access.
3. Google redirects to `GET /api/google/callback` with authorization code.
4. Backend exchanges code for access + refresh tokens via Google's token endpoint.
5. Tokens stored in Convex `googleCalendarTokens` table.
6. User redirected back to `/m-settings` with success query param.

### Token Storage — New Convex Table

```
googleCalendarTokens: defineTable({
  userId: v.id("users"),
  accessToken: v.string(),
  refreshToken: v.string(),
  expiresAt: v.string(),        // ISO timestamp
  scope: v.string(),
  connectedAt: v.string(),      // ISO timestamp
  connectedEmail: v.string(),   // Google account email
}).index("by_user", ["userId"])
```

### Token Refresh
- Before any Google API call, check `expiresAt` — if within 5 minutes of expiry, refresh using the refresh token first.
- Refresh handled server-side in `src/lib/google/calendar.ts`.
- If refresh fails (token revoked), mark connection as disconnected and surface a reconnect prompt on next calendar-dependent action.

---

## 2. Webhook Sync (Google → RockCap)

### Channel Setup
- On connection, call Google's `watch` API to create a push notification channel on the user's primary calendar.
- Webhook endpoint: `POST /api/google/webhook`.
- Channels expire after ~7 days — a Convex scheduled function renews them before expiry.

### Webhook Flow
1. Google sends POST to `/api/google/webhook` with `X-Goog-Channel-ID` and `X-Goog-Resource-ID` headers (no event data in payload — it's a notification that something changed).
2. Endpoint looks up the channel in `googleCalendarChannels` table to identify the user.
3. Calls Google Calendar `events.list` with stored `syncToken` to fetch only changed events.
4. Changed events upserted into Convex `events` table, matched by `googleEventId`.
5. New `syncToken` stored for next incremental sync.

### Channel Management — New Convex Table

```
googleCalendarChannels: defineTable({
  userId: v.id("users"),
  channelId: v.string(),       // UUID we generate
  resourceId: v.string(),      // From Google's watch response
  expiration: v.string(),      // ISO timestamp
  syncToken: v.string(),       // For incremental event sync
}).index("by_user", ["userId"])
  .index("by_channel", ["channelId"])
```

### Initial Sync
- On first connection, full pull of upcoming events (next 30 days) using `events.list`.
- Store the returned `syncToken` for future incremental syncs.

### Edge Cases
- `syncToken` invalidated by Google → fall back to full re-sync.
- Google retries failed webhook deliveries with exponential backoff — endpoint is idempotent.
- Disconnecting revokes the channel via Google's `channels.stop` API.

---

## 3. Push to Google Calendar (RockCap → Google)

### Task → Calendar Event
- In the `TaskCreationFlow` component, if the user has Google Calendar connected and the task has a due date, show a toggle: **"Add to Google Calendar"**.
- Toggle is off by default — opt-in per task.
- When enabled, after the task is created in Convex, call Google Calendar `events.insert`.
- Store the returned `googleEventId` on the task/event record.

### Event Mapping
| RockCap Task Field | Google Calendar Event Field |
|---|---|
| title | summary |
| dueDate (date only) | start.date / end.date (all-day) |
| dueDate (with time) | start.dateTime / end.dateTime |
| client name | description prefix |

- No attendees — personal calendar reminder, not a meeting invite.

### Updates & Deletions
- Task edited (title, date) → `events.update` on the Google event.
- Task completed or cancelled → `events.delete` on the Google event.
- Fire-and-forget: if the Google call fails, log it but don't block the task operation.

### API Route
- `POST /api/google/events` — create event.
- `PATCH /api/google/events` — update event.
- `DELETE /api/google/events` — remove event.

---

## 4. Mobile Settings Page & Connection UI

### New Route: `/m-settings`
- Added to the mobile nav drawer as the last item.
- Page structured with sections, starting with **Integrations**.

### Google Calendar Card
- **Disconnected state**: "Connect Google Calendar" button, description: "Sync your calendar events and add tasks to your schedule."
- **Connected state**: Shows connected Google email, last sync time, "Disconnect" button.

### Contextual Prompts
- **Daily Brief page** (when not connected): Inline card — "Connect Google Calendar to see your schedule in your daily brief" with a connect button.
- **Task creation flow**: Toggle only shown if already connected. No nag prompt during creation — that's disruptive.

### Connect/Disconnect Flow
- "Connect" → opens Google OAuth in a new browser tab (standard for mobile OAuth).
- On successful callback, window closes and settings page refreshes to show connected state.
- "Disconnect" → confirmation prompt → revokes tokens, stops webhook channel, clears stored tokens.

---

## 5. File Structure

```
src/lib/google/
  calendar.ts          — Google Calendar API client (auth, token refresh, CRUD)
  oauth.ts             — OAuth URL generation, token exchange

src/app/api/google/
  auth/route.ts        — GET: generate OAuth URL, redirect to Google
  callback/route.ts    — GET: handle OAuth callback, exchange code for tokens
  webhook/route.ts     — POST: receive Google push notifications
  events/route.ts      — POST/PATCH/DELETE: push events to Google Calendar
  status/route.ts      — GET: check connection status
  disconnect/route.ts  — POST: revoke tokens and stop webhook channel

convex/
  googleCalendar.ts    — Expand existing stubs: token CRUD, event upsert, channel management
  schema.ts            — Add googleCalendarTokens and googleCalendarChannels tables

src/app/(mobile)/
  m-settings/page.tsx  — New settings page with Integrations section
  m-settings/components/
    GoogleCalendarCard.tsx — Connection status and connect/disconnect UI
```

---

## 6. Environment Variables

```
GOOGLE_CLIENT_ID=           # OAuth client ID
GOOGLE_CLIENT_SECRET=       # OAuth client secret (server-only)
GOOGLE_OAUTH_REDIRECT_URI=  # e.g. http://localhost:3000/api/google/callback
```

---

## 7. Out of Scope

- Calendar view UI on mobile (separate feature).
- Multi-calendar support (only primary calendar for now).
- Shared/team calendar features.
- Google Meet integration.
- Offline sync.
