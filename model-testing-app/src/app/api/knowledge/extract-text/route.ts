// =============================================================================
// KNOWLEDGE EXTRACT-TEXT ROUTE (Next.js App Router) — harness classification
// =============================================================================
// POST /api/knowledge/extract-text
//
// Thin, stateless PARSER for the harness classification lane (MCP tool
// `document.extractText` → convex/knowledge/harnessClassify.extractText).
// The Convex action ensures a document's bytes are in Convex storage and
// POSTs the signed storage URL here with the shared cron secret; this route
// fetches the bytes and runs fileProcessor's extractTextFromFile — the SAME
// server-side parser /api/drive/ingest and /api/v4-analyze use (pdf-parse /
// xlsx / mammoth cannot run in the Convex runtime).
//
// The parser lane is deliberately LLM-free: the calling agent (Claude Code on
// the operator's subscription) is the classifier. The ONE exception is the
// multimodal fallback below — image documents and scanned image-only PDFs have
// no text layer, so the parser yields nothing and they would contribute zero
// atoms to the knowledge pipeline. For those (and only those) we transcribe the
// bytes with Claude vision so the rest of the pipeline lights up. Compare
// /api/drive/ingest, which runs the full v4 pipeline at API cost — that route
// remains the automatic lane for re-processing changed Drive files; this one
// exists so bulk classification can run through the harness instead.

import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFileEx } from '@/lib/fileProcessor';
import { extractTextViaVision } from '@/lib/visionExtract';

// Large scanned PDFs / multi-tab XLSMs take minutes to parse; match
// /api/drive/ingest's budget.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Bound the response payload. The Convex action further truncates to 120K
// chars for the agent's context; this cap only protects the transport.
const MAX_TEXT_CHARS = 900_000;

export async function POST(request: NextRequest) {
  try {
    // Shared-secret gate — same pattern as /api/drive/ingest and
    // /api/knowledge/atomize. Cron-secret only; no interactive fallback.
    const cronSecret = request.headers.get('x-cron-secret');
    const isAuthorised =
      !!cronSecret &&
      !!process.env.CRON_SECRET &&
      cronSecret === process.env.CRON_SECRET;
    if (!isAuthorised) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as {
      fileUrl?: string;
      fileName?: string;
      fileType?: string;
    } | null;
    const { fileUrl, fileName, fileType } = body ?? {};
    if (!fileUrl || !fileName) {
      return NextResponse.json(
        { ok: false, error: 'fileUrl and fileName are required' },
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

    // ── Server-side text extraction ──
    // The parser handles anything with a text layer (PDF/DOCX/XLSX/CSV/EML/…).
    // Image documents and scanned image-only PDFs come back as a typed
    // needs_vision signal instead of empty/throw; for those we run the vision
    // fallback so they still contribute atoms. `method` records provenance for
    // the caller (see harnessClassify.extractText).
    const extraction = await extractTextFromFileEx(file);

    let text: string;
    let method: 'parser' | 'vision';

    if (extraction.status === 'text') {
      text = extraction.text;
      method = 'parser';
      if (!text || text.trim().length === 0) {
        return NextResponse.json(
          { ok: false, error: 'parser produced no text (empty document?)' },
          { status: 422 },
        );
      }
    } else if (extraction.status === 'no_text') {
      // Video/audio: no text layer and no vision path. Fail fast with a clear
      // message instead of falling through to raw-byte garbage.
      return NextResponse.json(
        { ok: false, error: extraction.reason },
        { status: 422 },
      );
    } else {
      // needs_vision — image or scanned/image-only PDF. On vision failure
      // (missing key, oversize, over page cap, unsupported image, empty
      // response) surface the same 422 rather than a fake success.
      try {
        text = await extractTextViaVision(file, extraction.kind, {
          pages: extraction.pages,
        });
        method = 'vision';
      } catch (visionError) {
        console.warn('[extract-text] vision fallback failed:', visionError);
        return NextResponse.json(
          {
            ok: false,
            error: `parser produced no text and vision fallback failed: ${(visionError as Error).message}`,
          },
          { status: 422 },
        );
      }
    }

    const truncated = text.length > MAX_TEXT_CHARS;
    return NextResponse.json({
      ok: true,
      text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
      truncated,
      fullTextChars: text.length,
      method,
    });
  } catch (error) {
    console.error('[extract-text] parse failed:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message || 'text extraction failed' },
      { status: 500 },
    );
  }
}
