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
      leadsSynced: 0,
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
    
    // Sync contacts and leads
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
            
            const lifecycleStage = contact.properties.lifecyclestage?.toLowerCase();
            const isLead = lifecycleStage === 'lead' || 
                          lifecycleStage === 'opportunity' || 
                          lifecycleStage === 'marketingqualifiedlead' || 
                          lifecycleStage === 'salesqualifiedlead';
            
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
            
            // Always sync as contact first
            await fetchMutation(api.hubspotSync.syncContactFromHubSpot as any, contactData) as any;
            
            stats.contactsSynced++;
            
            // If it's a lead lifecycle stage, also sync as lead
            if (isLead && contact.properties.lifecyclestage) {
              try {
                // Try to find associated company from HubSpot
                let hubspotCompanyUrl: string | undefined;
                let hubspotCompanyId: string | undefined;
                
                // If contact has a company name, try to find the HubSpot company
                if (contact.properties.company) {
                  // We'll need to fetch associations or search by company name
                  // For now, we'll sync the lead and link companies later if needed
                  // The company name will be stored in the lead's companyName field
                }
                
                // Use the same filtered contactData for leads
                const leadData: any = {
                  hubspotContactId: contact.id,
                  name,
                  lifecycleStage: contact.properties.lifecyclestage,
                  hubspotCompanyId,
                  hubspotCompanyUrl,
                  customProperties,
                  hubspotUrl: hubspotUrl || undefined,
                };
                
                // Include date fields from HubSpot
                // HubSpot createdate is a timestamp in milliseconds, convert to ISO string
                if (contact.properties.createdate) {
                  const createdTimestamp = parseInt(contact.properties.createdate);
                  if (!isNaN(createdTimestamp)) {
                    leadData.createdAt = new Date(createdTimestamp).toISOString();
                    leadData.hubspotCreatedDate = contact.properties.createdate;
                  }
                } else if (contact.createdAt) {
                  leadData.createdAt = contact.createdAt;
                }
                
                // HubSpot lastmodifieddate is also a timestamp
                if (contact.properties.lastmodifieddate) {
                  const modifiedTimestamp = parseInt(contact.properties.lastmodifieddate);
                  if (!isNaN(modifiedTimestamp)) {
                    leadData.updatedAt = new Date(modifiedTimestamp).toISOString();
                    leadData.hubspotModifiedDate = contact.properties.lastmodifieddate;
                  }
                } else if (contact.updatedAt) {
                  leadData.updatedAt = contact.updatedAt;
                }
                
                // lastcontacteddate might be a timestamp or date string
                if (contact.properties.lastcontacteddate) {
                  const contactedTimestamp = parseInt(contact.properties.lastcontacteddate);
                  if (!isNaN(contactedTimestamp)) {
                    leadData.lastContactDate = new Date(contactedTimestamp).toISOString();
                  } else {
                    leadData.lastContactDate = contact.properties.lastcontacteddate;
                  }
                }
                
                // Only include fields that have actual values
                if (hasValue(contact.properties.email)) {
                  leadData.email = contact.properties.email;
                }
                if (hasValue(contact.properties.phone)) {
                  leadData.phone = contact.properties.phone;
                }
                if (hasValue(contact.properties.company)) {
                  leadData.company = contact.properties.company;
                }
                if (hasValue(contact.properties.jobtitle)) {
                  leadData.role = contact.properties.jobtitle;
                }
                
                await fetchMutation(api.hubspotSync.syncLeadFromHubSpot as any, leadData) as any;
                
                // Track leads separately if needed
                if (!stats.leadsSynced) stats.leadsSynced = 0;
                stats.leadsSynced++;
              } catch (leadError: any) {
                // Don't fail the whole sync if lead creation fails
                errorMessages.push(`Lead ${contact.id}: ${leadError.message}`);
              }
            }
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
          deals = await fetchAllDealsFromHubSpot(client, maxRecords);
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

