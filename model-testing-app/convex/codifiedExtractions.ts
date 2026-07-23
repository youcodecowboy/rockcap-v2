import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";

// Common validator for codified items
const codifiedItemValidator = v.object({
  id: v.string(),
  originalName: v.string(),
  itemCode: v.optional(v.string()),
  suggestedCode: v.optional(v.string()),
  suggestedCodeId: v.optional(v.id("extractedItemCodes")),
  value: v.any(),
  dataType: v.string(),
  category: v.string(),
  mappingStatus: v.union(
    v.literal("matched"),
    v.literal("suggested"),
    v.literal("pending_review"),
    v.literal("confirmed"),
    v.literal("unmatched")
  ),
  confidence: v.number(),
  // Subtotal detection - these should not be included in category totals
  isSubtotal: v.optional(v.boolean()),
  subtotalReason: v.optional(v.string()),
});

// Query: Get codified extraction by document ID
export const getByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const extractions = await ctx.db
      .query("codifiedExtractions")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    
    // Return most recent
    if (extractions.length === 0) return null;
    
    extractions.sort((a, b) => 
      new Date(b.codifiedAt).getTime() - new Date(a.codifiedAt).getTime()
    );
    
    return extractions[0];
  },
});

// Query: Get codified extraction by ID
export const get = query({
  args: { id: v.id("codifiedExtractions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get codified extractions for a project
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Bounded at 200 newest-first. Each codifiedExtractions row holds an `items`
    // array (extraction JSON), so an unbounded collect over a busy project can
    // approach the 16MB per-execution read limit. 200 covers any realistic
    // per-project extraction history.
    return await ctx.db
      .query("codifiedExtractions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(200);
  },
});

// Query: Get items needing review (pending_review or suggested status)
export const getItemsNeedingReview = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const extraction = await ctx.db
      .query("codifiedExtractions")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    
    if (!extraction) return null;
    
    const needsReview = extraction.items.filter(item => 
      item.mappingStatus === "pending_review" || 
      item.mappingStatus === "suggested"
    );
    
    return {
      extractionId: extraction._id,
      items: needsReview,
      total: extraction.items.length,
      stats: extraction.mappingStats,
    };
  },
});

// Query: Check if extraction is ready for model run
export const isReadyForModelRun = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const extraction = await ctx.db
      .query("codifiedExtractions")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    
    if (!extraction) {
      return { ready: false, reason: "No codified extraction found" };
    }
    
    if (!extraction.isFullyConfirmed) {
      const unconfirmed = extraction.items.filter(i => 
        i.mappingStatus !== "confirmed" && i.mappingStatus !== "matched"
      );
      return {
        ready: false,
        reason: `${unconfirmed.length} items need confirmation`,
        unconfirmedCount: unconfirmed.length,
      };
    }
    
    return { ready: true };
  },
});

// Mutation: Create codified extraction (from Fast Pass)
export const create = mutation({
  args: {
    documentId: v.id("documents"),
    projectId: v.optional(v.id("projects")),
    items: v.array(codifiedItemValidator),
  },
  handler: async (ctx, args) => {
    // Calculate stats
    const stats = {
      matched: 0,
      suggested: 0,
      pendingReview: 0,
      confirmed: 0,
      unmatched: 0,
    };
    
    args.items.forEach(item => {
      switch (item.mappingStatus) {
        case "matched": stats.matched++; break;
        case "suggested": stats.suggested++; break;
        case "pending_review": stats.pendingReview++; break;
        case "confirmed": stats.confirmed++; break;
        case "unmatched": stats.unmatched++; break;
      }
    });
    
    const now = new Date().toISOString();
    const isFullyConfirmed = stats.pendingReview === 0 && stats.suggested === 0;
    
    const extractionId = await ctx.db.insert("codifiedExtractions", {
      documentId: args.documentId,
      projectId: args.projectId,
      items: args.items,
      mappingStats: stats,
      fastPassCompleted: true,
      smartPassCompleted: false,
      isFullyConfirmed,
      codifiedAt: now,
    });
    
    // If fully confirmed on creation, trigger merge to project library
    if (isFullyConfirmed && args.projectId) {
      const document = await ctx.db.get(args.documentId);
      if (document) {
        await ctx.scheduler.runAfter(0, api.projectDataLibrary.mergeExtractionToLibrary, {
          extractionId,
          projectId: args.projectId,
          documentId: args.documentId,
          documentName: document.fileName,
        });
      }
    }
    
    return extractionId;
  },
});

