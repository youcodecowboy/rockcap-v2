import { NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';

/**
 * Explore HubSpot data to understand leads structure
 * This endpoint helps us discover what "leads" data is available
 */
export async function GET() {
  try {
    const client = getHubSpotClient();
    const results: any = {
      leadsApi: {},
      contacts: {},
      deals: {},
      companies: {},
    };
    
    // 1. Try to access leads object directly (likely won't work)
    try {
      // Check if leads API exists
      if ((client.crm as any).leads) {
        const leadsResponse = await (client.crm as any).leads.basicApi.getPage(10);
        results.leadsApi = {
          available: true,
          count: leadsResponse.results?.length || 0,
          sample: leadsResponse.results?.slice(0, 3) || [],
        };
      } else {
        results.leadsApi = {
          available: false,
          message: 'Leads API not available in SDK',
        };
      }
    } catch (error: any) {
      results.leadsApi = {
        available: false,
        error: error.message,
        note: 'Leads API is not accessible via HubSpot API (this is expected)',
      };
    }
    
    // 2. Fetch contacts with lifecycle stage filters to identify leads
    try {
      const contactsResponse = await client.crm.contacts.basicApi.getPage(
        50,
        undefined,
        ['email', 'firstname', 'lastname', 'lifecyclestage', 'hs_lead_status', 'company', 'phone', 'jobtitle']
      );
      
      // Analyze lifecycle stages
      const lifecycleStages: Record<string, number> = {};
      const leadContacts: any[] = [];
      
      contactsResponse.results?.forEach((contact: any) => {
        const stage = contact.properties?.lifecyclestage || 'unknown';
        lifecycleStages[stage] = (lifecycleStages[stage] || 0) + 1;
        
        // Identify potential leads
        const stageLower = stage.toLowerCase();
        if (
          stageLower.includes('lead') ||
          stageLower === 'marketingqualifiedlead' ||
          stageLower === 'salesqualifiedlead' ||
          stageLower === 'opportunity'
        ) {
          leadContacts.push({
            id: contact.id,
            name: `${contact.properties?.firstname || ''} ${contact.properties?.lastname || ''}`.trim(),
            email: contact.properties?.email,
            phone: contact.properties?.phone,
            company: contact.properties?.company,
            jobTitle: contact.properties?.jobtitle,
            lifecycleStage: contact.properties?.lifecyclestage,
            leadStatus: contact.properties?.hs_lead_status,
          });
        }
      });
      
      results.contacts = {
        total: contactsResponse.results?.length || 0,
        leadContactsCount: leadContacts.length,
        lifecycleStages,
        sampleLeadContacts: leadContacts.slice(0, 10),
        sampleAllContacts: contactsResponse.results?.slice(0, 5).map((c: any) => ({
          id: c.id,
          name: `${c.properties?.firstname || ''} ${c.properties?.lastname || ''}`.trim(),
          email: c.properties?.email,
          lifecycleStage: c.properties?.lifecyclestage,
          company: c.properties?.company,
        })),
      };
    } catch (error: any) {
      results.contacts = {
        error: error.message,
      };
    }
    
    // 3. Fetch deals (which might represent active leads/opportunities)
    try {
      const dealsResponse = await client.crm.deals.basicApi.getPage(
        50,
        undefined,
        ['dealname', 'dealstage', 'pipeline', 'amount', 'closedate', 'hubspot_owner_id'],
        undefined,
        true // Include associations
      );
      
      // Handle response structure - check if results is an array
      const dealsArray = Array.isArray(dealsResponse.results) 
        ? dealsResponse.results 
        : (dealsResponse.results ? [dealsResponse.results] : []);
      
      // Analyze deal stages
      const dealStages: Record<string, number> = {};
      const pipelines: Record<string, number> = {};
      
      dealsArray.forEach((deal: any) => {
        const stage = deal.properties?.dealstage || 'unknown';
        const pipeline = deal.properties?.pipeline || 'unknown';
        dealStages[stage] = (dealStages[stage] || 0) + 1;
        pipelines[pipeline] = (pipelines[pipeline] || 0) + 1;
      });
      
      results.deals = {
        total: dealsArray.length,
        dealStages,
        pipelines,
        sampleDeals: dealsArray.slice(0, 10).map((d: any) => ({
          id: d.id,
          name: d.properties?.dealname,
          stage: d.properties?.dealstage,
          pipeline: d.properties?.pipeline,
          amount: d.properties?.amount,
          closeDate: d.properties?.closedate,
          associations: {
            companies: d.associations?.companies?.results?.length || 0,
            contacts: d.associations?.contacts?.results?.length || 0,
          },
        })),
      };
    } catch (error: any) {
      results.deals = {
        error: error.message,
        stack: error.stack,
      };
    }
    
    // 4. Fetch companies to see if they're associated with leads
    try {
      const companiesResponse = await client.crm.companies.basicApi.getPage(
        20,
        undefined,
        ['name', 'domain', 'lifecyclestage', 'industry']
      );
      
      const companyLifecycleStages: Record<string, number> = {};
      companiesResponse.results?.forEach((company: any) => {
        const stage = company.properties?.lifecyclestage || 'unknown';
        companyLifecycleStages[stage] = (companyLifecycleStages[stage] || 0) + 1;
      });
      
      results.companies = {
        total: companiesResponse.results?.length || 0,
        lifecycleStages: companyLifecycleStages,
        sampleCompanies: companiesResponse.results?.slice(0, 5).map((c: any) => ({
          id: c.id,
          name: c.properties?.name,
          domain: c.properties?.domain,
          lifecycleStage: c.properties?.lifecyclestage,
          industry: c.properties?.industry,
        })),
      };
    } catch (error: any) {
      results.companies = {
        error: error.message,
      };
    }
    
    // Summary and recommendations
    const summary = {
      leadsApiAvailable: results.leadsApi.available === true,
      potentialLeadsFromContacts: results.contacts.leadContactsCount || 0,
      totalDeals: results.deals.total || 0,
      recommendation: results.leadsApi.available
        ? 'Leads API is available! We can sync leads directly.'
        : 'Leads API not available. Use Contacts with lead lifecycle stages or Deals as leads.',
    };
    
    return NextResponse.json({
      success: true,
      summary,
      results,
    });
    
  } catch (error: any) {
    console.error('Exploration error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}

