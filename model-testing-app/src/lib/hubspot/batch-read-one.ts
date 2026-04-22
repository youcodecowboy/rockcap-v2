/**
 * Fetch a single HubSpot record by ID via the batch-read endpoint.
 *
 * Used by the webhook-process bridge to hydrate one contact/deal/company
 * after a *.creation or *.propertyChange event. For companies we defer to
 * the existing batchReadCompaniesFull() which handles the full custom-
 * property discovery. Contacts and deals get the streamlined helper here
 * — we only need the canonical property list the sync mutations consume.
 */

import { getHubspotApiKey, hubspotFetchJson } from './http';
import { CONTACT_PROPERTIES } from './contacts';
import { DEAL_PROPERTIES } from './deals';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

type HubSpotObjectType = 'contacts' | 'deals';

/**
 * Batch-read a single record. Returns null if HubSpot says it doesn't exist
 * (404 on the underlying request — can happen if the record was deleted
 * before we got around to fetching the create event).
 */
export async function batchReadOne(
  objectType: HubSpotObjectType,
  id: string,
): Promise<any | null> {
  const apiKey = getHubspotApiKey();

  const properties =
    objectType === 'contacts' ? CONTACT_PROPERTIES : DEAL_PROPERTIES;
  const associations =
    objectType === 'contacts'
      ? ['companies', 'deals']
      : ['contacts', 'companies'];

  const url = new URL(`${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/batch/read`);
  url.searchParams.set('associations', associations.join(','));

  try {
    const res = await hubspotFetchJson<{ results?: any[] }>(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [{ id }],
        properties,
      }),
    });

    return res.results?.[0] ?? null;
  } catch (err: any) {
    // hubspotFetchJson throws on non-2xx; 404 here is meaningful (record
    // gone) and should propagate as null rather than throw.
    if (/404/.test(err?.message ?? '')) return null;
    throw err;
  }
}
