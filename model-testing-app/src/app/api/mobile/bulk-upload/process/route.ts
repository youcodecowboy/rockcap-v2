// =============================================================================
// MOBILE BULK UPLOAD PROCESS GATEWAY
// =============================================================================
// POST /api/mobile/bulk-upload/process
//
// The mobile app uploads each file to Convex storage and creates a
// bulkUploadItems row in "pending" status with the storageId attached. This
// endpoint picks up from there: it hydrates batch/item context from Convex,
// fetches the file URL, forwards the work to the existing /api/v4-analyze
// route handler, and writes the analysis back via updateItemAnalysis so the
// item transitions to "ready_for_review".
//
// Why call /api/v4-analyze internally instead of re-implementing the pipeline?
// - Single source of truth for classification logic
// - Inherits text extraction, email metadata, retries and all prior fixes
// - Matches the contract the web bulkQueueProcessor has used for months
//
// Auth note: this endpoint is under /api/mobile/ which middleware.ts marks
// public. All the Convex mutations it drives (bulkUpload.updateItemAnalysis,
// getFileUrl, getBatch, getItem) have no auth guards — they're trusted by
// the mobile app's earlier authenticated upload step.

import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../../convex/_generated/api';

export const runtime = 'nodejs';
export const maxDuration = 120;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

interface ProcessBody {
  itemId: string;
  // Optional instructions override (otherwise inherited from batch)
  instructions?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProcessBody;
    const { itemId } = body;
    if (!itemId) {
      return NextResponse.json(
        { error: 'itemId is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_CONVEX_URL not configured on server' },
        { status: 500, headers: corsHeaders },
      );
    }
    const convex = new ConvexHttpClient(convexUrl);

