import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all snapshots for a project
 */
export const getSnapshotsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const snapshots = await ctx.db
      .query("dataLibrarySnapshots")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Sort by created date descending
    return snapshots.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
});

/**
 * Get a specific snapshot
 */
export const getSnapshot = query({
  args: { snapshotId: v.id("dataLibrarySnapshots") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.snapshotId);
  },
});

/**
 * Get snapshot by model run
 */
export const getSnapshotByModelRun = query({
  args: { modelRunId: v.id("modelRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dataLibrarySnapshots")
      .withIndex("by_model_run", (q) => q.eq("modelRunId", args.modelRunId))
      .first();
  },
});

/**
 * Compare two snapshots - returns diff
 */
export const compareSnapshots = query({
  args: {
    snapshotId1: v.id("dataLibrarySnapshots"),
    snapshotId2: v.id("dataLibrarySnapshots"),
  },
  handler: async (ctx, args) => {
    const snapshot1 = await ctx.db.get(args.snapshotId1);
    const snapshot2 = await ctx.db.get(args.snapshotId2);
    
    if (!snapshot1 || !snapshot2) {
      throw new Error("Snapshot not found");
    }
    
    // Build lookup maps
    const items1Map = new Map(snapshot1.items.map(i => [i.itemCode, i]));
    const items2Map = new Map(snapshot2.items.map(i => [i.itemCode, i]));
    
    const added: typeof snapshot1.items = [];
    const removed: typeof snapshot1.items = [];
    const changed: Array<{
      itemCode: string;
      category: string;
      originalName: string;
      oldValue: any;
      newValue: any;
      oldSource: string;
      newSource: string;
    }> = [];
    
    // Find items in snapshot2 but not in snapshot1 (added)
    for (const [code, item] of items2Map) {
      if (!items1Map.has(code)) {
        added.push(item);
      }
    }
    
    // Find items in snapshot1 but not in snapshot2 (removed)
    for (const [code, item] of items1Map) {
      if (!items2Map.has(code)) {
        removed.push(item);
      }
    }
    
    // Find changed values
    for (const [code, item1] of items1Map) {
      const item2 = items2Map.get(code);
      if (item2 && item1.valueNormalized !== item2.valueNormalized) {
        changed.push({
          itemCode: code,
          category: item1.category,
          originalName: item2.originalName,
          oldValue: item1.value,
          newValue: item2.value,
          oldSource: item1.sourceDocumentName,
          newSource: item2.sourceDocumentName,
        });
      }
    }
    
    return {
      snapshot1: {
        id: snapshot1._id,
        createdAt: snapshot1.createdAt,
        itemCount: snapshot1.itemCount,
      },
      snapshot2: {
        id: snapshot2._id,
        createdAt: snapshot2.createdAt,
        itemCount: snapshot2.itemCount,
      },
      added,
      removed,
      changed,
      summary: {
        addedCount: added.length,
        removedCount: removed.length,
        changedCount: changed.length,
      },
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a point-in-time snapshot of the project data library
 */
export const createSnapshot = mutation({
  args: {
    projectId: v.id("projects"),
    reason: v.union(
      v.literal("model_run"),
      v.literal("manual_save"),
      v.literal("pre_revert_backup"),
      v.literal("pre_delete_backup")
    ),
    description: v.optional(v.string()),
    modelRunId: v.optional(v.id("modelRuns")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get all current (non-deleted) items
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    const activeItems = items.filter(item => !item.isDeleted);
    
    // Collect unique source document IDs
    const sourceDocIds = new Set<Id<"documents">>();
    for (const item of activeItems) {
      sourceDocIds.add(item.currentSourceDocumentId);
    }
    
    // Create snapshot items
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
      createdAt: new Date().toISOString(),
      createdBy: args.userId,
      reason: args.reason,
      items: snapshotItems,
      sourceDocumentIds: Array.from(sourceDocIds),
      itemCount: activeItems.length,
      documentCount: sourceDocIds.size,
      modelRunId: args.modelRunId,
      description: args.description,
    });
    
    return { snapshotId, itemCount: activeItems.length };
  },
});

/**
 * Revert the project data library to a snapshot state
 */
export const revertToSnapshot = mutation({
  args: {
    snapshotId: v.id("dataLibrarySnapshots"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db.get(args.snapshotId);
    if (!snapshot) {
      throw new Error("Snapshot not found");
    }
    
    const now = new Date().toISOString();
    
    // First, create a backup snapshot of current state
    const currentItems = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", snapshot.projectId))
      .collect();
    
    const activeCurrentItems = currentItems.filter(item => !item.isDeleted);
    
    const currentSourceDocIds = new Set<Id<"documents">>();
    for (const item of activeCurrentItems) {
      currentSourceDocIds.add(item.currentSourceDocumentId);
    }
    
    // Create backup before revert
    await ctx.db.insert("dataLibrarySnapshots", {
      projectId: snapshot.projectId,
      createdAt: now,
      createdBy: args.userId,
      reason: "pre_revert_backup",
      items: activeCurrentItems.map(item => ({
        itemCode: item.itemCode,
        category: item.category,
        originalName: item.originalName,
        value: item.currentValue,
        valueNormalized: item.currentValueNormalized,
        sourceDocumentId: item.currentSourceDocumentId,
        sourceDocumentName: item.currentSourceDocumentName,
      })),
      sourceDocumentIds: Array.from(currentSourceDocIds),
      itemCount: activeCurrentItems.length,
      documentCount: currentSourceDocIds.size,
      description: `Backup before reverting to snapshot from ${snapshot.createdAt}`,
    });
    
    // Build map of snapshot items
    const snapshotItemsMap = new Map(
      snapshot.items.map(item => [item.itemCode, item])
    );
    
    // Process current items
    for (const item of currentItems) {
      const snapshotItem = snapshotItemsMap.get(item.itemCode);
      
      if (!snapshotItem) {
        // Item doesn't exist in snapshot - soft delete it
        await ctx.db.patch(item._id, {
          isDeleted: true,
          deletedAt: now,
          deletedReason: "Reverted to earlier snapshot",
        });
      } else {
        // Item exists in snapshot - restore its value
        // Add revert entry to history
        const updatedHistory = item.valueHistory.map(h => ({
          ...h,
          isCurrentValue: false,
        }));
        
        updatedHistory.push({
          value: snapshotItem.value,
          valueNormalized: snapshotItem.valueNormalized,
          sourceDocumentId: snapshotItem.sourceDocumentId,
          sourceDocumentName: snapshotItem.sourceDocumentName,
          sourceExtractionId: "" as Id<"codifiedExtractions">,
          originalName: snapshotItem.originalName,
          addedAt: now,
          addedBy: "manual" as const,
          addedByUserId: args.userId,
          isCurrentValue: true,
          wasReverted: false,
        });
        
        await ctx.db.patch(item._id, {
          currentValue: snapshotItem.value,
          currentValueNormalized: snapshotItem.valueNormalized,
          currentSourceDocumentId: snapshotItem.sourceDocumentId,
          currentSourceDocumentName: snapshotItem.sourceDocumentName,
          originalName: snapshotItem.originalName,
          lastUpdatedAt: now,
          lastUpdatedBy: "manual",
          lastUpdatedByUserId: args.userId,
          isDeleted: false,
          deletedAt: undefined,
          deletedReason: undefined,
          valueHistory: updatedHistory,
        });
        
        // Remove from map to track what's been processed
        snapshotItemsMap.delete(item.itemCode);
      }
    }
    
    // Any remaining items in snapshotItemsMap are new items that need to be created
    for (const [itemCode, snapshotItem] of snapshotItemsMap) {
      await ctx.db.insert("projectDataItems", {
        projectId: snapshot.projectId,
        itemCode,
        category: snapshotItem.category,
        originalName: snapshotItem.originalName,
        currentValue: snapshotItem.value,
        currentValueNormalized: snapshotItem.valueNormalized,
        currentSourceDocumentId: snapshotItem.sourceDocumentId,
        currentSourceDocumentName: snapshotItem.sourceDocumentName,
        currentDataType: "currency", // Default
        lastUpdatedAt: now,
        lastUpdatedBy: "manual",
        lastUpdatedByUserId: args.userId,
        manualOverrideNote: `Restored from snapshot ${snapshot._id}`,
        hasMultipleSources: false,
        valueHistory: [{
          value: snapshotItem.value,
          valueNormalized: snapshotItem.valueNormalized,
          sourceDocumentId: snapshotItem.sourceDocumentId,
          sourceDocumentName: snapshotItem.sourceDocumentName,
          sourceExtractionId: "" as Id<"codifiedExtractions">,
          originalName: snapshotItem.originalName,
          addedAt: now,
          addedBy: "manual",
          addedByUserId: args.userId,
          isCurrentValue: true,
          wasReverted: false,
        }],
      });
    }
    
    return { 
      success: true,
      restoredTo: snapshot.createdAt,
      itemCount: snapshot.itemCount,
    };
  },
});

/**
 * Delete old snapshots (keep recent ones)
 */
export const cleanupOldSnapshots = mutation({
  args: {
    projectId: v.id("projects"),
    keepCount: v.number(), // How many recent snapshots to keep
  },
  handler: async (ctx, args) => {
    const snapshots = await ctx.db
      .query("dataLibrarySnapshots")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Sort by date descending
    const sorted = snapshots.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Keep the specified number, delete the rest
    // But never delete snapshots linked to model runs
    const toDelete = sorted.slice(args.keepCount).filter(s => !s.modelRunId);
    
    for (const snapshot of toDelete) {
      await ctx.db.delete(snapshot._id);
    }
    
    return { deleted: toDelete.length };
  },
});

