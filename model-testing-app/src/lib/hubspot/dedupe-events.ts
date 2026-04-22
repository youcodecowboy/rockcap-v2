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
