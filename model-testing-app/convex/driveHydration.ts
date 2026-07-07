import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  ensureAccessToken,
  resolveFolderScope,
  resolveProjectFolderKey,
  SETTLE_MS,
  type FolderScope,
  type MirrorFolder,
} from "./driveSync";

// Google Drive hydration — the extraction pipeline (phase 3, reshaped by
// phase 4a's import-gated model).
//
// The phase-2 mirror (driveSync.ts) stamps settled/dirty bookkeeping onto
// IMPORTED driveFiles rows (documentId set — see driveSync.importDriveFiles);
// THIS module fills those files' import-created `documents` rows with
// extracted content:
//
//   hydrateSettled (cron, every 5 min)
//     1. RECLAIM: "processing" rows stuck > 30 min → back to "settling"
//        (crash recovery — the action died between markProcessing and
//        applyExtraction/markError).
//     2. SELECT: due "settling" rows (settleAfter passed, or dirty > 4h —
//        starvation guard against a file that never stops changing) plus
//        retryable "error" rows. Oldest-dirty first, 5 per tick.
//     3. Per file: resolve the client scope from the folder map, fetch the
//        bytes from Drive, cache them in Convex storage, POST the signed
//        storage URL to the Next.js /api/drive/ingest route (which runs the
//        v4 extraction pipeline — Convex actions can't run pdf parsing /
//        the Anthropic pipeline), then persist via applyExtraction.
//
// Consistency model: `checksumAtFetch` is the row's md5 read immediately
// before the byte fetch. applyExtraction stamps exactly that value as
// extractedChecksum, so a file edited mid-hydration (row md5 has moved on)
// re-enters "settling" instead of "complete" and gets re-extracted.
//
// The Convex→Next callback copies hubspotSync/recurringSync.ts exactly:
// POST ${NEXT_APP_URL}/api/drive/ingest with header x-cron-secret.
//
// CLASSIFICATION IDENTITY IS IMMUTABLE (operator decision 2026-07-07): once
// a documents row carries a real classification (fileTypeDetected set and
// not "Unclassified"), re-extraction refreshes CONTENTS — summary /
// textContent / documentAnalysis / extractedData / extractedIntelligence /
// contentChecksum / bytes — but NEVER overwrites fileTypeDetected /
// category / documentCode / the identity confidence. "An appraisal never
// stops being an appraisal; edits change contents, never identity."
// (Folders were already immutable after first placement.) Upgrading an
// "Unclassified" placeholder is the FIRST real classification, not a
// change, and still lands normally. Reclassification is an explicit
// operator action only — a future `document.reclassify` tool, deliberately
// NOT built yet. Same rule in knowledge/harnessClassify.applyClassification.

const MAX_FILES_PER_TICK = 5;
const PROCESSING_RECLAIM_MS = 30 * 60_000; // stuck-"processing" reclaim window
const STARVATION_MS = 4 * 60 * 60_000; // settling row dirty > 4h → force-eligible
const RETRY_DELAY_MS = 30 * 60_000; // spacing between attempts on an error row
// Total attempt budget per checksum: the first attempt plus two retries.
// (An error row is retried while its recorded failure count < 3 — i.e.
// fewer than 2 retries behind it — so a route that 500s twice and then
// succeeds still lands on "complete".) A change to the file resets the
// counter via the poller (settling clears extractionError).
const MAX_ATTEMPTS = 3;
const MAX_BYTES = 100 * 1024 * 1024; // fileProcessor's 100MB cap (validateFile)

// Attempt bookkeeping is encoded as a prefix on extractionError:
//   "attempt=2|Drive bytes fetch failed (403)"
// so no schema field is needed and the operator still sees the message.
function parseAttempts(extractionError: string | undefined): number {
  const m = extractionError?.match(/^attempt=(\d+)\|/);
  return m ? parseInt(m[1], 10) : 0;
}

// ── Internal reads ───────────────────────────────────────────────

type HydrationSelection = {
  candidateIds: Id<"driveFiles">[];
  upToDateIds: Id<"driveFiles">[];
  unimportedIds: Id<"driveFiles">[];
};

