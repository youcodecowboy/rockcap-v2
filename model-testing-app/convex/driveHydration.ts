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
  SETTLE_MS,
  type MirrorFolder,
} from "./driveSync";

// Google Drive hydration — the extraction pipeline (phase 3).
//
// The phase-2 mirror (driveSync.ts) stamps settled/dirty bookkeeping onto
// driveFiles; THIS module turns settled rows into `documents` rows:
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
};

// Pick this tick's work. Returns ids only — the action re-reads each row
// via getFileInternal right before fetching bytes, so checksumAtFetch is
// captured at FETCH time, not selection time (a serial tick can spend
// minutes on earlier files).
export const selectCandidatesInternal = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args): Promise<HydrationSelection> => {
    const upToDateIds: Id<"driveFiles">[] = [];
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
// selector picks it up again immediately. No documents row was created
// (creation only happens inside applyExtraction), so no duplicate results.
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

// File's effective scope lost its client mapping since it was queued
// (folder unmapped / moved) — nothing to hydrate into.
export const resetToNoneInternal = internalMutation({
  args: { fileId: v.id("driveFiles") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, {
      extractionStatus: "none",
      settleAfter: undefined,
      firstDirtyAt: undefined,
      processingStartedAt: undefined,
      extractionError: undefined,
    });
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
// One transaction: document row (create or in-place re-extract), the
// create-only side effects (knowledge bank entry, meeting extraction job,
// context-cache invalidation), the ingestionEvents feed row, and the
// driveFiles bookkeeping patch.
export const applyExtraction = internalMutation({
  args: {
    driveFileId: v.string(),
    checksumAtFetch: v.string(),
    storageId: v.id("_storage"),
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    mapped: v.any(), // /api/drive/ingest's mapped single-doc result
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ documentId: Id<"documents">; created: boolean }> => {
    const row = await ctx.db
      .query("driveFiles")
      .withIndex("by_drive_id", (q) => q.eq("driveFileId", args.driveFileId))
      .first();
    if (!row) {
      throw new Error(`no driveFiles row for ${args.driveFileId}`);
    }

    const now = new Date().toISOString();
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
    const analysisFields = {
      summary,
      fileTypeDetected,
      category,
      reasoning,
      confidence: typeof m.confidence === "number" ? m.confidence : 0,
      tokensUsed: typeof m.tokensUsed === "number" ? m.tokensUsed : 0,
      extractedData: m.extractedData ?? undefined,
      extractedIntelligence: m.extractedIntelligence ?? undefined,
      documentAnalysis: m.documentAnalysis ?? undefined,
      classificationReasoning: reasoning || undefined,
      textContent:
        typeof m.textContent === "string" && m.textContent
          ? m.textContent
          : undefined,
    };

    let documentId: Id<"documents"> | undefined = row.documentId;
    let created = false;

    const existingDoc = documentId ? await ctx.db.get(documentId) : null;
    if (documentId && existingDoc) {
      // ── RE-EXTRACTION: patch the SAME documents row in place. Drive
      // revisions are the upstream history — no version-chain rows, and no
      // duplicate knowledgeBankEntries row (the original one still points
      // at this documentId).
      await ctx.db.patch(documentId, {
        ...analysisFields,
        fileStorageId: args.storageId,
        fileSize: row.size ?? existingDoc.fileSize,
        contentChecksum: args.checksumAtFetch,
        savedAt: now,
      });
      await ctx.db.insert("ingestionEvents", {
        documentId,
        driveFileId: args.driveFileId,
        source: "drive",
        checksum: args.checksumAtFetch,
        kind: "reextracted",
        at: now,
      });
    } else {
      // ── CREATE: lean internal counterpart of documents.create (which is
      // Clerk-coupled and does an O(n) scan to invent a code). We reuse the
      // mapped documentCode as-is; the collision probe below is a full
      // filter scan (documents has no by_documentCode index) but runs once
      // per newly ingested file, matching documents.create's own cost.
      created = true;
      const client = await ctx.db.get(args.clientId);

      let documentCode: string | undefined =
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

      documentId = await ctx.db.insert("documents", {
        fileStorageId: args.storageId,
        fileName: row.name,
        fileSize: row.size ?? 0,
        fileType: row.mimeType,
        uploadedAt: now,
        ...analysisFields,
        clientId: args.clientId,
        clientName: client?.name,
        projectId: args.projectId,
        documentCode,
        scope: "client",
        status: "completed",
        savedAt: now,
        source: "drive",
        driveFileId: args.driveFileId,
        driveWebViewLink: row.webViewLink,
        contentChecksum: args.checksumAtFetch,
      });

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
        const categoryLower = category.toLowerCase();
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
        const extracted = analysisFields.extractedData as any;
        if (extracted) {
          if (extracted.loanAmount) metadata.loanAmount = extracted.loanAmount;
          if (extracted.interestRate) metadata.interestRate = extracted.interestRate;
          if (extracted.loanNumber) metadata.loanNumber = extracted.loanNumber;
          if (extracted.costsTotal) metadata.costsTotal = extracted.costsTotal;
          if (extracted.detectedCurrency) metadata.currency = extracted.detectedCurrency;
        }

        const tags: string[] = [category, fileTypeDetected];
        if (args.projectId) tags.push("project-related");

        await ctx.db.insert("knowledgeBankEntries", {
          clientId: args.clientId,
          projectId: args.projectId,
          sourceType: "document",
          sourceId: documentId,
          entryType,
          title: `${row.name} - ${category}`,
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

      // Meeting extraction job — same heuristics as documents.create. A
      // freshly inserted documentId can't already have a job, so the
      // existing-job probe there is skipped here.
      const meetingTypes = ["Meeting Minutes", "Meeting Notes", "Minutes"];
      const fileTypeLower = fileTypeDetected.toLowerCase();
      const fileNameLower = row.name.toLowerCase();
      const isMeetingDocument =
        meetingTypes.some((t) => t.toLowerCase() === fileTypeLower) ||
        (fileNameLower.includes("meeting") &&
          (fileNameLower.includes("minutes") || fileNameLower.includes("notes")));
      if (isMeetingDocument) {
        try {
          await ctx.db.insert("meetingExtractionJobs", {
            documentId,
            clientId: args.clientId,
            projectId: args.projectId,
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

      await ctx.db.insert("ingestionEvents", {
        documentId,
        driveFileId: args.driveFileId,
        source: "drive",
        checksum: args.checksumAtFetch,
        kind: "created",
        at: now,
      });
    }

    // Context cache invalidation on create AND re-extract — the cached
    // client/project context embeds document summaries, and both paths
    // change them. (documents.create only ever creates, so its
    // invalidation is create-time by construction.)
    // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
    await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
      contextType: "client",
      contextId: args.clientId,
    });
    if (args.projectId) {
      // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: args.projectId,
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

    return { documentId, created };
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
        // a. Effective scope — nearest ancestor folder with a clientId. If
        // the mapping vanished since the row was queued, there is nothing
        // to file into: reset to "none".
        const scope = file.parentFolderId
          ? resolveFolderScope(file.parentFolderId, foldersById, rootFolderId)
          : { inScope: false, clientId: null, mappedFolderId: null };
        if (!scope.clientId) {
          await ctx.runMutation(internal.driveHydration.resetToNoneInternal, {
            fileId,
          });
          skipped++;
          continue;
        }

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
          clientId: scope.clientId as Id<"clients">,
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
