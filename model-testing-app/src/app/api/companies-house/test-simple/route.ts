import { NextRequest, NextResponse } from 'next/server';

/**
 * Test endpoint with a simple company lookup
 * Using a well-known company number to test authentication
 */
export async function GET() {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'COMPANIES_HOUSE_API_KEY not found',
    }, { status: 500 });
  }

  try {
    // Test with a simple company lookup (company number 00000006 is Companies House itself)
    const credentials = Buffer.from(`${apiKey}:`).toString('base64');
    const authHeader = `Basic ${credentials}`;

    const testUrl = 'https://api.company-information.service.gov.uk/company/00000006';
    
    console.log('Testing with URL:', testUrl);
    console.log('Auth header length:', authHeader.length);

    const response = await fetch(testUrl, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      return NextResponse.json({
        success: false,
        status: response.status,
        statusText: response.statusText,
        error: responseText,
        authHeaderLength: authHeader.length,
        authHeaderPrefix: authHeader.substring(0, 25),
      }, { status: response.status });
    }

    const data = JSON.parse(responseText);
    return NextResponse.json({
      success: true,
      companyName: data.company_name,
      message: 'Authentication successful!',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}

