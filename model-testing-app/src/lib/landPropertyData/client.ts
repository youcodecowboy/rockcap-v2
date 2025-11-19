/**
 * Land & Property Data API Client
 * 
 * Client for use-land-property-data.service.gov.uk (HM Land Registry)
 * Base URL: https://use-land-property-data.service.gov.uk/
 * 
 * Requires API key from LAND_PROPERTY_API_KEY environment variable
 */

import {
  createRateLimiter,
  getRateLimitFromEnv,
} from '../rateLimit/rateLimiter';

const BASE_URL = 'https://use-land-property-data.service.gov.uk';

// Default rate limit: 60 requests per minute
const DEFAULT_RATE_LIMIT = getRateLimitFromEnv(
  'LAND_PROPERTY_API_RATE_LIMIT',
  60
);

// Create rate limiter instance
const rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT, 'LandPropertyAPI');

/**
 * Get API key from environment variables
 */
function getApiKey(): string {
  const apiKey = process.env.LAND_PROPERTY_API_KEY;
  if (!apiKey) {
    throw new Error(
      'LAND_PROPERTY_API_KEY environment variable is not set'
    );
  }
  return apiKey;
}

/**
 * Raw property title data from Land & Property API
 */
export interface LandPropertyTitleRaw {
  title_number?: string;
  address?: string;
  postcode?: string;
  property_address?: string;
  property_description?: string;
  tenure?: string; // FREEHOLD, LEASEHOLD, etc.
  price_paid?: number;
  date_of_sale?: string; // ISO date string
  company_name?: string;
  company_number?: string;
  country?: string;
  [key: string]: any; // Allow additional fields
}

/**
 * Get corporate-owned titles for a company
 * 
 * NOTE: The HM Land Registry API provides bulk CSV downloads, not query endpoints.
 * This function currently returns an empty array. For production use, you would need to:
 * 1. Download the CSV files periodically (via /api/v1/datasets/{dataset}/{filename})
 * 2. Parse and index the CSV data in your database
 * 3. Query your local database instead of the API
 * 
 * @param companyNameOrNumber - Company name or Companies House number
 * @returns Array of property titles owned by the company (empty for now - requires CSV indexing)
 */
export async function getCorporateOwnedTitlesForCompany(
  companyNameOrNumber: string
): Promise<LandPropertyTitleRaw[]> {
  // TODO: Implement CSV download and indexing
  // The API provides downloadable CSV files, not query endpoints
  // Files are available at: /api/v1/datasets/ccod/{filename} and /api/v1/datasets/ocod/{filename}
  // Example: /api/v1/datasets/ccod/example.csv returns a signed S3 download URL
  
  console.warn(
    'Land & Property API: This API provides bulk CSV downloads, not query endpoints. ' +
    'Property searches are not yet implemented. To enable this feature, implement CSV download and indexing.'
  );
  
  return [];
}

/**
 * Search UK companies that own property dataset
 * 
 * Note: This API requires license acceptance for the dataset before search queries work.
 * The search endpoint is: /api/v1/datasets/ccod/search
 */
async function searchUKCompaniesDataset(
  companyNameOrNumber: string
): Promise<LandPropertyTitleRaw[]> {
  const apiKey = getApiKey();
  
  // Try search endpoint first (requires license acceptance)
  // Dataset: ccod = UK companies that own property
  const params = new URLSearchParams({
    company_name: companyNameOrNumber,
    limit: '100',
  });

  const endpoint = `/api/v1/datasets/ccod/search?${params.toString()}`;
  
  try {
    const response = await rateLimiter.makeRequest<{ result?: LandPropertyTitleRaw[]; error?: string }>(() =>
      fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': apiKey, // API key directly (not Bearer token)
        },
      })
    );

    // If search endpoint returns results, use them
    if (response.result && Array.isArray(response.result)) {
      return response.result;
    }

    // If license not accepted, return empty array (will be logged)
    if (response.error?.includes('licence')) {
      console.warn('Land & Property API: Dataset license not yet accepted. Please accept the license in the HM Land Registry portal.');
      return [];
    }

    return [];
  } catch (error: any) {
    // If search fails (e.g., license not accepted), return empty array
    if (error.message?.includes('licence') || error.message?.includes('license')) {
      console.warn('Land & Property API: Dataset license not yet accepted. Please accept the license in the HM Land Registry portal.');
      return [];
    }
    throw error;
  }
}

/**
 * Search overseas companies that own property dataset
 * 
 * Note: This API requires license acceptance for the dataset before search queries work.
 * The search endpoint is: /api/v1/datasets/ocod/search
 */
async function searchOverseasCompaniesDataset(
  companyNameOrNumber: string
): Promise<LandPropertyTitleRaw[]> {
  const apiKey = getApiKey();
  
  // Try search endpoint first (requires license acceptance)
  // Dataset: ocod = Overseas companies that own property
  const params = new URLSearchParams({
    company_name: companyNameOrNumber,
    limit: '100',
  });

  const endpoint = `/api/v1/datasets/ocod/search?${params.toString()}`;
  
  try {
    const response = await rateLimiter.makeRequest<{ result?: LandPropertyTitleRaw[]; error?: string }>(() =>
      fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': apiKey, // API key directly (not Bearer token)
        },
      })
    );

    // If search endpoint returns results, use them
    if (response.result && Array.isArray(response.result)) {
      return response.result;
    }

    // If license not accepted, return empty array (will be logged)
    if (response.error?.includes('licence')) {
      console.warn('Land & Property API: Dataset license not yet accepted. Please accept the license in the HM Land Registry portal.');
      return [];
    }

    return [];
  } catch (error: any) {
    // If search fails (e.g., license not accepted), return empty array
    if (error.message?.includes('licence') || error.message?.includes('license')) {
      console.warn('Land & Property API: Dataset license not yet accepted. Please accept the license in the HM Land Registry portal.');
      return [];
    }
    throw error;
  }
}

/**
 * Normalize ownership type to our enum
 */
export function normalizeOwnershipType(
  tenure: string | undefined
): 'FREEHOLD' | 'LEASEHOLD' | 'UNKNOWN' {
  if (!tenure) return 'UNKNOWN';
  
  const normalized = tenure.toUpperCase().trim();
  
  if (normalized.includes('FREEHOLD')) {
    return 'FREEHOLD';
  }
  if (normalized.includes('LEASEHOLD')) {
    return 'LEASEHOLD';
  }
  
  return 'UNKNOWN';
}

