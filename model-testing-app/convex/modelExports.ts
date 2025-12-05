import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all exports for a project
 */
export const getExportsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const exports = await ctx.db
      .query("modelExports")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Sort by date descending
    return exports.sort(
      (a, b) => new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime()
    );
  },
});

/**
 * Get exports for a specific model run
 */
export const getExportsByModelRun = query({
  args: { modelRunId: v.id("modelRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("modelExports")
      .withIndex("by_model_run", (q) => q.eq("modelRunId", args.modelRunId))
      .collect();
  },
});

/**
 * Get a specific export's bill of materials
 */
export const getExportBillOfMaterials = query({
  args: { exportId: v.id("modelExports") },
  handler: async (ctx, args) => {
    const exportRecord = await ctx.db.get(args.exportId);
    if (!exportRecord) return null;
    
    return {
      export: {
        id: exportRecord._id,
        fileName: exportRecord.fileName,
        exportedAt: exportRecord.exportedAt,
        exportType: exportRecord.exportType,
      },
      billOfMaterials: exportRecord.billOfMaterials,
    };
  },
});

/**
 * Get export stats for a project
 */
export const getExportStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const exports = await ctx.db
      .query("modelExports")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    const byType: Record<string, number> = {};
    let totalManualOverrides = 0;
    
    for (const exp of exports) {
      byType[exp.exportType] = (byType[exp.exportType] || 0) + 1;
      totalManualOverrides += exp.billOfMaterials.totalManualOverrides;
    }
    
    return {
      totalExports: exports.length,
      byType,
      totalManualOverridesAcrossExports: totalManualOverrides,
      lastExportAt: exports.length > 0 
        ? exports.sort((a, b) => 
            new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime()
          )[0].exportedAt
        : null,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Record an export event with bill of materials
 */
export const recordExport = mutation({
  args: {
    projectId: v.id("projects"),
    modelRunId: v.optional(v.id("modelRuns")),
    snapshotId: v.optional(v.id("dataLibrarySnapshots")),
    templateId: v.optional(v.id("modelingTemplates")),
    templateDefinitionId: v.optional(v.id("templateDefinitions")),
    fileName: v.string(),
    exportType: v.union(
      v.literal("quick_export"),
      v.literal("full_model"),
      v.literal("data_only")
    ),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Build bill of materials from project data library
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    const activeItems = items.filter(item => !item.isDeleted);
    
    // Group items by source document
    const byDocument = new Map<string, {
      documentId: Id<"documents">;
      fileName: string;
      uploadedAt: string;
      itemsUsed: number;
    }>();
    
    for (const item of activeItems) {
      const docId = item.currentSourceDocumentId.toString();
      if (!byDocument.has(docId)) {
        // Get document info
        const doc = await ctx.db.get(item.currentSourceDocumentId);
        byDocument.set(docId, {
          documentId: item.currentSourceDocumentId,
          fileName: doc?.fileName || item.currentSourceDocumentName,
          uploadedAt: doc?.uploadedAt || now,
          itemsUsed: 0,
        });
      }
      byDocument.get(docId)!.itemsUsed++;
    }
    
    // Collect manual overrides
    const manualOverrides = activeItems
      .filter(item => item.lastUpdatedBy === "manual")
      .map(item => {
        // Find the original (non-manual) value
        const originalEntry = item.valueHistory.find(
          h => h.addedBy === "extraction"
        );
        
        return {
          itemCode: item.itemCode,
          originalName: item.originalName,
          originalValue: originalEntry?.value || null,
          overriddenValue: item.currentValue,
          overriddenBy: item.lastUpdatedByUserId,
          note: item.manualOverrideNote,
        };
      });
    
    const billOfMaterials = {
      sourceDocuments: Array.from(byDocument.values()),
      manualOverrides,
      totalItems: activeItems.length,
      totalManualOverrides: manualOverrides.length,
    };
    
    const exportId = await ctx.db.insert("modelExports", {
      projectId: args.projectId,
      modelRunId: args.modelRunId,
      snapshotId: args.snapshotId,
      templateId: args.templateId,
      templateDefinitionId: args.templateDefinitionId,
      exportedAt: now,
      exportedBy: args.userId,
      fileName: args.fileName,
      exportType: args.exportType,
      billOfMaterials,
    });
    
    return { exportId, billOfMaterials };
  },
});

/**
 * Record export with pre-built bill of materials (for when caller already has the data)
 */
export const recordExportWithBOM = mutation({
  args: {
    projectId: v.id("projects"),
    modelRunId: v.optional(v.id("modelRuns")),
    snapshotId: v.optional(v.id("dataLibrarySnapshots")),
    templateId: v.optional(v.id("modelingTemplates")),
    templateDefinitionId: v.optional(v.id("templateDefinitions")),
    fileName: v.string(),
    exportType: v.union(
      v.literal("quick_export"),
      v.literal("full_model"),
      v.literal("data_only")
    ),
    userId: v.optional(v.id("users")),
    billOfMaterials: v.object({
      sourceDocuments: v.array(v.object({
        documentId: v.id("documents"),
        fileName: v.string(),
        uploadedAt: v.string(),
        itemsUsed: v.number(),
      })),
      manualOverrides: v.array(v.object({
        itemCode: v.string(),
        originalName: v.string(),
        originalValue: v.any(),
        overriddenValue: v.any(),
        overriddenBy: v.optional(v.id("users")),
        note: v.optional(v.string()),
      })),
      totalItems: v.number(),
      totalManualOverrides: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const exportId = await ctx.db.insert("modelExports", {
      projectId: args.projectId,
      modelRunId: args.modelRunId,
      snapshotId: args.snapshotId,
      templateId: args.templateId,
      templateDefinitionId: args.templateDefinitionId,
      exportedAt: new Date().toISOString(),
      exportedBy: args.userId,
      fileName: args.fileName,
      exportType: args.exportType,
      billOfMaterials: args.billOfMaterials,
    });
    
    return { exportId };
  },
});

