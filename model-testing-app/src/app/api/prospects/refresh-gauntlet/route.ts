import { NextRequest, NextResponse } from 'next/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';

/**
 * Refresh gauntlet for prospects that need updating
 * POST /api/prospects/refresh-gauntlet
 * 
 * Query params:
 * - daysOld: number (default: 7) - Refresh prospects older than this many days
 * - limit: number (default: 50) - Maximum number of prospects to refresh
 * 
 * This endpoint can be called manually or via cron job
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysOld = parseInt(searchParams.get('daysOld') || '7', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    console.log(`Refreshing gauntlet for prospects older than ${daysOld} days (limit: ${limit})`);

    // Get prospects that need refresh
    const prospectsNeedingRefresh = await fetchQuery(
      api.prospects.getProspectsNeedingRefresh,
      { daysOld }
    ) as any;

    // Limit the number of prospects to process
    const prospectsToProcess = prospectsNeedingRefresh.slice(0, limit);

    console.log(
      `Found ${prospectsNeedingRefresh.length} prospects needing refresh, ` +
      `processing ${prospectsToProcess.length}`
    );

    // Get base URL for internal API calls
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Enqueue gauntlet jobs (fire and forget)
    const enqueued: string[] = [];
    const errors: Array<{ companyNumber: string; error: string }> = [];

    for (const prospect of prospectsToProcess) {
      try {
        // Trigger gauntlet asynchronously
        fetch(`${baseUrl}/api/prospects/run-gauntlet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ companyNumber: prospect.companyNumber }),
        }).catch((error) => {
          console.error(
            `Error triggering gauntlet for ${prospect.companyNumber}:`,
            error
          );
          errors.push({
            companyNumber: prospect.companyNumber,
            error: error.message || 'Unknown error',
          });
        });

        enqueued.push(prospect.companyNumber);

        // Small delay to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error: any) {
        console.error(
          `Error enqueueing gauntlet for ${prospect.companyNumber}:`,
          error
        );
        errors.push({
          companyNumber: prospect.companyNumber,
          error: error.message || 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalNeedingRefresh: prospectsNeedingRefresh.length,
      enqueued: enqueued.length,
      errors: errors.length,
      errorDetails: errors.length > 0 ? errors : undefined,
      message: `Enqueued gauntlet refresh for ${enqueued.length} prospects`,
    });
  } catch (error: any) {
    console.error('Error refreshing gauntlet:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to refresh gauntlet',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for manual testing
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

