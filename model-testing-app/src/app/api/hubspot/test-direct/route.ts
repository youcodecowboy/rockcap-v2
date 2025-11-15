import { NextResponse } from 'next/server';
import { testAuthDirect, fetchContactsDirect } from '@/lib/hubspot/directClient';

export async function GET() {
  try {
    console.log('Testing HubSpot authentication with direct API calls...');
    
    // Test authentication
    const authResult = await testAuthDirect();
    
    if (!authResult.success) {
      return NextResponse.json({
        success: false,
        message: 'Authentication failed',
        error: authResult.message,
      }, { status: 401 });
    }

    // Fetch a few contacts to verify it works
    const contactsResult = await fetchContactsDirect(5);
    
    return NextResponse.json({
      success: true,
      message: 'Authentication successful!',
      contactsCount: contactsResult.results.length,
      sampleContact: contactsResult.results[0] || null,
    });

  } catch (error) {
    console.error('Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

