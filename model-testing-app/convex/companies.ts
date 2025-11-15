import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Get company by ID
 */
export const get = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.id);
    if (!company) return null;
    
    // Fetch associated contacts
    const contacts = company.linkedContactIds 
      ? await Promise.all(company.linkedContactIds.map(id => ctx.db.get(id)))
      : [];
    
    // Fetch associated deals
    const deals = company.linkedDealIds
      ? await Promise.all(company.linkedDealIds.map(id => ctx.db.get(id)))
      : [];
    
    return {
      ...company,
      contacts: contacts.filter(c => c !== null),
      deals: deals.filter(d => d !== null),
    };
  },
});

/**
 * Get all companies
 */
export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("companies").collect();
  },
});

/**
 * Get companies by lifecycle stage
 */
export const getByLifecycleStage = query({
  args: { lifecycleStage: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("companies")
      .filter((q) => q.eq(q.field("hubspotLifecycleStage"), args.lifecycleStage))
      .collect();
  },
});

