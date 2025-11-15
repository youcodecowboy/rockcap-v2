import { NextResponse } from 'next/server';
import { testAuthOAuth, fetchContactsOAuth } from '@/lib/hubspot/oauth';

export async function GET() {
  try {
    console.log('Testing HubSpot OAuth authentication...');
    
    const authResult = await testAuthOAuth();
    
    if (!authResult.success) {
      return NextResponse.json({
        success: false,
        message: 'OAuth authentication failed',
        error: authResult.message,
      }, { status: 401 });
    }

    const contactsResult = await fetchContactsOAuth(5);
    
    return NextResponse.json({
      success: true,
      message: 'OAuth authentication successful!',
      contactsCount: contactsResult.results.length,
      sampleContact: contactsResult.results[0] || null,
    });

  } catch (error) {
    console.error('OAuth test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

