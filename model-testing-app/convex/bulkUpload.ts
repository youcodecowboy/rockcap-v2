import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { extractIntelligenceFromDocumentAnalysis, ExtractedField, FieldType } from "./intelligenceHelpers";

// Fallback project folder types (matches convex/projects.ts)
const BULK_UPLOAD_FALLBACK_FOLDERS = [
  { name: "Background", folderKey: "background", order: 1 },
  { name: "Terms Comparison", folderKey: "terms_comparison", order: 2 },
  { name: "Terms Request", folderKey: "terms_request", order: 3 },
  { name: "Credit Submission", folderKey: "credit_submission", order: 4 },
  { name: "Post-completion Documents", folderKey: "post_completion", order: 5 },
  { name: "Appraisals", folderKey: "appraisals", order: 6 },
  { name: "Notes", folderKey: "notes", order: 7 },
  { name: "Operational Model", folderKey: "operational_model", order: 8 },
];

// Helper: Generate shortcode from project name (matches convex/projects.ts)
function generateShortcodeSuggestion(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '';
  let shortcode = '';
  const numbers = name.replace(/[^0-9]/g, '');
  if (words[0]) {
    shortcode += words[0].slice(0, words.length > 2 ? 3 : 4);
  }
  for (let i = 1; i < words.length && shortcode.length < 7; i++) {
    shortcode += words[i].charAt(0);
  }
  if (numbers && shortcode.length + numbers.length <= 10) {
    shortcode += numbers;
  } else if (numbers) {
    shortcode = shortcode.slice(0, 10 - Math.min(numbers.length, 4)) + numbers.slice(0, 4);
  }
  return shortcode.slice(0, 10).toUpperCase();
}

// ============================================================================
// BULK UPLOAD SYSTEM
// Handles batch uploads of up to 100 documents with summary-only analysis
// ============================================================================

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

// Mutation: Create a new bulk upload batch
export const createBatch = mutation({
  args: {
    // Document scope (client, internal, personal) - defaults to client
    scope: v.optional(v.union(
      v.literal("client"),
      v.literal("internal"),
      v.literal("personal")
    )),
    // Client/Project association (required for client scope, optional for others)
    clientId: v.optional(v.id("clients")),
    clientName: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    projectShortcode: v.optional(v.string()),
    // Internal folder association (for internal scope)
    internalFolderId: v.optional(v.string()),
    internalFolderName: v.optional(v.string()),
    // Personal folder association (for personal scope)
    personalFolderId: v.optional(v.string()),
    personalFolderName: v.optional(v.string()),
    isInternal: v.boolean(),
    isMultiProject: v.optional(v.boolean()),
    instructions: v.optional(v.string()),
    userId: v.id("users"),
    totalFiles: v.number(),
    // Background processing mode (for large batches >5 files)
    processingMode: v.optional(v.union(
      v.literal("foreground"),
      v.literal("background")
    )),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const scope = args.scope || "client";

    // Validate based on scope
    if (scope === "client" && !args.clientId) {
      throw new Error("Client scope requires a clientId");
    }

    const batchId = await ctx.db.insert("bulkUploadBatches", {
      scope,
      clientId: args.clientId,
      clientName: args.clientName,
      projectId: args.projectId,
      projectName: args.projectName,
      projectShortcode: args.projectShortcode,
      internalFolderId: args.internalFolderId,
      internalFolderName: args.internalFolderName,
      personalFolderId: args.personalFolderId,
      personalFolderName: args.personalFolderName,
      status: "uploading",
      totalFiles: args.totalFiles,
      processedFiles: 0,
      filedFiles: 0,
      isInternal: args.isInternal,
      isMultiProject: args.isMultiProject,
      instructions: args.instructions,
      processingMode: args.processingMode,
      userId: args.userId,
      createdAt: now,
      updatedAt: now,
    });

    return batchId;
  },
});

// Query: Get a batch by ID
export const getBatch = query({
  args: { batchId: v.id("bulkUploadBatches") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.batchId);
  },
});

// Query: Get recent batches for a user
export const getRecentBatches = query({
  args: { 
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    const batches = await ctx.db
      .query("bulkUploadBatches")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
    
    return batches;
  },
});

// Query: Get batches needing attention (not completed)
export const getPendingBatches = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const allBatches = await ctx.db
      .query("bulkUploadBatches")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .collect();
    
    return allBatches.filter(b =>
      !b.notificationDismissed &&
      (b.status === "uploading" ||
      b.status === "processing" ||
      b.status === "review")
    );
  },
});

// Mutation: Dismiss a batch from the notification panel
export const dismissBatchNotification = mutation({
  args: { batchId: v.id("bulkUploadBatches") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.batchId, { notificationDismissed: true });
  },
});

// Mutation: Add a batch to the queue (status → "queued", assigns queue position)
export const enqueueBatch = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Find the highest existing queue position
    const queuedBatches = await ctx.db
      .query("bulkUploadBatches")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .collect();

    const maxPos = queuedBatches
      .filter((b: any) => b.status === "queued" && b.queuePosition != null)
      .reduce((max: number, b: any) => Math.max(max, b.queuePosition ?? 0), 0);

    await ctx.db.patch(args.batchId, {
      status: "queued",
      queuePosition: maxPos + 1,
      updatedAt: new Date().toISOString(),
    });

    return { queuePosition: maxPos + 1 };
  },
});

// Action: Start the next queued batch (called when any batch completes)
// Looks for the lowest queuePosition batch with status "queued" and starts it.
export const checkAndStartNextQueued = action({
  args: {
    userId: v.id("users"),
    baseUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const allBatches: any[] = await ctx.runQuery(api.bulkUpload.getRecentBatches, {
      userId: args.userId,
      limit: 50,
    });

    // Check if any batch is currently processing
    const isProcessing = allBatches.some((b: any) => b.status === "processing");
    if (isProcessing) return null;

    // Find the next queued batch (lowest queue position)
    const queued = allBatches
      .filter((b: any) => b.status === "queued")
      .sort((a: any, b: any) => (a.queuePosition ?? 999) - (b.queuePosition ?? 999));

    if (queued.length === 0) return null;

    const next = queued[0];

    // Change status from "queued" → "uploading" so startBackgroundProcessing accepts it
    await ctx.runMutation(api.bulkUpload.updateBatchStatus, {
      batchId: next._id,
      status: "uploading",
    });

    // Start background processing
    // @ts-ignore
    await ctx.runMutation(internal.bulkBackgroundProcessor.startBackgroundProcessing, {
      batchId: next._id,
      baseUrl: args.baseUrl,
    });

    return next._id;
  },
});

// Mutation: Update batch status
export const updateBatchStatus = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    status: v.optional(v.union(
      v.literal("queued"),
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("review"),
      v.literal("completed"),
      v.literal("partial")
    )),
    processedFiles: v.optional(v.number()),
    filedFiles: v.optional(v.number()),
    errorFiles: v.optional(v.number()),
    projectShortcode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      updatedAt: new Date().toISOString(),
    };
    
    if (args.status !== undefined) {
      updates.status = args.status;
    }
    if (args.processedFiles !== undefined) {
      updates.processedFiles = args.processedFiles;
    }
    if (args.filedFiles !== undefined) {
      updates.filedFiles = args.filedFiles;
    }
    if (args.errorFiles !== undefined) {
      updates.errorFiles = args.errorFiles;
    }
    if (args.projectShortcode !== undefined) {
      updates.projectShortcode = args.projectShortcode;
    }
    
    await ctx.db.patch(args.batchId, updates);
    return args.batchId;
  },
});

// ============================================================================
// ITEM OPERATIONS
// ============================================================================

// Mutation: Add an item to a batch
export const addItemToBatch = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    fileStorageId: v.optional(v.id("_storage")),
    folderHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Get batch to inherit isInternal default
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      throw new Error("Batch not found");
    }

    const itemId = await ctx.db.insert("bulkUploadItems", {
      batchId: args.batchId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileType: args.fileType,
      fileStorageId: args.fileStorageId,
      folderHint: args.folderHint,
      status: "pending",
      isInternal: batch.isInternal, // Inherit from batch
      createdAt: now,
      updatedAt: now,
    });
    
    return itemId;
  },
});

// Query: Get all items in a batch
export const getBatchItems = query({
  args: { batchId: v.id("bulkUploadBatches") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bulkUploadItems")
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect();
  },
});

