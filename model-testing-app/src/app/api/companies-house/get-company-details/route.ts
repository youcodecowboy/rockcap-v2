import { NextRequest, NextResponse } from 'next/server';
import { getCompanyProfile } from '@/lib/companiesHouse/client';

/**
 * Get company details by company number
 * POST /api/companies-house/get-company-details
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyNumber } = body;

    if (!companyNumber) {
      return NextResponse.json(
        { error: 'companyNumber is required' },
        { status: 400 }
      );
    }

    const profile = await getCompanyProfile(companyNumber);

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    console.error('Error getting company details:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get company details',
      },
      { status: 500 }
    );
  }
}

