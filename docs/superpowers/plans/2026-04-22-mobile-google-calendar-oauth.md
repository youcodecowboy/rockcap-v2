# Mobile Google Calendar OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let mobile users connect Google Calendar from a Settings screen and see calendar events on their Tasks list, matching the behaviour that already works on the web app.

**Architecture:** A new `/settings` route in the Expo app exposes a `GoogleCalendarCard`. Connecting runs native PKCE OAuth via `expo-auth-session`'s Google provider. The resulting auth code is sent to a new Convex **action** (`googleCalendar.exchangeMobileCode`) that trusts the Clerk identity on the call, exchanges the code server-side, stores tokens in the existing `googleCalendarTokens` table, and triggers the initial sync via the existing `/api/google/setup-sync` route (after a small edit to accept Bearer auth). Events automatically flow to the Tasks screen through the existing `events.getByDateRange` query.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-auth-session, expo-web-browser, expo-crypto, Convex, Clerk (Expo), Next.js 16 (web backend).

**Reference spec:** `docs/superpowers/specs/2026-04-22-mobile-google-calendar-oauth-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `mobile-app/app/settings/_layout.tsx` | Stack layout (title, back nav) for the settings section |
| `mobile-app/app/settings/index.tsx` | Settings screen shell — renders integration cards list |
| `mobile-app/components/settings/GoogleCalendarCard.tsx` | RN port of the web card. Three states, three buttons |
| `mobile-app/lib/googleCalendarAuth.ts` | `useGoogleCalendarAuth()` hook wrapping `expo-auth-session` Google provider |

### Edited files

| Path | Change |
|------|--------|
| `mobile-app/components/MobileNavDrawer.tsx:26` | Flip Settings nav entry from placeholder to `/settings` route |
| `mobile-app/app.json` | Add `android.package: "com.rockcap.mobile"` |
| `model-testing-app/convex/googleCalendar.ts` | Append `exchangeMobileCode` action |
| `model-testing-app/src/app/api/google/setup-sync/route.ts` | Accept `Authorization: Bearer <token>` in addition to cookie auth |

### Not-touched but relevant

| Path | Why it matters |
|------|----------------|
| `mobile-app/app/tasks/index.tsx:203-206` | Already consumes `events.getByDateRange`. No edit needed — events appear automatically after OAuth succeeds |
| `model-testing-app/convex/googleCalendar.ts` (existing functions) | `saveTokens`, `getSyncStatus`, `disconnect` reused unchanged |
| `model-testing-app/src/lib/google/oauth.ts` | Reference for token-exchange payload format (server-side copy) |

---

## Task 1: Settings Route Shell + Drawer Wire-Up

**Goal:** Clicking "Settings" in the drawer opens an empty `/settings` screen. No card yet — just prove the route works.

**Files:**
- Create: `mobile-app/app/settings/_layout.tsx`
- Create: `mobile-app/app/settings/index.tsx`
- Modify: `mobile-app/components/MobileNavDrawer.tsx:26`

- [ ] **Step 1.1: Create `mobile-app/app/settings/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgCard },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
    </Stack>
  );
}
```

- [ ] **Step 1.2: Create `mobile-app/app/settings/index.tsx` (empty shell)**

```tsx
import { View, Text, ScrollView } from 'react-native';

