import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

/**
 * Create a company manually (not from HubSpot)
 */
export const create = mutation({
  args: {
    name: v.string(),
    domain: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
    type: v.optional(v.string()),
    website: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    linkedContactIds: v.optional(v.array(v.id("contacts"))),
  },
  handler: async (ctx, args) => {
    // Generate a unique ID for manual entries (not from HubSpot)
    const manualHubspotId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const companyId = await ctx.db.insert("companies", {
      name: args.name,
      domain: args.domain,
      phone: args.phone,
      address: args.address,
      city: args.city,
      state: args.state,
      zip: args.zip,
      country: args.country,
      industry: args.industry,
      type: args.type,
      website: args.website,
      tags: args.tags,
      notes: args.notes,
      hubspotCompanyId: manualHubspotId,
      linkedContactIds: args.linkedContactIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Update linked contacts to include this company
    if (args.linkedContactIds && args.linkedContactIds.length > 0) {
      for (const contactId of args.linkedContactIds) {
        const contact = await ctx.db.get(contactId);
        if (contact) {
          const existingCompanyIds = contact.linkedCompanyIds || [];
          if (!existingCompanyIds.includes(companyId)) {
            await ctx.db.patch(contactId, {
              linkedCompanyIds: [...existingCompanyIds, companyId],
            });
          }
        }
      }
    }

    return companyId;
  },
});

/**
 * Promote a company to a client
 * Creates a client record from the company data and links them
 */
export const promoteToClient = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.id);
    if (!company) {
      throw new Error("Company not found");
    }

    // Check if already promoted
    if (company.promotedToClientId) {
      return company.promotedToClientId;
    }

    // Determine source - use hubspot if it's from HubSpot, otherwise manual
    const isFromHubSpot = !company.hubspotCompanyId.startsWith("manual-");
    const source = isFromHubSpot ? "hubspot" : "manual";

    // Create client from company data
    const clientId = await ctx.db.insert("clients", {
      name: company.name,
      type: company.type,
      status: "active", // Default to active when promoted
      companyName: company.name,
      address: company.address,
      city: company.city,
      state: company.state,
      zip: company.zip,
      country: company.country,
      phone: company.phone,
      website: company.website,
      industry: company.industry,
      tags: company.tags,
      notes: company.notes,
      source: source as "hubspot" | "manual",
      createdAt: new Date().toISOString(),
      // Preserve HubSpot data if available
      hubspotCompanyId: isFromHubSpot ? company.hubspotCompanyId : undefined,
      hubspotUrl: company.hubspotUrl,
      lastHubSpotSync: company.lastHubSpotSync,
      hubspotLifecycleStage: company.hubspotLifecycleStageName,
    });

    // Update company to link to the client
    await ctx.db.patch(args.id, {
      promotedToClientId: clientId,
    });

    return clientId;
  },
});

