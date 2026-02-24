// =============================================================================
// RETRY UTILITY FOR API CALLS
// =============================================================================

import { RETRY_CONFIG } from '../config';

/**
 * Fetch with exponential backoff retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string = 'API'
): Promise<Response> {
  let lastError: Error | null = null;
  let delay: number = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Check for rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
        console.warn(`[${label}] Rate limited (429), waiting ${waitTime}ms before retry ${attempt}/${RETRY_CONFIG.maxRetries}`);
        await sleep(waitTime);
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
        continue;
      }

      // Check for server errors (5xx)
      if (response.status >= 500) {
        console.warn(`[${label}] Server error (${response.status}), retry ${attempt}/${RETRY_CONFIG.maxRetries}`);
        await sleep(delay);
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[${label}] Request failed: ${lastError.message}, retry ${attempt}/${RETRY_CONFIG.maxRetries}`);

      if (attempt < RETRY_CONFIG.maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
      }
    }
  }

  throw lastError || new Error(`[${label}] All ${RETRY_CONFIG.maxRetries} retry attempts failed`);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse JSON response with markdown code block handling
 */
export function parseJsonResponse(content: string): any | null {
  if (!content) return null;

  let jsonContent = content.trim();

  // Remove markdown code blocks
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
  }

  // Try to find JSON object or array
  const jsonMatch = jsonContent.match(/[\[{][\s\S]*[\]}]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }

  return null;
}
