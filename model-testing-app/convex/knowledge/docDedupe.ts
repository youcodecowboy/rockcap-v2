import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { textFallbackChecksum } from "./chunker";

// Duplicate-document consolidation — root-cause cleanup for the re-ingestion
// duplication the Kinspire eval surfaced (the same file ingested 2-4× as
// separate documents rows, each re-atomized and re-chunked, burning retrieval
// slots on identical text). Retrieval-time chunk dedupe (chunkDedupe.ts) hides
// the symptom; THIS pass removes the cause by collapsing duplicate rows onto
// one canonical document.
//
// Shape (mirrors migrations/mergeDuplicateClients + atomsCore.mergeEntities):
//   1. findDuplicateDocuments — paginated detection, read-only. Groups docs by
//      content identity: same client scope + identical textContent hash
//      (textFallbackChecksum) + agreeing fileSize; docs with no extracted text
//      group only on an exactly-shared fileStorageId. Never groups across
//      clientIds (or across owners for personal-scope docs).
//   2. consolidateDuplicateDocuments — for each group picks a canonical row
//      (Drive mirror > classification richness > earliest _creationTime),
//      re-points live references from each duplicate to the canonical, deletes
//      the duplicate's chunks (disposable derivatives — canonical keeps or
//      rebuilds its own), and soft-archives the duplicate with a
//      `duplicateOf` breadcrumb + auditLog row. dryRun=true returns the full
//      plan (groups, canonical choice + why, artifact counts) with NO writes.
//
// Reversibility: duplicates are soft-deleted, never hard-deleted. Reversal =
// clear isDeleted/deletedAt/deletedReason/duplicateOf on the row, re-run
// knowledge/chunks.chunkDocument on it, and (if desired) move back the atom
// observations listed in the consolidation's auditLog metadata.
//
// Everything is paginated/bounded: detection walks documents in pages (index
// by_client when scoped), reference re-points use per-document indexes, and
// the only scans (notes.linkedDocumentIds / tasks.attachmentIds /
// knowledgeChecklistItems.suggestedDocumentId, which have no document index)
// are client/project-scoped index reads done once per group.

// ─────────────────────────────────────────────────────────────────────────────
// Pure parts (unit-tested in docDedupe.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Slim projection of a documents row — everything grouping + canonical
 * selection needs, WITHOUT the textContent payload (the checksum is computed
 * inside the page query so the action never accumulates raw text). */
export type DocDigest = {
  documentId: string;
  creationTime: number;
  clientId: string | null;
  scope: string | null;
  ownerId: string | null;
  fileName: string;
  fileSize: number | null;
  fileStorageId: string | null;
  folderId: string | null;
  version: string | null;
  contentChecksum: string | null;
  /** textFallbackChecksum(textContent) when the doc has non-blank text. */
  textChecksum: string | null;
  textLength: number;
  // Classification-richness inputs
  fileTypeDetected: string | null;
  category: string | null;
  hasDocumentAnalysis: boolean;
  hasExtractedIntelligence: boolean;
  hasDocumentCode: boolean;
  summaryLength: number;
  status: string | null;
};

/**
 * Content-identity grouping key, or null when the doc can never be grouped.
 *   • text-bearing docs: client scope + text hash (fileSize agreement is a
 *     second gate applied by partitionByFileSize — see below);
 *   • empty-text docs: client scope + exact fileStorageId (same storage id ⇒
 *     definitionally the same bytes); no storage id ⇒ ungroupable.
 * Scope key: clientId when present; personal-scope docs are keyed per owner;
 * everything else falls under "unscoped" (same-client-only grouping is the
 * hard rule — two docs with DIFFERENT clientIds can never share a key).
 */
export function dedupeGroupKey(d: {
  clientId: string | null;
  scope: string | null;
  ownerId: string | null;
  textChecksum: string | null;
  fileStorageId: string | null;
  fileName: string;
}): string | null {
  const scopeKey =
    d.clientId ??
    (d.scope === "personal" && d.ownerId ? `personal:${d.ownerId}` : "unscoped");
  const nameKey = normalizedNameKey(d.fileName);
  if (d.textChecksum) return `text|${scopeKey}|${nameKey}|${d.textChecksum}`;
  if (d.fileStorageId) return `storage|${scopeKey}|${nameKey}|${d.fileStorageId}`;
  return null;
}

/**
 * Filename component of the grouping key. Identical CONTENT under genuinely
 * different names is NOT a duplicate — the naming standard deliberately keeps
 * e.g. …_INTERNAL_V2.0 (working copy) and …_EXTERNAL_V2.0 (the copy that went
 * out) as distinct records even when byte-identical (Kinspire pilot caught
 * exactly this pair). Only download artifacts are normalized away so
 * "X.pdf" / "X (1).pdf" / "x.PDF" still group.
 */
