# HubSpot Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship event-driven HubSpot sync — engagements, CRM object changes, and deletions propagate into RockCap within ~30s via HubSpot webhooks. The existing 1h Convex cron remains as reconciliation safety net.

**Architecture:** HubSpot → `POST /api/hubspot/webhook` (signature-verify + dedup + enqueue) → Convex scheduler → Convex internalAction → `POST /api/hubspot/webhook-process` (bridge to existing HubSpot lib) → existing sync mutations. Soft-archive on deletion via new `archivedAt` field; 10-min fixed lookback for engagements (idempotent upsert makes it self-healing).

**Tech Stack:** Next.js App Router (Node runtime for raw-body access), Convex (actions + scheduler + internalMutation), Node `crypto` for HMAC-SHA256, vitest for unit/integration tests.

**Spec:** `docs/superpowers/specs/2026-04-22-hubspot-webhooks-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `model-testing-app/src/lib/hubspot/webhook-verify.ts` | `getHubspotWebhookSecret()` chokepoint + `verifyV3()` signature check |
| `model-testing-app/src/lib/hubspot/dedupe-events.ts` | Pure function: collapse events by `(subscriptionType, objectTypeId, objectId)` |
| `model-testing-app/src/lib/hubspot/batch-read-one.ts` | Single-record batch-read helpers for contacts/deals |
| `model-testing-app/src/app/api/hubspot/webhook/route.ts` | Webhook receiver — verify, dedup, enqueue |
| `model-testing-app/src/app/api/hubspot/webhook-process/route.ts` | Bridge endpoint Convex calls to execute the HubSpot fetch + upsert |
| `model-testing-app/convex/hubspotSync/webhook.ts` | `enqueueWebhookEvent` mutation + `processWebhookEvent` action + event-log pruner |
| `model-testing-app/convex/hubspotSync/archive.ts` | `archiveHubSpotRecord` mutation (soft-delete by HubSpot object-type + id) |
| `model-testing-app/src/lib/hubspot/__tests__/webhook-verify.test.ts` | Unit tests for signature verification |
| `model-testing-app/src/lib/hubspot/__tests__/dedupe-events.test.ts` | Unit tests for event dedup |

### Modified files

| Path | Change |
|---|---|
| `model-testing-app/src/lib/hubspot/http.ts` | No change — already hosts chokepoint helpers. Webhook-secret helper lives in `webhook-verify.ts` to keep that file self-contained. |
| `model-testing-app/convex/schema.ts` | Add `archivedAt` to companies/contacts/deals. Add new `webhookEventLog` table with indexes. |
| `model-testing-app/convex/hubspotSync/companies.ts` | On upsert, explicitly set `archivedAt: undefined` so a HubSpot restoration clears the archive mark. |
| `model-testing-app/convex/hubspotSync/contacts.ts` | Same. |
| `model-testing-app/convex/hubspotSync/deals.ts` | Same. |
| `model-testing-app/convex/crons.ts` | Add daily cron for `pruneWebhookEventLog` (retention 30d). |
| `model-testing-app/src/middleware.ts` | Add `/api/hubspot/webhook(.*)` and `/api/hubspot/webhook-process(.*)` to `isPublicRoute`. |

### Env vars

- **New on Vercel Production:** `HUBSPOT_WEBHOOK_SECRET` (HubSpot Private App → Auth tab → Client secret)

---

## Task 1: Chokepoint + Signature Verification (TDD)

The signing path is security-critical. We build it test-first because a subtle HMAC bug is invisible in integration tests (HubSpot just keeps disabling the endpoint silently).

**Files:**
- Create: `model-testing-app/src/lib/hubspot/webhook-verify.ts`
- Create test: `model-testing-app/src/lib/hubspot/__tests__/webhook-verify.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `model-testing-app/src/lib/hubspot/__tests__/webhook-verify.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { verifyV3, getHubspotWebhookSecret } from '../webhook-verify';

const SECRET = 'test-webhook-secret-12345';
const URI = 'https://rockcap-v2.vercel.app/api/hubspot/webhook';

function signV3(body: string, timestamp: string, secret = SECRET): string {
  const sourceString = `POST${URI}${body}${timestamp}`;
  return createHmac('sha256', secret).update(sourceString).digest('base64');
}

describe('verifyV3', () => {
  beforeEach(() => {
    process.env.HUBSPOT_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.HUBSPOT_WEBHOOK_SECRET;
  });

  it('accepts a freshly-signed payload', () => {
    const body = '[{"eventId":"abc","objectId":"123"}]';
    const timestamp = String(Date.now());
    const signature = signV3(body, timestamp);

    expect(verifyV3(body, timestamp, signature, URI)).toBe(true);
  });

  it('rejects when body is tampered', () => {
    const body = '[{"eventId":"abc"}]';
    const tampered = '[{"eventId":"xyz"}]';
    const timestamp = String(Date.now());
    const signature = signV3(body, timestamp);

    expect(verifyV3(tampered, timestamp, signature, URI)).toBe(false);
  });

  it('rejects when signed with a different secret', () => {
    const body = '[{"eventId":"abc"}]';
    const timestamp = String(Date.now());
    const signature = signV3(body, timestamp, 'wrong-secret');

    expect(verifyV3(body, timestamp, signature, URI)).toBe(false);
  });

  it('rejects when timestamp is stale (>5 minutes)', () => {
    const body = '[{"eventId":"abc"}]';
    const staleTs = String(Date.now() - 6 * 60 * 1000);
    const signature = signV3(body, staleTs);

    expect(verifyV3(body, staleTs, signature, URI)).toBe(false);
  });

  it('rejects when timestamp is missing', () => {
    const body = '[]';
    expect(verifyV3(body, null, 'anysig', URI)).toBe(false);
  });

  it('rejects when signature is missing', () => {
    const body = '[]';
    const timestamp = String(Date.now());
    expect(verifyV3(body, timestamp, null, URI)).toBe(false);
  });

  it('uses the URI passed in (path sensitivity)', () => {
    const body = '[]';
    const timestamp = String(Date.now());
    const signature = signV3(body, timestamp);

    // Sig was made for URI=webhook — should fail against /different-path
    expect(
      verifyV3(body, timestamp, signature, 'https://rockcap-v2.vercel.app/api/hubspot/other'),
    ).toBe(false);
  });
});

describe('getHubspotWebhookSecret', () => {
  afterEach(() => {
    delete process.env.HUBSPOT_WEBHOOK_SECRET;
  });

  it('returns the env var when set', () => {
    process.env.HUBSPOT_WEBHOOK_SECRET = 'abc123';
    expect(getHubspotWebhookSecret()).toBe('abc123');
  });

  it('throws when env var is missing', () => {
    expect(() => getHubspotWebhookSecret()).toThrow(/HUBSPOT_WEBHOOK_SECRET not set/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From `model-testing-app/`:
```bash
npx vitest run src/lib/hubspot/__tests__/webhook-verify.test.ts
```
Expected: FAIL — module not found (`../webhook-verify`).

- [ ] **Step 3: Create the implementation**

Create `model-testing-app/src/lib/hubspot/webhook-verify.ts`:

```typescript
/**
 * HubSpot webhook signature verification (v3 scheme).
 *
 * HubSpot signs every webhook with HMAC-SHA256 using the Private App's
 * "Client secret" (distinct from the API key used for outbound calls).
 * We verify that signature plus a timestamp freshness check (<=5 min) so
 * replay attacks can't resurrect a valid-but-old payload.
 *
 * The secret read is centralised here — one chokepoint, matching the
 * getHubspotApiKey() pattern in http.ts.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/**
 * Single read site for HUBSPOT_WEBHOOK_SECRET. Every signature verify must
 * route through here so there's exactly one line of code reading the secret.
 */
