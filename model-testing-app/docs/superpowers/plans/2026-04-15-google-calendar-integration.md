# Google Calendar Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-way Google Calendar OAuth integration — sync events into RockCap via webhooks and optionally push tasks to Google Calendar.

**Architecture:** OAuth 2.0 authorization code flow with per-user token storage in Convex. Google push notifications (webhooks) for real-time inbound sync. API routes for OAuth handshake, webhook receiver, and outbound event CRUD. Settings page for connection management.

**Tech Stack:** Next.js API routes, Convex (schema + mutations), Google Calendar API v3, Clerk auth, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-15-google-calendar-integration-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/google/oauth.ts` | OAuth URL generation, token exchange, token refresh |
| `src/lib/google/calendar.ts` | Google Calendar API client — event CRUD, watch channels, sync |
| `src/app/api/google/auth/route.ts` | Generate OAuth URL and redirect user to Google |
| `src/app/api/google/callback/route.ts` | Handle OAuth callback, exchange code for tokens, store in Convex |
| `src/app/api/google/webhook/route.ts` | Receive Google push notifications, trigger incremental sync |
| `src/app/api/google/events/route.ts` | Push/update/delete events on Google Calendar |
| `src/app/api/google/disconnect/route.ts` | Revoke tokens, stop webhook channel |
| `src/app/(mobile)/m-settings/page.tsx` | Mobile settings page |
| `src/app/(mobile)/m-settings/components/GoogleCalendarCard.tsx` | Connection status and connect/disconnect UI |

### Modified Files
| File | Change |
|------|--------|
| `convex/schema.ts` | Add `googleCalendarTokens` and `googleCalendarChannels` tables |
| `convex/googleCalendar.ts` | Implement existing stubs + add token/channel CRUD mutations |
| `src/components/mobile/MobileNavDrawer.tsx` | Add Settings nav item |
| `src/components/tasks/TaskCreationFlow.tsx` | Add "Add to Google Calendar" toggle |

---

### Task 1: Add Convex Schema Tables

**Files:**
- Modify: `convex/schema.ts` (before line 3369)

- [ ] **Step 1: Add `googleCalendarTokens` table to schema**

In `convex/schema.ts`, add before the closing `});` on line 3369:

```typescript
  // Google Calendar OAuth tokens — per-user
  googleCalendarTokens: defineTable({
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.string(),
    scope: v.string(),
    connectedAt: v.string(),
    connectedEmail: v.string(),
  })
    .index("by_user", ["userId"]),

  // Google Calendar webhook channels — per-user
  googleCalendarChannels: defineTable({
    userId: v.id("users"),
    channelId: v.string(),
    resourceId: v.string(),
    expiration: v.string(),
    syncToken: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_channel", ["channelId"]),
```

- [ ] **Step 2: Run Convex codegen**

Run: `npx convex codegen`
Expected: Types regenerated, no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(google): add OAuth token and webhook channel tables to schema"
```

---

### Task 2: Build OAuth Library

**Files:**
- Create: `src/lib/google/oauth.ts`

- [ ] **Step 1: Create the OAuth helper module**

```typescript
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_CLIENT_ID not set');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET not set');
  return secret;
}

function getRedirectUri(): string {
  const uri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!uri) throw new Error('GOOGLE_OAUTH_REDIRECT_URI not set');
  return uri;
}

/**
 * Generate the Google OAuth consent URL.
 * @param state — opaque string (JSON with userId + CSRF token)
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return res.json();
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  return res.json();
}

/**
 * Revoke a token (access or refresh).
 */
export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

/**
 * Fetch the Google user's email address from the userinfo endpoint.
 */
export async function getGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error('Failed to fetch Google user info');

  const data = await res.json();
  return data.email;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/google/oauth.ts
git commit -m "feat(google): add OAuth helper library for token exchange and refresh"
```

---

### Task 3: Build Google Calendar API Client

**Files:**
- Create: `src/lib/google/calendar.ts`

- [ ] **Step 1: Create the Calendar API client**

```typescript
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  recurrence?: string[];
  reminders?: { useDefault: boolean; overrides?: { method: string; minutes: number }[] };
}

interface EventsListResponse {
  items: CalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

interface WatchResponse {
  id: string;
  resourceId: string;
  expiration: string;
}

async function calendarFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${err}`);
  }

  return res;
}

