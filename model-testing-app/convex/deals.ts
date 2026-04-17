import { mutation, query } from "./_generated/server";
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
      .withIndex("by_stage", (q: any) => q.eq("stage", args.stage))
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
      .withIndex("by_pipeline", (q: any) => q.eq("pipeline", args.pipeline))
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

// ---- Client-scoped queries (Plan 2 phase A) ----

/**
 * List all deals associated with a client, resolved via the companies
 * that have been promoted to this client.
 */
export const listForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const allDeals = await ctx.db.query("deals").collect();
    return allDeals.filter((d) =>
      (d.linkedCompanyIds ?? []).some((id) => companyIds.has(id)),
    );
  },
});

/**
 * List only OPEN deals (not closed-won/closed-lost) for a client.
 * Used by the Overview hero "Open Deals" card.
 */
export const listOpenForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const allDeals = await ctx.db.query("deals").collect();
    return allDeals.filter(
      (d) =>
        (d.linkedCompanyIds ?? []).some((id) => companyIds.has(id)) &&
        d.isClosed !== true,
    );
  },
});


/**
 * Update specific deal fields locally (does NOT round-trip to HubSpot).
 *
 * Used by the mobile Deal detail sheet's edit mode. The next HubSpot sync
 * will overwrite any field HubSpot has a value for — consider this a
 * display-level override until the sync back to HubSpot is built.
 *
 * Tracks who made the edit and when so we can surface a "locally edited"
 * affordance in the UI and, eventually, replay edits back to HubSpot.
 */
export const updateLocalEdits = mutation({
  args: {
    dealId: v.id("deals"),
    closeDate: v.optional(v.string()),
    dealType: v.optional(v.string()),
    stageName: v.optional(v.string()),
    probability: v.optional(v.number()),
    spvName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { dealId, ...fields } = args;
    const patch: any = {
      updatedAt: new Date().toISOString(),
    };
    // Only apply fields that were explicitly passed (undefined = untouched).
    // Callers can pass empty strings to clear a field.
    if (fields.closeDate !== undefined) patch.closeDate = fields.closeDate || undefined;
    if (fields.dealType !== undefined) patch.dealType = fields.dealType || undefined;
    if (fields.stageName !== undefined) patch.stageName = fields.stageName || undefined;
    if (fields.probability !== undefined) patch.probability = fields.probability;
    if (fields.spvName !== undefined) patch.spvName = fields.spvName || undefined;

    await ctx.db.patch(dealId, patch);
    return dealId;
  },
});
