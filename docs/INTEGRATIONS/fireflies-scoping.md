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

## Confirmed decisions

The scoping questions are now resolved:

1. **Auth model**: per-user API token paste. No OAuth flow. Each user generates a personal API token in the Fireflies dashboard and pastes it into RockCap settings. Simpler integration, no OAuth partner app registration required, no token-refresh dance. Trade-off: tokens are long-lived; reconnection is manual when a user rotates their Fireflies token.
2. **Per-user or org-shared**: per-user. Each RockCap user connects their own Fireflies account. The `firefliesTokens` table is keyed by `userId` with one row per user. Meetings synced under one user's account stay private to that user unless explicitly shared via the existing meeting visibility model.
3. **Backfill window**: 365 days. On first connection, pull every meeting from the last 12 months. Larger than the default 90-day window but bounded.
4. **Existing pattern-detected meetings without a Fireflies API match**: flag them for operator review. Do not delete, do not silently keep, do not assume they are orphaned. Surface in a one-off review queue (could be a `meetings.reviewState` field or a temporary view). Operator decides per-row.
5. **Full transcript ingestion**: yes. Transcripts are fetched and stored, not URL-only. Skills need full transcript text as context for cadence skills (extracting commitments and follow-ups), classification skills, and deal-status briefings. Storage cost is acceptable given Convex Premium.

## Proposed shape

### Schema additions

```typescript
// New table - per-user token paste, no OAuth
firefliesTokens: defineTable({
  userId: v.id("users"),
  apiToken: v.string(),                  // raw Fireflies API token, encrypted at rest
  connectedEmail: v.optional(v.string()), // resolved from Fireflies /me on connect
  needsReconnect: v.boolean(),
  lastSyncAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_user", ["userId"]),

// New table - full transcripts stored, not URL-only
meetingTranscripts: defineTable({
  meetingId: v.id("meetings"),
  fileStorageId: v.id("_storage"),       // raw transcript stored in Convex file storage
  source: v.union(v.literal("fireflies"), v.literal("manual"), v.literal("zoom")),
  speakerSegments: v.optional(v.array(v.object({
    speaker: v.string(),
    startMs: v.number(),
    endMs: v.number(),
    text: v.string(),
  }))),
  fullTextSummary: v.optional(v.string()), // optional condensed version for fast skill lookups
  fetchedAt: v.number(),
}).index("by_meeting", ["meetingId"]),
```

### Extensions to existing `meetings` table

Additive only. New optional fields:

- `firefliesId` (optional string, indexed)
- `sourceIntegration` (already exists; values extend to include direct API source)
- `transcriptFetchedAt` (optional number)
- `actionItemsSourceFidelity` (optional union: "pattern_detected", "api_synced", "manual")
- `reviewState` (optional union: "needs_review", "confirmed_keep", "confirmed_remove") for the backfill flagging in confirmed-decision 4

### Routes

- `POST /api/fireflies/connect-token` (user pastes API token; server resolves connected email via Fireflies `/me`, stores token, marks connected)
- `POST /api/fireflies/disconnect`
- `POST /api/fireflies/webhook` (signature-verified inbound from Fireflies if webhooks are available; otherwise omitted)
- `POST /api/fireflies/sync` (manual on-demand sync; cron calls this internally)

### Cron

`fireflies-auto-sync` every 30min as the fallback for webhook gaps. Mirrors the Google Calendar cron cadence.

### Kill switch

Per-user `firefliesTokens.needsReconnect` flag plus a global `firefliesSyncConfig.isEnabled` for emergency disable. Default off until the user explicitly connects.

### UI

Settings page (web): connect/disconnect Fireflies, show connected email, last-sync time, transcript count, reconnect prompt. Mobile: status read-only (BL-3.7 web first; mobile fast-follow with the rest of integration settings).

## Migration plan from detector to API

1. Stand up direct API integration (BL-3.1 through BL-3.7) with kill switch defaulted off.
2. Operator flips the kill switch on for one user as a canary. Verify transcripts arrive correctly, full text ingests into `meetingTranscripts`, and `meetings` rows get enriched (not duplicated) for the same source meeting.
3. Run BL-3.8 backfill against the 365-day window: for every existing `sourceIntegration='fireflies'` meeting, look up the Fireflies record by URL or title-and-date heuristic. Where matched, enrich the existing row with API data and ingest transcript. Where unmatched, set `reviewState='needs_review'` (per confirmed-decision 4) and surface in an operator review queue.
4. After 7 days of stable dual-running (detector AND API both active), disable the detector via the activity-sync code path. Pattern-detection code stays in place for one more week as belt-and-braces.
5. BL-3.9: delete pattern-detection code, remove the activity-sync hook, prune dead imports. Resolve any remaining `needs_review` rows through the operator queue.

## Risks

- **API quota**: if Fireflies' rate limit turns out to be tighter than 60/min, the 365-day backfill needs care. Mitigate with exponential backoff and bounded concurrency (e.g., 10 concurrent transcript fetches max).
- **Transcript storage cost**: full transcript ingestion means non-trivial storage growth. Convex Premium covers the envelope but the order of magnitude should be sized once we see real usage (one user with 100 meetings/month at ~50KB per transcript = ~5MB/user/month, manageable).
- **Token rotation by users**: per-user API token model means if a user rotates their Fireflies token, RockCap silently stops syncing for them until they paste the new token. Mitigate with a daily "last sync was N days ago" check that surfaces a reconnect prompt after 48h of no sync.
- **Webhook reliability**: if Fireflies webhooks are unavailable or unreliable, the 30min cron is the safety net. Same pattern as Google Calendar.

## What we are not doing in v1

- Bidirectional sync. We read from Fireflies; we do not push back into Fireflies.
- Replacing Zoom or other recording tools. Fireflies is the single transcription source for v1.