// Mutation: Update items after Smart Pass
export const updateAfterSmartPass = mutation({
  args: {
    id: v.id("codifiedExtractions"),
    items: v.array(codifiedItemValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Codified extraction not found");
    }
    
    // Recalculate stats
    const stats = {
      matched: 0,
      suggested: 0,
      pendingReview: 0,
      confirmed: 0,
      unmatched: 0,
    };
    
    args.items.forEach(item => {
      switch (item.mappingStatus) {
        case "matched": stats.matched++; break;
        case "suggested": stats.suggested++; break;
        case "pending_review": stats.pendingReview++; break;
        case "confirmed": stats.confirmed++; break;
        case "unmatched": stats.unmatched++; break;
      }
    });
    
    const isFullyConfirmed = stats.pendingReview === 0 && stats.suggested === 0;
    
    await ctx.db.patch(args.id, {
      items: args.items,
      mappingStats: stats,
      smartPassCompleted: true,
      smartPassAt: new Date().toISOString(),
      isFullyConfirmed,
    });
    
    // If fully confirmed after Smart Pass, trigger merge to project library
    if (isFullyConfirmed && !existing.mergedToProjectLibrary && existing.projectId) {
      const document = await ctx.db.get(existing.documentId);
      if (document) {
        await ctx.scheduler.runAfter(0, api.projectDataLibrary.mergeExtractionToLibrary, {
          extractionId: args.id,
          projectId: existing.projectId,
          documentId: existing.documentId,
          documentName: document.fileName,
        });
      }
    }
    
    return args.id;
  },
});

// Mutation: Confirm single item mapping
export const confirmItem = mutation({
  args: {
    extractionId: v.id("codifiedExtractions"),
    itemId: v.string(),
    itemCode: v.string(),
    // If user selected a different code than suggested
    canonicalCodeId: v.optional(v.id("extractedItemCodes")),
  },
  handler: async (ctx, args) => {
    const extraction = await ctx.db.get(args.extractionId);
    if (!extraction) {
      throw new Error("Codified extraction not found");
    }
    
    // Update the item
    const updatedItems = extraction.items.map(item => {
      if (item.id === args.itemId) {
        return {
          ...item,
          itemCode: args.itemCode,
          suggestedCodeId: args.canonicalCodeId,
          mappingStatus: "confirmed" as const,
          confidence: 1.0,
        };
      }
      return item;
    });
    
    // Recalculate stats
    const stats = {
      matched: 0,
      suggested: 0,
      pendingReview: 0,
      confirmed: 0,
      unmatched: 0,
    };
    
    updatedItems.forEach(item => {
      switch (item.mappingStatus) {
        case "matched": stats.matched++; break;
        case "suggested": stats.suggested++; break;
        case "pending_review": stats.pendingReview++; break;
        case "confirmed": stats.confirmed++; break;
        case "unmatched": stats.unmatched++; break;
      }
    });
    
    const isFullyConfirmed = stats.pendingReview === 0 && stats.suggested === 0;
    
    await ctx.db.patch(args.extractionId, {
      items: updatedItems,
      mappingStats: stats,
      isFullyConfirmed,
      confirmedAt: isFullyConfirmed ? new Date().toISOString() : undefined,
    });
    
    // If fully confirmed, trigger merge to project library
    if (isFullyConfirmed && !extraction.mergedToProjectLibrary) {
      // Get the document to find the projectId
      const document = await ctx.db.get(extraction.documentId);
      if (document?.projectId) {
        await ctx.scheduler.runAfter(0, api.projectDataLibrary.mergeExtractionToLibrary, {
          extractionId: args.extractionId,
          projectId: document.projectId,
          documentId: extraction.documentId,
          documentName: document.fileName,
        });
      }
    }
    
    return { isFullyConfirmed, stats };
  },
});

