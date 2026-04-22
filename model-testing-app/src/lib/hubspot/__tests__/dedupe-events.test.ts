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
