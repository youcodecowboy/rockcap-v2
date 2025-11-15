import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation } from 'convex/nextjs';

/**
 * API route to fix existing HubSpot data:
 * 1. Extract dates from metadata
 * 2. Link contacts to companies by name matching
 * 3. Link deals to contacts and companies
 */
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json().catch(() => ({}));
    
    if (action === 'extract-dates') {
      const { tableType } = await request.json();
      
      if (!tableType || !['contacts', 'companies', 'deals'].includes(tableType)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid tableType. Must be "contacts", "companies", or "deals"',
        }, { status: 400 });
      }
      
      const result = await fetchMutation(api.hubspotSync.extractDatesFromMetadata, {
        tableType: tableType as 'contacts' | 'companies' | 'deals',
      });
      
      return NextResponse.json({
        success: true,
        result,
      });
    }
    
    if (action === 'link-contacts-to-companies') {
      const result = await fetchMutation(api.hubspotSync.linkContactsToCompanies, {});
      
      return NextResponse.json({
        success: true,
        result,
      });
    }
    
    if (action === 'link-deals') {
      const result = await fetchMutation(api.hubspotSync.linkDealsToContactsAndCompanies, {});
      
      return NextResponse.json({
        success: true,
        result,
      });
    }
    
    if (action === 'fix-all') {
      // Run all fixes in sequence
      const results: any = {};
      
      // Extract dates for all tables
      results.datesContacts = await fetchMutation(api.hubspotSync.extractDatesFromMetadata, {
        tableType: 'contacts',
      });
      results.datesCompanies = await fetchMutation(api.hubspotSync.extractDatesFromMetadata, {
        tableType: 'companies',
      });
      results.datesDeals = await fetchMutation(api.hubspotSync.extractDatesFromMetadata, {
        tableType: 'deals',
      });
      
      // Link contacts to companies
      results.linkContactsToCompanies = await fetchMutation(api.hubspotSync.linkContactsToCompanies, {});
      
      // Link deals to contacts and companies
      results.linkDeals = await fetchMutation(api.hubspotSync.linkDealsToContactsAndCompanies, {});
      
      return NextResponse.json({
        success: true,
        results,
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action. Must be "extract-dates", "link-contacts-to-companies", "link-deals", or "fix-all"',
    }, { status: 400 });
  } catch (error: any) {
    console.error('Fix data error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Fix data failed',
    }, { status: 500 });
  }
}

