import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a slug from a category name for the total item code
 * e.g., "Construction Costs" -> "construction.costs"
 */
function categoryToSlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim()
    .replace(/\s+/g, '.'); // Replace spaces with dots
}

/**
 * Generate item code for a category total
 */
function getCategoryTotalCode(category: string): string {
  return `<total.${categoryToSlug(category)}>`;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all current (non-deleted) items for a project, including computed category totals
 */
export const getProjectLibrary = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Filter out deleted items
    const activeItems = items.filter(item => !item.isDeleted);
    
    // Group items by category and compute totals
    const categoryTotals: Record<string, {
      category: string;
      total: number;
      itemCount: number;
      hasManualOverride: boolean;
      manualOverrideItem?: typeof activeItems[0];
    }> = {};
    
    for (const item of activeItems) {
      const totalCode = getCategoryTotalCode(item.category);
      
      // Check if this is a manual override for a category total
      if (item.itemCode === totalCode && !item.isComputed) {
        if (!categoryTotals[item.category]) {
          categoryTotals[item.category] = {
            category: item.category,
            total: 0,
            itemCount: 0,
            hasManualOverride: true,
            manualOverrideItem: item,
          };
        } else {
          categoryTotals[item.category].hasManualOverride = true;
          categoryTotals[item.category].manualOverrideItem = item;
        }
        continue; // Don't count override items in the computed total
      }
      
      // Skip computed total items from the sum (they shouldn't exist in DB anyway)
      if (item.isComputed) continue;
      
      // Initialize category if needed
      if (!categoryTotals[item.category]) {
        categoryTotals[item.category] = {
          category: item.category,
          total: 0,
          itemCount: 0,
          hasManualOverride: false,
        };
      }
      
      // Add currency values to total - EXCLUDE subtotals to avoid double-counting
      if (item.currentDataType === 'currency' && typeof item.currentValueNormalized === 'number') {
        // Only add to total if NOT a subtotal
        if (!item.isSubtotal) {
          categoryTotals[item.category].total += item.currentValueNormalized;
        }
      }
      categoryTotals[item.category].itemCount++;
    }
    
    // Create virtual computed total items for each category
    const computedTotals = Object.entries(categoryTotals).map(([category, data]) => {
      const totalCode = getCategoryTotalCode(category);
      
      // If there's a manual override, return that instead
      if (data.hasManualOverride && data.manualOverrideItem) {
        return {
          ...data.manualOverrideItem,
          isComputed: false, // Explicitly not computed
          computedFromCategory: category,
          computedTotal: data.total, // Include computed total for reference
        };
      }
      
      // Return virtual computed item
      return {
        _id: `computed-${category}` as Id<"projectDataItems">,
        _creationTime: Date.now(),
        projectId: args.projectId,
        itemCode: totalCode,
        category: category,
        originalName: `Total ${category}`,
        currentValue: data.total,
        currentValueNormalized: data.total,
        currentUnit: "actual",
        currentSourceDocumentId: "computed" as Id<"documents">,
        currentSourceDocumentName: "Computed Total",
        currentDataType: "currency",
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedBy: "extraction" as const,
        hasMultipleSources: false,
        valueHistory: [],
        isComputed: true,
        computedFromCategory: category,
        computedItemCount: data.itemCount,
      };
    });
    
    // Return regular items + computed totals
    // Filter out any manual override total items from regular items (they're included in computedTotals)
    const regularItems = activeItems.filter(item => {
      const totalCode = getCategoryTotalCode(item.category);
      return item.itemCode !== totalCode;
    });
    
    return [...regularItems, ...computedTotals];
  },
});

/**
 * Get items grouped by category for a project
 */
export const getProjectLibraryByCategory = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Filter out deleted and group by category
    const activeItems = items.filter(item => !item.isDeleted);
    const grouped: Record<string, typeof activeItems> = {};
    
    for (const item of activeItems) {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    }
    
    return grouped;
  },
});

/**
 * Get full history for a single item
 */
export const getItemHistory = query({
  args: { itemId: v.id("projectDataItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return null;
    
    // Sort history by addedAt descending
    const sortedHistory = [...item.valueHistory].sort(
      (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
    );
    
    return {
      item,
      history: sortedHistory,
    };
  },
});

/**
 * Get all items sourced from a specific document
 */
export const getItemsFromDocument = query({
  args: { 
    projectId: v.id("projects"),
    documentId: v.id("documents") 
  },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Filter to items where this document appears in history
    return items.filter(item => 
      !item.isDeleted && 
      item.valueHistory.some(h => h.sourceDocumentId === args.documentId)
    );
  },
});

/**
 * Get items with multiple sources (potential conflicts/updates)
 */
export const getChangedItems = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    return items.filter(item => !item.isDeleted && item.hasMultipleSources);
  },
});

