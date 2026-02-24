import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

export const runtime = 'nodejs';

/**
 * API endpoint to fetch a file from Convex storage
 * Used when we need to re-process a file that's already been uploaded
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const client = await getAuthenticatedConvexClient();
    try {
      await requireAuth(client);
    } catch (authError) {
      return ErrorResponses.unauthenticated();
    }

    const storageId = request.nextUrl.searchParams.get('storageId');
    
    if (!storageId) {
      return ErrorResponses.badRequest('No storageId provided');
    }

    // Get the file URL from Convex storage using documents.getFileUrl
    const fileUrl = await client.query(api.documents.getFileUrl, { 
      storageId: storageId as Id<"_storage"> 
    });

    if (!fileUrl) {
      return ErrorResponses.notFound('File not found in storage');
    }

    // Fetch the file from the URL
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      return ErrorResponses.internalError('Failed to fetch file from storage URL');
    }

    // Return the file as a blob
    const blob = await response.blob();
    
    return new NextResponse(blob, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      },
    });

  } catch (error) {
    console.error('[Convex File] Error:', error);
    return ErrorResponses.internalError(
      error instanceof Error ? error.message : 'Failed to fetch file'
    );
  }
}
