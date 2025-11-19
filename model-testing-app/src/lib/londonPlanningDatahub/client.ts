/**
 * London Planning Datahub API Client
 * 
 * Client for planningdata.london.gov.uk - London-wide planning data
 * Base URL: https://planningdata.london.gov.uk/api-guest/
 * 
 * Requires header: X-API-AllowRequest: be2rmRnt&
 */

import {
  createRateLimiter,
  getRateLimitFromEnv,
} from '../rateLimit/rateLimiter';

const BASE_URL = 'https://planningdata.london.gov.uk/api-guest';
const API_ALLOW_HEADER = 'be2rmRnt&';

// Default rate limit: 30 requests per minute
const DEFAULT_RATE_LIMIT = getRateLimitFromEnv(
  'LONDON_DATAHUB_RATE_LIMIT',
  30
);

// Create rate limiter instance
const rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT, 'LondonDatahubAPI');

/**
 * Raw planning application data from London Datahub
 */
export interface LondonPlanningApplicationRaw {
  reference?: string; // Application reference
  id?: string; // Entity ID
  application_number?: string;
  application_type?: string;
  status?: string;
  decision?: string; // e.g., "approved", "refused"
  decision_date?: string; // ISO date string
  received_date?: string; // ISO date string
  validated_date?: string; // ISO date string
  local_authority?: string;
  borough?: string;
  site_address?: string;
  postcode?: string;
  applicant_name?: string;
  applicant_organisation?: string;
  agent_name?: string;
  agent_organisation?: string;
  description?: string;
  geometry?: any; // GeoJSON or other geometry data
  [key: string]: any; // Allow additional fields
}

/**
 * Search London planning applications by organisation name and postcodes
 * 
 * @param orgName - Organisation/company name to search for
 * @param postcodes - Array of postcodes to filter by
 * @returns Array of planning applications
 */
export async function searchLondonApplications(
  orgName: string,
  postcodes: string[]
): Promise<LondonPlanningApplicationRaw[]> {
  const allResults: LondonPlanningApplicationRaw[] = [];
  
  // Search by organisation name
  if (orgName && orgName.trim()) {
    try {
      const orgResults = await searchByOrganisation(orgName.trim());
      allResults.push(...orgResults);
    } catch (error) {
      console.error(`Error searching London by organisation "${orgName}":`, error);
    }
  }

  // Search by postcodes
  for (const postcode of postcodes) {
    if (postcode && postcode.trim()) {
      try {
        const postcodeResults = await searchByPostcode(postcode.trim());
        allResults.push(...postcodeResults);
      } catch (error) {
        console.error(`Error searching London by postcode "${postcode}":`, error);
      }
    }
  }

  // Deduplicate by reference or id
  const seen = new Set<string>();
  const uniqueResults: LondonPlanningApplicationRaw[] = [];
  
  for (const result of allResults) {
    const key = result.reference || result.application_number || result.id || JSON.stringify(result);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(result);
    }
  }

  return uniqueResults;
}

/**
 * Search planning applications by organisation name
 */
async function searchByOrganisation(
  orgName: string
): Promise<LondonPlanningApplicationRaw[]> {
  // London Datahub API endpoint pattern
  // Common: /applications?applicant_organisation={orgName}
  const params = new URLSearchParams({
    applicant_organisation: orgName,
    limit: '100',
  });

  const endpoint = `/applications?${params.toString()}`;
  
  return rateLimiter.makeRequest<LondonPlanningApplicationRaw[]>(() =>
    fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-AllowRequest': API_ALLOW_HEADER,
      },
    })
  );
}

/**
 * Search planning applications by postcode
 */
async function searchByPostcode(
  postcode: string
): Promise<LondonPlanningApplicationRaw[]> {
  // Normalize postcode (remove spaces, uppercase)
  const normalizedPostcode = postcode.replace(/\s+/g, '').toUpperCase();
  
  const params = new URLSearchParams({
    postcode: normalizedPostcode,
    limit: '100',
  });

  const endpoint = `/applications?${params.toString()}`;
  
  return rateLimiter.makeRequest<LondonPlanningApplicationRaw[]>(() =>
    fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-AllowRequest': API_ALLOW_HEADER,
      },
    })
  );
}

/**
 * Normalize planning application status to our enum
 */
export function normalizeLondonPlanningStatus(
  status: string | undefined,
  decision: string | undefined
): 'APPROVED' | 'REFUSED' | 'UNDER_CONSIDERATION' | 'UNKNOWN' {
  const statusLower = status?.toLowerCase().trim() || '';
  const decisionLower = decision?.toLowerCase().trim() || '';
  const combined = `${statusLower} ${decisionLower}`.trim();
  
  if (combined.includes('approved') || combined.includes('granted')) {
    return 'APPROVED';
  }
  if (combined.includes('refused') || combined.includes('rejected')) {
    return 'REFUSED';
  }
  if (
    combined.includes('under') ||
    combined.includes('consideration') ||
    combined.includes('pending') ||
    combined.includes('awaiting') ||
    combined.includes('validated')
  ) {
    return 'UNDER_CONSIDERATION';
  }
  
  return 'UNKNOWN';
}

