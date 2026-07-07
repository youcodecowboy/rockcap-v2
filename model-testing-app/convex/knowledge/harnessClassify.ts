import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  ensureAccessToken,
  resolveProjectFolderKey,
  SETTLE_MS,
} from "../driveSync";
import { resolvePlacement } from "../../src/v4/lib/placement-rules";

// Harness-lane document classification — the two halves that make bulk
// document processing runnable end-to-end from Claude Code (MCP tools
// `document.extractText` + `document.applyClassification`).
//
// The v4 API pipeline (driveHydration sweep → /api/drive/ingest) bundles
// parse → classify (Haiku, API cost) → persist into one opaque round-trip.
// Operator decision (2026-07-07): bulk classification runs through the
// harness at subscription cost instead. That needs the middle step split
// open:
//
//   extractText        — server-side PARSE ONLY (zero LLM): ensure the bytes
//                        exist in Convex storage (fetching from Drive for
//                        pending mirror rows, claiming them "processing" so
//                        the hydration cron doesn't race us), round-trip the
//                        signed URL through the thin Next route
//                        /api/knowledge/extract-text (fileProcessor's
//                        extractTextFromFile cannot run in the Convex
//                        runtime), and hand the text to the agent. THE AGENT
//                        IS THE CLASSIFIER.
//
//   applyClassification — persist the agent's classification with EXACTLY
//                        driveHydration.applyExtraction's semantics: patch
//                        the documents row in place, first-classification-
//                        only placement resolved server-side from the
//                        placement-rules table (agents never choose
//                        folders), side-effect parity (KB entry create-only,
//                        meeting-job heuristics, contextCache invalidation),
//                        an ingestionEvents feed row, and drift-aware
//                        completion of the driveFiles mirror row.
//
// The API pipeline is untouched and remains the automatic lane for
// re-processing when a Drive file CHANGES; this module is the manual /
// bulk-onboarding lane. Consistency model matches hydration: extractText
// captures the mirror row's md5 at fetch time (contentChecksum) and
// applyClassification stamps exactly that value as extractedChecksum, so a
// file edited mid-classification re-enters "settling" instead of
// "complete" and the automatic lane re-extracts it.
//
// CLASSIFICATION IDENTITY IS IMMUTABLE (operator decision 2026-07-07): once
// a documents row carries a real classification (fileTypeDetected set and
// not "Unclassified"), re-classification through this lane refreshes
// CONTENTS — summary / textContent / documentAnalysis / contentChecksum —
// but NEVER overwrites fileTypeDetected / category / the identity
// confidence. "An appraisal never stops being an appraisal; edits change
// contents, never identity." (Folders were already immutable after first
// placement.) Upgrading an "Unclassified" placeholder is the FIRST real
// classification and lands normally. Reclassification is an explicit
// operator action only — a future `document.reclassify` tool, deliberately
// NOT built yet. Same rule in driveHydration.applyExtraction.

const MAX_BYTES = 100 * 1024 * 1024; // fileProcessor's 100MB cap (validateFile)
const TEXT_RETURN_CAP = 120_000; // chars returned to the agent context
const SUMMARY_CAP = 1_200;
const MAX_TEXT_CONTENT_CHARS = 900_000; // documents row ~1MB budget (matches /api/drive/ingest)

// ── Internal reads ───────────────────────────────────────────────

type DocContext = {
  doc: {
    _id: Id<"documents">;
    fileName: string;
    fileType: string;
    fileStorageId: Id<"_storage"> | null;
    contentChecksum: string | null;
    fileTypeDetected: string;
    category: string;
    clientId: Id<"clients"> | null;
    projectId: Id<"projects"> | null;
    folderId: string | null;
    status: string | null;
  };
  driveRow: {
    _id: Id<"driveFiles">;
    driveFileId: string;
    name: string;
    mimeType: string;
    size: number | null;
    md5Checksum: string | null;
    extractedChecksum: string | null;
    cachedStorageId: Id<"_storage"> | null;
    extractionStatus: string;
    trashed: boolean;
  } | null;
  alreadyAtomized: boolean;
};

