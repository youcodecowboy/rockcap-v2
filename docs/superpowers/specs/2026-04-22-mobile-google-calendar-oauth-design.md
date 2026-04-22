# Mobile Google Calendar OAuth — Design

Created: 2026-04-22
Status: approved (brainstorming → plan next)
Related logbook task: `.logbook/queued/2026-04-18_google-calendar-mobile-oauth-and-events-fix.md`

## Goal

Let mobile users connect their Google Calendar from within the Expo app, using the same Convex token storage and event-sync pipeline the web app already uses. Once connected, calendar events appear on the mobile Tasks screen automatically.

## Context

- Web app (`model-testing-app/`) has a full Google Calendar integration: server-side OAuth2 flow at `/api/google/auth` + `/api/google/callback`, tokens stored in the Convex `googleCalendarTokens` table, events persisted into Convex `events` via `/api/google/setup-sync` + a push-webhook at `/api/google/webhook`.
- Mobile app (`mobile-app/`) has **no** OAuth flow yet, so no mobile user can connect Google. The drawer has a "Settings" nav entry (`MobileNavDrawer.tsx:26`) wired to `route: null` with a "Coming soon" alert — the screen behind it is not built.
- Mobile Tasks screen (`mobile-app/app/tasks/index.tsx:203-206`) **already** queries `api.events.getByDateRange` and merges events into the unified list. So the "events don't show on Tasks" bug is fully downstream of the missing OAuth — once OAuth works, events flow through with zero additional wiring.
- Mobile already has these Expo libraries installed (verified in `mobile-app/package.json`):
  - `expo-auth-session ~7.0.10`
  - `expo-web-browser ~15.0.10`
  - `expo-crypto ~15.0.8`
  - `expo-linking ~8.0.11`
  - `expo-secure-store ~15.0.8`
- iOS bundle identifier is set (`com.rockcap.mobile`). Android package name is **not** set in `app.json` yet.
- URL scheme `rockcap` is already registered.

## Non-goals

- No new settings categories (theme, notifications, profile) in this pass — Google Calendar card only.
- No calendar write access. Readonly scope to match how the web card is used today.
- No multi-calendar selection UI.
- No extraction of `/api/google/setup-sync` into a standalone Convex action — mobile reuses the existing HTTP route.
- No native Google Sign-In SDK (`@react-native-google-signin/...`). Keeps us on Expo-managed workflow.

## Approach

Native PKCE flow via `expo-auth-session`'s Google provider. Mobile does the OAuth dance, then passes the authorization code to a new Convex **action** that performs the server-side code exchange (client secret stays server-side) and stores tokens in the existing `googleCalendarTokens` table. After tokens land, mobile calls the existing `POST /api/google/setup-sync` route (with the Clerk JWT as a bearer token) to trigger the initial 30-day sync and webhook registration.

Why this shape:

- **Trust attribution.** The Convex action calls `ctx.auth.getUserIdentity()` before writing tokens, so we know which Clerk user to attribute the connection to. Without that gate, a client could post any userId with harvested tokens.
- **Secret handling stays on the server path if needed.** If the token exchange ends up using the web client type (which requires `GOOGLE_CLIENT_SECRET`), the secret stays inside Convex where it already lives. If we end up using a native client type with PKCE only, the action still runs the exchange for the attribution reason above.
- **Reuses Convex storage.** Tokens go into the same table, with the same fields. Web and mobile read/write the same `googleCalendarTokens` rows.
- **Reuses the sync pipeline.** `/api/google/setup-sync` already does listEvents → upsert → webhook registration. Mobile just has to POST to it after OAuth finishes.
- **Expo-managed workflow safe.** No custom native modules, no dev-client rebuild required for the OAuth flow itself. Config plugin and bundle/package work happens in `app.json`.

## User flow

1. User opens drawer → taps **Settings** → route pushes to `/settings`.
2. Settings screen shows a vertical list of integration cards; only **Google Calendar** is present today.
3. When disconnected, card shows "Connect Google Calendar" button. Tapping it calls `promptAsync()` from the `useGoogleCalendarAuth()` hook.
4. In-app browser opens Google consent screen. User picks account and approves calendar access.
5. Google redirects to `rockcap://google/callback?code=...`. Expo's `AuthSession` intercepts the redirect and resolves the promise with the auth code.
6. Mobile invokes the Convex action `googleCalendar.exchangeMobileCode({ code, codeVerifier, redirectUri })`. The action exchanges the code for tokens, fetches the user's email, and stores tokens in Convex.
7. Mobile fires a `fetch('${API_BASE}/api/google/setup-sync', { method: 'POST', headers: { Authorization: 'Bearer <clerk-jwt>' } })` to kick off the initial 30-day sync.
8. Convex `getSyncStatus` live query re-emits; card re-renders in "Connected" state showing email + "Sync Now" + "Disconnect".
9. Events from Google appear on the Tasks screen via the existing `events.getByDateRange` query.

