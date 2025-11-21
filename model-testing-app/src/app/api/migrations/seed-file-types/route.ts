import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';
import { api } from '../../../../../convex/_generated/api';

export const runtime = 'nodejs';

/**
 * API route to seed file type definitions from hardcoded defaults
 * This is a one-time migration that should be run after deployment
 * 
 * Usage: POST /api/migrations/seed-file-types
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const client = await getAuthenticatedConvexClient();
    try {
      await requireAuth(client);
    } catch (authError) {
      return ErrorResponses.unauthenticated();
    }

    // Run the migration using the public wrapper mutation
    try {
      const result = await client.mutation(api.fileTypeDefinitions.seedDefinitions, {});
      
      return NextResponse.json({
        success: true,
        skipped: result.skipped,
        count: result.count,
        message: result.message || (result.skipped 
          ? 'File type definitions already exist in database'
          : `Successfully seeded ${result.count} file type definitions`),
      });
    } catch (error) {
      console.error('Migration error:', error);
      return ErrorResponses.internalError(
        error instanceof Error ? error.message : 'Failed to run migration'
      );
    }
  } catch (error) {
    console.error('Error processing migration request:', error);
    return ErrorResponses.internalError('Internal server error');
  }
}