/**
 * Get soft-deleted items for potential recovery
 */
export const getDeletedItems = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    return items.filter(item => item.isDeleted);
  },
});

/**
 * Get pending extractions status for a project
 * Shows if there are extractions awaiting confirmation in the Modeling section
 */
export const getPendingExtractions = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Get extractions for this project
    const extractions = await ctx.db
      .query("codifiedExtractions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Get extraction jobs (queued but not yet processed)
    const jobs = await ctx.db
      .query("extractionJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    const pendingJobs = jobs.filter(j => j.status === "pending" || j.status === "processing");
    const failedJobs = jobs.filter(j => j.status === "failed");
    
    // Categorize extractions
    const unconfirmed = extractions.filter(e => !e.isFullyConfirmed);
    const confirmedNotMerged = extractions.filter(e => e.isFullyConfirmed && !e.mergedToProjectLibrary);
    const fullyMerged = extractions.filter(e => e.mergedToProjectLibrary);
    
    // Calculate totals
    const unconfirmedItemCount = unconfirmed.reduce((sum, e) => sum + (e.items?.length || 0), 0);
    const pendingMergeItemCount = confirmedNotMerged.reduce((sum, e) => sum + (e.items?.length || 0), 0);
    
    return {
      hasUnconfirmed: unconfirmed.length > 0,
      unconfirmedCount: unconfirmed.length,
      unconfirmedItemCount,
      hasPendingMerge: confirmedNotMerged.length > 0,
      pendingMergeCount: confirmedNotMerged.length,
      pendingMergeItemCount,
      totalExtractions: extractions.length,
      fullyMergedCount: fullyMerged.length,
      pendingJobCount: pendingJobs.length,
      failedJobCount: failedJobs.length,
      needsAttention: unconfirmed.length > 0 || pendingJobs.length > 0 || failedJobs.length > 0,
    };
  },
});

/**
 * Get library stats for a project
 */
export const getLibraryStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    const activeItems = items.filter(item => !item.isDeleted);
    
    // Get unique source documents
    const sourceDocIds = new Set<string>();
    for (const item of activeItems) {
      for (const h of item.valueHistory) {
        sourceDocIds.add(h.sourceDocumentId);
      }
    }
    
    // Count items by category
    const byCategory: Record<string, number> = {};
    for (const item of activeItems) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    }
    
    // Count manual overrides
    const manualOverrides = activeItems.filter(
      item => item.lastUpdatedBy === "manual"
    ).length;
    
    // Count items with multiple sources
    const multiSourceItems = activeItems.filter(
      item => item.hasMultipleSources
    ).length;
    
    return {
      totalItems: activeItems.length,
      totalDocuments: sourceDocIds.size,
      byCategory,
      manualOverrides,
      multiSourceItems,
      deletedItems: items.length - activeItems.length,
    };
  },
});

/**
 * Check if an item code exists in the project library
 */