Disconnect: `Alert.alert` confirm → `api.googleCalendar.disconnect` mutation → card flips to disconnected.

Sync Now: identical to web — `POST /api/google/setup-sync`, toast "Synced N events".

## File map

### New files

| Path | Purpose |
|------|---------|
| `mobile-app/app/settings/_layout.tsx` | Stack layout for the settings section (title, back button) |
| `mobile-app/app/settings/index.tsx` | Settings list screen; renders integration cards vertically |
| `mobile-app/components/settings/GoogleCalendarCard.tsx` | RN port of `model-testing-app/src/app/(mobile)/m-settings/components/GoogleCalendarCard.tsx` |
| `mobile-app/lib/googleCalendarAuth.ts` | `useGoogleCalendarAuth()` hook wrapping `expo-auth-session` Google provider; returns `{ promptAsync, request, response }` |
| `model-testing-app/convex/googleCalendar.ts` (add to existing file) | New Convex **action** `exchangeMobileCode` |
| `docs/superpowers/specs/2026-04-22-mobile-google-calendar-oauth-design.md` | This document |

### Edited files

| Path | Change |
|------|--------|
| `mobile-app/components/MobileNavDrawer.tsx:26` | `route: null` → `route: '/settings'` |
| `mobile-app/app.json` | Add `android.package: "com.rockcap.mobile"` and any intent-filter config needed for the `rockcap://` scheme to resolve OAuth redirects on Android |
| `model-testing-app/src/app/api/google/setup-sync/route.ts` | Verify Bearer-token auth is accepted; small edit if it only reads the Clerk cookie today |

## Component contracts

### `useGoogleCalendarAuth()` — `lib/googleCalendarAuth.ts`

```ts
import { useAuthRequest, makeRedirectUri, ResponseType } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';

export function useGoogleCalendarAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID!,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID!,
    scopes: [
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    responseType: ResponseType.Code,
    usePKCE: true,
    // redirectUri auto-derived from app.json scheme + bundle id in Expo Go/standalone
  });

  return { request, response, promptAsync };
}
```

Note: `expo-auth-session/providers/google` handles PKCE and the discovery document automatically. We may need to read `response.params.code` and `request.codeVerifier` off the hook and pass them to the Convex action.

### `exchangeMobileCode` — Convex action

```ts
// convex/googleCalendar.ts (appended)
export const exchangeMobileCode = action({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, { code, codeVerifier, redirectUri }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('unauthenticated');

    // Exchange code at https://oauth2.googleapis.com/token with:
    //   code, code_verifier, client_id (server), client_secret (server),
    //   redirect_uri, grant_type=authorization_code
    // Returns: access_token, refresh_token, expires_in, scope

    // Fetch userinfo for connectedEmail
    //   GET https://www.googleapis.com/oauth2/v2/userinfo with Bearer

    // Call existing internal mutation to persist:
    //   await ctx.runMutation(internal.googleCalendar.saveTokens, { ... })

    return { success: true, email };
  },
});
```