// Mutation: Confirm all suggested items
export const confirmAllSuggested = mutation({
  args: {
    extractionId: v.id("codifiedExtractions"),
  },
  handler: async (ctx, args) => {
    const extraction = await ctx.db.get(args.extractionId);
    if (!extraction) {
      throw new Error("Codified extraction not found");
    }
    
    // Update all suggested items to confirmed
    const updatedItems = extraction.items.map(item => {
      if (item.mappingStatus === "suggested" && item.suggestedCode) {
        return {
          ...item,
          itemCode: item.suggestedCode,
          mappingStatus: "confirmed" as const,
          confidence: 1.0,
        };
      }
      return item;
    });
    
    // Recalculate stats
    const stats = {
      matched: 0,
      suggested: 0,
      pendingReview: 0,
      confirmed: 0,
      unmatched: 0,
    };
    
    updatedItems.forEach(item => {
      switch (item.mappingStatus) {
        case "matched": stats.matched++; break;
        case "suggested": stats.suggested++; break;
        case "pending_review": stats.pendingReview++; break;
        case "confirmed": stats.confirmed++; break;
        case "unmatched": stats.unmatched++; break;
      }
    });
    
    const isFullyConfirmed = stats.pendingReview === 0 && stats.suggested === 0;
    
    await ctx.db.patch(args.extractionId, {
      items: updatedItems,
      mappingStats: stats,
      isFullyConfirmed,
      confirmedAt: isFullyConfirmed ? new Date().toISOString() : undefined,
    });
    
    // If fully confirmed, trigger merge to project library
    if (isFullyConfirmed && !extraction.mergedToProjectLibrary) {
      // Get the document to find the projectId
      const document = await ctx.db.get(extraction.documentId);
      if (document?.projectId) {
        await ctx.scheduler.runAfter(0, api.projectDataLibrary.mergeExtractionToLibrary, {
          extractionId: args.extractionId,
          projectId: document.projectId,
          documentId: extraction.documentId,
          documentName: document.fileName,
        });
      }
    }
    
    // Return items that were confirmed (for creating aliases)
    const confirmedItems = updatedItems.filter(item => 
      item.mappingStatus === "confirmed" && 
      extraction.items.find(i => i.id === item.id)?.mappingStatus === "suggested"
    );
    
    return { isFullyConfirmed, stats, confirmedItems };
  },
});

// Mutation: Skip item (mark as unmatched)
export const skipItem = mutation({
  args: {
    extractionId: v.id("codifiedExtractions"),
    itemId: v.string(),
  },
  handler: async (ctx, args) => {
    const extraction = await ctx.db.get(args.extractionId);
    if (!extraction) {
      throw new Error("Codified extraction not found");
    }
    
    const updatedItems = extraction.items.map(item => {
      if (item.id === args.itemId) {
        return {
          ...item,
          mappingStatus: "unmatched" as const,
          confidence: 0,
        };
      }
      return item;
    });
    
    // Recalculate stats
    const stats = {
      matched: 0,
      suggested: 0,
      pendingReview: 0,
      confirmed: 0,
      unmatched: 0,
    };
    
    updatedItems.forEach(item => {
      switch (item.mappingStatus) {
        case "matched": stats.matched++; break;
        case "suggested": stats.suggested++; break;
        case "pending_review": stats.pendingReview++; break;
        case "confirmed": stats.confirmed++; break;
        case "unmatched": stats.unmatched++; break;
      }
    });
    
    const isFullyConfirmed = stats.pendingReview === 0 && stats.suggested === 0;
    
    await ctx.db.patch(args.extractionId, {
      items: updatedItems,
      mappingStats: stats,
      isFullyConfirmed,
      confirmedAt: isFullyConfirmed ? new Date().toISOString() : undefined,
    });
    
    return { isFullyConfirmed, stats };
  },
});

