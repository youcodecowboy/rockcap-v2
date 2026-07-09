// Chunk-text dedupe — pure, deterministic helper (no Convex, no I/O).
//
// The same file ingested 2-4x produces DUPLICATE document rows whose chunks
// are near-identical, and in a live retrieval eval those duplicates burned
// 23% of the top-8 chunk slots (37/160). The duplicate rows can carry
// DIFFERENT contentChecksums — one a Drive byte checksum, the other a
// text-fnv1a fallback (chunker.ts textFallbackChecksum) — so identity keyed
// on (contentChecksum, chunkIndex) does NOT collapse them. The chunk TEXT
// itself does: normalize (lowercase, collapse whitespace) and hash, then keep
// one instance per hash. chunksSearchHybrid (embeddings.ts) applies this to
// the RRF-merged page before slicing to `limit`.

import { textFallbackChecksum } from "./chunker";

/** Duplicate-detection key for a chunk's text: lowercase, collapse every
 * whitespace run to a single space, trim, then FNV-1a hash (reusing the
 * chunker's checksum, which also folds in length as a collision guard). */
export function chunkTextDedupeKey(text: string): string {
  return textFallbackChecksum(text.toLowerCase().replace(/\s+/g, " ").trim());
}

/** Drop rows whose normalized text has already been seen, keeping the FIRST
 * instance of each. Callers pass rows sorted best-first (RRF-merged pages
 * are), so "first" = the highest-scoring instance. Order is preserved. */
export function dedupeChunksByText<T extends { text: string }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = chunkTextDedupeKey(row.text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
