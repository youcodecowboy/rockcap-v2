import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { fetchAllContactsFromHubSpot } from '@/lib/hubspot/contacts';
import { extractCustomProperties, generateHubSpotContactUrl } from '@/lib/hubspot/utils';
import { getLifecycleStageName } from '@/lib/hubspot/lifecycleStages';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation } from 'convex/nextjs';

export async function POST(request: NextRequest) {
  try {
    const { maxRecords = 100 } = await request.json().catch(() => ({}));
    
    const client = getHubSpotClient();
    const contacts = await fetchAllContactsFromHubSpot(client, maxRecords);
    
    let synced = 0;
    let updated = 0;
    let created = 0;
    let errors = 0;
    const errorMessages: string[] = [];
    
    // Generate HubSpot URLs and sync each contact
    for (const contact of contacts) {
      try {
        const hubspotUrl = await generateHubSpotContactUrl(contact.id);
        const customProperties = extractCustomProperties(contact.properties);
        
        const name = `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim();
        if (!name) {
          continue; // Skip contacts without names
        }
        
        // Parse dates for last contacted and last activity
        // Try both legacy and new property names
        let lastContactedDate: string | undefined;
        const contactedValue = contact.properties.hs_last_contacted_date || contact.properties.lastcontacteddate;
        if (contactedValue) {
          const contactedStr = String(contactedValue);
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
        if (contact.properties.hs_last_activity_date) {
          const activityStr = String(contact.properties.hs_last_activity_date);
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
        const lifecycleStageId = contact.properties.lifecyclestage;
        const lifecycleStageName = lifecycleStageId ? getLifecycleStageName(lifecycleStageId) : undefined;
        
        // Filter out null/undefined/empty values
        const hasValue = (val: any): val is string => {
          return val != null && val !== '' && typeof val === 'string';
        };
        
        // Extract associated company IDs from associations (if available)
        const associatedCompanyIds: string[] = [];
        const seenCompanyIds = new Set<string>();
        if (contact.associations?.companies?.results) {
          for (const company of contact.associations.companies.results) {
            if (!seenCompanyIds.has(company.id)) {
              associatedCompanyIds.push(company.id);
              seenCompanyIds.add(company.id);
            }
          }
        }
        
        // Extract associated deal IDs from associations (if available)
        const associatedDealIds: string[] = [];
        const seenDealIds = new Set<string>();
        if (contact.associations?.deals?.results) {
          for (const deal of contact.associations.deals.results) {
            if (!seenDealIds.has(deal.id)) {
              associatedDealIds.push(deal.id);
              seenDealIds.add(deal.id);
            }
          }
        }
        
        const contactData: any = {
          hubspotContactId: contact.id,
          name,
          lifecycleStage: lifecycleStageId,
          lifecycleStageName,
          customProperties,
          hubspotUrl: hubspotUrl || undefined,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        };
        
        // Only include fields that have actual values (not null/undefined/empty)
        if (hasValue(contact.properties.email)) contactData.email = contact.properties.email;
        if (hasValue(contact.properties.phone)) contactData.phone = contact.properties.phone;
        if (hasValue(contact.properties.company)) contactData.company = contact.properties.company;
        if (hasValue(contact.properties.jobtitle)) contactData.role = contact.properties.jobtitle;
        if (hasValue(contact.properties.hubspot_owner_id)) contactData.hubspotOwnerId = contact.properties.hubspot_owner_id;
        if (lastContactedDate) contactData.lastContactedDate = lastContactedDate;
        if (lastActivityDate) contactData.lastActivityDate = lastActivityDate;
        if (associatedCompanyIds.length > 0) contactData.hubspotCompanyIds = associatedCompanyIds;
        if (associatedDealIds.length > 0) contactData.hubspotDealIds = associatedDealIds;
        
        const result = await fetchMutation(api.hubspotSync.syncContactFromHubSpot as any, contactData);
        
        synced++;
        if (result.action === 'created') {
          created++;
        } else {
          updated++;
        }
      } catch (error: any) {
        errors++;
        errorMessages.push(`Error syncing contact ${contact.id}: ${error.message}`);
        console.error(`Error syncing contact ${contact.id}:`, error);
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

