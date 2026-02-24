/**
 * Test API for Filing Feedback Loop
 *
 * This endpoint allows testing the feedback loop without authentication.
 * ONLY for development/testing purposes.
 *
 * Usage:
 *   curl http://localhost:3000/api/test-feedback-loop
 *   curl -X POST http://localhost:3000/api/test-feedback-loop -H "Content-Type: application/json" -d '{"action": "capture-correction"}'
 */

import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';

export const runtime = 'nodejs';

// Simple hash function (same as in filingFeedback.ts)
function generateContentHash(content: string): string {
  const normalizedContent = content.slice(0, 10000).toLowerCase().trim();
  let hash = 5381;
  for (let i = 0; i < normalizedContent.length; i++) {
    hash = ((hash << 5) + hash) + normalizedContent.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function normalizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-\.]/g, ' ')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

// GET: Run all tests and show results
export async function GET() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_CONVEX_URL not set' }, { status: 500 });
  }

  const client = new ConvexHttpClient(convexUrl);
  const results: Array<{ test: string; passed: boolean; details?: any; error?: string }> = [];

  try {
    // Test 1: Query corrections
    const corrections = await client.query(api.filingFeedback.getRelevantCorrections, {
      fileType: 'Site Plan',
      category: 'Plans',
      fileName: 'test.pdf',
      limit: 5,
    });
    results.push({
      test: 'Query corrections endpoint',
      passed: true,
      details: { count: corrections.length },
    });

    // Test 2: Cache operations
    const testHash = generateContentHash(`test_${Date.now()}`);
    const cacheMiss = await client.query(api.filingFeedback.checkCache, { contentHash: testHash });
    results.push({
      test: 'Cache miss for new content',
      passed: !cacheMiss.hit,
      details: { hit: cacheMiss.hit },
    });

    // Test 3: Store in cache
    await client.mutation(api.filingFeedback.cacheClassification, {
      contentHash: testHash,
      fileNamePattern: 'test doc',
      classification: {
        fileType: 'Test',
        category: 'Test',
        targetFolder: 'test',
        confidence: 0.9,
      },
    });
    const cacheHit = await client.query(api.filingFeedback.checkCache, { contentHash: testHash });
    results.push({
      test: 'Cache store and retrieve',
      passed: cacheHit.hit && cacheHit.classification?.fileType === 'Test',
      details: { hit: cacheHit.hit, classification: cacheHit.classification },
    });

    // Test 4: Invalidate cache
    await client.mutation(api.filingFeedback.invalidateCacheByHash, { contentHash: testHash });
    const cacheInvalidated = await client.query(api.filingFeedback.checkCache, { contentHash: testHash });
    results.push({
      test: 'Cache invalidation',
      passed: !cacheInvalidated.hit,
      details: { hitAfterInvalidation: cacheInvalidated.hit },
    });

    // Test 5: Get stats
    const stats = await client.query(api.filingFeedback.getCorrectionStats, {});
    results.push({
      test: 'Get correction statistics',
      passed: true,
      details: stats,
    });

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return NextResponse.json({
      summary: { passed, failed, total: results.length },
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      results,
    }, { status: 500 });
  }
}

// POST: Perform specific test actions
export async function POST(request: NextRequest) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_CONVEX_URL not set' }, { status: 500 });
  }

  const client = new ConvexHttpClient(convexUrl);

  try {
    const body = await request.json();
    const action = body.action as string;

    switch (action) {
      case 'get-stats': {
        const stats = await client.query(api.filingFeedback.getCorrectionStats, {});
        return NextResponse.json({ action, result: stats });
      }

      case 'get-corrections': {
        const corrections = await client.query(api.filingFeedback.getRelevantCorrections, {
          fileType: body.fileType || 'Site Plan',
          category: body.category || 'Plans',
          fileName: body.fileName || 'test.pdf',
          limit: body.limit || 5,
        });
        return NextResponse.json({ action, result: corrections });
      }

      case 'cache-check': {
        const contentHash = body.contentHash || generateContentHash(body.content || 'test');
        const result = await client.query(api.filingFeedback.checkCache, { contentHash });
        return NextResponse.json({ action, contentHash, result });
      }

      case 'cache-store': {
        const contentHash = body.contentHash || generateContentHash(body.content || `test_${Date.now()}`);
        await client.mutation(api.filingFeedback.cacheClassification, {
          contentHash,
          fileNamePattern: body.fileNamePattern || 'test',
          classification: body.classification || {
            fileType: 'Test',
            category: 'Test',
            targetFolder: 'test',
            confidence: 0.9,
          },
        });
        return NextResponse.json({ action, contentHash, success: true });
      }

      case 'cache-invalidate': {
        const contentHash = body.contentHash || generateContentHash(body.content || 'test');
        const result = await client.mutation(api.filingFeedback.invalidateCacheByHash, { contentHash });
        return NextResponse.json({ action, contentHash, result });
      }

      case 'simulate-correction': {
        // This simulates what updateItemDetails does when a user makes a correction
        // We directly insert into filingCorrections to test the retrieval
        const testCorrection = {
          fileName: body.fileName || `TEST_LOC_Plan_${Date.now()}.pdf`,
          fileNameNormalized: normalizeFilename(body.fileName || `TEST_LOC_Plan_${Date.now()}.pdf`),
          contentHash: generateContentHash(body.content || `test content ${Date.now()}`),
          contentSummary: body.contentSummary || 'Test document for location plan',
          aiPrediction: body.aiPrediction || {
            fileType: 'Site Plan',
            category: 'Plans',
            targetFolder: 'plans',
            confidence: 0.78,
          },
          userCorrection: body.userCorrection || {
            fileType: 'Location Plans',
          },
          correctedFields: body.correctedFields || ['fileType'],
        };

        // Note: We can't directly insert without a sourceItemId
        // But we can test that the query would find corrections if they existed
        return NextResponse.json({
          action,
          message: 'Correction simulation data prepared',
          correction: testCorrection,
          note: 'To actually store a correction, use the bulk upload UI and make a manual correction',
        });
      }

      case 'delete-all-corrections': {
        const result = await client.mutation(api.filingFeedback.deleteAllCorrections, {});
        return NextResponse.json({ action, result });
      }

      case 'list-corrections': {
        const corrections = await client.query(api.filingFeedback.listAllCorrections, {});
        return NextResponse.json({ action, corrections });
      }

      default:
        return NextResponse.json({
          error: 'Unknown action',
          availableActions: [
            'get-stats',
            'get-corrections',
            'cache-check',
            'cache-store',
            'cache-invalidate',
            'simulate-correction',
            'delete-all-corrections',
            'list-corrections',
          ],
        }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
