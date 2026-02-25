// =============================================================================
// V4 BATCH ANALYSIS API ROUTE
// =============================================================================
// POST /api/v4-analyze
//
// Replaces /api/bulk-analyze with the V4 skills-based pipeline.
// Key differences from legacy:
// - Batch processing: multiple documents per API call (not per-file)
// - Multimodal: Claude sees the actual document, not just extracted text
// - Shared reference library with tag-based selection
// - Deterministic placement rules (folder routing)
// - Mock mode: works without API key for development
//
// Request: FormData with files[] + JSON metadata
// Response: V4PipelineResult with per-document classifications + placements
//
// Integration points:
// - Called by BulkQueueProcessor (replaces /api/bulk-analyze)
// - Results mapped to Convex bulkUploadItems via result-mapper
// - Placements drive folder assignment in the review table

import { NextRequest, NextResponse } from 'next/server';
import { runV4Pipeline } from '../../lib/pipeline';
import { mapBatchToConvex } from '../../lib/result-mapper';
import { extractTextFromFile } from '../../../lib/fileProcessor';
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

    // Also support single 'file' field (backward compat with bulk-analyze)
    if (files.length === 0) {
      const singleFile = formData.get('file') as File | null;
      if (singleFile) {
        const extractedText = formData.get('extractedText') as string | null;
        files.push({
          file: singleFile,
          extractedText: extractedText || undefined,
        });
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
        return NextResponse.json(
          { error: 'Invalid metadata JSON' },
          { status: 400 },
        );
      }
    }

    // Also support individual metadata fields (backward compat)
    const clientType = formData.get('clientType') as string | null;
    const instructions = formData.get('instructions') as string | null;

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

    // ── Extract text from files for intelligence extraction + persistence ──
    const fullTexts = new Map<number, string>();
    const extractedTexts: Record<number, string> = {};
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // Use pre-provided text or extract from file
      let text = f.extractedText;
      if (!text) {
        try {
          text = await extractTextFromFile(f.file as File);
        } catch (e) {
          console.warn(`[V4 API] Text extraction failed for file ${i}: ${(e as Error).message}`);
        }
      }
      if (text) {
        fullTexts.set(i, text);
        extractedTexts[i] = text;
      }
    }

    // ── Run pipeline ──
    console.log(`[V4 API] Processing ${files.length} files (${useMock ? 'MOCK' : 'LIVE'})...`);

    const result = await runV4Pipeline({
      files,
      fullTexts,
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

    // Log documentAnalysis presence for diagnostics
    for (const doc of mapped.documents) {
      const da = doc.documentAnalysis;
      console.log(`[V4 API] Doc ${doc.documentIndex} "${doc.fileName}": documentAnalysis=${da ? 'YES' : 'MISSING'}, summary="${da?.executiveSummary?.slice(0, 80) || 'none'}"`);
    }

    // ── Return response ──
    // Include both raw V4 results AND Convex-mapped results
    return NextResponse.json({
      success: result.success,
      isMock: result.isMock,

      // Per-document results (Convex-ready format)
      documents: mapped.documents.map(doc => {
        // Prefer enriched intelligence fields from Stage 5.5 (has scope, isCanonical),
        // fall back to lightweight fields from classification call
        const enrichedFields = result.intelligence?.[doc.documentIndex];
        const rawClassification = result.documents.find(d => d.documentIndex === doc.documentIndex);
        const intelligenceFields = enrichedFields && enrichedFields.length > 0
          ? enrichedFields
          : rawClassification?.intelligenceFields || [];

        return {
          documentIndex: doc.documentIndex,
          fileName: doc.fileName,
          // Fields compatible with bulkUpload.updateItemAnalysis
          summary: doc.itemAnalysis.summary,
          fileType: doc.itemAnalysis.fileTypeDetected,
          category: doc.itemAnalysis.category,
          confidence: doc.itemAnalysis.confidence,
          suggestedFolder: doc.itemAnalysis.targetFolder,
          typeAbbreviation: doc.itemAnalysis.generatedDocumentCode.split('-')[1] || '',
          generatedDocumentCode: doc.itemAnalysis.generatedDocumentCode,
          version: doc.itemAnalysis.version,
          extractedData: doc.itemAnalysis.extractedData,

          // Intelligence fields for knowledge library extraction
          intelligenceFields,

          // Rich document analysis (for Summary/Entities/Key Data tabs)
          documentAnalysis: doc.documentAnalysis,
          checklistMatches: doc.checklistMatches,
          classificationReasoning: doc.classificationReasoning,

          // Additional V4 data
          placement: doc.placement,
          knowledgeBankEntry: doc.knowledgeBankEntry,
          isLowConfidence: doc.isLowConfidence,
          alternativeTypes: doc.alternativeTypes,

          // Extracted text for saving to document textContent
          extractedText: extractedTexts[doc.documentIndex] || undefined,

          // Backward compat with existing bulk-analyze response
          originalFileName: doc.fileName,
          fileSize: 0, // Not available here — set by caller
          mimeType: '', // Not available here — set by caller
        };
      }),

      // Batch statistics
      stats: mapped.stats,

      // Pipeline metadata
      metadata: result.metadata,

      // Errors (per-document)
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
