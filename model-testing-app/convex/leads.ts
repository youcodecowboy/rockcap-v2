import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all leads
 */
export const getAllLeads = query({
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    
    // Fetch associated contacts and companies
    const leadsWithDetails = await Promise.all(
      leads.map(async (lead) => {
        const contact = await ctx.db.get(lead.contactId);
        const company = lead.companyId ? await ctx.db.get(lead.companyId) : null;
        
        return {
          ...lead,
          contact,
          company,
        };
      })
    );
    
    return leadsWithDetails;
  },
});

/**
 * Get lead by ID
 */
export const getLeadById = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return null;
    
    const contact = await ctx.db.get(lead.contactId);
    const company = lead.companyId ? await ctx.db.get(lead.companyId) : null;
    
    return {
      ...lead,
      contact,
      company,
    };
  },
});

/**
 * Get leads by lifecycle stage
 */
export const getLeadsByLifecycleStage = query({
  args: { lifecycleStage: v.union(
    v.literal("lead"),
    v.literal("opportunity"),
    v.literal("marketingqualifiedlead"),
    v.literal("salesqualifiedlead")
  ) },
  handler: async (ctx, args) => {
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_lifecycle_stage", (q) => q.eq("lifecycleStage", args.lifecycleStage))
      .collect();
    
    const leadsWithDetails = await Promise.all(
      leads.map(async (lead) => {
        const contact = await ctx.db.get(lead.contactId);
        const company = lead.companyId ? await ctx.db.get(lead.companyId) : null;
        
        return {
          ...lead,
          contact,
          company,
        };
      })
    );
    
    return leadsWithDetails;
  },
});

/**
 * Get leads by status
 */
export const getLeadsByStatus = query({
  args: { status: v.union(
    v.literal("new"),
    v.literal("contacted"),
    v.literal("qualified"),
    v.literal("nurturing"),
    v.literal("converted"),
    v.literal("lost")
  ) },
  handler: async (ctx, args) => {
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
    
    const leadsWithDetails = await Promise.all(
      leads.map(async (lead) => {
        const contact = await ctx.db.get(lead.contactId);
        const company = lead.companyId ? await ctx.db.get(lead.companyId) : null;
        
        return {
          ...lead,
          contact,
          company,
        };
      })
    );
    
    return leadsWithDetails;
  },
});

