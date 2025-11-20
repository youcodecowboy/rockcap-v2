import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { fetchAllDealsFromHubSpot } from '@/lib/hubspot/deals';
import { extractCustomProperties, generateHubSpotDealUrl } from '@/lib/hubspot/utils';
import { createStageIdToNameMap } from '@/lib/hubspot/pipelines';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const maxRecords = body.maxRecords || 20; // Default to 20 for testing
    
    const client = getHubSpotClient();
    
    // Fetch pipeline/stage definitions to map IDs to names
    // First try to get from Convex (if already synced), otherwise fetch from HubSpot
    let stageMap: Map<string, { stageName: string; pipelineName: string; pipelineId: string }> = new Map();
    
    try {
      // Try to get pipelines from Convex first
      const pipelines = await fetchQuery(api.hubspotSync.getPipelineName as any, { pipelineId: '' }) as any;
      // If we have pipelines in Convex, build the map from there
      // For now, we'll still fetch from HubSpot to ensure we have the latest
      // In the future, we could optimize this to use Convex data if available
    } catch (error) {
      // Convex query might fail if no pipelines synced yet, that's okay
    }
    
    try {
      stageMap = await createStageIdToNameMap();
      console.log(`Loaded ${stageMap.size} stage mappings from HubSpot pipelines`);
    } catch (error: any) {
      console.warn('Failed to fetch pipeline/stage definitions from HubSpot, will use IDs only:', error.message);
      // If HubSpot fetch fails, we could try to build from Convex data
      // For now, we'll just use IDs
    }
    
    const deals = await fetchAllDealsFromHubSpot(client, maxRecords);
    
    let synced = 0;
    let updated = 0;
    let created = 0;
    let errors = 0;
    const errorMessages: string[] = [];
    
    // Generate HubSpot URLs and sync each deal
    for (const deal of deals) {
      try {
        const hubspotUrl = await generateHubSpotDealUrl(deal.id);
        const customProperties = extractCustomProperties(deal.properties);
        
        // Extract associated company IDs (deduplicate)
        const associatedCompanyIds: string[] = [];
        const seenCompanyIds = new Set<string>();
        if (deal.associations?.companies?.results) {
          for (const company of deal.associations.companies.results) {
            if (!seenCompanyIds.has(company.id)) {
              associatedCompanyIds.push(company.id);
              seenCompanyIds.add(company.id);
            }
          }
        }
        
        // Parse amount - HubSpot returns as string, might have currency symbols
        let amount: number | undefined;
        if (deal.properties.amount) {
          // Remove any currency symbols and parse
          const amountStr = String(deal.properties.amount).replace(/[^0-9.-]/g, '');
          const parsed = parseFloat(amountStr);
          if (!isNaN(parsed) && parsed > 0) {
            amount = parsed;
          }
        }
        
        // Extract associated contact IDs (deduplicate)
        const associatedContactIds: string[] = [];
        const seenContactIds = new Set<string>();
        if (deal.associations?.contacts?.results) {
          for (const contact of deal.associations.contacts.results) {
            if (!seenContactIds.has(contact.id)) {
              associatedContactIds.push(contact.id);
              seenContactIds.add(contact.id);
            }
          }
        }
        
        // Parse dates for last contacted and last activity
        let lastContactedDate: string | undefined;
        if (deal.properties.hs_last_contacted_date) {
          const contactedStr = String(deal.properties.hs_last_contacted_date);
          const contactedTimestamp = parseInt(contactedStr);
          if (!isNaN(contactedTimestamp) && contactedTimestamp > 0) {
            const date = contactedTimestamp < 946684800000 ? new Date(contactedTimestamp * 1000) : new Date(contactedTimestamp);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
              lastContactedDate = date.toISOString();
            }
          } else if (contactedStr.includes('T')) {
            // Already an ISO string
            const testDate = new Date(contactedStr);
            if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
              lastContactedDate = contactedStr;
            }
          }
        }
        
        let lastActivityDate: string | undefined;
        if (deal.properties.hs_last_activity_date) {
          const activityStr = String(deal.properties.hs_last_activity_date);
          const activityTimestamp = parseInt(activityStr);
          if (!isNaN(activityTimestamp) && activityTimestamp > 0) {
            const date = activityTimestamp < 946684800000 ? new Date(activityTimestamp * 1000) : new Date(activityTimestamp);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
              lastActivityDate = date.toISOString();
            }
          } else if (activityStr.includes('T')) {
            // Already an ISO string
            const testDate = new Date(activityStr);
            if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
              lastActivityDate = activityStr;
            }
          }
        }
        
        // Resolve stage and pipeline names from IDs
        let stageName: string | undefined;
        let pipelineName: string | undefined;
        if (deal.properties.dealstage && stageMap.has(deal.properties.dealstage)) {
          const stageInfo = stageMap.get(deal.properties.dealstage)!;
          stageName = stageInfo.stageName;
          // Also set pipeline name if we have the stage info
          if (deal.properties.pipeline && stageInfo.pipelineId === deal.properties.pipeline) {
            pipelineName = stageInfo.pipelineName;
          }
        }
        
        // If we don't have pipeline name from stage lookup, try to get it from pipeline ID
        if (!pipelineName && deal.properties.pipeline) {
          // Find pipeline by ID in the stage map (check any stage from that pipeline)
          for (const [stageId, stageInfo] of stageMap.entries()) {
            if (stageInfo.pipelineId === deal.properties.pipeline) {
              pipelineName = stageInfo.pipelineName;
              break;
            }
          }
        }
        
        // Debug logging for first deal to see what we're getting
        if (synced === 0) {
          console.log('Sample deal data being synced:', {
            id: deal.id,
            name: deal.properties.dealname,
            amount: deal.properties.amount,
            amountParsed: amount,
            createdAt: deal.createdAt,
            updatedAt: deal.updatedAt,
            lastmodifieddate: deal.properties.lastmodifieddate,
            createdate: deal.properties.createdate,
            dealstage: deal.properties.dealstage,
            stageName,
            pipeline: deal.properties.pipeline,
            pipelineName,
            hs_last_contacted_date: deal.properties.hs_last_contacted_date,
            lastContactedDate,
            hs_last_activity_date: deal.properties.hs_last_activity_date,
            lastActivityDate,
            associations: {
              contacts: deal.associations?.contacts?.results?.length || 0,
              companies: deal.associations?.companies?.results?.length || 0,
            },
          });
        }
        
        // Filter out null/undefined/empty values before sending to mutation
        // Convex doesn't accept null - only actual values or undefined (omitted)
        const hasValue = (val: any): val is string => {
          return val != null && val !== '' && typeof val === 'string';
        };
        
        const dealData: any = {
          hubspotDealId: deal.id,
          name: deal.properties.dealname,
          createdAt: deal.createdAt,
          updatedAt: deal.updatedAt, // Should be ISO string from deals.ts
          customProperties,
          hubspotUrl: hubspotUrl || undefined,
        };
        
        // Only include hubspotOwnerId if it has a value (not null/undefined/empty)
        if (hasValue(deal.properties.hubspot_owner_id)) {
          dealData.hubspotOwnerId = deal.properties.hubspot_owner_id;
        }
        
        // Only include fields that have actual non-null, non-empty values
        if (amount !== undefined && amount !== null && !isNaN(amount)) {
          dealData.amount = amount;
        }
        if (hasValue(deal.properties.dealstage)) {
          dealData.stage = deal.properties.dealstage; // Stage ID
        }
        if (stageName) {
          dealData.stageName = stageName; // Human-readable stage name
        }
        if (hasValue(deal.properties.pipeline)) {
          dealData.pipeline = deal.properties.pipeline; // Pipeline ID
        }
        if (pipelineName) {
          dealData.pipelineName = pipelineName; // Human-readable pipeline name
        }
        if (hasValue(deal.properties.closedate)) {
          dealData.closeDate = deal.properties.closedate;
        }
        if (hasValue(deal.properties.dealtype)) {
          dealData.dealType = deal.properties.dealtype;
        }
        if (hasValue(deal.properties.hs_next_step)) {
          dealData.nextStep = deal.properties.hs_next_step;
        }
        if (lastContactedDate) {
          dealData.lastContactedDate = lastContactedDate;
        }
        if (lastActivityDate) {
          dealData.lastActivityDate = lastActivityDate;
        }
        if (associatedContactIds.length > 0) {
          dealData.contactIds = associatedContactIds;
        }
        if (associatedCompanyIds.length > 0) {
          dealData.companyIds = associatedCompanyIds;
        }
        
        // Sync to deals table (for prospecting)
        const result = await fetchMutation(api.hubspotSync.syncDealToDealsTable as any, dealData) as any;
        
        synced++;
        if (result.action === 'created') {
          created++;
        } else {
          updated++;
        }
      } catch (error: any) {
        errors++;
        errorMessages.push(`Error syncing deal ${deal.id}: ${error.message}`);
        console.error(`Error syncing deal ${deal.id}:`, error);
      }
    }
    
    return NextResponse.json({
      success: true,
      synced,
      created,
      updated,
      errors,
      errorMessages: errorMessages.slice(0, 10), // Limit error messages
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Sync failed',
    }, { status: 500 });
  }
}

