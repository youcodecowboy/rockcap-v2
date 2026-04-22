# HubSpot Webhooks — Real-Time Activity & CRM Sync

**Status:** Design approved, implementation pending
**Date:** 2026-04-22
**Supersedes nothing — augments existing 6h→1h Convex cron**

---

## 1. Goal

Move RockCap's HubSpot sync from *polled* to *event-driven* for the data that needs to feel live. Emails, calls, meetings, notes, contact edits, deal-stage moves, and CRM deletions should propagate into the app within ~30s of happening in HubSpot, rather than waiting up to an hour for the next cron cycle.

The 1h cron remains as a reconciliation safety net. Webhooks handle real-time; cron catches anything webhooks missed (delayed/dropped deliveries, events during downtime).

### Success criteria

1. A user logs an email in HubSpot → it appears in the RockCap activity stream within 60s.
2. A user changes a deal stage in HubSpot → it reflects in RockCap within 60s.
3. A user deletes a company/contact/deal in HubSpot → the record is soft-archived in RockCap within 60s and hidden from default UI queries.
4. Bursts (bulk import, mass edit) are handled without `sync-all` timing out or HubSpot disabling our webhook endpoint due to failures.
5. If webhooks go completely dark for 24h, the 1h cron still reconciles — nothing is permanently lost.
6. One chokepoint file reads the webhook signing secret (same audit principle as the API key refactor).

---

## 2. Architecture

```
                     ┌─────────────────────────────────────────────┐
                     │             HubSpot Private App              │
                     │   Subscriptions: company / contact / deal    │
                     │   Events: creation, propertyChange, deletion │
                     └──────────────┬───────────────────────────────┘
                                    │  POST, signed v3 HMAC
                                    ▼
            ┌─────────────────────────────────────────────────────────┐
            │  Next.js: POST /api/hubspot/webhook                      │
            │  • Read raw body                                         │
            │  • Verify X-HubSpot-Signature-v3                         │
            │  • Reject 401 if stale (>5 min) or signature mismatch    │
            │  • Parse + deduplicate by (subscriptionType, objectId)   │
            │  • fetchMutation(enqueueWebhookEvent, …) per unique event│
            │  • Return 200 { received, scheduled } in <500ms          │
            └──────────────┬──────────────────────────────────────────┘
                           │ Convex mutation → scheduler.runAfter(0, …)
                           ▼
            ┌─────────────────────────────────────────────────────────┐
            │  Convex internalAction: processWebhookEvent             │
            │  • Dispatch on (subscriptionType, objectType):          │
            │      – company + notes_last_updated → engagement fetch  │
            │      – *.creation / *.propertyChange → object re-fetch  │
            │      – *.deletion                   → soft-archive      │
            │  • POST to /api/hubspot/webhook-process (same-origin)   │
            │  • Log {synced, errors} — Convex dashboard surfaces run │
            └──────────────┬──────────────────────────────────────────┘
                           │
                           ▼
            ┌─────────────────────────────────────────────────────────┐
            │  Next.js: POST /api/hubspot/webhook-process             │
            │  (cron-secret auth — NOT public)                        │
            │  Thin bridge so Convex can invoke the HubSpot lib code  │
            │  already in src/lib/hubspot/*:                          │
            │    – fetchEngagementsForCompany(id, since: now-10m)     │
            │    – batchRead*(type, id)  (existing, ~30 new lines)    │
            │    – archive record by HubSpot id                       │
            │  Calls existing sync mutations unchanged                │
            └─────────────────────────────────────────────────────────┘

            Unchanged, in parallel:
            ┌─────────────────────────────────────────────────────────┐
            │  Convex cron (1h) → sync-all per-phase                  │
            │  Reconciliation sweep; counts webhook-missed deltas     │
            └─────────────────────────────────────────────────────────┘
```

### Design choices (with rationale)