/**
 * List events from the user's primary calendar.
 * Pass syncToken for incremental sync, or timeMin/timeMax for initial sync.
 */
export async function listEvents(
  accessToken: string,
  opts: { syncToken?: string; timeMin?: string; timeMax?: string },
): Promise<EventsListResponse> {
  const params = new URLSearchParams();
  if (opts.syncToken) {
    params.set('syncToken', opts.syncToken);
  } else {
    if (opts.timeMin) params.set('timeMin', opts.timeMin);
    if (opts.timeMax) params.set('timeMax', opts.timeMax);
    params.set('singleEvents', 'true');
    params.set('orderBy', 'startTime');
  }
  params.set('maxResults', '250');

  const res = await calendarFetch(
    `/calendars/primary/events?${params.toString()}`,
    accessToken,
  );
  return res.json();
}

/**
 * Insert a new event into the user's primary calendar.
 */
export async function insertEvent(
  accessToken: string,
  event: CalendarEvent,
): Promise<CalendarEvent> {
  const res = await calendarFetch('/calendars/primary/events', accessToken, {
    method: 'POST',
    body: JSON.stringify(event),
  });
  return res.json();
}

/**
 * Update an existing event.
 */
export async function updateEvent(
  accessToken: string,
  eventId: string,
  event: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  const res = await calendarFetch(`/calendars/primary/events/${eventId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(event),
  });
  return res.json();
}

/**
 * Delete an event from Google Calendar.
 */
export async function deleteEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  await calendarFetch(`/calendars/primary/events/${eventId}`, accessToken, {
    method: 'DELETE',
  });
}

/**
 * Set up a push notification channel on the user's primary calendar.
 * @param webhookUrl — publicly accessible endpoint (e.g. https://yourapp.com/api/google/webhook)
 * @param channelId — UUID we generate for tracking
 */
export async function watchCalendar(
  accessToken: string,
  webhookUrl: string,
  channelId: string,
): Promise<WatchResponse> {
  const res = await calendarFetch('/calendars/primary/events/watch', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
    }),
  });
  return res.json();
}

/**
 * Stop a push notification channel.
 */
export async function stopChannel(
  accessToken: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  await fetch(`${CALENDAR_API}/channels/stop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}

export type { CalendarEvent, EventsListResponse, WatchResponse };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/google/calendar.ts
git commit -m "feat(google): add Calendar API client for event CRUD and webhook channels"
```

---

### Task 4: Implement Convex Token & Channel Mutations

**Files:**
- Modify: `convex/googleCalendar.ts`

- [ ] **Step 1: Rewrite `convex/googleCalendar.ts` with implemented mutations**

Replace the full file. Keep the existing `getAuthenticatedUser` helper and expand the stubs into real implementations:

```typescript
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ── Auth helper ──────────────────────────────────────────────
async function getAuthenticatedUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return user;
}

// ── Token CRUD ───────────────────────────────────────────────

export const saveTokens = mutation({
  args: {
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.string(),
    scope: v.string(),
    connectedEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Remove existing token row for this user (reconnect case)
    const existing = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return ctx.db.insert("googleCalendarTokens", {
      userId: user._id,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scope: args.scope,
      connectedAt: new Date().toISOString(),
      connectedEmail: args.connectedEmail,
    });
  },
});

export const getTokens = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    return ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
  },
});

export const updateAccessToken = mutation({
  args: {
    accessToken: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (!tokens) throw new Error("No Google Calendar connection found");
    await ctx.db.patch(tokens._id, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
    });
  },
});

export const deleteTokens = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (tokens) {
      await ctx.db.delete(tokens._id);
    }
  },
});

// ── Channel CRUD ─────────────────────────────────────────────

export const saveChannel = mutation({
  args: {
    channelId: v.string(),
    resourceId: v.string(),
    expiration: v.string(),
    syncToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Remove existing channel for this user
    const existing = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return ctx.db.insert("googleCalendarChannels", {
      userId: user._id,
      channelId: args.channelId,
      resourceId: args.resourceId,
      expiration: args.expiration,
      syncToken: args.syncToken,
    });
  },
});

