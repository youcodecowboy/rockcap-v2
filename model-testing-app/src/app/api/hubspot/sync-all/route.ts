import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { fetchAllCompaniesFromHubSpot } from '@/lib/hubspot/companies';
import { fetchAllContactsFromHubSpot } from '@/lib/hubspot/contacts';
import { fetchAllDealsFromHubSpot } from '@/lib/hubspot/deals';
import { extractCustomProperties, generateHubSpotCompanyUrl, generateHubSpotContactUrl, generateHubSpotDealUrl } from '@/lib/hubspot/utils';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation } from 'convex/nextjs';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const convexClient = await getAuthenticatedConvexClient();
    try {
      await requireAuth(convexClient);
    } catch (authError) {
      return ErrorResponses.unauthenticated();
    }
    const { 
      maxRecords = 20, // Reduced for testing
      syncCompanies = true,
      syncContacts = true,
      syncDeals = false, // Disabled - causing SDK errors and you have 0 deals anyway
    } = await request.json().catch(() => ({}));
    
    const client = getHubSpotClient();
    const stats = {
      companiesSynced: 0,
      contactsSynced: 0,
      dealsSynced: 0,
      errors: 0,
    };
    
    const errorMessages: string[] = [];
    
    // Update sync status to in_progress
    await fetchMutation(api.hubspotSync.updateSyncStatus as any, {
      status: 'in_progress',
    }) as any;
    
    // Sync companies (to companies table, not clients)
    if (syncCompanies) {
      try {
        const companies = await fetchAllCompaniesFromHubSpot(client, maxRecords);
        
        for (const company of companies) {
          try {
            const hubspotUrl = await generateHubSpotCompanyUrl(company.id);
            const customProperties = extractCustomProperties(company.properties);
            
            // Filter out null/undefined/empty values before sending to mutation
            // Convex doesn't accept null - only actual values or undefined (omitted)
            const hasValue = (val: any): val is string => {
              return val != null && val !== '' && typeof val === 'string';
            };
            
            const companyData: any = {
              hubspotCompanyId: company.id,
              name: company.properties.name,
              lifecycleStage: company.properties.lifecyclestage,
              customProperties,
              hubspotUrl: hubspotUrl || undefined,
            };
            
            // Only include fields that have actual non-null, non-empty string values
            if (hasValue(company.properties.phone)) {
              companyData.phone = company.properties.phone;
            }
            if (hasValue(company.properties.domain)) {
              companyData.website = company.properties.domain;
            }
            if (hasValue(company.properties.address)) {
              companyData.address = company.properties.address;
            }
            if (hasValue(company.properties.city)) {
              companyData.city = company.properties.city;
            }
            if (hasValue(company.properties.state)) {
              companyData.state = company.properties.state;
            }
            if (hasValue(company.properties.zip)) {
              companyData.zip = company.properties.zip;
            }
            if (hasValue(company.properties.country)) {
              companyData.country = company.properties.country;
            }
            if (hasValue(company.properties.industry)) {
              companyData.industry = company.properties.industry;
            }
            
            await fetchMutation(api.hubspotSync.syncCompanyFromHubSpot as any, companyData) as any;
            
            stats.companiesSynced++;
          } catch (error: any) {
            stats.errors++;
            errorMessages.push(`Company ${company.id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        stats.errors++;
        errorMessages.push(`Companies sync error: ${error.message}`);
      }
    }
    
    // Sync contacts
    if (syncContacts) {
      try {
        const contacts = await fetchAllContactsFromHubSpot(client, maxRecords);

        for (const contact of contacts) {
          try {
            const hubspotUrl = await generateHubSpotContactUrl(contact.id);
            const customProperties = extractCustomProperties(contact.properties);

            const name = `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim();
            if (!name) {
              continue;
            }

            // Filter out null/undefined/empty values for contacts too
            const hasValue = (val: any): val is string => {
              return val != null && val !== '' && typeof val === 'string';
            };

            const contactData: any = {
              hubspotContactId: contact.id,
              name,
              lifecycleStage: contact.properties.lifecyclestage,
              customProperties,
              hubspotUrl: hubspotUrl || undefined,
            };

            // Only include fields that have actual non-null, non-empty string values
            if (hasValue(contact.properties.email)) {
              contactData.email = contact.properties.email;
            }
            if (hasValue(contact.properties.phone)) {
              contactData.phone = contact.properties.phone;
            }
            if (hasValue(contact.properties.company)) {
              contactData.company = contact.properties.company;
            }
            if (hasValue(contact.properties.jobtitle)) {
              contactData.role = contact.properties.jobtitle;
            }

            await fetchMutation(api.hubspotSync.syncContactFromHubSpot as any, contactData) as any;

            stats.contactsSynced++;
          } catch (error: any) {
            stats.errors++;
            errorMessages.push(`Contact ${contact.id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        stats.errors++;
        errorMessages.push(`Contacts sync error: ${error.message}`);
      }
    }
    
    // Sync deals (skip if there are no deals or if fetching fails)
    if (syncDeals) {
      try {
        // Try to fetch deals, but don't fail the whole sync if it errors
        let deals: any[] = [];
        try {
          const dealsResult = await fetchAllDealsFromHubSpot(client, maxRecords);
          deals = dealsResult.deals;
        } catch (dealsError: any) {
          console.error('Failed to fetch deals, skipping:', dealsError.message);
          errorMessages.push(`Deals sync skipped: ${dealsError.message}`);
          // Continue without failing the whole sync
        }
        
        for (const deal of deals) {
          try {
            const hubspotUrl = await generateHubSpotDealUrl(deal.id);
            const customProperties = extractCustomProperties(deal.properties);
            
            const associatedCompanyIds: string[] = [];
            if (deal.associations?.companies?.results) {
              associatedCompanyIds.push(...deal.associations.companies.results.map((c: any) => c.id));
            }
            
            const amount = deal.properties.amount 
              ? parseFloat(deal.properties.amount) 
              : undefined;
            
            await fetchMutation(api.hubspotSync.syncDealFromHubSpot as any, {
              hubspotDealId: deal.id,
              name: deal.properties.dealname,
              amount,
              stage: deal.properties.dealstage,
              pipeline: deal.properties.pipeline,
              closeDate: deal.properties.closedate,
              associatedCompanyIds: associatedCompanyIds.length > 0 ? associatedCompanyIds : undefined,
              customProperties,
              hubspotUrl: hubspotUrl || undefined,
            }) as any;
            
            stats.dealsSynced++;
          } catch (error: any) {
            stats.errors++;
            errorMessages.push(`Deal ${deal.id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        stats.errors++;
        errorMessages.push(`Deals sync error: ${error.message}`);
      }
    }
    
    // Update sync status
    await fetchMutation(api.hubspotSync.updateSyncStatus as any, {
      status: stats.errors > 0 ? 'error' : 'success',
      stats,
    }) as any;
    
    return NextResponse.json({
      success: true,
      stats,
      errorMessages: errorMessages.slice(0, 20), // Limit error messages
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    
    // Update sync status to error
    try {
      await fetchMutation(api.hubspotSync.updateSyncStatus as any, {
        status: 'error',
      }) as any;
    } catch (e) {
      // Ignore errors updating status
    }
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Sync failed',
    }, { status: 500 });
  }
}

