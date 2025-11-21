import { NextRequest, NextResponse } from 'next/server';
import { getCompanyProfile } from '@/lib/companiesHouse/client';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';

/**
 * Get company details by company number
 * POST /api/companies-house/get-company-details
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const convexClient = await getAuthenticatedConvexClient();
    try {
      await requireAuth(convexClient);
    } catch (authError) {
      return ErrorResponses.unauthenticated();
    }
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
  } catch (error: unknown) {
    console.error('Error getting company details:', error);
    return ErrorResponses.internalError(
      error instanceof Error ? error : 'Failed to get company details'
    );
  }
}

