import { Client } from '@hubspot/api-client';
import { HubSpotContact } from './types';
import { delay } from './utils';
import { fetchEntitiesModifiedSince } from './incremental';
import { getHubspotApiKey } from './http';

/**
 * Property list requested from HubSpot for every contact sync.
 * Exported so the incremental (search-based) path can ask HubSpot for
 * exactly the same columns the full-list path returns.
 */
export const CONTACT_PROPERTIES = [
      'email',
      'firstname',
      'lastname',
      'phone',
      'mobilephone',
      'company',
      'jobtitle',
      'lifecyclestage',
      'hubspot_owner_id', // Contact owner
      'createdate',
      'lastmodifieddate',
      'lastcontacteddate', // Last contacted date (legacy property)
      'hs_last_contacted_date', // Last contacted date (new property)
      'hs_last_activity_date', // Last activity date
      'hs_lead_status',
      'hs_analytics_first_visit_timestamp',
      'hs_analytics_last_visit_timestamp',
      'hs_email_domain',
      'hs_email_quarantined',
      'hs_email_quarantined_reason',
      'hs_email_bounce',
      'hs_email_optout',
      'hs_email_open',
      'hs_email_click',
      'hs_email_last_engagement_date',
      'hs_analytics_num_visits',
      'hs_analytics_num_page_views',
      'hs_analytics_num_event_completions',
      'hs_analytics_first_touch_converting_campaign',
      'hs_analytics_last_touch_converting_campaign',
      'num_associated_deals',
      'num_associated_companies',
      'recent_deal_amount',
      'recent_deal_close_date',
      'total_revenue',
      'num_contacted_notes',
      'num_notes',
      'num_notes_next_contact_date',
      'next_activity_date',
      'num_notes_last_contacted',
      'notes_last_contacted',
      'notes_last_updated',
      'hublead_linkedin_public_identifier',
    ];

/**
 * Fetch contacts from HubSpot with pagination
 * Limits to 100 records initially as per requirements
 */
export async function fetchContactsFromHubSpot(
  client: Client,
  limit: number = 100,
  after?: string
): Promise<{ contacts: HubSpotContact[]; nextAfter?: string }> {
  try {
    const properties = CONTACT_PROPERTIES;

    // Use direct API calls instead of SDK to avoid "data is not iterable" errors
    // The SDK has serialization issues with contacts API
    const apiKey = getHubspotApiKey();

    const params = new URLSearchParams({
      limit: limit.toString(),
      properties: properties.join(','),
      associations: 'companies,deals', // Request associations
    });
    if (after) {
      params.append('after', after);
    }
    
    const directResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!directResponse.ok) {
      const errorText = await directResponse.text();
      throw new Error(`Failed to fetch contacts: ${directResponse.status} ${errorText}`);
    }
    
    const directData = await directResponse.json();
    
    console.log('[HubSpot Contacts] Response received:', {
      hasResults: !!directData.results,
      resultsCount: directData.results?.length || 0,
      hasPaging: !!directData.paging,
      pagingNext: directData.paging?.next?.after ? `${directData.paging.next.after.substring(0, 20)}...` : 'none',
      pagingPrev: directData.paging?.prev?.after ? `${directData.paging.prev.after.substring(0, 20)}...` : 'none',
    });
    
    // Handle case where response might not have results property
    if (!directData || !directData.results) {
      console.warn('Empty HubSpot contacts response');
      return {
        contacts: [],
        nextAfter: undefined,
      };
    }
    
    // Check if results exists and is iterable
    let results: any[] = [];
    if (directData.results) {
      if (Array.isArray(directData.results)) {
        results = directData.results;
      } else if (typeof directData.results === 'object') {
        // Might be a single object wrapped
        results = [directData.results];
      } else {
        console.warn('Unexpected results format:', typeof directData.results, directData.results);
        results = [];
      }
    }
    
    if (results.length === 0) {
      return {
        contacts: [],
        nextAfter: undefined,
      };
    }
    
    const contacts: HubSpotContact[] = results.map((contact: any) => {
      // Parse dates - direct API returns ISO strings, not Date objects
      let createdAt: string;
      if (contact.createdAt) {
        createdAt = typeof contact.createdAt === 'string' 
          ? contact.createdAt 
          : (contact.createdAt instanceof Date ? contact.createdAt.toISOString() : new Date().toISOString());
      } else if (contact.properties?.createdate) {
        // Parse from properties.createdate (timestamp in milliseconds)
        const createdateStr = String(contact.properties.createdate);
        const timestamp = parseInt(createdateStr);
        if (!isNaN(timestamp) && timestamp > 0) {
          const date = timestamp < 946684800000 ? new Date(timestamp * 1000) : new Date(timestamp);
          if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
            createdAt = date.toISOString();
          } else {
            createdAt = new Date().toISOString();
          }
        } else {
          createdAt = new Date().toISOString();
        }
      } else {
        createdAt = new Date().toISOString();
      }
      
      let updatedAt: string;
      if (contact.updatedAt) {
        if (typeof contact.updatedAt === 'string') {
          const testDate = new Date(contact.updatedAt);
          if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
            updatedAt = contact.updatedAt;
          } else {
            updatedAt = new Date().toISOString();
          }
        } else if (contact.updatedAt instanceof Date) {
          updatedAt = contact.updatedAt.toISOString();
        } else {
          updatedAt = new Date().toISOString();
        }
      } else if (contact.properties?.lastmodifieddate) {
        // Fallback to properties.lastmodifieddate (timestamp in milliseconds)
        const lastmodifiedStr = String(contact.properties.lastmodifieddate);
        const timestamp = parseInt(lastmodifiedStr);
        if (!isNaN(timestamp) && timestamp > 0) {
          const date = timestamp < 946684800000 ? new Date(timestamp * 1000) : new Date(timestamp);
          if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
            updatedAt = date.toISOString();
          } else {
            updatedAt = new Date().toISOString();
          }
        } else {
          updatedAt = new Date().toISOString();
        }
      } else {
        updatedAt = new Date().toISOString();
      }
      
      return {
        id: contact.id,
        properties: contact.properties || {},
        associations: contact.associations || {},
        createdAt,
        updatedAt,
      };
    });
    
    return {
      contacts,
      nextAfter: directData.paging?.next?.after,
    };
  } catch (error: any) {
    console.error('Error fetching contacts from HubSpot:', error);
    throw new Error(`Failed to fetch contacts: ${error.message}`);
  }
}