// Query: Get items by status within a batch
export const getBatchItemsByStatus = query({
  args: { 
    batchId: v.id("bulkUploadBatches"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready_for_review"),
      v.literal("filed"),
      v.literal("error")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bulkUploadItems")
      .withIndex("by_batch_status", (q: any) => 
        q.eq("batchId", args.batchId).eq("status", args.status)
      )
      .collect();
  },
});

// Mutation: Update item processing status
export const updateItemStatus = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready_for_review"),
      v.literal("filed"),
      v.literal("error")
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      status: args.status,
      updatedAt: new Date().toISOString(),
    };
    
    if (args.error !== undefined) {
      updates.error = args.error;
    }
    
    await ctx.db.patch(args.itemId, updates);
    
    // Update batch processed count
    const item = await ctx.db.get(args.itemId);
    if (item) {
      const batch = await ctx.db.get(item.batchId);
      if (batch && (args.status === "ready_for_review" || args.status === "error")) {
        const allItems = await ctx.db
          .query("bulkUploadItems")
          .withIndex("by_batch", (q: any) => q.eq("batchId", item.batchId))
          .collect();
        
        const processed = allItems.filter(i => 
          i.status === "ready_for_review" || i.status === "error"
        ).length;
        
        const newStatus = processed >= batch.totalFiles ? "review" : "processing";
        
        await ctx.db.patch(item.batchId, {
          processedFiles: processed,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    
    return args.itemId;
  },
});

// Mutation: Update item analysis results
export const updateItemAnalysis = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    fileStorageId: v.optional(v.id("_storage")),
    summary: v.string(),
    fileTypeDetected: v.string(),
    category: v.string(),
    targetFolder: v.optional(v.string()),
    confidence: v.number(),
    generatedDocumentCode: v.optional(v.string()),
    version: v.optional(v.string()),
    isDuplicate: v.optional(v.boolean()),
    duplicateOfDocumentId: v.optional(v.id("documents")),
    suggestedChecklistItems: v.optional(v.array(v.object({
      itemId: v.id("knowledgeChecklistItems"),
      itemName: v.string(),
      category: v.string(),
      confidence: v.number(),
      reasoning: v.optional(v.string()),
    }))),
    // Pre-extracted intelligence from bulk-analyze (Sprint 4+)
    extractedIntelligence: v.optional(v.object({
      fields: v.array(v.object({
        fieldPath: v.string(),
        label: v.string(),
        category: v.string(),
        value: v.any(),
        valueType: v.union(
          v.literal("string"),
          v.literal("number"),
          v.literal("currency"),
          v.literal("date"),
          v.literal("percentage"),
          v.literal("array"),
          v.literal("text"),
          v.literal("boolean")
        ),
        isCanonical: v.boolean(),
        confidence: v.number(),
        sourceText: v.optional(v.string()),
        originalLabel: v.optional(v.string()),
        matchedAlias: v.optional(v.string()),
        templateTags: v.optional(v.array(v.string())),
        pageReference: v.optional(v.string()),
        scope: v.optional(v.string()),
      })),
      insights: v.optional(v.object({
        keyFindings: v.optional(v.array(v.string())),
        risks: v.optional(v.array(v.object({
          risk: v.string(),
          severity: v.optional(v.string()),
        }))),
      })),
    })),
    // Document analysis from Stage 1 Summary Agent
    documentAnalysis: v.optional(v.object({
      documentDescription: v.string(),
      documentPurpose: v.string(),
      entities: v.object({
        people: v.array(v.string()),
        companies: v.array(v.string()),
        locations: v.array(v.string()),
        projects: v.array(v.string()),
      }),
      keyTerms: v.array(v.string()),
      keyDates: v.array(v.string()),
      keyAmounts: v.array(v.string()),
      executiveSummary: v.string(),
      detailedSummary: v.string(),
      sectionBreakdown: v.optional(v.array(v.string())),
      documentCharacteristics: v.object({
        isFinancial: v.boolean(),
        isLegal: v.boolean(),
        isIdentity: v.boolean(),
        isReport: v.boolean(),
        isDesign: v.boolean(),
        isCorrespondence: v.boolean(),
        hasMultipleProjects: v.boolean(),
        isInternal: v.boolean(),
      }),
      rawContentType: v.string(),
      confidenceInAnalysis: v.number(),
    })),
    // Classification reasoning from Stage 2
    classificationReasoning: v.optional(v.string()),
    // V4 extracted data
    extractedData: v.optional(v.any()),
    // Full parsed text content for re-analysis
    textContent: v.optional(v.string()),
    // Multi-project: AI-suggested project assignment
    suggestedProjectId: v.optional(v.id("projects")),
    suggestedProjectName: v.optional(v.string()),
    projectConfidence: v.optional(v.number()),
    projectReasoning: v.optional(v.string()),
    emailMetadata: v.optional(v.object({
      from: v.optional(v.string()),
      to: v.optional(v.string()),
      subject: v.optional(v.string()),
      date: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const { itemId, suggestedChecklistItems, extractedIntelligence, documentAnalysis, classificationReasoning, textContent, suggestedProjectId, suggestedProjectName, projectConfidence, projectReasoning, emailMetadata, ...updates } = args;

    // If there are AI-suggested checklist items, pre-select ONLY the highest confidence one
    // Other suggestions are still shown but not auto-checked - user can manually select more
    let checklistItemIds: Id<"knowledgeChecklistItems">[] | undefined;
    if (suggestedChecklistItems && suggestedChecklistItems.length > 0) {
      // Sort by confidence descending and take only the top item if it's >= 0.7
      const sortedSuggestions = [...suggestedChecklistItems].sort((a, b) => b.confidence - a.confidence);
      const topSuggestion = sortedSuggestions[0];
      if (topSuggestion && topSuggestion.confidence >= 0.7) {
        checklistItemIds = [topSuggestion.itemId];
      }
    }

    await ctx.db.patch(itemId, {
      ...updates,
      suggestedChecklistItems,
      checklistItemIds: checklistItemIds && checklistItemIds.length > 0 ? checklistItemIds : undefined,
      // Store extracted intelligence for filing later
      extractedIntelligence: extractedIntelligence,
      // Store document analysis from Stage 1 Summary Agent
      documentAnalysis: documentAnalysis,
      // Store classification reasoning from Stage 2
      classificationReasoning: classificationReasoning,
      // Store parsed text for re-analysis
      textContent: textContent,
      // Multi-project: AI-suggested project assignment
      suggestedProjectId,
      suggestedProjectName,
      projectConfidence,
      projectReasoning,
      // Email provenance metadata
      emailMetadata,
      // Auto-assign to existing project when AI suggests one — user can override in review
      ...(suggestedProjectId ? { itemProjectId: suggestedProjectId } : {}),
      status: "ready_for_review",
      updatedAt: new Date().toISOString(),
    });

    return itemId;
  },
});

// Mutation: Update item details (user edits)
export const updateItemDetails = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    fileTypeDetected: v.optional(v.string()),
    category: v.optional(v.string()),
    isInternal: v.optional(v.boolean()),
    targetFolder: v.optional(v.string()),
    generatedDocumentCode: v.optional(v.string()),
    versionType: v.optional(v.union(v.literal("minor"), v.literal("significant"))),
    checklistItemIds: v.optional(v.array(v.id("knowledgeChecklistItems"))),
  },
  handler: async (ctx, args) => {
    const { itemId, ...updates } = args;

    // Track what was edited
    const item = await ctx.db.get(itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // Track which fields were edited and store ORIGINAL AI values for feedback loop
    // We only store the original value the FIRST time a field is changed
    // (so we capture AI prediction → final user choice, not intermediate changes)
    const userEdits: any = item.userEdits || {};

    if (updates.fileTypeDetected !== undefined && updates.fileTypeDetected !== item.fileTypeDetected) {
      userEdits.fileTypeDetected = true;
      // Store original AI value only on first edit
      if (userEdits.originalFileTypeDetected === undefined) {
        userEdits.originalFileTypeDetected = item.fileTypeDetected;
      }
    }
    if (updates.category !== undefined && updates.category !== item.category) {
      userEdits.category = true;
      if (userEdits.originalCategory === undefined) {
        userEdits.originalCategory = item.category;
      }
    }
    if (updates.isInternal !== undefined && updates.isInternal !== item.isInternal) {
      userEdits.isInternal = true;
      if (userEdits.originalIsInternal === undefined) {
        userEdits.originalIsInternal = item.isInternal;
      }
    }
    if (updates.targetFolder !== undefined && updates.targetFolder !== item.targetFolder) {
      userEdits.targetFolder = true;
      if (userEdits.originalTargetFolder === undefined) {
        userEdits.originalTargetFolder = item.targetFolder;
      }
    }
    if (updates.checklistItemIds !== undefined) {
      userEdits.checklistItems = true;
      // Store original checklist selection and AI suggestions on first edit
      if (userEdits.originalChecklistItemIds === undefined) {
        userEdits.originalChecklistItemIds = item.checklistItemIds || [];
        // Also store the AI's suggested items with names for meaningful feedback
        userEdits.originalSuggestedChecklistItems = item.suggestedChecklistItems || [];
      }
    }

    // NOTE: Correction capture moved to fileItem mutation - only capture on final confirmation,
    // not on every dropdown change. The userEdits flags are still tracked here for UI display.

    // Clean undefined values
    const cleanUpdates: any = { userEdits, updatedAt: new Date().toISOString() };
    if (updates.fileTypeDetected !== undefined) cleanUpdates.fileTypeDetected = updates.fileTypeDetected;
    if (updates.category !== undefined) cleanUpdates.category = updates.category;
    if (updates.isInternal !== undefined) cleanUpdates.isInternal = updates.isInternal;
    if (updates.targetFolder !== undefined) cleanUpdates.targetFolder = updates.targetFolder;
    if (updates.generatedDocumentCode !== undefined) cleanUpdates.generatedDocumentCode = updates.generatedDocumentCode;
    if (updates.versionType !== undefined) cleanUpdates.versionType = updates.versionType;
    if (updates.checklistItemIds !== undefined) cleanUpdates.checklistItemIds = updates.checklistItemIds;

    await ctx.db.patch(itemId, cleanUpdates);
    return itemId;
  },
});

// Mutation: Soft-delete a batch and all its items
export const discardBatch = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Batch not found");

    const now = new Date().toISOString();

    // Soft-delete all items in this batch
    const items = await ctx.db
      .query("bulkUploadItems")
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect();

    for (const item of items) {
      // Delete the stored file if it exists
      if (item.fileStorageId) {
        try {
          await ctx.storage.delete(item.fileStorageId);
        } catch {
          // File may already be deleted — ignore
        }
      }
      await ctx.db.patch(item._id, {
        isDeleted: true,
        deletedAt: now,
        deletedReason: args.reason || "Batch discarded by user",
        status: "discarded",
        updatedAt: now,
      });
    }

    // Soft-delete the batch itself
    await ctx.db.patch(args.batchId, {
      isDeleted: true,
      deletedAt: now,
      deletedReason: args.reason || "Discarded by user",
      status: "completed", // Mark as terminal state
      updatedAt: now,
    });

    return { discarded: items.length };
  },
});

// Mutation: Update per-item project assignment with document code regeneration
export const updateItemProject = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    itemProjectId: v.optional(v.id("projects")),
    isClientLevel: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const batch = await ctx.db.get(item.batchId);
    if (!batch) throw new Error("Batch not found");

    // Determine the new shortcode based on target
    let newShortcode: string | undefined;
    if (args.isClientLevel) {
      // Moving to client level — use client name derived shortcode
      newShortcode = deriveShortcodeFromName(batch.clientName || "DOC");
    } else if (args.itemProjectId) {
      // Moving to a project — use that project's shortcode
      const project = await ctx.db.get(args.itemProjectId);
      if (project) {
        newShortcode = project.projectShortcode || deriveShortcodeFromName(project.name);
      }
    }

    // Regenerate document code if we have a new shortcode and an existing code
    let updatedDocCode = item.generatedDocumentCode;
    if (newShortcode && item.generatedDocumentCode) {
      updatedDocCode = replaceShortcodeInDocumentCode(item.generatedDocumentCode, newShortcode);
    }

    await ctx.db.patch(args.itemId, {
      itemProjectId: args.itemProjectId,
      isClientLevel: args.isClientLevel,
      generatedDocumentCode: updatedDocCode,
      updatedAt: new Date().toISOString(),
    });
  },
});

