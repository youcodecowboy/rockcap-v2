import { Client } from '@hubspot/api-client';
import { HubSpotDeal } from './types';
import { delay } from './utils';

/**
 * Fetch deals from HubSpot with pagination
 * Limits to 100 records initially as per requirements
 */
export async function fetchDealsFromHubSpot(
  client: Client,
  limit: number = 100,
  after?: string
): Promise<{ deals: HubSpotDeal[]; nextAfter?: string }> {
  try {
    const properties = [
      'dealname',
      'amount',
      'dealstage',
      'closedate',
      'pipeline',
      'hubspot_owner_id', // Deal owner
      'createdate',
      'lastmodifieddate',
      'hs_last_contacted_date', // Last contacted date
      'hs_last_activity_date', // Last activity date
      'hs_next_step',
      'dealtype',
      'description',
      'hs_deal_amount_calculation_preference',
      'hs_deal_currency_code',
      'hs_deal_probability',
      'hs_predicted_amount',
      'hs_deal_amount_calculation_preference',
      'deal_currency_code',
      'num_associated_contacts',
      'num_associated_companies',
      'total_revenue',
      'hs_analytics_source',
      'hs_analytics_source_data_1',
      'hs_analytics_source_data_2',
      'hs_campaign',
      'hs_analytics_first_touch_converting_campaign',
      'hs_analytics_last_touch_converting_campaign',
    ];
    
    // Use direct API calls instead of SDK to avoid "data is not iterable" errors
    // The SDK has serialization issues with deals API
    const apiKey = process.env.HUBSPOT_API_KEY;
    if (!apiKey) {
      throw new Error('HUBSPOT_API_KEY not found in environment variables');
    }
    
    const params = new URLSearchParams({
      limit: limit.toString(),
      properties: properties.join(','),
      associations: 'contacts,companies', // Request associations
    });
    if (after) {
      params.append('after', after);
    }
    
    const directResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!directResponse.ok) {
      const errorText = await directResponse.text();
      throw new Error(`Failed to fetch deals: ${directResponse.status} ${errorText}`);
    }
    
    const directData = await directResponse.json();
    
    // Debug: Log first deal to see structure
    if (directData.results && directData.results.length > 0) {
      console.log('Sample deal from HubSpot API:', {
        id: directData.results[0].id,
        createdAt: directData.results[0].createdAt,
        updatedAt: directData.results[0].updatedAt,
        properties: {
          createdate: directData.results[0].properties?.createdate,
          lastmodifieddate: directData.results[0].properties?.lastmodifieddate,
          amount: directData.results[0].properties?.amount,
        },
        associations: directData.results[0].associations,
      });
    }
    
    const response = {
      results: directData.results || [],
      paging: directData.paging,
    };
    
    // Handle case where response might not have results property
    if (!response) {
      console.error('Empty HubSpot deals response');
      return {
        deals: [],
        nextAfter: undefined,
      };
    }
    
    // Check if results exists and is iterable
    let results: any[] = [];
    if (response.results) {
      if (Array.isArray(response.results)) {
        results = response.results;
      } else if (typeof response.results === 'object') {
        // Might be a single object wrapped
        results = [response.results];
      } else {
        console.warn('Unexpected results format:', typeof response.results, response.results);
        results = [];
      }
    }
    
    if (results.length === 0) {
      return {
        deals: [],
        nextAfter: undefined,
      };
    }
    
    const deals: HubSpotDeal[] = results.map((deal: any) => {
      // Parse dates - direct API returns ISO strings, not Date objects
      // HubSpot API returns createdAt/updatedAt as ISO strings directly
      let createdAt: string;
      if (deal.createdAt) {
        // Direct API returns ISO string
        createdAt = typeof deal.createdAt === 'string' 
          ? deal.createdAt 
          : (deal.createdAt instanceof Date ? deal.createdAt.toISOString() : new Date().toISOString());
      } else if (deal.properties?.createdate) {
        // Parse from properties.createdate (timestamp in milliseconds)
        const createdateStr = String(deal.properties.createdate);
        const timestamp = parseInt(createdateStr);
        if (!isNaN(timestamp) && timestamp > 0) {
          // HubSpot timestamps are in milliseconds since epoch
          // If timestamp is suspiciously small (< year 2000), might be in seconds
          const date = timestamp < 946684800000 ? new Date(timestamp * 1000) : new Date(timestamp);
          if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
            createdAt = date.toISOString();
          } else {
            console.warn(`Invalid createdate timestamp for deal ${deal.id}: ${createdateStr}, parsed as ${date.toISOString()}`);
            createdAt = new Date().toISOString();
          }
        } else {
          createdAt = new Date().toISOString();
        }
      } else {
        createdAt = new Date().toISOString();
      }
      
      let updatedAt: string;
      // Prioritize deal.updatedAt from direct API (should be ISO string)
      if (deal.updatedAt) {
        // Direct API returns ISO string - use it directly
        if (typeof deal.updatedAt === 'string') {
          // Validate it's a valid ISO string
          const testDate = new Date(deal.updatedAt);
          if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
            updatedAt = deal.updatedAt;
          } else {
            console.warn(`Invalid updatedAt ISO string for deal ${deal.id}: ${deal.updatedAt}`);
            updatedAt = new Date().toISOString();
          }
        } else if (deal.updatedAt instanceof Date) {
          updatedAt = deal.updatedAt.toISOString();
        } else {
          updatedAt = new Date().toISOString();
        }
      } else if (deal.properties?.lastmodifieddate) {
        // Fallback to properties.lastmodifieddate (timestamp in milliseconds)
        const lastmodifiedStr = String(deal.properties.lastmodifieddate);
        const timestamp = parseInt(lastmodifiedStr);
        if (!isNaN(timestamp) && timestamp > 0) {
          // HubSpot timestamps are in milliseconds since epoch
          // If timestamp is suspiciously small (< year 2000), might be in seconds
          const date = timestamp < 946684800000 ? new Date(timestamp * 1000) : new Date(timestamp);
          if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
            updatedAt = date.toISOString();
          } else {
            console.warn(`Invalid lastmodifieddate timestamp for deal ${deal.id}: ${lastmodifiedStr} (${timestamp}), parsed as ${date.toISOString()}`);
            updatedAt = new Date().toISOString();
          }
        } else {
          console.warn(`Could not parse lastmodifieddate for deal ${deal.id}: ${lastmodifiedStr}`);
          updatedAt = new Date().toISOString();
        }
      } else {
        // No updatedAt available - use current time
        updatedAt = new Date().toISOString();
      }
      
      return {
        id: deal.id,
        properties: deal.properties || {},
        associations: deal.associations || {},
        createdAt,
        updatedAt,
      };
    });
    
    return {
      deals,
      nextAfter: response.paging?.next?.after,
    };
  } catch (error: any) {
    console.error('Error fetching deals from HubSpot:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
    });
    throw new Error(`Failed to fetch deals: ${error.message}`);
  }
}

/**
 * Fetch all deals (with pagination handling)
 * Respects rate limits by adding delays
 */
export async function fetchAllDealsFromHubSpot(
  client: Client,
  maxRecords: number = 100
): Promise<HubSpotDeal[]> {
  const allDeals: HubSpotDeal[] = [];
  let after: string | undefined;
  let fetched = 0;
  
  while (fetched < maxRecords) {
    const remaining = maxRecords - fetched;
    const batchSize = Math.min(remaining, 100); // HubSpot max per request
    
    const { deals, nextAfter } = await fetchDealsFromHubSpot(
      client,
      batchSize,
      after
    );
    
    allDeals.push(...deals);
    fetched += deals.length;
    
    if (!nextAfter || deals.length === 0) {
      break; // No more records
    }
    
    after = nextAfter;
    
    // Rate limiting: wait 100ms between requests
    if (nextAfter) {
      await delay(100);
    }
  }
  
  return allDeals;
}

