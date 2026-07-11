import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { textFallbackChecksum } from "./chunker";

// Upload-lane entry into the knowledge feed (the schema's advertised
// `source: "upload"` — previously unwired). Called in-transaction, AFTER the
// documents row exists, by every mutation that files an upload-originated
// document (documents.create, bulkUpload.fileItem / fileBatch — the paths
// that persist textContent). Deliberately NOT called for document copies or
// AI-generated documents: a copy would double-atomize identical content, and
// generated docs would feed the model's own prose back into the graph.
//
// Uploads carry no Drive byte-md5, so the revision key is the same
// text-derived checksum chunkDocument itself falls back to — the two lanes
// stay keyed on one identity. Downstream, the atomizer sweep picks the event
// up only for knowledge-enabled clients (the §14b.1 cost wall).
export async function recordUploadIngestion(
  ctx: MutationCtx,
  documentId: Id<"documents">,
): Promise<void> {
  const doc = await ctx.db.get(documentId);
  if (!doc || !doc.clientId) return; // unscoped docs have no knowledge home
  const text = doc.textContent ?? "";
  if (!text.trim()) return; // no extractable text — no revision to key
  const checksum = doc.contentChecksum ?? textFallbackChecksum(text);
  if (doc.contentChecksum === undefined) {
    await ctx.db.patch(documentId, { contentChecksum: checksum });
  }
  await ctx.db.insert("ingestionEvents", {
    documentId,
    source: "upload",
    checksum,
    kind: "created",
    at: new Date().toISOString(),
  });
  await ctx.scheduler.runAfter(0, internal.knowledge.chunks.chunkDocument, {
    documentId,
  });
}