/** Derive a shortcode from a name (uppercase, alphanumeric, max 10 chars) */
function deriveShortcodeFromName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10) || "DOC";
}

/**
 * Replace the shortcode prefix in a document code.
 * Format: {SHORTCODE}-{TYPEABBREV}-{INTEXT}-{INITIALS}-{VERSION}-{DATE}
 * We find the boundary by looking for -EXT- or -INT- which is always the 3rd segment.
 */
function replaceShortcodeInDocumentCode(code: string, newShortcode: string): string {
  // Find -EXT- or -INT- marker which separates shortcode+typeAbbrev from the rest
  const extMatch = code.match(/^(.+?)-(EXT|INT)-(.+)$/);
  if (!extMatch) return code; // Can't parse — leave unchanged

  const beforeIntExt = extMatch[1]; // e.g. "MP-RF-OTHERDOCUM"
  const intExt = extMatch[2]; // "EXT" or "INT"
  const afterIntExt = extMatch[3]; // e.g. "KH-V1.0-2026-03-11"

  // The beforeIntExt is "{SHORTCODE}-{TYPEABBREV}" — we need to find where shortcode ends
  // The type abbreviation is always the LAST segment before -EXT-/-INT-
  const segments = beforeIntExt.split("-");
  if (segments.length < 2) return code;

  // Last segment is always the type abbreviation
  const typeAbbrev = segments[segments.length - 1];

  return `${newShortcode}-${typeAbbrev}-${intExt}-${afterIntExt}`;
}

// Helper function for generating content hash (djb2 algorithm)
function generateSimpleHash(content: string): string {
  const normalizedContent = content.slice(0, 10000).toLowerCase().trim();
  let hash = 5381;
  for (let i = 0; i < normalizedContent.length; i++) {
    hash = ((hash << 5) + hash) + normalizedContent.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// Helper function to infer client type from name (basic heuristic)
function inferClientType(clientName: string): string | undefined {
  const lowerName = clientName.toLowerCase();
  if (lowerName.includes("bank") || lowerName.includes("lend") || lowerName.includes("capital")) {
    return "lender";
  }
  if (lowerName.includes("develop") || lowerName.includes("properties") || lowerName.includes("homes")) {
    return "borrower";
  }
  return undefined;
}

// Mutation: Toggle extraction for an item
export const toggleExtraction = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      extractionEnabled: args.enabled,
      updatedAt: new Date().toISOString(),
    });
    return args.itemId;
  },
});

// Mutation: Update item note (user adds notes during review for internal context or intelligence)
export const updateItemNote = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    content: v.string(),
    addToIntelligence: v.boolean(),
    intelligenceTarget: v.optional(v.union(v.literal("client"), v.literal("project"))),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    await ctx.db.patch(args.itemId, {
      userNote: {
        content: args.content,
        addToIntelligence: args.addToIntelligence,
        intelligenceTarget: args.intelligenceTarget,
        createdAt: item.userNote?.createdAt || now,
        updatedAt: now,
      },
      updatedAt: now,
    });
    return args.itemId;
  },
});

// Mutation: Update intelligence field selections for a bulk upload item
export const updateIntelligenceEdits = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    skipIntelligence: v.optional(v.boolean()),
    excludedFields: v.optional(v.array(v.string())),
    modified: v.optional(v.array(v.object({
      fieldPath: v.string(),
      newValue: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const { itemId, ...edits } = args;
    const item = await ctx.db.get(itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    const now = new Date().toISOString();
    const existing = (item as any).intelligenceEdits || {};

    const intelligenceEdits: any = {
      ...existing,
      updatedAt: now,
    };

    if (edits.skipIntelligence !== undefined) {
      intelligenceEdits.skipIntelligence = edits.skipIntelligence;
    }
    if (edits.excludedFields !== undefined) {
      intelligenceEdits.excludedFields = edits.excludedFields;
    }
    if (edits.modified !== undefined) {
      intelligenceEdits.modified = edits.modified;
    }

    await ctx.db.patch(itemId, {
      intelligenceEdits,
      updatedAt: now,
    });
    return itemId;
  },
});

// Mutation: Save extracted data to an item (after running extraction pipeline)
export const saveExtractedData = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    extractedData: v.any(),
    codificationPreview: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    
    await ctx.db.patch(args.itemId, {
      extractedData: args.extractedData,
      extractionEnabled: true, // Mark as enabled since we ran extraction
      updatedAt: new Date().toISOString(),
    });
    
    return args.itemId;
  },
});

// Mutation: Set version type for duplicate
export const setVersionType = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    versionType: v.union(v.literal("minor"), v.literal("significant")),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    
    // Calculate new version based on existing document
    let newVersion = "V1.0";
    if (item.duplicateOfDocumentId) {
      const existingDoc = await ctx.db.get(item.duplicateOfDocumentId);
      if (existingDoc?.version) {
        const match = existingDoc.version.match(/^V(\d+)\.(\d+)$/);
        if (match) {
          const major = parseInt(match[1], 10);
          const minor = parseInt(match[2], 10);
          newVersion = args.versionType === "significant" 
            ? `V${major + 1}.0`
            : `V${major}.${minor + 1}`;
        }
      }
    }
    
    await ctx.db.patch(args.itemId, {
      versionType: args.versionType,
      version: newVersion,
      updatedAt: new Date().toISOString(),
    });
    
    return { itemId: args.itemId, version: newVersion };
  },
});

// Mutation: Link a bulk upload item to an existing document as a version
export const linkItemToDocument = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    documentId: v.id("documents"),
    versionType: v.union(v.literal("minor"), v.literal("significant")),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const existingDoc = await ctx.db.get(args.documentId);
    if (!existingDoc) throw new Error("Document not found");

    // Calculate version number from existing document
    let newVersion = "V2.0";
    if (existingDoc.version) {
      const match = existingDoc.version.match(/^V(\d+)\.(\d+)$/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        newVersion = args.versionType === "significant"
          ? `V${major + 1}.0`
          : `V${major}.${minor + 1}`;
      }
    }

    await ctx.db.patch(args.itemId, {
      duplicateOfDocumentId: args.documentId,
      isDuplicate: true,
      versionType: args.versionType,
      version: newVersion,
      updatedAt: new Date().toISOString(),
    });

    return { itemId: args.itemId, version: newVersion, linkedTo: existingDoc.fileName };
  },
});

// Mutation: Unlink a bulk upload item from its version target
export const unlinkItemVersion = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    await ctx.db.patch(args.itemId, {
      duplicateOfDocumentId: undefined,
      isDuplicate: false,
      versionType: undefined,
      version: undefined,
      updatedAt: new Date().toISOString(),
    });

    return { itemId: args.itemId };
  },
});

// Delete items from a batch (bulk delete from review table)
export const deleteItems = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    itemIds: v.array(v.id("bulkUploadItems")),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Batch not found");

    let totalDecrement = 0;
    let processedDecrement = 0;
    let errorDecrement = 0;

    for (const itemId of args.itemIds) {
      const item = await ctx.db.get(itemId);
      if (!item || item.batchId !== args.batchId) continue;

      // Decrement counters based on item status
      totalDecrement++;
      if (item.status === "ready_for_review" || item.status === "filed") {
        processedDecrement++;
      } else if (item.status === "error") {
        errorDecrement++;
      }

      // Clean up storage
      if (item.fileStorageId) {
        try {
          await ctx.storage.delete(item.fileStorageId);
        } catch {
          // Storage already deleted — ignore
        }
      }

      await ctx.db.delete(itemId);
    }

    // Update batch counters
    await ctx.db.patch(args.batchId, {
      totalFiles: Math.max(0, (batch.totalFiles || 0) - totalDecrement),
      processedFiles: Math.max(0, (batch.processedFiles || 0) - processedDecrement),
      errorFiles: Math.max(0, (batch.errorFiles || 0) - errorDecrement),
      updatedAt: new Date().toISOString(),
    });

    return { deleted: totalDecrement };
  },
});

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

// Query: Check for duplicate documents
export const checkForDuplicates = query({
  args: {
    projectShortcode: v.string(),
    category: v.string(),
    isInternal: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Get type abbreviation (simplified for query - actual logic is client-side)
    const typeAbbrev = args.category.toUpperCase().slice(0, 10);
    const internalExternal = args.isInternal ? "INT" : "EXT";
    const basePattern = `${args.projectShortcode.toUpperCase()}-${typeAbbrev}-${internalExternal}`;
    
    // Find documents with matching pattern
    const allDocs = await ctx.db.query("documents").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
    const matches = allDocs.filter(doc => {
      if (!doc.documentCode) return false;
      return doc.documentCode.startsWith(basePattern);
    });
    
    if (matches.length === 0) {
      return { isDuplicate: false, existingDocuments: [] };
    }
    
    // Sort by version to get the latest
    const sorted = matches.sort((a, b) => {
      const verA = a.version || "V1.0";
      const verB = b.version || "V1.0";
      return verB.localeCompare(verA);
    });
    
    return {
      isDuplicate: true,
      existingDocuments: sorted.map(doc => ({
        _id: doc._id,
        documentCode: doc.documentCode,
        version: doc.version,
        fileName: doc.fileName,
        uploadedAt: doc.uploadedAt,
      })),
      latestVersion: sorted[0].version || "V1.0",
    };
  },
});

// ============================================================================
// FILING OPERATIONS
// ============================================================================

