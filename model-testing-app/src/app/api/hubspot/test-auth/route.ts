import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';

/**
 * Test endpoint to verify HubSpot authentication
 */
export async function GET() {
  try {
    const apiKey = process.env.HUBSPOT_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'HUBSPOT_API_KEY not found',
      }, { status: 500 });
    }
    
    console.log('[HubSpot Test] API key found, length:', apiKey.length);
    console.log('[HubSpot Test] API key starts with:', apiKey.substring(0, 7));
    
    // Try to create client
    const client = getHubSpotClient();
    
    // Try a simple API call to test authentication
    try {
      // Use the raw API request method to test
      const testResponse = await client.apiRequest({
        method: 'GET',
        path: '/crm/v3/objects/companies?limit=1',
      } as any);
      
      return NextResponse.json({
        success: true,
        message: 'Authentication successful',
        testResponse: testResponse,
      });
    } catch (apiError: any) {
      console.error('[HubSpot Test] API call failed:', apiError);
      
      return NextResponse.json({
        success: false,
        error: 'API call failed',
        details: {
          message: apiError.message,
          statusCode: apiError.statusCode,
          body: apiError.body,
          response: apiError.response,
        },
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[HubSpot Test] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

