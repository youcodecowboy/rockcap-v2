# Integration Patterns

Reusable patterns for new third-party integrations. Derived from the existing HubSpot and Google Calendar implementations, refined for the integrations on the backlog (Fireflies BL-3, Gmail BL-4) and any future ones.

## Kill switch pattern

Every external integration ships with an enable/disable flag, default off. The flag is stored either on a per-user row or on a singleton config table, depending on whether the integration is per-user (Gmail, Google Calendar) or app-wide (HubSpot recurring sync).

Reference implementations:

- App-wide: `hubspotSyncConfig.isRecurringSyncEnabled` (singleton, gates the 6h cron).
- Per-user: `googleCalendarTokens.needsReconnect` (per-user, set on `invalid_grant`, gates the cron from running for that user).

New integration template:

```typescript
// in convex/schema.ts
[integrationName]Config: defineTable({
  isEnabled: v.boolean(),
  lastSyncAt: v.optional(v.number()),
  lastSyncStatus: v.optional(v.union(v.literal("success"), v.literal("error"), v.literal("in_progress"))),
  lastSyncStats: v.optional(v.any()),
}),
```

Rules:

1. Default off. Flipping the flag is a deliberate operator action.
2. Cron and webhook handlers check the flag first and return early if disabled.
3. Manual on-demand routes also check the flag; do not allow circumvention via direct API call.
4. UI surfaces the flag clearly. If disabled, no background work is happening.

## OAuth integration pattern

Reference implementation: Google Calendar (`convex/googleCalendar.ts`, `convex/googleCalendarSync.ts`, `src/lib/google/oauth.ts`, `src/app/api/google/{auth,callback,disconnect,webhook,setup-sync}`).

Required components for any new OAuth integration:

1. **Tokens table** per-user: `accessToken`, `refreshToken`, `expiresAt`, `scope`, `needsReconnect`, optional `connectedEmail` for UX.
2. **OAuth flow routes**: `/api/{integration}/auth` (initiates), `/api/{integration}/callback` (exchanges code for tokens). Mirror the Google Calendar pattern.
3. **Token refresh**: auto-refresh within 5min of expiry. On `invalid_grant`, set `needsReconnect: true` and surface in UI.
4. **Disconnect route**: `/api/{integration}/disconnect`, revokes the token at the provider and clears local state.
5. **Sync action**: incremental, watermarked. Use `lastSyncAt` to scope queries.
6. **Cron**: scheduled fallback for webhook gaps. Frequency depends on integration; calendar is 30min, Gmail will likely be 5-10min.
7. **Webhook handler**: `/api/{integration}/webhook` if the provider supports push notifications. Verify signatures.
8. **Settings UI**: connect, disconnect, status, last-sync time, reconnect prompt.
9. **Kill switch**: per-user `isEnabled` or `needsReconnect` flag gates the cron.

OAuth secrets policy: each integration uses its own OAuth client. Do not share a single OAuth client across integrations (e.g., Gmail and Calendar use separate clients per BL-4.1). Separate clients mean separate consent screens but cleaner permission scoping and disconnect.

## Bridge pattern (legacy, being retired)

Some Convex cron and webhook handlers cannot directly use code from `model-testing-app/src/lib/`. The current workaround:

- Convex action calls an HTTPS endpoint at `/api/{integration}/{operation}` on the Next.js side.
- The Next.js route does the actual work using `src/lib/` code, then writes results back to Convex.
- A shared `CRON_SECRET` env var authenticates the cross-service call.

This is used today for HubSpot (`/api/hubspot/webhook-process`, `/api/hubspot/sync-all`) and the Fireflies backfill.

**This pattern is being retired.** New integrations should do the work entirely inside Convex (HTTP actions, internal actions) without bridging back to Next.js. The MCP server architecture (BL-5.1) makes Convex the natural home for integration logic. Bridges add latency and a shared-secret rotation burden.

If you genuinely need code from `src/lib/`, ask whether the code should move to Convex first.

## Webhook handling pattern

Reference implementation: `convex/hubspotSync/webhook.ts`.

Required components:

1. **Signature verification** on every inbound request. Reject unsigned or invalid-signature requests with 401.
2. **Event log table** for dedup and audit. Schema: `eventId` (unique), `subscriptionType`, `objectType`, `objectId`, `status` (scheduled / completed / failed), `receivedAt`, `processedAt`, `errorMessage`.
3. **Dedup on eventId**. Providers retry on 5xx within hours. Same event must produce one effect.
4. **Async processing**. The webhook handler enqueues the event and returns 200 immediately. A separate internal action processes the queue. This prevents the provider from timing out and retrying unnecessarily.
5. **Daily log prune cron**. Retention typically 30 days. Reference: `pruneWebhookEventLog`.

## Touchpoint capture pattern

Every external interaction (inbound email, outbound email, call, meeting) should write to the `Touchpoint` table (BL-4.9). This is the unified exchange ledger; `activities` table stays as the HubSpot projection but is no longer the canonical source for Gmail-direct interactions.

Touchpoint schema (per BL-4.9 spec, to be confirmed when implemented):

- `provider`: which integration sourced this (gmail / hubspot / fireflies / manual)
- `direction`: inbound / outbound
- `personId`: the person at the other end
- `projectId`: deal context if any
- `kind`: email / call / meeting / note / message
- `occurredAt`: when it happened
- `payloadRef`: pointer to provider-specific record (Gmail message ID, HubSpot activity ID, Fireflies meeting ID)
- `summary`: optional one-line summary for fast UI rendering
- `providerEnrichment`: optional structured data from the provider (attendees, action items, etc.)

Why a single ledger: skills need a uniform view of "what's the recent history with this person/deal" without caring which integration delivered the event. The HubSpot activities table is HubSpot-shaped; Gmail-direct events would not appear there. Touchpoint is provider-agnostic.

## Rate limiting pattern

Every external API has a rate ceiling. Handle it explicitly:

1. Track requests per window in code. Companies House client tracks against 600/5min; HubSpot against 600/5min for similar reasons.
2. Apply soft throttling well before the hard ceiling (Companies House throttles at 500+, hard waits at 580+).
3. Exponential backoff on 429 responses. Cap at 3 retries; if still 429, surface the failure to the caller.
4. Cron timing assumes worst-case rate hits. The HubSpot 6h cron is conservative; reducing to 1h is gated on rate-limit headroom.

## Disconnection and credential hygiene

Disconnection flows revoke tokens at the provider, not just locally. Reference: `revokeToken()` in `src/lib/google/oauth.ts`.

If revocation fails (provider down, expired token), clear local state anyway so the user can reconnect cleanly. Log the revocation failure for follow-up.

Never log raw access tokens, refresh tokens, or OAuth state strings. Log token IDs (truncated) and event timestamps. Error messages with full token values violate the env var sensitivity policy.

## Provider-specific docs

Per-integration scoping and design lives in `docs/INTEGRATIONS/`:

- `docs/INTEGRATIONS/fireflies-scoping.md` (BL-3.0)
- `docs/INTEGRATIONS/gmail-scoping.md` (BL-4.0)
- Future integrations follow the same naming.