export function getHubspotWebhookSecret(): string {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (!secret) throw new Error('HUBSPOT_WEBHOOK_SECRET not set');
  return secret;
}

/**
 * Verify a HubSpot v3 webhook signature.
 *
 * @param rawBody   The request body as-received (before any JSON.parse — byte-exact)
 * @param timestamp Header `X-HubSpot-Request-Timestamp` (ms epoch as string)
 * @param signature Header `X-HubSpot-Signature-v3` (base64)
 * @param requestUri The full URL HubSpot hit — must match what was configured
 *                   as Target URL in the Private App webhook settings.
 * @returns true iff signature matches AND timestamp is fresh (<=5min old).
 *
 * Uses timingSafeEqual to avoid early-exit side-channels that could leak
 * per-byte comparison timing to a determined attacker.
 */
export function verifyV3(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  requestUri: string,
): boolean {
  if (!timestamp || !signature) return false;

  // Freshness — HubSpot's recommended window. Prevents replay of old
  // captured payloads.
  const tsMs = Number(timestamp);
  if (!Number.isFinite(tsMs)) return false;
  if (Date.now() - tsMs > MAX_TIMESTAMP_AGE_MS) return false;

  let secret: string;
  try {
    secret = getHubspotWebhookSecret();
  } catch {
    return false; // Misconfigured env — fail closed, don't throw to caller.
  }

  const sourceString = `POST${requestUri}${rawBody}${timestamp}`;
  const expected = createHmac('sha256', secret).update(sourceString).digest('base64');

  // timingSafeEqual requires equal-length buffers; different lengths = definitely not a match.
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/hubspot/__tests__/webhook-verify.test.ts
```
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/webhook-verify.ts \
        model-testing-app/src/lib/hubspot/__tests__/webhook-verify.test.ts
git commit -m "feat(hubspot-webhook): v3 signature verification + secret chokepoint"
```

---

## Task 2: Event Deduplication (TDD)

HubSpot can deliver up to 100 events in one POST. When a user bulk-edits or mass-imports, the same (objectId) may appear many times. We collapse to one job per unique (subscriptionType, objectTypeId, objectId) so we don't hammer Convex or HubSpot.

**Files:**
- Create: `model-testing-app/src/lib/hubspot/dedupe-events.ts`
- Create test: `model-testing-app/src/lib/hubspot/__tests__/dedupe-events.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `model-testing-app/src/lib/hubspot/__tests__/dedupe-events.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { dedupeEvents, type HubSpotWebhookEvent } from '../dedupe-events';

function e(
  subscriptionType: string,
  objectTypeId: string,
  objectId: number,
  occurredAt: number,
  extra: Partial<HubSpotWebhookEvent> = {},
): HubSpotWebhookEvent {
  return {
    eventId: `${subscriptionType}-${objectId}-${occurredAt}`,
    subscriptionType,
    objectTypeId,
    objectId,
    occurredAt,
    ...extra,
  };
}

describe('dedupeEvents', () => {
  it('returns empty array for empty input', () => {
    expect(dedupeEvents([])).toEqual([]);
  });

  it('passes through events with distinct keys unchanged', () => {
    const events = [
      e('company.propertyChange', '0-2', 100, 1000),
      e('contact.creation',       '0-1', 200, 1000),
      e('deal.propertyChange',    '0-3', 300, 1000),
    ];
    expect(dedupeEvents(events)).toHaveLength(3);
  });

  it('collapses events with the same (subscriptionType, objectTypeId, objectId)', () => {
    const events = [
      e('company.propertyChange', '0-2', 100, 1000),
      e('company.propertyChange', '0-2', 100, 2000),
      e('company.propertyChange', '0-2', 100, 1500),
    ];
    const out = dedupeEvents(events);
    expect(out).toHaveLength(1);
    expect(out[0].occurredAt).toBe(2000); // keeps latest occurredAt
  });

  it('treats different subscriptionType on same object as distinct', () => {
    const events = [
      e('company.propertyChange', '0-2', 100, 1000),
      e('company.creation',       '0-2', 100, 1000),
      e('company.deletion',       '0-2', 100, 1000),
    ];
    expect(dedupeEvents(events)).toHaveLength(3);
  });

  it('preserves propertyName from the latest occurrence when collapsing', () => {
    const events = [
      e('company.propertyChange', '0-2', 100, 1000, { propertyName: 'name' }),
      e('company.propertyChange', '0-2', 100, 2000, { propertyName: 'notes_last_updated' }),
    ];
    const out = dedupeEvents(events);
    expect(out).toHaveLength(1);
    expect(out[0].propertyName).toBe('notes_last_updated');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/hubspot/__tests__/dedupe-events.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

Create `model-testing-app/src/lib/hubspot/dedupe-events.ts`:

```typescript
/**
 * Collapse HubSpot webhook events that refer to the same object.
 *
 * HubSpot can send a single POST with up to 100 events. During bulk operations
 * (mass edits, imports, workflow fan-out), the same (subscriptionType, objectId)
 * often appears many times. Each represents the "same" work from our
 * perspective — we'd fetch the same object or engagement history anyway —
 * so we collapse to one job per unique key.
 *
 * Dedup key:    `${subscriptionType}:${objectTypeId}:${objectId}`
 * Tiebreaker:   keep the event with the latest occurredAt (most recent state).
 *
 * Separate subscriptionTypes on the same object (e.g. creation + propertyChange)
 * remain distinct — they trigger different code paths downstream.
 */

export interface HubSpotWebhookEvent {
  eventId: string | number;
  subscriptionType: string;   // e.g. "company.propertyChange"
  objectTypeId: string;       // "0-1"=contact, "0-2"=company, "0-3"=deal
  objectId: number;
  propertyName?: string;      // present on propertyChange only
  propertyValue?: unknown;
  occurredAt: number;         // ms epoch
}

export function dedupeEvents(events: HubSpotWebhookEvent[]): HubSpotWebhookEvent[] {
  const latestByKey = new Map<string, HubSpotWebhookEvent>();

  for (const event of events) {
    const key = `${event.subscriptionType}:${event.objectTypeId}:${event.objectId}`;
    const existing = latestByKey.get(key);
    if (!existing || event.occurredAt > existing.occurredAt) {
      latestByKey.set(key, event);
    }
  }

  return [...latestByKey.values()];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/hubspot/__tests__/dedupe-events.test.ts
```
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/dedupe-events.ts \
        model-testing-app/src/lib/hubspot/__tests__/dedupe-events.test.ts
git commit -m "feat(hubspot-webhook): event dedup helper with latest-wins tiebreaker"
```

---

## Task 3: Schema — archivedAt + webhookEventLog

**Files:**
- Modify: `model-testing-app/convex/schema.ts`

- [ ] **Step 1: Open the schema file and find the companies, contacts, deals tables**

Read `model-testing-app/convex/schema.ts` and locate the three table definitions. Each has a `.index("by_hubspot_id", ...)` line.

- [ ] **Step 2: Add `archivedAt` optional field to companies table**

In the `companies` table definition, add the `archivedAt` field. Example (the rest of your fields will differ — keep them):

```diff
 companies: defineTable({
   // ... existing fields ...
   hubspotCompanyId: v.optional(v.string()),
+  // Set by webhook handler on HubSpot `*.deletion` events. Cleared
+  // (patched to undefined → removed) on next `syncCompanyFromHubSpot`
+  // upsert if HubSpot restores the record.
+  archivedAt: v.optional(v.string()),
   // ... rest of existing fields ...
 })
```

- [ ] **Step 3: Add `archivedAt` to contacts and deals tables**

Same pattern as Step 2 — add the field (with the same comment) to both the `contacts` and `deals` table definitions.

- [ ] **Step 4: Add the `webhookEventLog` table definition**

Add anywhere alongside the other top-level table definitions:

```typescript
  /**
   * Audit log + dedup for inbound HubSpot webhook events.
   *
   * Each row represents ONE delivery of ONE event from HubSpot. Indexed by
   * eventId so a redelivery (HubSpot will retry on 5xx) is idempotent —
   * the enqueue mutation skips if the eventId is already present.
   *
   * Retention: pruned daily to last 30d via Convex cron.
   */
  webhookEventLog: defineTable({
    eventId: v.string(),
    subscriptionType: v.string(),
    objectType: v.string(),           // "0-1" | "0-2" | "0-3"
    objectId: v.string(),
    propertyName: v.optional(v.string()),
    occurredAt: v.number(),            // ms epoch from HubSpot
    receivedAt: v.string(),            // ISO when Next.js received the POST
    status: v.union(
      v.literal('scheduled'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    stats: v.optional(v.any()),        // action return value on completion
    error: v.optional(v.string()),     // set on status=failed
  })
    .index('by_event_id', ['eventId'])
    .index('by_status', ['status', 'receivedAt']),
```

- [ ] **Step 5: Trigger Convex codegen**

From `model-testing-app/`:
```bash
npx convex codegen
```
Expected: finishes without errors; `convex/_generated/` files updated.

- [ ] **Step 6: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/schema.ts \
        model-testing-app/convex/_generated/
git commit -m "feat(hubspot-webhook): schema — archivedAt on crm tables, webhookEventLog table"
```

---

## Task 4: archiveHubSpotRecord Mutation

**Files:**
- Create: `model-testing-app/convex/hubspotSync/archive.ts`

- [ ] **Step 1: Create the mutation file**

Create `model-testing-app/convex/hubspotSync/archive.ts`:

```typescript
import { v } from 'convex/values';
import { mutation } from '../_generated/server';

/**
 * Soft-archive a Convex record that was deleted in HubSpot.
 *
 * Called by the webhook processor on `*.deletion` events. Preserves all
 * linked activities/history — the record just gets a `archivedAt` ISO
 * timestamp. UI layers should filter `archivedAt !== undefined` from
 * default queries (separate follow-up task).
 *
 * If HubSpot later restores the record, the next `*.creation` webhook
 * runs `syncXFromHubSpot` which patches `archivedAt: undefined` — clearing
 * the archive flag and un-hiding the record.
 *
 * Returns { found, archived } for observability; never throws on "record
 * not found" — that's an expected no-op if the deletion arrived before
 * we ever synced the record.
 */

// Maps HubSpot objectTypeId → Convex table + the HubSpot ID field on that table.
const OBJECT_TYPE_MAP: Record<
  string,
  { table: 'companies' | 'contacts' | 'deals'; hubspotField: string }
> = {
  '0-1': { table: 'contacts', hubspotField: 'hubspotContactId' },
  '0-2': { table: 'companies', hubspotField: 'hubspotCompanyId' },
  '0-3': { table: 'deals', hubspotField: 'hubspotDealId' },
};

export const archiveHubSpotRecord = mutation({
  args: {
    objectType: v.string(), // "0-1" | "0-2" | "0-3"
    hubspotId: v.string(),
  },
  handler: async (ctx, { objectType, hubspotId }) => {
    const cfg = OBJECT_TYPE_MAP[objectType];
    if (!cfg) {
      return { found: false, reason: `unknown objectType: ${objectType}` };
    }

    const record: any = await ctx.db
      .query(cfg.table)
      .withIndex('by_hubspot_id', (q: any) => q.eq(cfg.hubspotField, hubspotId))
      .first();

    if (!record) {
      return { found: false, reason: 'no matching record' };
    }

    if (record.archivedAt) {
      return { found: true, archived: true, alreadyArchived: true };
    }

    await ctx.db.patch(record._id, {
      archivedAt: new Date().toISOString(),
    });

    return { found: true, archived: true };
  },
});
```

- [ ] **Step 2: Trigger Convex codegen to register the mutation**

```bash
cd model-testing-app
npx convex codegen
```
Expected: success, new entry in `convex/_generated/api.d.ts` for `api.hubspotSync.archive.archiveHubSpotRecord`.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/archive.ts \
        model-testing-app/convex/_generated/
git commit -m "feat(hubspot-webhook): archiveHubSpotRecord mutation (soft-delete on deletion event)"
```

---

## Task 5: Clear archivedAt on Sync Mutations (Restoration Path)

When HubSpot restores a previously-deleted record, the next sync must clear the archive flag. We add `archivedAt: undefined` to the patch field set in the three existing sync mutations. In Convex, `undefined` in a patch removes the field — which is exactly what we want.

**Files:**
- Modify: `model-testing-app/convex/hubspotSync/companies.ts`
- Modify: `model-testing-app/convex/hubspotSync/contacts.ts`
- Modify: `model-testing-app/convex/hubspotSync/deals.ts`

- [ ] **Step 1: Locate the upsert/patch code in each file**

Read each of the three files. Find where the existing record is patched (`ctx.db.patch(existing._id, { ... })`) — typically at the end of a "if existing" branch.

- [ ] **Step 2: Add `archivedAt: undefined` to the patch payload in companies.ts**

```diff
 if (existing) {
   await ctx.db.patch(existing._id, {
     // ... existing fields being patched ...
     lastHubSpotSync: now,
     updatedAt: now,
+    // Clear archive flag if HubSpot restored this record. undefined in
+    // a Convex patch removes the field.
+    archivedAt: undefined,
   });
   return existing._id;
 }
```

Make the same edit to `contacts.ts` and `deals.ts`.

- [ ] **Step 3: Verify nothing else broke**

```bash
cd model-testing-app
npx convex codegen
npx next build 2>&1 | tail -20
```
Expected: both succeed without errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/companies.ts \
        model-testing-app/convex/hubspotSync/contacts.ts \
        model-testing-app/convex/hubspotSync/deals.ts
git commit -m "feat(hubspot-webhook): clear archivedAt on sync upserts to handle restoration"
```

---

## Task 6: Convex enqueueWebhookEvent + processWebhookEvent

**Files:**
- Create: `model-testing-app/convex/hubspotSync/webhook.ts`

- [ ] **Step 1: Create the Convex file with the enqueue mutation and the dispatch action**

Create `model-testing-app/convex/hubspotSync/webhook.ts`:

```typescript
"use node";

import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction, internalMutation } from '../_generated/server';

/**
 * HubSpot webhook event processing.
 *
 * Flow:
 *   1. Next.js /api/hubspot/webhook verifies signature + dedupes events,
 *      then calls enqueueWebhookEvent once per unique event.
 *   2. enqueueWebhookEvent writes a log row (idempotent on eventId) and
 *      schedules processWebhookEvent to run immediately.
 *   3. processWebhookEvent dispatches on (subscriptionType, propertyName)
 *      and calls the Next.js bridge endpoint /api/hubspot/webhook-process
 *      — which has access to the HubSpot lib code that can't be imported
 *      from Convex land.
 *   4. On return, processWebhookEvent patches the log row with the
 *      final status + stats for observability.
 *
 * Why the bridge: the Convex runtime can't import from `src/` (different
 * bundler scope). Reusing existing fetchers via HTTP preserves DRY without
 * cross-dir imports — same pattern as recurringSync.ts.
 */

type Dispatch = 'engagement' | 'object' | 'delete';

function dispatchFor(
  subscriptionType: string,
  propertyName: string | undefined,
): Dispatch {
  if (subscriptionType.endsWith('.deletion')) return 'delete';
  if (
    subscriptionType === 'company.propertyChange' &&
    propertyName === 'notes_last_updated'
  ) {
    return 'engagement';
  }
  return 'object';
}

/**
 * Thin mutation called by the webhook handler. Writes an event-log row
 * (dedupe-keyed on eventId so HubSpot redeliveries no-op) and schedules
 * the action to run immediately.
 */
export const enqueueWebhookEvent = internalMutation({
  args: {
    subscriptionType: v.string(),
    objectType: v.string(),
    objectId: v.string(),
    propertyName: v.optional(v.string()),
    eventId: v.string(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Dedupe: HubSpot will retry a 5xx with the same eventId. Skip silently.
    const existing = await ctx.db
      .query('webhookEventLog')
      .withIndex('by_event_id', (q) => q.eq('eventId', args.eventId))
      .first();

    if (existing) {
      return { skipped: true, reason: 'duplicate eventId', eventId: args.eventId };
    }

    await ctx.db.insert('webhookEventLog', {
      ...args,
      receivedAt: new Date().toISOString(),
      status: 'scheduled',
    });

    await ctx.scheduler.runAfter(
      0,
      internal.hubspotSync.webhook.processWebhookEvent,
      args,
    );

    return { scheduled: true, eventId: args.eventId };
  },
});

/**
 * Does the actual HubSpot fetch + Convex write via the Next.js bridge.
 * On failure, patches the log row to `status: 'failed'` with the error —
 * visible in Convex dashboard for debugging.
 */
export const processWebhookEvent = internalAction({
  args: {
    subscriptionType: v.string(),
    objectType: v.string(),
    objectId: v.string(),
    propertyName: v.optional(v.string()),
    eventId: v.string(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    const apiBase = process.env.NEXT_APP_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!apiBase || !cronSecret) {
      const error = 'NEXT_APP_URL or CRON_SECRET not configured';
      await ctx.runMutation(internal.hubspotSync.webhook.markEventFailed, {
        eventId: args.eventId,
        error,
      });
      return { error };
    }

    const normalized = apiBase.match(/^https?:\/\//)
      ? apiBase
      : `https://${apiBase}`;
    const url = `${normalized.replace(/\/$/, '')}/api/hubspot/webhook-process`;

    const action = dispatchFor(args.subscriptionType, args.propertyName);

    let status: 'completed' | 'failed' = 'failed';
    let stats: any = null;
    let error: string | undefined;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': cronSecret,
        },
        body: JSON.stringify({
          action,
          objectType: args.objectType,
          objectId: args.objectId,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        error = `HTTP ${res.status}: ${body.slice(0, 300)}`;
      } else {
        stats = await res.json().catch(() => null);
        status = 'completed';
      }
    } catch (err: any) {
      error = err?.message ?? String(err);
    }

    if (status === 'completed') {
      await ctx.runMutation(internal.hubspotSync.webhook.markEventCompleted, {
        eventId: args.eventId,
        stats,
      });
    } else {
      await ctx.runMutation(internal.hubspotSync.webhook.markEventFailed, {
        eventId: args.eventId,
        error: error ?? 'unknown error',
      });
    }

    return { action, status, stats, error };
  },
});

export const markEventCompleted = internalMutation({
  args: { eventId: v.string(), stats: v.optional(v.any()) },
  handler: async (ctx, { eventId, stats }) => {
    const row = await ctx.db
      .query('webhookEventLog')
      .withIndex('by_event_id', (q) => q.eq('eventId', eventId))
      .first();
    if (row) {
      await ctx.db.patch(row._id, { status: 'completed', stats });
    }
  },
});

export const markEventFailed = internalMutation({
  args: { eventId: v.string(), error: v.string() },
  handler: async (ctx, { eventId, error }) => {
    const row = await ctx.db
      .query('webhookEventLog')
      .withIndex('by_event_id', (q) => q.eq('eventId', eventId))
      .first();
    if (row) {
      await ctx.db.patch(row._id, { status: 'failed', error });
    }
  },
});

/**
 * Called daily by the Convex cron to keep webhookEventLog from growing
 * unbounded. 30-day retention is plenty for dedup (HubSpot retries
 * within 24h max) and audit (debugging rarely needs more than 2 weeks).
 */
export const pruneWebhookEventLog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(thirtyDaysAgo).toISOString();

    let pruned = 0;
    // Use status index as a reasonable scan (bounded size). For retention
    // at scale, a dedicated `by_receivedAt` index would be better, but
    // 30 days of events at <1 event/sec = <3M rows — acceptable scan cost.
    for (const status of ['completed', 'failed', 'scheduled'] as const) {
      const rows = await ctx.db
        .query('webhookEventLog')
        .withIndex('by_status', (q) => q.eq('status', status))
        .collect();
      for (const row of rows) {
        if (row.receivedAt < cutoffIso) {
          await ctx.db.delete(row._id);
          pruned++;
        }
      }
    }
    return { pruned };
  },
});
```

- [ ] **Step 2: Register the daily cron**

Open `model-testing-app/convex/crons.ts`. Add the daily pruner:

```diff
 crons.interval(
   "hubspot-recurring-sync",
   { hours: 1 },  // or whatever the current cadence is
   internal.hubspotSync.recurringSync.runRecurringSync,
 );
