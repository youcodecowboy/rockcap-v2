import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { fetchAllCompaniesFromHubSpot } from '@/lib/hubspot/companies';
import { fetchAllContactsFromHubSpot } from '@/lib/hubspot/contacts';
import { fetchAllDealsFromHubSpot } from '@/lib/hubspot/deals';
import { extractCustomProperties, generateHubSpotCompanyUrl, generateHubSpotContactUrl, generateHubSpotDealUrl } from '@/lib/hubspot/utils';
import { discoverProperties, clearPropertiesCache } from '@/lib/hubspot/properties';
import { clearOwnersCache, resolveOwnerName } from '@/lib/hubspot/owners';
import { fetchEngagementsForCompany } from '@/lib/hubspot/activities';
import { dedupeAssociationIds } from '@/lib/hubspot/normalize';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
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
      maxRecords = Number.POSITIVE_INFINITY,
      syncCompanies = true,
      syncContacts = true,
      syncDeals = true,
      syncActivities = true,
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

    // Warm property/owner caches at sync start so downstream fetchers don't re-discover per call
    clearPropertiesCache();
    clearOwnersCache();
    await discoverProperties('companies');
    await discoverProperties('contacts');
    await discoverProperties('deals');

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
            
            // Name fallback — HubSpot allows empty-name companies; mutation
            // requires v.string(). Use a sensible fallback so every company
            // lands in Convex and can be linked to by its contacts/deals.
            const rawName = company.properties.name;
            const name = (typeof rawName === 'string' && rawName.trim())
              ? rawName.trim()
              : `(unnamed company ${company.id})`;

            // Extract and dedupe association IDs so the mutation's linker
            // can resolve contacts/deals back to this company.
            const hubspotContactIdsFromAssoc = dedupeAssociationIds(
              (company as any).associations?.contacts?.results ?? [],
            );
            const hubspotDealIdsFromAssoc = dedupeAssociationIds(
              (company as any).associations?.deals?.results ?? [],
            );

            const companyData: any = {
              hubspotCompanyId: company.id,
              name,
              lifecycleStage: company.properties.lifecyclestage,
              customProperties,
              hubspotUrl: hubspotUrl || undefined,
              hubspotContactIds: hubspotContactIdsFromAssoc.length > 0 ? hubspotContactIdsFromAssoc : undefined,
              hubspotDealIds: hubspotDealIdsFromAssoc.length > 0 ? hubspotDealIdsFromAssoc : undefined,
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
            if (hasValue(company.properties.hubspot_owner_id)) {
              companyData.ownerName = await resolveOwnerName(company.properties.hubspot_owner_id) ?? undefined;
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
            
            // Extract and dedupe HubSpot association IDs so the mutation can
            // resolve them to Convex company/deal records. HubSpot returns both
            // HUBSPOT_DEFINED and USER_DEFINED association entries for the same
            // pair — dedupeAssociationIds collapses them.
            const hubspotCompanyIds = dedupeAssociationIds(
              (contact as any).associations?.companies?.results ?? [],
            );
            const hubspotDealIds = dedupeAssociationIds(
              (contact as any).associations?.deals?.results ?? [],
            );

            const contactData: any = {
              hubspotContactId: contact.id,
              name,
              lifecycleStage: contact.properties.lifecyclestage,
              customProperties,
              hubspotUrl: hubspotUrl || undefined,
              // Always pass the HubSpot ID arrays — the mutation's linker will
              // resolve them to Convex IDs when companies/deals are synced.
              hubspotCompanyIds: hubspotCompanyIds.length > 0 ? hubspotCompanyIds : undefined,
              hubspotDealIds: hubspotDealIds.length > 0 ? hubspotDealIds : undefined,
            };

            // Only include fields that have actual non-null, non-empty string values
            if (hasValue(contact.properties.email)) {
              contactData.email = contact.properties.email;
            }
            // Phone: prefer primary; fall back to mobilephone when primary empty
            if (hasValue(contact.properties.phone)) {
              contactData.phone = contact.properties.phone;
            } else if (hasValue(contact.properties.mobilephone)) {
              contactData.phone = contact.properties.mobilephone;
            }
            if (hasValue(contact.properties.company)) {
              contactData.company = contact.properties.company;
            }
            if (hasValue(contact.properties.jobtitle)) {
              contactData.role = contact.properties.jobtitle;
            }
            // Activity dates — use tenant-populated `notes_last_*` fields
            if (hasValue(contact.properties.notes_last_contacted)) {
              contactData.lastContactedDate = contact.properties.notes_last_contacted;
            } else if (hasValue(contact.properties.lastcontacteddate)) {
              contactData.lastContactedDate = contact.properties.lastcontacteddate;
            }
            if (hasValue(contact.properties.notes_last_updated)) {
              contactData.lastActivityDate = contact.properties.notes_last_updated;
            }
            const linkedinIdentifier = contact.properties.hublead_linkedin_public_identifier;
            if (linkedinIdentifier && typeof linkedinIdentifier === 'string' && linkedinIdentifier.trim()) {
              contactData.linkedinUrl = `https://www.linkedin.com/in/${linkedinIdentifier.trim()}`;
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

            // Extract and dedupe association IDs from deal (mirrors company / contact patterns).
            const companyIds = dedupeAssociationIds(
              (deal as any).associations?.companies?.results ?? [],
            );
            const contactIds = dedupeAssociationIds(
              (deal as any).associations?.contacts?.results ?? [],
            );

            const amount = deal.properties.amount
              ? parseFloat(deal.properties.amount)
              : undefined;

            // Name fallback — HubSpot allows empty-name deals (draft pipelines, auto-
            // created from meetings). Mutation requires v.string().
            const rawDealName = deal.properties.dealname;
            const dealName = (typeof rawDealName === 'string' && rawDealName.trim())
              ? rawDealName.trim()
              : `(unnamed deal ${deal.id})`;

            const dealData: any = {
              hubspotDealId: deal.id,
              name: dealName,
              amount,
              stage: deal.properties.dealstage,
              pipeline: deal.properties.pipeline,
              closeDate: deal.properties.closedate,
              dealType: deal.properties.dealtype,
              hubspotOwnerId: deal.properties.hubspot_owner_id,
              companyIds: companyIds.length > 0 ? companyIds : undefined,
              contactIds: contactIds.length > 0 ? contactIds : undefined,
              customProperties,
              hubspotUrl: hubspotUrl || undefined,
            };

            const probRaw = deal.properties.hs_deal_stage_probability;
            if (probRaw != null && probRaw !== '') {
              const n = parseFloat(String(probRaw));
              if (Number.isFinite(n)) dealData.probability = n;
            }
            if (deal.properties.spv_name != null && deal.properties.spv_name !== '') {
              dealData.spvName = deal.properties.spv_name;
            }
            if (deal.properties.hs_is_closed != null) {
              dealData.isClosed = deal.properties.hs_is_closed === 'true' || deal.properties.hs_is_closed === true;
            }
            if (deal.properties.hs_is_closed_won != null) {
              dealData.isClosedWon = deal.properties.hs_is_closed_won === 'true' || deal.properties.hs_is_closed_won === true;
            }

            // NB: call syncDealToDealsTable (writes to `deals` table) — NOT
            // syncDealFromHubSpot (legacy, writes to `projects` table).
            await fetchMutation(api.hubspotSync.syncDealToDealsTable as any, dealData) as any;

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
    
    // Engagement sync: per-company
    if (syncActivities) {
      try {
        const convexCompanies = await fetchQuery(api.companies.listWithHubspotId, {}) as any[];
        let engagementTotal = 0;
        let engagementErrors = 0;

        for (const company of convexCompanies) {
          try {
            const engagements = await fetchEngagementsForCompany(company.hubspotCompanyId);
            for (const eng of engagements) {
              try {
                const normalizedDirection =
                  eng.direction === 'inbound' || eng.direction === 'outbound' ? eng.direction : undefined;
                const ownerName = eng.ownerId ? await resolveOwnerName(eng.ownerId) : null;

                await fetchMutation(api.hubspotSync.activities.syncActivityFromHubSpot, {
                  hubspotActivityId: eng.id,
                  activityType: eng.type,
                  activityDate: eng.timestamp,
                  subject: eng.subject,
                  bodyPreview: eng.bodyPreview,
                  bodyHtml: eng.bodyHtml,
                  direction: normalizedDirection,
                  status: eng.status,
                  duration: eng.duration,
                  fromEmail: eng.fromEmail,
                  toEmails: eng.toEmails,
                  outcome: eng.outcome,
                  metadata: eng.metadata,
                  hubspotCompanyId: company.hubspotCompanyId,
                  hubspotContactIds: eng.contactIds,
                  hubspotDealIds: eng.dealIds,
                  hubspotOwnerId: eng.ownerId,
                  ownerName: ownerName ?? undefined,
                });
                engagementTotal++;
              } catch (engErr) {
                engagementErrors++;
                console.error(`[sync-all] engagement ${eng.id} failed:`, engErr);
              }
            }
          } catch (companyErr) {
            engagementErrors++;
            console.error(`[sync-all] engagements for company ${company.hubspotCompanyId} failed:`, companyErr);
          }
        }

        console.log(`[sync-all] Engagements: ${engagementTotal} upserted, ${engagementErrors} errors`);
        (stats as any).activitiesSynced = engagementTotal;
      } catch (err) {
        console.error('[sync-all] activity sync phase failed:', err);
        stats.errors++;
        errorMessages.push(`Activity sync failed: ${(err as Error).message}`);
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

