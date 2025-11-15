import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Link HubSpot contact IDs to our internal contacts table
 * This creates linkedContactIds array by matching HubSpot IDs
 */
export const linkContactsToDeal = mutation({
  args: {
    dealId: v.id("deals"),
    hubspotContactIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.dealId);
    if (!deal) {
      throw new Error(`Deal ${args.dealId} not found`);
    }

    const linkedContactIds: string[] = [];
    
    // For each HubSpot contact ID, find the matching contact in our database
    for (const hubspotContactId of args.hubspotContactIds) {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_hubspot_id", (q) => q.eq("hubspotContactId", hubspotContactId))
        .first();
      
      if (contact) {
        linkedContactIds.push(contact._id);
      }
    }

    // Update the deal with linked contact IDs
    await ctx.db.patch(args.dealId, {
      linkedContactIds: linkedContactIds.length > 0 ? linkedContactIds : undefined,
    });

    return { linkedCount: linkedContactIds.length };
  },
});

/**
 * Link HubSpot company IDs to our internal companies table
 * This creates linkedCompanyIds array by matching HubSpot IDs
 */
export const linkCompaniesToDeal = mutation({
  args: {
    dealId: v.id("deals"),
    hubspotCompanyIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.dealId);
    if (!deal) {
      throw new Error(`Deal ${args.dealId} not found`);
    }

    const linkedCompanyIds: string[] = [];
    
    // For each HubSpot company ID, find the matching company in our database
    for (const hubspotCompanyId of args.hubspotCompanyIds) {
      const company = await ctx.db
        .query("companies")
        .withIndex("by_hubspot_id", (q) => q.eq("hubspotCompanyId", hubspotCompanyId))
        .first();
      
      if (company) {
        linkedCompanyIds.push(company._id);
      }
    }

    // Update the deal with linked company IDs
    await ctx.db.patch(args.dealId, {
      linkedCompanyIds: linkedCompanyIds.length > 0 ? linkedCompanyIds : undefined,
    });

    return { linkedCount: linkedCompanyIds.length };
  },
});

/**
 * Link all contacts and companies for a deal
 */
export const linkAssociationsToDeal = mutation({
  args: {
    dealId: v.id("deals"),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.dealId);
    if (!deal) {
      throw new Error(`Deal ${args.dealId} not found`);
    }

    let contactsLinked = 0;
    let companiesLinked = 0;

    // Link contacts
    if (deal.contactIds && deal.contactIds.length > 0) {
      const linkedContactIds: string[] = [];
      for (const hubspotContactId of deal.contactIds) {
        const contact = await ctx.db
          .query("contacts")
          .withIndex("by_hubspot_id", (q) => q.eq("hubspotContactId", hubspotContactId))
          .first();
        
        if (contact) {
          linkedContactIds.push(contact._id);
        }
      }
      if (linkedContactIds.length > 0) {
        await ctx.db.patch(args.dealId, { linkedContactIds });
        contactsLinked = linkedContactIds.length;
      }
    }

    // Link companies
    if (deal.companyIds && deal.companyIds.length > 0) {
      const linkedCompanyIds: string[] = [];
      for (const hubspotCompanyId of deal.companyIds) {
        const company = await ctx.db
          .query("companies")
          .withIndex("by_hubspot_id", (q) => q.eq("hubspotCompanyId", hubspotCompanyId))
          .first();
        
        if (company) {
          linkedCompanyIds.push(company._id);
        }
      }
      if (linkedCompanyIds.length > 0) {
        await ctx.db.patch(args.dealId, { linkedCompanyIds });
        companiesLinked = linkedCompanyIds.length;
      }
    }

    return { contactsLinked, companiesLinked };
  },
});