// Mutation: File a single item to documents
export const fileItem = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    uploaderInitials: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    
    if (item.status === "filed") {
      throw new Error("Item already filed");
    }
    
    const batch = await ctx.db.get(item.batchId);
    if (!batch) {
      throw new Error("Batch not found");
    }
    
    // Validate required fields
    if (!item.summary || !item.fileTypeDetected || !item.category) {
      throw new Error("Item missing required analysis results");
    }
    
    // Check for unresolved duplicate
    if (item.isDuplicate && !item.versionType) {
      throw new Error("Duplicate detected - please select version type (minor/significant)");
    }

    // Atomic duplicate safety check: verify no other item with same fileName in this batch
    // was filed between the analysis-time check and now (prevents race condition)
    if (!item.isDuplicate && batch.clientId) {
      const recentDocs = await ctx.db
        .query("documents")
        .withIndex("by_client", (q: any) => q.eq("clientId", batch.clientId))
        .filter((q: any) => q.and(
          q.eq(q.field("fileName"), item.fileName),
          q.neq(q.field("isDeleted"), true)
        ))
        .first();
      if (recentDocs) {
        // A document with the same filename was filed between analysis and now
        // Mark this item as duplicate and set the reference
        await ctx.db.patch(args.itemId, {
          isDuplicate: true,
          duplicateOfDocumentId: recentDocs._id,
          updatedAt: new Date().toISOString(),
        });
        throw new Error(
          `Duplicate detected at filing time: "${item.fileName}" already exists. Please review and select version type.`
        );
      }
    }

    const now = new Date().toISOString();
    const scope = batch.scope || "client";

    // Determine folder info based on scope
    let folderId = item.targetFolder;
    let folderType: "client" | "project" | undefined = batch.projectId ? "project" : "client";

    if (scope === "internal") {
      folderId = batch.internalFolderId || item.targetFolder;
      folderType = undefined; // Internal folders don't use client/project folderType
    } else if (scope === "personal") {
      folderId = batch.personalFolderId || item.targetFolder;
      folderType = undefined; // Personal folders don't use client/project folderType
    }

    // Create the document
    const documentId = await ctx.db.insert("documents", {
      fileStorageId: item.fileStorageId,
      fileName: item.fileName,
      fileSize: item.fileSize,
      fileType: item.fileType,
      uploadedAt: now,
      summary: item.summary,
      fileTypeDetected: item.fileTypeDetected,
      category: item.category,
      reasoning: `Filed from bulk upload batch. ${item.isDuplicate ? `Version update (${item.versionType}).` : 'New document.'}`,
      confidence: item.confidence || 0.8,
      tokensUsed: 0, // Summary-only analysis doesn't track tokens
      clientId: batch.clientId,
      clientName: batch.clientName,
      projectId: batch.projectId,
      projectName: batch.projectName,
      documentCode: item.generatedDocumentCode,
      folderId,
      folderType,
      isInternal: item.isInternal ?? batch.isInternal,
      version: item.version || "V1.0",
      uploaderInitials: args.uploaderInitials,
      previousVersionId: item.duplicateOfDocumentId,
      extractedData: item.extractedData,
      // Pre-extracted intelligence fields from Stage 5.5 (for re-analysis and knowledge items)
      extractedIntelligence: item.extractedIntelligence,
      // Document analysis from Stage 1 Summary Agent (for rich metadata)
      documentAnalysis: item.documentAnalysis,
      // Classification reasoning from Stage 2
      classificationReasoning: item.classificationReasoning,
      // Full parsed text content for re-analysis
      textContent: item.textContent,
      // Document scope and ownership
      scope,
      ownerId: scope === "personal" ? batch.userId : undefined,
      status: "completed",
      savedAt: now,
    });

    // Update item status
    await ctx.db.patch(args.itemId, {
      status: "filed",
      documentId,
      updatedAt: now,
    });

    // Update batch filed count
    const allItems = await ctx.db
      .query("bulkUploadItems")
      .withIndex("by_batch", (q: any) => q.eq("batchId", item.batchId))
      .collect();
    
    const filedCount = allItems.filter(i => i.status === "filed").length + 1;
    const errorCount = allItems.filter(i => i.status === "error").length;
    
    let batchStatus: "review" | "completed" | "partial" = "review";
    if (filedCount + errorCount >= batch.totalFiles) {
      batchStatus = errorCount > 0 ? "partial" : "completed";
    }
    
    await ctx.db.patch(item.batchId, {
      filedFiles: filedCount,
      status: batchStatus,
      updatedAt: now,
    });
    
    // Create knowledge bank entry if client is set
    if (batch.clientId) {
      try {
        await ctx.db.insert("knowledgeBankEntries", {
          clientId: batch.clientId,
          projectId: batch.projectId,
          sourceType: "document",
          sourceId: documentId,
          entryType: "document_summary",
          title: `${item.fileName} - ${item.category}`,
          content: item.summary,
          keyPoints: item.summary.split(/[.!?]\s+/).filter(s => s.trim().length > 0).slice(0, 5),
          tags: [item.category, item.fileTypeDetected],
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        console.error("Failed to create knowledge bank entry:", error);
      }
    }

    // ============================================================================
    // EXTRACT INTELLIGENCE FROM DOCUMENT ANALYSIS
    // ============================================================================
    // Intelligence is extracted from documentAnalysis (from Stage 1 Summary Agent)
    // on confirmed filing - ensuring we only save intelligence from verified documents.
    const documentAnalysis = item.documentAnalysis as {
      keyAmounts?: string[];
      keyDates?: string[];
      keyTerms?: string[];
      entities?: {
        companies?: string[];
        people?: string[];
        locations?: string[];
        projects?: string[];
      };
      executiveSummary?: string;
      detailedSummary?: string;
    } | undefined;

    const hasProjectContext = !!batch.projectId;

    // Check for pre-extracted intelligence from Stage 5.5 (richer, more structured)
    const preExtractedFields: Array<{
      fieldPath: string; label: string; category: string; value: any;
      valueType: string; isCanonical: boolean; confidence: number;
      sourceText?: string; scope?: string;
    }> = (item.extractedIntelligence as any)?.fields || [];

    console.log(`[fileItem] Item "${item.fileName}" - documentAnalysis check: hasAnalysis=${!!documentAnalysis}, keyAmounts=${documentAnalysis?.keyAmounts?.length || 0}, keyDates=${documentAnalysis?.keyDates?.length || 0}, entities=${documentAnalysis?.entities ? 'yes' : 'no'}, preExtractedFields=${preExtractedFields.length}`);

    if (batch.clientId && (
      preExtractedFields.length > 0 ||
      (documentAnalysis && (
        (documentAnalysis.keyAmounts && documentAnalysis.keyAmounts.length > 0) ||
        (documentAnalysis.keyDates && documentAnalysis.keyDates.length > 0) ||
        documentAnalysis.entities ||
        documentAnalysis.executiveSummary
      ))
    )) {
      // Use pre-extracted intelligence from Stage 5.5 if available, fall back to documentAnalysis
      const analysisFields = documentAnalysis
        ? extractIntelligenceFromDocumentAnalysis(documentAnalysis, hasProjectContext, item.category)
        : [];

      // Merge: pre-extracted fields take priority (keyed by fieldPath)
      const fieldMap = new Map<string, ExtractedField>();
      for (const f of analysisFields) {
        fieldMap.set(f.fieldPath, f);
      }
      for (const f of preExtractedFields) {
        // Cast pre-extracted fields to match ExtractedField shape
        fieldMap.set(f.fieldPath, {
          ...f,
          valueType: f.valueType as FieldType,
          scope: (f.scope === 'project' || f.scope === 'client') ? f.scope : 'client',
        });
      }
      const extractedFields = Array.from(fieldMap.values());

      console.log(`[fileItem] 📊 Extracted ${extractedFields.length} intelligence fields from documentAnalysis for "${item.fileName}"`);

      // Track what we're adding for detailed logging
      let fieldsAdded = 0;
      let fieldsUpdated = 0;
      let fieldsSkipped = 0;
      const addedFields: string[] = [];

      for (const field of extractedFields) {
        try {
          // Determine target based on field scope (client vs project)
          const isProjectField = field.scope === 'project' && batch.projectId;
          const targetClientId = isProjectField ? undefined : batch.clientId;
          const targetProjectId = isProjectField ? batch.projectId : undefined;

          // Check if this field path already exists for this target
          let existingItem = null;
          if (targetProjectId) {
            existingItem = await ctx.db
              .query("knowledgeItems")
              .withIndex("by_project_field", (q: any) =>
                q.eq("projectId", targetProjectId).eq("fieldPath", field.fieldPath)
              )
              .filter((q: any) => q.eq(q.field("status"), "active"))
              .first();
          } else if (targetClientId) {
            existingItem = await ctx.db
              .query("knowledgeItems")
              .withIndex("by_client_field", (q: any) =>
                q.eq("clientId", targetClientId).eq("fieldPath", field.fieldPath)
              )
              .filter((q: any) => q.eq(q.field("status"), "active"))
              .first();
          }

          if (existingItem) {
            // If new value is different, check confidence - higher confidence wins
            if (
              JSON.stringify(existingItem.value) !== JSON.stringify(field.value) &&
              field.confidence > (existingItem.normalizationConfidence || 0.5)
            ) {
              // Create new item first
              const newItemId = await ctx.db.insert("knowledgeItems", {
                clientId: targetClientId,
                projectId: targetProjectId,
                fieldPath: field.fieldPath,
                isCanonical: field.isCanonical,
                category: field.category,
                label: field.label,
                value: field.value,
                valueType: field.valueType as any,
                status: "active",
                sourceType: "ai_extraction",
                sourceDocumentId: documentId,
                sourceDocumentName: item.fileName,
                sourceText: field.sourceText,
                normalizationConfidence: field.confidence,
                tags: ['general'],
                addedAt: now,
                updatedAt: now,
              });

              // Then archive old item and link to new one
              await ctx.db.patch(existingItem._id, {
                status: "superseded",
                supersededBy: newItemId,
                updatedAt: now,
              });

              // Log conflict for visibility
              try {
                await ctx.db.insert("intelligenceConflicts", {
                  clientId: targetClientId,
                  projectId: targetProjectId,
                  fieldPath: field.fieldPath,
                  category: field.category,
                  description: `${field.label}: "${JSON.stringify(existingItem.value).slice(0, 80)}" → "${JSON.stringify(field.value).slice(0, 80)}" from ${item.fileName}`,
                  relatedItemIds: [existingItem._id, newItemId],
                  status: "pending",
                  createdAt: now,
                  updatedAt: now,
                });
              } catch (conflictError) {
                console.error(`[fileItem] Failed to log conflict for ${field.fieldPath}:`, conflictError);
              }

              fieldsUpdated++;
              addedFields.push(`${field.label}: ${JSON.stringify(field.value).slice(0, 50)} (updated, ${field.scope})`);
            } else {
              // Same value or lower confidence - skip
              fieldsSkipped++;
            }
          } else {
            // Create new knowledge item
            await ctx.db.insert("knowledgeItems", {
              clientId: targetClientId,
              projectId: targetProjectId,
              fieldPath: field.fieldPath,
              isCanonical: field.isCanonical,
              category: field.category,
              label: field.label,
              value: field.value,
              valueType: field.valueType as any,
              status: "active",
              sourceType: "ai_extraction",
              sourceDocumentId: documentId,
              sourceDocumentName: item.fileName,
              sourceText: field.sourceText,
              normalizationConfidence: field.confidence,
              tags: ['general'],
              addedAt: now,
              updatedAt: now,
            });
            fieldsAdded++;
            addedFields.push(`${field.label}: ${JSON.stringify(field.value).slice(0, 50)} (${field.scope})`);
          }
        } catch (fieldError) {
          console.error(`[fileItem] Error saving field ${field.fieldPath}:`, fieldError);
          // Continue with other fields
        }
      }

      // Log summary for this document
      console.log(`[fileItem] ✅ Intelligence for "${item.fileName}": ${fieldsAdded} added, ${fieldsUpdated} updated, ${fieldsSkipped} skipped`);
      if (addedFields.length > 0) {
        console.log(`[fileItem]    Fields: ${addedFields.join(' | ')}`);
      }

      // Mark document as having intelligence extracted
      if (fieldsAdded > 0 || fieldsUpdated > 0) {
        await ctx.db.patch(documentId, { addedToIntelligence: true });
      }
    } else {
      // DEPRECATED: Intelligence extraction jobs are now handled within the bulk upload pipeline skills.
      // Legacy background job creation has been disabled.
      console.log(`[fileItem] Skipping legacy intelligence extraction for "${item.fileName}" — handled by upload pipeline`);
    }

    // === FILE USER NOTE AS INTELLIGENCE ===
    // If user added a note with addToIntelligence enabled, create a knowledge item
    if (item.userNote?.addToIntelligence && item.userNote.content.trim()) {
      try {
        const noteTarget = item.userNote.intelligenceTarget || (batch.projectId ? 'project' : 'client');
        const docTypeSlug = (item.fileTypeDetected || 'document')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_');

        await ctx.db.insert("knowledgeItems", {
          clientId: batch.clientId,
          projectId: noteTarget === 'project' ? batch.projectId : undefined,
          fieldPath: `notes.${docTypeSlug}_context`,
          isCanonical: false,
          category: "notes",
          label: `Note: ${item.fileName}`,
          value: item.userNote.content,
          valueType: "text",
          sourceType: "manual",
          sourceDocumentId: documentId,
          sourceDocumentName: item.fileName,
          status: "active",
          tags: ['general'],
          addedAt: now,
          updatedAt: now,
          addedBy: "user-review",
        });

        console.log(`[fileItem] 📝 Added user note to ${noteTarget} intelligence for "${item.fileName}": "${item.userNote.content.slice(0, 50)}${item.userNote.content.length > 50 ? '...' : ''}"`);
      } catch (error) {
        console.error("[fileItem] Failed to create intelligence from note:", error);
        // Don't fail the filing if intelligence creation fails
      }
    }

    // === CHECKLIST LINKING: Auto-link document to selected checklist items ===
    if (item.checklistItemIds && item.checklistItemIds.length > 0) {
      for (const checklistItemId of item.checklistItemIds) {
        try {
          // Check if link already exists
          const existingLink = await ctx.db
            .query("knowledgeChecklistDocumentLinks")
            .withIndex("by_checklist_item", (q: any) => q.eq("checklistItemId", checklistItemId))
            .filter((q: any) => q.eq(q.field("documentId"), documentId))
            .first();

          if (!existingLink) {
            // Check if this is the first link (will be primary)
            const existingLinks = await ctx.db
              .query("knowledgeChecklistDocumentLinks")
              .withIndex("by_checklist_item", (q: any) => q.eq("checklistItemId", checklistItemId))
              .collect();

            const isPrimary = existingLinks.length === 0;

            await ctx.db.insert("knowledgeChecklistDocumentLinks", {
              checklistItemId,
              documentId,
              documentName: item.fileName,
              linkedAt: now,
              linkedBy: undefined,
              isPrimary,
            });

            // If first link, mark checklist item as fulfilled
            if (isPrimary) {
              await ctx.db.patch(checklistItemId, {
                status: "fulfilled",
                suggestedDocumentId: undefined,
                suggestedDocumentName: undefined,
                suggestedConfidence: undefined,
                updatedAt: now,
              });
              console.log(`[fileItem] ✅ Checklist item fulfilled: ${checklistItemId}`);
            }
          }
        } catch (checklistError) {
          console.error(`[fileItem] Failed to link checklist item ${checklistItemId}:`, checklistError);
          // Don't fail the filing if checklist linking fails
        }
      }
    }

    // === FEEDBACK LOOP: Capture correction on final filing ===
    // Only capture if user made edits (userEdits has original values stored)
    const userEdits = item.userEdits || {};
    const hasUserEdits = userEdits.fileTypeDetected || userEdits.category ||
                         userEdits.isInternal || userEdits.targetFolder ||
                         userEdits.checklistItems;

    if (hasUserEdits) {
      // Build the AI's original prediction from stored original values
      const aiPrediction: {
        fileType: string;
        category: string;
        targetFolder: string;
        confidence: number;
        isInternal?: boolean;
        suggestedChecklistItems?: Array<{ itemId: string; itemName: string; confidence: number }>;
      } = {
        fileType: userEdits.originalFileTypeDetected ?? item.fileTypeDetected ?? "",
        category: userEdits.originalCategory ?? item.category ?? "",
        targetFolder: userEdits.originalTargetFolder ?? item.targetFolder ?? "",
        confidence: item.confidence || 0,
        isInternal: userEdits.originalIsInternal ?? item.isInternal,
      };

      // Add original AI-suggested checklist items if user changed them
      if (userEdits.checklistItems && userEdits.originalSuggestedChecklistItems) {
        aiPrediction.suggestedChecklistItems = userEdits.originalSuggestedChecklistItems.map((s: any) => ({
          itemId: String(s.itemId),
          itemName: s.itemName,
          confidence: s.confidence,
        }));
      }

      // Build user correction (what the user changed it to - the final filed values)
      const userCorrection: {
        fileType?: string;
        category?: string;
        targetFolder?: string;
        isInternal?: boolean;
        checklistItems?: Array<{ itemId: string; itemName: string }>;
      } = {};
      const correctedFields: string[] = [];

      if (userEdits.fileTypeDetected && aiPrediction.fileType !== item.fileTypeDetected) {
        userCorrection.fileType = item.fileTypeDetected;
        correctedFields.push("fileType");
      }
      if (userEdits.category && aiPrediction.category !== item.category) {
        userCorrection.category = item.category;
        correctedFields.push("category");
      }
      if (userEdits.targetFolder && aiPrediction.targetFolder !== item.targetFolder) {
        userCorrection.targetFolder = item.targetFolder;
        correctedFields.push("targetFolder");
      }
      if (userEdits.isInternal && aiPrediction.isInternal !== item.isInternal) {
        userCorrection.isInternal = item.isInternal;
        correctedFields.push("isInternal");
      }

      // Handle checklist corrections - look up item names for meaningful feedback
      if (userEdits.checklistItems) {
        const originalIds = new Set((userEdits.originalChecklistItemIds || []).map(String));
        const finalIds = new Set((item.checklistItemIds || []).map(String));

        // Check if there's actually a difference
        const idsChanged = originalIds.size !== finalIds.size ||
          [...originalIds].some(id => !finalIds.has(id)) ||
          [...finalIds].some(id => !originalIds.has(id));

        if (idsChanged) {
          // Look up names for the final checklist items
          const checklistItemsWithNames: Array<{ itemId: string; itemName: string }> = [];
          for (const itemId of item.checklistItemIds || []) {
            const checklistItem = await ctx.db.get(itemId);
            if (checklistItem) {
              checklistItemsWithNames.push({
                itemId: String(itemId),
                itemName: checklistItem.name, // 'name' field from knowledgeChecklistItems schema
              });
            }
          }
          userCorrection.checklistItems = checklistItemsWithNames;
          correctedFields.push("checklistItems");
        }
      }

      // Only insert if there's an actual difference (user didn't change back to original)
      if (correctedFields.length > 0) {
        console.log(`[Feedback Loop] Capturing correction on filing "${item.fileName}":`, {
          correctedFields,
          aiPrediction: {
            fileType: aiPrediction.fileType,
            category: aiPrediction.category,
            targetFolder: aiPrediction.targetFolder,
            checklistSuggestions: aiPrediction.suggestedChecklistItems?.map(s => s.itemName),
          },
          userCorrection: {
            ...userCorrection,
            checklistItems: userCorrection.checklistItems?.map(c => c.itemName),
          },
        });

        await ctx.db.insert("filingCorrections", {
          sourceItemId: args.itemId,
          fileName: item.fileName,
          fileNameNormalized: item.fileName
            .toLowerCase()
            .replace(/\.[^.]+$/, "")
            .replace(/[_\-\.]/g, " ")
            .replace(/\d+/g, "#")
            .replace(/\s+/g, " ")
            .trim(),
          contentHash: generateSimpleHash(item.summary || item.fileName),
          contentSummary: (item.summary || "").slice(0, 500),
          clientType: batch?.clientName ? inferClientType(batch.clientName) : undefined,
          aiPrediction,
          userCorrection,
          correctedFields,
          correctionWeight: 1.0,
          correctedBy: batch?.userId,
          createdAt: now,
          // NEW: Store document keywords and AI reasoning for learning
          documentKeywords: item.documentAnalysis?.keyTerms || [],
          aiReasoning: item.classificationReasoning || "",
        });

        console.log(`[Feedback Loop] ✓ Correction saved to filingCorrections table`);

        // Trigger keyword learning asynchronously if fileType was corrected
        if (userCorrection.fileType) {
          await ctx.scheduler.runAfter(0, internal.keywordLearning.processLearnedKeywords, {
            userFileType: userCorrection.fileType,
          });
          console.log(`[Feedback Loop] Triggered keyword learning for "${userCorrection.fileType}"`);
        }

        // Invalidate cache for this content hash
        const contentHash = generateSimpleHash(item.summary || item.fileName);
        const cacheEntries = await ctx.db
          .query("classificationCache")
          .withIndex("by_content_hash", (q) => q.eq("contentHash", contentHash))
          .collect();

        for (const entry of cacheEntries) {
          await ctx.db.patch(entry._id, {
            isValid: false,
            invalidatedAt: new Date().toISOString(),
            correctionCount: (entry.correctionCount || 0) + 1,
          });
          console.log(`[Feedback Loop] Cache invalidated for hash: ${contentHash}`);
        }
      }
    }

    // === MEETING EXTRACTION: Auto-extract meetings from meeting notes ===
    // When a document is classified as "Meeting Minutes" or similar, queue it for meeting extraction
    const meetingTypes = ['Meeting Minutes', 'Meeting Notes', 'Minutes'];
    const fileTypeLower = (item.fileTypeDetected || '').toLowerCase();
    const fileNameLower = (item.fileName || '').toLowerCase();
    const isMeetingDocument = meetingTypes.some(t => t.toLowerCase() === fileTypeLower) ||
      fileNameLower.includes('meeting') && (fileNameLower.includes('minutes') || fileNameLower.includes('notes'));

    if (isMeetingDocument && batch.clientId && item.fileStorageId) {
      try {
        // Check if job already exists for this document
        const existingJob = await ctx.db
          .query("meetingExtractionJobs")
          .withIndex("by_document", (q: any) => q.eq("documentId", documentId))
          .first();

        if (!existingJob) {
          await ctx.db.insert("meetingExtractionJobs", {
            documentId,
            clientId: batch.clientId,
            projectId: batch.projectId,
            fileStorageId: item.fileStorageId,
            documentName: item.fileName,
            status: "pending",
            attempts: 0,
            maxAttempts: 3,
            createdAt: now,
            updatedAt: now,
          });
          // Jobs are processed by /api/process-meeting-queue (handles PDFs properly)
          console.log(`[fileItem] 🗓️ Created meeting extraction job for "${item.fileName}"`);
        }
      } catch (error) {
        console.error("[fileItem] Failed to create meeting extraction job:", error);
        // Don't fail the filing if meeting job creation fails
      }
    }

    return { itemId: args.itemId, documentId };
  },
});