+
+crons.daily(
+  "hubspot-webhook-log-prune",
+  { hourUTC: 3, minuteUTC: 15 },  // quiet hour
+  internal.hubspotSync.webhook.pruneWebhookEventLog,
+);
```

- [ ] **Step 3: Regenerate Convex types**

```bash
cd model-testing-app
npx convex codegen
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/webhook.ts \
        model-testing-app/convex/crons.ts \
        model-testing-app/convex/_generated/
git commit -m "feat(hubspot-webhook): Convex enqueue + process actions + daily log pruner"
```

---

## Task 7: batchReadOne Helpers (Contacts + Deals)

We need to fetch a single contact or deal by ID when a CRM-object webhook fires. Companies already has `batchReadCompaniesFull`. We add minimal versions for the other two types — they use the same endpoint pattern with different paths.

**Files:**
- Create: `model-testing-app/src/lib/hubspot/batch-read-one.ts`

- [ ] **Step 1: Create the helper file**

Create `model-testing-app/src/lib/hubspot/batch-read-one.ts`:

```typescript
/**
 * Fetch a single HubSpot record by ID via the batch-read endpoint.
 *
 * Used by the webhook-process bridge to hydrate one contact/deal/company
 * after a *.creation or *.propertyChange event. For companies we defer to
 * the existing batchReadCompaniesFull() which handles the full custom-
 * property discovery. Contacts and deals get the streamlined helper here
 * — we only need the canonical property list the sync mutations consume.
 */