// Mutation: Delete codified extraction
export const remove = mutation({
  args: { id: v.id("codifiedExtractions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Query: Get codified items ready for template population
export const getConfirmedItems = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const extraction = await ctx.db
      .query("codifiedExtractions")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    
    if (!extraction) return null;
    
    // Return only confirmed/matched items with their codes
    const confirmedItems = extraction.items
      .filter(item => 
        (item.mappingStatus === "confirmed" || item.mappingStatus === "matched") &&
        item.itemCode
      )
      .map(item => ({
        itemCode: item.itemCode!,
        originalName: item.originalName,
        value: item.value,
        dataType: item.dataType,
        category: item.category,
      }));
    
    return {
      items: confirmedItems,
      isFullyConfirmed: extraction.isFullyConfirmed,
      stats: extraction.mappingStats,
    };
  },
});

// Mutation: Add a manual item to the extraction
export const addItem = mutation({
  args: {
    extractionId: v.id("codifiedExtractions"),
    item: codifiedItemValidator,
  },
  handler: async (ctx, args) => {
    const extraction = await ctx.db.get(args.extractionId);
    if (!extraction) {
      throw new Error("Codified extraction not found");
    }
    
    // Add the new item to the list
    const updatedItems = [...extraction.items, args.item];
    
    // Recalculate stats
    const stats = {
      matched: 0,
      suggested: 0,
      pendingReview: 0,
      confirmed: 0,
      unmatched: 0,
    };
    
    updatedItems.forEach(item => {
      switch (item.mappingStatus) {
        case "matched": stats.matched++; break;
        case "suggested": stats.suggested++; break;
        case "pending_review": stats.pendingReview++; break;
        case "confirmed": stats.confirmed++; break;
        case "unmatched": stats.unmatched++; break;
      }
    });
    
    const isFullyConfirmed = stats.pendingReview === 0 && stats.suggested === 0;
    
    await ctx.db.patch(args.extractionId, {
      items: updatedItems,
      mappingStats: stats,
      isFullyConfirmed,
    });
    
    return { stats, isFullyConfirmed };
  },
});

// ============================================================================
// PROJECT DATA LIBRARY INTEGRATION
// ============================================================================

/**
 * Merge confirmed extraction items to the project data library
 * Call this after all items are confirmed to add them to the unified library
 */
export const mergeToProjectLibrary = mutation({
  args: {
    extractionId: v.id("codifiedExtractions"),
    projectId: v.optional(v.id("projects")), // Can be provided if extraction doesn't have one
  },
  handler: async (ctx, args) => {
    const extraction = await ctx.db.get(args.extractionId);
    if (!extraction) {
      throw new Error("Extraction not found");
    }
    
    // Use provided projectId or fall back to extraction's projectId
    const projectId = args.projectId || extraction.projectId;
    
    if (!projectId) {
      throw new Error("No project ID available - provide projectId or ensure extraction has one");
    }
    
    // Update extraction with projectId if it was missing
    if (!extraction.projectId && args.projectId) {
      await ctx.db.patch(args.extractionId, { projectId: args.projectId });
    }
    
    if (extraction.mergedToProjectLibrary) {
      return { merged: 0, updated: 0, created: 0, alreadyMerged: true };
    }
    
    // Get document info for provenance
    const document = await ctx.db.get(extraction.documentId);
    if (!document) {
      throw new Error("Source document not found");
    }
    
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    
    // Process each confirmed/matched item
    for (const item of extraction.items) {
      // Skip items without confirmed codes
      if (!item.itemCode && !item.suggestedCode) continue;
      if (item.mappingStatus === "unmatched" || item.mappingStatus === "pending_review") continue;
      
      const itemCode = item.itemCode || item.suggestedCode!;
      
      // Check if item exists in project library
      const existing = await ctx.db
        .query("projectDataItems")
        .withIndex("by_project_code", (q) => 
          q.eq("projectId", projectId).eq("itemCode", itemCode)
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
        sourceDocumentId: extraction.documentId,
        sourceDocumentName: document.fileName,
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
            variance = ((max - min) / Math.abs(min)) * 100;
          }
        }
        
        await ctx.db.patch(existing._id, {
          currentValue: rawValue,
          currentValueNormalized: normalizedValue,
          currentSourceDocumentId: extraction.documentId,
          currentSourceDocumentName: document.fileName,
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
          projectId: projectId,
          itemCode,
          category: item.category,
          originalName: item.originalName,
          currentValue: rawValue,
          currentValueNormalized: normalizedValue,
          currentSourceDocumentId: extraction.documentId,
          currentSourceDocumentName: document.fileName,
          currentDataType: item.dataType,
          lastUpdatedAt: now,
          lastUpdatedBy: "extraction",
          hasMultipleSources: false,
          valueHistory: [historyEntry],
        });
        
        created++;
      }
    }
    
    // Mark extraction as merged
    await ctx.db.patch(args.extractionId, {
      mergedToProjectLibrary: true,
      mergedAt: now,
      projectId: projectId, // Ensure projectId is set
    });
    
    return { merged: created + updated, updated, created, alreadyMerged: false };
  },
});

