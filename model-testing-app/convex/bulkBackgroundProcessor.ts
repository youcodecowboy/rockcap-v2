import { v } from "convex/values";
import { mutation, internalMutation, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================================================
// BULK BACKGROUND PROCESSOR
// Handles server-side processing for large bulk uploads (>5 files)
// ============================================================================

const ESTIMATED_SECONDS_PER_FILE = 20;

// ============================================================================
// PUBLIC MUTATIONS
// ============================================================================

/**
 * Start background processing for a batch
 * Called by client after files are uploaded to storage
 */
export const startBackgroundProcessing = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    baseUrl: v.string(), // App base URL for API calls
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      throw new Error("Batch not found");
    }

    if (batch.status !== "uploading") {
      throw new Error(`Cannot start processing batch with status: ${batch.status}`);
    }

    const now = new Date();
    const estimatedMs = batch.totalFiles * ESTIMATED_SECONDS_PER_FILE * 1000;
    const estimatedCompletionTime = new Date(now.getTime() + estimatedMs);

    // Update batch with background processing metadata
    await ctx.db.patch(args.batchId, {
      processingMode: "background",
      status: "processing",
      estimatedCompletionTime: estimatedCompletionTime.toISOString(),
      startedProcessingAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    // Schedule the first item processing
    // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
    await ctx.scheduler.runAfter(0, internal.bulkBackgroundProcessor.processNextItem, {
      batchId: args.batchId,
      baseUrl: args.baseUrl,
    });

    return {
      batchId: args.batchId,
      estimatedCompletionTime: estimatedCompletionTime.toISOString(),
      estimatedMinutes: Math.ceil(estimatedMs / 60000),
    };
  },
});

// ============================================================================
// INTERNAL MUTATIONS (called by actions)
// ============================================================================

/**
 * Get the next pending item for a batch
 */
export const getNextPendingItem = internalMutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("bulkUploadItems")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (!item) {
      return null;
    }

    // Get batch info for context
    const batch = await ctx.db.get(args.batchId);

    return {
      item,
      batch,
    };
  },
});

/**
 * Mark an item as processing
 */
export const markItemProcessing = internalMutation({
  args: {
    itemId: v.id("bulkUploadItems"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.itemId, {
      status: "processing",
      updatedAt: now,
    });
  },
});

/**
 * Update item with analysis results
 */
export const updateItemWithResults = internalMutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    batchId: v.id("bulkUploadBatches"),
    summary: v.string(),
    fileTypeDetected: v.string(),
    category: v.string(),
    targetFolder: v.optional(v.string()),
    confidence: v.number(),
    generatedDocumentCode: v.optional(v.string()),
    version: v.optional(v.string()),
    isDuplicate: v.optional(v.boolean()),
    duplicateOfDocumentId: v.optional(v.id("documents")),
    suggestedChecklistItems: v.optional(v.any()),
    extractedIntelligence: v.optional(v.any()),
    documentAnalysis: v.optional(v.any()),
    classificationReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Update item with analysis results
    await ctx.db.patch(args.itemId, {
      status: "ready_for_review",
      summary: args.summary,
      fileTypeDetected: args.fileTypeDetected,
      category: args.category,
      targetFolder: args.targetFolder,
      confidence: args.confidence,
      generatedDocumentCode: args.generatedDocumentCode,
      version: args.version,
      isDuplicate: args.isDuplicate,
      duplicateOfDocumentId: args.duplicateOfDocumentId,
      suggestedChecklistItems: args.suggestedChecklistItems,
      extractedIntelligence: args.extractedIntelligence,
      documentAnalysis: args.documentAnalysis,
      classificationReasoning: args.classificationReasoning,
      updatedAt: now,
    });

    // Update batch progress
    const batch = await ctx.db.get(args.batchId);
    if (batch) {
      const processedFiles = (batch.processedFiles || 0) + 1;

      // Check if all items are done
      const allItems = await ctx.db
        .query("bulkUploadItems")
        .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
        .collect();

      const pendingCount = allItems.filter(i => i.status === "pending" || i.status === "processing").length;
      const newStatus = pendingCount === 0 ? "review" : "processing";

      await ctx.db.patch(args.batchId, {
        processedFiles,
        status: newStatus,
        updatedAt: now,
      });
    }
  },
});

/**
 * Mark item as failed
 */