export function normalizedNameKey(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/i, "") // extension
    .replace(/\s*(\(\d+\)|- \d+)\s*$/, "") // " (1)" / " - 2" copy suffixes
    .replace(/(%20|_20(?=\D)|[\s_]+)/g, " ") // URL-mangling + whitespace runs
    .trim();
}

/**
 * Second gate for text-hash groups: identical text hash AND same fileSize when
 * both carry one. Members sharing a positive fileSize bucket together; members
 * with no meaningful size (0 / null — e.g. generated docs) join the sized
 * bucket only when it is unambiguous (exactly one distinct positive size),
 * otherwise they form their own bucket together.
 */
export function partitionByFileSize<T extends { fileSize: number | null }>(
  members: T[],
): T[][] {
  const sized = new Map<number, T[]>();
  const unsized: T[] = [];
  for (const m of members) {
    if (typeof m.fileSize === "number" && m.fileSize > 0) {
      const bucket = sized.get(m.fileSize);
      if (bucket) bucket.push(m);
      else sized.set(m.fileSize, [m]);
    } else {
      unsized.push(m);
    }
  }
  const buckets = [...sized.values()];
  if (unsized.length > 0) {
    if (buckets.length === 1) buckets[0].push(...unsized);
    else buckets.push(unsized);
  }
  return buckets;
}

/** How much classification work would be lost by archiving this row.
 * Weighted so a detected fileType dominates the cosmetic extras (category /
 * code / summary) and the multi-stage pipeline's documentAnalysis outranks
 * every single-point signal. */
export function classificationRichness(d: {
  fileTypeDetected: string | null;
  category: string | null;
  hasDocumentAnalysis: boolean;
  hasExtractedIntelligence: boolean;
  hasDocumentCode: boolean;
  summaryLength: number;
}): number {
  let score = 0;
  const ft = (d.fileTypeDetected ?? "").trim();
  if (ft !== "" && ft !== "Unclassified") score += 4;
  const cat = (d.category ?? "").trim();
  if (cat !== "" && cat !== "Unclassified") score += 1;
  if (d.hasDocumentAnalysis) score += 2;
  if (d.hasExtractedIntelligence) score += 1;
  if (d.hasDocumentCode) score += 1;
  if (d.summaryLength > 0) score += 1;
  return score;
}

export type CanonicalInput = {
  documentId: string;
  creationTime: number;
  hasDriveMirror: boolean;
  richness: number;
};

export type CanonicalChoice = {
  canonicalId: string;
  reason:
    | "drive_mirror"
    | "richest_classification"
    | "earliest_created"
    | "id_tiebreak";
};

/** Canonical-row selection: Drive mirror > classification richness > earliest
 * _creationTime > id (pure determinism guard). Returns WHY the winner won —
 * the first rule that separates it from the runner-up. */
export function selectCanonical(members: CanonicalInput[]): CanonicalChoice {
  if (members.length === 0) throw new Error("selectCanonical: empty group");
  const sorted = [...members].sort((a, b) => {
    if (a.hasDriveMirror !== b.hasDriveMirror) return a.hasDriveMirror ? -1 : 1;
    if (a.richness !== b.richness) return b.richness - a.richness;
    if (a.creationTime !== b.creationTime) return a.creationTime - b.creationTime;
    return a.documentId < b.documentId ? -1 : 1;
  });
  const winner = sorted[0];
  if (sorted.length === 1) {
    return { canonicalId: winner.documentId, reason: "earliest_created" };
  }
  const runnerUp = sorted[1];
  let reason: CanonicalChoice["reason"];
  if (winner.hasDriveMirror && !runnerUp.hasDriveMirror) reason = "drive_mirror";
  else if (winner.richness > runnerUp.richness) reason = "richest_classification";
  else if (winner.creationTime < runnerUp.creationTime) reason = "earliest_created";
  else reason = "id_tiebreak";
  return { canonicalId: winner.documentId, reason };
}

/** Identity of an atom observation for move-time dedupe: two observations are
 * "the same evidence" when they back the same atom from the same source kind
 * at the same authority with the same anchor (sourceText + locator) and the
 * same extracted value. documentId is deliberately NOT part of the key — the
 * whole point is that the duplicate doc's observation collapses onto the
 * canonical doc's. */