/**
 * Soft delete an extraction (for bad data)
 */
export const softDelete = mutation({
  args: {
    extractionId: v.id("codifiedExtractions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const extraction = await ctx.db.get(args.extractionId);
    if (!extraction) {
      throw new Error("Extraction not found");
    }
    
    await ctx.db.patch(args.extractionId, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedReason: args.reason || "User deleted",
    });
    
    return { success: true };
  },
});

/**
 * Check if extraction can be safely deleted
 * Returns info about what would be affected in the project library
 */
export const getDeleteImpact = query({
  args: {
    extractionId: v.id("codifiedExtractions"),
  },
  handler: async (ctx, args) => {
    const extraction = await ctx.db.get(args.extractionId);
    if (!extraction) {
      return null;
    }
    
    if (!extraction.projectId || !extraction.mergedToProjectLibrary) {
      // Not merged, safe to delete
      return {
        canDelete: true,
        mergedItems: 0,
        wouldRemoveItems: 0,
        wouldRevertItems: 0,
      };
    }
    
    // Get all project data items
    const items = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", extraction.projectId!))
      .collect();
    
    let wouldRemoveItems = 0;
    let wouldRevertItems = 0;
    
    for (const item of items) {
      if (item.isDeleted) continue;
      
      // Check if this extraction is in the history
      const fromThisExtraction = item.valueHistory.filter(
        h => h.sourceExtractionId === args.extractionId
      );
      
      if (fromThisExtraction.length === 0) continue;
      
      // Check if there are other sources
      const otherSources = item.valueHistory.filter(
        h => h.sourceExtractionId !== args.extractionId && !h.wasReverted
      );
      
      if (otherSources.length === 0) {
        wouldRemoveItems++;
      } else {
        wouldRevertItems++;
      }
    }
    
    return {
      canDelete: true,
      mergedItems: extraction.items.filter(i => 
        i.mappingStatus === "confirmed" || i.mappingStatus === "matched"
      ).length,
      wouldRemoveItems,
      wouldRevertItems,
    };
  },
});

/**
 * Merge all confirmed but unmerged extractions for a project
 * Use this to backfill data that was extracted before auto-merge was implemented
 */
// Paginated + self-scheduling. The former version collected the ENTIRE
// codifiedExtractions table (or a whole project's) — heavy `items` rows — into
// one execution, a 16MB-read-limit hazard. This processes one bounded page per
// execution and self-schedules the next page until done. Kick off with:
//   npx convex run codifiedExtractions:mergeUnmergedExtractions
// The explicit return-type annotation breaks the self-referential `api`
// inference cycle (the TS2589 trap documented across this codebase).
export const mergeUnmergedExtractions = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    cursor: v.optional(v.string()),
    mergedSoFar: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ done: boolean; mergedThisPage: number; mergedSoFar: number }> => {
    const PAGE = 25;
    const base = args.projectId
      ? ctx.db
          .query("codifiedExtractions")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      : ctx.db.query("codifiedExtractions");
    const page = await base.paginate({ cursor: args.cursor ?? null, numItems: PAGE });

    let mergedThisPage = 0;
    for (const extraction of page.page) {
      if (
        !extraction.isFullyConfirmed ||
        extraction.mergedToProjectLibrary ||
        !extraction.projectId
      ) {
        continue;
      }
      const document = await ctx.db.get(extraction.documentId as Id<"documents">);
      const documentName = document?.fileName ?? "Unknown Document";

      await ctx.scheduler.runAfter(0, api.projectDataLibrary.mergeExtractionToLibrary, {
        extractionId: extraction._id,
        projectId: extraction.projectId,
        documentId: extraction.documentId,
        documentName,
      });
      mergedThisPage++;
    }

    const mergedSoFar = (args.mergedSoFar ?? 0) + mergedThisPage;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, api.codifiedExtractions.mergeUnmergedExtractions, {
        projectId: args.projectId,
        cursor: page.continueCursor,
        mergedSoFar,
      });
      return { done: false, mergedThisPage, mergedSoFar };
    }

    return { done: true, mergedThisPage, mergedSoFar };
  },
});