export const markItemFailed = internalMutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    batchId: v.id("bulkUploadBatches"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    await ctx.db.patch(args.itemId, {
      status: "error",
      updatedAt: now,
    });

    // Update batch error count
    const batch = await ctx.db.get(args.batchId);
    if (batch) {
      const errorFiles = (batch.errorFiles || 0) + 1;
      const processedFiles = (batch.processedFiles || 0) + 1;

      // Check if all items are done
      const allItems = await ctx.db
        .query("bulkUploadItems")
        .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
        .collect();

      const pendingCount = allItems.filter(i => i.status === "pending" || i.status === "processing").length;
      const newStatus = pendingCount === 0 ? "review" : "processing";

      await ctx.db.patch(args.batchId, {
        processedFiles,
        errorFiles,
        status: newStatus,
        updatedAt: now,
      });
    }

    console.error(`[Background Processor] Item ${args.itemId} failed: ${args.error}`);
  },
});

/**
 * Complete batch processing and send notification
 */
export const completeBatch = internalMutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) return;

    const now = new Date().toISOString();

    // Count final stats
    const allItems = await ctx.db
      .query("bulkUploadItems")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();

    const processedCount = allItems.filter(i => i.status === "ready_for_review").length;
    const errorCount = allItems.filter(i => i.status === "error").length;

    // Determine final status
    const finalStatus = errorCount > 0 && processedCount === 0 ? "partial" : "review";

    // Update batch
    await ctx.db.patch(args.batchId, {
      status: finalStatus,
      processedFiles: processedCount,
      errorFiles: errorCount,
      completedProcessingAt: now,
      notificationSent: true,
      updatedAt: now,
    });

    // Create notification for user
    const notificationMessage = errorCount > 0
      ? `${processedCount} of ${batch.totalFiles} files ready for review (${errorCount} errors)`
      : `${processedCount} files ready for review`;

    const clientName = batch.clientName || batch.internalFolderName || batch.personalFolderName || "Documents";

    await ctx.db.insert("notifications", {
      userId: batch.userId,
      type: "file_upload",
      title: "Bulk Upload Complete",
      message: `${clientName}: ${notificationMessage}`,
      relatedId: args.batchId,
      isRead: false,
      createdAt: now,
    });

    // Invalidate context cache if applicable
    if (batch.clientId) {
      // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "client",
        contextId: batch.clientId,
      });
    }
    if (batch.projectId) {
      // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: batch.projectId,
      });
    }

    console.log(`[Background Processor] Batch ${args.batchId} completed: ${processedCount} processed, ${errorCount} errors`);
  },
});

// ============================================================================
// INTERNAL ACTION (makes HTTP calls)
// ============================================================================

/**
 * Process the next pending item in the batch
 * This is an action because it makes HTTP calls to /api/bulk-analyze
 */
