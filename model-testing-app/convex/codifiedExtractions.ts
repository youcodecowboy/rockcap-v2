import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
    return await ctx.db
      .query("codifiedExtractions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
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
    
    const extractionId = await ctx.db.insert("codifiedExtractions", {
      documentId: args.documentId,
      projectId: args.projectId,
      items: args.items,
      mappingStats: stats,
      fastPassCompleted: true,
      smartPassCompleted: false,
      isFullyConfirmed: stats.pendingReview === 0 && stats.suggested === 0,
      codifiedAt: now,
    });
    
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
    
    await ctx.db.patch(args.id, {
      items: args.items,
      mappingStats: stats,
      smartPassCompleted: true,
      smartPassAt: new Date().toISOString(),
      // Check if all items are now confirmed/matched
      isFullyConfirmed: stats.pendingReview === 0 && stats.suggested === 0,
    });
    
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

