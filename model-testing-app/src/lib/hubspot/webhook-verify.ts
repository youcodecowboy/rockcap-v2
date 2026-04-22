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