export const processNextItem = internalAction({
  args: {
    batchId: v.id("bulkUploadBatches"),
    baseUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // Get next pending item
    const result = await ctx.runMutation(internal.bulkBackgroundProcessor.getNextPendingItem, {
      batchId: args.batchId,
    });

    if (!result || !result.item) {
      // No more items - complete the batch
      await ctx.runMutation(internal.bulkBackgroundProcessor.completeBatch, {
        batchId: args.batchId,
      });
      return;
    }

    const { item, batch } = result;

    // Mark item as processing
    await ctx.runMutation(internal.bulkBackgroundProcessor.markItemProcessing, {
      itemId: item._id,
    });

    try {
      // Get file URL from storage
      if (!item.fileStorageId) {
        throw new Error("Item has no fileStorageId");
      }

      const fileUrl = await ctx.storage.getUrl(item.fileStorageId);
      if (!fileUrl) {
        throw new Error("Could not get file URL from storage");
      }

      // Fetch the file content
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to fetch file: ${fileResponse.status}`);
      }

      const fileBlob = await fileResponse.blob();

      // Create FormData for the V4 API call
      const formData = new FormData();
      formData.append("file", fileBlob, item.fileName);

      // Pass rich metadata to V4 pipeline
      const metadata: Record<string, any> = {};
      if (batch?.clientName) {
        metadata.clientName = batch.clientName;
        metadata.clientContext = { clientName: batch.clientName };
      }
      if (batch?.projectShortcode) {
        metadata.projectShortcode = batch.projectShortcode;
      }
      if (batch?.isInternal) {
        metadata.isInternal = batch.isInternal;
      }
      if (batch?.instructions) {
        metadata.instructions = batch.instructions;
      }
      formData.append("metadata", JSON.stringify(metadata));

      // Call the V4 analyze API with internal authentication
      const internalSecret = process.env.CONVEX_INTERNAL_SECRET;
      const analyzeResponse = await fetch(`${args.baseUrl}/api/v4-analyze`, {
        method: "POST",
        headers: {
          ...(internalSecret && { "x-convex-internal-secret": internalSecret }),
        },
        body: formData,
      });

      if (!analyzeResponse.ok) {
        const errorText = await analyzeResponse.text();
        throw new Error(`V4 Analysis API error ${analyzeResponse.status}: ${errorText}`);
      }

      const v4Data = await analyzeResponse.json();

      if (!v4Data.success || !v4Data.documents || v4Data.documents.length === 0) {
        const errorMsg = v4Data.errors?.[0]?.error || "V4 analysis returned no results";
        throw new Error(errorMsg);
      }

      // Map V4 response to expected format
      const analysisData = {
        result: {
          summary: v4Data.documents[0].summary || "Analysis complete",
          fileType: v4Data.documents[0].fileType || "Unknown",
          category: v4Data.documents[0].category || "Other",
          suggestedFolder: v4Data.documents[0].suggestedFolder,
          confidence: v4Data.documents[0].confidence || 0.5,
          typeAbbreviation: v4Data.documents[0].typeAbbreviation,
          generatedDocumentCode: v4Data.documents[0].generatedDocumentCode,
          suggestedChecklistItems: undefined,
        },
        extractedIntelligence: v4Data.documents[0].extractedData ? { fields: [], insights: v4Data.documents[0].extractedData } : undefined,
        documentAnalysis: undefined,
        classificationReasoning: undefined,
      };

      console.log(`[Background Processor] V4 result: ${analysisData.result.fileType} (${analysisData.result.confidence}% confidence, mock=${v4Data.isMock})`);

      // Check for duplicates if this is a client scope batch
      let isDuplicate = false;
      let duplicateOfDocumentId: Id<"documents"> | undefined;

      if (batch?.clientId && batch.scope === "client") {
        try {
          // Use the API endpoint for duplicate checking (same as client-side)
          const params = new URLSearchParams({
            originalFileName: item.fileName,
            clientId: batch.clientId,
          });
          if (batch.projectId) {
            params.append("projectId", batch.projectId);
          }
          const dupResponse = await fetch(`${args.baseUrl}/api/check-duplicates?${params.toString()}`);
          if (dupResponse.ok) {
            const duplicateResult = await dupResponse.json();
            if (duplicateResult?.isDuplicate && duplicateResult.existingDocuments?.length > 0) {
              isDuplicate = true;
              duplicateOfDocumentId = duplicateResult.existingDocuments[0]._id;
            }
          }
        } catch (e) {
          console.warn("[Background Processor] Duplicate check failed:", e);
        }
      }

      // Update item with results
      await ctx.runMutation(internal.bulkBackgroundProcessor.updateItemWithResults, {
        itemId: item._id,
        batchId: args.batchId,
        summary: analysisData.result?.summary || "Analysis complete",
        fileTypeDetected: analysisData.result?.fileType || "Unknown",
        category: analysisData.result?.category || "Other",
        targetFolder: analysisData.result?.suggestedFolder,
        confidence: analysisData.result?.confidence || 0.5,
        generatedDocumentCode: analysisData.result?.typeAbbreviation,
        version: "V1.0",
        isDuplicate,
        duplicateOfDocumentId,
        suggestedChecklistItems: analysisData.result?.suggestedChecklistItems,
        extractedIntelligence: analysisData.extractedIntelligence,
        documentAnalysis: analysisData.documentAnalysis,
        classificationReasoning: analysisData.classificationReasoning,
      });

      console.log(`[Background Processor] Processed item ${item._id}: ${item.fileName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.bulkBackgroundProcessor.markItemFailed, {
        itemId: item._id,
        batchId: args.batchId,
        error: errorMessage,
      });
    }

    // Schedule next item (500ms delay to avoid overwhelming the API)
    // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
    await ctx.scheduler.runAfter(500, internal.bulkBackgroundProcessor.processNextItem, {
      batchId: args.batchId,
      baseUrl: args.baseUrl,
    });
  },
});
