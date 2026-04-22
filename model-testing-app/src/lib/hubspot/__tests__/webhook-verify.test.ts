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