export default function SettingsScreen() {
  return (
    <ScrollView className="flex-1 bg-m-bg">
      <View className="px-4 py-4">
        <Text className="text-xs text-m-text-tertiary font-semibold uppercase mb-3">
          Integrations
        </Text>
        {/* GoogleCalendarCard inserted in Task 6 */}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 1.3: Modify `mobile-app/components/MobileNavDrawer.tsx` line 26**

Change:
```tsx
{ label: 'Settings', icon: Settings, route: null },
```
To:
```tsx
{ label: 'Settings', icon: Settings, route: '/settings' },
```

- [ ] **Step 1.4: Manual smoke test**

Run: `cd mobile-app && npx expo start` (iOS Simulator or device)
- Open drawer from any screen
- Tap Settings → screen with "Integrations" header appears
- Back button returns to previous screen

Expected: no red screen of death, no "Coming soon" alert, header title "Settings".

- [ ] **Step 1.5: Commit**

```bash
git add mobile-app/app/settings/_layout.tsx mobile-app/app/settings/index.tsx mobile-app/components/MobileNavDrawer.tsx
git commit -m "feat(mobile): add /settings route shell + wire drawer entry"
```

---

## Task 2: Android Package Name in app.json

**Goal:** Set the Android package so Google Cloud Console can register an Android OAuth client against it. Blocks Android OAuth testing, not iOS.

**Files:**
- Modify: `mobile-app/app.json`

- [ ] **Step 2.1: Add `android.package` to `mobile-app/app.json`**

Read the file first; insert between `ios` and `plugins` blocks:

```jsonc
  "ios": {
    "supportsTablet": false,
    "bundleIdentifier": "com.rockcap.mobile",
    ...
  },
  "android": {
    "package": "com.rockcap.mobile"
  },
  "plugins": [
    ...
  ]
```

- [ ] **Step 2.2: Verify JSON is valid**

Run: `cd mobile-app && node -e "JSON.parse(require('fs').readFileSync('app.json', 'utf8'))"`
Expected: no output (success). If error, re-check comma placement.

- [ ] **Step 2.3: Commit**

```bash
git add mobile-app/app.json
git commit -m "feat(mobile): set android.package for Google OAuth client"
```

---

## Task 3: Convex Action `exchangeMobileCode`

**Goal:** Add a server-side action that takes an auth code + PKCE verifier from mobile, exchanges them for tokens, and writes to Convex.

**Files:**
- Modify: `model-testing-app/convex/googleCalendar.ts`

- [ ] **Step 3.1: Add imports at the top of `convex/googleCalendar.ts`**

Current imports are:
```ts
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
```

Change to:
```ts
import { v } from "convex/values";
import { mutation, query, internalMutation, action } from "./_generated/server";
import { api } from "./_generated/api";
```

- [ ] **Step 3.2: Append the action at the end of `convex/googleCalendar.ts`**

```ts
// ── Mobile OAuth: server-side code exchange ──────────────────

export const exchangeMobileCode = action({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; email: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth env vars missing in Convex");
    }

    // Exchange authorization code for tokens (PKCE)
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: args.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: args.redirectUri,
        grant_type: "authorization_code",
        code_verifier: args.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google token exchange failed: ${errText}`);
    }

    const tokens: {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      token_type: string;
    } = await tokenRes.json();

    // Google only returns refresh_token on first consent (prompt=consent forces it).
    // If missing (re-consent by same account), look up existing and preserve it.
    let refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      const existing = await ctx.runQuery(api.googleCalendar.getTokens, {});
      refreshToken = existing?.refreshToken;
      if (!refreshToken) {
        throw new Error(
          "Google did not return a refresh_token. Revoke app access in Google account settings and retry.",
        );
      }
    }

    // Fetch the connected email
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!userRes.ok) throw new Error("Failed to fetch Google user info");
    const { email } = (await userRes.json()) as { email: string };

    // Persist to Convex via existing mutation
    await ctx.runMutation(api.googleCalendar.saveTokens, {
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      connectedEmail: email,
    });

    return { success: true, email };
  },
});
```

- [ ] **Step 3.3: Regenerate Convex types**

Run: `cd model-testing-app && npx convex codegen`
Expected: finishes without errors. `_generated/api.d.ts` now includes `exchangeMobileCode`.

- [ ] **Step 3.4: Smoke test in Convex dashboard**

This step *can't* be a full end-to-end test without a real auth code, but confirms types compile and the action is callable:

Run: `cd model-testing-app && npx convex run googleCalendar:exchangeMobileCode '{"code":"fake","codeVerifier":"fake","redirectUri":"fake"}'`

Expected: fails with `Unauthenticated` (from the action, because CLI run has no Clerk identity) **OR** `Google token exchange failed: invalid_grant` (if you're using `--prod` with a deployment key — either error proves the action wired up correctly).

- [ ] **Step 3.5: Commit**

```bash
git add model-testing-app/convex/googleCalendar.ts
git commit -m "feat(convex): add exchangeMobileCode action for mobile OAuth"
```

---

## Task 4: `/api/google/setup-sync` Bearer Auth

**Goal:** Let mobile POST to `/api/google/setup-sync` with `Authorization: Bearer <convex-template-clerk-jwt>`, while keeping the existing cookie auth working for web.

**Files:**
- Modify: `model-testing-app/src/app/api/google/setup-sync/route.ts`

- [ ] **Step 4.1: Add Bearer-aware client helper at the top of the file**

Rewrite `route.ts` to:

```ts
import { NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { refreshAccessToken } from '@/lib/google/oauth';
import { listEvents, watchCalendar } from '@/lib/google/calendar';
import crypto from 'crypto';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || '';

async function getClientForRequest(request: Request): Promise<ConvexHttpClient> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (!convexUrl) throw new Error('Missing NEXT_PUBLIC_CONVEX_URL');
    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(token);
    return client;
  }
  // Fallback: cookie-based auth (web)
  return getAuthenticatedConvexClient();
}