Key: the action uses `identity.subject` (Clerk user id) to scope the token write. `client_id` for the exchange is the **web** client ID (required because that's what the token exchange is validated against — for installed apps using PKCE, Google validates the client_id from the OAuth request), or we add a web-counterpart client ID tied to the mobile flow. This will be confirmed during implementation with a small spike.

### `GoogleCalendarCard` — RN port

Mirrors the web version: three visual states (loading / connected / disconnected), same button labels, same destructive styling for Disconnect. Uses NativeWind classes (follows `components/ui/Card.tsx` pattern). `Alert.alert` replaces browser `confirm()`.

### `/settings` screen

Minimal: header "Settings", vertical list with one card today (`GoogleCalendarCard`). Easy to append future cards. Uses the same `MobileHeader` + `SafeAreaView` pattern other stack routes use.

## Environment & platform config

### Google Cloud Console (manual, documented in the plan's first step)

1. In the same project that hosts the existing **web** OAuth client:
   - Create an **iOS** OAuth 2.0 client. Bundle ID: `com.rockcap.mobile`.
   - Create an **Android** OAuth 2.0 client. Package name: `com.rockcap.mobile`. Requires SHA-1 fingerprint of the signing certificate (Expo dev build gives us a debug SHA-1; production will need the EAS-signed SHA-1).
2. Add `rockcap://google/callback` to the list of **Authorized redirect URIs** where applicable (iOS/Android OAuth clients auto-accept the reversed-client-id scheme; the `rockcap://` path is what `AuthSession` uses in standalone builds).

### Mobile env (`mobile-app/.env.local`)

- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_API_BASE_URL` — confirm exists (used to POST to `/api/google/setup-sync`)

### Convex env (already configured for web)

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (web's callback — unchanged)

No new Convex secrets.

### `app.json` edit

```jsonc
"ios": {
  "bundleIdentifier": "com.rockcap.mobile",
  ...
},
"android": {
  "package": "com.rockcap.mobile"   // ADD
}
```

## Error paths

| Case | UX |
|------|----|
| User denies consent on Google | `response.type === 'cancel'` → inline "Connection cancelled" toast, 5s |
| Token exchange fails (network, invalid_grant) | Action throws; card shows "Couldn't connect — try again" |
| `setup-sync` call fails after successful token save | Token save still succeeds; card shows "Connected but initial sync failed — tap Sync Now" |
| Convex `auth.getUserIdentity()` returns null | Action throws `unauthenticated`; surface generic "Please sign in again" |
| Clerk JWT expired at `setup-sync` time | 401 response; surface "Please sign in again" |

## Risks & mitigations

1. **Clerk identity in Convex actions from mobile**
   - *Risk*: mobile Convex client may not attach the Clerk JWT automatically to action calls.
   - *Mitigation*: smoke-test early. If missing, pass `identity.subject` from mobile explicitly and verify server-side against the attached JWT via `ctx.auth.getUserIdentity()` which should still work — the JWT flows through Convex's auth config.
   - *Fallback*: extract a small `setAuth()` wrapper, add a debug log, validate with one manual test before the rest of the plan depends on it.

2. **Redirect URI format**
   - *Risk*: Expo Go and standalone builds resolve `makeRedirectUri()` differently. In Expo Go, it's `exp://<tunnel>/--/google/callback`; in standalone, it's `rockcap://google/callback`.
   - *Mitigation*: use `makeRedirectUri({ scheme: 'rockcap', path: 'google/callback' })` which the Expo docs recommend as the standard approach; log the resolved URI at runtime and register both forms in Google Cloud if needed.

3. **`setup-sync` bearer-token auth**
   - *Risk*: the route currently authenticates via Clerk cookies, not Bearer headers.
   - *Mitigation*: small edit to use `getAuth(request)` with headers, or use Clerk's `verifyToken` server helper. Confirm in step 1 of the implementation plan.

4. **Android SHA-1 for dev vs prod**
   - *Risk*: dev build SHA-1 differs from EAS prod SHA-1; Android OAuth client fingerprints must match.
   - *Mitigation*: use Expo dev-client debug SHA-1 for now; track prod SHA-1 as a deployment follow-up in the logbook task, not a blocker for this work.

## Testing

### Happy paths (manual)

- iOS Simulator: tap Settings → Connect → approve in consent → verify card flips to Connected, email correct, "Sync Now" works.
- iOS Simulator: tap Disconnect → confirm → card flips back to Connect state.
- iOS Simulator: after Connect, navigate to Tasks → verify Google Calendar events appear in Today/Tomorrow sections.
- Android Emulator: repeat above.
- Re-run OAuth to confirm idempotency — re-connecting overwrites tokens, doesn't duplicate.

### Regression

- Web OAuth at `/m-settings` still works.
- Web Tasks page still shows events.
- Convex `googleCalendar.getSyncStatus` returns same shape (no breaking schema changes to `googleCalendarTokens`).

### Edge cases

- User denies consent: card shows "Connection cancelled" toast.
- User backgrounds the app mid-OAuth: AuthSession either times out or resumes correctly — verify on both platforms.
- User with expired Clerk session: `exchangeMobileCode` throws `unauthenticated`; UI prompts sign-in.

## Completion criteria

- [ ] `/settings` route accessible from drawer.
- [ ] Google Calendar card renders all three states correctly.
- [ ] Full OAuth flow works on iOS and Android.
- [ ] Tokens land in `googleCalendarTokens` with correct `userId` (Clerk id) and `connectedEmail`.
- [ ] Events appear on mobile Tasks screen after connection.
- [ ] Disconnect flow removes tokens and flips UI.
- [ ] Sync Now reuses `/api/google/setup-sync` and displays count.
- [ ] `npx next build` passes in `model-testing-app/`.
- [ ] Branch committed and pushed to GitHub.

## Open questions for implementation phase

- Exact `client_id` to pass in the token exchange (web's or a new mobile-facing one) — resolved by a one-hour spike on the Convex action.
- Whether `setup-sync` needs a tiny edit to accept Bearer auth — resolved by reading its current auth code.

These are small, scoped technical questions that the plan's first step will resolve before blocking further work.