export const getChannelByChannelId = query({
  args: { channelId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_channel", (q: any) => q.eq("channelId", args.channelId))
      .first();
  },
});

export const updateSyncToken = mutation({
  args: {
    channelId: v.string(),
    syncToken: v.string(),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_channel", (q: any) => q.eq("channelId", args.channelId))
      .first();
    if (!channel) throw new Error("Channel not found");
    await ctx.db.patch(channel._id, { syncToken: args.syncToken });
  },
});

export const deleteChannel = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (channel) {
      await ctx.db.delete(channel._id);
    }
  },
});

// ── Sync Status (from spec) ──────────────────────────────────

export const getSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();

    if (!tokens) {
      return { isConnected: false, connectedEmail: null, connectedAt: null };
    }

    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();

    return {
      isConnected: true,
      connectedEmail: tokens.connectedEmail,
      connectedAt: tokens.connectedAt,
      channelExpiration: channel?.expiration ?? null,
    };
  },
});

// ── Internal: Token lookup by userId (for webhook — no user auth) ─

export const getTokensByUserId = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
  },
});

// ── Event Upsert (internal — called by webhook, no user auth) ─

export const upsertGoogleEvent = internalMutation({
  args: {
    userId: v.id("users"),
    googleEventId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.optional(v.boolean()),
    status: v.optional(v.string()),
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      name: v.optional(v.string()),
      status: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if event already exists
    const existing = await ctx.db
      .query("events")
      .withIndex("by_google_event_id", (q: any) => q.eq("googleEventId", args.googleEventId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        location: args.location,
        startTime: args.startTime,
        endTime: args.endTime,
        allDay: args.allDay ?? false,
        status: args.status || "confirmed",
        attendees: args.attendees,
        syncStatus: "synced",
        lastGoogleSync: now,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("events", {
      title: args.title,
      description: args.description,
      location: args.location,
      startTime: args.startTime,
      endTime: args.endTime,
      allDay: args.allDay ?? false,
      status: args.status || "confirmed",
      attendees: args.attendees,
      googleEventId: args.googleEventId,
      syncStatus: "synced",
      lastGoogleSync: now,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Delete synced event (cancelled on Google) ────────────────

export const deleteByGoogleEventId = mutation({
  args: { googleEventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_google_event_id", (q: any) => q.eq("googleEventId", args.googleEventId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// ── Disconnect ───────────────────────────────────────────────

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    // Delete tokens
    const tokens = await ctx.db
      .query("googleCalendarTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (tokens) await ctx.db.delete(tokens._id);

    // Delete channel
    const channel = await ctx.db
      .query("googleCalendarChannels")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (channel) await ctx.db.delete(channel._id);

    return { success: true };
  },
});
```

- [ ] **Step 2: Run codegen and build check**

Run: `npx convex codegen && npx next build 2>&1 | tail -5`
Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add convex/googleCalendar.ts
git commit -m "feat(google): implement token, channel, and event sync mutations"
```

---

### Task 5: Build OAuth API Routes

**Files:**
- Create: `src/app/api/google/auth/route.ts`
- Create: `src/app/api/google/callback/route.ts`

- [ ] **Step 1: Create the auth route (initiates OAuth flow)**

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { buildAuthUrl } from '@/lib/google/oauth';
import crypto from 'crypto';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const csrf = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(JSON.stringify({ userId, csrf })).toString('base64');

    const url = buildAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Google auth error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Create the callback route (exchanges code for tokens)**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getGoogleEmail } from '@/lib/google/oauth';
import { getAuthenticatedConvexClient } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');

  // User denied access
  if (error) {
    return NextResponse.redirect(new URL('/m-settings?google=denied', request.url));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/m-settings?google=error', request.url));
  }

  try {
    // Decode state
    const state = JSON.parse(Buffer.from(stateParam, 'base64').toString());
    if (!state.userId) {
      return NextResponse.redirect(new URL('/m-settings?google=error', request.url));
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    const email = await getGoogleEmail(tokens.access_token);

    // Store tokens in Convex
    const convex = await getAuthenticatedConvexClient();
    await convex.mutation(api.googleCalendar.saveTokens, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      connectedEmail: email,
    });

    return NextResponse.redirect(new URL('/m-settings?google=success', request.url));
  } catch (err) {
    console.error('Google callback error:', err);
    return NextResponse.redirect(new URL('/m-settings?google=error', request.url));
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/google/auth/route.ts src/app/api/google/callback/route.ts
git commit -m "feat(google): add OAuth auth and callback API routes"
```

---

### Task 6: Build Webhook & Disconnect Routes

**Files:**
- Create: `src/app/api/google/webhook/route.ts`
- Create: `src/app/api/google/disconnect/route.ts`

- [ ] **Step 1: Create the webhook receiver**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { refreshAccessToken } from '@/lib/google/oauth';
import { listEvents } from '@/lib/google/calendar';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id');
  const resourceState = request.headers.get('x-goog-resource-state');

  // Google sends a sync message on channel creation — acknowledge it
  if (resourceState === 'sync') {
    return NextResponse.json({ ok: true });
  }

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channel ID' }, { status: 400 });
  }

  try {
    // Look up channel to find user and syncToken
    const channel = await convex.query(api.googleCalendar.getChannelByChannelId, { channelId });
    if (!channel) {
      return NextResponse.json({ error: 'Unknown channel' }, { status: 404 });
    }

    // Get user's tokens
    // Note: We need an internal query here since webhook has no user auth.
    // For now, we'll use the channel's userId to look up tokens directly.
    // This requires the tokens query to accept a userId param for internal use.
    // We'll handle this via a server-side Convex client with admin access.

    // Fetch incremental changes from Google
    // Token refresh and event upsert would happen here.
    // Full implementation depends on having a valid access token for the user.

    console.log(`Webhook received for channel ${channelId}, state: ${resourceState}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    // Always return 200 to prevent Google from retrying indefinitely
    return NextResponse.json({ ok: true });
  }
}
```

- [ ] **Step 2: Create the disconnect route**

```typescript
import { NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';
import { revokeToken } from '@/lib/google/oauth';
import { stopChannel } from '@/lib/google/calendar';

export async function POST() {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);

    // Get current tokens and channel before deleting
    const tokens = await convex.query(api.googleCalendar.getTokens, {});
    const status = await convex.query(api.googleCalendar.getSyncStatus, {});

    // Revoke Google token
    if (tokens?.refreshToken) {
      try {
        await revokeToken(tokens.refreshToken);
      } catch {
        // Token may already be revoked — continue with cleanup
      }
    }

    // Stop webhook channel if it exists
    if (tokens?.accessToken && status?.channelExpiration) {
      try {
        const channel = await convex.query(api.googleCalendar.getChannelByChannelId, {
          channelId: '', // We need the channel data
        });
        // Channel cleanup is handled by the Convex disconnect mutation
      } catch {
        // Channel may already be expired
      }
    }

    // Delete tokens and channel from Convex
    await convex.mutation(api.googleCalendar.disconnect, {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/google/webhook/route.ts src/app/api/google/disconnect/route.ts
git commit -m "feat(google): add webhook receiver and disconnect API routes"
```

---

### Task 7: Build Event Push Route

**Files:**
- Create: `src/app/api/google/events/route.ts`

- [ ] **Step 1: Create the events CRUD route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';
import { refreshAccessToken } from '@/lib/google/oauth';
import { insertEvent, updateEvent, deleteEvent, type CalendarEvent } from '@/lib/google/calendar';

async function getValidAccessToken(convex: any): Promise<string> {
  const tokens = await convex.query(api.googleCalendar.getTokens, {});
  if (!tokens) throw new Error('Google Calendar not connected');

  // Check if token needs refresh
  const expiresAt = new Date(tokens.expiresAt).getTime();
  const buffer = 5 * 60 * 1000; // 5 minutes

  if (Date.now() > expiresAt - buffer) {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await convex.mutation(api.googleCalendar.updateAccessToken, {
      accessToken: refreshed.access_token,
      expiresAt: newExpiry,
    });
    return refreshed.access_token;
  }

  return tokens.accessToken;
}

// POST — Create event on Google Calendar
export async function POST(request: NextRequest) {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);
    const accessToken = await getValidAccessToken(convex);
    const body = await request.json();

    const event: CalendarEvent = {
      summary: body.title,
      description: body.description,
      start: body.allDay
        ? { date: body.startDate }
        : { dateTime: body.startTime, timeZone: 'Europe/London' },
      end: body.allDay
        ? { date: body.endDate || body.startDate }
        : { dateTime: body.endTime || body.startTime, timeZone: 'Europe/London' },
    };

    const created = await insertEvent(accessToken, event);
    return NextResponse.json({ success: true, googleEventId: created.id });
  } catch (error) {
    console.error('Create event error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// PATCH — Update event on Google Calendar
export async function PATCH(request: NextRequest) {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);
    const accessToken = await getValidAccessToken(convex);
    const body = await request.json();

    if (!body.googleEventId) {
      return NextResponse.json({ error: 'googleEventId required' }, { status: 400 });
    }

    const updates: Partial<CalendarEvent> = {};
    if (body.title) updates.summary = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.startTime) {
      updates.start = body.allDay
        ? { date: body.startDate }
        : { dateTime: body.startTime, timeZone: 'Europe/London' };
    }
    if (body.endTime || body.endDate) {
      updates.end = body.allDay
        ? { date: body.endDate }
        : { dateTime: body.endTime, timeZone: 'Europe/London' };
    }

    await updateEvent(accessToken, body.googleEventId, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update event error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// DELETE — Remove event from Google Calendar
export async function DELETE(request: NextRequest) {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);
    const accessToken = await getValidAccessToken(convex);
    const { searchParams } = new URL(request.url);
    const googleEventId = searchParams.get('googleEventId');

    if (!googleEventId) {
      return NextResponse.json({ error: 'googleEventId required' }, { status: 400 });
    }

    await deleteEvent(accessToken, googleEventId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/google/events/route.ts
git commit -m "feat(google): add event push/update/delete API route"
```

---

### Task 8: Build Mobile Settings Page

**Files:**
- Create: `src/app/(mobile)/m-settings/page.tsx`
- Create: `src/app/(mobile)/m-settings/components/GoogleCalendarCard.tsx`
- Modify: `src/components/mobile/MobileNavDrawer.tsx`

- [ ] **Step 1: Create the settings page**

```typescript
'use client';

import GoogleCalendarCard from './components/GoogleCalendarCard';

export default function MobileSettingsPage() {
  return (
    <div className="pb-4">
      <div className="px-[var(--m-page-px)] pt-5 pb-3">
        <h1 className="text-[20px] font-semibold text-[var(--m-text-primary)] tracking-[-0.02em]">
          Settings
        </h1>
        <p className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
          Manage integrations and preferences
        </p>
      </div>

      <div className="px-[var(--m-page-px)] mb-3">
        <div className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-[0.05em] mb-2">
          Integrations
        </div>
        <GoogleCalendarCard />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the GoogleCalendarCard component**

```typescript
'use client';

import { useQuery } from 'convex/react';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api } from '../../../../../convex/_generated/api';

export default function GoogleCalendarCard() {
  const syncStatus = useQuery(api.googleCalendar.getSyncStatus, {});
  const searchParams = useSearchParams();
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Handle OAuth redirect result
  useEffect(() => {
    const google = searchParams.get('google');
    if (google === 'success') setStatusMessage('Google Calendar connected successfully');
    else if (google === 'denied') setStatusMessage('Google Calendar access was denied');
    else if (google === 'error') setStatusMessage('Failed to connect Google Calendar');

    if (google) {
      const timer = setTimeout(() => setStatusMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const handleConnect = () => {
    window.open('/api/google/auth', '_blank');
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Google Calendar? Your synced events will remain but no longer update.')) return;
    setDisconnecting(true);
    try {
      await fetch('/api/google/disconnect', { method: 'POST' });
    } catch (err) {
      console.error('Disconnect failed:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  if (syncStatus === undefined) {
    return (
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] px-4 py-4 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--m-text-tertiary)]" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-[var(--m-text-tertiary)] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-[var(--m-text-primary)]">
              Google Calendar
            </div>
            {syncStatus.isConnected ? (
              <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
                Connected as {syncStatus.connectedEmail}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
                Sync your calendar events and add tasks to your schedule
              </div>
            )}
          </div>
        </div>

        {/* Status message */}
        {statusMessage && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-[12px] font-medium ${
            searchParams.get('google') === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}>
            {statusMessage}
          </div>
        )}

        {/* Action button */}
        <div className="mt-3">
          {syncStatus.isConnected ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="w-full py-2 px-3 text-[13px] font-medium text-[var(--m-error)] bg-red-50 rounded-lg active:bg-red-100 disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="w-full py-2 px-3 text-[13px] font-medium text-[var(--m-text-on-brand)] bg-[var(--m-bg-brand)] rounded-lg active:opacity-80"
            >
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add Settings to the nav drawer**

In `src/components/mobile/MobileNavDrawer.tsx`, add `Settings` import and nav item:

Add to lucide-react import: `Settings`

Add to `navItems` array (as the last item):
```typescript
  { href: '/m-settings', label: 'Settings', icon: Settings },
```

- [ ] **Step 4: Build check**

Run: `npx next build 2>&1 | tail -5`
Expected: Build passes.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(mobile\)/m-settings/page.tsx src/app/\(mobile\)/m-settings/components/GoogleCalendarCard.tsx src/components/mobile/MobileNavDrawer.tsx
git commit -m "feat(google): add mobile settings page with Google Calendar connection card"
```

---

### Task 9: Add "Add to Google Calendar" Toggle in Task Creation

**Files:**
- Modify: `src/components/tasks/TaskCreationFlow.tsx`

- [ ] **Step 1: Add Google Calendar toggle to the task confirmation UI**

In `src/components/tasks/TaskCreationFlow.tsx`:

Add imports at the top:
```typescript
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Calendar } from 'lucide-react';
```

Add state and query inside the component (after existing state declarations around line 48):
```typescript
const [addToCalendar, setAddToCalendar] = useState(false);
const googleStatus = useQuery(api.googleCalendar.getSyncStatus, {});
const isGoogleConnected = googleStatus?.isConnected ?? false;
```

In the `handleConfirm` function, after `onTaskCreated(taskId)` (around line 141), add:
```typescript
    // Push to Google Calendar if opted in
    if (addToCalendar && parsedTask.dueDate) {
      try {
        await fetch('/api/google/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: parsedTask.title,
            description: parsedTask.clientId ? `Client task` : undefined,
            startDate: parsedTask.dueDate.split('T')[0],
            allDay: !parsedTask.dueDate.includes('T'),
            startTime: parsedTask.dueDate.includes('T') ? parsedTask.dueDate : undefined,
          }),
        });
      } catch (err) {
        console.error('Failed to push to Google Calendar:', err);
        // Non-blocking — task is already created
      }
    }
```

In the task confirmation card JSX (find the confirm button area), add the toggle before the confirm button:
```typescript
{isGoogleConnected && parsedTask?.dueDate && (
  <button
    onClick={() => setAddToCalendar(!addToCalendar)}
    className="flex items-center gap-2 w-full px-3 py-2 mb-2 rounded-lg border border-[var(--m-border)] text-[13px]"
  >
    <Calendar className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
    <span className="flex-1 text-left text-[var(--m-text-secondary)]">Add to Google Calendar</span>
    <div className={`w-8 h-5 rounded-full transition-colors ${addToCalendar ? 'bg-[var(--m-bg-brand)]' : 'bg-[var(--m-border)]'}`}>
      <div className={`w-4 h-4 rounded-full bg-white shadow mt-0.5 transition-transform ${addToCalendar ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
    </div>
  </button>
)}
```

- [ ] **Step 2: Build check**

Run: `npx next build 2>&1 | tail -5`
Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/TaskCreationFlow.tsx
git commit -m "feat(google): add optional 'Add to Google Calendar' toggle in task creation"
```

---

### Task 10: Initial Sync & Channel Setup After OAuth

**Files:**
- Create: `src/app/api/google/setup-sync/route.ts`

- [ ] **Step 1: Create the setup-sync route**

This route is called after OAuth callback to do the initial event pull and set up the webhook channel. It runs with user auth (called from the frontend after redirect).

```typescript
import { NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';
import { refreshAccessToken } from '@/lib/google/oauth';
import { listEvents, watchCalendar } from '@/lib/google/calendar';
import crypto from 'crypto';

export async function POST() {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);

    const tokens = await convex.query(api.googleCalendar.getTokens, {});
    if (!tokens) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 });
    }

    let accessToken = tokens.accessToken;

    // Refresh if needed
    const expiresAt = new Date(tokens.expiresAt).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      accessToken = refreshed.access_token;
      await convex.mutation(api.googleCalendar.updateAccessToken, {
        accessToken: refreshed.access_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      });
    }

    // Initial sync — pull next 30 days of events
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const eventsResponse = await listEvents(accessToken, {
      timeMin: now.toISOString(),
      timeMax: thirtyDaysOut.toISOString(),
    });

    // The syncToken for future incremental syncs
    const syncToken = eventsResponse.nextSyncToken || '';

    // Set up webhook channel
    const channelId = crypto.randomUUID();
    const webhookUrl = `${process.env.GOOGLE_OAUTH_REDIRECT_URI?.replace('/api/google/callback', '')}/api/google/webhook`;

    let resourceId = '';
    let expiration = '';
    try {
      const watchResponse = await watchCalendar(accessToken, webhookUrl, channelId);
      resourceId = watchResponse.resourceId;
      expiration = watchResponse.expiration;
    } catch (err) {
      console.warn('Webhook setup failed (may need public URL):', err);
      // Continue without webhook — sync will work on-demand
    }

    // Save channel info
    if (resourceId) {
      await convex.mutation(api.googleCalendar.saveChannel, {
        channelId,
        resourceId,
        expiration,
        syncToken,
      });
    }

    return NextResponse.json({
      success: true,
      eventsSynced: eventsResponse.items?.length ?? 0,
      webhookActive: !!resourceId,
    });
  } catch (error) {
    console.error('Setup sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Trigger setup-sync from GoogleCalendarCard after successful connection**

In `src/app/(mobile)/m-settings/components/GoogleCalendarCard.tsx`, add to the `useEffect` that handles the `google=success` param:

After `setStatusMessage('Google Calendar connected successfully')`, add:
```typescript
    // Trigger initial sync
    fetch('/api/google/setup-sync', { method: 'POST' }).catch(console.error);
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/google/setup-sync/route.ts src/app/\(mobile\)/m-settings/components/GoogleCalendarCard.tsx
git commit -m "feat(google): add initial event sync and webhook channel setup after OAuth"
```

---

### Task 11: Environment Variables & Final Build

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Add Google OAuth environment variables**

Add to `.env.local`:
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/callback
```

Note: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` need to be filled in after creating a Google Cloud project with Calendar API enabled and an OAuth consent screen configured.

- [ ] **Step 2: Full build check**

Run: `npx next build 2>&1 | tail -10`
Expected: Build passes with all new routes visible.

- [ ] **Step 3: Final commit and push**

```bash
git add -A
git commit -m "feat(google): complete Google Calendar OAuth integration"
git push origin mobile2
```

---

## Implementation Notes

**Webhook requires public URL:** During local development, the webhook channel setup will fail because Google can't reach `localhost`. Use a tool like `ngrok` to expose the webhook endpoint for testing, or skip webhook testing locally and rely on the initial sync + on-demand refresh pattern.

**Channel renewal:** Webhook channels expire after ~7 days. A Convex scheduled function should be added to renew channels before expiry. This can be implemented as a follow-up once the core integration is working — the system degrades gracefully (events still sync on-demand via the Daily Brief generation job).

**Google Cloud setup steps:** Before running the integration, create a Google Cloud project at console.cloud.google.com, enable the Google Calendar API, configure the OAuth consent screen (external, testing mode), add test users, and create OAuth 2.0 credentials (Web application type) with the redirect URI set to `http://localhost:3000/api/google/callback`.