// Pick this tick's work. Returns ids only — the action re-reads each row
// via getFileInternal right before fetching bytes, so checksumAtFetch is
// captured at FETCH time, not selection time (a serial tick can spend
// minutes on earlier files).
export const selectCandidatesInternal = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args): Promise<HydrationSelection> => {
    const upToDateIds: Id<"driveFiles">[] = [];
    const unimportedIds: Id<"driveFiles">[] = [];
    const eligible: Doc<"driveFiles">[] = [];

    const settling = await ctx.db
      .query("driveFiles")
      .withIndex("by_extraction_status", (q) =>
        q.eq("extractionStatus", "settling"),
      )
      .collect();
    for (const f of settling) {
      if (f.trashed === true) continue;
      if (!f.md5Checksum) continue; // Google-native / checksum-less — nothing fetchable
      if (!f.documentId) {
        // Never imported — must not extract (documentId IS the imported
        // flag). Legacy rows queued under the old mapping-queues-extraction
        // model are normalized back to "none".
        unimportedIds.push(f._id);
        continue;
      }
      if (f.md5Checksum === f.extractedChecksum) {
        // Edited then reverted (or drift race resolved itself): the current
        // bytes are already extracted. Normalize to "complete" so the row
        // doesn't sit in "settling" forever.
        upToDateIds.push(f._id);
        continue;
      }
      const due =
        (f.settleAfter !== undefined && f.settleAfter < args.now) ||
        (f.firstDirtyAt !== undefined && args.now - f.firstDirtyAt > STARVATION_MS);
      if (due) eligible.push(f);
    }

    const errored = await ctx.db
      .query("driveFiles")
      .withIndex("by_extraction_status", (q) =>
        q.eq("extractionStatus", "error"),
      )
      .collect();
    for (const f of errored) {
      if (f.trashed === true) continue;
      if (!f.md5Checksum) continue;
      if (!f.documentId) {
        unimportedIds.push(f._id); // legacy pre-import error row — normalize
        continue;
      }
      if (f.md5Checksum === f.extractedChecksum) continue; // nothing new to extract
      if (parseAttempts(f.extractionError) >= MAX_ATTEMPTS) continue; // budget spent
      // markExtractionError always sets settleAfter = failure + 30 min; a
      // missing value (legacy row) is treated as due rather than stranded.
      if (f.settleAfter === undefined || f.settleAfter < args.now) {
        eligible.push(f);
      }
    }

    // Oldest dirty first; rows without firstDirtyAt go last.
    eligible.sort(
      (a, b) => (a.firstDirtyAt ?? Infinity) - (b.firstDirtyAt ?? Infinity),
    );

    return {
      candidateIds: eligible.slice(0, MAX_FILES_PER_TICK).map((f) => f._id),
      upToDateIds,
      unimportedIds,
    };
  },
});

// Fresh row read, per file, right before the byte fetch (see note above).
export const getFileInternal = internalQuery({
  args: { fileId: v.id("driveFiles") },
  handler: async (ctx, args): Promise<Doc<"driveFiles"> | null> => {
    return ctx.db.get(args.fileId);
  },
});

// ── Internal writes ──────────────────────────────────────────────

// Crash recovery: a "processing" row whose processingStartedAt is older
// than 30 min means the hydration action died mid-flight (after the byte
// fetch, before applyExtraction/markExtractionError landed). Put it back
// in "settling" — its settleAfter/firstDirtyAt were never cleared, so the
// selector picks it up again immediately. The documents row already exists
// (created at import) and applyExtraction only ever patches it in place,
// so a re-run can't duplicate anything.
export const reclaimStaleProcessing = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, args): Promise<number> => {
    const rows = await ctx.db
      .query("driveFiles")
      .withIndex("by_extraction_status", (q) =>
        q.eq("extractionStatus", "processing"),
      )
      .collect();
    let reclaimed = 0;
    for (const f of rows) {
      if (
        f.processingStartedAt === undefined ||
        args.now - f.processingStartedAt > PROCESSING_RECLAIM_MS
      ) {
        await ctx.db.patch(f._id, {
          extractionStatus: "settling",
          processingStartedAt: undefined,
        });
        reclaimed++;
      }
    }
    return reclaimed;
  },
});

