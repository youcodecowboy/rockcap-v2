/**
 * Shared fetch wrapper for HubSpot API calls.
 *
 * Handles the two recurring pain points when talking to HubSpot's REST API:
 *   1. 429 Too Many Requests — retry with exponential backoff, honouring the
 *      Retry-After header when HubSpot sends it.
 *   2. Transient 5xx — retry once with a short delay.
 *
 * Auth, JSON encoding, and error shaping are kept minimal on purpose — callers
 * still read the response body themselves so existing fetchers can continue to
 * do their own error formatting.
 */

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 1000;

export interface HubSpotFetchOptions extends RequestInit {
  /** Max retry attempts for 429/5xx. Default 3. */
  maxRetries?: number;
  /** Initial backoff in ms; doubles each retry. Default 1000. */
  initialBackoffMs?: number;
  /** Disable retry (pass-through to fetch). */
  noRetry?: boolean;
}

/**
 * HubSpot API wrapper. Handles 429 with exponential backoff + Retry-After.
 *
 * Callers receive the raw Response — check res.ok themselves. Errors are
 * thrown only for: network failure, or 429 persisting after all retries
 * (thrown with status 429 so caller can distinguish).
 */
export async function hubspotFetch(
  url: string,
  options: HubSpotFetchOptions = {},
): Promise<Response> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialBackoffMs = DEFAULT_BACKOFF_MS,
    noRetry = false,
    ...init
  } = options;

  let attempt = 0;
  let lastResponse: Response | null = null;

  while (attempt <= maxRetries) {
    const res = await fetch(url, init);
    lastResponse = res;

    // Success — or a 4xx that isn't 429 (caller handles).
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
      return res;
    }

    // 429: respect Retry-After if present, else exponential backoff.
    if (res.status === 429) {
      if (noRetry || attempt === maxRetries) {
        console.warn(
          `[hubspotFetch] 429 persisted after ${attempt} retries: ${url}`,
        );
        return res;
      }
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfterMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : initialBackoffMs * Math.pow(2, attempt);
      console.warn(
        `[hubspotFetch] 429 on attempt ${attempt + 1}/${maxRetries + 1}; ` +
          `sleeping ${retryAfterMs}ms before retry: ${url}`,
      );
      await new Promise((r) => setTimeout(r, retryAfterMs));
      attempt++;
      continue;
    }

    // 5xx: one retry with initial backoff, then give up.
    if (res.status >= 500 && !noRetry && attempt < 1) {
      console.warn(
        `[hubspotFetch] ${res.status} on attempt ${attempt + 1}; retrying once in ${initialBackoffMs}ms: ${url}`,
      );
      await new Promise((r) => setTimeout(r, initialBackoffMs));
      attempt++;
      continue;
    }

    // Non-retryable or retries exhausted.
    return res;
  }

  // Should be unreachable — loop exits via returns above.
  return lastResponse as Response;
}

/**
 * Convenience: throw on non-2xx, otherwise return parsed JSON.
 * Use this when you just want the body and have no interest in the raw Response.
 */
export async function hubspotFetchJson<T = any>(
  url: string,
  options: HubSpotFetchOptions = {},
): Promise<T> {
  const res = await hubspotFetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HubSpot ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}
