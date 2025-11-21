import { Client } from '@hubspot/api-client';
import { HubSpotCompany } from './types';
import { delay } from './utils';

/**
 * Fetch companies from HubSpot with pagination
 * Limits to 100 records initially as per requirements
 */
export async function fetchCompaniesFromHubSpot(
  client: Client,
  limit: number = 100,
  after?: string
): Promise<{ companies: HubSpotCompany[]; nextAfter?: string }> {
  try {
    const properties = [
      'name',
      'domain',
      'website', // Website URL (separate from domain)
      'phone',
      'address',
      'address2',
      'city',
      'state',
      'zip',
      'country',
      'industry',
      'type',
      'description',
      'lifecyclestage',
      'hubspot_owner_id', // Company owner
      'createdate',
      'lastmodifieddate',
      'hs_last_contacted_date', // Last contacted date
      'hs_last_activity_date', // Last activity date
      'num_associated_contacts',
      'num_associated_deals',
      'total_revenue',
      'recent_deal_amount',
      'recent_deal_close_date',
      'hs_analytics_num_visits',
      'hs_analytics_num_page_views',
      'hs_analytics_first_touch_converting_campaign',
      'hs_analytics_last_touch_converting_campaign',
      'hs_lead_status',
      'hs_parent_company_id',
      'hs_num_child_companies',
      'annualrevenue',
      'numberofemployees',
      'founded_year',
    ];
    
    // Use direct API calls instead of SDK to avoid "data is not iterable" errors
    // The SDK has serialization issues with companies API
    const apiKey = process.env.HUBSPOT_API_KEY;
    if (!apiKey) {
      throw new Error('HUBSPOT_API_KEY not found in environment variables');
    }
    
    const params = new URLSearchParams({
      limit: limit.toString(),
      properties: properties.join(','),
      associations: 'contacts,deals', // Request associations
    });
    if (after) {
      params.append('after', after);
    }
    
    console.log('[HubSpot Companies] Fetching companies, limit:', limit, 'after:', after);
    
    const directResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/companies?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!directResponse.ok) {
      const errorText = await directResponse.text();
      throw new Error(`Failed to fetch companies: ${directResponse.status} ${errorText}`);
    }
    
    const directData = await directResponse.json();
    
    console.log('[HubSpot Companies] Response received:', {
      hasResults: !!directData.results,
      resultsCount: directData.results?.length || 0,
      hasPaging: !!directData.paging,
      pagingNext: directData.paging?.next?.after ? `${directData.paging.next.after.substring(0, 20)}...` : 'none',
      pagingPrev: directData.paging?.prev?.after ? `${directData.paging.prev.after.substring(0, 20)}...` : 'none',
    });
    
    // Handle case where response might not have results property
    if (!directData || !directData.results) {
      console.warn('Empty HubSpot companies response');
      return {
        companies: [],
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
        companies: [],
        nextAfter: undefined,
      };
    }
    
    const companies: HubSpotCompany[] = results.map((company: any) => {
      // Parse dates - direct API returns ISO strings, not Date objects
      let createdAt: string;
      if (company.createdAt) {
        createdAt = typeof company.createdAt === 'string' 
          ? company.createdAt 
          : (company.createdAt instanceof Date ? company.createdAt.toISOString() : new Date().toISOString());
      } else if (company.properties?.createdate) {
        // Parse from properties.createdate (timestamp in milliseconds)
        const createdateStr = String(company.properties.createdate);
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
      if (company.updatedAt) {
        if (typeof company.updatedAt === 'string') {
          const testDate = new Date(company.updatedAt);
          if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
            updatedAt = company.updatedAt;
          } else {
            updatedAt = new Date().toISOString();
          }
        } else if (company.updatedAt instanceof Date) {
          updatedAt = company.updatedAt.toISOString();
        } else {
          updatedAt = new Date().toISOString();
        }
      } else if (company.properties?.lastmodifieddate) {
        // Fallback to properties.lastmodifieddate (timestamp in milliseconds)
        const lastmodifiedStr = String(company.properties.lastmodifieddate);
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
        id: company.id,
        properties: company.properties || {},
        associations: company.associations || {},
        createdAt,
        updatedAt,
      };
    });
    
    return {
      companies,
      nextAfter: directData.paging?.next?.after,
    };
  } catch (error: any) {
    console.error('Error fetching companies from HubSpot:', error);
    throw new Error(`Failed to fetch companies: ${error.message}`);
  }
}

/**
 * Fetch all companies (with pagination handling)
 * Respects rate limits by adding delays
 */
export async function fetchAllCompaniesFromHubSpot(
  client: Client,
  maxRecords: number = 100
): Promise<HubSpotCompany[]> {
  const allCompanies: HubSpotCompany[] = [];
  let after: string | undefined;
  let fetched = 0;
  let pageCount = 0;
  
  console.log(`[HubSpot Companies] Starting pagination fetch, maxRecords: ${maxRecords}`);
  
  while (fetched < maxRecords) {
    pageCount++;
    const remaining = maxRecords - fetched;
    const batchSize = Math.min(remaining, 100); // HubSpot max per request
    
    console.log(`[HubSpot Companies] Page ${pageCount}: Fetching ${batchSize} companies${after ? ` (after: ${after.substring(0, 20)}...)` : ' (first page)'}`);
    
    const { companies, nextAfter } = await fetchCompaniesFromHubSpot(
      client,
      batchSize,
      after
    );
    
    console.log(`[HubSpot Companies] Page ${pageCount}: Received ${companies.length} companies${nextAfter ? `, nextAfter: ${nextAfter.substring(0, 20)}...` : ', no more pages'}`);
    
    // Check for duplicate IDs (indicates pagination issue)
    const newCompanyIds = new Set(companies.map(c => c.id));
    const existingIds = new Set(allCompanies.map(c => c.id));
    const duplicates = companies.filter(c => existingIds.has(c.id));
    if (duplicates.length > 0) {
      console.warn(`[HubSpot Companies] WARNING: Found ${duplicates.length} duplicate companies on page ${pageCount}. This indicates a pagination issue.`);
      console.warn(`[HubSpot Companies] Duplicate IDs: ${duplicates.slice(0, 5).map(c => c.id).join(', ')}`);
    }
    
    allCompanies.push(...companies);
    fetched += companies.length;
    
    // If we got fewer companies than requested and there's no nextAfter, we're done
    if (!nextAfter) {
      console.log(`[HubSpot Companies] No more pages available. Total fetched: ${fetched}`);
      break;
    }
    
    // If we got 0 companies, we're done
    if (companies.length === 0) {
      console.log(`[HubSpot Companies] Received 0 companies, stopping pagination. Total fetched: ${fetched}`);
      break;
    }
    
    // Update pagination token
    after = nextAfter;
    
    // Rate limiting: wait 100ms between requests
    await delay(100);
  }
  
  console.log(`[HubSpot Companies] Pagination complete. Total companies fetched: ${fetched} (requested: ${maxRecords})`);
  
  return allCompanies;
}