export const getDocContextInternal = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args): Promise<DocContext | null> => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    const d = doc as any;
    const driveRow = await ctx.db
      .query("driveFiles")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    const firstObservation = await ctx.db
      .query("atomObservations")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    return {
      doc: {
        _id: doc._id,
        fileName: d.fileName,
        fileType: d.fileType,
        fileStorageId: d.fileStorageId ?? null,
        contentChecksum: d.contentChecksum ?? null,
        fileTypeDetected: d.fileTypeDetected ?? "",
        category: d.category ?? "",
        clientId: d.clientId ?? null,
        projectId: d.projectId ?? null,
        folderId: d.folderId ?? null,
        status: d.status ?? null,
      },
      driveRow: driveRow
        ? {
            _id: driveRow._id,
            driveFileId: driveRow.driveFileId,
            name: driveRow.name,
            mimeType: driveRow.mimeType,
            size: driveRow.size ?? null,
            md5Checksum: driveRow.md5Checksum ?? null,
            extractedChecksum: driveRow.extractedChecksum ?? null,
            cachedStorageId: driveRow.cachedStorageId ?? null,
            extractionStatus: driveRow.extractionStatus,
            trashed: driveRow.trashed === true,
          }
        : null,
      alreadyAtomized: firstObservation !== null,
    };
  },
});

// ── Internal writes ──────────────────────────────────────────────

// Stamp freshly-fetched Drive bytes onto the mirror row. Mirrors the
// hydration action's claim semantics MINIMALLY: a row in a claimable state
// (settling / error) is flipped to "processing" so the hydration cron skips
// it while the agent classifies (the 30-min reclaim window still applies —
// if the agent dies, the row goes back to "settling" and the automatic
// pipeline picks it up). Rows in any other state only get the byte cache;
// settle bookkeeping (settleAfter / firstDirtyAt) is NEVER touched here —
// applyClassification clears or re-arms it exactly like applyExtraction.
export const stampBytesCachedInternal = internalMutation({
  args: {
    fileId: v.id("driveFiles"),
    storageId: v.id("_storage"),
    at: v.number(),
  },
  handler: async (ctx, args): Promise<{ claimed: boolean }> => {
    const row = await ctx.db.get(args.fileId);
    if (!row) return { claimed: false };
    const claimable =
      row.extractionStatus === "settling" || row.extractionStatus === "error";
    await ctx.db.patch(args.fileId, {
      cachedStorageId: args.storageId,
      ...(claimable
        ? {
            extractionStatus: "processing" as const,
            processingStartedAt: args.at,
          }
        : {}),
    });
    return { claimed: claimable };
  },
});

