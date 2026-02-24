// =============================================================================
// V4 BATCH ANALYSIS API ROUTE
// =============================================================================
// POST /api/v4-analyze
//
// Replaces /api/bulk-analyze with the V4 skills-based pipeline.
// Key differences:
// - Batch processing: multiple documents per API call
// - Multimodal: Claude sees the actual document, not just extracted text
// - Shared reference library with tag-based selection
// - Single structured response per batch (not per-document API calls)
//
// Request: FormData with files[] + JSON metadata
// Response: BatchClassifyResult

import { NextRequest, NextResponse } from 'next/server';
import { runV4Pipeline } from '../../lib/pipeline';
import type {
  ChecklistItem,
  FolderInfo,
  CorrectionContext,
  ClientContext,
  V4PipelineConfig,
} from '../../types';
import { DEFAULT_V4_CONFIG } from '../../types';

export const maxDuration = 120; // 2 minutes for large batches
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();

    // ── Extract files ──
    const files: Array<{
      file: File;
      extractedText?: string;
    }> = [];

    // Files are sent as formData entries: file_0, file_1, ...
    // Or as a files[] array
    let fileIndex = 0;
    while (true) {
      const file = formData.get(`file_${fileIndex}`) as File | null;
      if (!file) break;

      const extractedText = formData.get(`text_${fileIndex}`) as string | null;
      files.push({
        file,
        extractedText: extractedText || undefined,
      });
      fileIndex++;
    }

    // Also support files[] array format
    if (files.length === 0) {
      const fileEntries = formData.getAll('files') as File[];
      for (const file of fileEntries) {
        files.push({ file });
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided. Send as file_0, file_1, ... or files[]' },
        { status: 400 },
      );
    }

    // ── Extract metadata ──
    const metadataStr = formData.get('metadata') as string | null;
    let metadata: {
      clientContext?: ClientContext;
      availableFolders?: FolderInfo[];
      checklistItems?: ChecklistItem[];
      corrections?: CorrectionContext[];
    } = {};

    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        return NextResponse.json(
          { error: 'Invalid metadata JSON' },
          { status: 400 },
        );
      }
    }

    // ── Build pipeline config ──
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 },
      );
    }

    const config: V4PipelineConfig = {
      ...DEFAULT_V4_CONFIG,
      anthropicApiKey,
    };

    // ── Run pipeline ──
    console.log(`[V4 API] Processing ${files.length} files...`);

    const result = await runV4Pipeline({
      files,
      clientContext: metadata.clientContext || {},
      availableFolders: metadata.availableFolders || [],
      checklistItems: metadata.checklistItems || [],
      corrections: metadata.corrections,
      config,
    });

    console.log(`[V4 API] Completed in ${Date.now() - startTime}ms`);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[V4 API] Pipeline error:', error);

    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        documents: [],
        metadata: {
          model: 'error',
          batchSize: 0,
          apiCallsMade: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalLatencyMs: Date.now() - startTime,
          referencesLoaded: [],
          cachedReferenceHit: false,
        },
        errors: [],
      },
      { status: 500 },
    );
  }
}