// Mutation: Create new projects for bulk upload filing
// Called BEFORE fileBatch — returns a mapping of suggestedName → projectId
export const createBulkUploadProjects = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    newProjects: v.array(v.object({
      suggestedName: v.string(),
      name: v.string(),
      projectShortcode: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Batch not found");
    if (!batch.clientId) throw new Error("Batch has no clientId");

    // Get client to determine clientType for folder templates and checklist init
    const client = await ctx.db.get(batch.clientId);
    if (!client) throw new Error("Client not found");
    const clientType = (client.type || "borrower").toLowerCase();

    // Validate intra-batch shortcode uniqueness (case-insensitive)
    const shortcodes = args.newProjects.map(p => p.projectShortcode.toUpperCase());
    const uniqueShortcodes = new Set(shortcodes);
    if (uniqueShortcodes.size !== shortcodes.length) {
      throw new Error("Duplicate shortcodes found within new projects");
    }

    // Look up folder template once (shared across all new projects)
    const templates = await ctx.db
      .query("folderTemplates")
      .withIndex("by_client_type_level", (q: any) =>
        q.eq("clientType", clientType).eq("level", "project")
      )
      .collect();
    const folderTemplate = templates.find((t: any) => t.isDefault) || templates[0];
    const folders = folderTemplate?.folders || BULK_UPLOAD_FALLBACK_FOLDERS;
    const sortedFolders = [...folders].sort((a: any, b: any) => a.order - b.order);

    const now = new Date().toISOString();
    const mapping: { suggestedName: string; projectId: Id<"projects"> }[] = [];

    for (const proj of args.newProjects) {
      const shortcode = proj.projectShortcode.toUpperCase().slice(0, 10);

      // Validate shortcode uniqueness vs DB
      const existing = await ctx.db
        .query("projects")
        .withIndex("by_shortcode", (q: any) => q.eq("projectShortcode", shortcode))
        .filter((q: any) => q.neq(q.field("isDeleted"), true))
        .first();
      if (existing) {
        throw new Error(`Project shortcode "${shortcode}" is already in use`);
      }

      // Insert project
      const projectId = await ctx.db.insert("projects", {
        name: proj.name,
        projectShortcode: shortcode,
        clientRoles: [{ clientId: batch.clientId, role: "borrower" }],
        status: "active",
        createdAt: now,
      });

      // Create project folders from template
      for (const folder of sortedFolders) {
        await ctx.db.insert("projectFolders", {
          projectId,
          folderType: folder.folderKey as any,
          name: folder.name,
          createdAt: now,
        });
      }

      // Initialize checklist INLINE (not via scheduler) so items exist immediately
      const checklistTemplate = await (async () => {
        // Try exact clientType match first
        const exactTemplates = await ctx.db
          .query("knowledgeRequirementTemplates")
          .withIndex("by_client_type", (q: any) => q.eq("clientType", clientType))
          .collect();
        const exact = exactTemplates.find((t: any) => t.level === "project");
        if (exact) return exact;
        // Fallback to borrower template
        if (clientType !== "borrower") {
          const borrowerTemplates = await ctx.db
            .query("knowledgeRequirementTemplates")
            .withIndex("by_client_type", (q: any) => q.eq("clientType", "borrower"))
            .collect();
          return borrowerTemplates.find((t: any) => t.level === "project") || null;
        }
        return null;
      })();

      const createdChecklistItems: Array<{ _id: Id<"knowledgeChecklistItems">; name: string; category: string; matchingDocumentTypes?: string[] }> = [];
      if (checklistTemplate) {
        for (const req of checklistTemplate.requirements) {
          const checklistItemId = await ctx.db.insert("knowledgeChecklistItems", {
            clientId: batch.clientId,
            projectId,
            requirementTemplateId: checklistTemplate._id,
            requirementId: req.id,
            name: req.name,
            category: req.category,
            phaseRequired: req.phaseRequired,
            priority: req.priority,
            description: req.description,
            matchingDocumentTypes: req.matchingDocumentTypes,
            order: req.order,
            status: "missing",
            isCustom: false,
            createdAt: now,
            updatedAt: now,
          });
          createdChecklistItems.push({
            _id: checklistItemId,
            name: req.name,
            category: req.category,
            matchingDocumentTypes: req.matchingDocumentTypes,
          });
        }
        console.log(`[createBulkUploadProjects] Created ${createdChecklistItems.length} checklist items for "${proj.name}"`);
      } else {
        console.log(`[createBulkUploadProjects] No checklist template found for clientType="${clientType}"`);
      }

      // Auto-match batch items to new checklist items using matchingDocumentTypes
      if (createdChecklistItems.length > 0) {
        const batchItems = await ctx.db
          .query("bulkUploadItems")
          .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
          .collect();

        // Only match items assigned to this project (by suggestedProjectName)
        const projectItems = batchItems.filter((item: any) =>
          item.suggestedProjectName &&
          item.suggestedProjectName.toLowerCase() === proj.suggestedName.toLowerCase()
        );

        for (const item of projectItems) {
          const fileType = (item as any).fileTypeDetected || '';
          const category = (item as any).category || '';
          const suggestions: Array<{ itemId: Id<"knowledgeChecklistItems">; itemName: string; category: string; confidence: number; reasoning: string }> = [];

          for (const checkItem of createdChecklistItems) {
            const matchingTypes = checkItem.matchingDocumentTypes || [];
            // Direct file type match
            if (matchingTypes.some(t => t.toLowerCase() === fileType.toLowerCase())) {
              suggestions.push({
                itemId: checkItem._id,
                itemName: checkItem.name,
                category: checkItem.category,
                confidence: 0.92,
                reasoning: `File type "${fileType}" matches checklist requirement`,
              });
            }
            // Category match (lower confidence)
            else if (checkItem.category.toLowerCase() === category.toLowerCase() && category) {
              suggestions.push({
                itemId: checkItem._id,
                itemName: checkItem.name,
                category: checkItem.category,
                confidence: 0.75,
                reasoning: `Category "${category}" matches checklist category`,
              });
            }
          }

          if (suggestions.length > 0) {
            // Sort by confidence and auto-check the top one if >= 0.7
            suggestions.sort((a, b) => b.confidence - a.confidence);
            const topSuggestion = suggestions[0];
            const autoCheckIds = topSuggestion.confidence >= 0.7 ? [topSuggestion.itemId] : [];

            await ctx.db.patch(item._id, {
              suggestedChecklistItems: suggestions,
              checklistItemIds: autoCheckIds.length > 0 ? autoCheckIds : undefined,
              updatedAt: now,
            });
            console.log(`[createBulkUploadProjects] Auto-matched "${(item as any).fileName}" → "${topSuggestion.itemName}" (${topSuggestion.confidence})`);
          }
        }
      }

      // Schedule intelligence initialization (keep async — not blocking)
      await ctx.scheduler.runAfter(0, api.intelligence.initializeProjectIntelligence, {
        projectId,
      });

      // Schedule project summary sync to client (keep async — not blocking)
      await ctx.scheduler.runAfter(0, api.intelligence.syncProjectSummariesToClient, {
        clientId: batch.clientId,
      });

      mapping.push({ suggestedName: proj.suggestedName, projectId });
      console.log(`[createBulkUploadProjects] Created project "${proj.name}" (${shortcode}) → ${projectId}`);
    }

    return mapping;
  },
});