// Settling rows whose current md5 is already extracted → "complete".
export const markUpToDateInternal = internalMutation({
  args: { fileIds: v.array(v.id("driveFiles")) },
  handler: async (ctx, args) => {
    for (const id of args.fileIds) {
      const row = await ctx.db.get(id);
      if (!row || row.extractionStatus !== "settling") continue;
      await ctx.db.patch(id, {
        extractionStatus: "complete",
        settleAfter: undefined,
        firstDirtyAt: undefined,
        processingStartedAt: undefined,
        extractionError: undefined,
      });
    }
  },
});

// Rows that must not extract (never imported — no documents row) are
// normalized back to "none". Import re-queues them explicitly.
export const resetToNoneInternal = internalMutation({
  args: { fileIds: v.array(v.id("driveFiles")) },
  handler: async (ctx, args) => {
    for (const fileId of args.fileIds) {
      await ctx.db.patch(fileId, {
        extractionStatus: "none",
        settleAfter: undefined,
        firstDirtyAt: undefined,
        processingStartedAt: undefined,
        extractionError: undefined,
      });
    }
  },
});

// Bytes are cached in storage; the extraction round-trip starts now.
// Deliberately does NOT touch settleAfter/firstDirtyAt: if this hydration
// dies, reclaim + reselect need them; on success applyExtraction clears
// them (or re-arms them when the file drifted mid-hydration).
export const markProcessingInternal = internalMutation({
  args: {
    fileId: v.id("driveFiles"),
    storageId: v.id("_storage"),
    at: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, {
      cachedStorageId: args.storageId,
      extractionStatus: "processing",
      processingStartedAt: args.at,
    });
  },
});

export const markExtractionErrorInternal = internalMutation({
  args: {
    fileId: v.id("driveFiles"),
    error: v.string(), // "attempt=<n>|<message>"
    retryAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, {
      extractionStatus: "error",
      extractionError: args.error,
      settleAfter: args.retryAt, // retry waits 30 min (selector requires settleAfter < now)
      processingStartedAt: undefined,
    });
  },
});

