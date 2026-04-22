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
