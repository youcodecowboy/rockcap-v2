/**
 * Planning Data API Client
 * 
 * Client for planning.data.gov.uk - national planning/housing data for England
 * Documentation: https://www.planning.data.gov.uk/
 * 
 * No API key required, but rate limiting is enforced.
 */

import {
  createRateLimiter,
  getRateLimitFromEnv,
} from '../rateLimit/rateLimiter';

const BASE_URL = 'https://www.planning.data.gov.uk';

// Default rate limit: 30 requests per minute
const DEFAULT_RATE_LIMIT = getRateLimitFromEnv(
  'PLANNING_DATA_API_RATE_LIMIT',
  30
);

// Create rate limiter instance
const rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT, 'PlanningDataAPI');

/**
 * Raw planning application data from the API
 */
export interface PlanningApplicationRaw {
  reference?: string; // LPA reference
  id?: string; // Entity ID
  name?: string; // Application name/description
  description?: string;
  status?: string; // e.g., "approved", "refused", "under_consideration"
  decision_date?: string; // ISO date string
  received_date?: string; // ISO date string
  local_authority?: string;
  local_authority_label?: string;
  site_address?: string;
  postcode?: string;
  applicant_name?: string;
  applicant_organisation?: string;
  geometry?: any; // GeoJSON or other geometry data
  [key: string]: any; // Allow additional fields
}

/**
 * Search planning applications by organisation name and postcodes
 * 
 * @param orgName - Organisation/company name to search for
 * @param postcodes - Array of postcodes to filter by
 * @returns Array of planning applications
 */
export async function searchPlanningApplicationsByOrganisationAndPostcode(
  orgName: string,
  postcodes: string[]
): Promise<PlanningApplicationRaw[]> {
  const allResults: PlanningApplicationRaw[] = [];
  
  // Search by organisation name
  if (orgName && orgName.trim()) {
    try {
      const orgResults = await searchByOrganisation(orgName.trim());
      allResults.push(...orgResults);
    } catch (error) {
      console.error(`Error searching by organisation "${orgName}":`, error);
    }
  }

  // Search by postcodes
  for (const postcode of postcodes) {
    if (postcode && postcode.trim()) {
      try {
        const postcodeResults = await searchByPostcode(postcode.trim());
        allResults.push(...postcodeResults);
      } catch (error) {
        console.error(`Error searching by postcode "${postcode}":`, error);
      }
    }
  }

  // Deduplicate by reference or id
  const seen = new Set<string>();
  const uniqueResults: PlanningApplicationRaw[] = [];
  
  for (const result of allResults) {
    const key = result.reference || result.id || JSON.stringify(result);
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
): Promise<PlanningApplicationRaw[]> {
  // Planning Data API uses SPARQL-like queries or REST endpoints
  // Common pattern: /api/applications?applicant_organisation={orgName}
  // Or use the search endpoint if available
  
  const params = new URLSearchParams({
    applicant_organisation: orgName,
    // Add pagination if supported
    limit: '100',
  });

  const endpoint = `/api/applications?${params.toString()}`;
  
  return rateLimiter.makeRequest<PlanningApplicationRaw[]>(() =>
    fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })
  );
}

/**
 * Search planning applications by postcode
 */
async function searchByPostcode(
  postcode: string
): Promise<PlanningApplicationRaw[]> {
  // Normalize postcode (remove spaces, uppercase)
  const normalizedPostcode = postcode.replace(/\s+/g, '').toUpperCase();
  
  const params = new URLSearchParams({
    postcode: normalizedPostcode,
    limit: '100',
  });

  const endpoint = `/api/applications?${params.toString()}`;
  
  return rateLimiter.makeRequest<PlanningApplicationRaw[]>(() =>
    fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })
  );
}

/**
 * Normalize planning application status to our enum
 */
export function normalizePlanningStatus(
  status: string | undefined
): 'APPROVED' | 'REFUSED' | 'UNDER_CONSIDERATION' | 'UNKNOWN' {
  if (!status) return 'UNKNOWN';
  
  const normalized = status.toLowerCase().trim();
  
  if (normalized.includes('approved') || normalized.includes('granted')) {
    return 'APPROVED';
  }
  if (normalized.includes('refused') || normalized.includes('rejected')) {
    return 'REFUSED';
  }
  if (
    normalized.includes('under') ||
    normalized.includes('consideration') ||
    normalized.includes('pending') ||
    normalized.includes('awaiting')
  ) {
    return 'UNDER_CONSIDERATION';
  }
  
  return 'UNKNOWN';
}

