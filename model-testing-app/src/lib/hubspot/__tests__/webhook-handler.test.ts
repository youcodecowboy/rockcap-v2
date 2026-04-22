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

import { POST } from '@/app/api/hubspot/webhook/route';

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
