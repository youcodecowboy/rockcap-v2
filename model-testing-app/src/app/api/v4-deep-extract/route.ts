// =============================================================================
// DEEP EXTRACTION API ROUTE
// =============================================================================
// POST /api/v4-deep-extract
//
// Re-analyzes a single document with full uncapped text (up to 400K chars)
// using the same V4 pipeline internals. Produces richer summaries, more
// intelligence fields, and higher-confidence classifications.
//
// Key design: reuses the exact same system prompt as standard V4 to get
// Anthropic prompt cache hits at 10% input cost within the 1-hour TTL.

import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import {
  buildSystemPrompt,
  buildBatchUserMessage,
  callAnthropicBatch,
} from '@/v4/lib/anthropic-client';
import { loadSkill } from '@/v4/lib/skill-loader';
import { resolvePlacement } from '@/v4/lib/placement-rules';
import { mapClassificationToConvex } from '@/v4/lib/result-mapper';
import { analyzeFilename } from '@/v4/lib/document-preprocessor';
import { loadReferencesWithMeta } from '@/v4/lib/reference-library';
import { getAllReferences, formatForPrompt } from '@/lib/references';
import { extractTextFromFile } from '@/lib/fileProcessor';
import { DEFAULT_V4_CONFIG } from '@/v4/types';
import type {
  BatchDocument,
  ClientContext,
  FolderInfo,
} from '@/v4/types';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const DEEP_EXTRACT_MAX_CHARS = 400_000;

// Valid valueType values matching the Convex schema
const VALID_VALUE_TYPES = new Set([
  'string', 'number', 'currency', 'date', 'percentage', 'array', 'text', 'boolean',
]);

/**
 * Sanitize intelligence fields before writing to Convex.
 * Normalizes AI-generated valueType to match schema validators.
 */
