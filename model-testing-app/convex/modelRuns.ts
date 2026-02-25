import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Generate upload URL for model Excel file
export const generateModelUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Update a model run with file storage ID after upload
export const attachFileToModelRun = mutation({
  args: {
    runId: v.id("modelRuns"),
    fileStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      fileStorageId: args.fileStorageId,
    });
    return args.runId;
  },
});

// Get download URL for a model's Excel file
export const getModelFileUrl = query({
  args: {
    runId: v.id("modelRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.isDeleted || !run.fileStorageId) return null;
    return await ctx.storage.getUrl(run.fileStorageId);
  },
});

// Query: Get model runs by scenario
export const list = query({
  args: {
    scenarioId: v.id("scenarios"),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("modelRuns")
      .withIndex("by_scenario", (q: any) => q.eq("scenarioId", args.scenarioId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    
    // Sort by version descending (newest first)
    return runs.sort((a, b) => b.version - a.version);
  },
});

// Query: Get model run by ID
export const get = query({
  args: { id: v.id("modelRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run || run.isDeleted) return null;
    return run;
  },
});

// Query: Get latest run for a scenario
export const getLatest = query({
  args: {
    scenarioId: v.id("scenarios"),
    modelType: v.optional(v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom"),
      v.literal("other")
    )),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("modelRuns")
      .withIndex("by_scenario", (q: any) => q.eq("scenarioId", args.scenarioId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    
    let filtered = runs;
    if (args.modelType) {
      filtered = runs.filter(r => r.modelType === args.modelType);
    }
    
    if (filtered.length === 0) return null;
    
    // Sort by version descending and return latest
    return filtered.sort((a, b) => b.version - a.version)[0];
  },
});

// Query: Get all versions for a scenario
export const getVersions = query({
  args: {
    scenarioId: v.id("scenarios"),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("modelRuns")
      .withIndex("by_scenario", (q: any) => q.eq("scenarioId", args.scenarioId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    
    // Sort by version descending
    return runs.sort((a, b) => b.version - a.version);
  },
});

// Query: Get next version number for a project + model type
export const getNextVersion = query({
  args: {
    projectId: v.id("projects"),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom"),
      v.literal("other")
    ),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("modelRuns")
      .withIndex("by_project_modelType", (q: any) =>
        q.eq("projectId", args.projectId).eq("modelType", args.modelType)
      )
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    
    if (runs.length === 0) return 1;
    
    const maxVersion = Math.max(...runs.map(r => r.version));
    return maxVersion + 1;
  },
});

// Query: Get all versions for a project (across all scenarios)
export const getProjectVersions = query({
  args: {
    projectId: v.id("projects"),
    modelType: v.optional(v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom"),
      v.literal("other")
    )),
  },
  handler: async (ctx, args) => {
    let runs;
    if (args.modelType) {
      runs = await ctx.db
        .query("modelRuns")
        .withIndex("by_project_modelType", (q: any) =>
          q.eq("projectId", args.projectId).eq("modelType", args.modelType)
        )
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();
    } else {
      runs = await ctx.db
        .query("modelRuns")
        .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();
    }
    
    // Sort by version descending (newest first)
    return runs.sort((a, b) => b.version - a.version);
  },
});

// Mutation: Create new model run
export const create = mutation({
  args: {
    scenarioId: v.id("scenarios"),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom"),
      v.literal("other")
    ),
    version: v.number(),
    versionName: v.optional(v.string()),
    inputs: v.any(),
    outputs: v.optional(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("error")
    ),
    error: v.optional(v.string()),
    runBy: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const runId = await ctx.db.insert("modelRuns", {
      scenarioId: args.scenarioId,
      modelType: args.modelType,
      version: args.version,
      versionName: args.versionName,
      inputs: args.inputs,
      outputs: args.outputs,
      status: args.status,
      error: args.error,
      runAt: new Date().toISOString(),
      runBy: args.runBy,
      metadata: args.metadata,
    });
    return runId;
  },
});

// Mutation: Manually save a new version
export const saveVersion = mutation({
  args: {
    scenarioId: v.id("scenarios"),
    projectId: v.optional(v.id("projects")),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom"),
      v.literal("other")
    ),
    version: v.number(),
    versionName: v.optional(v.string()),
    inputs: v.any(),
    outputs: v.optional(v.any()),
    fileStorageId: v.optional(v.id("_storage")),
    runBy: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Auto-generate version name if not provided
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const autoVersionName = `v${args.version}-${args.modelType}-${date}`;
    
    const runId = await ctx.db.insert("modelRuns", {
      scenarioId: args.scenarioId,
      projectId: args.projectId,
      modelType: args.modelType,
      version: args.version,
      versionName: args.versionName || autoVersionName,
      inputs: args.inputs,
      outputs: args.outputs,
      fileStorageId: args.fileStorageId,
      status: "completed",
      runAt: new Date().toISOString(),
      runBy: args.runBy,
      metadata: args.metadata,
    });
    return runId;
  },
});

// Mutation: Save model with auto-versioning (simpler API)
export const saveModelVersion = mutation({
  args: {
    projectId: v.id("projects"),
    scenarioId: v.optional(v.id("scenarios")), // Optional - can save without scenario
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom"),
      v.literal("other")
    ),
    description: v.optional(v.string()),
    inputs: v.any(), // Full sheet structure
    fileStorageId: v.optional(v.id("_storage")),
    runBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Calculate next version number for this project + model type
    const existingRuns = await ctx.db
      .query("modelRuns")
      .withIndex("by_project_modelType", (q: any) =>
        q.eq("projectId", args.projectId).eq("modelType", args.modelType)
      )
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .collect();
    
    const nextVersion = existingRuns.length === 0 
      ? 1 
      : Math.max(...existingRuns.map(r => r.version)) + 1;
    
    // Generate version name
    const date = new Date().toISOString().split('T')[0];
    const versionName = `v${nextVersion}-${args.modelType}-${date}`;
    
    // If no scenario provided, create one to hold this model run
    let scenarioId = args.scenarioId;
    if (!scenarioId) {
      const now = new Date().toISOString();
      scenarioId = await ctx.db.insert("scenarios", {
        projectId: args.projectId,
        name: versionName,
        description: args.description,
        data: args.inputs, // Store the full sheet data in scenario too
        createdAt: now,
        updatedAt: now,
      });
    }
    
    const runId = await ctx.db.insert("modelRuns", {
      scenarioId,
      projectId: args.projectId,
      modelType: args.modelType,
      version: nextVersion,
      versionName,
      inputs: args.inputs,
      outputs: undefined,
      fileStorageId: args.fileStorageId,
      status: "completed",
      runAt: new Date().toISOString(),
      runBy: args.runBy,
      metadata: {
        description: args.description,
      },
    });
    
    return { runId, scenarioId, version: nextVersion, versionName };
  },
});

// Mutation: Save model with data library snapshot and provenance tracking
export const saveModelWithSnapshot = mutation({
  args: {
    projectId: v.id("projects"),
    scenarioId: v.optional(v.id("scenarios")),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom"),
      v.literal("other")
    ),
    description: v.optional(v.string()),
    inputs: v.any(),
    fileStorageId: v.optional(v.id("_storage")),
    runBy: v.optional(v.id("users")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Get project data library items
    const libraryItems = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    const activeItems = libraryItems.filter(item => !item.isDeleted);
    
    // Collect unique source document IDs
    const sourceDocIds = new Set<string>();
    for (const item of activeItems) {
      sourceDocIds.add(item.currentSourceDocumentId);
    }
    
    // Calculate next version number
    const existingRuns = await ctx.db
      .query("modelRuns")
      .withIndex("by_project_modelType", (q: any) =>
        q.eq("projectId", args.projectId).eq("modelType", args.modelType)
      )
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .collect();

    const nextVersion = existingRuns.length === 0
      ? 1
      : Math.max(...existingRuns.map(r => r.version)) + 1;

    const date = now.split('T')[0];
    const versionName = `v${nextVersion}-${args.modelType}-${date}`;
    
    // Create scenario if not provided
    let scenarioId = args.scenarioId;
    if (!scenarioId) {
      scenarioId = await ctx.db.insert("scenarios", {
        projectId: args.projectId,
        name: versionName,
        description: args.description,
        data: args.inputs,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    // Create the model run first
    const runId = await ctx.db.insert("modelRuns", {
      scenarioId,
      projectId: args.projectId,
      modelType: args.modelType,
      version: nextVersion,
      versionName,
      inputs: args.inputs,
      outputs: undefined,
      fileStorageId: args.fileStorageId,
      status: "completed",
      runAt: now,
      runBy: args.runBy,
      sourceDocumentIds: Array.from(sourceDocIds) as any[],
      metadata: {
        description: args.description,
      },
    });
    
    // Create data library snapshot linked to this model run
    const snapshotItems = activeItems.map(item => ({
      itemCode: item.itemCode,
      category: item.category,
      originalName: item.originalName,
      value: item.currentValue,
      valueNormalized: item.currentValueNormalized,
      sourceDocumentId: item.currentSourceDocumentId,
      sourceDocumentName: item.currentSourceDocumentName,
    }));
    
    const snapshotId = await ctx.db.insert("dataLibrarySnapshots", {
      projectId: args.projectId,
      createdAt: now,
      createdBy: args.userId,
      reason: "model_run",
      items: snapshotItems,
      sourceDocumentIds: Array.from(sourceDocIds) as any[],
      itemCount: activeItems.length,
      documentCount: sourceDocIds.size,
      modelRunId: runId,
      description: `Snapshot for ${versionName}`,
    });
    
    // Update model run with snapshot reference
    await ctx.db.patch(runId, {
      dataLibrarySnapshotId: snapshotId,
    });
    
    // Build bill of materials
    const billOfMaterials = {
      sourceDocuments: [] as Array<{
        documentId: string;
        fileName: string;
        uploadedAt: string;
        itemsUsed: number;
      }>,
      manualOverrides: [] as Array<{
        itemCode: string;
        originalName: string;
        originalValue: any;
        overriddenValue: any;
      }>,
      totalItems: activeItems.length,
      totalManualOverrides: 0,
    };
    
    // Group items by source document
    const byDoc = new Map<string, { docId: Id<"documents">; count: number; sourceName: string }>();
    for (const item of activeItems) {
      const docIdStr = item.currentSourceDocumentId.toString();
      if (!byDoc.has(docIdStr)) {
        byDoc.set(docIdStr, { 
          docId: item.currentSourceDocumentId, 
          count: 0, 
          sourceName: item.currentSourceDocumentName 
        });
      }
      byDoc.get(docIdStr)!.count++;
      
      // Track manual overrides
      if (item.lastUpdatedBy === 'manual') {
        const originalEntry = item.valueHistory.find(h => h.addedBy === 'extraction');
        billOfMaterials.manualOverrides.push({
          itemCode: item.itemCode,
          originalName: item.originalName,
          originalValue: originalEntry?.value || null,
          overriddenValue: item.currentValue,
        });
        billOfMaterials.totalManualOverrides++;
      }
    }
    
    // Get document details
    for (const [, { docId, count, sourceName }] of byDoc) {
      const doc = await ctx.db.get(docId);
      billOfMaterials.sourceDocuments.push({
        documentId: docId.toString(),
        fileName: doc?.fileName || sourceName,
        uploadedAt: doc?.uploadedAt || now,
        itemsUsed: count,
      });
    }
    
    // Update model run with bill of materials
    await ctx.db.patch(runId, {
      billOfMaterials,
    });
    
    return { 
      runId, 
      scenarioId, 
      snapshotId,
      version: nextVersion, 
      versionName,
      libraryItemsCount: activeItems.length,
      sourceDocumentsCount: sourceDocIds.size,
    };
  },
});

