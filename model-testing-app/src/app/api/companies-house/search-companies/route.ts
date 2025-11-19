import { NextRequest, NextResponse } from 'next/server';
import { searchCompaniesBySicCodes } from '@/lib/companiesHouse/client';

/**
 * Search companies by SIC codes
 * POST /api/companies-house/search-companies
 */
export async function POST(request: NextRequest) {
  try {
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
  } catch (error: any) {
    console.error('Error searching companies:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to search companies',
      },
      { status: 500 }
    );
  }
}

