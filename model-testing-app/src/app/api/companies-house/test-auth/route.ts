import { NextRequest, NextResponse } from 'next/server';

/**
 * Test endpoint to verify Companies House API key is loaded correctly
 */
export async function GET() {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'COMPANIES_HOUSE_API_KEY not found in environment variables',
      availableEnvVars: Object.keys(process.env).filter(k => k.includes('COMPANIES')),
    }, { status: 500 });
  }

  // Test the API key format
  const credentials = Buffer.from(`${apiKey}:`).toString('base64');
  const authHeader = `Basic ${credentials}`;

  return NextResponse.json({
    success: true,
    apiKeyLength: apiKey.length,
    apiKeyPrefix: apiKey.substring(0, 8),
    authHeaderLength: authHeader.length,
    authHeaderPrefix: authHeader.substring(0, 20),
    // Don't expose full key in response
  });
}

