// =============================================================================
// DRIVE INGEST EXTRACTION ROUTE (Next.js App Router)
// =============================================================================
// POST /api/drive/ingest
//
// Stateless extraction worker for the Drive hydration pipeline (phase 3).
// Convex's driveHydration.hydrateSettled cron fetches a Drive file's bytes,
// caches them in Convex storage, and POSTs the signed storage URL here with
// the shared cron secret. This route runs the SAME steps /api/v4-analyze
// runs for a single file — server-side text extraction, the v4 pipeline,
// the result mapper — and returns the Convex-ready mapped result as JSON.
//
// It deliberately does NOT write to Convex: persistence happens in the
// internal mutation driveHydration.applyExtraction (a Next route cannot
// call internal mutations), keeping this route a pure bytes→analysis
// function.

import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { runV4Pipeline } from '@/v4/lib/pipeline';
import { mapBatchToConvex } from '@/v4/lib/result-mapper';
import { extractTextFromFile } from '@/lib/fileProcessor';
import type { V4PipelineConfig } from '@/v4/types';
import { DEFAULT_V4_CONFIG } from '@/v4/types';

// A single large document (scanned appraisal PDF, multi-tab XLSM) routinely
// takes minutes through text extraction + classification + intelligence.
// Vercel's default timeout (10s hobby, 60s pro) kills the function
// mid-pipeline. Pro supports up to 300s; Fluid supports 900s. 300s matches
// /api/hubspot/sync-all and covers current document sizes with headroom.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Convex document rows are capped at ~1MB total; an unbounded textContent
// from a big spreadsheet would make applyExtraction throw forever. Cap it
// here so the mapped payload always persists.
const MAX_TEXT_CONTENT_CHARS = 900_000;

export async function POST(request: NextRequest) {
  try {
    // Shared-secret gate — same pattern as /api/hubspot/sync-all. The
    // Convex hydration cron calls this endpoint without a Clerk session but
    // with the x-cron-secret header. No public exposure — the secret lives
    // only in the Convex deployment's env and the Next.js deployment's env.
    // Unlike sync-all there is no interactive fallback: this route is
    // cron-only.
    const cronSecret = request.headers.get('x-cron-secret');
    const isAuthorisedCron =
      !!cronSecret &&
      !!process.env.CRON_SECRET &&
      cronSecret === process.env.CRON_SECRET;
    if (!isAuthorisedCron) {
      if (cronSecret) {
        console.warn(
          `[drive-ingest] cron secret rejected — ` +
          `env_present=${!!process.env.CRON_SECRET} ` +
          `header_len=${cronSecret.length} ` +
          `env_len=${process.env.CRON_SECRET?.length ?? 0}`,
        );
      }
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as {
      driveFileId?: string;
      fileUrl?: string;
      fileName?: string;
      fileType?: string;
    } | null;
    const { driveFileId, fileUrl, fileName, fileType } = body ?? {};
    if (!driveFileId || !fileUrl || !fileName) {
      return NextResponse.json(
        { ok: false, error: 'driveFileId, fileUrl and fileName are required' },
        { status: 400 },
      );
    }

    // ── Fetch bytes from Convex storage (signed URL, server-side) ──
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return NextResponse.json(
        { ok: false, error: `file fetch from storage failed (HTTP ${fileRes.status})` },
        { status: 500 },
      );
    }
    const blob = await fileRes.blob();
    const file = new File([blob], fileName, {
      type: fileType || 'application/octet-stream',
    });

    // ── Server-side text extraction (same as /api/v4-analyze) ──
    // Failure is non-fatal: the pipeline falls back to the raw file
    // (multimodal) for scanned PDFs etc.
    const fullTexts: Map<number, string> = new Map();
    let extractedText: string | undefined;
    try {
      const text = await extractTextFromFile(file);
      if (text && text.trim().length > 0) {
        extractedText = text;
        fullTexts.set(0, text);
        console.log(`[drive-ingest] Extracted ${text.length} chars from "${fileName}"`);
      }
    } catch (err) {
      console.warn(
        `[drive-ingest] Text extraction failed for "${fileName}":`,
        (err as Error).message,
      );
    }

    // ── Build pipeline config (same as /api/v4-analyze) ──
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
    const useMock = !anthropicApiKey;
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    const config: V4PipelineConfig = {
      ...DEFAULT_V4_CONFIG,
      anthropicApiKey,
      useMock,
      convexClient: convexUrl ? new ConvexHttpClient(convexUrl) : undefined,
    };

    // ── Run the v4 pipeline on the one-document batch ──
    console.log(`[drive-ingest] Processing "${fileName}" (${useMock ? 'MOCK' : 'LIVE'})...`);
    const result = await runV4Pipeline({
      files: [{ file, extractedText }],
      fullTexts,
      clientContext: {},
      availableFolders: [],
      checklistItems: [],
      config,
    });

    // ── Map to the Convex-ready shape ──
    const mapped = mapBatchToConvex(result.documents, result.placements, result.errors, {});
    const doc = mapped.documents[0];
    if (!doc) {
      const error = result.errors[0]?.error || 'pipeline produced no classification';
      console.error(`[drive-ingest] "${fileName}" produced no result: ${error}`);
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    // Intelligence fields from the dedicated Stage 5.5 extraction call.
    // documents.extractedIntelligence is schemaless (v.any()); stored in the
    // same { fields: [...] } envelope the bulk-upload flow uses.
    const intelligenceFields = result.intelligence[doc.documentIndex] || [];

    return NextResponse.json({
      ok: true,
      isMock: result.isMock,
      mapped: {
        fileName: doc.fileName,
        summary: doc.itemAnalysis.summary,
        fileTypeDetected: doc.itemAnalysis.fileTypeDetected,
        category: doc.itemAnalysis.category,
        reasoning: doc.classificationReasoning,
        confidence: doc.confidence,
        tokensUsed:
          (result.metadata?.totalInputTokens || 0) +
          (result.metadata?.totalOutputTokens || 0),
        documentCode: doc.itemAnalysis.generatedDocumentCode,
        // v4 placement output — the folder KEY the pipeline suggests.
        // driveHydration.applyExtraction resolves it against the client's
        // real folder taxonomy on FIRST extraction only (folderId is
        // app-owned once set).
        targetFolder: doc.itemAnalysis.targetFolder ?? null,
        extractedData: doc.itemAnalysis.extractedData ?? null,
        extractedIntelligence:
          intelligenceFields.length > 0 ? { fields: intelligenceFields } : null,
        documentAnalysis: doc.documentAnalysis,
        textContent: extractedText
          ? extractedText.slice(0, MAX_TEXT_CONTENT_CHARS)
          : null,
        knowledgeBankEntry: doc.knowledgeBankEntry ?? null,
      },
    });
  } catch (error) {
    console.error('[drive-ingest] extraction failed:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message || 'extraction failed' },
      { status: 500 },
    );
  }
}