import { getHubspotApiKey, hubspotFetchJson } from './http';
import { CONTACT_PROPERTIES } from './contacts';
import { DEAL_PROPERTIES } from './deals';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

type HubSpotObjectType = 'contacts' | 'deals';

/**
 * Batch-read a single record. Returns null if HubSpot says it doesn't exist
 * (404 on the underlying request — can happen if the record was deleted
 * before we got around to fetching the create event).
 */
export async function batchReadOne(
  objectType: HubSpotObjectType,
  id: string,
): Promise<any | null> {
  const apiKey = getHubspotApiKey();

  const properties =
    objectType === 'contacts' ? CONTACT_PROPERTIES : DEAL_PROPERTIES;
  const associations =
    objectType === 'contacts'
      ? ['companies', 'deals']
      : ['contacts', 'companies'];

  const url = new URL(`${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/batch/read`);
  url.searchParams.set('associations', associations.join(','));

  try {
    const res = await hubspotFetchJson<{ results?: any[] }>(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [{ id }],
        properties,
      }),
    });

    return res.results?.[0] ?? null;
  } catch (err: any) {
    // hubspotFetchJson throws on non-2xx; 404 here is meaningful (record
    // gone) and should propagate as null rather than throw.
    if (/404/.test(err?.message ?? '')) return null;
    throw err;
  }
}
```

- [ ] **Step 2: Quick build check**

```bash
cd model-testing-app
npx next build 2>&1 | tail -5
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/batch-read-one.ts
git commit -m "feat(hubspot-webhook): batchReadOne helper for single-record fetches"
```

---

## Task 8: Next.js Bridge Endpoint /api/hubspot/webhook-process

**Files:**
- Create: `model-testing-app/src/app/api/hubspot/webhook-process/route.ts`

- [ ] **Step 1: Create the bridge route**

Create `model-testing-app/src/app/api/hubspot/webhook-process/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { fetchMutation } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import { fetchEngagementsForCompany } from '@/lib/hubspot/activities';
import { batchReadOne } from '@/lib/hubspot/batch-read-one';
import { batchReadCompaniesFull } from '@/lib/hubspot/companies';
import { resolveOwnerName } from '@/lib/hubspot/owners';
import {
  extractCustomProperties,
  generateHubSpotCompanyUrl,
  generateHubSpotContactUrl,
  generateHubSpotDealUrl,
} from '@/lib/hubspot/utils';

