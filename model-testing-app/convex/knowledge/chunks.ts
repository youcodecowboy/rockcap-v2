import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  chunkProseText,
  isProseDocument,
  textFallbackChecksum,
} from "./chunker";

// Prose chunking POLICY layer — the automated caller the chunk write-path
// (atomsCore.upsertChunks) never had. When a document is classified as PROSE,
// its extracted text is chunked and the chunks are (re)built via upsertChunks
// (delete-and-recreate per revision). Three entry points feed this one policy:
//   • the harness classification pass (harnessClassify.applyClassification),
//   • the re-atomization lane (atomizerLane.sweep, after reatomizeDiff),
//   • the manual backfill (backfillChunksForProseDocs).
// The prose predicate and the chunker live in ./chunker (unit-pure); this file
// owns the Convex plumbing and the single decision point (chunkDocument).

/**
 * Chunk one document IF it is prose with stored text. Idempotent: upsertChunks
 * deletes the document's existing chunks first, so re-running (re-atomization,
 * backfill) simply refreshes them against the current revision. Reads the doc
 * fresh so a caller only needs to pass the id.
 */
export const chunkDocument = internalMutation({
  args: { documentId: v.id("documents") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    chunked: boolean;
    reason?: string;
    count?: number;
  }> => {
    const doc = (await ctx.db.get(args.documentId)) as any;
    if (!doc) return { chunked: false, reason: "document_not_found" };

    const textContent: string = doc.textContent ?? "";
    if (textContent.trim().length === 0) {
      return { chunked: false, reason: "no_text" };
    }
    // Chunks key the revision by checksum (mirrors atoms' provenance). Docs
    // ingested outside the Drive hydration lane have no byte checksum — derive
    // a revision stamp from the text instead of skipping them (Kinspire pilot:
    // 49 text-bearing docs, incl. a 104K-char RedBook, were silently dropped).
    const contentChecksum: string =
      doc.contentChecksum ?? textFallbackChecksum(textContent);

    // mimeType: prefer the Drive mirror's true type, fall back to the upload's.
    const driveRow = await ctx.db
      .query("driveFiles")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    const mimeType: string | undefined =
      (driveRow as any)?.mimeType ?? doc.fileType ?? undefined;

    if (
      !isProseDocument({
        category: doc.category ?? null,
        fileType: doc.fileTypeDetected ?? null,
        mimeType,
        textLength: textContent.length,
      })
    ) {
      return { chunked: false, reason: "not_prose" };
    }

    const chunks = chunkProseText(textContent);
    if (chunks.length === 0) return { chunked: false, reason: "empty_chunking" };

    // Route through the shared write-path — it enforces MAX_CHUNKS and schedules
    // the Voyage embedding hook. Scheduled (mutations can't runMutation).
    await ctx.scheduler.runAfter(
      0,
      internal.knowledge.atomsCore.upsertChunks,
      {
        documentId: args.documentId,
        contentChecksum,
        clientId: (doc.clientId ?? undefined) as Id<"clients"> | undefined,
        projectId: (doc.projectId ?? undefined) as Id<"projects"> | undefined,
        chunks,
      },
    );
    return { chunked: true, count: chunks.length };
  },
});

// ── Backfill ──────────────────────────────────────────────────────────────
//
// Walk already-classified PROSE docs that carry stored textContent but have no
// chunks yet, and chunk each. The prose decision is made IN the candidate query
// (same isProseDocument predicate chunkDocument applies), so non-prose docs —
// which never acquire chunks and would otherwise reappear in the frontier every
// night — are excluded up front. That keeps the walk's work bounded to genuine
// prose stragglers and stops non-prose docs from starving the candidate budget.

/** One page of documents that need chunking: classified PROSE, has stored text,
 * and has no documentChunks yet. `examined` reports how many docs the page
 * walked (candidate or not) so the driver can bound the nightly scan. */
export const proseDocsNeedingChunksPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("documents")
      .paginate({ cursor: args.cursor, numItems: args.limit });

    const docs: Array<{ _id: Id<"documents"> }> = [];
    for (const doc of page.page) {
      const d = doc as any;
      const classified =
        typeof d.fileTypeDetected === "string" &&
        d.fileTypeDetected !== "" &&
        d.fileTypeDetected !== "Unclassified";
      const hasText =
        typeof d.textContent === "string" && d.textContent.trim().length > 0;
      // No contentChecksum requirement: chunkDocument derives a text-based
      // revision stamp for docs the Drive lane never checksummed.
      if (!classified || !hasText) continue;

      // Authoritative prose decision — mirrors chunkDocument so a non-prose doc
      // (spreadsheet/CSV/image with vision text, etc.) is never a candidate and
      // thus never lingers in the frontier consuming the budget forever.
      const driveRow = await ctx.db
        .query("driveFiles")
        .withIndex("by_document", (q) => q.eq("documentId", doc._id))
        .first();
      const mimeType: string | undefined =
        (driveRow as any)?.mimeType ?? d.fileType ?? undefined;
      if (
        !isProseDocument({
          category: d.category ?? null,
          fileType: d.fileTypeDetected ?? null,
          mimeType,
          textLength: (d.textContent as string).length,
        })
      ) {
        continue;
      }

      const existingChunk = await ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", doc._id))
        .first();
      if (existingChunk) continue;
      docs.push({ _id: doc._id });
    }
    return {
      docs,
      examined: page.page.length,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// Bounds the nightly scan. The candidate query already excludes non-prose and
// already-chunked docs, so the frontier advances every run (chunked docs leave
// it) and no doc is stuck forever. This page cap is the belt-and-braces bound so
// a single run can never walk the documents table unboundedly — matching the
// paginated MAX_PAGES pattern the rest of the integrity sweep uses. 500 × 50 =
// 25k docs, i.e. a realistic corpus in one pass.
const BACKFILL_MAX_PAGES = 500;

/**
 * Backfill chunks for prose documents that have none. Suitable for manual
 * invocation (`internal.knowledge.chunks.backfillChunksForProseDocs`) or the
 * nightly integrity sweep. Walks the corpus in pages (bounded by
 * BACKFILL_MAX_PAGES), chunking each prose straggler until it has chunked
 * `maxDocs` of them or run out of documents.
 *
 * `maxDocs` caps the CHUNKING WORK per run (candidates acted on), NOT the number
 * of documents scanned — scanning is bounded separately by BACKFILL_MAX_PAGES.
 */
export const backfillChunksForProseDocs = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
    maxDocs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 50;
    const maxDocs = args.maxDocs ?? 500;
    let cursor: string | null = args.cursor ?? null;
    let walked = 0; // documents examined (candidate or not)
    let acted = 0; // candidates passed to chunkDocument
    let chunked = 0;
    let skipped = 0;
    let pages = 0;
    let capped = false;

    for (let i = 0; i < BACKFILL_MAX_PAGES; i++) {
      const page = await ctx.runQuery(
        internal.knowledge.chunks.proseDocsNeedingChunksPage,
        { cursor, limit: batchSize },
      );
      walked += page.examined;
      pages++;
      for (const d of page.docs) {
        if (acted >= maxDocs) break;
        acted++;
        const res = await ctx.runMutation(
          internal.knowledge.chunks.chunkDocument,
          { documentId: d._id },
        );
        if (res.chunked) chunked++;
        else skipped++;
      }
      if (page.isDone) {
        cursor = null;
        break;
      }
      cursor = page.cursor;
      if (acted >= maxDocs) break;
      if (i === BACKFILL_MAX_PAGES - 1) capped = true;
    }

    // `scanned` kept for the sweep's existing log line (== candidates acted on).
    return {
      walked,
      scanned: acted,
      chunked,
      skipped,
      pages,
      capped,
      nextCursor: cursor,
    };
  },
});
