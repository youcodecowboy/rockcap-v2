import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { fetchAllCompaniesFromHubSpot } from '@/lib/hubspot/companies';
import { extractCustomProperties, generateHubSpotCompanyUrl } from '@/lib/hubspot/utils';
import { getLifecycleStageName } from '@/lib/hubspot/lifecycleStages';
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
    const { maxRecords = 100 } = await request.json().catch(() => ({}));
    
    // Verify API key is available
    const apiKey = process.env.HUBSPOT_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'HUBSPOT_API_KEY not found in environment variables. Please restart your Next.js server after adding it to .env.local',
      }, { status: 500 });
    }
    
    console.log('[HubSpot Sync] API key found, length:', apiKey.length);
    
    const client = getHubSpotClient();
    const companies = await fetchAllCompaniesFromHubSpot(client, maxRecords);
    
    let synced = 0;
    let updated = 0;
    let created = 0;
    let errors = 0;
    const errorMessages: string[] = [];
    
    // Generate HubSpot URLs and sync each company
    for (const company of companies) {
      try {
        const hubspotUrl = await generateHubSpotCompanyUrl(company.id);
        const customProperties = extractCustomProperties(company.properties);
        
        // Parse dates for last contacted and last activity
        let lastContactedDate: string | undefined;
        if (company.properties.hs_last_contacted_date) {
          const contactedStr = String(company.properties.hs_last_contacted_date);
          const contactedTimestamp = parseInt(contactedStr);
          if (!isNaN(contactedTimestamp) && contactedTimestamp > 0) {
            const date = contactedTimestamp < 946684800000 ? new Date(contactedTimestamp * 1000) : new Date(contactedTimestamp);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
              lastContactedDate = date.toISOString();
            }
          } else if (contactedStr.includes('T')) {
            const testDate = new Date(contactedStr);
            if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
              lastContactedDate = contactedStr;
            }
          }
        }
        
        let lastActivityDate: string | undefined;
        if (company.properties.hs_last_activity_date) {
          const activityStr = String(company.properties.hs_last_activity_date);
          const activityTimestamp = parseInt(activityStr);
          if (!isNaN(activityTimestamp) && activityTimestamp > 0) {
            const date = activityTimestamp < 946684800000 ? new Date(activityTimestamp * 1000) : new Date(activityTimestamp);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
              lastActivityDate = date.toISOString();
            }
          } else if (activityStr.includes('T')) {
            const testDate = new Date(activityStr);
            if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
              lastActivityDate = activityStr;
            }
          }
        }
        
        // Resolve lifecycle stage name
        const lifecycleStageId = company.properties.lifecyclestage;
        const lifecycleStageName = lifecycleStageId ? getLifecycleStageName(lifecycleStageId) : undefined;
        
        // Filter out null/undefined/empty values
        const hasValue = (val: any): val is string => {
          return val != null && val !== '' && typeof val === 'string';
        };
        
        // Extract associated contact IDs from associations (if available)
        const associatedContactIds: string[] = [];
        const seenContactIds = new Set<string>();
        if (company.associations?.contacts?.results) {
          for (const contact of company.associations.contacts.results) {
            if (!seenContactIds.has(contact.id)) {
              associatedContactIds.push(contact.id);
              seenContactIds.add(contact.id);
            }
          }
        }
        
        // Extract associated deal IDs from associations (if available)
        const associatedDealIds: string[] = [];
        const seenDealIds = new Set<string>();
        if (company.associations?.deals?.results) {
          for (const deal of company.associations.deals.results) {
            if (!seenDealIds.has(deal.id)) {
              associatedDealIds.push(deal.id);
              seenDealIds.add(deal.id);
            }
          }
        }
        
        const companyData: any = {
          hubspotCompanyId: company.id,
          name: company.properties.name,
          lifecycleStage: lifecycleStageId,
          lifecycleStageName,
          customProperties,
          hubspotUrl: hubspotUrl || undefined,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
        };
        
        if (associatedContactIds.length > 0) companyData.hubspotContactIds = associatedContactIds;
        if (associatedDealIds.length > 0) companyData.hubspotDealIds = associatedDealIds;
        
        // Only include fields that have actual values (not null/undefined/empty)
        if (hasValue(company.properties.hubspot_owner_id)) companyData.hubspotOwnerId = company.properties.hubspot_owner_id;
        if (hasValue(company.properties.phone)) companyData.phone = company.properties.phone;
        if (hasValue(company.properties.domain)) companyData.website = company.properties.domain; // Use domain as website
        if (hasValue(company.properties.website)) companyData.website = company.properties.website; // Prefer website if available
        if (hasValue(company.properties.address)) companyData.address = company.properties.address;
        if (hasValue(company.properties.city)) companyData.city = company.properties.city;
        if (hasValue(company.properties.state)) companyData.state = company.properties.state;
        if (hasValue(company.properties.zip)) companyData.zip = company.properties.zip;
        if (hasValue(company.properties.country)) companyData.country = company.properties.country;
        if (hasValue(company.properties.industry)) companyData.industry = company.properties.industry;
        if (lastContactedDate) companyData.lastContactedDate = lastContactedDate;
        if (lastActivityDate) companyData.lastActivityDate = lastActivityDate;
        
        const result = await fetchMutation(
          api.hubspotSync.syncCompanyFromHubSpot as any, 
          companyData
        ) as { action: 'created' | 'updated'; id: string };
        
        synced++;
        if (result.action === 'created') {
          created++;
        } else {
          updated++;
        }
      } catch (error: any) {
        errors++;
        errorMessages.push(`Error syncing company ${company.id}: ${error.message}`);
        console.error(`Error syncing company ${company.id}:`, error);
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

