/**
 * HubSpot OAuth client credentials flow for server-to-server authentication
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const CLIENT_ID = 'dae80117-e95e-4080-9b7e-4708ff09dfc3';
const CLIENT_SECRET = '43aa35a3-dcb4-4741-b3e8-6a77419d9726';

let cachedAccessToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get access token using OAuth client credentials
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  // Request new token
  const response = await fetch(`${HUBSPOT_API_BASE}/oauth/v1/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early

  return cachedAccessToken;
}

/**
 * Make authenticated request to HubSpot API
 */
async function makeHubSpotRequest(endpoint: string, options: RequestInit = {}) {
  const accessToken = await getAccessToken();
  const url = `${HUBSPOT_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
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

export async function fetchContactsOAuth(
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

export async function fetchCompaniesOAuth(
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

export async function fetchDealsOAuth(
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

export async function testAuthOAuth(): Promise<{ success: boolean; message: string }> {
  try {
    await makeHubSpotRequest('/crm/v3/objects/contacts?limit=1');
    return { success: true, message: 'OAuth authentication successful!' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

