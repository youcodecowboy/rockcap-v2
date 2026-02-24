import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { extractIntelligenceFromDocumentAnalysis } from "./intelligenceHelpers";

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
  },
  handler: async (ctx, args) => {
    const { itemId, suggestedChecklistItems, extractedIntelligence, documentAnalysis, classificationReasoning, ...updates } = args;

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
      // Document analysis from Stage 1 Summary Agent (for rich metadata)
      documentAnalysis: item.documentAnalysis,
      // Classification reasoning from Stage 2
      classificationReasoning: item.classificationReasoning,
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

    console.log(`[fileItem] Item "${item.fileName}" - documentAnalysis check: hasAnalysis=${!!documentAnalysis}, keyAmounts=${documentAnalysis?.keyAmounts?.length || 0}, keyDates=${documentAnalysis?.keyDates?.length || 0}, entities=${documentAnalysis?.entities ? 'yes' : 'no'}`);

    if (documentAnalysis && batch.clientId && (
      (documentAnalysis.keyAmounts && documentAnalysis.keyAmounts.length > 0) ||
      (documentAnalysis.keyDates && documentAnalysis.keyDates.length > 0) ||
      documentAnalysis.entities ||
      documentAnalysis.executiveSummary
    )) {
      // Extract intelligence from the confirmed document analysis
      const extractedFields = extractIntelligenceFromDocumentAnalysis(
        documentAnalysis,
        hasProjectContext,
        item.category
      );

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
                addedAt: now,
                updatedAt: now,
              });

              // Then archive old item and link to new one
              await ctx.db.patch(existingItem._id, {
                status: "superseded",
                supersededBy: newItemId,
                updatedAt: now,
              });
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
    } else if (item.fileStorageId) {
      // No documentAnalysis available - create background job for extraction
      // This is the fallback for legacy uploads or documents that couldn't be analyzed
      try {
        const jobId = await ctx.db.insert("intelligenceExtractionJobs", {
          documentId,
          projectId: batch.projectId,
          clientId: batch.clientId,
          documentName: item.fileName,
          documentType: item.fileTypeDetected,
          documentCategory: item.category,
          status: "pending",
          attempts: 0,
          maxAttempts: 3,
          createdAt: now,
          updatedAt: now,
        });
        console.log(`[fileItem] Created intelligence extraction job ${jobId} for "${item.fileName}" (no documentAnalysis available)`);
      } catch (error) {
        console.error("[fileItem] Failed to create intelligence extraction job:", error);
        // Don't fail the filing if intelligence job creation fails
      }
    } else {
      console.log(`[fileItem] No documentAnalysis or fileStorageId for "${item.fileName}" - skipping intelligence extraction`);
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
        
        // Determine folder info based on scope
        const scope = batch.scope || "client";
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
          tokensUsed: 0,
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
          // Document analysis from Stage 1 Summary Agent (for rich metadata)
          documentAnalysis: item.documentAnalysis,
          // Classification reasoning from Stage 2
          classificationReasoning: item.classificationReasoning,
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
        if (item.extractionEnabled && item.fileStorageId && batch.projectId) {
          const isSpreadsheet = /\.(xlsx?|csv)$/i.test(item.fileName);
          if (isSpreadsheet) {
            try {
              await ctx.db.insert("extractionJobs", {
                documentId,
                projectId: batch.projectId,
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
        // on confirmed filing - not pre-extracted during analysis.
        // This ensures we only save intelligence from documents the user has verified.
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

        console.log(`[fileBatch] Item "${item.fileName}" - documentAnalysis check: hasAnalysis=${!!documentAnalysis}, keyAmounts=${documentAnalysis?.keyAmounts?.length || 0}, keyDates=${documentAnalysis?.keyDates?.length || 0}, entities=${documentAnalysis?.entities ? 'yes' : 'no'}`);

        if (documentAnalysis && (
          (documentAnalysis.keyAmounts && documentAnalysis.keyAmounts.length > 0) ||
          (documentAnalysis.keyDates && documentAnalysis.keyDates.length > 0) ||
          documentAnalysis.entities ||
          documentAnalysis.executiveSummary
        )) {
          // Extract intelligence from the confirmed document analysis
          const extractedFields = extractIntelligenceFromDocumentAnalysis(
            documentAnalysis,
            hasProjectContext,
            item.category
          );

          console.log(`[fileBatch] 📊 Extracted ${extractedFields.length} intelligence fields from documentAnalysis for "${item.fileName}"`);

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
                    addedAt: now,
                    updatedAt: now,
                  });

                  // Then archive old item and link to new one
                  await ctx.db.patch(existingItem._id, {
                    status: "superseded",
                    supersededBy: newItemId,
                    updatedAt: now,
                  });
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
          // No documentAnalysis available - create background job for extraction
          // This is the fallback for legacy uploads or documents that couldn't be analyzed
          if (item.fileStorageId) {
            try {
              const jobId = await ctx.db.insert("intelligenceExtractionJobs", {
                documentId,
                projectId: batch.projectId,
                clientId: batch.clientId,
                documentName: item.fileName,
                documentType: item.fileTypeDetected,
                documentCategory: item.category,
                status: "pending",
                attempts: 0,
                maxAttempts: 3,
                createdAt: now,
                updatedAt: now,
              });
              console.log(`[fileBatch] Created intelligence extraction job ${jobId} for document "${item.fileName}" (no documentAnalysis available)`);
            } catch (error) {
              console.error("Failed to create intelligence extraction job:", error);
              // Don't fail the filing if intelligence job creation fails
            }
          } else {
            console.log(`[fileBatch] Skipping intelligence job for "${item.fileName}" - no fileStorageId`);
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
            const existingMeetingJob = await ctx.db
              .query("meetingExtractionJobs")
              .withIndex("by_document", (q: any) => q.eq("documentId", documentId))
              .first();

            if (!existingMeetingJob) {
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
