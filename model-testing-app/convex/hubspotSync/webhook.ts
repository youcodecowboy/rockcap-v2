import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction, internalMutation, mutation } from '../_generated/server';

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
 *
 * Exported as `mutation` (not `internalMutation`) because it's invoked via
 * fetchMutation from the Next.js /api/hubspot/webhook route — HubSpot's
 * signature check gates access, so no Convex-side auth needed. All other
 * functions in this file remain internal.
 */
export const enqueueWebhookEvent = mutation({
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