export function observationIdentityKey(obs: {
  atomId: string;
  sourceType: string;
  authorityTier: number;
  sourceText?: string | null;
  locator?: unknown;
  extractedValue?: unknown;
}): string {
  return [
    obs.atomId,
    obs.sourceType,
    String(obs.authorityTier),
    obs.sourceText ?? "",
    JSON.stringify(obs.locator ?? null),
    JSON.stringify(obs.extractedValue ?? null),
  ].join("|");
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection (read-only)
// ─────────────────────────────────────────────────────────────────────────────

/** Belt-and-braces page bound for a detection run (matches the pattern in
 * chunks.backfillChunksForProseDocs). 2000 × default 10 = 20k docs. */
const DETECT_MAX_PAGES = 2000;
/** Small default page: each doc read pulls its full textContent (100K+ chars
 * for a RedBook), and Convex bounds bytes read per query. Override upward for
 * corpora known to carry light text. */
const DEFAULT_PAGE_SIZE = 10;
/** inspectDocuments batch bound. */
const INSPECT_BATCH = 25;
/** Sanity cap on a single consolidation group (real groups are 2-4 rows). */
const MAX_GROUP_SIZE = 25;
/** Cap on per-dupe moved-observation ids recorded in the auditLog row. */
const AUDIT_OBSERVATION_ID_CAP = 500;

/** One page of dedupe candidates, projected to DocDigest (text is hashed here
 * so the driving action never holds raw textContent). Soft-deleted rows and
 * rows already consolidated (duplicateOf set) are skipped. */
export const duplicateCandidatesPage = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const base = args.clientId
      ? ctx.db
          .query("documents")
          .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      : ctx.db.query("documents");
    const page = await base.paginate({
      cursor: args.cursor,
      numItems: args.limit,
    });

    const docs: DocDigest[] = [];
    for (const doc of page.page) {
      const d = doc as any;
      if (d.isDeleted === true || d.duplicateOf) continue;
      const text: string = typeof d.textContent === "string" ? d.textContent : "";
      const hasText = text.trim().length > 0;
      docs.push({
        documentId: String(doc._id),
        creationTime: doc._creationTime,
        clientId: d.clientId ? String(d.clientId) : null,
        scope: d.scope ?? null,
        ownerId: d.ownerId ? String(d.ownerId) : null,
        fileName: d.fileName,
        fileSize: typeof d.fileSize === "number" ? d.fileSize : null,
        fileStorageId: d.fileStorageId ? String(d.fileStorageId) : null,
        folderId: d.folderId ?? null,
        version: d.version ?? null,
        contentChecksum: d.contentChecksum ?? null,
        textChecksum: hasText ? textFallbackChecksum(text) : null,
        textLength: text.length,
        fileTypeDetected: d.fileTypeDetected ?? null,
        category: d.category ?? null,
        hasDocumentAnalysis: d.documentAnalysis != null,
        hasExtractedIntelligence: d.extractedIntelligence != null,
        hasDocumentCode:
          typeof d.documentCode === "string" && d.documentCode !== "",
        summaryLength: typeof d.summary === "string" ? d.summary.trim().length : 0,
        status: d.status ?? null,
      });
    }
    return {
      docs,
      examined: page.page.length,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Per-document artifact counts returned by inspectDocuments — what the
 * dry-run plan reports as "to move / to delete" for each duplicate. */
export type Inspection = {
  driveMirrors: number;
  atomObservations: number;
  documentChunks: number;
  documentNotes: number;
  comments: number;
  checklistLinks: number;
  enrichmentSuggestions: number;
  prospectingContext: number;
  knowledgeItems: number;
  projectDataItems: number;
  meetings: number;
  versionRefs: number;
};

/** Per-document artifact counts for the plan (and Drive-mirror presence for
 * canonical selection). Bounded: callers pass ≤ INSPECT_BATCH group-member ids;
 * every read is an indexed per-document lookup. */
export const inspectDocuments = internalQuery({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args): Promise<Record<string, Inspection>> => {
    if (args.documentIds.length > INSPECT_BATCH) {
      throw new Error(
        `inspectDocuments: pass at most ${INSPECT_BATCH} ids per call`,
      );
    }
    const out: Record<string, Inspection> = {};
    for (const documentId of args.documentIds) {
      const count = async (q: Promise<{ length: number }>) => (await q).length;
      out[String(documentId)] = {
        driveMirrors: await count(
          ctx.db
            .query("driveFiles")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .collect(),
        ),
        atomObservations: await count(
          ctx.db
            .query("atomObservations")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .collect(),
        ),
        documentChunks: await count(
          ctx.db
            .query("documentChunks")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .collect(),
        ),
        documentNotes: await count(
          ctx.db
            .query("documentNotes")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .collect(),
        ),
        comments: await count(
          ctx.db
            .query("comments")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .collect(),
        ),
        checklistLinks: await count(
          ctx.db
            .query("knowledgeChecklistDocumentLinks")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .collect(),
        ),
        enrichmentSuggestions: await count(
          ctx.db
            .query("enrichmentSuggestions")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .collect(),
        ),
        prospectingContext: await count(
          ctx.db
            .query("prospectingContext")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .collect(),
        ),
        knowledgeItems: await count(
          ctx.db
            .query("knowledgeItems")
            .withIndex("by_source_document", (q) =>
              q.eq("sourceDocumentId", documentId),
            )
            .collect(),
        ),
        projectDataItems: await count(
          ctx.db
            .query("projectDataItems")
            .withIndex("by_source_document", (q) =>
              q.eq("currentSourceDocumentId", documentId),
            )
            .collect(),
        ),
        meetings: await count(
          ctx.db
            .query("meetings")
            .withIndex("by_source_document", (q) =>
              q.eq("sourceDocumentId", documentId),
            )
            .collect(),
        ),
        versionRefs: await count(
          ctx.db
            .query("documents")
            .withIndex("by_previous_version", (q) =>
              q.eq("previousVersionId", documentId),
            )
            .collect(),
        ),
      };
    }
    return out;
  },
});

export type DuplicateGroupPlan = {
  groupKey: string;
  kind: "text" | "storage";
  clientId: string | null;
  canonical: {
    documentId: string;
    fileName: string;
    folderId: string | null;
    version: string | null;
    reason: CanonicalChoice["reason"];
    hasDriveMirror: boolean;
    richness: number;
    hasChunks: boolean;
  };
  duplicates: Array<{
    documentId: string;
    fileName: string;
    folderId: string | null;
    version: string | null;
    hasDriveMirror: boolean;
    richness: number;
    artifacts: Inspection;
  }>;
};

/** Shared detection core: walk the corpus, group by content identity, pick
 * canonicals, attach artifact counts. Read-only (queries only). */
async function buildConsolidationPlan(
  ctx: { runQuery: (ref: any, args: any) => Promise<any> },
  args: {
    clientId?: Id<"clients">;
    pageSize?: number;
    maxPages?: number;
  },
): Promise<{
  examined: number;
  pages: number;
  capped: boolean;
  groups: DuplicateGroupPlan[];
}> {
  const pageSize = args.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = Math.min(args.maxPages ?? DETECT_MAX_PAGES, DETECT_MAX_PAGES);

  const digests: DocDigest[] = [];
  let cursor: string | null = null;
  let examined = 0;
  let pages = 0;
  let capped = false;
  for (let i = 0; i < maxPages; i++) {
    const page = await ctx.runQuery(
      internal.knowledge.docDedupe.duplicateCandidatesPage,
      { cursor, limit: pageSize, clientId: args.clientId },
    );
    digests.push(...page.docs);
    examined += page.examined;
    pages++;
    if (page.isDone) break;
    cursor = page.cursor;
    if (i === maxPages - 1) capped = true;
  }

  // Group by content-identity key, then gate text groups on fileSize.
  const byKey = new Map<string, DocDigest[]>();
  for (const d of digests) {
    const key = dedupeGroupKey(d);
    if (!key) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(d);
    else byKey.set(key, [d]);
  }
  const rawGroups: Array<{
    key: string;
    kind: "text" | "storage";
    members: DocDigest[];
  }> = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    if (key.startsWith("text|")) {
      for (const part of partitionByFileSize(members)) {
        if (part.length < 2) continue;
        const size = part.find((p) => (p.fileSize ?? 0) > 0)?.fileSize ?? 0;
        rawGroups.push({
          key: `${key}|size:${size > 0 ? size : "unknown"}`,
          kind: "text",
          members: part,
        });
      }
    } else {
      rawGroups.push({ key, kind: "storage", members });
    }
  }

  // Artifact counts + Drive-mirror presence, batched.
  const inspection = new Map<string, Inspection>();
  const allIds = rawGroups.flatMap((g) => g.members.map((m) => m.documentId));
  for (let i = 0; i < allIds.length; i += INSPECT_BATCH) {
    const res = await ctx.runQuery(
      internal.knowledge.docDedupe.inspectDocuments,
      { documentIds: allIds.slice(i, i + INSPECT_BATCH) },
    );
    for (const [id, counts] of Object.entries(res)) {
      inspection.set(id, counts as Inspection);
    }
  }

  const groups: DuplicateGroupPlan[] = [];
  for (const g of rawGroups) {
    const inputs: CanonicalInput[] = g.members.map((m) => ({
      documentId: m.documentId,
      creationTime: m.creationTime,
      hasDriveMirror: (inspection.get(m.documentId)?.driveMirrors ?? 0) > 0,
      richness: classificationRichness(m),
    }));
    const choice = selectCanonical(inputs);
    const canonicalDigest = g.members.find(
      (m) => m.documentId === choice.canonicalId,
    )!;
    const canonicalInput = inputs.find(
      (i) => i.documentId === choice.canonicalId,
    )!;
    groups.push({
      groupKey: g.key,
      kind: g.kind,
      clientId: canonicalDigest.clientId,
      canonical: {
        documentId: choice.canonicalId,
        fileName: canonicalDigest.fileName,
        folderId: canonicalDigest.folderId,
        version: canonicalDigest.version,
        reason: choice.reason,
        hasDriveMirror: canonicalInput.hasDriveMirror,
        richness: canonicalInput.richness,
        hasChunks:
          (inspection.get(choice.canonicalId)?.documentChunks ?? 0) > 0,
      },
      duplicates: g.members
        .filter((m) => m.documentId !== choice.canonicalId)
        .map((m) => ({
          documentId: m.documentId,
          fileName: m.fileName,
          folderId: m.folderId,
          version: m.version,
          hasDriveMirror:
            (inspection.get(m.documentId)?.driveMirrors ?? 0) > 0,
          richness: classificationRichness(m),
          artifacts: inspection.get(m.documentId)!,
        })),
    });
  }
  return { examined, pages, capped, groups };
}