// Mutation: File all items in a batch
export const fileBatch = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    uploaderInitials: v.string(),
    projectMapping: v.optional(v.array(v.object({
      suggestedName: v.string(),
      projectId: v.id("projects"),
    }))),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      throw new Error("Batch not found");
    }
    
    // Get all items ready for review
    const items = await ctx.db
      .query("bulkUploadItems")
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect();
    
    const readyItems = items.filter(i => i.status === "ready_for_review");
    
    // Check for unresolved duplicates
    const unresolvedDuplicates = readyItems.filter(i => i.isDuplicate && !i.versionType);
    if (unresolvedDuplicates.length > 0) {
      throw new Error(`${unresolvedDuplicates.length} duplicate(s) need version type selection before filing`);
    }
    
    const results: { itemId: Id<"bulkUploadItems">; documentId?: Id<"documents">; error?: string }[] = [];
    const now = new Date().toISOString();

    // Build project mapping from suggestedName → projectId (case-insensitive)
    const projectMap = new Map<string, Id<"projects">>();
    if (args.projectMapping) {
      for (const entry of args.projectMapping) {
        projectMap.set(entry.suggestedName.toLowerCase(), entry.projectId);
      }
    }

    for (const item of readyItems) {
      try {
        // Validate required fields
        if (!item.summary || !item.fileTypeDetected || !item.category) {
          results.push({ itemId: item._id, error: "Missing required analysis results" });
          continue;
        }
        
        // Determine folder info based on scope
        const scope = batch.scope || "client";
        // Resolve projectId: explicit assignment > project mapping from bulk creation > batch default
        let resolvedProjectId = item.itemProjectId;
        if (!resolvedProjectId && item.suggestedProjectName) {
          resolvedProjectId = projectMap.get(item.suggestedProjectName.toLowerCase());
        }
        const effectiveProjectId = resolvedProjectId || batch.projectId;
        let folderId = item.targetFolder;
        let folderType: "client" | "project" | undefined = effectiveProjectId ? "project" : "client";

        if (scope === "internal") {
          folderId = batch.internalFolderId || item.targetFolder;
          folderType = undefined; // Internal folders don't use client/project folderType
        } else if (scope === "personal") {
          folderId = batch.personalFolderId || item.targetFolder;
          folderType = undefined; // Personal folders don't use client/project folderType
        }

        // Create the document
        const documentId = await ctx.db.insert("documents", {
          fileStorageId: item.fileStorageId,
          fileName: item.fileName,
          fileSize: item.fileSize,
          fileType: item.fileType,
          uploadedAt: now,
          summary: item.summary,
          fileTypeDetected: item.fileTypeDetected,
          category: item.category,
          reasoning: `Filed from bulk upload batch. ${item.isDuplicate ? `Version update (${item.versionType}).` : 'New document.'}`,
          confidence: item.confidence || 0.8,
          tokensUsed: 0,
          clientId: batch.clientId,
          clientName: batch.clientName,
          projectId: effectiveProjectId,
          projectName: batch.projectName,
          documentCode: item.generatedDocumentCode,
          folderId,
          folderType,
          isInternal: item.isInternal ?? batch.isInternal,
          version: item.version || "V1.0",
          uploaderInitials: args.uploaderInitials,
          previousVersionId: item.duplicateOfDocumentId,
          extractedData: item.extractedData,
          // Document analysis from Stage 1 Summary Agent (for rich metadata)
          documentAnalysis: item.documentAnalysis,
          // Classification reasoning from Stage 2
          classificationReasoning: item.classificationReasoning,
          // Full parsed text content for re-analysis
          textContent: item.textContent,
          // Document scope and ownership
          scope,
          ownerId: scope === "personal" ? batch.userId : undefined,
          status: "completed",
          savedAt: now,
        });
        
        // Update item status
        await ctx.db.patch(item._id, {
          status: "filed",
          documentId,
          updatedAt: now,
        });
        
        // Link to checklist items if any were selected
        if (item.checklistItemIds && item.checklistItemIds.length > 0) {
          for (const checklistItemId of item.checklistItemIds) {
            // Verify checklist item still exists (may not if project is newly created
            // and checklist init hasn't completed yet)
            const checklistItem = await ctx.db.get(checklistItemId);
            if (!checklistItem) {
              console.warn(`[fileBatch] Checklist item ${checklistItemId} not found for item ${item._id} — skipping link`);
              continue;
            }

            // Check if link already exists
            const existingLink = await ctx.db
              .query("knowledgeChecklistDocumentLinks")
              .withIndex("by_checklist_item", (q: any) => q.eq("checklistItemId", checklistItemId))
              .filter((q: any) => q.eq(q.field("documentId"), documentId))
              .first();
            
            if (!existingLink) {
              // Check if this is the first link (will be primary)
              const existingLinks = await ctx.db
                .query("knowledgeChecklistDocumentLinks")
                .withIndex("by_checklist_item", (q: any) => q.eq("checklistItemId", checklistItemId))
                .collect();
              
              const isPrimary = existingLinks.length === 0;
              
              // Create the link
              await ctx.db.insert("knowledgeChecklistDocumentLinks", {
                checklistItemId,
                documentId,
                documentName: item.fileName,
                linkedAt: now,
                linkedBy: undefined, // Could pass userId if available
                isPrimary,
              });
              
              // If first link, mark checklist item as fulfilled
              if (isPrimary) {
                await ctx.db.patch(checklistItemId, {
                  status: "fulfilled",
                  suggestedDocumentId: undefined,
                  suggestedDocumentName: undefined,
                  suggestedConfidence: undefined,
                  updatedAt: now,
                });
              }
            }
          }
        }
        
        results.push({ itemId: item._id, documentId });
        
        // Create extraction job if extraction is enabled and we have a file storage ID
        // This runs AFTER the document is created, so projectId is properly set
        if (item.extractionEnabled && item.fileStorageId && effectiveProjectId) {
          const isSpreadsheet = /\.(xlsx?|csv)$/i.test(item.fileName);
          if (isSpreadsheet) {
            try {
              await ctx.db.insert("extractionJobs", {
                documentId,
                projectId: effectiveProjectId,
                clientId: batch.clientId,
                fileStorageId: item.fileStorageId,
                fileName: item.fileName,
                status: "pending",
                attempts: 0,
                maxAttempts: 3,
                createdAt: now,
                updatedAt: now,
              });
            } catch (jobError) {
              console.error("Failed to create extraction job:", jobError);
            }
          }
        }
        
        // Create knowledge bank entry
        if (batch.clientId) {
          try {
            await ctx.db.insert("knowledgeBankEntries", {
              clientId: batch.clientId,
              projectId: effectiveProjectId,
              sourceType: "document",
              sourceId: documentId,
              entryType: "document_summary",
              title: `${item.fileName} - ${item.category}`,
              content: item.summary,
              keyPoints: item.summary.split(/[.!?]\s+/).filter(s => s.trim().length > 0).slice(0, 5),
              tags: [item.category, item.fileTypeDetected],
              createdAt: now,
              updatedAt: now,
            });
          } catch (error) {
            console.error("Failed to create knowledge bank entry:", error);
          }
        }

        // ============================================================================
        // EXTRACT INTELLIGENCE FROM PRE-EXTRACTED OR DOCUMENT ANALYSIS
        // ============================================================================
        // V4 pipeline pre-extracts structured intelligence fields in Stage 5.5.
        // Falls back to documentAnalysis extraction for older pipeline results.
        const hasProjectContext = !!effectiveProjectId;

        // Check for pre-extracted intelligence from V4 pipeline
        const preExtracted = item.extractedIntelligence as {
          fields?: Array<{
            fieldPath: string;
            label: string;
            value: any;
            valueType: string;
            confidence: number;
            sourceText?: string;
            isCanonical?: boolean;
            scope: 'client' | 'project';
            templateTags?: string[];
            category?: string;
            originalLabel?: string;
            pageReference?: string;
          }>;
        } | undefined;

        // Use pre-extracted fields from V4 pipeline, or fall back to documentAnalysis parsing
        let extractedFields: Array<{
          fieldPath: string;
          label: string;
          value: any;
          valueType: string;
          isCanonical: boolean;
          confidence: number;
          sourceText?: string;
          scope: 'client' | 'project';
          category: string;
          templateTags?: string[];
        }>;

        if (preExtracted?.fields && preExtracted.fields.length > 0) {
          // V4 pipeline already extracted structured intelligence
          extractedFields = preExtracted.fields.map(f => ({
            fieldPath: f.fieldPath,
            label: f.label,
            value: f.value,
            valueType: f.valueType,
            isCanonical: f.isCanonical ?? f.fieldPath.startsWith('custom.') === false,
            confidence: f.confidence,
            sourceText: f.sourceText,
            scope: f.scope,
            category: f.fieldPath.split('.')[0],
            templateTags: f.templateTags || ['general'],
          }));
          console.log(`[fileBatch] 📊 Using ${extractedFields.length} pre-extracted intelligence fields for "${item.fileName}"`);
        } else {
          // Fall back to documentAnalysis extraction (old pipeline)
          const documentAnalysis = item.documentAnalysis as {
            keyAmounts?: string[];
            keyDates?: string[];
            keyTerms?: string[];
            entities?: {
              companies?: string[];
              people?: string[];
              locations?: string[];
              projects?: string[];
            };
            executiveSummary?: string;
            detailedSummary?: string;
          } | undefined;

          console.log(`[fileBatch] Item "${item.fileName}" - documentAnalysis check: hasAnalysis=${!!documentAnalysis}, keyAmounts=${documentAnalysis?.keyAmounts?.length || 0}, keyDates=${documentAnalysis?.keyDates?.length || 0}, entities=${documentAnalysis?.entities ? 'yes' : 'no'}`);

          if (documentAnalysis && (
            (documentAnalysis.keyAmounts && documentAnalysis.keyAmounts.length > 0) ||
            (documentAnalysis.keyDates && documentAnalysis.keyDates.length > 0) ||
            documentAnalysis.entities ||
            documentAnalysis.executiveSummary
          )) {
            extractedFields = extractIntelligenceFromDocumentAnalysis(
              documentAnalysis,
              hasProjectContext,
              item.category
            );
          } else {
            extractedFields = [];
          }
        }

        // === APPLY USER INTELLIGENCE EDITS ===
        const intellEdits = (item as any).intelligenceEdits as {
          skipIntelligence?: boolean;
          excludedFields?: string[];
          modified?: Array<{ fieldPath: string; newValue: string }>;
        } | undefined;

        if (intellEdits?.skipIntelligence) {
          console.log(`[fileBatch] ⏭️ Skipping intelligence for "${item.fileName}" — user disabled intelligence saving`);
          extractedFields = [];
        }

        if (intellEdits?.excludedFields && intellEdits.excludedFields.length > 0) {
          const excludeSet = new Set(intellEdits.excludedFields);
          const beforeCount = extractedFields.length;
          extractedFields = extractedFields.filter(f => !excludeSet.has(f.fieldPath));
          console.log(`[fileBatch] ✂️ Excluded ${beforeCount - extractedFields.length} fields for "${item.fileName}" per user edits`);
        }

        if (intellEdits?.modified && intellEdits.modified.length > 0) {
          const modMap = new Map(intellEdits.modified.map(m => [m.fieldPath, m]));
          for (const field of extractedFields) {
            const mod = modMap.get(field.fieldPath);
            if (mod) {
              field.value = mod.newValue;
            }
          }
        }

        if (extractedFields.length > 0) {

          console.log(`[fileBatch] 📊 Extracted ${extractedFields.length} intelligence fields from documentAnalysis for "${item.fileName}"`);

          // Track what we're adding for detailed logging
          let fieldsAdded = 0;
          let fieldsUpdated = 0;
          let fieldsSkipped = 0;
          const addedFields: string[] = [];

          for (const field of extractedFields) {
            try {
              // Determine target based on field scope (client vs project)
              const isProjectField = field.scope === 'project' && effectiveProjectId;
              const targetClientId = isProjectField ? undefined : batch.clientId;
              const targetProjectId = isProjectField ? effectiveProjectId : undefined;

              // Safety: skip if both target IDs are undefined (item would be orphaned)
              if (!targetClientId && !targetProjectId) {
                console.warn(`[fileBatch] Skipping field "${field.fieldPath}" — no targetClientId or targetProjectId (scope=${field.scope})`);
                fieldsSkipped++;
                continue;
              }

              // Check if this field path already exists for this target
              let existingItem = null;
              if (targetProjectId) {
                existingItem = await ctx.db
                  .query("knowledgeItems")
                  .withIndex("by_project_field", (q: any) =>
                    q.eq("projectId", targetProjectId).eq("fieldPath", field.fieldPath)
                  )
                  .filter((q: any) => q.eq(q.field("status"), "active"))
                  .first();
              } else if (targetClientId) {
                existingItem = await ctx.db
                  .query("knowledgeItems")
                  .withIndex("by_client_field", (q: any) =>
                    q.eq("clientId", targetClientId).eq("fieldPath", field.fieldPath)
                  )
                  .filter((q: any) => q.eq(q.field("status"), "active"))
                  .first();
              }

              if (existingItem) {
                // If new value is different, check confidence - higher confidence wins
                if (
                  JSON.stringify(existingItem.value) !== JSON.stringify(field.value) &&
                  field.confidence > (existingItem.normalizationConfidence || 0.5)
                ) {
                  // Create new item first
                  const newItemId = await ctx.db.insert("knowledgeItems", {
                    clientId: targetClientId,
                    projectId: targetProjectId,
                    fieldPath: field.fieldPath,
                    isCanonical: field.isCanonical,
                    category: field.category,
                    label: field.label,
                    value: field.value,
                    valueType: field.valueType as any,
                    status: "active",
                    sourceType: "ai_extraction",
                    sourceDocumentId: documentId,
                    sourceDocumentName: item.fileName,
                    sourceText: field.sourceText,
                    normalizationConfidence: field.confidence,
                    tags: field.templateTags || ['general'],
                    addedAt: now,
                    updatedAt: now,
                  });

                  // Then archive old item and link to new one
                  await ctx.db.patch(existingItem._id, {
                    status: "superseded",
                    supersededBy: newItemId,
                    updatedAt: now,
                  });

                  // Log conflict for visibility
                  try {
                    await ctx.db.insert("intelligenceConflicts", {
                      clientId: targetClientId,
                      projectId: targetProjectId,
                      fieldPath: field.fieldPath,
                      category: field.category,
                      description: `${field.label}: "${JSON.stringify(existingItem.value).slice(0, 80)}" → "${JSON.stringify(field.value).slice(0, 80)}" from ${item.fileName}`,
                      relatedItemIds: [existingItem._id, newItemId],
                      status: "pending",
                      createdAt: now,
                      updatedAt: now,
                    });
                  } catch (conflictError) {
                    console.error(`[fileBatch] Failed to log conflict for ${field.fieldPath}:`, conflictError);
                  }

                  fieldsUpdated++;
                  addedFields.push(`${field.label}: ${JSON.stringify(field.value).slice(0, 50)} (updated, ${field.scope})`);
                } else {
                  // Same value or lower confidence - skip
                  fieldsSkipped++;
                }
              } else {
                // Create new knowledge item
                await ctx.db.insert("knowledgeItems", {
                  clientId: targetClientId,
                  projectId: targetProjectId,
                  fieldPath: field.fieldPath,
                  isCanonical: field.isCanonical,
                  category: field.category,
                  label: field.label,
                  value: field.value,
                  valueType: field.valueType as any,
                  status: "active",
                  sourceType: "ai_extraction",
                  sourceDocumentId: documentId,
                  sourceDocumentName: item.fileName,
                  sourceText: field.sourceText,
                  normalizationConfidence: field.confidence,
                  tags: field.templateTags || ['general'],
                  addedAt: now,
                  updatedAt: now,
                });
                fieldsAdded++;
                addedFields.push(`${field.label}: ${JSON.stringify(field.value).slice(0, 50)} (${field.scope})`);
              }
            } catch (fieldError) {
              console.error(`[fileBatch] Error saving field ${field.fieldPath}:`, fieldError);
              // Continue with other fields
            }
          }

          // Log summary for this document
          console.log(`[fileBatch] ✅ Intelligence for "${item.fileName}": ${fieldsAdded} added, ${fieldsUpdated} updated, ${fieldsSkipped} skipped`);
          if (addedFields.length > 0) {
            console.log(`[fileBatch]    Fields: ${addedFields.join(' | ')}`);
          }
        } else {
          // DEPRECATED: Intelligence extraction jobs are now handled within the bulk upload pipeline skills.
          // Legacy background job creation has been disabled.
          console.log(`[fileBatch] Skipping legacy intelligence extraction for "${item.fileName}" — handled by upload pipeline`);
        }

        // === MEETING EXTRACTION: Auto-extract meetings from meeting notes ===
        // When a document is classified as "Meeting Minutes" or similar, queue it for meeting extraction
        const meetingTypes = ['Meeting Minutes', 'Meeting Notes', 'Minutes'];
        const fileTypeLower = (item.fileTypeDetected || '').toLowerCase();
        const fileNameLower = (item.fileName || '').toLowerCase();
        const isMeetingDocument = meetingTypes.some(t => t.toLowerCase() === fileTypeLower) ||
          fileNameLower.includes('meeting') && (fileNameLower.includes('minutes') || fileNameLower.includes('notes'));

        if (isMeetingDocument && batch.clientId && item.fileStorageId) {
          try {
            // Check if job already exists for this document
            const existingMeetingJob = await ctx.db
              .query("meetingExtractionJobs")
              .withIndex("by_document", (q: any) => q.eq("documentId", documentId))
              .first();

            if (!existingMeetingJob) {
              await ctx.db.insert("meetingExtractionJobs", {
                documentId,
                clientId: batch.clientId,
                projectId: effectiveProjectId,
                fileStorageId: item.fileStorageId,
                documentName: item.fileName,
                status: "pending",
                attempts: 0,
                maxAttempts: 3,
                createdAt: now,
                updatedAt: now,
              });
              // Jobs are processed by /api/process-meeting-queue (handles PDFs properly)
              console.log(`[fileBatch] 🗓️ Created meeting extraction job for "${item.fileName}"`);
            }
          } catch (error) {
            console.error("[fileBatch] Failed to create meeting extraction job:", error);
            // Don't fail the filing if meeting job creation fails
          }
        }

        // === FILE USER NOTE AS INTELLIGENCE ===
        // If user added a note with addToIntelligence enabled, create a knowledge item
        if (item.userNote?.addToIntelligence && item.userNote.content.trim()) {
          try {
            const noteTarget = item.userNote.intelligenceTarget || (effectiveProjectId ? 'project' : 'client');
            const docTypeSlug = (item.fileTypeDetected || 'document')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_');

            await ctx.db.insert("knowledgeItems", {
              clientId: batch.clientId,
              projectId: noteTarget === 'project' ? effectiveProjectId : undefined,
              fieldPath: `notes.${docTypeSlug}_context`,
              isCanonical: false,
              category: "notes",
              label: `Note: ${item.fileName}`,
              value: item.userNote.content,
              valueType: "text",
              sourceType: "manual",
              sourceDocumentId: documentId,
              sourceDocumentName: item.fileName,
              status: "active",
              tags: ['general'],
              addedAt: now,
              updatedAt: now,
              addedBy: "user-review",
            });

            console.log(`[fileBatch] 📝 Added user note to ${noteTarget} intelligence for "${item.fileName}": "${item.userNote.content.slice(0, 50)}${item.userNote.content.length > 50 ? '...' : ''}"`);
          } catch (error) {
            console.error("[fileBatch] Failed to create intelligence from note:", error);
            // Don't fail the filing if intelligence creation fails
          }
        }
      } catch (error) {
        results.push({
          itemId: item._id,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    // Update batch status
    const allItemsAfter = await ctx.db
      .query("bulkUploadItems")
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect();
    
    const filedCount = allItemsAfter.filter(i => i.status === "filed").length;
    const errorCount = allItemsAfter.filter(i => i.status === "error").length;
    const failedInBatch = results.filter(r => r.error).length;
    
    let batchStatus: "review" | "completed" | "partial" = "review";
    if (filedCount + errorCount + failedInBatch >= batch.totalFiles) {
      batchStatus = (errorCount + failedInBatch) > 0 ? "partial" : "completed";
    }
    
    await ctx.db.patch(args.batchId, {
      filedFiles: filedCount,
      errorFiles: errorCount + failedInBatch,
      status: batchStatus,
      updatedAt: now,
    });
    
    // Invalidate context cache
    if (batch.clientId) {
      // @ts-ignore - Convex type instantiation depth issue
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "client",
        contextId: batch.clientId,
      });
    }
    if (batch.projectId) {
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: batch.projectId,
      });
    }
    
    return {
      totalFiled: results.filter(r => r.documentId).length,
      totalErrors: results.filter(r => r.error).length,
      results,
    };
  },
});

// ============================================================================
// BATCH STATISTICS
// ============================================================================

// Query: Get batch statistics
export const getBatchStats = query({
  args: { batchId: v.id("bulkUploadBatches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      return null;
    }
    
    const items = await ctx.db
      .query("bulkUploadItems")
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect();
    
    const statusCounts: Record<string, number> = {
      pending: 0,
      processing: 0,
      ready_for_review: 0,
      filed: 0,
      error: 0,
      discarded: 0,
    };
    
    let duplicatesCount = 0;
    let extractionEnabledCount = 0;
    
    for (const item of items) {
      statusCounts[item.status]++;
      if (item.isDuplicate) duplicatesCount++;
      if (item.extractionEnabled) extractionEnabledCount++;
    }
    
    return {
      batch,
      items: items.length,
      statusCounts,
      duplicatesCount,
      extractionEnabledCount,
      unresolvedDuplicates: items.filter(i => i.isDuplicate && !i.versionType).length,
    };
  },
});
