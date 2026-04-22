/**
 * HubSpot owner resolution. Owners (users) are referenced by ID on companies/deals/contacts;
 * we resolve to a display name at sync time and cache the result for the sync run.
 */

import { getHubspotApiKey } from './http';

const cache = new Map<string, string | null>();

export function clearOwnersCache(): void {
  cache.clear();
}

export async function resolveOwnerName(
  ownerId: string | undefined | null,
): Promise<string | null> {
  if (!ownerId) return null;
  if (cache.has(ownerId)) return cache.get(ownerId)!;

  try {
    // If the key is missing, getHubspotApiKey throws — caught below and
    // we fall back to null so one missing credential doesn't kill the
    // whole engagement sync.
    const apiKey = getHubspotApiKey();
    const res = await fetch(`https://api.hubapi.com/crm/v3/owners/${ownerId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      cache.set(ownerId, null);
      return null;
    }

    const data = (await res.json()) as {
      firstName?: string;
      lastName?: string;
      email?: string;
    };

    const parts = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    const name = parts || data.email || null;
    cache.set(ownerId, name);
    return name;
  } catch {
    cache.set(ownerId, null);
    return null;
  }
}
