/**
 * Companies House API Client
 * 
 * Provides utilities for interacting with the Companies House API
 * Documentation: https://developer.company-information.service.gov.uk/
 */

const BASE_URL = 'https://api.company-information.service.gov.uk';

// Rate limiting configuration
const RATE_LIMIT_MAX = 600; // 600 requests per 5 minutes
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds

// In-memory rate limit tracking (for server-side use)
let rateLimitWindow: { start: number; count: number } = {
  start: Date.now(),
  count: 0,
};

/**
 * Rate limiter utility
 * Tracks requests per 5-minute window and adds delays if approaching limit
 */
export async function checkRateLimit(): Promise<void> {
  const now = Date.now();
  const windowAge = now - rateLimitWindow.start;

  // Reset window if 5 minutes have passed
  if (windowAge >= RATE_LIMIT_WINDOW) {
    rateLimitWindow = {
      start: now,
      count: 0,
    };
  }

  // Add delays based on request count
  if (rateLimitWindow.count >= 580) {
    // Very close to limit - wait longer
    await new Promise(resolve => setTimeout(resolve, 500));
  } else if (rateLimitWindow.count >= 500) {
    // Approaching limit - add small delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  rateLimitWindow.count++;
}

/**
 * Handle 429 (Too Many Requests) errors with exponential backoff
 */
async function handleRateLimitError(
  retryCount: number = 0,
  maxRetries: number = 3
): Promise<void> {
  if (retryCount >= maxRetries) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  const waitTime = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
  console.log(`Rate limit hit. Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
  await new Promise(resolve => setTimeout(resolve, waitTime));
}

export interface CompaniesHouseSearchResult {
  total_results: number;
  items_per_page: number;
  start_index: number;
  items: Array<{
    company_number: string;
    company_status: string;
    company_type: string;
    title: string;
    company_status_detail?: string;
    date_of_creation?: string;
    address?: {
      premises?: string;
      address_line_1?: string;
      address_line_2?: string;
      locality?: string;
      region?: string;
      postal_code?: string;
      country?: string;
    };
    sic_codes?: string[];
  }>;
}

export interface CompaniesHouseCompanyProfile {
  company_number: string;
  company_name: string;
  company_status: string;
  company_status_detail?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  company_type?: string;
}

export interface CompaniesHouseCharge {
  charge_number: number;
  charge_code?: string;
  created_on?: string;
  delivered_on?: string;
  persons_entitled?: Array<{
    name?: string;
  }>;
  secured_details?: {
    description?: string;
    type?: string;
  };
  charge_id?: string;
  status?: string;
  transactions?: Array<{
    filing_type?: string;
    delivered_on?: string;
    links?: {
      filing?: string;
    };
  }>;
  links?: {
    self?: string;
    filing?: string;
  };
}

export interface CompaniesHouseChargesResponse {
  total_count: number;
  items: CompaniesHouseCharge[];
}

/**
 * Get the API key from environment variables
 */
function getApiKey(): string {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    console.error('COMPANIES_HOUSE_API_KEY not found in environment variables');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('COMPANIES')));
    throw new Error('COMPANIES_HOUSE_API_KEY environment variable is not set');
  }
  return apiKey;
}

/**
 * Make an authenticated request to Companies House API
 * Companies House uses HTTP Basic Authentication:
 * - Username: API key
 * - Password: (empty)
 * Includes rate limiting and 429 error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount: number = 0
): Promise<T> {
  // Check rate limit before making request
  await checkRateLimit();

  const url = `${BASE_URL}${endpoint}`;
  const apiKey = getApiKey();
  
  // Create Basic Auth header: base64(api_key:)
  const credentials = Buffer.from(`${apiKey}:`).toString('base64');
  const authHeader = `Basic ${credentials}`;
  
  const headers = {
    'Authorization': authHeader,
    'Accept': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 429 (Too Many Requests) with retry
  if (response.status === 429) {
    await handleRateLimitError(retryCount);
    // Retry the request
    return apiRequest<T>(endpoint, options, retryCount + 1);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(`API Error [${response.status}]:`, errorText);
    console.error(`Request URL: ${url}`);
    throw new Error(
      `Companies House API error: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return response.json();
}

/**
 * Search for companies
 * Note: Companies House API doesn't directly support SIC code filtering in search
 * We'll search broadly and filter results client-side
 */
export async function searchCompanies(
  query: string,
  itemsPerPage: number = 100,
  startIndex: number = 0
): Promise<CompaniesHouseSearchResult> {
  const params = new URLSearchParams({
    q: query,
    items_per_page: itemsPerPage.toString(),
    start_index: startIndex.toString(),
  });

  return apiRequest<CompaniesHouseSearchResult>(
    `/search/companies?${params.toString()}`
  );
}

/**
 * Get full company profile by company number
 */
export async function getCompanyProfile(
  companyNumber: string
): Promise<CompaniesHouseCompanyProfile> {
  return apiRequest<CompaniesHouseCompanyProfile>(
    `/company/${companyNumber}`
  );
}

/**
 * Get registered office address for a company
 */
export interface CompaniesHouseRegisteredOfficeAddress {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  country?: string;
  premises?: string;
  care_of?: string;
  po_box?: string;
}

export async function getRegisteredOfficeAddress(
  companyNumber: string
): Promise<CompaniesHouseRegisteredOfficeAddress> {
  return apiRequest<CompaniesHouseRegisteredOfficeAddress>(
    `/company/${companyNumber}/registered-office-address`
  );
}

/**
 * Get all charges for a company
 */
export async function getCompanyCharges(
  companyNumber: string
): Promise<CompaniesHouseChargesResponse> {
  return apiRequest<CompaniesHouseChargesResponse>(
    `/company/${companyNumber}/charges`
  );
}

/**
 * Get charge document (PDF) URL
 * Companies House provides PDFs via the filing link
 */
export async function getChargeDocumentUrl(
  companyNumber: string,
  chargeId: string
): Promise<string | null> {
  try {
    // First get the charge details to find the filing link
    const charges = await getCompanyCharges(companyNumber);
    const charge = charges.items.find(
      (c) => c.charge_id === chargeId || c.charge_number.toString() === chargeId
    );

    if (charge?.links?.filing) {
      // The filing link points to the document
      // Companies House document URLs follow pattern:
      // https://find-and-update.company-information.service.gov.uk/company/{number}/filing-history/{transaction-id}
      // PDFs are available at: {transaction-url}/document?format=pdf
      return charge.links.filing;
    }

    return null;
  } catch (error) {
    console.error(`Error getting charge document URL for ${companyNumber}/${chargeId}:`, error);
    return null;
  }
}

/**
 * Download PDF document from Companies House
 * Returns the PDF as a Buffer
 */
export async function downloadChargeDocument(
  documentUrl: string
): Promise<Buffer | null> {
  try {
    // Companies House document URLs need to be converted to PDF format
    // If URL doesn't end with .pdf, append ?format=pdf or /document?format=pdf
    let pdfUrl = documentUrl;
    if (!pdfUrl.includes('/document')) {
      pdfUrl = documentUrl.endsWith('/')
        ? `${documentUrl}document?format=pdf`
        : `${documentUrl}/document?format=pdf`;
    } else if (!pdfUrl.includes('format=pdf')) {
      pdfUrl = pdfUrl.includes('?')
        ? `${pdfUrl}&format=pdf`
        : `${pdfUrl}?format=pdf`;
    }

    const apiKey = getApiKey();
    const credentials = Buffer.from(`${apiKey}:`).toString('base64');
    
    const response = await fetch(pdfUrl, {
      headers: {
        'Authorization': `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`Error downloading document from ${documentUrl}:`, error);
    return null;
  }
}

/**
 * Advanced search for companies with filters including SIC codes
 * Uses the Advanced Search API endpoint
 * Documentation: https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/search/advanced-company-search
 */
export interface AdvancedSearchFilters {
  sicCodes?: string[];
  companyStatus?: string[];
  companyType?: string[];
  companySubtype?: string[];
  location?: string;
  incorporatedFrom?: string;
  incorporatedTo?: string;
  dissolvedFrom?: string;
  dissolvedTo?: string;
  companyNameIncludes?: string;
  companyNameExcludes?: string;
  size?: number;
  startIndex?: number;
}

export async function advancedSearchCompanies(
  filters: AdvancedSearchFilters
): Promise<CompaniesHouseSearchResult> {
  const params = new URLSearchParams();
  
  // Add SIC codes (multiple values)
  if (filters.sicCodes && filters.sicCodes.length > 0) {
    filters.sicCodes.forEach(code => {
      params.append('sic_codes', code);
    });
  }
  
  // Add company status (multiple values)
  if (filters.companyStatus && filters.companyStatus.length > 0) {
    filters.companyStatus.forEach(status => {
      params.append('company_status', status);
    });
  }
  
  // Add company type (multiple values)
  if (filters.companyType && filters.companyType.length > 0) {
    filters.companyType.forEach(type => {
      params.append('company_type', type);
    });
  }
  
  // Add company subtype (multiple values)
  if (filters.companySubtype && filters.companySubtype.length > 0) {
    filters.companySubtype.forEach(subtype => {
      params.append('company_subtype', subtype);
    });
  }
  
  // Add other filters
  if (filters.location) {
    params.append('location', filters.location);
  }
  
  if (filters.incorporatedFrom) {
    params.append('incorporated_from', filters.incorporatedFrom);
  }
  
  if (filters.incorporatedTo) {
    params.append('incorporated_to', filters.incorporatedTo);
  }
  
  if (filters.dissolvedFrom) {
    params.append('dissolved_from', filters.dissolvedFrom);
  }
  
  if (filters.dissolvedTo) {
    params.append('dissolved_to', filters.dissolvedTo);
  }
  
  if (filters.companyNameIncludes) {
    params.append('company_name_includes', filters.companyNameIncludes);
  }
  
  if (filters.companyNameExcludes) {
    params.append('company_name_excludes', filters.companyNameExcludes);
  }
  
  if (filters.size) {
    params.append('size', filters.size.toString());
  }
  
  if (filters.startIndex !== undefined) {
    params.append('start_index', filters.startIndex.toString());
  }

  return apiRequest<CompaniesHouseSearchResult>(
    `/advanced-search/companies?${params.toString()}`
  );
}

/**
 * Search companies by SIC codes using Advanced Search API
 * This is the correct implementation using the Advanced Search endpoint
 */
export async function searchCompaniesBySicCodes(
  sicCodes: string[],
  itemsPerPage: number = 100,
  startIndex: number = 0,
  companyStatus: string[] = ['active'],
  incorporatedFrom?: string
): Promise<CompaniesHouseSearchResult> {
  return advancedSearchCompanies({
    sicCodes,
    companyStatus,
    incorporatedFrom,
    size: itemsPerPage,
    startIndex,
  });
}

/**
 * Persons with Significant Control (PSC) interfaces and functions
 */
export interface CompaniesHousePSCList {
  total_count: number;
  items: Array<{
    name?: string;
    kind?: string;
    links?: {
      self?: string;
    };
    natures_of_control?: string[];
    notified_on?: string;
    ceased_on?: string;
  }>;
}

export interface CompaniesHousePSCIndividual {
  name: string;
  name_elements?: {
    forename?: string;
    surname?: string;
    title?: string;
    other_forenames?: string;
  };
  nationality?: string;
  date_of_birth?: {
    month?: number;
    year?: number;
  };
  address?: CompaniesHouseRegisteredOfficeAddress;
  natures_of_control?: string[];
  notified_on?: string;
  ceased_on?: string;
  links?: {
    self?: string;
  };
}

export interface CompaniesHousePSCCorporateEntity {
  name: string;
  identification?: {
    country_registered?: string;
    registration_number?: string;
    legal_authority?: string;
    legal_form?: string;
    place_registered?: string;
  };
  address?: CompaniesHouseRegisteredOfficeAddress;
  natures_of_control?: string[];
  notified_on?: string;
  ceased_on?: string;
  links?: {
    self?: string;
  };
}

/**
 * Get list of persons with significant control for a company
 */
export async function getPersonsWithSignificantControl(
  companyNumber: string
): Promise<CompaniesHousePSCList> {
  return apiRequest<CompaniesHousePSCList>(
    `/company/${companyNumber}/persons-with-significant-control`
  );
}

/**
 * Get individual person with significant control details
 */
export async function getPSCIndividual(
  companyNumber: string,
  pscId: string
): Promise<CompaniesHousePSCIndividual> {
  return apiRequest<CompaniesHousePSCIndividual>(
    `/company/${companyNumber}/persons-with-significant-control/individual/${pscId}`
  );
}

/**
 * Get corporate entity person with significant control details
 */
export async function getPSCCorporateEntity(
  companyNumber: string,
  pscId: string
): Promise<CompaniesHousePSCCorporateEntity> {
  return apiRequest<CompaniesHousePSCCorporateEntity>(
    `/company/${companyNumber}/persons-with-significant-control/corporate-entity/${pscId}`
  );
}

/**
 * Officers interfaces and functions
 */
export interface CompaniesHouseOfficersList {
  total_count: number;
  items_per_page: number;
  start_index: number;
  items: Array<{
    name: string;
    officer_role: string;
    appointed_on?: string;
    resigned_on?: string;
    links?: {
      self?: string;
      officer?: {
        appointments?: string;
      };
    };
    date_of_birth?: {
      month?: number;
      year?: number;
    };
    nationality?: string;
    occupation?: string;
    country_of_residence?: string;
    address?: CompaniesHouseRegisteredOfficeAddress;
  }>;
}

export interface CompaniesHouseOfficer {
  name: string;
  officer_role: string;
  appointed_on?: string;
  resigned_on?: string;
  date_of_birth?: {
    month?: number;
    year?: number;
  };
  nationality?: string;
  occupation?: string;
  country_of_residence?: string;
  address?: CompaniesHouseRegisteredOfficeAddress;
  links?: {
    self?: string;
    officer?: {
      appointments?: string;
    };
  };
}

export interface CompaniesHouseOfficerAppointments {
  total_count: number;
  items_per_page: number;
  start_index: number;
  items: Array<{
    name: string;
    officer_role: string;
    appointed_on?: string;
    resigned_on?: string;
    links?: {
      self?: string;
      company?: string;
    };
  }>;
}

/**
 * Get list of officers for a company
 */
export async function getCompanyOfficers(
  companyNumber: string,
  itemsPerPage: number = 100,
  startIndex: number = 0
): Promise<CompaniesHouseOfficersList> {
  const params = new URLSearchParams({
    items_per_page: itemsPerPage.toString(),
    start_index: startIndex.toString(),
  });

  return apiRequest<CompaniesHouseOfficersList>(
    `/company/${companyNumber}/officers?${params.toString()}`
  );
}

/**
 * Get officer appointments (all companies an officer is associated with)
 */
export async function getOfficerAppointments(
  officerId: string,
  itemsPerPage: number = 100,
  startIndex: number = 0
): Promise<CompaniesHouseOfficerAppointments> {
  const params = new URLSearchParams({
    items_per_page: itemsPerPage.toString(),
    start_index: startIndex.toString(),
  });

  return apiRequest<CompaniesHouseOfficerAppointments>(
    `/officers/${officerId}/appointments?${params.toString()}`
  );
}