// ── applyExtraction — persist a mapped v4 result ─────────────────
//
// One transaction: patch the (import-created) documents row with the
// analysis fields, the first-extraction side effects (placement into the
// client folder taxonomy, knowledge bank entry, meeting extraction job),
// context-cache invalidation, the ingestionEvents feed row, and the
// driveFiles bookkeeping patch.
//
// The documents row ALWAYS exists before extraction (metadata-first, created
// by importDriveFiles/importDriveFolder) — this mutation never creates one.
// A missing documentId means the invariant broke (extraction ran for an
// unimported file): the driveFiles row is put into "error" with a spent
// attempt budget instead.
export const applyExtraction = internalMutation({
  args: {
    driveFileId: v.string(),
    checksumAtFetch: v.string(),
    storageId: v.id("_storage"),
    // Effective folder-scope client at hydration time. The documents row's
    // own clientId (stamped at import) takes precedence — an operator's
    // reassignment or a later unmapping must not re-home the document.
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    mapped: v.any(), // /api/drive/ingest's mapped single-doc result
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ documentId: Id<"documents"> | null; applied: boolean }> => {
    const row = await ctx.db
      .query("driveFiles")
      .withIndex("by_drive_id", (q) => q.eq("driveFileId", args.driveFileId))
      .first();
    if (!row) {
      throw new Error(`no driveFiles row for ${args.driveFileId}`);
    }

    const now = new Date().toISOString();

    // Invariant: extraction only ever runs for imported files. If the
    // documents row is missing (never imported, or hard-deleted), error the
    // driveFiles row with the attempt budget spent — retrying can't help.
    const existingDoc = row.documentId ? await ctx.db.get(row.documentId) : null;
    if (!existingDoc) {
      await ctx.db.patch(row._id, {
        extractionStatus: "error",
        extractionError: `attempt=${MAX_ATTEMPTS}|invariant violation: extraction ran for a file with no documents row (${row.documentId ? "documentId dangling" : "not imported"})`,
        processingStartedAt: undefined,
      });
      return { documentId: null, applied: false };
    }
    const documentId: Id<"documents"> = existingDoc._id;
    const m = args.mapped ?? {};
    // Convex rejects null on optional fields; the route serializes absent
    // values as null — coerce everything to undefined.
    const summary: string = typeof m.summary === "string" ? m.summary : "";
    const fileTypeDetected: string =
      typeof m.fileTypeDetected === "string" && m.fileTypeDetected
        ? m.fileTypeDetected
        : "Document";
    const category: string =
      typeof m.category === "string" && m.category ? m.category : "Uncategorized";
    const reasoning: string = typeof m.reasoning === "string" ? m.reasoning : "";

    // ── IDENTITY IMMUTABILITY (see module header). A row that already
    // carries a real classification keeps its identity fields on every
    // re-extraction: fileTypeDetected / category / reasoning / confidence /
    // documentCode never change once set. "Unclassified" is the
    // metadata-first placeholder — upgrading it is the FIRST real
    // classification, not a change. The fresh run's analysis confidence
    // still rides inside documentAnalysis (confidenceInAnalysis).
    const identityLocked =
      typeof existingDoc.fileTypeDetected === "string" &&
      existingDoc.fileTypeDetected !== "" &&
      existingDoc.fileTypeDetected !== "Unclassified";
    const effectiveFileTypeDetected: string = identityLocked
      ? existingDoc.fileTypeDetected
      : fileTypeDetected;
    const effectiveCategory: string = identityLocked
      ? (existingDoc.category ?? category)
      : category;

    // Content fields — refreshed on first extraction AND every re-extract.
    const contentFields = {
      summary,
      tokensUsed: typeof m.tokensUsed === "number" ? m.tokensUsed : 0,
      extractedData: m.extractedData ?? undefined,
      extractedIntelligence: m.extractedIntelligence ?? undefined,
      documentAnalysis: m.documentAnalysis ?? undefined,
      textContent:
        typeof m.textContent === "string" && m.textContent
          ? m.textContent
          : undefined,
    };
    // Identity fields — stamped only while the doc is still unclassified.
    const identityFields = identityLocked
      ? {}
      : {
          fileTypeDetected,
          category,
          reasoning,
          confidence: typeof m.confidence === "number" ? m.confidence : 0,
          classificationReasoning: reasoning || undefined,
        };

    // First extraction = the metadata-first row has never had content
    // applied. Distinguished by contentChecksum (only ever stamped here) so
    // the first-extraction side effects survive a crash-and-reclaim replay.
    const firstExtraction = existingDoc.contentChecksum === undefined;

    // Ownership: the documents row's clientId (stamped at import, possibly
    // operator-reassigned since) wins over the hydration-time folder scope.
    const effectiveClientId: Id<"clients"> | undefined =
      existingDoc.clientId ?? args.clientId;
    const effectiveProjectId: Id<"projects"> | undefined =
      existingDoc.projectId ?? args.projectId;

    // ── PLACEMENT: on FIRST successful extraction only (folderId not yet
    // set), resolve the v4 placement (mapped.targetFolder — a folder key)
    // against the real folder taxonomy and stamp folderId/folderType.
    // PROJECT documents (projectId stamped at import — the folder was
    // project-mapped) resolve against the PROJECT taxonomy, mirroring
    // bulkUpload.fileItem's project-scope path: exact key → "unfiled" →
    // "background" → any project folder. Client documents keep the
    // client-scope path: exact key → "miscellaneous" → any client folder.
    // The gate is the DOCUMENT's own projectId (not the hydration-time folder
    // scope): folderType "project" with no projectId on the row would make
    // the doc invisible in both libraries. Once folderId is set it is
    // APP-OWNED: operators move documents freely and re-extraction must
    // never touch it (this block is skipped).
    let placementPatch:
      | { folderId: string; folderType: "client" | "project" }
      | undefined;
    if (!existingDoc.folderId) {
      const targetFolder: string | undefined =
        typeof m.targetFolder === "string" && m.targetFolder
          ? m.targetFolder
          : undefined;
      if (existingDoc.projectId) {
        // A project with no folders at all leaves the doc unfiled — the next
        // (re-)extraction retries placement because folderId is still unset.
        const resolvedKey = await resolveProjectFolderKey(
          ctx,
          existingDoc.projectId,
          targetFolder,
        );
        if (resolvedKey) {
          placementPatch = { folderId: resolvedKey, folderType: "project" };
        }
      } else if (effectiveClientId) {
        const matchExact = targetFolder
          ? await ctx.db
              .query("clientFolders")
              .withIndex("by_client_type", (q: any) =>
                q.eq("clientId", effectiveClientId).eq("folderType", targetFolder),
              )
              .first()
          : null;
        let resolvedKey: string | undefined = matchExact
          ? targetFolder
          : undefined;
        if (!resolvedKey) {
          const misc = await ctx.db
            .query("clientFolders")
            .withIndex("by_client_type", (q: any) =>
              q.eq("clientId", effectiveClientId).eq("folderType", "miscellaneous"),
            )
            .first();
          const anyFolder = misc
            ? null
            : await ctx.db
                .query("clientFolders")
                .withIndex("by_client", (q: any) =>
                  q.eq("clientId", effectiveClientId),
                )
                .first();
          resolvedKey = (misc ?? anyFolder)?.folderType;
        }
        // A client with no folders at all leaves the doc unfiled — the next
        // (re-)extraction retries placement because folderId is still unset.
        if (resolvedKey) {
          placementPatch = { folderId: resolvedKey, folderType: "client" };
        }
      }
    }

    // Document code — stamped once, on first extraction (the metadata-first
    // row has none). Collision probe is a full filter scan (documents has no
    // by_documentCode index) but runs once per imported file, matching
    // documents.create's own cost. Identity-locked docs never get a code
    // from re-extraction (the code derives from a classification we are
    // deliberately not applying).
    let documentCode: string | undefined;
    if (firstExtraction && !existingDoc.documentCode && !identityLocked) {
      documentCode =
        typeof m.documentCode === "string" && m.documentCode
          ? m.documentCode
          : undefined;
      if (documentCode) {
        const collision = await ctx.db
          .query("documents")
          .filter((q) => q.eq(q.field("documentCode"), documentCode))
          .first();
        if (collision) documentCode = `${documentCode}-1`;
      }
    }

    // ── PATCH the import-created row in place (first extraction and every
    // re-extraction alike). Drive revisions are the upstream history — no
    // version-chain rows. folderId/folderType only via placementPatch (first
    // extraction); clientId/projectId are never touched here; identity
    // fields (fileTypeDetected/category/…) only while still unclassified.
    await ctx.db.patch(documentId, {
      ...contentFields,
      ...identityFields,
      fileStorageId: args.storageId,
      fileSize: row.size ?? existingDoc.fileSize,
      contentChecksum: args.checksumAtFetch,
      status: "completed" as const,
      savedAt: now,
      ...(documentCode ? { documentCode } : {}),
      ...(placementPatch ?? {}),
    });
    await ctx.db.insert("ingestionEvents", {
      documentId,
      driveFileId: args.driveFileId,
      source: "drive",
      checksum: args.checksumAtFetch,
      kind: firstExtraction ? "created" : "reextracted",
      at: now,
    });

    if (firstExtraction && effectiveClientId) {
      // ── First-extraction side effects (previously the create branch).
      // Knowledge bank entry — replicated minimally from documents.create
      // (convex/documents.ts, "Automatically create knowledge bank entry"
      // block) so Drive-ingested documents get side-effect parity. Kept in
      // sync by hand; if the heuristics there change, change these too.
      try {
        let entryType:
          | "deal_update"
          | "call_transcript"
          | "email"
          | "document_summary"
          | "project_status"
          | "general" = "document_summary";
        const categoryLower = effectiveCategory.toLowerCase();
        const fileNameLower = row.name.toLowerCase();
        if (
          categoryLower.includes("deal") ||
          categoryLower.includes("loan") ||
          categoryLower.includes("term")
        ) {
          entryType = "deal_update";
        } else if (
          categoryLower.includes("project") ||
          categoryLower.includes("development")
        ) {
          entryType = "project_status";
        } else if (
          fileNameLower.includes("call") ||
          fileNameLower.includes("transcript")
        ) {
          entryType = "call_transcript";
        } else if (
          categoryLower.includes("email") ||
          fileNameLower.includes("email")
        ) {
          entryType = "email";
        }

        const keyPoints = summary
          .split(/[.!?]\s+/)
          .filter((line) => line.trim().length > 0)
          .slice(0, 5)
          .map((line) => line.trim());

        const metadata: Record<string, unknown> = {};
        const extracted = contentFields.extractedData as any;
        if (extracted) {
          if (extracted.loanAmount) metadata.loanAmount = extracted.loanAmount;
          if (extracted.interestRate) metadata.interestRate = extracted.interestRate;
          if (extracted.loanNumber) metadata.loanNumber = extracted.loanNumber;
          if (extracted.costsTotal) metadata.costsTotal = extracted.costsTotal;
          if (extracted.detectedCurrency) metadata.currency = extracted.detectedCurrency;
        }

        const tags: string[] = [effectiveCategory, effectiveFileTypeDetected];
        if (effectiveProjectId) tags.push("project-related");

        await ctx.db.insert("knowledgeBankEntries", {
          clientId: effectiveClientId,
          projectId: effectiveProjectId,
          sourceType: "document",
          sourceId: documentId,
          entryType,
          title: `${row.name} - ${effectiveCategory}`,
          content: summary,
          keyPoints,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          tags,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        // Parity with documents.create: never fail the ingest on a KB miss.
        console.error("[driveHydration] knowledge bank entry failed:", error);
      }

      // Meeting extraction job — same heuristics as documents.create. Runs
      // only on FIRST extraction, so this documentId can't already have a
      // job; the existing-job probe there is skipped here.
      const meetingTypes = ["Meeting Minutes", "Meeting Notes", "Minutes"];
      const fileTypeLower = effectiveFileTypeDetected.toLowerCase();
      const fileNameLower = row.name.toLowerCase();
      const isMeetingDocument =
        meetingTypes.some((t) => t.toLowerCase() === fileTypeLower) ||
        (fileNameLower.includes("meeting") &&
          (fileNameLower.includes("minutes") || fileNameLower.includes("notes")));
      if (isMeetingDocument) {
        try {
          await ctx.db.insert("meetingExtractionJobs", {
            documentId,
            clientId: effectiveClientId,
            projectId: effectiveProjectId,
            fileStorageId: args.storageId,
            documentName: row.name,
            status: "pending",
            attempts: 0,
            maxAttempts: 3,
            createdAt: now,
            updatedAt: now,
          });
        } catch (error) {
          console.error("[driveHydration] meeting extraction job failed:", error);
        }
      }
    }

    // Context cache invalidation on first extraction AND re-extract — the
    // cached client/project context embeds document summaries, and both
    // paths change them.
    if (effectiveClientId) {
      // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "client",
        contextId: effectiveClientId,
      });
    }
    if (effectiveProjectId) {
      // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: effectiveProjectId,
      });
    }

    // ── driveFiles bookkeeping. checksumAtFetch is what we ACTUALLY
    // extracted; if the row's md5 has moved on mid-hydration (the poller
    // saw another edit), keep/re-arm the settling state instead of
    // stamping "complete" — the selector then re-queues it because
    // md5Checksum !== extractedChecksum.
    const drifted =
      row.md5Checksum !== undefined && row.md5Checksum !== args.checksumAtFetch;
    const nowMs = Date.now();
    await ctx.db.patch(row._id, {
      extractedChecksum: args.checksumAtFetch,
      documentId,
      cachedStorageId: args.storageId,
      processingStartedAt: undefined,
      extractionError: undefined,
      ...(drifted
        ? {
            extractionStatus: "settling" as const,
            settleAfter: row.settleAfter ?? nowMs + SETTLE_MS,
            firstDirtyAt: row.firstDirtyAt ?? nowMs,
          }
        : {
            extractionStatus: "complete" as const,
            settleAfter: undefined,
            firstDirtyAt: undefined,
          }),
    });

    return { documentId, applied: true };
  },
});

