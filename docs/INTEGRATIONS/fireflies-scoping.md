# Fireflies API Integration: Scoping

- **Backlog item**: BL-3.0
- **Status**: Scoping draft, awaiting confirmation on a few open questions
- **Replaces**: the existing content-based Fireflies detector at `src/lib/hubspot/fireflies.ts` (BL-3.9 deletes it once the API integration is stable)

## Why direct API instead of the current detector

Today RockCap detects Fireflies transcripts by pattern-matching HubSpot activity bodies for two signals (the `https://app.fireflies.ai/view/{id}` URL plus the boilerplate phrase "Time markers in this document"). This works but has three failure modes:

1. **Fragile to Fireflies HTML template changes.** If Fireflies changes the boilerplate phrase, detection silently breaks.
2. **Depends on the HubSpot ↔ Fireflies bridge.** Transcripts only appear in RockCap if the user routes them through HubSpot first.
3. **No structured data.** The detector pulls a title, transcript URL, duration, and participant emails from the HTML body. It does not get action items, decisions, full transcript text, or speaker timing.

Direct API integration eliminates all three. Transcripts arrive from Fireflies with full structure; HubSpot is no longer in the loop.

## Provider research summary

(To be confirmed once we hit the Fireflies developer docs. Best-current-knowledge below.)

- **API style**: GraphQL endpoint at `https://api.fireflies.ai/graphql`.
- **Auth**: Bearer token. Fireflies API tokens are issued per-account via the Fireflies dashboard. OAuth may or may not be available for app-to-app integration; if not, the user pastes their personal API token into RockCap settings.
- **Available data**: meetings (with metadata, transcript URL, duration, attendees, action items, decisions), users (account members), recordings.
- **Webhook support**: Fireflies offers webhooks for new meeting completion events. Recommended over polling.
- **Rate limits**: not well documented publicly; assume conservative (60 req/min) until proven otherwise.

## Open questions for the user

These shape the scope before any code lands.

1. **Auth model**. Does Fireflies offer an OAuth flow for partner apps, or is the integration a per-user API token paste? Either works; the choice affects BL-3.1 (`firefliesTokens` table shape) and BL-3.2 (whether `/api/fireflies/auth` + `/api/fireflies/callback` exist or we just have a settings page that accepts a token).
2. **Per-user or org-shared**. Is each RockCap user expected to connect their own Fireflies account, or does the firm have one Fireflies account that everyone reads from? Affects token table cardinality and the kill switch shape.
3. **Backfill window**. When the API integration goes live, how far back do we pull historical meetings? Last 90 days is a reasonable default; confirm with the operator.
4. **Existing pattern-detected meetings**. The `meetings` table has rows tagged `sourceIntegration='fireflies'` from the current detector. BL-3.8 re-sources these via the API where possible. If a meeting exists in RockCap but not in Fireflies (e.g., the user deleted it from Fireflies but the HubSpot note remains), do we keep the existing row or mark it as orphaned?
5. **What we sync**. Meeting metadata, action items, attendees, transcript URL: yes. Full transcript text: large blobs, useful for skills but heavy on storage. Recommend storing the transcript URL and fetching transcript text on-demand into a separate `meetingTranscripts` table (or Convex file storage) only when a skill needs it.

## Proposed shape (subject to open questions)

### Schema additions

```typescript
// New table
firefliesTokens: defineTable({
  userId: v.id("users"),
  accessToken: v.string(),
  refreshToken: v.optional(v.string()),
  tokenType: v.union(v.literal("oauth"), v.literal("user_provided")),
  expiresAt: v.optional(v.number()),
  scope: v.optional(v.string()),
  connectedEmail: v.optional(v.string()),
  needsReconnect: v.boolean(),
  lastSyncAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_user", ["userId"]),

// Optional new table; alternative is extending `meetings` with optional transcript field
meetingTranscripts: defineTable({
  meetingId: v.id("meetings"),
  fileStorageId: v.id("_storage"),
  source: v.union(v.literal("fireflies"), v.literal("manual"), v.literal("zoom")),
  fetchedAt: v.number(),
}).index("by_meeting", ["meetingId"]),
```

### Extensions to existing `meetings` table

Additive only. New optional fields:

- `firefliesId` (optional string, indexed)
- `sourceIntegration` (already exists; values extend to include direct API source)
- `transcriptFetchedAt` (optional number)
- `actionItemsSourceFidelity` (optional union: "pattern_detected", "api_synced", "manual")

### Routes

- `POST /api/fireflies/auth` (initiates OAuth, if available)
- `GET /api/fireflies/callback` (OAuth callback, if available)
- `POST /api/fireflies/connect-token` (user-provided token path, if OAuth unavailable)
- `POST /api/fireflies/disconnect`
- `POST /api/fireflies/webhook` (signature-verified inbound from Fireflies)
- `POST /api/fireflies/sync` (manual on-demand sync; cron calls this internally)

### Cron

`fireflies-auto-sync` every 30min as the fallback for webhook gaps. Mirrors the Google Calendar cron cadence.

### Kill switch

Per-user `firefliesTokens.needsReconnect` flag plus a global `firefliesSyncConfig.isEnabled` for emergency disable. Default off until the user explicitly connects.

### UI

Settings page (web): connect/disconnect Fireflies, show connected email, last-sync time, transcript count, reconnect prompt. Mobile: status read-only (BL-3.7 web first; mobile fast-follow with the rest of integration settings).

## Migration plan from detector to API

1. Stand up direct API integration (BL-3.1 through BL-3.7) with kill switch defaulted off.
2. Operator flips the kill switch on for one user as a canary. Verify transcripts arrive correctly and `meetings` rows get enriched (not duplicated) for the same source meeting.
3. Run BL-3.8 backfill: for every existing `sourceIntegration='fireflies'` meeting, look up the Fireflies record by URL or title-and-date heuristic. Where matched, enrich the existing row with API data. Log unmatched rows for review.
4. After 7 days of stable dual-running (detector AND API both active), disable the detector via the activity-sync code path. Pattern-detection code stays in place for one more week as belt-and-braces.
5. BL-3.9: delete pattern-detection code, remove the activity-sync hook, prune dead imports.

## Risks

- **API quota**: if Fireflies' rate limit turns out to be tighter than 60/min, backfill batching needs care. Mitigate with exponential backoff and bounded concurrency.
- **Webhook reliability**: if Fireflies webhooks are unreliable, the 30min cron is the safety net. Same pattern as Google Calendar.
- **Account vs personal data**: if Fireflies meetings are personal to each user, an org-shared sync model would surface private meetings to other operators. Per-user token model (option 2 in open questions) avoids this. Need confirmation before building.

## What we are not doing in v1

- Full transcript ingestion into RockCap storage. Transcripts are fetched on-demand by skills (BL-6.x), not pre-cached.
- Bidirectional sync. We read from Fireflies; we do not push back into Fireflies.
- Replacing Zoom or other recording tools. Fireflies is the single transcription source for v1.