export const checkItemCodeExists = query({
  args: { 
    projectId: v.id("projects"),
    itemCode: v.string() 
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project_code", (q) => 
        q.eq("projectId", args.projectId).eq("itemCode", args.itemCode)
      )
      .first();
    
    return existing ? { exists: true, item: existing } : { exists: false, item: null };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Merge extraction items into the project data library
 * Called after codification is complete
 */
export const mergeExtractionToLibrary = mutation({
  args: {
    extractionId: v.id("codifiedExtractions"),
    projectId: v.id("projects"),
    documentId: v.id("documents"),
    documentName: v.string(),
  },
  handler: async (ctx, args) => {
    const extraction = await ctx.db.get(args.extractionId);
    if (!extraction) {
      throw new Error("Extraction not found");
    }
    
    if (extraction.mergedToProjectLibrary) {
      // Already merged, skip
      return { merged: 0, updated: 0, created: 0 };
    }
    
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    
    // Process each confirmed/matched item
    for (const item of extraction.items) {
      // Skip items without confirmed codes
      if (!item.itemCode && !item.suggestedCode) continue;
      if (item.mappingStatus === "unmatched") continue;
      
      const itemCode = item.itemCode || item.suggestedCode!;
      
      // Check if item exists in project library
      const existing = await ctx.db
        .query("projectDataItems")
        .withIndex("by_project_code", (q) => 
          q.eq("projectId", args.projectId).eq("itemCode", itemCode)
        )
        .first();
      
      // Normalize value to number
      const rawValue = item.value;
      let normalizedValue = 0;
      if (typeof rawValue === "number") {
        normalizedValue = rawValue;
      } else if (typeof rawValue === "string") {
        normalizedValue = parseFloat(rawValue.replace(/[^0-9.-]/g, "")) || 0;
      }
      
      const historyEntry = {
        value: rawValue,
        valueNormalized: normalizedValue,
        sourceDocumentId: args.documentId,
        sourceDocumentName: args.documentName,
        sourceExtractionId: args.extractionId,
        originalName: item.originalName,
        addedAt: now,
        addedBy: "extraction" as const,
        addedByUserId: undefined,
        isCurrentValue: true,
        wasReverted: false,
      };
      
      if (existing && !existing.isDeleted) {
        // Item exists - update with new value from new source
        const existingHistory = existing.valueHistory.map(h => ({
          ...h,
          isCurrentValue: false, // Mark old entries as not current
        }));
        
        // Calculate variance if values differ
        let variance: number | undefined;
        const allValues = [...existingHistory.map(h => h.valueNormalized), normalizedValue];
        if (allValues.length > 1) {
          const min = Math.min(...allValues);
          const max = Math.max(...allValues);
          if (min !== 0) {
            variance = ((max - min) / min) * 100;
          }
        }
        
        await ctx.db.patch(existing._id, {
          currentValue: rawValue,
          currentValueNormalized: normalizedValue,
          currentSourceDocumentId: args.documentId,
          currentSourceDocumentName: args.documentName,
          currentDataType: item.dataType,
          originalName: item.originalName,
          lastUpdatedAt: now,
          lastUpdatedBy: "extraction",
          hasMultipleSources: true,
          valueVariance: variance,
          valueHistory: [...existingHistory, historyEntry],
        });
        
        updated++;
      } else {
        // New item - create
        await ctx.db.insert("projectDataItems", {
          projectId: args.projectId,
          itemCode,
          category: item.category,
          originalName: item.originalName,
          currentValue: rawValue,
          currentValueNormalized: normalizedValue,
          currentSourceDocumentId: args.documentId,
          currentSourceDocumentName: args.documentName,
          currentDataType: item.dataType,
          lastUpdatedAt: now,
          lastUpdatedBy: "extraction",
          hasMultipleSources: false,
          valueHistory: [historyEntry],
          // Subtotal detection - carry over from extraction
          isSubtotal: item.isSubtotal,
          subtotalReason: item.subtotalReason,
        });
        
        created++;
      }
    }
    
    // Mark extraction as merged
    await ctx.db.patch(args.extractionId, {
      mergedToProjectLibrary: true,
      mergedAt: now,
    });
    
    // Trigger sync to project intelligence
    if (created + updated > 0) {
      await ctx.scheduler.runAfter(0, api.intelligence.syncDataLibraryToIntelligence, {
        projectId: args.projectId,
      });
      
      // Also sync project summaries to any associated clients
      const project = await ctx.db.get(args.projectId);
      if (project?.clientRoles) {
        for (const role of project.clientRoles) {
          await ctx.scheduler.runAfter(0, api.intelligence.syncProjectSummariesToClient, {
            clientId: role.clientId as Id<"clients">,
          });
        }
      }
    }
    
    return { merged: created + updated, updated, created };
  },
});

/**
 * Revert all items added from a specific document
 */
export const revertDocumentAddition = mutation({
  args: {
    projectId: v.id("projects"),
    documentId: v.id("documents"),
    createBackupSnapshot: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    const now = new Date().toISOString();
    let reverted = 0;
    let deleted = 0;
    
    for (const item of items) {
      if (item.isDeleted) continue;
      
      // Find history entries from this document
      const fromThisDoc = item.valueHistory.filter(
        h => h.sourceDocumentId === args.documentId
      );
      
      if (fromThisDoc.length === 0) continue;
      
      // Check if this is the only source
      const otherSources = item.valueHistory.filter(
        h => h.sourceDocumentId !== args.documentId && !h.wasReverted
      );
      
      if (otherSources.length === 0) {
        // Only source - soft delete the item
        await ctx.db.patch(item._id, {
          isDeleted: true,
          deletedAt: now,
          deletedReason: `Source document removed`,
        });
        deleted++;
      } else {
        // Other sources exist - revert to previous value
        // Find the most recent non-reverted value from another source
        const sortedOthers = otherSources.sort(
          (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
        );
        const previousValue = sortedOthers[0];
        
        // Mark entries from this doc as reverted
        const updatedHistory = item.valueHistory.map(h => {
          if (h.sourceDocumentId === args.documentId) {
            return { ...h, wasReverted: true, isCurrentValue: false };
          }
          if (h.sourceDocumentId === previousValue.sourceDocumentId && 
              h.addedAt === previousValue.addedAt) {
            return { ...h, isCurrentValue: true };
          }
          return { ...h, isCurrentValue: false };
        });
        
        await ctx.db.patch(item._id, {
          currentValue: previousValue.value,
          currentValueNormalized: previousValue.valueNormalized,
          currentSourceDocumentId: previousValue.sourceDocumentId as Id<"documents">,
          currentSourceDocumentName: previousValue.sourceDocumentName,
          originalName: previousValue.originalName,
          lastUpdatedAt: now,
          lastUpdatedBy: "extraction",
          valueHistory: updatedHistory,
        });
        
        reverted++;
      }
    }
    
    return { reverted, deleted };
  },
});

/**
 * Revert a single item to a specific version in its history
 */
export const revertItemToVersion = mutation({
  args: {
    itemId: v.id("projectDataItems"),
    historyIndex: v.number(), // Index in valueHistory array
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    
    if (args.historyIndex < 0 || args.historyIndex >= item.valueHistory.length) {
      throw new Error("Invalid history index");
    }
    
    const targetVersion = item.valueHistory[args.historyIndex];
    const now = new Date().toISOString();
    
    // Update history to mark new current value
    const updatedHistory = item.valueHistory.map((h, i) => ({
      ...h,
      isCurrentValue: i === args.historyIndex,
    }));
    
    await ctx.db.patch(args.itemId, {
      currentValue: targetVersion.value,
      currentValueNormalized: targetVersion.valueNormalized,
      currentSourceDocumentId: targetVersion.sourceDocumentId as Id<"documents">,
      currentSourceDocumentName: targetVersion.sourceDocumentName,
      originalName: targetVersion.originalName,
      lastUpdatedAt: now,
      valueHistory: updatedHistory,
    });
    
    return { success: true };
  },
});

/**
 * Manually override an item's value
 */
export const manualOverrideItem = mutation({
  args: {
    itemId: v.id("projectDataItems"),
    newValue: v.any(),
    note: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    
    const now = new Date().toISOString();
    
    // Normalize the new value
    let normalizedValue = 0;
    if (typeof args.newValue === "number") {
      normalizedValue = args.newValue;
    } else if (typeof args.newValue === "string") {
      normalizedValue = parseFloat(args.newValue.replace(/[^0-9.-]/g, "")) || 0;
    }
    
    // Mark all existing history as not current
    const updatedHistory = item.valueHistory.map(h => ({
      ...h,
      isCurrentValue: false,
    }));
    
    // Add manual override to history
    updatedHistory.push({
      value: args.newValue,
      valueNormalized: normalizedValue,
      sourceDocumentId: item.currentSourceDocumentId, // Keep reference to original source
      sourceDocumentName: "Manual Override",
      sourceExtractionId: item.valueHistory[0]?.sourceExtractionId || ("" as Id<"codifiedExtractions">),
      originalName: item.originalName,
      addedAt: now,
      addedBy: "manual",
      addedByUserId: args.userId,
      isCurrentValue: true,
      wasReverted: false,
    });
    
    await ctx.db.patch(args.itemId, {
      currentValue: args.newValue,
      currentValueNormalized: normalizedValue,
      lastUpdatedAt: now,
      lastUpdatedBy: "manual",
      lastUpdatedByUserId: args.userId,
      manualOverrideNote: args.note,
      hasMultipleSources: true,
      valueHistory: updatedHistory,
    });
    
    return { success: true };
  },
});

/**
 * Add a new item manually (not from extraction)
 */
export const addManualItem = mutation({
  args: {
    projectId: v.id("projects"),
    itemCode: v.string(),
    category: v.string(),
    originalName: v.string(),
    value: v.any(),
    dataType: v.string(),
    note: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    // For source document reference (optional)
    sourceDocumentId: v.optional(v.id("documents")),
    sourceDocumentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if item code already exists
    const existing = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project_code", (q) => 
        q.eq("projectId", args.projectId).eq("itemCode", args.itemCode)
      )
      .first();
    
    if (existing && !existing.isDeleted) {
      throw new Error(`Item with code ${args.itemCode} already exists`);
    }
    
    const now = new Date().toISOString();
    
    // Normalize value
    let normalizedValue = 0;
    if (typeof args.value === "number") {
      normalizedValue = args.value;
    } else if (typeof args.value === "string") {
      normalizedValue = parseFloat(args.value.replace(/[^0-9.-]/g, "")) || 0;
    }
    
    // Use provided source document or create placeholder
    const sourceDocId = args.sourceDocumentId || ("manual" as unknown as Id<"documents">);
    const sourceDocName = args.sourceDocumentName || "Manual Entry";
    
    const itemId = await ctx.db.insert("projectDataItems", {
      projectId: args.projectId,
      itemCode: args.itemCode,
      category: args.category,
      originalName: args.originalName,
      currentValue: args.value,
      currentValueNormalized: normalizedValue,
      currentSourceDocumentId: sourceDocId,
      currentSourceDocumentName: sourceDocName,
      currentDataType: args.dataType,
      lastUpdatedAt: now,
      lastUpdatedBy: "manual",
      lastUpdatedByUserId: args.userId,
      manualOverrideNote: args.note,
      hasMultipleSources: false,
      valueHistory: [{
        value: args.value,
        valueNormalized: normalizedValue,
        sourceDocumentId: sourceDocId,
        sourceDocumentName: sourceDocName,
        sourceExtractionId: "" as unknown as Id<"codifiedExtractions">,
        originalName: args.originalName,
        addedAt: now,
        addedBy: "manual",
        addedByUserId: args.userId,
        isCurrentValue: true,
        wasReverted: false,
      }],
    });
    
    return { itemId };
  },
});

/**
 * Soft delete an item
 */
export const deleteItem = mutation({
  args: {
    itemId: v.id("projectDataItems"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    
    await ctx.db.patch(args.itemId, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedReason: args.reason || "User deleted",
    });
    
    return { success: true };
  },
});

/**
 * Restore a soft-deleted item
 */
export const restoreItem = mutation({
  args: {
    itemId: v.id("projectDataItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    
    if (!item.isDeleted) {
      throw new Error("Item is not deleted");
    }
    
    await ctx.db.patch(args.itemId, {
      isDeleted: false,
      deletedAt: undefined,
      deletedReason: undefined,
    });
    
    return { success: true };
  },
});

/**
 * Get all item codes in project library (for SmartPass consistency)
 */
export const getExistingItemCodes = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    return items
      .filter(item => !item.isDeleted)
      .map(item => ({
        itemCode: item.itemCode,
        category: item.category,
        originalName: item.originalName,
      }));
  },
});

