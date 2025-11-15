import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const token = process.env.HUBSPOT_API_KEY;
    
    console.log('Token exists:', !!token);
    console.log('Token starts with pat-:', token?.startsWith('pat-'));
    console.log('Token length:', token?.length);
    
    if (!token) {
      return NextResponse.json({
        success: false,
        error: 'HUBSPOT_API_KEY not found in environment',
      }, { status: 500 });
    }

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      return NextResponse.json({
        success: false,
        status: response.status,
        error: responseText,
        tokenInfo: {
          hasToken: !!token,
          startsWithPat: token?.startsWith('pat-'),
          length: token?.length,
        }
      }, { status: response.status });
    }

    const data = JSON.parse(responseText);
    
    return NextResponse.json({
      success: true,
      message: 'Authentication successful!',
      contactsCount: data.results?.length || 0,
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