export async function POST(request: Request) {
  try {
    const convex = await getClientForRequest(request);
    await requireAuth(convex);

    const tokens = await convex.query(api.googleCalendar.getTokens, {});
    if (!tokens) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 });
    }

    let accessToken = tokens.accessToken;

    const expiresAt = new Date(tokens.expiresAt).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      accessToken = refreshed.access_token;
      await convex.mutation(api.googleCalendar.updateAccessToken, {
        accessToken: refreshed.access_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      });
    }

    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const eventsResponse = await listEvents(accessToken, {
      timeMin: now.toISOString(),
      timeMax: thirtyDaysOut.toISOString(),
    });

    let syncedCount = 0;
    if (eventsResponse.items) {
      for (const gEvent of eventsResponse.items) {
        if (!gEvent.id || !gEvent.summary) continue;
        try {
          await convex.mutation(api.googleCalendar.syncGoogleEvent, {
            googleEventId: gEvent.id,
            title: gEvent.summary,
            description: gEvent.description,
            location: gEvent.location,
            startTime: gEvent.start?.dateTime || gEvent.start?.date || now.toISOString(),
            endTime: gEvent.end?.dateTime || gEvent.end?.date || now.toISOString(),
            allDay: !gEvent.start?.dateTime,
            status: gEvent.status || 'confirmed',
            attendees: gEvent.attendees?.map(a => ({
              email: a.email || '',
              name: a.displayName,
              status: a.responseStatus,
            })),
          });
          syncedCount++;
        } catch (err) {
          console.warn(`Failed to sync event ${gEvent.id}:`, err);
        }
      }
    }

    const syncToken = eventsResponse.nextSyncToken || '';

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
    }

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
      eventsSynced: syncedCount,
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

Key changes: the POST handler now takes a `request` parameter; new helper `getClientForRequest()` prefers Bearer over cookie.

- [ ] **Step 4.2: Web regression smoke test**

Run: `cd model-testing-app && npm run dev`
Open web app, go to `/m-settings`, click "Sync Now" while connected.
Expected: toast shows "Synced N events" (same as before the edit). If broken, revert and re-check cookie path.

- [ ] **Step 4.3: Commit**

```bash
git add model-testing-app/src/app/api/google/setup-sync/route.ts
git commit -m "feat(api): accept Bearer token on /api/google/setup-sync for mobile"
```

---

## Task 5: `useGoogleCalendarAuth()` Hook

**Goal:** A small hook that handles the Google OAuth prompt on mobile and exposes `{ request, response, promptAsync }`.

**Files:**
- Create: `mobile-app/lib/googleCalendarAuth.ts`

- [ ] **Step 5.1: Create the hook**

```ts
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

// Ensures the in-app browser closes cleanly after OAuth redirect
WebBrowser.maybeCompleteAuthSession();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function useGoogleCalendarAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    scopes: SCOPES,
    // `expo-auth-session/providers/google` uses the authorization code flow
    // with PKCE by default when responseType is not 'id_token'.
  });

  // Dev-time sanity log: confirm client IDs are present.
  useEffect(() => {
    if (__DEV__) {
      if (!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) {
        console.warn('[googleCalendarAuth] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID not set');
      }
      if (!process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) {
        console.warn('[googleCalendarAuth] EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID not set');
      }
    }
  }, []);

  return { request, response, promptAsync };
}
```

- [ ] **Step 5.2: Document the two env vars required**

Create/append to `mobile-app/.env.local.example` (create if missing):

```
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=xxx.apps.googleusercontent.com
EXPO_PUBLIC_API_BASE_URL=https://your-vercel-deploy.vercel.app
```

- [ ] **Step 5.3: Commit**

```bash
git add mobile-app/lib/googleCalendarAuth.ts mobile-app/.env.local.example
git commit -m "feat(mobile): add useGoogleCalendarAuth hook + env var docs"
```

---

