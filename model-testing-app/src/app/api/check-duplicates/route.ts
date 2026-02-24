import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';

export const runtime = 'nodejs';

/**
 * Check for duplicate documents based on original filename within the same client/project.
 *
 * This endpoint FLAGS potential duplicates but does NOT reject uploads.
 * Users can proceed with uploading even if duplicates are detected.
 *
 * Checks performed:
 * 1. Exact filename match within same client/project
 * 2. Similar filename (same base name, different extension)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const originalFileName = searchParams.get('originalFileName');
    const clientId = searchParams.get('clientId');
    const projectId = searchParams.get('projectId');

    // Log the request for debugging
    console.log('[Check Duplicates] Request:', { originalFileName, clientId, projectId });

    if (!originalFileName) {
      return NextResponse.json({
        isDuplicate: false,
        existingDocuments: [],
        message: 'No filename provided',
      });
    }

    if (!clientId) {
      return NextResponse.json({
        isDuplicate: false,
        existingDocuments: [],
        message: 'No client ID provided',
      });
    }

    // Get authenticated Convex client
    const client = await getAuthenticatedConvexClient();

    // Query existing documents for this client/project
    let existingDocs: any[] = [];

    if (projectId) {
      // Check within project scope
      existingDocs = await client.query(api.documents.list, {
        projectId: projectId as any,
      });
    } else {
      // Check within client scope (no project)
      existingDocs = await client.query(api.documents.list, {
        clientId: clientId as any,
      });
    }

    // Normalize filename for comparison
    const normalizeFilename = (name: string) => name.toLowerCase().trim();
    const getBaseName = (name: string) => {
      const lastDot = name.lastIndexOf('.');
      return lastDot > 0 ? name.substring(0, lastDot) : name;
    };

    const inputNormalized = normalizeFilename(originalFileName);
    const inputBaseName = normalizeFilename(getBaseName(originalFileName));

    // Find duplicates
    const duplicates: Array<{
      documentId: string;
      fileName: string;
      matchType: 'exact' | 'similar';
      uploadedAt?: string;
      folder?: string;
    }> = [];

    for (const doc of existingDocs) {
      const docOriginalName = doc.originalFileName || doc.name || '';
      const docNormalized = normalizeFilename(docOriginalName);
      const docBaseName = normalizeFilename(getBaseName(docOriginalName));

      // Check for exact match
      if (docNormalized === inputNormalized) {
        duplicates.push({
          documentId: doc._id,
          fileName: docOriginalName,
          matchType: 'exact',
          uploadedAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
          folder: doc.folderType,
        });
      }
      // Check for similar match (same base name, different extension)
      else if (docBaseName === inputBaseName && docBaseName.length > 3) {
        duplicates.push({
          documentId: doc._id,
          fileName: docOriginalName,
          matchType: 'similar',
          uploadedAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
          folder: doc.folderType,
        });
      }
    }

    const hasExactMatch = duplicates.some(d => d.matchType === 'exact');
    const hasSimilarMatch = duplicates.some(d => d.matchType === 'similar');

    console.log('[Check Duplicates] Found:', {
      total: duplicates.length,
      exact: duplicates.filter(d => d.matchType === 'exact').length,
      similar: duplicates.filter(d => d.matchType === 'similar').length,
    });

    return NextResponse.json({
      isDuplicate: duplicates.length > 0,
      hasExactMatch,
      hasSimilarMatch,
      existingDocuments: duplicates,
      message: hasExactMatch
        ? `A file with the same name already exists`
        : hasSimilarMatch
          ? `Similar files found with the same base name`
          : null,
    });
  } catch (error) {
    console.error('[Check Duplicates] Error:', error);
    // On error, don't block - just return no duplicates
    return NextResponse.json({
      isDuplicate: false,
      existingDocuments: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
