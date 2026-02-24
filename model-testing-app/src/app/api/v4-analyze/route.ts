// =============================================================================
// V4 BATCH ANALYSIS API ROUTE (Next.js App Router)
// =============================================================================
// POST /api/v4-analyze
//
// This file lives in src/app/api/ so Next.js registers it as a route.
// All logic is in src/v4/ — this is just the entry point.

import { NextRequest, NextResponse } from 'next/server';
import { runV4Pipeline } from '@/v4/lib/pipeline';
import { mapBatchToConvex } from '@/v4/lib/result-mapper';
import type {
  ChecklistItem,
  FolderInfo,
  CorrectionContext,
  ClientContext,
  V4PipelineConfig,
} from '@/v4/types';
import { DEFAULT_V4_CONFIG } from '@/v4/types';

export const maxDuration = 120;
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

    // Files sent as file_0, file_1, ...
    let fileIndex = 0;
    while (true) {
      const file = formData.get(`file_${fileIndex}`) as File | null;
      if (!file) break;
      const extractedText = formData.get(`text_${fileIndex}`) as string | null;
      files.push({ file, extractedText: extractedText || undefined });
      fileIndex++;
    }

    // Also support files[] array format
    if (files.length === 0) {
      const fileEntries = formData.getAll('files') as File[];
      for (const file of fileEntries) {
        files.push({ file });
      }
    }

    // Also support single 'file' field (backward compat with bulk-analyze)
    if (files.length === 0) {
      const singleFile = formData.get('file') as File | null;
      if (singleFile) {
        const extractedText = formData.get('extractedText') as string | null;
        files.push({ file: singleFile, extractedText: extractedText || undefined });
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided. Send as file_0, file_1, ..., files[], or file' },
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
      projectShortcode?: string;
      clientName?: string;
      isInternal?: boolean;
      uploaderInitials?: string;
    } = {};

    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        return NextResponse.json({ error: 'Invalid metadata JSON' }, { status: 400 });
      }
    }

    // Also support individual metadata fields (backward compat)
    const clientType = formData.get('clientType') as string | null;

    // Build client context from metadata or individual fields
    const clientContext: ClientContext = metadata.clientContext || {};
    if (clientType && !clientContext.clientType) {
      clientContext.clientType = clientType;
    }

    // ── Build pipeline config ──
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
    const useMock = !anthropicApiKey;

    const config: V4PipelineConfig = {
      ...DEFAULT_V4_CONFIG,
      anthropicApiKey,
      useMock,
    };

    // ── Run pipeline ──
    console.log(`[V4 API] Processing ${files.length} files (${useMock ? 'MOCK' : 'LIVE'})...`);

    const result = await runV4Pipeline({
      files,
      clientContext,
      availableFolders: metadata.availableFolders || [],
      checklistItems: metadata.checklistItems || [],
      corrections: metadata.corrections,
      config,
    });

    // ── Map results to Convex format ──
    const mapped = mapBatchToConvex(
      result.documents,
      result.placements,
      result.errors,
      {
        projectShortcode: metadata.projectShortcode,
        clientName: metadata.clientName || clientContext.clientName,
        isInternal: metadata.isInternal,
        uploaderInitials: metadata.uploaderInitials,
      },
    );

    console.log(`[V4 API] Completed in ${Date.now() - startTime}ms — ${mapped.documents.length} classified, ${result.errors.length} errors`);

    // ── Return response ──
    return NextResponse.json({
      success: result.success,
      isMock: result.isMock,

      // Per-document results (Convex-ready format)
      documents: mapped.documents.map(doc => ({
        documentIndex: doc.documentIndex,
        fileName: doc.fileName,
        summary: doc.itemAnalysis.summary,
        fileType: doc.itemAnalysis.fileTypeDetected,
        category: doc.itemAnalysis.category,
        confidence: doc.itemAnalysis.confidence,
        suggestedFolder: doc.itemAnalysis.targetFolder,
        typeAbbreviation: doc.itemAnalysis.generatedDocumentCode.split('-')[1] || '',
        generatedDocumentCode: doc.itemAnalysis.generatedDocumentCode,
        version: doc.itemAnalysis.version,
        extractedData: doc.itemAnalysis.extractedData || null,

        // Additional V4 data
        placement: doc.placement,
        knowledgeBankEntry: doc.knowledgeBankEntry,
        isLowConfidence: doc.isLowConfidence,
        alternativeTypes: doc.alternativeTypes,

        // Backward compat
        originalFileName: doc.fileName,
        fileSize: 0,
        mimeType: '',
      })),

      stats: mapped.stats,
      metadata: result.metadata,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[V4 API] Pipeline error:', error);

    return NextResponse.json(
      {
        success: false,
        isMock: false,
        documents: [],
        stats: {
          totalDocuments: 0,
          classified: 0,
          errors: 1,
          lowConfidenceCount: 0,
          placementOverrides: 0,
          categoryCounts: {},
          folderCounts: {},
        },
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
        errors: [{ documentIndex: -1, fileName: '', error: (error as Error).message }],
      },
      { status: 500 },
    );
  }
}