| Decision | Chosen | Rationale |
|---|---|---|
| Subscription scope | All 4 CRM object types (company/contact/deal) + engagements via `notes_last_updated` + deletions | Matches user's framing: "everything that needs live updates" |
| Dispatch | Webhook handler → Convex scheduler → Convex action → Next.js bridge | Fast 200, async processing, observability, reuses existing HubSpot lib |
| Engagement watermark | 10-min fixed lookback, idempotent upsert | Self-healing to late/dup/out-of-order deliveries without schema change or locks |
| Deletion semantics | Soft-archive (`archivedAt` field), not hard delete | Preserves activity history; UI filters archived records; reversible if HubSpot record is restored |
| Cron cadence | 1h, unchanged | Cheap reconciliation layer; catches anything webhooks miss |
| Signing | v3 HMAC-SHA256 with `HUBSPOT_WEBHOOK_SECRET` env var (Private App's Client Secret) | Current recommended scheme; includes replay protection |

---

## 3. HubSpot-Side Configuration

Configured manually in HubSpot UI: Settings → Integrations → Private Apps → *(RockCap app)* → Webhooks tab.

### Target URL

`https://rockcap-v2.vercel.app/api/hubspot/webhook`

### Subscriptions

| Object | Event | Property filter |
|---|---|---|
| company | creation | — |
| company | propertyChange | `notes_last_updated` |
| company | propertyChange | `name`, `lifecyclestage`, `hs_pipeline` |
| company | deletion | — |
| contact | creation | — |
| contact | propertyChange | `email`, `firstname`, `lastname`, `lifecyclestage`, `jobtitle`, `hubspot_owner_id` |
| contact | deletion | — |
| deal | creation | — |
| deal | propertyChange | `dealstage`, `amount`, `closedate`, `dealname`, `pipeline`, `hubspot_owner_id` |
| deal | deletion | — |

**`notes_last_updated` on companies is the only subscription that triggers engagement sync.** Every other subscription re-fetches or archives the object itself.

### Signing secret

Copied from the Private App's Auth tab → "Client secret" field. Added to Vercel as:

- **Name:** `HUBSPOT_WEBHOOK_SECRET`
- **Environments:** Production only (preview deployments don't receive webhooks)

This is separate from `HUBSPOT_API_KEY` — different secret, different purpose, never used for API calls.

---

## 4. Handler Internals

### `src/app/api/hubspot/webhook/route.ts` (~110 lines)

```
export const runtime = 'nodejs';  // need raw body access

POST:
  1. rawBody = await request.text()          // MUST come before any parsing
  2. timestamp = headers.get('X-HubSpot-Request-Timestamp')
     signature = headers.get('X-HubSpot-Signature-v3')
     if (!verifyV3(rawBody, timestamp, signature)) → 401
     if (Date.now() - timestamp > 5*60_000)        → 401
  3. events = JSON.parse(rawBody)            // array of event objects
  4. unique = dedupeEvents(events)           // keyed by (subscriptionType, objectId)
  5. for each event in unique:
       try:
         await fetchMutation(internal.hubspotSync.webhook.enqueueWebhookEvent, {
           subscriptionType: e.subscriptionType,      // "company.propertyChange", etc.
           objectType:       e.objectTypeId,          // "0-1"=contact, "0-2"=company, "0-3"=deal
           objectId:         String(e.objectId),
           propertyName:     e.propertyName ?? null,  // present on propertyChange events only
           eventId:          String(e.eventId),       // for Convex-side dedup
           occurredAt:       e.occurredAt,
         })
       catch: log + continue  // NEVER fail the batch
  6. return 200 { received: events.length, scheduled: unique.length }
```

### Signature verification helper

```
// src/lib/hubspot/webhook-verify.ts (~40 lines)

export function verifyV3(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  requestUri: string = 'https://rockcap-v2.vercel.app/api/hubspot/webhook',
): boolean {
  const secret = getHubspotWebhookSecret();  // chokepoint, like getHubspotApiKey()
  if (!timestamp || !signature) return false;

  const sourceString = `POST${requestUri}${rawBody}${timestamp}`;
  const expected = createHmac('sha256', secret).update(sourceString).digest('base64');

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function getHubspotWebhookSecret(): string {
  const s = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (!s) throw new Error('HUBSPOT_WEBHOOK_SECRET not set');
  return s;
}
```

### Dedup helper

```
function dedupeEvents(events: HubSpotEvent[]): HubSpotEvent[] {
  const seen = new Map<string, HubSpotEvent>();
  for (const e of events) {
    const key = `${e.subscriptionType}:${e.objectTypeId}:${e.objectId}`;
    // Keep latest occurredAt if same key repeats in one batch
    const existing = seen.get(key);
    if (!existing || e.occurredAt > existing.occurredAt) seen.set(key, e);
  }
  return [...seen.values()];
}
```

---

## 5. Convex-Side

### `convex/hubspotSync/webhook.ts` (~180 lines total across mutation + action)

```
// Mutation: thin — just schedules the action. Keeps handler fast.
export const enqueueWebhookEvent = internalMutation({
  args: {
    subscriptionType: v.string(),
    objectType:       v.string(),
    objectId:         v.string(),
    propertyName:     v.union(v.string(), v.null()),
    eventId:          v.string(),
    occurredAt:       v.number(),
  },
  handler: async (ctx, args) => {
    // Convex dedup: same eventId already scheduled? skip.
    const existing = await ctx.db
      .query('webhookEventLog')
      .withIndex('by_event_id', q => q.eq('eventId', args.eventId))
      .first();
    if (existing) return { skipped: true, reason: 'duplicate eventId' };

    await ctx.db.insert('webhookEventLog', { ...args, status: 'scheduled', receivedAt: now });
    await ctx.scheduler.runAfter(0, internal.hubspotSync.webhook.processWebhookEvent, args);
    return { scheduled: true };
  },
});

// Action: does the work.
export const processWebhookEvent = internalAction({
  args: /* same as enqueue */,
  handler: async (ctx, args) => {
    const { subscriptionType, objectType, objectId, propertyName } = args;

    // Dispatch
    let action: 'engagement' | 'object' | 'delete';
    if (subscriptionType === 'company.propertyChange' &&
        propertyName === 'notes_last_updated') {
      action = 'engagement';
    } else if (subscriptionType.endsWith('.deletion')) {
      action = 'delete';
    } else {
      action = 'object';
    }

    // Call Next.js bridge endpoint
    const result = await fetch(`${NEXT_APP_URL}/api/hubspot/webhook-process`, {
      method: 'POST',
      headers: { 'X-Cron-Secret': CRON_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, objectType, objectId }),
    });

    // Update event log row for observability
    await ctx.runMutation(internal.hubspotSync.webhook.markEventProcessed, {
      eventId: args.eventId,
      status: result.ok ? 'completed' : 'failed',
      stats: await result.json(),
    });
  },
});
```

### New schema table: `webhookEventLog`

```
webhookEventLog: {
  eventId:          v.string(),      // HubSpot's unique event ID
  subscriptionType: v.string(),
  objectType:       v.string(),      // "0-1" | "0-2" | "0-3"
  objectId:         v.string(),
  occurredAt:       v.number(),      // ms epoch from HubSpot
  receivedAt:       v.string(),      // ISO when we got it
  status:           v.union(v.literal('scheduled'), v.literal('completed'), v.literal('failed')),
  stats:            v.optional(v.any()),
  error:            v.optional(v.string()),
},
.index('by_event_id', ['eventId'])
.index('by_status', ['status', 'receivedAt'])
```

Purpose: dedup against HubSpot redeliveries (same eventId sent twice) + an audit trail for "did webhook X actually land?" queries. Retention: auto-prune rows >30d old via a Convex daily cron (~5 lines).

---

## 6. Next.js Bridge: `/api/hubspot/webhook-process`

~100 lines. Cron-secret gated. Dispatches on `action`:

```
POST /api/hubspot/webhook-process
body: { action: 'engagement'|'object'|'delete', objectType, objectId }

switch (action) {
  case 'engagement':
    // objectType must be company
    engagements = await fetchEngagementsForCompany(objectId, { since: 10min_ago });
    for each: await fetchMutation(syncActivityFromHubSpot, {...});
    return { type: 'engagement', synced: engagements.length };

  case 'object':
    raw = await batchReadOne(objectType, objectId);  // new helper, ~30 lines
    await fetchMutation(syncXFromHubSpot, mapRawToArgs(raw));
    return { type: 'object', synced: 1 };

  case 'delete':
    await fetchMutation(archiveHubSpotRecord, { objectType, hubspotId: objectId });
    return { type: 'delete', archived: 1 };
}
```

### `batchReadOne` — new helper in `src/lib/hubspot/*.ts`

Already have `batchReadCompaniesFull` for companies. Need similar for contacts/deals. Pattern: POST to `/crm/v3/objects/{type}/batch/read` with `inputs: [{id}]`, return `results[0]`. ~30 lines total.

---

## 7. Deletion Handling

### Schema additions

```diff
 companies: {
   ...
+  archivedAt: v.optional(v.string()),  // ISO; set on HubSpot deletion
 }
 contacts: {
   ...
+  archivedAt: v.optional(v.string()),
 }
 deals: {
   ...
+  archivedAt: v.optional(v.string()),
 }
```

### New Convex mutation: `archiveHubSpotRecord`

```
// Maps HubSpot objectTypeId → Convex table + the HubSpot ID field on that table
const OBJECT_TYPE_MAP = {
  '0-1': { table: 'contacts',  hubspotField: 'hubspotContactId' },
  '0-2': { table: 'companies', hubspotField: 'hubspotCompanyId' },
  '0-3': { table: 'deals',     hubspotField: 'hubspotDealId' },
} as const;

export const archiveHubSpotRecord = mutation({
  args: { objectType: v.string(), hubspotId: v.string() },
  handler: async (ctx, { objectType, hubspotId }) => {
    const cfg = OBJECT_TYPE_MAP[objectType];
    if (!cfg) return { found: false, reason: `unknown objectType: ${objectType}` };

    const record = await ctx.db
      .query(cfg.table)
      .withIndex('by_hubspot_id', q => q.eq(cfg.hubspotField, hubspotId))
      .first();
    if (!record) return { found: false };

    await ctx.db.patch(record._id, { archivedAt: new Date().toISOString() });
    return { found: true, archived: true };
  },
});
```

### UI impact (out of scope for this spec — follow-up)

Existing Convex queries (e.g. `companies.getAll`) need a `filter(q => q.eq(q.field('archivedAt'), undefined))` added to hide archived records by default. That's a ~20-line sweep across maybe 10 query functions. **Not included in this build** to keep the scope tight — the data-layer mechanism lands now; UI filter is a follow-up logbook task.

### Restoration

HubSpot supports restoring archived records. When restored, HubSpot emits a `*.creation` event for the restored record (with the same objectId). Our `processObjectEvent` handler will re-fetch and upsert — which will find the existing row (matched by HubSpot ID) and patch. We need to add `archivedAt: undefined` to the patch set on object updates so restoration clears the archive flag. One-line addition to each `syncXFromHubSpot` mutation.

---

## 8. Middleware

```diff
 const isPublicRoute = createRouteMatcher([
   ...
   '/api/hubspot/sync-all(.*)',
+  '/api/hubspot/webhook(.*)',           // HubSpot signs these; self-auths via HMAC
+  '/api/hubspot/webhook-process(.*)',   // Convex calls with X-Cron-Secret; self-auths
 ])
```

Both handlers enforce their own auth. Exposing to Clerk middleware would reject HubSpot's unauthenticated request before the handler could check the signature.

---

## 9. Observability

### Convex dashboard

Every `processWebhookEvent` run appears in Functions tab: arguments, runtime, return value, stack trace on failure. One-click drill-down.

### `webhookEventLog` table queries

```
// Recent events
db.query('webhookEventLog').withIndex('by_status', q => q.eq('status', 'failed')).order('desc').take(50)

// How healthy is the pipe?
count(status='completed' in last 1h) / count(status='scheduled' in last 1h)
```

Surfaces as a simple stat on the `/settings/hubspot` page.

### Vercel logs

Structured log lines from the handler:
```
[hubspot-webhook] received=3 unique=2 duration_ms=184
[hubspot-webhook] signature verify failed: timestamp_age=312s
[hubspot-webhook-process] action=engagement companyId=165540968664 synced=7
```

### Cron's `webhook-missed` counter

During the 1h reconciliation sweep, for each upserted record check: was `lastHubSpotSync > 15 min ago`? If so and HubSpot's `modifieddate` is recent, webhook didn't catch it. Increment `webhookMissed` stat. Report in the cron's summary log.

**Interpretation:** consistently 0 = webhooks healthy. Creeping up = investigate subscription state in HubSpot.

---

## 10. Testing Strategy

### Unit (vitest)

```
webhook-verify.test.ts
├── accepts freshly-signed payload with correct secret
├── rejects with tampered body
├── rejects with wrong secret
├── rejects with stale timestamp (>5 min)
├── rejects with missing headers
└── uses timingSafeEqual (no short-circuit vulnerability)

dedupe-events.test.ts
├── collapses 5 same-key events into 1
├── keeps distinct keys
├── picks latest occurredAt when collapsing
└── handles empty batch
```

### Integration (vitest + test fixture)

```
webhook-handler.test.ts
├── Given a real captured HubSpot payload
├── When POST /api/hubspot/webhook with valid sig
├── Then signature verifies, events dedupe, enqueueWebhookEvent called N times
```

Uses a fixture in `src/lib/hubspot/__tests__/fixtures/hubspot-webhook-burst.json`.

### End-to-end (manual, staging gate)

1. Point HubSpot webhook Target URL at a preview deployment or ngrok tunnel pointing at `localhost:3000`
2. Subscribe to one narrow event: `company.propertyChange:name`
3. Edit a company's name in HubSpot
4. Observe:
   - Vercel log: webhook received, signature verified
   - Convex dashboard: `processWebhookEvent` ran, returned success
   - Convex DB: company record's `name` field updated

Final gate before widening the subscription set.

---

## 11. Rollout Plan

**Phase 1 — Code only (no behavior change)**
Ship all code. HubSpot subscription not yet created. Production deploy runs existing cron unchanged.

**Phase 2 — Staging verify**
End-to-end test on preview URL with one narrow subscription. ~30 min of manual testing.

**Phase 3 — Production, narrow**
HubSpot Target URL → production. Single subscription: `company.propertyChange:notes_last_updated`. Watch for 24h: confirm events land, confirm Convex dashboard shows success, confirm no 401s from signature failures, confirm cron's `webhook-missed` counter stays at 0.

**Phase 4 — Widen**
Add remaining subscriptions in HubSpot UI, one object-type at a time. Each gets 12-24h of observation before moving to the next.

**Phase 5 — Consider cron relaxation (optional, later)**
If webhook-missed stays at 0 for a few weeks, consider dropping cron to 6h or daily. Not necessary — the 1h cost is negligible.

---

## 12. Edge Cases & Out of Scope

### In scope

- Bulk imports / mass edits → handler dedups, Convex scheduler fans out, `hubspotFetch` backs off
- HubSpot redelivery (same eventId twice) → Convex mutation skips based on `webhookEventLog`
- Signature replay → timestamp check
- Webhook downtime → 1h cron reconciles
- Restoration of archived HubSpot records → `*.creation` event clears `archivedAt`

### Explicitly out of scope (follow-up tasks)

- **UI filtering of archived records** — schema field lands now, queries filter in a separate logbook task
- **Association changes** (contact moves company) — not covered by current subscriptions; add `*.propertyChange:associatedcompanyid` later if users report the gap
- **Engagement deletions** — individual engagements being deleted in HubSpot won't be caught (no engagement-level subscription exists). Rare; cron-sweep doesn't catch either. Acceptable.
- **Preview-deployment webhooks** — HubSpot only hits one Target URL. Preview branches won't have live data. Matches existing cron behavior.
- **Self-service webhook registration** — user configures in HubSpot UI manually. No auto-provisioning API call from our side.
- **Per-company `lastEngagementSyncedAt` watermark** — explicit rejection; 10-min lookback + idempotent upsert is the chosen design.

---

## 13. Files Changed / Added

### New files
- `src/app/api/hubspot/webhook/route.ts` (~110 lines)
- `src/app/api/hubspot/webhook-process/route.ts` (~100 lines)
- `src/lib/hubspot/webhook-verify.ts` (~40 lines)
- `convex/hubspotSync/webhook.ts` (~180 lines)
- `src/lib/hubspot/__tests__/webhook-verify.test.ts` (~60 lines)
- `src/lib/hubspot/__tests__/dedupe-events.test.ts` (~40 lines)
- `src/lib/hubspot/__tests__/webhook-handler.test.ts` (~80 lines)
- `src/lib/hubspot/__tests__/fixtures/hubspot-webhook-burst.json` (captured fixture)

### Modified files
- `convex/schema.ts` — add `archivedAt` to companies/contacts/deals + new `webhookEventLog` table
- `convex/hubspotSync/*.ts` (companies/contacts/deals mutations) — add `archivedAt: undefined` on upsert to clear on restore
- `convex/hubspotSync/activities.ts` — new `archiveHubSpotRecord` mutation (or its own file)
- `src/middleware.ts` — add 2 public routes
- `src/lib/hubspot/contacts.ts`, `deals.ts` — add `batchReadOne` helper (companies already has `batchReadCompaniesFull`)

### Env vars
- New on Vercel Production: `HUBSPOT_WEBHOOK_SECRET`
- New on Convex Production: none (uses existing `NEXT_APP_URL` + `CRON_SECRET` for the bridge)

### Rough total LOC
~820 new lines (including tests), ~50 modified. Zero deletions.

---

## 14. Success Metric

Two weeks post-rollout, `webhookEventLog` shows:
- **>99%** events with `status: 'completed'`
- **Median** `scheduled → completed` latency <5s
- Cron's `webhook-missed` counter **<1% of total events**

If we hit those numbers, webhooks are the new primary sync path and the 1h cron is successfully acting as a cold-standby reconciler.
