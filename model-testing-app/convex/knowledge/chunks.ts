import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { chunkProseText, isProseDocument } from "./chunker";

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
    // Chunks key the revision by checksum (mirrors atoms' provenance). No
    // checksum → we can't stamp the revision, so skip rather than guess.
    const contentChecksum: string | undefined = doc.contentChecksum ?? undefined;
    if (!contentChecksum) return { chunked: false, reason: "no_checksum" };

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
// Walk already-classified prose docs that carry stored textContent but have no
// chunks yet, and chunk each. Coarse pre-filter (classified + has text + zero
// chunks) lives in the query; chunkDocument makes the authoritative prose
// decision, so the two never disagree. Paginated for manual invocation or a
// future sweep.

/** One page of documents that MIGHT need chunking: classified, has stored
 * text, and has no documentChunks yet. Prose is decided downstream. */
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
      if (!classified || !hasText || !d.contentChecksum) continue;
      const existingChunk = await ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", doc._id))
        .first();
      if (existingChunk) continue;
      docs.push({ _id: doc._id });
    }
    return { docs, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * Backfill chunks for prose documents that have none. Suitable for manual
 * invocation (`internal.knowledge.chunks.backfillChunksForProseDocs`) or a
 * future cron sweep. Pages through the corpus, chunking each prose doc.
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
    let scanned = 0;
    let chunked = 0;
    let skipped = 0;

    while (scanned < maxDocs) {
      const page = await ctx.runQuery(
        internal.knowledge.chunks.proseDocsNeedingChunksPage,
        { cursor, limit: batchSize },
      );
      for (const d of page.docs) {
        if (scanned >= maxDocs) break;
        scanned++;
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
    }

    return { scanned, chunked, skipped, nextCursor: cursor };
  },
});
