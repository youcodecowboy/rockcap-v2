import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all deals for prospecting
 */
export const getAllDeals = query({
  handler: async (ctx) => {
    const deals = await ctx.db.query("deals").collect();
    
    // Fetch associated contacts and companies
    const dealsWithDetails = await Promise.all(
      deals.map(async (deal) => {
        const contacts = deal.linkedContactIds 
          ? await Promise.all(deal.linkedContactIds.map(id => ctx.db.get(id)))
          : [];
        const companies = deal.linkedCompanyIds
          ? await Promise.all(deal.linkedCompanyIds.map(id => ctx.db.get(id)))
          : [];
        
        return {
          ...deal,
          contacts: contacts.filter(c => c !== null),
          companies: companies.filter(c => c !== null),
        };
      })
    );
    
    return dealsWithDetails;
  },
});

/**
 * Get deal by ID
 */
export const getDealById = query({
  args: { dealId: v.id("deals") },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.dealId);
    if (!deal) return null;
    
    const contacts = deal.linkedContactIds 
      ? await Promise.all(deal.linkedContactIds.map(id => ctx.db.get(id)))
      : [];
    const companies = deal.linkedCompanyIds
      ? await Promise.all(deal.linkedCompanyIds.map(id => ctx.db.get(id)))
      : [];
    
    return {
      ...deal,
      contacts: contacts.filter(c => c !== null),
      companies: companies.filter(c => c !== null),
    };
  },
});

/**
 * Get deals by stage
 */
export const getDealsByStage = query({
  args: { stage: v.string() },
  handler: async (ctx, args) => {
    const deals = await ctx.db
      .query("deals")
      .withIndex("by_stage", (q) => q.eq("stage", args.stage))
      .collect();
    
    return deals;
  },
});

/**
 * Get deals by pipeline
 */
export const getDealsByPipeline = query({
  args: { pipeline: v.string() },
  handler: async (ctx, args) => {
    const deals = await ctx.db
      .query("deals")
      .withIndex("by_pipeline", (q) => q.eq("pipeline", args.pipeline))
      .collect();
    
    return deals;
  },
});

/**
 * Get pipeline total value (sum of all deal amounts)
 */
export const getPipelineTotal = query({
  handler: async (ctx) => {
    const deals = await ctx.db.query("deals").collect();
    const total = deals.reduce((sum, deal) => {
      return sum + (deal.amount || 0);
    }, 0);
    return total;
  },
});

