/**
 * Direct HubSpot API client using fetch and Personal Access Key
 * This bypasses the SDK to work with Personal Access Keys
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

async function makeHubSpotRequest(endpoint: string, options: RequestInit = {}) {
  const apiKey = process.env.HUBSPOT_API_KEY;
  
  if (!apiKey) {
    throw new Error('HUBSPOT_API_KEY not found in environment variables');
  }

  const url = `${HUBSPOT_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot API Error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export interface HubSpotContact {
  id: string;
  properties: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotCompany {
  id: string;
  properties: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotDeal {
  id: string;
  properties: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  associations?: {
    companies?: { results: Array<{ id: string }> };
  };
}

export interface PaginatedResponse<T> {
  results: T[];
  paging?: {
    next?: {
      after: string;
    };
  };
}

/**
 * Fetch contacts from HubSpot
 */
export async function fetchContactsDirect(
  limit: number = 100,
  after?: string
): Promise<PaginatedResponse<HubSpotContact>> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    properties: 'email,firstname,lastname,phone,company,lifecyclestage,hs_object_id',
  });
  
  if (after) {
    params.append('after', after);
  }

  return makeHubSpotRequest(`/crm/v3/objects/contacts?${params}`);
}

/**
 * Fetch companies from HubSpot
 */
export async function fetchCompaniesDirect(
  limit: number = 100,
  after?: string
): Promise<PaginatedResponse<HubSpotCompany>> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    properties: 'name,domain,industry,city,state,country,lifecyclestage,hs_object_id',
  });
  
  if (after) {
    params.append('after', after);
  }

  return makeHubSpotRequest(`/crm/v3/objects/companies?${params}`);
}

/**
 * Fetch deals from HubSpot
 */
export async function fetchDealsDirect(
  limit: number = 100,
  after?: string
): Promise<PaginatedResponse<HubSpotDeal>> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    properties: 'dealname,amount,closedate,dealstage,pipeline,hs_object_id',
    associations: 'companies',
  });
  
  if (after) {
    params.append('after', after);
  }

  return makeHubSpotRequest(`/crm/v3/objects/deals?${params}`);
}

/**
 * Test authentication
 */
export async function testAuthDirect(): Promise<{ success: boolean; message: string }> {
  try {
    await makeHubSpotRequest('/crm/v3/objects/contacts?limit=1');
    return { success: true, message: 'Authentication successful!' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

