import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { fetchAllContactsFromHubSpot } from '@/lib/hubspot/contacts';
import { extractCustomProperties, generateHubSpotContactUrl } from '@/lib/hubspot/utils';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation } from 'convex/nextjs';

/**
 * Dedicated endpoint to sync leads from HubSpot
 * Syncs contacts with lead/opportunity lifecycle stages
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const maxRecords = body.maxRecords || 20; // Default to 20 for testing
    
    const client = getHubSpotClient();
    
    // Fetch contacts with lead lifecycle stages
    const contacts = await fetchAllContactsFromHubSpot(client, maxRecords);
    
    const stats = {
      contactsProcessed: 0,
      leadsSynced: 0,
      errors: 0,
    };
    
    const errorMessages: string[] = [];
    
    // Filter contacts to only those with lead lifecycle stages
    const leadContacts = contacts.filter(contact => {
      const lifecycleStage = contact.properties.lifecyclestage?.toLowerCase();
      return lifecycleStage === 'lead' || 
             lifecycleStage === 'opportunity' || 
             lifecycleStage === 'marketingqualifiedlead' || 
             lifecycleStage === 'salesqualifiedlead';
    });
    
    for (const contact of leadContacts) {
      try {
        stats.contactsProcessed++;
        
        const hubspotUrl = await generateHubSpotContactUrl(contact.id);
        const customProperties = extractCustomProperties(contact.properties);
        
        const name = `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim();
        if (!name) {
          continue;
        }
        
        const lifecycleStage = contact.properties.lifecyclestage;
        if (!lifecycleStage) {
          continue;
        }
        
        // Try to find associated company
        let hubspotCompanyId: string | undefined;
        let hubspotCompanyUrl: string | undefined;
        
        if (contact.properties.company) {
          // Try to find company by name in our companies table
          // For now, we'll store the company name and link later if needed
        }
        
        // Filter out null/undefined/empty values
        const hasValue = (val: any): val is string => {
          return val != null && val !== '' && typeof val === 'string';
        };
        
        const contactData: any = {
          hubspotContactId: contact.id,
          name,
          lifecycleStage,
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
        
        // Sync contact first (required for lead)
        await fetchMutation(api.hubspotSync.syncContactFromHubSpot as any, contactData) as any;
        
        // Prepare lead data with date fields
        const leadData: any = {
          hubspotContactId: contact.id,
          name,
          lifecycleStage,
          hubspotCompanyId,
          hubspotCompanyUrl,
          customProperties,
          hubspotUrl: hubspotUrl || undefined,
        };
        
        // Include date fields from HubSpot
        // HubSpot createdate can be a timestamp (milliseconds or seconds) or ISO string
        if (contact.properties.createdate) {
          const createdate = contact.properties.createdate;
          // Try parsing as timestamp first
          const timestamp = parseInt(createdate);
          if (!isNaN(timestamp)) {
            // If timestamp is less than year 2000, it's likely in seconds, multiply by 1000
            const date = timestamp < 946684800000 ? new Date(timestamp * 1000) : new Date(timestamp);
            if (!isNaN(date.getTime())) {
              leadData.createdAt = date.toISOString();
              leadData.hubspotCreatedDate = contact.properties.createdate;
            }
          } else {
            // Might already be an ISO string
            try {
              const date = new Date(createdate);
              if (!isNaN(date.getTime())) {
                leadData.createdAt = date.toISOString();
                leadData.hubspotCreatedDate = contact.properties.createdate;
              }
            } catch (e) {
              // Ignore if can't parse
            }
          }
        } else if (contact.createdAt) {
          // Fallback to SDK createdAt if createdate property not available
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
          // Fallback to SDK updatedAt if lastmodifieddate property not available
          leadData.updatedAt = contact.updatedAt;
        }
        
        // lastcontacteddate might be a timestamp or date string
        if (contact.properties.lastcontacteddate) {
          // Try parsing as timestamp first, then as date string
          const contactedTimestamp = parseInt(contact.properties.lastcontacteddate);
          if (!isNaN(contactedTimestamp)) {
            leadData.lastContactDate = new Date(contactedTimestamp).toISOString();
          } else {
            // Might already be in ISO format or other date format
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
        
        // Sync as lead
        await fetchMutation(api.hubspotSync.syncLeadFromHubSpot as any, leadData) as any;
        
        stats.leadsSynced++;
      } catch (error: any) {
        stats.errors++;
        errorMessages.push(`Contact ${contact.id}: ${error.message}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Leads sync completed`,
      stats: {
        contactsProcessed: stats.contactsProcessed,
        leadsSynced: stats.leadsSynced,
        errors: stats.errors,
        errorDetails: errorMessages.slice(0, 10), // Limit error details
      },
    });
  } catch (error: any) {
    console.error('Leads sync error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to sync leads',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

