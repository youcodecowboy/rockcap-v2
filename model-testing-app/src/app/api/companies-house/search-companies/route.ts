import { NextRequest, NextResponse } from 'next/server';
import { searchCompaniesBySicCodes } from '@/lib/companiesHouse/client';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';

/**
 * Search companies by SIC codes
 * POST /api/companies-house/search-companies
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
    const { sicCodes, itemsPerPage = 100, startIndex = 0 } = body;

    if (!sicCodes || !Array.isArray(sicCodes) || sicCodes.length === 0) {
      return NextResponse.json(
        { error: 'sicCodes array is required' },
        { status: 400 }
      );
    }

    const result = await searchCompaniesBySicCodes(
      sicCodes,
      itemsPerPage,
      startIndex
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    console.error('Error searching companies:', error);
    return ErrorResponses.internalError(
      error instanceof Error ? error : 'Failed to search companies'
    );
  }
}