/**
 * Bridge endpoint the Convex processWebhookEvent action calls to do the
 * actual HubSpot fetch + Convex write. Lives in Next.js because it needs
 * the HubSpot lib code in src/lib/hubspot/* which Convex can't import.
 *
 * Auth: X-Cron-Secret header (same shared secret pattern as sync-all's
 * cron-auth bypass). Not a public endpoint — the webhook receiver itself
 * is public; this bridge is internal-only.
 *
 * Ten-minute lookback window for engagements is the "self-healing" design
 * choice — idempotent upsert makes re-reading recent history safe, and the
 * 10 min buffer catches delayed webhook deliveries without a per-company
 * watermark.
 */

export const maxDuration = 60; // Single-record fetches — plenty.

const OBJECT_TYPE_TO_NAME: Record<string, 'contact' | 'company' | 'deal'> = {
  '0-1': 'contact',
  '0-2': 'company',
  '0-3': 'deal',
};

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret');
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { action, objectType, objectId } = body ?? {};
  if (!action || !objectType || !objectId) {
    return NextResponse.json(
      { error: 'missing action / objectType / objectId' },
      { status: 400 },
    );
  }

  const typeName = OBJECT_TYPE_TO_NAME[objectType];

  try {
    if (action === 'engagement') {
      // Engagement refresh — only valid for companies.
      if (typeName !== 'company') {
        return NextResponse.json({
          ok: true,
          noop: true,
          reason: `engagement action on non-company type ${objectType}`,
        });
      }
      const sinceIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const engagements = await fetchEngagementsForCompany(objectId, Infinity, {
        since: sinceIso,
      });

      let synced = 0;
      let errors = 0;
      for (const eng of engagements) {
        try {
          const ownerName = eng.ownerId ? await resolveOwnerName(eng.ownerId) : null;
          await fetchMutation(api.hubspotSync.activities.syncActivityFromHubSpot, {
            hubspotActivityId: eng.id,
            activityType: eng.type,
            activityDate: eng.timestamp,
            subject: eng.subject,
            bodyPreview: eng.bodyPreview,
            bodyHtml: eng.bodyHtml,
            direction:
              eng.direction === 'inbound' || eng.direction === 'outbound'
                ? eng.direction
                : undefined,
            status: eng.status,
            duration: eng.duration,
            fromEmail: eng.fromEmail,
            toEmails: eng.toEmails,
            outcome: eng.outcome,
            metadata: eng.metadata,
            hubspotCompanyId: objectId,
            hubspotContactIds: eng.contactIds,
            hubspotDealIds: eng.dealIds,
            hubspotOwnerId: eng.ownerId,
            ownerName: ownerName ?? undefined,
          });
          synced++;
        } catch (err) {
          errors++;
          console.error('[webhook-process] engagement upsert failed', err);
        }
      }

      return NextResponse.json({
        ok: true,
        action,
        companyId: objectId,
        sinceIso,
        synced,
        errors,
      });
    }

    if (action === 'object') {
      // Fetch the single object and upsert via its sync mutation.
      if (!typeName) {
        return NextResponse.json({
          ok: false,
          error: `unknown objectType ${objectType}`,
        }, { status: 400 });
      }

      if (typeName === 'company') {
        const [company] = await batchReadCompaniesFull([objectId]);
        if (!company) {
          return NextResponse.json({ ok: true, noop: true, reason: 'company not found in HubSpot' });
        }
        const ownerName = company.properties?.hubspot_owner_id
          ? await resolveOwnerName(company.properties.hubspot_owner_id)
          : null;
        const customProperties = extractCustomProperties(company.properties ?? {});
        await fetchMutation(api.hubspotSync.companies.syncCompanyFromHubSpot, {
          hubspotCompanyId: String(company.id),
          name: company.properties?.name ?? 'Unknown',
          properties: company.properties ?? {},
          customProperties,
          hubspotUrl: await generateHubSpotCompanyUrl(String(company.id)),
          hubspotOwnerId: company.properties?.hubspot_owner_id,
          ownerName: ownerName ?? undefined,
          linkedContactHubspotIds: company.associations?.contacts?.results?.map((r: any) => String(r.id)) ?? [],
          linkedDealHubspotIds: company.associations?.deals?.results?.map((r: any) => String(r.id)) ?? [],
        } as any);
        return NextResponse.json({ ok: true, action, companyId: objectId, synced: 1 });
      }

      if (typeName === 'contact') {
        const contact = await batchReadOne('contacts', objectId);
        if (!contact) return NextResponse.json({ ok: true, noop: true });
        const ownerName = contact.properties?.hubspot_owner_id
          ? await resolveOwnerName(contact.properties.hubspot_owner_id)
          : null;
        await fetchMutation(api.hubspotSync.contacts.syncContactFromHubSpot, {
          hubspotContactId: String(contact.id),
          properties: contact.properties ?? {},
          hubspotUrl: await generateHubSpotContactUrl(String(contact.id)),
          hubspotOwnerId: contact.properties?.hubspot_owner_id,
          ownerName: ownerName ?? undefined,
          linkedCompanyHubspotIds: contact.associations?.companies?.results?.map((r: any) => String(r.id)) ?? [],
          linkedDealHubspotIds: contact.associations?.deals?.results?.map((r: any) => String(r.id)) ?? [],
        } as any);
        return NextResponse.json({ ok: true, action, contactId: objectId, synced: 1 });
      }

      if (typeName === 'deal') {
        const deal = await batchReadOne('deals', objectId);
        if (!deal) return NextResponse.json({ ok: true, noop: true });
        const ownerName = deal.properties?.hubspot_owner_id
          ? await resolveOwnerName(deal.properties.hubspot_owner_id)
          : null;
        await fetchMutation(api.hubspotSync.deals.syncDealFromHubSpot, {
          hubspotDealId: String(deal.id),
          properties: deal.properties ?? {},
          hubspotUrl: await generateHubSpotDealUrl(String(deal.id)),
          hubspotOwnerId: deal.properties?.hubspot_owner_id,
          ownerName: ownerName ?? undefined,
          linkedCompanyHubspotIds: deal.associations?.companies?.results?.map((r: any) => String(r.id)) ?? [],
          linkedContactHubspotIds: deal.associations?.contacts?.results?.map((r: any) => String(r.id)) ?? [],
        } as any);
        return NextResponse.json({ ok: true, action, dealId: objectId, synced: 1 });
      }
    }

    if (action === 'delete') {
      const result = await fetchMutation(api.hubspotSync.archive.archiveHubSpotRecord, {
        objectType,
        hubspotId: objectId,
      });
      return NextResponse.json({ ok: true, action, ...result });
    }

    return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('[webhook-process] handler error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Note on mutation signatures**

The exact argument shape for `syncCompanyFromHubSpot`, `syncContactFromHubSpot`, and `syncDealFromHubSpot` may differ from what's shown above — the `as any` cast is a placeholder that lets TypeScript accept the call. **After creating this file, inspect the mutation definitions** in:
- `model-testing-app/convex/hubspotSync/companies.ts`
- `model-testing-app/convex/hubspotSync/contacts.ts`
- `model-testing-app/convex/hubspotSync/deals.ts`

and adjust the argument objects passed from this route to match. The existing `sync-all/route.ts` calls these mutations too — use it as the reference for the canonical argument shape.

- [ ] **Step 3: Build check**

```bash
cd model-testing-app
npx next build 2>&1 | tail -10
```
Expected: build succeeds. If TypeScript complains about the mutation argument shape, fix per Step 2.

- [ ] **Step 4: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/app/api/hubspot/webhook-process/route.ts
git commit -m "feat(hubspot-webhook): /api/hubspot/webhook-process bridge endpoint"
```

---

## Task 9: Webhook Handler /api/hubspot/webhook

**Files:**
- Create: `model-testing-app/src/app/api/hubspot/webhook/route.ts`

- [ ] **Step 1: Create the handler**

Create `model-testing-app/src/app/api/hubspot/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { fetchMutation } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import { verifyV3 } from '@/lib/hubspot/webhook-verify';
import { dedupeEvents, type HubSpotWebhookEvent } from '@/lib/hubspot/dedupe-events';

export const runtime = 'nodejs'; // crypto + raw body need Node runtime
export const maxDuration = 10;   // handler should finish in <500ms; 10s is the HubSpot retry ceiling

/**
 * Inbound HubSpot webhook receiver.
 *
 * Steps:
 *   1. Read raw body — signature verify needs byte-exact input, so we do
 *      this BEFORE any JSON parse.
 *   2. Verify v3 HMAC-SHA256 signature + freshness.
 *   3. Parse events array, dedupe to unique (subscriptionType, objectId).
 *   4. Per unique event, call Convex enqueueWebhookEvent (which schedules
 *      the async worker).
 *   5. Return 200 with counts — HubSpot only cares about status code.
 *
 * Error policy: per-event failures are logged and swallowed. The batch
 * itself only returns non-200 on signature failure, malformed JSON, or
 * infrastructure issues (Convex down). HubSpot considers non-200 as
 * "whole batch failed" and retries — so swallowing per-event errors is
 * intentional, not a leak.
 */

const TARGET_URI =
  process.env.HUBSPOT_WEBHOOK_TARGET_URI ??
  'https://rockcap-v2.vercel.app/api/hubspot/webhook';

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  // 1. Raw body (must not JSON-parse first — signature is byte-exact)
  const rawBody = await request.text();

  // 2. Signature + freshness
  const signature = request.headers.get('x-hubspot-signature-v3');
  const timestamp = request.headers.get('x-hubspot-request-timestamp');

  if (!verifyV3(rawBody, timestamp, signature, TARGET_URI)) {
    console.warn(
      `[hubspot-webhook] signature verify failed — ` +
        `sig_present=${!!signature} ts_present=${!!timestamp} ts=${timestamp}`,
    );
    return NextResponse.json({ error: 'signature verification failed' }, { status: 401 });
  }

  // 3. Parse + dedupe
  let events: HubSpotWebhookEvent[];
  try {
    const parsed = JSON.parse(rawBody);
    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: 'body must be a JSON array' }, { status: 400 });
    }
    events = parsed as HubSpotWebhookEvent[];
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const unique = dedupeEvents(events);

  // 4. Enqueue each unique event
  let enqueued = 0;
  let enqueueErrors = 0;
  for (const event of unique) {
    try {
      await fetchMutation(api.hubspotSync.webhook.enqueueWebhookEvent, {
        subscriptionType: event.subscriptionType,
        objectType: event.objectTypeId,
        objectId: String(event.objectId),
        propertyName: event.propertyName,
        eventId: String(event.eventId),
        occurredAt: event.occurredAt,
      });
      enqueued++;
    } catch (err) {
      enqueueErrors++;
      console.error(
        `[hubspot-webhook] enqueue failed for event ${event.eventId}`,
        err,
      );
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[hubspot-webhook] received=${events.length} unique=${unique.length} ` +
      `enqueued=${enqueued} errors=${enqueueErrors} duration_ms=${durationMs}`,
  );

  // 5. Always return 200 once signature is verified — HubSpot treats non-2xx
  // as "retry the whole batch," which would resurrect already-enqueued work.
  return NextResponse.json({
    received: events.length,
    unique: unique.length,
    enqueued,
    errors: enqueueErrors,
  });
}
```

- [ ] **Step 2: Build check**

```bash
cd model-testing-app
npx next build 2>&1 | tail -10
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/app/api/hubspot/webhook/route.ts
git commit -m "feat(hubspot-webhook): /api/hubspot/webhook handler with v3 sig + dedup"
```

---

## Task 10: Middleware — Public Routes

**Files:**
- Modify: `model-testing-app/src/middleware.ts`

- [ ] **Step 1: Add the two new routes to isPublicRoute**

```diff
 const isPublicRoute = createRouteMatcher([
   // ... existing entries ...
   '/api/hubspot/sync-all(.*)',
+  // HubSpot webhooks: signed with HMAC, self-auths via signature verify.
+  // Public so Clerk doesn't 404-reject unauthenticated HubSpot requests.
+  '/api/hubspot/webhook(.*)',
+  // Bridge endpoint Convex actions call: self-auths via X-Cron-Secret.
+  '/api/hubspot/webhook-process(.*)',
 ])
```

- [ ] **Step 2: Build check**

```bash
cd model-testing-app
npx next build 2>&1 | tail -5
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/middleware.ts
git commit -m "feat(hubspot-webhook): middleware — expose webhook + webhook-process routes"
```

---

## Task 11: Integration Smoke Test — Webhook Handler

One end-to-end test using a crafted signed payload. Validates that the handler → dedup → (mocked) Convex enqueue wiring works.

**Files:**
- Create: `model-testing-app/src/lib/hubspot/__tests__/webhook-handler.test.ts`

- [ ] **Step 1: Write the integration test**

Create `model-testing-app/src/lib/hubspot/__tests__/webhook-handler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// Mock the Convex fetchMutation before importing the handler.
const fetchMutationMock = vi.fn().mockResolvedValue({ scheduled: true });
vi.mock('convex/nextjs', () => ({
  fetchMutation: (...args: any[]) => fetchMutationMock(...args),
}));

// The handler depends on the generated api; stub it out. The relative
// path is from THIS test file's location — vitest resolves module paths
// to absolute paths, so mocking this path matches the handler's import
// of the same absolute module (via a different relative path).
vi.mock('../../../../convex/_generated/api', () => ({
  api: { hubspotSync: { webhook: { enqueueWebhookEvent: 'stub-fn' } } },
}));

import { POST } from '../../../app/api/hubspot/webhook/route';

const SECRET = 'webhook-test-secret';
const URI = 'https://rockcap-v2.vercel.app/api/hubspot/webhook';

function sign(body: string, timestamp: string): string {
  return createHmac('sha256', SECRET)
    .update(`POST${URI}${body}${timestamp}`)
    .digest('base64');
}

function makeRequest(body: string, timestamp: string, signature: string): Request {
  return new Request(URI, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hubspot-request-timestamp': timestamp,
      'x-hubspot-signature-v3': signature,
    },
    body,
  });
}

describe('POST /api/hubspot/webhook', () => {
  beforeEach(() => {
    process.env.HUBSPOT_WEBHOOK_SECRET = SECRET;
    process.env.HUBSPOT_WEBHOOK_TARGET_URI = URI;
    fetchMutationMock.mockClear();
  });

  afterEach(() => {
    delete process.env.HUBSPOT_WEBHOOK_SECRET;
    delete process.env.HUBSPOT_WEBHOOK_TARGET_URI;
  });

  it('rejects 401 with bad signature', async () => {
    const ts = String(Date.now());
    const req = makeRequest('[]', ts, 'bogus-signature');
    const res = await POST(req as any);
    expect(res.status).toBe(401);
    expect(fetchMutationMock).not.toHaveBeenCalled();
  });

  it('accepts signed empty batch and returns counts=0', async () => {
    const body = '[]';
    const ts = String(Date.now());
    const req = makeRequest(body, ts, sign(body, ts));
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ received: 0, unique: 0, enqueued: 0 });
    expect(fetchMutationMock).not.toHaveBeenCalled();
  });

  it('dedupes and enqueues each unique event', async () => {
    const body = JSON.stringify([
      {
        eventId: 'e1',
        subscriptionType: 'company.propertyChange',
        objectTypeId: '0-2',
        objectId: 123,
        propertyName: 'name',
        occurredAt: 1000,
      },
      {
        // Duplicate key — should collapse
        eventId: 'e2',
        subscriptionType: 'company.propertyChange',
        objectTypeId: '0-2',
        objectId: 123,
        propertyName: 'name',
        occurredAt: 2000,
      },
      {
        eventId: 'e3',
        subscriptionType: 'contact.creation',
        objectTypeId: '0-1',
        objectId: 456,
        occurredAt: 1500,
      },
    ]);
    const ts = String(Date.now());
    const req = makeRequest(body, ts, sign(body, ts));
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(3);
    expect(json.unique).toBe(2);
    expect(json.enqueued).toBe(2);
    expect(fetchMutationMock).toHaveBeenCalledTimes(2);
  });

  it('returns 400 for malformed JSON (after sig passes)', async () => {
    const body = 'not json';
    const ts = String(Date.now());
    const req = makeRequest(body, ts, sign(body, ts));
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('swallows per-event enqueue errors and still returns 200', async () => {
    fetchMutationMock.mockRejectedValueOnce(new Error('convex down'));
    const body = JSON.stringify([
      {
        eventId: 'e1',
        subscriptionType: 'deal.creation',
        objectTypeId: '0-3',
        objectId: 1,
        occurredAt: 1000,
      },
    ]);
    const ts = String(Date.now());
    const req = makeRequest(body, ts, sign(body, ts));
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.enqueued).toBe(0);
    expect(json.errors).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd model-testing-app
npx vitest run src/lib/hubspot/__tests__/webhook-handler.test.ts
```
Expected: 5/5 PASS.

If tests fail with module resolution issues on the `@/app/api/hubspot/webhook/route` import, check `tsconfig.json` + `vitest.config.ts` path aliases. If tests fail because the Convex `api` mock path doesn't resolve, adjust the `vi.mock(...)` relative path to match how `route.ts` imports it.

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/src/lib/hubspot/__tests__/webhook-handler.test.ts
git commit -m "test(hubspot-webhook): integration test for handler — sig, dedup, enqueue, error policy"
```

---

## Task 12: Final Build + Push

- [ ] **Step 1: Full build from scratch**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx next build 2>&1 | tail -30
```
Expected: build succeeds. Look for the following routes in the build output:
- `ƒ /api/hubspot/webhook`
- `ƒ /api/hubspot/webhook-process`

- [ ] **Step 2: Full test suite**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app
npx vitest run
```
Expected: all tests pass, including the 3 new test files (webhook-verify, dedupe-events, webhook-handler).

- [ ] **Step 3: Push all commits**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git push
```

- [ ] **Step 4: User sets `HUBSPOT_WEBHOOK_SECRET` on Vercel (Production)**

- Go to HubSpot → Settings → Integrations → Private Apps → (RockCap app) → Auth tab
- Copy the "Client secret" (shown once on creation; reveal via eye icon)
- Vercel dashboard → this project → Settings → Environment Variables
- Add new var:
  - Name: `HUBSPOT_WEBHOOK_SECRET`
  - Value: (paste)
  - Environments: Production only
- Save, then Redeploy the latest production deployment (env-var changes don't take effect until the next deploy)

- [ ] **Step 5: User creates webhook subscriptions in HubSpot**

Follow the spec's §3 "HubSpot-Side Configuration" section — Target URL + all subscriptions (company/contact/deal create + propertyChange + deletion). Recommend starting narrow: enable only `company.propertyChange:notes_last_updated` first, watch the pipe for 30 min, then widen.

- [ ] **Step 6: Smoke test with a real event**

Once the narrow subscription is active:
1. Log a note on any company in HubSpot.
2. Within 30s, check Vercel logs: `[hubspot-webhook] received=1 unique=1 enqueued=1 ...`
3. Check Convex dashboard → Functions → `processWebhookEvent` — should show one successful run.
4. Check Convex dashboard → Data → `webhookEventLog` — should have one row with `status: 'completed'`.
5. Check the activity stream in RockCap — the note should now appear.

---

## Spec Coverage Check

- §1 Goal & success criteria — addressed by whole plan
- §2 Architecture — implemented across Tasks 6-10
- §3 HubSpot-side configuration — user action in Task 12 Step 5
- §4 Handler internals — Task 9 (+ Task 1 for signing, Task 2 for dedup)
- §5 Convex side — Task 6
- §6 Bridge endpoint — Task 8
- §7 Deletion handling — Tasks 3, 4, 5
- §8 Middleware — Task 10
- §9 Observability — emitted throughout (Vercel logs, Convex dashboard, webhookEventLog); explicit `webhookMissed` cron counter deferred (see gap below)
- §10 Testing — Tasks 1, 2, 11 (unit + integration); E2E is Task 12 Step 6
- §11 Rollout — Task 12 Step 5 starts narrow; spec's phases 3/4 happen incrementally user-side
- §12 Edge cases — all explicit "in scope" items handled; "out of scope" items deliberately not implemented
- §13 Files changed — matches plan's file structure section
- §14 Success metric — observable post-deploy via webhookEventLog queries

**Known gap: the `webhookMissed` counter in the cron's reconciliation sweep.** The spec describes this as "during cron sync, each upsert checks `lastHubSpotSync` vs. HubSpot's `modifieddate`." Implementing it touches `sync-all/route.ts` in several places and is more invasive than the rest of this plan. Recommend: ship this plan as-is, evaluate webhook health via the `webhookEventLog.status` distribution in Convex dashboard, and add `webhookMissed` as a follow-up logbook task once we have real data on how often webhooks miss deliveries. Not blocking for webhook rollout.