/**
 * Override a category total with a manual value
 * Creates or updates a manual override item for the category total
 */
export const overrideCategoryTotal = mutation({
  args: {
    projectId: v.id("projects"),
    category: v.string(),
    overrideValue: v.number(),
    note: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const totalCode = getCategoryTotalCode(args.category);
    const now = new Date().toISOString();
    
    // Check if override already exists
    const existing = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project_code", (q) => 
        q.eq("projectId", args.projectId).eq("itemCode", totalCode)
      )
      .first();
    
    if (existing) {
      // Update existing override
      const updatedHistory = existing.valueHistory.map(h => ({
        ...h,
        isCurrentValue: false,
      }));
      
      updatedHistory.push({
        value: args.overrideValue,
        valueNormalized: args.overrideValue,
        sourceDocumentId: existing.currentSourceDocumentId,
        sourceDocumentName: "Manual Override",
        sourceExtractionId: existing.valueHistory[0]?.sourceExtractionId || ("" as Id<"codifiedExtractions">),
        originalName: `Total ${args.category}`,
        addedAt: now,
        addedBy: "manual" as const,
        addedByUserId: args.userId,
        isCurrentValue: true,
        wasReverted: false,
      });
      
      await ctx.db.patch(existing._id, {
        currentValue: args.overrideValue,
        currentValueNormalized: args.overrideValue,
        lastUpdatedAt: now,
        lastUpdatedBy: "manual",
        lastUpdatedByUserId: args.userId,
        manualOverrideNote: args.note,
        isComputed: false,
        hasMultipleSources: updatedHistory.length > 1,
        valueHistory: updatedHistory,
      });
      
      return { itemId: existing._id, updated: true };
    } else {
      // Create new override item
      // We need a placeholder document ID for the source
      const placeholderDocId = "manual-override" as unknown as Id<"documents">;
      
      const itemId = await ctx.db.insert("projectDataItems", {
        projectId: args.projectId,
        itemCode: totalCode,
        category: args.category,
        originalName: `Total ${args.category}`,
        currentValue: args.overrideValue,
        currentValueNormalized: args.overrideValue,
        currentSourceDocumentId: placeholderDocId,
        currentSourceDocumentName: "Manual Override",
        currentDataType: "currency",
        lastUpdatedAt: now,
        lastUpdatedBy: "manual",
        lastUpdatedByUserId: args.userId,
        manualOverrideNote: args.note,
        hasMultipleSources: false,
        isComputed: false,
        computedFromCategory: args.category,
        valueHistory: [{
          value: args.overrideValue,
          valueNormalized: args.overrideValue,
          sourceDocumentId: placeholderDocId,
          sourceDocumentName: "Manual Override",
          sourceExtractionId: "" as unknown as Id<"codifiedExtractions">,
          originalName: `Total ${args.category}`,
          addedAt: now,
          addedBy: "manual" as const,
          addedByUserId: args.userId,
          isCurrentValue: true,
          wasReverted: false,
        }],
      });
      
      return { itemId, updated: false };
    }
  },
});