/** Read-only detection entry point: the full duplicate map + per-group
 * canonical choice and artifact counts, no writes. */
export const findDuplicateDocuments = internalAction({
  args: {
    clientId: v.optional(v.id("clients")),
    pageSize: v.optional(v.number()),
    maxPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const plan = await buildConsolidationPlan(ctx, args);
    return {
      examined: plan.examined,
      pages: plan.pages,
      capped: plan.capped,
      groupCount: plan.groups.length,
      duplicateRowCount: plan.groups.reduce(
        (n, g) => n + g.duplicates.length,
        0,
      ),
      groups: plan.groups,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Consolidation (writes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collapse ONE duplicate group onto its canonical row, atomically. For each
 * duplicate:
 *   • atomObservations move to the canonical documentId; an observation that
 *     duplicates evidence the canonical already carries live is additionally
 *     marked superseded (the findSameSourceObservation idiom) so corroboration
 *     never double-counts the same file;
 *   • documentChunks are DELETED (disposable derivatives; the driving action
 *     re-chunks the canonical if it has none);
 *   • live references re-point via indexed reads: driveFiles, documentNotes
 *     (with hasNotes/noteCount denorm repair), comments,
 *     knowledgeChecklistDocumentLinks (deduped per checklist item),
 *     enrichmentSuggestions, prospectingContext, knowledgeItems,
 *     projectDataItems.currentSourceDocumentId, meetings.sourceDocumentId,
 *     documents.previousVersionId (self-reference guarded);
 *   • client/project-scoped array scans re-point notes.linkedDocumentIds,
 *     tasks.attachmentIds, knowledgeChecklistItems.suggestedDocumentId;
 *   • the duplicate row is soft-archived (isDeleted + deletedReason +
 *     duplicateOf breadcrumb) and an auditLog row records the move counts and
 *     the moved observation ids.
 *
 * Historical/provenance tables (ingestionEvents, fileUploadQueue,
 * bulkUploadItems, extraction/job logs, snapshots, intelligence source refs,
 * filingCorrections, entityCandidates, contacts.sourceDocumentId,
 * modelRuns.sourceDocumentIds, projectDataItems.valueHistory) deliberately
 * keep pointing at the archived duplicate: the row still exists, so history
 * stays resolvable, and the duplicateOf breadcrumb maps it to the canonical.
 */
export const consolidateGroup = internalMutation({
  args: {
    canonicalId: v.id("documents"),
    duplicateIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const { canonicalId } = args;
    if (args.duplicateIds.length === 0) {
      throw new Error("consolidateGroup: no duplicates given");
    }
    if (args.duplicateIds.length > MAX_GROUP_SIZE) {
      throw new Error(
        `consolidateGroup: group too large (${args.duplicateIds.length} > ${MAX_GROUP_SIZE})`,
      );
    }
    if (args.duplicateIds.some((d) => d === canonicalId)) {
      throw new Error("consolidateGroup: canonicalId listed as its own duplicate");
    }
    const canonical = await ctx.db.get(canonicalId);
    if (!canonical) throw new Error(`canonical ${canonicalId} not found`);
    if ((canonical as any).isDeleted === true || (canonical as any).duplicateOf) {
      throw new Error(`canonical ${canonicalId} is deleted/consolidated`);
    }

    const now = new Date().toISOString();
    const dupeIdSet = new Set<string>(args.duplicateIds.map(String));

    // Canonical's LIVE observation identities — the dedupe reference set.
    const canonicalObs = await ctx.db
      .query("atomObservations")
      .withIndex("by_document", (q) => q.eq("documentId", canonicalId))
      .collect();
    const liveIdentity = new Set<string>(
      canonicalObs
        .filter((o) => o.superseded !== true)
        .map((o) =>
          observationIdentityKey({ ...o, atomId: String(o.atomId) }),
        ),
    );

    const totals: Record<string, number> = {};
    const bump = (k: string, n = 1) => {
      totals[k] = (totals[k] ?? 0) + n;
    };
    const perDupe: Array<{ duplicateId: string; counts: Record<string, number> }> =
      [];
    let notesMovedToCanonical = 0;

    for (const dupeId of args.duplicateIds) {
      const dupe = await ctx.db.get(dupeId);
      if (!dupe) throw new Error(`duplicate ${dupeId} not found`);
      if ((dupe as any).duplicateOf) continue; // already consolidated — idempotent re-run
      if (((dupe as any).clientId ?? null) !== ((canonical as any).clientId ?? null)) {
        throw new Error(
          `consolidateGroup: ${dupeId} and canonical ${canonicalId} have different clientIds — refusing`,
        );
      }

      const counts: Record<string, number> = {};
      const c = (k: string, n = 1) => {
        counts[k] = (counts[k] ?? 0) + n;
        bump(k, n);
      };
      const movedObservationIds: string[] = [];

      // 1. atomObservations → canonical (dedupe identical evidence).
      const obsRows = await ctx.db
        .query("atomObservations")
        .withIndex("by_document", (q) => q.eq("documentId", dupeId))
        .collect();
      for (const obs of obsRows) {
        const key = observationIdentityKey({
          ...obs,
          atomId: String(obs.atomId),
        });
        const isLive = obs.superseded !== true;
        if (isLive && liveIdentity.has(key)) {
          await ctx.db.patch(obs._id, {
            documentId: canonicalId,
            superseded: true,
          });
          c("observationsDeduped");
        } else {
          await ctx.db.patch(obs._id, { documentId: canonicalId });
          if (isLive) liveIdentity.add(key);
          c("observationsMoved");
        }
        if (movedObservationIds.length < AUDIT_OBSERVATION_ID_CAP) {
          movedObservationIds.push(String(obs._id));
        }
      }

      // 2. documentChunks of the duplicate — delete (canonical keeps its own).
      const chunkRows = await ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", dupeId))
        .collect();
      for (const ch of chunkRows) {
        await ctx.db.delete(ch._id);
        c("chunksDeleted");
      }

      // 3. driveFiles mirror rows → canonical.
      const driveRows = await ctx.db
        .query("driveFiles")
        .withIndex("by_document", (q) => q.eq("documentId", dupeId))
        .collect();
      for (const f of driveRows) {
        await ctx.db.patch(f._id, { documentId: canonicalId });
        c("driveFilesRepointed");
      }

      // 4. documentNotes → canonical (denorm repaired after the loop).
      const noteRows = await ctx.db
        .query("documentNotes")
        .withIndex("by_document", (q) => q.eq("documentId", dupeId))
        .collect();
      for (const n of noteRows) {
        await ctx.db.patch(n._id, { documentId: canonicalId });
        c("documentNotesMoved");
        notesMovedToCanonical++;
      }

      // 5. comments → canonical.
      const commentRows = await ctx.db
        .query("comments")
        .withIndex("by_document", (q) => q.eq("documentId", dupeId))
        .collect();
      for (const cm of commentRows) {
        await ctx.db.patch(cm._id, { documentId: canonicalId });
        c("commentsMoved");
      }

      // 6. checklist document links → canonical; a link whose checklist item
      // already links the canonical is redundant and is removed instead.
      const linkRows = await ctx.db
        .query("knowledgeChecklistDocumentLinks")
        .withIndex("by_document", (q) => q.eq("documentId", dupeId))
        .collect();
      for (const link of linkRows) {
        const itemLinks = await ctx.db
          .query("knowledgeChecklistDocumentLinks")
          .withIndex("by_checklist_item", (q) =>
            q.eq("checklistItemId", link.checklistItemId),
          )
          .collect();
        const canonicalLink = itemLinks.find(
          (l) => l.documentId === canonicalId,
        );
        if (canonicalLink) {
          // Keep exactly one link per (item, canonical); preserve primacy.
          if (link.isPrimary && !canonicalLink.isPrimary) {
            await ctx.db.patch(canonicalLink._id, { isPrimary: true });
          }
          await ctx.db.delete(link._id);
          c("checklistLinksDeleted");
        } else {
          await ctx.db.patch(link._id, {
            documentId: canonicalId,
            documentName:
              (canonical as any).displayName ?? (canonical as any).fileName,
          });
          c("checklistLinksRepointed");
        }
      }

      // 7. enrichmentSuggestions → canonical.
      const suggRows = await ctx.db
        .query("enrichmentSuggestions")
        .withIndex("by_document", (q) => q.eq("documentId", dupeId))
        .collect();
      for (const s of suggRows) {
        await ctx.db.patch(s._id, { documentId: canonicalId });
        c("enrichmentSuggestionsRepointed");
      }

      // 8. prospectingContext → canonical.
      const pcRows = await ctx.db
        .query("prospectingContext")
        .withIndex("by_document", (q) => q.eq("documentId", dupeId))
        .collect();
      for (const pc of pcRows) {
        await ctx.db.patch(pc._id, { documentId: canonicalId });
        c("prospectingContextRepointed");
      }

      // 9. knowledgeItems provenance → canonical.
      const kiRows = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_source_document", (q) =>
          q.eq("sourceDocumentId", dupeId),
        )
        .collect();
      for (const ki of kiRows) {
        await ctx.db.patch(ki._id, { sourceDocumentId: canonicalId });
        c("knowledgeItemsRepointed");
      }

      // 10. projectDataItems CURRENT source → canonical (valueHistory entries
      // are point-in-time provenance and stay on the archived row).
      const pdiRows = await ctx.db
        .query("projectDataItems")
        .withIndex("by_source_document", (q) =>
          q.eq("currentSourceDocumentId", dupeId),
        )
        .collect();
      for (const pdi of pdiRows) {
        await ctx.db.patch(pdi._id, { currentSourceDocumentId: canonicalId });
        c("projectDataItemsRepointed");
      }

      // 11. meetings created from this document → canonical.
      const meetingRows = await ctx.db
        .query("meetings")
        .withIndex("by_source_document", (q) =>
          q.eq("sourceDocumentId", dupeId),
        )
        .collect();
      for (const m of meetingRows) {
        await ctx.db.patch(m._id, { sourceDocumentId: canonicalId });
        c("meetingsRepointed");
      }

      // 12. Version chains through the duplicate. A doc whose previous version
      // is the dupe now descends from the canonical; if that doc IS the
      // canonical, it inherits the dupe's own ancestor instead (never a
      // self-reference, never another member of this group).
      const versionRefs = await ctx.db
        .query("documents")
        .withIndex("by_previous_version", (q) =>
          q.eq("previousVersionId", dupeId),
        )
        .collect();
      for (const ref of versionRefs) {
        if (ref._id === canonicalId) {
          const ancestor = (dupe as any).previousVersionId as
            | Id<"documents">
            | undefined;
          const safeAncestor =
            ancestor &&
            ancestor !== canonicalId &&
            !dupeIdSet.has(String(ancestor))
              ? ancestor
              : undefined;
          await ctx.db.patch(canonicalId, { previousVersionId: safeAncestor });
        } else {
          await ctx.db.patch(ref._id, { previousVersionId: canonicalId });
        }
        c("versionRefsRepointed");
      }

      // 13. Soft-archive the duplicate with the reversibility breadcrumb.
      await ctx.db.patch(dupeId, {
        isDeleted: true,
        deletedAt: now,
        deletedReason: `duplicate_of_${canonicalId}`,
        duplicateOf: canonicalId,
        hasNotes: false,
        noteCount: 0,
      });
      c("duplicatesArchived");

      // 14. Audit trail — one row per consolidated duplicate.
      await ctx.db.insert("auditLog", {
        tableName: "documents",
        recordId: String(dupeId),
        action: "update" as const,
        metadata: {
          operation: "consolidateDuplicateDocuments",
          canonicalId: String(canonicalId),
          duplicateId: String(dupeId),
          counts,
          movedObservationIds,
        },
        timestamp: now,
      });

      perDupe.push({ duplicateId: String(dupeId), counts });
    }

    // Scoped array/suggestion scans — once per group, not per duplicate.
    // These tables have no by-document index; clientId/projectId index scans
    // keep the read bounded to the group's own scope.
    const clientId = (canonical as any).clientId as Id<"clients"> | undefined;
    const projectIds = new Set<string>();
    const canonicalProject = (canonical as any).projectId;
    if (canonicalProject) projectIds.add(String(canonicalProject));
    for (const dupeId of args.duplicateIds) {
      const d = await ctx.db.get(dupeId);
      const p = (d as any)?.projectId;
      if (p) projectIds.add(String(p));
    }
    let scopedScansSkipped = false;
    if (clientId || projectIds.size > 0) {
      // notes.linkedDocumentIds + tasks.attachmentIds (array rewrite + dedupe)
      const rewriteArray = (ids: Array<Id<"documents">> | undefined) => {
        if (!ids || !ids.some((id) => dupeIdSet.has(String(id)))) return null;
        const rewritten = ids.map((id) =>
          dupeIdSet.has(String(id)) ? canonicalId : id,
        );
        return [...new Set(rewritten.map(String))].map(
          (s) => s as Id<"documents">,
        );
      };
      // notes — by_client + by_project reads, deduped by _id.
      const noteBatches = [
        clientId
          ? await ctx.db
              .query("notes")
              .withIndex("by_client", (q) => q.eq("clientId", clientId))
              .collect()
          : [],
        ...(await Promise.all(
          [...projectIds].map((pid) =>
            ctx.db
              .query("notes")
              .withIndex("by_project", (q) =>
                q.eq("projectId", pid as Id<"projects">),
              )
              .collect(),
          ),
        )),
      ];
      const noteById = new Map<string, (typeof noteBatches)[number][number]>();
      for (const batch of noteBatches) {
        for (const r of batch) noteById.set(String(r._id), r);
      }
      for (const note of noteById.values()) {
        const next = rewriteArray(note.linkedDocumentIds);
        if (next) {
          await ctx.db.patch(note._id, { linkedDocumentIds: next });
          bump("noteLinkArraysRewritten");
        }
      }

      // tasks — same shape.
      const taskBatches = [
        clientId
          ? await ctx.db
              .query("tasks")
              .withIndex("by_client", (q) => q.eq("clientId", clientId))
              .collect()
          : [],
        ...(await Promise.all(
          [...projectIds].map((pid) =>
            ctx.db
              .query("tasks")
              .withIndex("by_project", (q) =>
                q.eq("projectId", pid as Id<"projects">),
              )
              .collect(),
          ),
        )),
      ];
      const taskById = new Map<string, (typeof taskBatches)[number][number]>();
      for (const batch of taskBatches) {
        for (const r of batch) taskById.set(String(r._id), r);
      }
      for (const task of taskById.values()) {
        const next = rewriteArray(task.attachmentIds);
        if (next) {
          await ctx.db.patch(task._id, { attachmentIds: next });
          bump("taskAttachmentArraysRewritten");
        }
      }
      if (clientId) {
        const items = await ctx.db
          .query("knowledgeChecklistItems")
          .withIndex("by_client", (q) => q.eq("clientId", clientId))
          .collect();
        for (const item of items) {
          if (
            item.suggestedDocumentId &&
            dupeIdSet.has(String(item.suggestedDocumentId))
          ) {
            await ctx.db.patch(item._id, {
              suggestedDocumentId: canonicalId,
              suggestedDocumentName:
                (canonical as any).displayName ?? (canonical as any).fileName,
            });
            bump("checklistSuggestionsRepointed");
          }
        }
      }
    } else {
      // Unscoped document (no client, no project): the array-holding tables
      // cannot be scanned boundedly — skipped by design, flagged for the
      // operator. (Unscoped docs almost never carry note/task links.)
      scopedScansSkipped = true;
    }

    // Repair the canonical's notes denormalization.
    if (notesMovedToCanonical > 0) {
      const newCount =
        (((canonical as any).noteCount as number | undefined) ?? 0) +
        notesMovedToCanonical;
      await ctx.db.patch(canonicalId, {
        hasNotes: newCount > 0,
        noteCount: newCount,
      });
    }

    const canonicalChunk = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", canonicalId))
      .first();

    console.log(
      `[consolidateGroup] canonical=${canonicalId} dupes=${args.duplicateIds.length}: ` +
        Object.entries(totals)
          .map(([k, n]) => `${k}=${n}`)
          .join(" "),
    );
    return {
      canonicalId: String(canonicalId),
      perDupe,
      totals,
      scopedScansSkipped,
      canonicalNeedsChunks: canonicalChunk === null,
    };
  },
});

/**
 * The consolidation pass. dryRun=true → the full plan (groups, canonical
 * choice + why, artifact move/delete counts), zero writes. dryRun=false →
 * executes group by group (one transaction each) and re-chunks any canonical
 * left without chunks (chunkDocument no-ops on non-prose/no-text docs).
 *
 *   npx convex run knowledge/docDedupe:consolidateDuplicateDocuments \
 *     '{"clientId":"<id>","dryRun":true}'
 */
export const consolidateDuplicateDocuments = internalAction({
  args: {
    clientId: v.optional(v.id("clients")),
    dryRun: v.boolean(),
    maxGroups: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    maxPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const plan = await buildConsolidationPlan(ctx, {
      clientId: args.clientId,
      pageSize: args.pageSize,
      maxPages: args.maxPages,
    });

    if (args.dryRun) {
      return {
        dryRun: true as const,
        examined: plan.examined,
        capped: plan.capped,
        groupCount: plan.groups.length,
        duplicateRowCount: plan.groups.reduce(
          (n, g) => n + g.duplicates.length,
          0,
        ),
        groups: plan.groups,
      };
    }

    const maxGroups = args.maxGroups ?? plan.groups.length;
    const results: Array<{
      groupKey: string;
      canonicalId: string;
      totals: Record<string, number>;
      scopedScansSkipped: boolean;
      rechunked: boolean;
    }> = [];
    for (const group of plan.groups.slice(0, maxGroups)) {
      const res = await ctx.runMutation(
        internal.knowledge.docDedupe.consolidateGroup,
        {
          canonicalId: group.canonical.documentId as Id<"documents">,
          duplicateIds: group.duplicates.map(
            (d) => d.documentId as Id<"documents">,
          ),
        },
      );
      let rechunked = false;
      if (res.canonicalNeedsChunks) {
        const chunkRes = await ctx.runMutation(
          internal.knowledge.chunks.chunkDocument,
          { documentId: group.canonical.documentId as Id<"documents"> },
        );
        rechunked = chunkRes.chunked;
      }
      results.push({
        groupKey: group.groupKey,
        canonicalId: res.canonicalId,
        totals: res.totals,
        scopedScansSkipped: res.scopedScansSkipped,
        rechunked,
      });
    }

    const grandTotals: Record<string, number> = {};
    for (const r of results) {
      for (const [k, n] of Object.entries(r.totals)) {
        grandTotals[k] = (grandTotals[k] ?? 0) + n;
      }
    }
    return {
      dryRun: false as const,
      examined: plan.examined,
      capped: plan.capped,
      groupCount: plan.groups.length,
      consolidatedGroups: results.length,
      remainingGroups: plan.groups.length - results.length,
      grandTotals,
      results,
    };
  },
});