/**
 * Debug query to see all extractions and their status
 */
export const debugExtractions = query({
  args: {},
  handler: async (ctx) => {
    // Hard-bounded debug helper: full-table collect of heavy `items` rows in a
    // public query is a read-limit hazard, so cap at the 25 newest. This is a
    // diagnostic surface, not a data source.
    const extractions = await ctx.db
      .query("codifiedExtractions")
      .order("desc")
      .take(25);

    const results = [];
    for (const e of extractions) {
      const doc = await ctx.db.get(e.documentId);
      results.push({
        id: e._id,
        documentId: e.documentId,
        documentProjectId: doc?.projectId ?? null,
        extractionProjectId: e.projectId,
        isFullyConfirmed: e.isFullyConfirmed,
        mergedToProjectLibrary: e.mergedToProjectLibrary,
        itemCount: e.items?.length ?? 0,
        confirmedItems: e.items?.filter(i => i.mappingStatus === "confirmed" || i.mappingStatus === "matched").length ?? 0,
        stats: e.mappingStats,
      });
    }
    return results;
  },
});

/**
 * Backfill projectIds from documents to extractions and trigger merges
 * This fixes extractions that were created before the document was assigned to a project
 */
// Paginated chained migration. The former version collected the ENTIRE
// codifiedExtractions table (heavy `items` rows) in one execution — a 16MB
// read-limit hazard. This walks the table one bounded page per execution,
// self-scheduling the next page until done. Running totals ride through the
// args. Kick off with:
//   npx convex run codifiedExtractions:backfillProjectIds
// Explicit return-type annotation breaks the self-referential `api` inference
// cycle (the TS2589 trap documented across this codebase).
export const backfillProjectIds = mutation({
  args: {
    cursor: v.optional(v.string()),
    updatedSoFar: v.optional(v.number()),
    mergesScheduledSoFar: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    done: boolean;
    projectIdsUpdated: number;
    mergesScheduled: number;
  }> => {
    const PAGE = 25;
    const page = await ctx.db
      .query("codifiedExtractions")
      .paginate({ cursor: args.cursor ?? null, numItems: PAGE });

    let updatedCount = args.updatedSoFar ?? 0;
    let mergeScheduledCount = args.mergesScheduledSoFar ?? 0;

    for (const extraction of page.page) {
      const document = await ctx.db.get(extraction.documentId);
      if (!document) continue;

      // Check if extraction needs projectId from document
      if (!extraction.projectId && document.projectId) {
        await ctx.db.patch(extraction._id, {
          projectId: document.projectId,
        });
        updatedCount++;

        // If fully confirmed and not yet merged, schedule merge
        if (extraction.isFullyConfirmed && !extraction.mergedToProjectLibrary && extraction.items.length > 0) {
          await ctx.scheduler.runAfter(0, api.projectDataLibrary.mergeExtractionToLibrary, {
            extractionId: extraction._id,
            projectId: document.projectId,
            documentId: extraction.documentId,
            documentName: document.fileName,
          });
          mergeScheduledCount++;
        }
      } else if (extraction.projectId && extraction.isFullyConfirmed && !extraction.mergedToProjectLibrary && extraction.items.length > 0) {
        // Has projectId, is confirmed, but not merged yet
        await ctx.scheduler.runAfter(0, api.projectDataLibrary.mergeExtractionToLibrary, {
          extractionId: extraction._id,
          projectId: extraction.projectId,
          documentId: extraction.documentId,
          documentName: document.fileName,
        });
        mergeScheduledCount++;
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, api.codifiedExtractions.backfillProjectIds, {
        cursor: page.continueCursor,
        updatedSoFar: updatedCount,
        mergesScheduledSoFar: mergeScheduledCount,
      });
      return { done: false, projectIdsUpdated: updatedCount, mergesScheduled: mergeScheduledCount };
    }

    return { done: true, projectIdsUpdated: updatedCount, mergesScheduled: mergeScheduledCount };
  },
});