// ── A. extractText — bytes → text, zero LLM ──────────────────────
//
// Two-hop shape (chosen as the simplest correct one): this Convex action
// ensures the bytes are in Convex storage (fetching from Drive when the
// mirror row has no cached/current bytes), then POSTs the signed storage
// URL to the thin Next route /api/knowledge/extract-text (x-cron-secret,
// same pattern as /api/drive/ingest), which runs fileProcessor's
// extractTextFromFile and returns {text}. The parser (pdf-parse / xlsx /
// mammoth) cannot run in the Convex runtime, hence the round-trip. The
// action returns the text straight through to the MCP caller — no state is
// parked between the hops.
export const extractText = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        text: string;
        truncated: boolean;
        fullTextChars: number;
        fileName: string;
        mimeType: string;
        contentChecksum: string | null;
        source: "upload" | "storage" | "drive-cache" | "drive-fetch";
        alreadyClassified: boolean;
        alreadyAtomized: boolean;
        note?: string;
      }
    | { error: string; note?: string }
  > => {
    const docCtx: DocContext | null = await ctx.runQuery(
      internal.knowledge.harnessClassify.getDocContextInternal,
      { documentId: args.documentId },
    );
    if (!docCtx) return { error: "document_not_found" };
    const { doc, driveRow, alreadyAtomized } = docCtx;
    const alreadyClassified =
      doc.fileTypeDetected !== "" && doc.fileTypeDetected !== "Unclassified";

    // ── Resolve the byte source. Stored bytes are used only when they are
    // CURRENT (their checksum matches the mirror row's live md5, or the doc
    // has no Drive mirror at all). A pending/drifted Drive doc gets a fresh
    // byte fetch so the text and the returned contentChecksum describe the
    // SAME revision — the checksum is what applyClassification stamps as
    // extractedChecksum, exactly like the hydration action's checksumAtFetch.
    let storageId: Id<"_storage"> | null = null;
    let contentChecksum: string | null = null;
    let source: "upload" | "storage" | "drive-cache" | "drive-fetch";

    if (!driveRow) {
      if (!doc.fileStorageId) {
        return {
          error: "no_stored_bytes",
          note: "Document has no stored file and no Drive mirror row — nothing to parse.",
        };
      }
      storageId = doc.fileStorageId;
      contentChecksum = doc.contentChecksum;
      source = "upload";
    } else if (!driveRow.md5Checksum) {
      // Google-native (Docs/Sheets) — no fetchable bytes via alt=media.
      if (doc.fileStorageId) {
        storageId = doc.fileStorageId;
        contentChecksum = doc.contentChecksum;
        source = "storage";
      } else {
        return {
          error: "google_native_unsupported",
          note: "Google-native file (no md5Checksum) — no binary bytes to parse. View it in Drive.",
        };
      }
    } else if (driveRow.trashed) {
      return { error: "drive_file_trashed" };
    } else if (
      doc.fileStorageId &&
      doc.contentChecksum === driveRow.md5Checksum
    ) {
      // The document's stored bytes ARE the current Drive revision.
      storageId = doc.fileStorageId;
      contentChecksum = doc.contentChecksum;
      source = "storage";
    } else if (
      driveRow.cachedStorageId &&
      driveRow.extractedChecksum === driveRow.md5Checksum
    ) {
      // Hydration's byte cache is current for the live revision.
      storageId = driveRow.cachedStorageId;
      contentChecksum = driveRow.extractedChecksum;
      source = "drive-cache";
    } else {
      // ── PENDING (or drifted) Drive doc with no current bytes: fetch from
      // Drive, cache in Convex storage, and claim the mirror row so the
      // hydration cron doesn't race the agent. checksumAtFetch is the row's
      // md5 read immediately before the fetch — returned to the caller as
      // contentChecksum for the applyClassification write.
      const token: any = await ctx.runQuery(
        internal.driveTokens.getForSyncInternal,
        {},
      );
      if (!token) return { error: "drive_not_connected" };
      if (token.needsReconnect) return { error: "drive_needs_reconnect" };
      const accessToken = await ensureAccessToken(ctx, token);
      if (!accessToken) return { error: "drive_token_refresh_failed" };

      if (typeof driveRow.size === "number" && driveRow.size > MAX_BYTES) {
        return {
          error: "file_too_large",
          note: `${driveRow.size} bytes > 100MB parser cap`,
        };
      }
      const checksumAtFetch: string = driveRow.md5Checksum;
      const bytesRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveRow.driveFileId)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!bytesRes.ok) {
        return {
          error: "drive_bytes_fetch_failed",
          note: `HTTP ${bytesRes.status}`,
        };
      }
      const bytes = await bytesRes.arrayBuffer();
      if (bytes.byteLength > MAX_BYTES) {
        return {
          error: "file_too_large",
          note: `${bytes.byteLength} bytes > 100MB parser cap`,
        };
      }
      storageId = await ctx.storage.store(
        new Blob([bytes], { type: driveRow.mimeType }),
      );
      await ctx.runMutation(
        internal.knowledge.harnessClassify.stampBytesCachedInternal,
        { fileId: driveRow._id, storageId, at: Date.now() },
      );
      contentChecksum = checksumAtFetch;
      source = "drive-fetch";
    }

    // ── Parse round-trip through the thin Next route (server-side parse
    // only — no LLM anywhere on this path).
    const apiBase = process.env.NEXT_APP_URL;
    const secret = process.env.CRON_SECRET;
    if (!apiBase || !secret) {
      return {
        error: "next_app_url_not_set",
        note: "NEXT_APP_URL / CRON_SECRET not configured on the Convex deployment.",
      };
    }
    const normalized = apiBase.match(/^https?:\/\//)
      ? apiBase
      : `https://${apiBase}`;
    const fileUrl = await ctx.storage.getUrl(storageId);
    if (!fileUrl) return { error: "storage_url_null" };

    const fileName = driveRow?.name ?? doc.fileName;
    const mimeType = driveRow?.mimeType ?? doc.fileType;
    const resp = await fetch(
      `${normalized.replace(/\/$/, "")}/api/knowledge/extract-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ fileUrl, fileName, fileType: mimeType }),
      },
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        error: "extract_route_failed",
        note: `${resp.status}: ${text.slice(0, 300)}`,
      };
    }
    const payload: any = await resp.json().catch(() => null);
    if (!payload?.ok || typeof payload.text !== "string") {
      return {
        error: "extract_route_no_text",
        note: String(payload?.error ?? "unknown").slice(0, 300),
      };
    }

    const fullTextChars: number = payload.text.length;
    const truncated = fullTextChars > TEXT_RETURN_CAP;
    return {
      text: truncated ? payload.text.slice(0, TEXT_RETURN_CAP) : payload.text,
      truncated,
      fullTextChars,
      fileName,
      mimeType,
      contentChecksum,
      source,
      alreadyClassified,
      alreadyAtomized,
      ...(truncated
        ? {
            note: `Text truncated to ${TEXT_RETURN_CAP} chars (full length ${fullTextChars}). Classify from what you have; note the truncation in your reasoning.`,
          }
        : {}),
    };
  },
});

// ── B. applyClassification — persist the agent's verdict ────────
//
// Mirrors driveHydration.applyExtraction EXACTLY, with the agent's
// classification in place of the v4 pipeline's mapped output. Kept in sync
// by hand — if applyExtraction's semantics change, change these too.
export const applyClassification = internalMutation({
  args: {
    documentId: v.id("documents"),
    // The fetch-time checksum returned by extractText. REQUIRED for
    // Drive-mirrored docs (it becomes extractedChecksum — the drift anchor).
    contentChecksum: v.optional(v.string()),
    fileTypeDetected: v.string(),
    category: v.string(),
    summary: v.string(),
    confidence: v.number(),
    reasoning: v.optional(v.string()),
    keyDates: v.optional(v.array(v.string())),
    keyAmounts: v.optional(v.array(v.string())),
    keyEntities: v.optional(
      v.object({
        people: v.optional(v.array(v.string())),
        companies: v.optional(v.array(v.string())),
        locations: v.optional(v.array(v.string())),
        projects: v.optional(v.array(v.string())),
      }),
    ),
    textContent: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    applied: boolean;
    error?: string;
    documentId?: Id<"documents">;
    firstClassification?: boolean;
    identityLocked?: boolean;
    folderId?: string;
    folderType?: "client" | "project";
    ingestionKind?: "created" | "reextracted";
    driveFileCompleted?: boolean;
    drifted?: boolean;
    note?: string;
  }> => {
    // ── Validation.
    const fileTypeDetected = args.fileTypeDetected.trim();
    const category = args.category.trim();
    if (!fileTypeDetected || !category) {
      return {
        applied: false,
        error: "fileTypeDetected and category must be non-empty",
      };
    }
    const confidence = Math.min(1, Math.max(0, args.confidence));
    const summary = args.summary.slice(0, SUMMARY_CAP);
    const reasoning = args.reasoning ?? "";

    const existingDoc = await ctx.db.get(args.documentId);
    if (!existingDoc) return { applied: false, error: "document_not_found" };
    const doc = existingDoc as any;

    // ── IDENTITY IMMUTABILITY (see module header). A doc that already has
    // a real classification keeps fileTypeDetected / category / reasoning /
    // confidence on every subsequent write through this lane — only content
    // fields refresh. Placement + side effects below therefore derive from
    // the EFFECTIVE (kept) identity, not the agent's rejected re-verdict.
    const identityLocked =
      typeof doc.fileTypeDetected === "string" &&
      doc.fileTypeDetected !== "" &&
      doc.fileTypeDetected !== "Unclassified";
    const effectiveFileTypeDetected: string = identityLocked
      ? doc.fileTypeDetected
      : fileTypeDetected;
    const effectiveCategory: string = identityLocked
      ? (doc.category ?? category)
      : category;

    const driveRow = await ctx.db
      .query("driveFiles")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    if (driveRow && driveRow.md5Checksum && !args.contentChecksum) {
      return {
        applied: false,
        error:
          "contentChecksum is required for Drive-mirrored documents — pass the value document.extractText returned",
      };
    }

    const now = new Date().toISOString();

    // First classification = content has never been applied to this row.
    // Same discriminator as applyExtraction (contentChecksum is only ever
    // stamped by a persistence write), so the first-extraction side effects
    // and the ingestionEvents kind stay consistent across both lanes.
    const firstExtraction = doc.contentChecksum === undefined || doc.contentChecksum === null;

    const clientId: Id<"clients"> | undefined = doc.clientId ?? undefined;
    const projectId: Id<"projects"> | undefined = doc.projectId ?? undefined;

    // ── PLACEMENT: first classification only (folderId not yet set), and
    // resolved SERVER-SIDE — the agent supplies category/fileTypeDetected,
    // the deterministic placement-rules table (the exact table the v4
    // pipeline uses) derives the target-folder key, and the key resolves
    // against the real folder taxonomy: PROJECT taxonomy when the doc has a
    // projectId (exact → unfiled → background → any), CLIENT taxonomy
    // otherwise (exact → miscellaneous → any). Once folderId is set it is
    // APP-OWNED (operators move documents freely); this block is skipped and
    // agents can never move a filed document through this tool.
    let placementPatch:
      | { folderId: string; folderType: "client" | "project" }
      | undefined;
    if (!doc.folderId) {
      const client: any = clientId ? await ctx.db.get(clientId) : null;
      const placement = resolvePlacement(
        {
          classification: {
            // Effective identity: a locked doc files by its ORIGINAL
            // classification, never the rejected re-verdict.
            fileType: effectiveFileTypeDetected,
            category: effectiveCategory,
            suggestedFolder: "",
            targetLevel: projectId ? "project" : "client",
          },
        } as any,
        { clientType: client?.type } as any,
      );
      const targetFolder: string | undefined = placement.folderKey || undefined;
      if (projectId) {
        const resolvedKey = await resolveProjectFolderKey(
          ctx,
          projectId,
          targetFolder,
        );
        if (resolvedKey) {
          placementPatch = { folderId: resolvedKey, folderType: "project" };
        }
      } else if (clientId) {
        const matchExact = targetFolder
          ? await ctx.db
              .query("clientFolders")
              .withIndex("by_client_type", (q: any) =>
                q.eq("clientId", clientId).eq("folderType", targetFolder),
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
              q.eq("clientId", clientId).eq("folderType", "miscellaneous"),
            )
            .first();
          const anyFolder = misc
            ? null
            : await ctx.db
                .query("clientFolders")
                .withIndex("by_client", (q: any) => q.eq("clientId", clientId))
                .first();
          resolvedKey = (misc ?? anyFolder)?.folderType;
        }
        if (resolvedKey) {
          placementPatch = { folderId: resolvedKey, folderType: "client" };
        }
      }
    }

    // ── documentAnalysis — built only when the agent supplied structured
    // extras; shaped to the schema's strict validator (same object
    // applyExtraction persists from the v4 Stage-1 output).
    let documentAnalysis: any;
    if (args.keyDates || args.keyAmounts || args.keyEntities) {
      // Effective identity in the analysis block; the fresh run's
      // confidence is allowed here (confidenceInAnalysis) even when the
      // identity confidence stays frozen.
      const catLower = effectiveCategory.toLowerCase();
      documentAnalysis = {
        documentDescription: `${effectiveFileTypeDetected} — ${doc.fileName}`,
        documentPurpose: reasoning || summary.slice(0, 200),
        entities: {
          people: args.keyEntities?.people ?? [],
          companies: args.keyEntities?.companies ?? [],
          locations: args.keyEntities?.locations ?? [],
          projects: args.keyEntities?.projects ?? [],
        },
        keyTerms: [],
        keyDates: args.keyDates ?? [],
        keyAmounts: args.keyAmounts ?? [],
        executiveSummary: summary,
        detailedSummary: summary,
        documentCharacteristics: {
          isFinancial:
            catLower.includes("financial") ||
            catLower.includes("loan") ||
            catLower.includes("appraisal"),
          isLegal: catLower.includes("legal"),
          isIdentity: catLower.includes("kyc"),
          isReport:
            catLower.includes("report") || catLower.includes("inspection"),
          isDesign: catLower.includes("plan"),
          isCorrespondence: catLower.includes("communication"),
          hasMultipleProjects: false,
          isInternal: false,
        },
        rawContentType: doc.fileType ?? "document",
        confidenceInAnalysis: confidence,
      };
    }

    // ── PATCH the documents row in place (first classification and every
    // re-classification alike). clientId/projectId are never touched;
    // folderId/folderType only via placementPatch (first classification);
    // identity fields (fileTypeDetected/category/…) only while the doc is
    // still unclassified (identity immutability — module header).
    const effectiveStorageId: Id<"_storage"> | undefined =
      doc.fileStorageId ?? driveRow?.cachedStorageId ?? undefined;
    await ctx.db.patch(args.documentId, {
      summary,
      ...(identityLocked
        ? {}
        : {
            fileTypeDetected,
            category,
            reasoning,
            confidence,
            classificationReasoning: reasoning || undefined,
          }),
      ...(documentAnalysis ? { documentAnalysis } : {}),
      ...(args.textContent
        ? { textContent: args.textContent.slice(0, MAX_TEXT_CONTENT_CHARS) }
        : {}),
      ...(effectiveStorageId && !doc.fileStorageId
        ? { fileStorageId: effectiveStorageId }
        : {}),
      ...(driveRow && typeof driveRow.size === "number"
        ? { fileSize: driveRow.size }
        : {}),
      ...(args.contentChecksum ? { contentChecksum: args.contentChecksum } : {}),
      status: "completed" as const,
      savedAt: now,
      ...(placementPatch ?? {}),
    });

    const ingestionKind: "created" | "reextracted" = firstExtraction
      ? "created"
      : "reextracted";
    await ctx.db.insert("ingestionEvents", {
      documentId: args.documentId,
      driveFileId: driveRow?.driveFileId,
      source: "harness",
      checksum: args.contentChecksum,
      kind: ingestionKind,
      at: now,
    });

    // ── First-classification side effects (parity with applyExtraction /
    // documents.create). CREATE-ONLY: unlike applyExtraction (which can only
    // run first on a virgin import row), this mutation can be pointed at a
    // legacy doc, so each side effect probes for a prior row before insert.
    if (firstExtraction && clientId) {
      const fileNameLower = String(doc.fileName ?? "").toLowerCase();
      try {
        const existingEntry = await ctx.db
          .query("knowledgeBankEntries")
          .withIndex("by_client", (q: any) => q.eq("clientId", clientId))
          .filter((q: any) => q.eq(q.field("sourceId"), args.documentId))
          .first();
        if (!existingEntry) {
          let entryType:
            | "deal_update"
            | "call_transcript"
            | "email"
            | "document_summary"
            | "project_status"
            | "general" = "document_summary";
          const categoryLower = effectiveCategory.toLowerCase();
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

          const tags: string[] = [effectiveCategory, effectiveFileTypeDetected];
          if (projectId) tags.push("project-related");

          await ctx.db.insert("knowledgeBankEntries", {
            clientId,
            projectId,
            sourceType: "document",
            sourceId: args.documentId,
            entryType,
            title: `${doc.fileName} - ${effectiveCategory}`,
            content: summary,
            keyPoints,
            metadata: undefined,
            tags,
            createdAt: now,
            updatedAt: now,
          });
        }
      } catch (error) {
        // Parity with documents.create: never fail the write on a KB miss.
        console.error("[harnessClassify] knowledge bank entry failed:", error);
      }

      // Meeting extraction job — same heuristics as documents.create /
      // applyExtraction, plus an existing-job probe (legacy docs may
      // already carry one). Needs stored bytes.
      const meetingTypes = ["Meeting Minutes", "Meeting Notes", "Minutes"];
      const fileTypeLower = effectiveFileTypeDetected.toLowerCase();
      const isMeetingDocument =
        meetingTypes.some((t) => t.toLowerCase() === fileTypeLower) ||
        (fileNameLower.includes("meeting") &&
          (fileNameLower.includes("minutes") ||
            fileNameLower.includes("notes")));
      if (isMeetingDocument && effectiveStorageId) {
        try {
          const existingJob = await ctx.db
            .query("meetingExtractionJobs")
            .withIndex("by_document", (q: any) =>
              q.eq("documentId", args.documentId),
            )
            .first();
          if (!existingJob) {
            await ctx.db.insert("meetingExtractionJobs", {
              documentId: args.documentId,
              clientId,
              projectId,
              fileStorageId: effectiveStorageId,
              documentName: doc.fileName,
              status: "pending",
              attempts: 0,
              maxAttempts: 3,
              createdAt: now,
              updatedAt: now,
            });
          }
        } catch (error) {
          console.error(
            "[harnessClassify] meeting extraction job failed:",
            error,
          );
        }
      }
    }

    // Context cache invalidation on first classification AND re-classify —
    // the cached client/project context embeds document summaries.
    if (clientId) {
      // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "client",
        contextId: clientId,
      });
    }
    if (projectId) {
      // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: projectId,
      });
    }

    // ── driveFiles completion (drift-aware, exactly applyExtraction's
    // block). args.contentChecksum is what was ACTUALLY extracted; if the
    // row's md5 has moved on mid-classification (the poller saw another
    // edit), keep/re-arm the settling state instead of stamping "complete"
    // — the automatic lane then re-extracts the new revision.
    let drifted = false;
    if (driveRow && args.contentChecksum) {
      drifted =
        driveRow.md5Checksum !== undefined &&
        driveRow.md5Checksum !== args.contentChecksum;
      const nowMs = Date.now();
      await ctx.db.patch(driveRow._id, {
        extractedChecksum: args.contentChecksum,
        documentId: args.documentId,
        processingStartedAt: undefined,
        extractionError: undefined,
        ...(drifted
          ? {
              extractionStatus: "settling" as const,
              settleAfter: driveRow.settleAfter ?? nowMs + SETTLE_MS,
              firstDirtyAt: driveRow.firstDirtyAt ?? nowMs,
            }
          : {
              extractionStatus: "complete" as const,
              settleAfter: undefined,
              firstDirtyAt: undefined,
            }),
      });
    }

    return {
      applied: true,
      documentId: args.documentId,
      firstClassification: firstExtraction,
      identityLocked,
      ...(placementPatch ?? {}),
      ingestionKind,
      driveFileCompleted: !!driveRow && !drifted,
      drifted,
      ...(identityLocked
        ? {
            note: "Classification identity is immutable: the document already had a real fileTypeDetected/category, so only contents (summary/documentAnalysis/textContent/checksum) were refreshed. Reclassification is a future explicit operator action.",
          }
        : {}),
    };
  },
});