/**
 * Clear a category total override and revert to computed value
 */
export const clearCategoryTotalOverride = mutation({
  args: {
    projectId: v.id("projects"),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const totalCode = getCategoryTotalCode(args.category);
    
    // Find the override item
    const existing = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project_code", (q) => 
        q.eq("projectId", args.projectId).eq("itemCode", totalCode)
      )
      .first();
    
    if (existing) {
      // Delete the override item - this will cause the computed value to be used
      await ctx.db.delete(existing._id);
      return { success: true, deleted: true };
    }
    
    return { success: true, deleted: false };
  },
});

/**
 * Get category total code for a category name (exposed for UI use)
 */
export const getCategoryTotalCodeQuery = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return getCategoryTotalCode(args.category);
  },
});

/**
 * Get all project data items for projects associated with a client
 * Aggregates data from all projects where the client has a role
 */
export const getClientDataLibrary = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get all projects where this client has a role
    const allProjects = await ctx.db.query("projects").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
    const clientProjects = allProjects.filter(project =>
      project.clientRoles?.some(role => role.clientId === args.clientId)
    );

    if (clientProjects.length === 0) {
      return { items: [], projectBreakdown: [] };
    }
    
    // Get project data items for all these projects
    const allItems: any[] = [];
    const projectBreakdown: { projectId: Id<"projects">; projectName: string; itemCount: number }[] = [];
    
    for (const project of clientProjects) {
      const items = await ctx.db
        .query("projectDataItems")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      
      const activeItems = items.filter(item => !item.isDeleted);
      
      // Add project info to each item for context
      const itemsWithProject = activeItems.map(item => ({
        ...item,
        projectName: project.name,
      }));
      
      allItems.push(...itemsWithProject);
      
      projectBreakdown.push({
        projectId: project._id,
        projectName: project.name,
        itemCount: activeItems.length,
      });
    }
    
    return { 
      items: allItems, 
      projectBreakdown,
      totalItems: allItems.length,
      totalProjects: clientProjects.length,
    };
  },
});

/**
 * Get library stats for a client (aggregated from all their projects)
 */
export const getClientLibraryStats = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get all projects where this client has a role
    const allProjects = await ctx.db.query("projects").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
    const clientProjects = allProjects.filter(project =>
      project.clientRoles?.some(role => role.clientId === args.clientId)
    );

    if (clientProjects.length === 0) {
      return {
        totalItems: 0,
        totalProjects: 0,
        byCategory: {},
        byProject: {},
      };
    }
    
    let totalItems = 0;
    const byCategory: Record<string, number> = {};
    const byProject: Record<string, { name: string; count: number }> = {};
    
    for (const project of clientProjects) {
      const items = await ctx.db
        .query("projectDataItems")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      
      const activeItems = items.filter(item => !item.isDeleted);
      totalItems += activeItems.length;
      
      byProject[project._id] = {
        name: project.name,
        count: activeItems.length,
      };
      
      for (const item of activeItems) {
        byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      }
    }
    
    return {
      totalItems,
      totalProjects: clientProjects.length,
      byCategory,
      byProject,
    };
  },
});

