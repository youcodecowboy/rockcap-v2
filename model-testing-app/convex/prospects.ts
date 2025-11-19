import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Create a prospect from a company number
 */
export const createProspect = mutation({
  args: {
    companyNumber: v.string(),
    companyId: v.optional(v.id("companiesHouseCompanies")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if prospect already exists
    const existing = await ctx.db
      .query("prospects")
      .withIndex("by_company_number", (q) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .first();

    if (existing) {
      return existing._id;
    }

    // Create new prospect
    const prospectId = await ctx.db.insert("prospects", {
      companyNumber: args.companyNumber,
      companyId: args.companyId,
      prospectTier: "UNQUALIFIED",
      hasPlanningHits: false,
      hasOwnedPropertyHits: false,
      createdAt: now,
      updatedAt: now,
    });

    return prospectId;
  },
});

/**
 * Update prospect score and tier
 */
export const updateProspectScore = mutation({
  args: {
    prospectId: v.id("prospects"),
    activeProjectScore: v.optional(v.number()),
    prospectTier: v.optional(v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("UNQUALIFIED")
    )),
    hasPlanningHits: v.optional(v.boolean()),
    hasOwnedPropertyHits: v.optional(v.boolean()),
    lastGauntletRunAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { prospectId, ...updates } = args;
    const now = new Date().toISOString();

    await ctx.db.patch(prospectId, {
      ...updates,
      updatedAt: now,
    });

    return prospectId;
  },
});

/**
 * Get prospect by company number
 */
export const getProspectByCompanyNumber = query({
  args: { companyNumber: v.string() },
  handler: async (ctx, args) => {
    const prospect = await ctx.db
      .query("prospects")
      .withIndex("by_company_number", (q) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .first();

    return prospect;
  },
});

/**
 * Get prospect by ID
 */
export const getProspect = query({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.prospectId);
  },
});

/**
 * List prospects with optional filters
 */
export const listProspects = query({
  args: {
    tier: v.optional(v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("UNQUALIFIED")
    )),
    minScore: v.optional(v.number()),
    hasPlanningHits: v.optional(v.boolean()),
    hasOwnedPropertyHits: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("prospects");

    // Apply filters
    if (args.tier) {
      query = query.withIndex("by_tier", (q) => q.eq("prospectTier", args.tier));
    }

    const prospects = await query.collect();

    // Apply additional filters that aren't indexed
    let filtered = prospects;
    
    if (args.minScore !== undefined) {
      filtered = filtered.filter(
        (p) => (p.activeProjectScore || 0) >= args.minScore!
      );
    }
    
    if (args.hasPlanningHits !== undefined) {
      filtered = filtered.filter(
        (p) => p.hasPlanningHits === args.hasPlanningHits
      );
    }
    
    if (args.hasOwnedPropertyHits !== undefined) {
      filtered = filtered.filter(
        (p) => p.hasOwnedPropertyHits === args.hasOwnedPropertyHits
      );
    }

    return filtered;
  },
});

/**
 * Get prospects that need gauntlet refresh (older than specified days)
 */
export const getProspectsNeedingRefresh = query({
  args: { daysOld: v.number() },
  handler: async (ctx, args) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - args.daysOld);
    const cutoffISO = cutoffDate.toISOString();

    const allProspects = await ctx.db.query("prospects").collect();
    
    // Filter prospects where lastGauntletRunAt is older than cutoff or null
    return allProspects.filter((p) => {
      if (!p.lastGauntletRunAt) return true;
      return p.lastGauntletRunAt < cutoffISO;
    });
  },
});