function sanitizeIntelligenceFields(fields: any[]) {
  return fields
    .filter((f: any) => f.value !== null && f.value !== undefined)
    .map((f: any) => ({
      fieldPath: f.fieldPath,
      label: f.label,
      category: f.category,
      value: f.value,
      valueType: VALID_VALUE_TYPES.has(f.valueType) ? f.valueType : 'text',
      isCanonical: f.isCanonical ?? false,
      confidence: typeof f.confidence === 'number' ? f.confidence : 0,
      sourceText: f.sourceText || undefined,
      originalLabel: f.originalLabel || undefined,
      matchedAlias: f.matchedAlias || undefined,
      templateTags: Array.isArray(f.templateTags) ? f.templateTags : undefined,
      pageReference: f.pageReference || undefined,
      scope: f.scope || undefined,
    }));
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let itemId: Id<'bulkUploadItems'> | undefined;
  let convex: ConvexHttpClient | undefined;

  try {
    const body = await request.json();
    itemId = body.itemId as Id<'bulkUploadItems'>;
    const batchId = body.batchId as Id<'bulkUploadBatches'>;

    if (!itemId || !batchId) {
      return NextResponse.json(
        { error: 'Missing required fields: itemId, batchId' },
        { status: 400 },
      );
    }

    // Set up Convex client
    convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

    // Fetch item and batch in parallel
    const [item, batch] = await Promise.all([
      convex.query(api.bulkUpload.getItem, { itemId }),
      convex.query(api.bulkUpload.getBatch, { batchId }),
    ]);

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Check for user edits that would be overwritten
    const userEdits = item.userEdits as Record<string, any> | undefined;
    if (userEdits?.fileTypeDetected || userEdits?.category || userEdits?.targetFolder) {
      return NextResponse.json(
        {
          error:
            'Document has user corrections. Deep extraction would overwrite them. Clear edits first or confirm override.',
        },
        { status: 400 },
      );
    }

    // Set status to processing
    await convex.mutation(api.bulkUpload.setDeepExtractionStatus, {
      itemId,
      status: 'processing',
    });

    // ── Get full text ──
    let fullText = (item as any).textContent as string | undefined;

    if (!fullText) {
      // Fallback: fetch from storage and extract
      const fileStorageId = (item as any).fileStorageId;
      if (!fileStorageId) {
        await convex.mutation(api.bulkUpload.setDeepExtractionStatus, {
          itemId,
          status: 'error',
        });
        return NextResponse.json(
          { error: 'No document content available for deep extraction' },
          { status: 400 },
        );
      }

      // Get storage URL and fetch file
      const storageUrl = await convex.query(api.fileQueue.getFileUrl, {
        storageId: fileStorageId,
      });
      if (storageUrl) {
        const res = await fetch(storageUrl);
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], item.fileName || 'document', {
            type: (item as any).fileType || 'application/pdf',
          });
          fullText = await extractTextFromFile(file);
        }
      }
    }

    if (!fullText || fullText.trim().length === 0) {
      await convex.mutation(api.bulkUpload.setDeepExtractionStatus, {
        itemId,
        status: 'error',
      });
      return NextResponse.json(
        { error: 'No document content available for deep extraction' },
        { status: 400 },
      );
    }

    // ── Apply 400K char cap with 75/25 head/tail truncation ──
    let text = fullText;
    if (text.length > DEEP_EXTRACT_MAX_CHARS) {
      const headLen = Math.floor(DEEP_EXTRACT_MAX_CHARS * 0.75);
      const tailLen = DEEP_EXTRACT_MAX_CHARS - headLen;
      text = `${text.slice(0, headLen)}\n\n[... ${text.length - DEEP_EXTRACT_MAX_CHARS} characters truncated ...]\n\n${text.slice(-tailLen)}`;
    }

    console.log(
      `[DEEP-EXTRACT] Processing "${item.fileName}" — ${fullText.length} chars total, ${text.length} chars after cap`,
    );

    // ── Construct BatchDocument manually (bypasses 50K preprocessor cap) ──
    const batchDoc: BatchDocument = {
      index: 0,
      fileName: item.fileName || 'document',
      fileSize: (item as any).fileSize || 0,
      mediaType: (item as any).fileType || 'application/pdf',
      processedContent: { type: 'text', text },
      hints: analyzeFilename(item.fileName || 'document', text),
    };

    // ── Load references (must match pipeline exactly for cache hits) ──
    const allRefs = getAllReferences();
    let referencePromptText = formatForPrompt(allRefs, 'classification');

    const config = {
      ...DEFAULT_V4_CONFIG,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    };

    // Merge user-created Convex references (same pattern as pipeline.ts lines 150-163)
    if (process.env.NEXT_PUBLIC_CONVEX_URL) {
      const userRefResult = await loadReferencesWithMeta(convex, config.referenceCacheTtlMs);
      const systemFileTypes = new Set(allRefs.map((r) => r.fileType.toLowerCase()));
      const extraUserRefs = userRefResult.references.filter(
        (r) => r.source === 'user' && !systemFileTypes.has(r.fileType.toLowerCase()),
      );
      if (extraUserRefs.length > 0) {
        referencePromptText += '\n\n## Additional User-Defined References\n';
        referencePromptText += extraUserRefs
          .map(
            (ref) =>
              `### ${ref.fileType} (${ref.category})\nTags: ${ref.tags.join(', ')}\nKeywords: ${ref.keywords.join(', ')}\n${ref.content}`,
          )
          .join('\n\n');
      }
    }

    // ── Load skill instructions ──
    const skill = loadSkill('document-classify');

    // ── Get available folders from client ──
    let availableFolders: FolderInfo[] = [];
    if (batch.clientId) {
      try {
        const clientFolders = await convex.query(api.clients.getClientFolders, {
          clientId: batch.clientId,
        });
        availableFolders = clientFolders.map((f: any) => ({
          folderKey: f.folderType,
          name: f.name,
          level: (f.level || 'client') as 'client' | 'project',
        }));
      } catch {
        // Non-critical — proceed with empty folders
      }
    }

    // ── Build system prompt (identical to standard V4 for cache hits) ──
    const systemPrompt = buildSystemPrompt(skill.instructions, referencePromptText, availableFolders);

    // ── Build client context ──
    const clientContext: ClientContext = {
      clientId: batch.clientId || undefined,
      projectId: batch.projectId || undefined,
      clientName: batch.clientName || undefined,
    };

    // ── Build user message ──
    const userBlocks = buildBatchUserMessage(
      [batchDoc],
      [], // checklistItems — not stored on batch, pass empty
      clientContext,
      [], // corrections
      undefined,
    );

    // ── Call Anthropic ──
    const result = await callAnthropicBatch(systemPrompt, userBlocks, config);

    if (!result.classifications || result.classifications.length === 0) {
      throw new Error('No classification returned from Anthropic');
    }

    const classification = result.classifications[0];

    // ── Apply placement rules ──
    const placement = resolvePlacement(classification, clientContext);

    // ── Map to Convex format ──
    const mapped = mapClassificationToConvex(classification, placement, {
      projectShortcode: batch.projectShortcode || undefined,
      clientName: batch.clientName || undefined,
      isInternal: batch.isInternal,
    });

    // ── Sanitize intelligence fields ──
    const rawFields = classification.intelligenceFields || [];
    const sanitizedFields = sanitizeIntelligenceFields(rawFields);

    // ── Write results to Convex ──
    await convex.mutation(api.bulkUpload.updateItemAnalysis, {
      itemId,
      summary: mapped.itemAnalysis.summary,
      fileTypeDetected: mapped.itemAnalysis.fileTypeDetected,
      category: mapped.itemAnalysis.category,
      targetFolder: mapped.itemAnalysis.targetFolder,
      confidence: mapped.itemAnalysis.confidence,
      generatedDocumentCode: mapped.itemAnalysis.generatedDocumentCode,
      version: mapped.itemAnalysis.version,
      classificationReasoning: mapped.classificationReasoning,
      documentAnalysis: mapped.documentAnalysis,
      extractedIntelligence:
        sanitizedFields.length > 0 ? { fields: sanitizedFields } : undefined,
      suggestedChecklistItems:
        mapped.checklistMatches.length > 0
          ? mapped.checklistMatches.map((m) => ({
              itemId: m.itemId,
              itemName: m.itemName,
              category: m.category,
              confidence: m.confidence,
              reasoning: m.reasoning,
            }))
          : undefined,
      // Preserve original textContent — don't overwrite with truncated version
      textContent: (item as any).textContent || undefined,
    });

    // ── Set status complete ──
    await convex.mutation(api.bulkUpload.setDeepExtractionStatus, {
      itemId,
      status: 'complete',
    });

    const latencyMs = Date.now() - startTime;
    console.log(
      `[DEEP-EXTRACT] Complete "${item.fileName}" in ${latencyMs}ms — ` +
        `${sanitizedFields.length} intelligence fields, ` +
        `${result.usage.cacheReadTokens} cache read tokens`,
    );

    return NextResponse.json({
      success: true,
      usage: result.usage,
      latencyMs,
      textLength: text.length,
      intelligenceFieldCount: sanitizedFields.length,
    });
  } catch (error) {
    console.error('[DEEP-EXTRACT] Error:', error);

    // Always try to set error status
    if (convex && itemId) {
      try {
        await convex.mutation(api.bulkUpload.setDeepExtractionStatus, {
          itemId,
          status: 'error',
        });
      } catch {
        // Best-effort
      }
    }

    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