// ── A. Hydration sweep (cron, every 5 min) ───────────────────────

export const hydrateSettled = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    status: string;
    reclaimed?: number;
    processed?: number;
    failed?: number;
    skipped?: number;
  }> => {
    const now = Date.now();

    // 1. Reclaim crashed "processing" rows.
    const reclaimed: number = await ctx.runMutation(
      internal.driveHydration.reclaimStaleProcessing,
      { now },
    );

    // 2. Select this tick's work (max 5, oldest dirty first).
    const selection: HydrationSelection = await ctx.runQuery(
      internal.driveHydration.selectCandidatesInternal,
      { now },
    );
    if (selection.upToDateIds.length > 0) {
      await ctx.runMutation(internal.driveHydration.markUpToDateInternal, {
        fileIds: selection.upToDateIds,
      });
    }
    if (selection.unimportedIds.length > 0) {
      // Settling/error rows without a documents row (never imported —
      // legacy queueing) must not extract; normalize back to "none".
      // Capped per tick — a big legacy backlog self-drains over ticks.
      await ctx.runMutation(internal.driveHydration.resetToNoneInternal, {
        fileIds: selection.unimportedIds.slice(0, 200),
      });
    }
    if (selection.candidateIds.length === 0) {
      return { status: "idle", reclaimed };
    }

    const token: any = await ctx.runQuery(
      internal.driveTokens.getForSyncInternal,
      {},
    );
    if (!token) return { status: "no_connection", reclaimed };
    if (token.needsReconnect) return { status: "needs_reconnect", reclaimed };
    if (!token.rootFolderId) return { status: "no_root_folder", reclaimed };
    const rootFolderId: string = token.rootFolderId;

    // Folder map for effective-scope resolution (nearest mapped ancestor).
    const folderRows: MirrorFolder[] = await ctx.runQuery(
      internal.driveSync.listAllFoldersInternal,
      {},
    );
    const foldersById = new Map<string, MirrorFolder>(
      folderRows.map((r) => [r.driveFolderId, r]),
    );

    const apiBase = process.env.NEXT_APP_URL;
    const secret = process.env.CRON_SECRET;
    if (!apiBase || !secret) {
      // Loud: every selected row will land in "error" below until the env
      // is fixed — same env pair the HubSpot recurring sync depends on.
      console.error(
        "[driveHydration] NEXT_APP_URL / CRON_SECRET not configured on the Convex deployment — extraction route unreachable",
      );
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    // 3. Serial loop; one file's failure must not kill the tick.
    for (const fileId of selection.candidateIds) {
      // Fresh read — checksumAtFetch must be captured at fetch time, and
      // the row may have moved (trashed, converged) while earlier files in
      // this tick were being extracted.
      const file: Doc<"driveFiles"> | null = await ctx.runQuery(
        internal.driveHydration.getFileInternal,
        { fileId },
      );
      if (!file || file.trashed === true || !file.md5Checksum) {
        skipped++;
        continue;
      }
      if (!file.documentId) {
        // Not imported — extraction is import-gated (documentId IS the
        // imported flag). Normalize a stray queued row back to "none".
        await ctx.runMutation(internal.driveHydration.resetToNoneInternal, {
          fileIds: [fileId],
        });
        skipped++;
        continue;
      }
      // Only hydrate rows still in a claimable state. A slow tick can be
      // overlapped by the next cron fire (no lease here — the byte fetch +
      // extraction round-trip is minutes-long by design); a row another
      // tick already flipped to "processing" (or that completed/reset in
      // the meantime) is skipped. applyExtraction is idempotent-safe even
      // if two ticks DO race the same file (Convex serializes the
      // mutations; the loser takes the re-extraction path), but this guard
      // avoids the duplicate Drive fetch + pipeline run in the common case.
      if (
        file.extractionStatus !== "settling" &&
        file.extractionStatus !== "error"
      ) {
        skipped++;
        continue;
      }
      if (file.md5Checksum === file.extractedChecksum) {
        await ctx.runMutation(internal.driveHydration.markUpToDateInternal, {
          fileIds: [fileId],
        });
        skipped++;
        continue;
      }

      try {
        // a. Effective scope — nearest ancestor folder with a clientId (+
        // nearest projectId mapping). Advisory only under the import-gated
        // model: the documents row's own clientId/projectId (stamped at
        // import) win inside applyExtraction, so an unmapped-since-import
        // folder does NOT stop an imported file from syncing.
        const scope: FolderScope = file.parentFolderId
          ? resolveFolderScope(file.parentFolderId, foldersById, rootFolderId)
          : { inScope: false, clientId: null, projectId: null, mappedFolderId: null, autoImport: false, autoImportFolderId: null };

        // b. Token — re-read per file (a refresh earlier in the tick
        // persisted a new accessToken). A refresh failure flags reconnect
        // inside ensureAccessToken and aborts the WHOLE tick: every later
        // file would fail the same way.
        const tok: any = await ctx.runQuery(
          internal.driveTokens.getForSyncInternal,
          {},
        );
        if (!tok || tok.needsReconnect) {
          return { status: "needs_reconnect", reclaimed, processed, failed, skipped };
        }
        const accessToken = await ensureAccessToken(ctx, tok);
        if (!accessToken) {
          return { status: "refresh_failed", reclaimed, processed, failed, skipped };
        }

        // c. The checksum this extraction is FOR. Stamped as
        // extractedChecksum on success; an edit that lands mid-hydration
        // moves the row's md5 away from this value and re-queues it.
        const checksumAtFetch: string = file.md5Checksum;

        // d. Fetch bytes → Convex storage cache.
        if (typeof file.size === "number" && file.size > MAX_BYTES) {
          throw new Error(
            `file too large for extraction (${file.size} bytes > 100MB cap)`,
          );
        }
        const bytesRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.driveFileId)}?alt=media&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!bytesRes.ok) {
          throw new Error(`Drive bytes fetch failed (${bytesRes.status})`);
        }
        const bytes = await bytesRes.arrayBuffer();
        if (bytes.byteLength > MAX_BYTES) {
          throw new Error(
            `file too large for extraction (${bytes.byteLength} bytes > 100MB cap)`,
          );
        }
        const storageId: Id<"_storage"> = await ctx.storage.store(
          new Blob([bytes], { type: file.mimeType }),
        );
        await ctx.runMutation(internal.driveHydration.markProcessingInternal, {
          fileId,
          storageId,
          at: Date.now(),
        });

        // e. Extraction round-trip through the Next.js route (same
        // shared-secret pattern as hubspotSync/recurringSync → sync-all).
        if (!apiBase || !secret) {
          throw new Error(
            "NEXT_APP_URL / CRON_SECRET not configured on the Convex deployment",
          );
        }
        // Normalize like recurringSync: tolerate a scheme-less env value,
        // strip a trailing slash.
        const normalized = apiBase.match(/^https?:\/\//)
          ? apiBase
          : `https://${apiBase}`;
        const fileUrl = await ctx.storage.getUrl(storageId);
        if (!fileUrl) throw new Error("storage.getUrl returned null");

        const resp = await fetch(
          `${normalized.replace(/\/$/, "")}/api/drive/ingest`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-cron-secret": secret,
            },
            body: JSON.stringify({
              driveFileId: file.driveFileId,
              fileUrl,
              fileName: file.name,
              fileType: file.mimeType,
            }),
          },
        );
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(`ingest route ${resp.status}: ${text.slice(0, 300)}`);
        }
        const payload: any = await resp.json().catch(() => null);
        if (!payload?.ok || !payload.mapped) {
          throw new Error(
            `ingest route returned no mapped result: ${String(payload?.error ?? "unknown").slice(0, 300)}`,
          );
        }

        // f. Persist (document row + side effects + bookkeeping).
        await ctx.runMutation(internal.driveHydration.applyExtraction, {
          driveFileId: file.driveFileId,
          checksumAtFetch,
          storageId,
          clientId: (scope.clientId ?? undefined) as Id<"clients"> | undefined,
          projectId: (scope.projectId ?? undefined) as Id<"projects"> | undefined,
          mapped: payload.mapped,
        });
        processed++;
        console.log(
          `[driveHydration] extracted "${file.name}" (${file.driveFileId})`,
        );
      } catch (err) {
        // g. Failure → error status, attempt counter bumped, retry in 30
        // min. The catch-all around the catch-body keeps a pathological
        // row (deleted mid-tick, etc.) from killing the rest of the tick.
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        const attempts = parseAttempts(file.extractionError) + 1;
        console.error(
          `[driveHydration] "${file.name}" (${file.driveFileId}) attempt ${attempts} failed: ${message}`,
        );
        try {
          await ctx.runMutation(
            internal.driveHydration.markExtractionErrorInternal,
            {
              fileId,
              error: `attempt=${attempts}|${message.slice(0, 500)}`,
              retryAt: Date.now() + RETRY_DELAY_MS,
            },
          );
        } catch (markErr) {
          console.error(
            `[driveHydration] failed to record error on ${file.driveFileId}:`,
            markErr,
          );
        }
      }
    }

    return { status: "ok", reclaimed, processed, failed, skipped };
  },
});