    // ── 1. Hydrate item + batch ──
    const item: any = await convex.query(api.bulkUpload.getItem, {
      itemId: itemId as any,
    });
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404, headers: corsHeaders },
      );
    }
    if (!item.fileStorageId) {
      // No file was uploaded successfully — mark as failed and return.
      await convex.mutation(api.bulkUpload.updateItemStatus, {
        itemId: itemId as any,
        status: 'error',
        error: 'No file attached to item',
      });
      return NextResponse.json(
        { error: 'Item has no fileStorageId' },
        { status: 400, headers: corsHeaders },
      );
    }

    const batch: any = await convex.query(api.bulkUpload.getBatch, {
      batchId: item.batchId,
    });
    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    // Mark as processing early so the UI updates immediately.
    await convex.mutation(api.bulkUpload.updateItemStatus, {
      itemId: itemId as any,
      status: 'processing',
    });

    // ── 2. Get file URL from Convex storage ──
    const fileUrl: string | null = await convex.query(
      api.documents.getFileUrl,
      { storageId: item.fileStorageId },
    );
    if (!fileUrl) {
      await convex.mutation(api.bulkUpload.updateItemStatus, {
        itemId: itemId as any,
        status: 'error',
        error: 'Could not get file URL from storage',
      });
      return NextResponse.json(
        { error: 'Failed to resolve file URL' },
        { status: 500, headers: corsHeaders },
      );
    }

    // ── 3. Build metadata + forward to /api/v4-analyze ──
    // Pull in optional checklist + folder context so the pipeline can do its
    // full placement + checklist-match logic. These Convex queries have no
    // auth guards so ConvexHttpClient works.
    let availableFolders: Array<{
      folderKey: string;
      name: string;
      level: 'client' | 'project';
    }> = [];
    let checklistItems: any[] = [];

    // Only send folders that match the batch's upload level. If the AI sees
    // both client and project folders at once, it'll sometimes pick a
    // client-level key (like "miscellaneous") for a project-scoped upload —
    // the key doesn't exist at project level so the doc gets orphaned.
    // Constraining the list prevents that class of mismatch entirely.
    if (batch.projectId) {
      try {
        const projectFolders: any[] = await convex.query(
          api.projects.getProjectFolders,
          { projectId: batch.projectId },
        );
        for (const f of projectFolders || []) {
          availableFolders.push({
            folderKey: f.folderType,
            name: f.name,
            level: 'project',
          });
        }
      } catch (e) {
        console.warn('[mobile process] getProjectFolders failed:', e);
      }
    } else if (batch.scope === 'client' && batch.clientId) {
      try {
        const clientFolders: any[] = await convex.query(
          api.clients.getClientFolders,
          { clientId: batch.clientId },
        );
        for (const f of clientFolders || []) {
          availableFolders.push({
            folderKey: f.folderType,
            name: f.name,
            level: 'client',
          });
        }
      } catch (e) {
        console.warn('[mobile process] getClientFolders failed:', e);
      }
    }
    if (batch.projectId) {
      try {
        const checklist: any[] = await convex.query(
          api.knowledgeLibrary.getChecklistByProject,
          { projectId: batch.projectId },
        );
        checklistItems = (checklist || [])
          .filter(
            (it: any) =>
              it.status === 'missing' || it.status === 'pending_review',
          )
          .map((it: any) => ({
            id: it._id,
            name: it.name || '',
            category: it.category,
            status: it.status,
            matchingDocumentTypes: it.matchingDocumentTypes,
          }));
      } catch (e) {
        console.warn('[mobile process] getChecklistByProject failed:', e);
      }
    } else if (batch.clientId) {
      try {
        const checklist: any[] = await convex.query(
          api.knowledgeLibrary.getClientLevelChecklist,
          { clientId: batch.clientId },
        );
        checklistItems = (checklist || [])
          .filter(
            (it: any) =>
              it.status === 'missing' || it.status === 'pending_review',
          )
          .map((it: any) => ({
            id: it._id,
            name: it.name || '',
            category: it.category,
            status: it.status,
            matchingDocumentTypes: it.matchingDocumentTypes,
          }));
      } catch (e) {
        console.warn('[mobile process] getClientLevelChecklist failed:', e);
      }
    }

    const metadata = {
      clientContext: {
        clientName: batch.clientName,
      },
      clientName: batch.clientName,
      projectShortcode: batch.projectShortcode,
      isInternal: batch.isInternal ?? batch.scope === 'internal',
      uploaderInitials: batch.uploaderInitials,
      instructions: body.instructions ?? batch.instructions,
      availableFolders: availableFolders.length > 0 ? availableFolders : undefined,
      checklistItems: checklistItems.length > 0 ? checklistItems : undefined,
      folderHints: item.folderHint ? { '0': item.folderHint } : undefined,
    };

    const fd = new FormData();
    fd.append('fileUrl_0', fileUrl);
    fd.append('fileName_0', item.fileName);
    fd.append('fileType_0', item.fileType);
    fd.append('metadata', JSON.stringify(metadata));

    // Build the v4-analyze URL — same host as us, same protocol.
    const url = new URL(request.url);
    const v4Url = `${url.protocol}//${url.host}/api/v4-analyze`;

    const analyzeRes = await fetch(v4Url, { method: 'POST', body: fd });
    if (!analyzeRes.ok) {
      const errJson = await analyzeRes.json().catch(() => ({}));
      const msg =
        errJson.error || `v4-analyze failed (HTTP ${analyzeRes.status})`;
      await convex.mutation(api.bulkUpload.updateItemStatus, {
        itemId: itemId as any,
        status: 'error',
        error: msg,
      });
      return NextResponse.json(
        { error: msg },
        { status: 500, headers: corsHeaders },
      );
    }

    const v4Data: any = await analyzeRes.json();
    if (!v4Data.success || !v4Data.documents || v4Data.documents.length === 0) {
      const msg = v4Data.errors?.[0]?.error || 'V4 analysis returned no results';
      await convex.mutation(api.bulkUpload.updateItemStatus, {
        itemId: itemId as any,
        status: 'error',
        error: msg,
      });
      return NextResponse.json(
        { error: msg },
        { status: 500, headers: corsHeaders },
      );
    }

    // ── 4. Write analysis back to Convex ──
    const doc = v4Data.documents[0];
    // V4 returns some optional string fields as `null` when the model had no
    // value for them (e.g. pageReference on a document with no page refs).
    // Convex's `v.optional(v.string())` validator accepts `undefined` but
    // rejects `null`, so coerce nulls → undefined on the intelligence fields
    // before handing them off.
    const intelligenceFields = (doc.intelligenceFields || []).map((f: any) => ({
      ...f,
      sourceText: f.sourceText ?? undefined,
      originalLabel: f.originalLabel ?? undefined,
      matchedAlias: f.matchedAlias ?? undefined,
      pageReference: f.pageReference ?? undefined,
      scope: f.scope ?? undefined,
    }));

    // Build updateItemAnalysis args. Mirrors bulkQueueProcessor's shape.
    // NOTE: some fields (duplicate detection, version bumps) need additional
    // Convex queries to compute — keeping this minimal for Phase 1. The user
    // can still review and confirm on mobile once Phase 2 lands.
    const updateArgs: any = {
      itemId: itemId as any,
      fileStorageId: item.fileStorageId,
      summary: doc.summary || '',
      fileTypeDetected: doc.fileType || 'Unknown',
      category: doc.category || 'miscellaneous',
      targetFolder: doc.suggestedFolder || undefined,
      confidence: typeof doc.confidence === 'number' ? doc.confidence : 0,
      generatedDocumentCode: doc.generatedDocumentCode || undefined,
      version: doc.version || undefined,
      // Intelligence extraction (can be empty)
      extractedIntelligence:
        intelligenceFields.length > 0
          ? { fields: intelligenceFields }
          : undefined,
      // Stage 1 document analysis
      documentAnalysis: doc.documentAnalysis || undefined,
      classificationReasoning: doc.classificationReasoning || undefined,
      // Suggested checklist matches — only include entries with valid Convex IDs
      suggestedChecklistItems:
        (doc.checklistMatches || [])
          .filter((m: any) => m.itemId && typeof m.itemId === 'string')
          .map((m: any) => ({
            itemId: m.itemId,
            itemName: m.itemName || m.name || '',
            category: m.category || '',
            confidence: typeof m.confidence === 'number' ? m.confidence : 0,
            reasoning: m.reasoning,
          })) || undefined,
    };

    await convex.mutation(api.bulkUpload.updateItemAnalysis, updateArgs);

    // updateItemAnalysis transitions the item from "processing" → "ready_for_review"
    // via its batch-side effect, which also promotes the batch to "review" when
    // all items are accounted for. Nothing else to do here.

    return NextResponse.json(
      {
        success: true,
        itemId,
        category: updateArgs.category,
        fileType: updateArgs.fileTypeDetected,
        confidence: updateArgs.confidence,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error('[mobile bulk-upload process] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