## Task 6: `GoogleCalendarCard` Component

**Goal:** Port the 130-line web card to RN with NativeWind. Three visual states, three actions. Uses the hook from Task 5 for Connect, the new Convex action from Task 3 for code exchange, and the bearer-auth route from Task 4 for sync.

**Files:**
- Create: `mobile-app/components/settings/GoogleCalendarCard.tsx`
- Modify: `mobile-app/app/settings/index.tsx`

- [ ] **Step 6.1: Create the card**

```tsx
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useAction, useMutation } from 'convex/react';
import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react-native';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { useGoogleCalendarAuth } from '@/lib/googleCalendarAuth';
import { colors } from '@/lib/theme';

export default function GoogleCalendarCard() {
  const syncStatus = useQuery(api.googleCalendar.getSyncStatus, {});
  const exchangeMobileCode = useAction(api.googleCalendar.exchangeMobileCode);
  const disconnect = useMutation(api.googleCalendar.disconnect);
  const { getToken } = useAuth();
  const { request, response, promptAsync } = useGoogleCalendarAuth();

  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // React to OAuth prompt outcome
  useEffect(() => {
    (async () => {
      if (!response) return;
      if (response.type === 'success') {
        const code = response.params.code;
        const codeVerifier = request?.codeVerifier;
        const redirectUri = request?.redirectUri;
        if (!code || !codeVerifier || !redirectUri) {
          setStatusMessage({ kind: 'error', text: 'OAuth response missing fields' });
          setConnecting(false);
          return;
        }
        try {
          const result = await exchangeMobileCode({ code, codeVerifier, redirectUri });
          setStatusMessage({ kind: 'success', text: `Connected as ${result.email}` });
          // Fire initial sync (non-blocking to UI once queued)
          triggerInitialSync();
        } catch (err) {
          setStatusMessage({
            kind: 'error',
            text: err instanceof Error ? err.message : 'Connection failed',
          });
        } finally {
          setConnecting(false);
        }
      } else if (response.type === 'cancel' || response.type === 'dismiss') {
        setStatusMessage({ kind: 'error', text: 'Connection cancelled' });
        setConnecting(false);
      } else if (response.type === 'error') {
        setStatusMessage({
          kind: 'error',
          text: response.error?.message || 'Google auth error',
        });
        setConnecting(false);
      }
    })();
  }, [response]);

  // Auto-clear status messages after 5s
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL;

  async function triggerInitialSync() {
    if (!apiBase) return;
    try {
      const token = await getToken({ template: 'convex' });
      await fetch(`${apiBase}/api/google/setup-sync`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch (err) {
      console.warn('Initial sync failed:', err);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setStatusMessage(null);
    try {
      await promptAsync();
      // Result is handled in the effect above
    } catch (err) {
      setStatusMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not start OAuth',
      });
      setConnecting(false);
    }
  }

  async function handleSyncNow() {
    if (!apiBase) {
      setStatusMessage({ kind: 'error', text: 'API base URL not configured' });
      return;
    }
    setSyncing(true);
    setStatusMessage(null);
    try {
      const token = await getToken({ template: 'convex' });
      const res = await fetch(`${apiBase}/api/google/setup-sync`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setStatusMessage({
        kind: 'success',
        text: `Synced ${data.eventsSynced} events from Google Calendar`,
      });
    } catch (err) {
      setStatusMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Sync failed',
      });
    } finally {
      setSyncing(false);
    }
  }

  function handleDisconnect() {
    Alert.alert(
      'Disconnect Google Calendar?',
      'Your synced events will remain but no longer update.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setDisconnecting(true);
            try {
              await disconnect({});
              setStatusMessage({ kind: 'success', text: 'Disconnected' });
            } catch (err) {
              setStatusMessage({
                kind: 'error',
                text: err instanceof Error ? err.message : 'Disconnect failed',
              });
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ],
    );
  }

  if (syncStatus === undefined) {
    return (
      <View className="bg-m-bg-card border border-m-border rounded-2xl px-4 py-6 items-center justify-center">
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <View className="bg-m-bg-card border border-m-border rounded-2xl overflow-hidden">
      <View className="px-4 py-4">
        <View className="flex-row items-center gap-3">
          <Calendar size={20} color={colors.textTertiary} />
          <View className="flex-1">
            <Text className="text-[14px] font-semibold text-m-text-primary">
              Google Calendar
            </Text>
            <Text className="text-[12px] text-m-text-tertiary mt-0.5">
              {syncStatus.isConnected
                ? `Connected as ${syncStatus.connectedEmail}`
                : 'Sync your calendar events and add tasks to your schedule'}
            </Text>
          </View>
        </View>

        {statusMessage && (
          <View
            className={`mt-3 px-3 py-2 rounded-lg ${
              statusMessage.kind === 'success' ? 'bg-emerald-50' : 'bg-red-50'
            }`}
          >
            <Text
              className={`text-[12px] font-medium ${
                statusMessage.kind === 'success' ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {statusMessage.text}
            </Text>
          </View>
        )}

        <View className="mt-3 gap-2">
          {syncStatus.isConnected ? (
            <>
              <TouchableOpacity
                onPress={handleSyncNow}
                disabled={syncing}
                className="py-2 px-3 border border-m-border rounded-lg items-center active:bg-m-bg-subtle"
                style={syncing ? { opacity: 0.5 } : undefined}
              >
                <Text className="text-[13px] font-medium text-m-text-primary">
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDisconnect}
                disabled={disconnecting}
                className="py-2 px-3 rounded-lg items-center bg-red-50 active:bg-red-100"
                style={disconnecting ? { opacity: 0.5 } : undefined}
              >
                <Text className="text-[13px] font-medium text-m-error">
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={handleConnect}
              disabled={connecting || !request}
              className="py-2 px-3 rounded-lg items-center bg-m-bg-brand active:opacity-80"
              style={connecting || !request ? { opacity: 0.5 } : undefined}
            >
              <Text className="text-[13px] font-medium text-m-text-on-brand">
                {connecting ? 'Connecting...' : 'Connect Google Calendar'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 6.2: Insert card into `mobile-app/app/settings/index.tsx`**

Replace the file's body with:

```tsx
import { View, Text, ScrollView } from 'react-native';
import GoogleCalendarCard from '@/components/settings/GoogleCalendarCard';

export default function SettingsScreen() {
  return (
    <ScrollView className="flex-1 bg-m-bg">
      <View className="px-4 py-4">
        <Text className="text-xs text-m-text-tertiary font-semibold uppercase mb-3">
          Integrations
        </Text>
        <GoogleCalendarCard />
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 6.3: Static-type check**

Run: `cd mobile-app && npx tsc --noEmit`
Expected: clean — no errors from the new files. If `colors.bgCard` / similar doesn't exist, match the existing names in `mobile-app/lib/theme.ts`; adjust accordingly (read the theme file first).

- [ ] **Step 6.4: Loading-state smoke test**

With Google Cloud Console client IDs configured in `.env.local` (IOS/Android client IDs and `EXPO_PUBLIC_API_BASE_URL`), run: `cd mobile-app && npx expo start`.
- Drawer → Settings → card renders in **disconnected** state (assuming no prior connection), shows "Connect Google Calendar".
- Tap Connect → Google consent screen opens in the system browser/in-app browser.
- Cancel on Google → back in app, toast "Connection cancelled" appears.

Expected: no crashes, button states toggle correctly, no console errors about missing env vars (other than the intentional dev warnings if one is missing).

- [ ] **Step 6.5: Commit**

```bash
git add mobile-app/components/settings/GoogleCalendarCard.tsx mobile-app/app/settings/index.tsx
git commit -m "feat(mobile): port Google Calendar card with OAuth + sync + disconnect"
```

---

## Task 7: End-to-End OAuth Flow Test

**Goal:** Prove the complete happy path works on iOS, and that events appear on the Tasks screen.

**Pre-requisites** (user-side, documented here):
- iOS OAuth 2.0 client created in Google Cloud Console with bundle `com.rockcap.mobile`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` set in `mobile-app/.env.local`
- `EXPO_PUBLIC_API_BASE_URL` points to a deployment where `GOOGLE_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_OAUTH_REDIRECT_URI` are all configured
- Convex deployment has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars (already true for web; run `npx convex env list` to confirm)
- A Google account with at least one upcoming calendar event

- [ ] **Step 7.1: iOS Simulator happy path**

Run: `cd mobile-app && npx expo start` → press `i`.
- Sign in as a user
- Drawer → Settings
- Tap "Connect Google Calendar"
- In-app browser: pick account, approve calendar access
- Expect return to app, status toast "Connected as <email>"
- Card now shows "Sync Now" and "Disconnect" buttons
- After ~5-10 seconds, tap Sync Now → toast "Synced N events"

Expected pass criteria: card flipped to connected state, email visible, Sync Now returns non-zero event count.

- [ ] **Step 7.2: Verify events on Tasks**

In the same app session, navigate to Tasks (`/tasks`).
Expected: upcoming Google Calendar events appear in Today/Tomorrow/Upcoming sections alongside tasks.

If events don't appear: check `mobile-app/app/tasks/index.tsx:203-206` — it queries `api.events.getByDateRange`; verify Convex dashboard shows rows in `events` table with `googleEventId` set.

- [ ] **Step 7.3: Disconnect round-trip**

Return to Settings → tap Disconnect → confirm in native alert → card flips to "Connect Google Calendar". Tap Connect again → second OAuth run should succeed (tests that re-consent path works, refresh-token preservation logic from Task 3 is covered).

- [ ] **Step 7.4: Web regression**

Open web app `/m-settings` (same user). Card should still show "Connected as <email>". Tap "Sync Now" on web → still works. This confirms mobile and web share state and the Bearer-auth change didn't break cookie auth.

- [ ] **Step 7.5: Android smoke test (if environment allows)**

Only if Android client ID is configured:
Run: `cd mobile-app && npx expo start` → press `a`.
Walk through same happy path. If Android SHA-1 mismatch shows up, note it as a follow-up (see Task 8 tracking notes) rather than blocking this task.

- [ ] **Step 7.6: Commit any fixes discovered**

If the tests above surfaced small issues (style tweaks, missing className, error text polish), commit them in a single fix commit:
```bash
git commit -am "fix(mobile): smoke-test polish for Google Calendar OAuth flow"
```

If no fixes needed, skip this step.

---

## Task 8: Final Build + Commit + Push

**Goal:** Per `CLAUDE.md`, every plan must end with a successful build and a push.

- [ ] **Step 8.1: Run Next.js production build**

Run: `cd model-testing-app && npx next build`
Expected: "Compiled successfully" with no errors from anything we touched (`src/app/api/google/setup-sync/route.ts`, `convex/googleCalendar.ts`).
If errors surface from other files, surface them to the user before fixing — they may be pre-existing.

- [ ] **Step 8.2: Confirm mobile type-check**

Run: `cd mobile-app && npx tsc --noEmit`
Expected: clean. If errors only in our files, fix; if pre-existing, note.

- [ ] **Step 8.3: Log to logbook**

Move the task from queued → done. The logbook plugin's `/logbook:finish` (or equivalent) does this; if running manually:
```bash
cd /Users/cowboy/rockcap/rockcap-v2
mv .logbook/queued/2026-04-18_google-calendar-mobile-oauth-and-events-fix.md \
   .logbook/done/$(date +%Y-%m-%d)_google-calendar-mobile-oauth-and-events-fix.md
```
Also update `.logbook/index.md` to flip the row's status to `done` and add a detailed breakdown of how the problem was solved (per the user's feedback preference logged in MEMORY).

- [ ] **Step 8.4: Final commit + push**

```bash
git add .logbook/
git commit -m "chore(logbook): close Google Calendar mobile OAuth task"
git push origin main
```

Expected: push succeeds. Done.

---

## Completion criteria (from spec)

- [x] `/settings` route accessible from drawer ← Task 1
- [x] Google Calendar card renders all three states correctly ← Task 6
- [x] Full OAuth flow works on iOS ← Task 7.1
- [x] Tokens land in `googleCalendarTokens` with correct `userId` and `connectedEmail` ← Task 3 + Task 7.1
- [x] Events appear on mobile Tasks screen after connection ← Task 7.2
- [x] Disconnect flow removes tokens and flips UI ← Task 7.3
- [x] Sync Now reuses `/api/google/setup-sync` and displays count ← Task 6 + Task 7.1
- [x] `npx next build` passes in `model-testing-app/` ← Task 8.1
- [x] Branch committed and pushed to GitHub ← Task 8.4

Coverage: every spec requirement maps to at least one task.

## Out-of-scope (deferred)

- Android production SHA-1 fingerprint for EAS builds (Task 7.5 uses dev SHA-1)
- Additional settings cards (notifications, theme, profile)
- Extract `/api/google/setup-sync` sync logic into a Convex action for consolidation
- Background event refresh initiated from mobile (webhook on web handles this for all clients)
