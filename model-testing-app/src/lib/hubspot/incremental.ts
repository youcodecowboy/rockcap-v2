/**
 * Incremental-sync helpers for HubSpot.
 *
 * The default fetchers (fetchAllCompaniesFromHubSpot, fetchAllContactsFromHubSpot,
 * fetchAllDealsFromHubSpot) iterate the entire library — that's 2600+ companies
 * and 4200+ contacts, taking hours on first run.  This module provides a
 * search-based "modified since X" variant so subsequent syncs only touch
 * changed records.
 *
 * Strategy:
 *   1. POST /crm/v3/objects/{type}/search with a filter on hs_lastmodifieddate.
 *   2. Page through the IDs of changed records.
 *   3. Batch-read each page (GET /crm/v3/objects/{type}/batch/read, up to 100 per
 *      call) with the full property list + associations — matches the shape
 *      the existing sync mutations expect.
 *
 * Why not just use the search response directly?
 *   - HubSpot's search endpoint returns `properties` but not `associations`.
 *   - batch-read accepts `associations` in its body payload, so we fetch IDs
 *     from search and hydrate the full record via batch-read in one round-trip
 *     per page.
 */

import { hubspotFetch, hubspotFetchJson, getHubspotApiKey } from './http';

const BASE = 'https://api.hubapi.com';
const SEARCH_LIMIT = 100; // HubSpot's max for search
const BATCH_READ_LIMIT = 100; // HubSpot's max for batch-read

export type HubSpotEntityType = 'companies' | 'contacts' | 'deals';

/**
 * Return all HubSpot IDs of records modified on-or-after `since`.
 * `since` is an ISO string or ms-epoch string — HubSpot accepts either.
 */
export async function fetchModifiedIds(
  type: HubSpotEntityType,
  since: string,
): Promise<string[]> {
  const apiKey = getHubspotApiKey();

  // HubSpot's search API wants ms-epoch as a string.
  const sinceMs = /^\d+$/.test(since)
    ? since
    : String(new Date(since).getTime());

  const ids: string[] = [];
  let after: string | undefined;
  let pageCount = 0;

  while (true) {
    pageCount++;
    const body = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'hs_lastmodifieddate',
              operator: 'GTE',
              value: sinceMs,
            },
          ],
        },
      ],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      properties: ['hs_object_id'], // We only need IDs here; full records come via batch-read.
      limit: SEARCH_LIMIT,
      ...(after ? { after } : {}),
    };

    const res = await hubspotFetchJson<{
      results?: { id: string }[];
      paging?: { next?: { after?: string } };
      total?: number;
    }>(`${BASE}/crm/v3/objects/${type}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const page = res.results ?? [];
    ids.push(...page.map((r) => r.id));

    console.log(
      `[HubSpot Incremental ${type}] search page ${pageCount}: ${page.length} ids (total so far: ${ids.length}${res.total !== undefined ? ` / reported total ${res.total}` : ''})`,
    );

    const nextAfter = res.paging?.next?.after;
    if (!nextAfter || page.length === 0) break;
    after = nextAfter;

    // Respectful pacing — HubSpot search has a tighter limit than the v3 list API.
    await new Promise((r) => setTimeout(r, 150));
  }

  return ids;
}

/**
 * Hydrate a list of HubSpot IDs into full records using batch-read, with the
 * supplied properties + associations. Returns records in the same shape the
 * list endpoint would: `{ id, properties, associations, createdAt, updatedAt }`.
 */
export async function batchReadRecords(
  type: HubSpotEntityType,
  ids: string[],
  properties: string[],
  associations: ('companies' | 'contacts' | 'deals')[] = [],
): Promise<any[]> {
  const apiKey = getHubspotApiKey();

  if (ids.length === 0) return [];

  const results: any[] = [];
  for (let i = 0; i < ids.length; i += BATCH_READ_LIMIT) {
    const slice = ids.slice(i, i + BATCH_READ_LIMIT);

    const url = new URL(`${BASE}/crm/v3/objects/${type}/batch/read`);
    // batch-read returns properties per request body. Associations are fetched
    // separately via the `associations` query param, which accepts comma-list.
    if (associations.length > 0) {
      url.searchParams.set('associations', associations.join(','));
    }

    const res = await hubspotFetchJson<{ results?: any[] }>(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: slice.map((id) => ({ id })),
        properties,
      }),
    });

    results.push(...(res.results ?? []));
    console.log(
      `[HubSpot Incremental ${type}] batch-read ${slice.length} ids (cumulative: ${results.length}/${ids.length})`,
    );

    // Gentle pacing between batch pages.
    if (i + BATCH_READ_LIMIT < ids.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return results;
}

/**
 * Convenience: fetch all records of `type` modified since `since`, returned
 * in the same shape as the existing list-based fetchers.
 *
 * Caller must pass the property list appropriate for the entity type.
 */
export async function fetchEntitiesModifiedSince(
  type: HubSpotEntityType,
  since: string,
  properties: string[],
  associations: ('companies' | 'contacts' | 'deals')[] = [],
): Promise<any[]> {
  const ids = await fetchModifiedIds(type, since);
  if (ids.length === 0) return [];
  return batchReadRecords(type, ids, properties, associations);
}

/**
 * Companies whose `notes_last_updated` is on/after `since`. This is the
 * property HubSpot exposes for filter/sort in the search API — its sibling
 * `hs_last_activity_date` is readable via GET but rejects with a generic
 * HTTP 400 when used in a search filterGroup on this portal (confirmed via
 * isolation tests: hs_lastmodifieddate works, hs_last_activity_date 400s
 * with the same body, notes_last_updated works). Semantically it's the
 * same signal — "most recent note/engagement on this company."
 *
 * Distinct from `fetchModifiedIds('companies', since)` — the latter filters
 * on `hs_lastmodifieddate` which flips on ANY property edit (including our
 * own sync writes), so it would return every company we touched last cycle.
 * This one only triggers on real engagement activity (emails, meetings,
 * calls, notes, tasks) — exactly the set we want to walk for incremental
 * engagement repair.
 */
export async function fetchCompanyIdsWithNotesUpdatedSince(
  since: string,
): Promise<string[]> {
  const apiKey = getHubspotApiKey();

  const sinceMs = /^\d+$/.test(since)
    ? since
    : String(new Date(since).getTime());

  const ids: string[] = [];
  let after: string | undefined;
  let pageCount = 0;

  while (true) {
    pageCount++;
    const body = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'notes_last_updated',
              operator: 'GTE',
              value: sinceMs,
            },
          ],
        },
      ],
      sorts: [
        { propertyName: 'notes_last_updated', direction: 'DESCENDING' },
      ],
      properties: ['hs_object_id'],
      limit: SEARCH_LIMIT,
      ...(after ? { after } : {}),
    };

    const res = await hubspotFetchJson<{
      results?: { id: string }[];
      paging?: { next?: { after?: string } };
      total?: number;
    }>(`${BASE}/crm/v3/objects/companies/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const page = res.results ?? [];
    ids.push(...page.map((r) => r.id));

    console.log(
      `[HubSpot CompaniesWithNotesUpdated] search page ${pageCount}: ` +
      `${page.length} ids (total so far: ${ids.length}` +
      `${res.total !== undefined ? ` / reported total ${res.total}` : ''})`,
    );

    const nextAfter = res.paging?.next?.after;
    if (!nextAfter || page.length === 0) break;
    after = nextAfter;
    await new Promise((r) => setTimeout(r, 150));
  }

  return ids;
}

// hubspotFetch is re-exported for convenience when callers only want the HTTP wrapper.
export { hubspotFetch, hubspotFetchJson };
