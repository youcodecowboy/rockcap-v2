import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { extractCustomProperties, generateHubSpotCompanyUrl, generateHubSpotContactUrl, generateHubSpotDealUrl } from '@/lib/hubspot/utils';
import { getLifecycleStageName } from '@/lib/hubspot/lifecycleStages';
import { createStageIdToNameMap } from '@/lib/hubspot/pipelines';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

/**
 * Test endpoint to import a single company, contact, and deal
 * and verify they link together correctly
 * 
 * Usage: POST /api/hubspot/test-single-import
 * Body: { contactId: "223385175264" } (or companyId, or dealId)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const contactId = body.contactId || '223385175264'; // Default to the provided contact ID
    
    const apiKey = process.env.HUBSPOT_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'HUBSPOT_API_KEY not found',
      }, { status: 500 });
    }

    const results: any = {
      contact: null,
      company: null,
      deal: null,
      associations: {
        contactToCompany: null,
        contactToDeal: null,
        dealToCompany: null,
        dealToContact: null,
      },
      links: {
        contactLinkedToCompany: false,
        dealLinkedToContact: false,
        dealLinkedToCompany: false,
      },
    };
    
    let contactData: any = null;

    // Step 1: Fetch the contact
    console.log(`[Test Import] Fetching contact ${contactId}...`);
    
    // First, try to fetch a few contacts to see what IDs look like (for debugging)
    const testContactsResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts?limit=5&properties=email,firstname,lastname&associations=companies,deals`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    let availableContactIds: string[] = [];
    if (testContactsResponse.ok) {
      const testContactsData = await testContactsResponse.json();
      availableContactIds = (testContactsData.results || []).map((c: any) => c.id);
      console.log('[Test Import] Available contact IDs (first 5):', availableContactIds);
    }
    
    // Now try to fetch the specific contact
    const contactResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname,phone,company,jobtitle,lifecyclestage,createdate,lastmodifieddate,lastcontacteddate,hs_last_contacted_date,hs_last_activity_date&associations=companies,deals`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!contactResponse.ok) {
      const errorText = await contactResponse.text();
      console.error('[Test Import] Contact fetch error:', {
        status: contactResponse.status,
        statusText: contactResponse.statusText,
        errorText,
        requestedId: contactId,
        availableIds: availableContactIds,
      });
      
      // If the specific contact wasn't found, try using the first available contact
      if (contactResponse.status === 404 && availableContactIds.length > 0) {
        console.log(`[Test Import] Contact ${contactId} not found, trying first available contact: ${availableContactIds[0]}`);
        const fallbackContactId = availableContactIds[0];
        
        const fallbackResponse = await fetch(
          `https://api.hubapi.com/crm/v3/objects/contacts/${fallbackContactId}?properties=email,firstname,lastname,phone,company,jobtitle,lifecyclestage,createdate,lastmodifieddate,lastcontacteddate,hs_last_contacted_date,hs_last_activity_date&associations=companies,deals`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          console.log('[Test Import] Using fallback contact:', {
            id: fallbackData.id,
            name: `${fallbackData.properties.firstname} ${fallbackData.properties.lastname}`,
          });
          // Continue with fallback contact
          contactData = fallbackData;
        } else {
          return NextResponse.json({
            success: false,
            error: `Failed to fetch contact: ${contactResponse.status}. Requested ID: ${contactId}. Available IDs: ${availableContactIds.join(', ')}`,
            debug: {
              requestedId: contactId,
              availableIds: availableContactIds,
              errorText,
            },
          }, { status: 500 });
        }
      } else {
        return NextResponse.json({
          success: false,
          error: `Failed to fetch contact: ${contactResponse.status} ${errorText}`,
          debug: {
            requestedId: contactId,
            availableIds: availableContactIds,
          },
        }, { status: 500 });
      }
    } else {
      contactData = await contactResponse.json();
    }

    // contactData is now set above (either from original fetch or fallback)
    if (!contactData) {
      return NextResponse.json({
        success: false,
        error: 'No contact data retrieved',
      }, { status: 500 });
    }
    
    console.log('[Test Import] Contact fetched:', {
      id: contactData.id,
      name: `${contactData.properties.firstname} ${contactData.properties.lastname}`,
      associations: {
        companies: contactData.associations?.companies?.results?.length || 0,
        deals: contactData.associations?.deals?.results?.length || 0,
      },
    });

    // Extract associated company IDs (deduplicate)
    const associatedCompanyIds: string[] = [];
    const seenCompanyIds = new Set<string>();
    if (contactData.associations?.companies?.results) {
      for (const company of contactData.associations.companies.results) {
        if (!seenCompanyIds.has(company.id)) {
          associatedCompanyIds.push(company.id);
          seenCompanyIds.add(company.id);
        }
      }
    }

    // Extract associated deal IDs (deduplicate)
    const associatedDealIds: string[] = [];
    const seenDealIds = new Set<string>();
    if (contactData.associations?.deals?.results) {
      for (const deal of contactData.associations.deals.results) {
        if (!seenDealIds.has(deal.id)) {
          associatedDealIds.push(deal.id);
          seenDealIds.add(deal.id);
        }
      }
    }

    results.associations.contactToCompany = associatedCompanyIds;
    results.associations.contactToDeal = associatedDealIds;

    // Step 2: Sync the contact
    const contactName = `${contactData.properties.firstname || ''} ${contactData.properties.lastname || ''}`.trim();
    if (!contactName) {
      return NextResponse.json({
        success: false,
        error: 'Contact has no name',
      }, { status: 400 });
    }

    // Parse dates for contact
    let lastContactedDate: string | undefined;
    const contactedValue = contactData.properties.hs_last_contacted_date || contactData.properties.lastcontacteddate;
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
    if (contactData.properties.hs_last_activity_date) {
      const activityStr = String(contactData.properties.hs_last_activity_date);
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

    const lifecycleStageId = contactData.properties.lifecyclestage;
    const lifecycleStageName = lifecycleStageId ? getLifecycleStageName(lifecycleStageId) : undefined;

    const hubspotContactUrl = await generateHubSpotContactUrl(contactData.id);
    const contactCustomProperties = extractCustomProperties(contactData.properties);

    const hasValue = (val: any): val is string => {
      return val != null && val !== '' && typeof val === 'string';
    };

    const contactSyncData: any = {
      hubspotContactId: contactData.id,
      name: contactName,
      lifecycleStage: lifecycleStageId,
      lifecycleStageName,
      customProperties: contactCustomProperties,
      hubspotUrl: hubspotContactUrl || undefined,
      createdAt: contactData.createdAt,
      updatedAt: contactData.updatedAt,
    };

    if (hasValue(contactData.properties.email)) contactSyncData.email = contactData.properties.email;
    if (hasValue(contactData.properties.phone)) contactSyncData.phone = contactData.properties.phone;
    if (hasValue(contactData.properties.company)) contactSyncData.company = contactData.properties.company;
    if (hasValue(contactData.properties.jobtitle)) contactSyncData.role = contactData.properties.jobtitle;
    if (lastContactedDate) contactSyncData.lastContactedDate = lastContactedDate;
    if (lastActivityDate) contactSyncData.lastActivityDate = lastActivityDate;

    const contactResult = await fetchMutation(api.hubspotSync.syncContactFromHubSpot, contactSyncData);
    results.contact = {
      id: contactResult.id,
      action: contactResult.action,
      hubspotId: contactData.id,
      name: contactName,
    };

    // Step 3: Fetch and sync the first associated company (if any)
    if (associatedCompanyIds.length > 0) {
      const companyId = associatedCompanyIds[0];
      console.log(`[Test Import] Fetching company ${companyId}...`);

      const companyResponse = await fetch(
        `https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=name,domain,website,phone,address,city,state,zip,country,industry,lifecyclestage,createdate,lastmodifieddate,hs_last_contacted_date,hs_last_activity_date`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (companyResponse.ok) {
        const companyData = await companyResponse.json();
        console.log('[Test Import] Company fetched:', {
          id: companyData.id,
          name: companyData.properties.name,
        });

        // Parse dates for company
        let companyLastContactedDate: string | undefined;
        if (companyData.properties.hs_last_contacted_date) {
          const contactedStr = String(companyData.properties.hs_last_contacted_date);
          const contactedTimestamp = parseInt(contactedStr);
          if (!isNaN(contactedTimestamp) && contactedTimestamp > 0) {
            const date = contactedTimestamp < 946684800000 ? new Date(contactedTimestamp * 1000) : new Date(contactedTimestamp);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
              companyLastContactedDate = date.toISOString();
            }
          } else if (contactedStr.includes('T')) {
            const testDate = new Date(contactedStr);
            if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
              companyLastContactedDate = contactedStr;
            }
          }
        }

        let companyLastActivityDate: string | undefined;
        if (companyData.properties.hs_last_activity_date) {
          const activityStr = String(companyData.properties.hs_last_activity_date);
          const activityTimestamp = parseInt(activityStr);
          if (!isNaN(activityTimestamp) && activityTimestamp > 0) {
            const date = activityTimestamp < 946684800000 ? new Date(activityTimestamp * 1000) : new Date(activityTimestamp);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
              companyLastActivityDate = date.toISOString();
            }
          } else if (activityStr.includes('T')) {
            const testDate = new Date(activityStr);
            if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
              companyLastActivityDate = activityStr;
            }
          }
        }

        const companyLifecycleStageId = companyData.properties.lifecyclestage;
        const companyLifecycleStageName = companyLifecycleStageId ? getLifecycleStageName(companyLifecycleStageId) : undefined;

        const hubspotCompanyUrl = await generateHubSpotCompanyUrl(companyData.id);
        const companyCustomProperties = extractCustomProperties(companyData.properties);

        const companySyncData: any = {
          hubspotCompanyId: companyData.id,
          name: companyData.properties.name,
          lifecycleStage: companyLifecycleStageId,
          lifecycleStageName: companyLifecycleStageName,
          customProperties: companyCustomProperties,
          hubspotUrl: hubspotCompanyUrl || undefined,
          createdAt: companyData.createdAt,
          updatedAt: companyData.updatedAt,
        };

        if (hasValue(companyData.properties.phone)) companySyncData.phone = companyData.properties.phone;
        if (hasValue(companyData.properties.domain)) companySyncData.website = companyData.properties.domain;
        if (hasValue(companyData.properties.website)) companySyncData.website = companyData.properties.website;
        if (hasValue(companyData.properties.address)) companySyncData.address = companyData.properties.address;
        if (hasValue(companyData.properties.city)) companySyncData.city = companyData.properties.city;
        if (hasValue(companyData.properties.state)) companySyncData.state = companyData.properties.state;
        if (hasValue(companyData.properties.zip)) companySyncData.zip = companyData.properties.zip;
        if (hasValue(companyData.properties.country)) companySyncData.country = companyData.properties.country;
        if (hasValue(companyData.properties.industry)) companySyncData.industry = companyData.properties.industry;
        if (companyLastContactedDate) companySyncData.lastContactedDate = companyLastContactedDate;
        if (companyLastActivityDate) companySyncData.lastActivityDate = companyLastActivityDate;

        const companyResult = await fetchMutation(api.hubspotSync.syncCompanyFromHubSpot, companySyncData);
        results.company = {
          id: companyResult.id,
          action: companyResult.action,
          hubspotId: companyData.id,
          name: companyData.properties.name,
        };

        // Check if contact is linked to company
        const contactRecord = await fetchMutation(api.deals.getContactById as any, { contactId: contactResult.id }).catch(() => null);
        // We'll verify links after syncing the deal
      }
    }

    // Step 4: Fetch and sync the first associated deal (if any)
    if (associatedDealIds.length > 0) {
      const dealId = associatedDealIds[0];
      console.log(`[Test Import] Fetching deal ${dealId}...`);

      // Fetch pipeline/stage definitions
      let stageMap: Map<string, { stageName: string; pipelineName: string; pipelineId: string }>;
      try {
        stageMap = await createStageIdToNameMap();
      } catch (error: any) {
        console.warn('Failed to fetch pipeline/stage definitions:', error.message);
        stageMap = new Map();
      }

      const dealResponse = await fetch(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealname,amount,dealstage,closedate,pipeline,createdate,lastmodifieddate,hs_last_contacted_date,hs_last_activity_date,hs_next_step,dealtype&associations=contacts,companies`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (dealResponse.ok) {
        const dealData = await dealResponse.json();
        console.log('[Test Import] Deal fetched:', {
          id: dealData.id,
          name: dealData.properties.dealname,
          associations: {
            contacts: dealData.associations?.contacts?.results?.length || 0,
            companies: dealData.associations?.companies?.results?.length || 0,
          },
        });

        results.associations.dealToContact = dealData.associations?.contacts?.results?.map((c: any) => c.id) || [];
        results.associations.dealToCompany = dealData.associations?.companies?.results?.map((c: any) => c.id) || [];

        // Extract associated IDs (deduplicate)
        const dealAssociatedContactIds: string[] = [];
        const seenDealContactIds = new Set<string>();
        if (dealData.associations?.contacts?.results) {
          for (const contact of dealData.associations.contacts.results) {
            if (!seenDealContactIds.has(contact.id)) {
              dealAssociatedContactIds.push(contact.id);
              seenDealContactIds.add(contact.id);
            }
          }
        }

        const dealAssociatedCompanyIds: string[] = [];
        const seenDealCompanyIds = new Set<string>();
        if (dealData.associations?.companies?.results) {
          for (const company of dealData.associations.companies.results) {
            if (!seenDealCompanyIds.has(company.id)) {
              dealAssociatedCompanyIds.push(company.id);
              seenDealCompanyIds.add(company.id);
            }
          }
        }

        // Parse amount
        let amount: number | undefined;
        if (dealData.properties.amount) {
          const amountStr = String(dealData.properties.amount).replace(/[^0-9.-]/g, '');
          const parsed = parseFloat(amountStr);
          if (!isNaN(parsed) && parsed > 0) {
            amount = parsed;
          }
        }

        // Parse dates
        let dealLastContactedDate: string | undefined;
        if (dealData.properties.hs_last_contacted_date) {
          const contactedStr = String(dealData.properties.hs_last_contacted_date);
          const contactedTimestamp = parseInt(contactedStr);
          if (!isNaN(contactedTimestamp) && contactedTimestamp > 0) {
            const date = contactedTimestamp < 946684800000 ? new Date(contactedTimestamp * 1000) : new Date(contactedTimestamp);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
              dealLastContactedDate = date.toISOString();
            }
          } else if (contactedStr.includes('T')) {
            const testDate = new Date(contactedStr);
            if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
              dealLastContactedDate = contactedStr;
            }
          }
        }

        let dealLastActivityDate: string | undefined;
        if (dealData.properties.hs_last_activity_date) {
          const activityStr = String(dealData.properties.hs_last_activity_date);
          const activityTimestamp = parseInt(activityStr);
          if (!isNaN(activityTimestamp) && activityTimestamp > 0) {
            const date = activityTimestamp < 946684800000 ? new Date(activityTimestamp * 1000) : new Date(activityTimestamp);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
              dealLastActivityDate = date.toISOString();
            }
          } else if (activityStr.includes('T')) {
            const testDate = new Date(activityStr);
            if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
              dealLastActivityDate = activityStr;
            }
          }
        }

        // Resolve stage and pipeline names
        let stageName: string | undefined;
        let pipelineName: string | undefined;
        if (dealData.properties.dealstage && stageMap.has(dealData.properties.dealstage)) {
          const stageInfo = stageMap.get(dealData.properties.dealstage)!;
          stageName = stageInfo.stageName;
          if (dealData.properties.pipeline && stageInfo.pipelineId === dealData.properties.pipeline) {
            pipelineName = stageInfo.pipelineName;
          }
        }

        if (!pipelineName && dealData.properties.pipeline) {
          for (const [stageId, stageInfo] of stageMap.entries()) {
            if (stageInfo.pipelineId === dealData.properties.pipeline) {
              pipelineName = stageInfo.pipelineName;
              break;
            }
          }
        }

        const hubspotDealUrl = await generateHubSpotDealUrl(dealData.id);
        const dealCustomProperties = extractCustomProperties(dealData.properties);

        const dealSyncData: any = {
          hubspotDealId: dealData.id,
          name: dealData.properties.dealname,
          createdAt: dealData.createdAt,
          updatedAt: dealData.updatedAt,
          customProperties: dealCustomProperties,
          hubspotUrl: hubspotDealUrl || undefined,
        };

        if (amount !== undefined && amount !== null && !isNaN(amount)) {
          dealSyncData.amount = amount;
        }
        if (hasValue(dealData.properties.dealstage)) {
          dealSyncData.stage = dealData.properties.dealstage;
        }
        if (stageName) {
          dealSyncData.stageName = stageName;
        }
        if (hasValue(dealData.properties.pipeline)) {
          dealSyncData.pipeline = dealData.properties.pipeline;
        }
        if (pipelineName) {
          dealSyncData.pipelineName = pipelineName;
        }
        if (hasValue(dealData.properties.closedate)) {
          dealSyncData.closeDate = dealData.properties.closedate;
        }
        if (hasValue(dealData.properties.dealtype)) {
          dealSyncData.dealType = dealData.properties.dealtype;
        }
        if (hasValue(dealData.properties.hs_next_step)) {
          dealSyncData.nextStep = dealData.properties.hs_next_step;
        }
        if (dealLastContactedDate) {
          dealSyncData.lastContactedDate = dealLastContactedDate;
        }
        if (dealLastActivityDate) {
          dealSyncData.lastActivityDate = dealLastActivityDate;
        }
        if (dealAssociatedContactIds.length > 0) {
          dealSyncData.contactIds = dealAssociatedContactIds;
        }
        if (dealAssociatedCompanyIds.length > 0) {
          dealSyncData.companyIds = dealAssociatedCompanyIds;
        }

        const dealResult = await fetchMutation(api.hubspotSync.syncDealToDealsTable, dealSyncData);
        results.deal = {
          id: dealResult.id,
          action: dealResult.action,
          hubspotId: dealData.id,
          name: dealData.properties.dealname,
        };

        // Step 5: Verify links by fetching the synced records
        console.log('[Test Import] Verifying links...');
        
        // Use fetchQuery to get the synced deal
        const syncedDeal = await fetchQuery(api.deals.getDealById, { dealId: dealResult.id }).catch(() => null);
        if (syncedDeal) {
          results.links.dealLinkedToContact = (syncedDeal.linkedContactIds?.length || 0) > 0;
          results.links.dealLinkedToCompany = (syncedDeal.linkedCompanyIds?.length || 0) > 0;
          
          console.log('[Test Import] Deal links:', {
            linkedContactIds: syncedDeal.linkedContactIds,
            linkedCompanyIds: syncedDeal.linkedCompanyIds,
            contactIds: syncedDeal.contactIds,
            companyIds: syncedDeal.companyIds,
          });
          
          // Add link details to results
          results.links.dealLinkedContactIds = syncedDeal.linkedContactIds || [];
          results.links.dealLinkedCompanyIds = syncedDeal.linkedCompanyIds || [];
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Test import completed',
      results,
    });
  } catch (error: any) {
    console.error('[Test Import] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Test import failed',
      stack: error.stack,
    }, { status: 500 });
  }
}