/**
 * Parse the mixed timestamp shapes HubSpot returns into ISO strings.
 * Shared between list-endpoint and batch-read response mapping.
 */
function parseContactTimestamps(raw: any): { createdAt: string; updatedAt: string } {
  const parse = (v: any, propFallback: any): string => {
    if (v) {
      if (typeof v === 'string') {
        const d = new Date(v);
        if (!isNaN(d.getTime()) && d.getFullYear() > 1970) return v;
      }
      if (v instanceof Date) return v.toISOString();
    }
    if (propFallback) {
      const ts = parseInt(String(propFallback), 10);
      if (!isNaN(ts) && ts > 0) {
        const d = ts < 946684800000 ? new Date(ts * 1000) : new Date(ts);
        if (!isNaN(d.getTime()) && d.getFullYear() > 1970) return d.toISOString();
      }
    }
    return new Date().toISOString();
  };
  return {
    createdAt: parse(raw.createdAt, raw.properties?.createdate),
    updatedAt: parse(raw.updatedAt, raw.properties?.lastmodifieddate),
  };
}

/**
 * Fetch all contacts (with pagination handling)
 * Respects rate limits by adding delays.
 *
 * When `options.since` is supplied, uses the HubSpot search API to fetch ONLY
 * contacts modified on or after that timestamp, then hydrates them via
 * batch-read.
 */
export async function fetchAllContactsFromHubSpot(
  client: Client,
  maxRecords: number = Number.POSITIVE_INFINITY,
  options: { since?: string } = {}
): Promise<HubSpotContact[]> {
  if (options.since) {
    console.log(`[HubSpot Contacts] Incremental mode: fetching contacts modified since ${options.since}`);
    const raw = await fetchEntitiesModifiedSince(
      'contacts',
      options.since,
      CONTACT_PROPERTIES,
      ['companies', 'deals']
    );
    const contacts: HubSpotContact[] = raw.map((r: any) => ({
      id: r.id,
      properties: r.properties || {},
      associations: r.associations || {},
      ...parseContactTimestamps(r),
    }));
    console.log(`[HubSpot Contacts] Incremental fetch complete: ${contacts.length} contacts`);
    return maxRecords === Number.POSITIVE_INFINITY ? contacts : contacts.slice(0, maxRecords);
  }
  const allContacts: HubSpotContact[] = [];
  let after: string | undefined;
  let fetched = 0;
  let pageCount = 0;
  
  console.log(`[HubSpot Contacts] Starting pagination fetch, maxRecords: ${maxRecords === Number.POSITIVE_INFINITY ? 'unlimited' : maxRecords}`);
  
  while (fetched < maxRecords) {
    pageCount++;
    const remaining = maxRecords - fetched;
    const batchSize = Math.min(remaining, 100); // HubSpot max per request
    
    console.log(`[HubSpot Contacts] Page ${pageCount}: Fetching ${batchSize} contacts${after ? ` (after: ${after.substring(0, 20)}...)` : ' (first page)'}`);
    
    const { contacts, nextAfter } = await fetchContactsFromHubSpot(
      client,
      batchSize,
      after
    );
    
    console.log(`[HubSpot Contacts] Page ${pageCount}: Received ${contacts.length} contacts${nextAfter ? `, nextAfter: ${nextAfter.substring(0, 20)}...` : ', no more pages'}`);
    
    allContacts.push(...contacts);
    fetched += contacts.length;
    
    // If we got fewer contacts than requested and there's no nextAfter, we're done
    if (!nextAfter) {
      console.log(`[HubSpot Contacts] No more pages available. Total fetched: ${fetched}`);
      break;
    }
    
    // If we got 0 contacts, we're done
    if (contacts.length === 0) {
      console.log(`[HubSpot Contacts] Received 0 contacts, stopping pagination. Total fetched: ${fetched}`);
      break;
    }
    
    // Update pagination token
    after = nextAfter;
    
    // Rate limiting: wait 100ms between requests
    await delay(100);
  }
  
  console.log(`[HubSpot Contacts] Pagination complete. Total contacts fetched: ${fetched} (requested: ${maxRecords})`);
  
  return allContacts;
}

