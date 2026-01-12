import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

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
    clientId: v.id("clients"),
    clientName: v.string(),
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    projectShortcode: v.optional(v.string()),
    isInternal: v.boolean(),
    instructions: v.optional(v.string()),
    userId: v.id("users"),
    totalFiles: v.number(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    const batchId = await ctx.db.insert("bulkUploadBatches", {
      clientId: args.clientId,
      clientName: args.clientName,
      projectId: args.projectId,
      projectName: args.projectName,
      projectShortcode: args.projectShortcode,
      status: "uploading",
      totalFiles: args.totalFiles,
      processedFiles: 0,
      filedFiles: 0,
      isInternal: args.isInternal,
      instructions: args.instructions,
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
      b.status === "uploading" || 
      b.status === "processing" || 
      b.status === "review"
    );
  },
});

// Mutation: Update batch status
export const updateBatchStatus = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    status: v.optional(v.union(
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
  },
  handler: async (ctx, args) => {
    const { itemId, ...updates } = args;
    
    await ctx.db.patch(itemId, {
      ...updates,
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
  },
  handler: async (ctx, args) => {
    const { itemId, ...updates } = args;
    
    // Track what was edited
    const item = await ctx.db.get(itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    
    const userEdits = item.userEdits || {};
    if (updates.fileTypeDetected !== undefined) userEdits.fileTypeDetected = true;
    if (updates.category !== undefined) userEdits.category = true;
    if (updates.isInternal !== undefined) userEdits.isInternal = true;
    if (updates.targetFolder !== undefined) userEdits.targetFolder = true;
    
    // Clean undefined values
    const cleanUpdates: any = { userEdits, updatedAt: new Date().toISOString() };
    if (updates.fileTypeDetected !== undefined) cleanUpdates.fileTypeDetected = updates.fileTypeDetected;
    if (updates.category !== undefined) cleanUpdates.category = updates.category;
    if (updates.isInternal !== undefined) cleanUpdates.isInternal = updates.isInternal;
    if (updates.targetFolder !== undefined) cleanUpdates.targetFolder = updates.targetFolder;
    if (updates.generatedDocumentCode !== undefined) cleanUpdates.generatedDocumentCode = updates.generatedDocumentCode;
    if (updates.versionType !== undefined) cleanUpdates.versionType = updates.versionType;
    
    await ctx.db.patch(itemId, cleanUpdates);
    return itemId;
  },
});

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
    const allDocs = await ctx.db.query("documents").collect();
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
    
    const now = new Date().toISOString();
    
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
      folderId: item.targetFolder,
      folderType: batch.projectId ? "project" : "client",
      isInternal: item.isInternal ?? batch.isInternal,
      version: item.version || "V1.0",
      uploaderInitials: args.uploaderInitials,
      previousVersionId: item.duplicateOfDocumentId,
      extractedData: item.extractedData,
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
    
    return { itemId: args.itemId, documentId };
  },
});

// Mutation: File all items in a batch
export const fileBatch = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    uploaderInitials: v.string(),
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
    
    for (const item of readyItems) {
      try {
        // Validate required fields
        if (!item.summary || !item.fileTypeDetected || !item.category) {
          results.push({ itemId: item._id, error: "Missing required analysis results" });
          continue;
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
          projectId: batch.projectId,
          projectName: batch.projectName,
          documentCode: item.generatedDocumentCode,
          folderId: item.targetFolder,
          folderType: batch.projectId ? "project" : "client",
          isInternal: item.isInternal ?? batch.isInternal,
          version: item.version || "V1.0",
          uploaderInitials: args.uploaderInitials,
          previousVersionId: item.duplicateOfDocumentId,
          extractedData: item.extractedData,
          status: "completed",
          savedAt: now,
        });
        
        // Update item status
        await ctx.db.patch(item._id, {
          status: "filed",
          documentId,
          updatedAt: now,
        });
        
        results.push({ itemId: item._id, documentId });
        
        // Create knowledge bank entry
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
    
    const statusCounts = {
      pending: 0,
      processing: 0,
      ready_for_review: 0,
      filed: 0,
      error: 0,
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
