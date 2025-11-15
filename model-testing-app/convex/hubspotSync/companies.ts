import { v } from "convex/values";
import { mutation } from "../_generated/server";
import {
  cleanArgs,
  parseCreatedAt,
  parseUpdatedAt,
  mergeMetadata,
  mapLifecycleStageToStatus,
} from "./utils";

/**
 * Helper function to link contacts and deals to a company
 */
async function linkCompanyAssociations(
  ctx: any,
  companyId: any,
  hubspotContactIds?: string[],
  hubspotDealIds?: string[]
) {
  // Link contacts
  if (hubspotContactIds && hubspotContactIds.length > 0) {
    try {
      const linkedContactIds: any[] = [];
      const seenContactIds = new Set<string>();
      for (const hubspotContactId of hubspotContactIds) {
        if (seenContactIds.has(hubspotContactId)) continue;
        seenContactIds.add(hubspotContactId);
        
        const contact = await ctx.db
          .query("contacts")
          .withIndex("by_hubspot_id", (q) => q.eq("hubspotContactId", hubspotContactId))
          .first();
        if (contact && !linkedContactIds.some(id => id === contact._id)) {
          linkedContactIds.push(contact._id as any);
        }
      }
      if (linkedContactIds.length > 0) {
        await ctx.db.patch(companyId, { linkedContactIds: linkedContactIds as any });
      }
    } catch (linkError) {
      console.error('Error linking contacts to company:', linkError);
    }
  }
  
  // Link deals
  if (hubspotDealIds && hubspotDealIds.length > 0) {
    try {
      const linkedDealIds: any[] = [];
      const seenDealIds = new Set<string>();
      for (const hubspotDealId of hubspotDealIds) {
        if (seenDealIds.has(hubspotDealId)) continue;
        seenDealIds.add(hubspotDealId);
        
        const deal = await ctx.db
          .query("deals")
          .withIndex("by_hubspot_id", (q) => q.eq("hubspotDealId", hubspotDealId))
          .first();
        if (deal && !linkedDealIds.some(id => id === deal._id)) {
          linkedDealIds.push(deal._id as any);
        }
      }
      if (linkedDealIds.length > 0) {
        await ctx.db.patch(companyId, { linkedDealIds: linkedDealIds as any });
      }
    } catch (linkError) {
      console.error('Error linking deals to company:', linkError);
    }
  }
}

/**
 * Create or update company from HubSpot company data (separate from clients)
 * Companies are prospects that can be promoted to clients later
 */
export const syncCompanyFromHubSpot = mutation({
  args: {
    hubspotCompanyId: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
    lifecycleStage: v.optional(v.string()), // Lifecycle stage ID
    lifecycleStageName: v.optional(v.string()), // Lifecycle stage name (human-readable)
    hubspotOwnerId: v.optional(v.string()), // HubSpot owner/user ID
    hubspotContactIds: v.optional(v.array(v.string())), // HubSpot contact IDs (multiple contacts)
    hubspotDealIds: v.optional(v.array(v.string())), // HubSpot deal IDs (multiple deals)
    lastContactedDate: v.optional(v.string()),
    lastActivityDate: v.optional(v.string()),
    customProperties: v.optional(v.any()),
    hubspotUrl: v.optional(v.string()),
    metadata: v.optional(v.any()), // Custom properties from HubSpot
    createdAt: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { hubspotCompanyId, ...companyData } = args;
    
    // Clean args - filter out null/undefined/empty values
    const cleaned = cleanArgs(companyData);
    const cleanArgs: any = { hubspotCompanyId, ...cleaned };
    
    // First, check if company exists with this HubSpot ID
    const existingByHubSpotId = await ctx.db
      .query("companies")
      .withIndex("by_hubspot_id", (q) => q.eq("hubspotCompanyId", hubspotCompanyId))
      .first();
    
    if (existingByHubSpotId) {
      // Update existing company (HubSpot data wins)
      // FIX: Merge metadata properly (not replace)
      const metadata = mergeMetadata(
        existingByHubSpotId.metadata,
        args.customProperties,
        args.metadata
      );
      
      const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt);
      
      const cleanData: any = {
        name: cleanArgs.name,
        hubspotLifecycleStage: cleanArgs.lifecycleStage,
        hubspotUrl: cleanArgs.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        metadata,
        updatedAt: updatedAtDate,
      };
      
      // Only include fields that have actual values
      if (cleanArgs.lifecycleStageName) cleanData.hubspotLifecycleStageName = cleanArgs.lifecycleStageName;
      if (cleanArgs.hubspotOwnerId) cleanData.hubspotOwnerId = cleanArgs.hubspotOwnerId;
      if (cleanArgs.lastContactedDate) cleanData.lastContactedDate = cleanArgs.lastContactedDate;
      if (cleanArgs.lastActivityDate) cleanData.lastActivityDate = cleanArgs.lastActivityDate;
      if (cleanArgs.phone) cleanData.phone = cleanArgs.phone;
      if (cleanArgs.website) {
        cleanData.website = cleanArgs.website;
        cleanData.domain = cleanArgs.website;
      }
      if (cleanArgs.address) cleanData.address = cleanArgs.address;
      if (cleanArgs.city) cleanData.city = cleanArgs.city;
      if (cleanArgs.state) cleanData.state = cleanArgs.state;
      if (cleanArgs.zip) cleanData.zip = cleanArgs.zip;
      if (cleanArgs.country) cleanData.country = cleanArgs.country;
      if (cleanArgs.industry) cleanData.industry = cleanArgs.industry;
      if (cleanArgs.hubspotContactIds && cleanArgs.hubspotContactIds.length > 0) {
        cleanData.hubspotContactIds = cleanArgs.hubspotContactIds;
      }
      if (cleanArgs.hubspotDealIds && cleanArgs.hubspotDealIds.length > 0) {
        cleanData.hubspotDealIds = cleanArgs.hubspotDealIds;
      }
      
      await ctx.db.patch(existingByHubSpotId._id, cleanData);
      
      // Link contacts and deals
      await linkCompanyAssociations(
        ctx,
        existingByHubSpotId._id,
        cleanArgs.hubspotContactIds,
        cleanArgs.hubspotDealIds
      );
      
      return { id: existingByHubSpotId._id, action: "updated" };
    }
    
    // Check for duplicate by name (case-insensitive)
    const allCompanies = await ctx.db.query("companies").collect();
    const existingByName = allCompanies.find(c => 
      c.name.toLowerCase() === companyData.name.toLowerCase()
    );
    
    if (existingByName) {
      // Update existing company with HubSpot data
      const metadata = mergeMetadata(
        existingByName.metadata,
        args.customProperties,
        args.metadata
      );
      
      const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt);
      
      const cleanData: any = {
        hubspotCompanyId,
        name: cleanArgs.name,
        hubspotLifecycleStage: cleanArgs.lifecycleStage,
        hubspotUrl: cleanArgs.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        metadata,
        updatedAt: updatedAtDate,
      };
      
      // Only include fields that have actual values
      if (cleanArgs.lifecycleStageName) cleanData.hubspotLifecycleStageName = cleanArgs.lifecycleStageName;
      if (cleanArgs.hubspotOwnerId) cleanData.hubspotOwnerId = cleanArgs.hubspotOwnerId;
      if (cleanArgs.lastContactedDate) cleanData.lastContactedDate = cleanArgs.lastContactedDate;
      if (cleanArgs.lastActivityDate) cleanData.lastActivityDate = cleanArgs.lastActivityDate;
      
      // Merge with existing values
      const phone = cleanArgs.phone || existingByName.phone;
      const website = cleanArgs.website || existingByName.website;
      const address = cleanArgs.address || existingByName.address;
      const city = cleanArgs.city || existingByName.city;
      const state = cleanArgs.state || existingByName.state;
      const zip = cleanArgs.zip || existingByName.zip;
      const country = cleanArgs.country || existingByName.country;
      const industry = cleanArgs.industry || existingByName.industry;
      
      if (phone) cleanData.phone = phone;
      if (website) {
        cleanData.website = website;
        cleanData.domain = website;
      }
      if (address) cleanData.address = address;
      if (city) cleanData.city = city;
      if (state) cleanData.state = state;
      if (zip) cleanData.zip = zip;
      if (country) cleanData.country = country;
      if (industry) cleanData.industry = industry;
      if (cleanArgs.hubspotContactIds && cleanArgs.hubspotContactIds.length > 0) {
        cleanData.hubspotContactIds = cleanArgs.hubspotContactIds;
      }
      if (cleanArgs.hubspotDealIds && cleanArgs.hubspotDealIds.length > 0) {
        cleanData.hubspotDealIds = cleanArgs.hubspotDealIds;
      }
      
      await ctx.db.patch(existingByName._id, cleanData);
      
      // Link contacts and deals
      await linkCompanyAssociations(
        ctx,
        existingByName._id,
        cleanArgs.hubspotContactIds,
        cleanArgs.hubspotDealIds
      );
      
      return { id: existingByName._id, action: "updated" };
    }
    
    // Create new company
    const metadata = mergeMetadata(undefined, args.customProperties, args.metadata);
    const createdAtDate = parseCreatedAt(cleanArgs.createdAt);
    const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt);
    
    const companyDataClean: any = {
      hubspotCompanyId,
      name: cleanArgs.name,
      hubspotLifecycleStage: cleanArgs.lifecycleStage,
      hubspotUrl: cleanArgs.hubspotUrl,
      lastHubSpotSync: new Date().toISOString(),
      metadata,
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
    };
    
    // Only include fields that have actual values
    if (cleanArgs.lifecycleStageName) companyDataClean.hubspotLifecycleStageName = cleanArgs.lifecycleStageName;
    if (cleanArgs.hubspotOwnerId) companyDataClean.hubspotOwnerId = cleanArgs.hubspotOwnerId;
    if (cleanArgs.lastContactedDate) companyDataClean.lastContactedDate = cleanArgs.lastContactedDate;
    if (cleanArgs.lastActivityDate) companyDataClean.lastActivityDate = cleanArgs.lastActivityDate;
    if (cleanArgs.phone) companyDataClean.phone = cleanArgs.phone;
    if (cleanArgs.website) {
      companyDataClean.website = cleanArgs.website;
      companyDataClean.domain = cleanArgs.website;
    }
    if (cleanArgs.address) companyDataClean.address = cleanArgs.address;
    if (cleanArgs.city) companyDataClean.city = cleanArgs.city;
    if (cleanArgs.state) companyDataClean.state = cleanArgs.state;
    if (cleanArgs.zip) companyDataClean.zip = cleanArgs.zip;
    if (cleanArgs.country) companyDataClean.country = cleanArgs.country;
    if (cleanArgs.industry) companyDataClean.industry = cleanArgs.industry;
    if (cleanArgs.hubspotContactIds && cleanArgs.hubspotContactIds.length > 0) {
      companyDataClean.hubspotContactIds = cleanArgs.hubspotContactIds;
    }
    if (cleanArgs.hubspotDealIds && cleanArgs.hubspotDealIds.length > 0) {
      companyDataClean.hubspotDealIds = cleanArgs.hubspotDealIds;
    }
    
    const companyId = await ctx.db.insert("companies", companyDataClean);
    
    // Link contacts and deals
    await linkCompanyAssociations(
      ctx,
      companyId,
      cleanArgs.hubspotContactIds,
      cleanArgs.hubspotDealIds
    );
    
    return { id: companyId, action: "created" };
  },
});

/**
 * Create or update client from HubSpot company data (legacy - for backward compatibility)
 * This now creates companies instead, but kept for existing code
 */
export const syncCompanyToClientFromHubSpot = mutation({
  args: {
    hubspotCompanyId: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
    lifecycleStage: v.optional(v.string()),
    customProperties: v.optional(v.any()),
    hubspotUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { hubspotCompanyId, ...companyData } = args;
    
    // First, check if client exists with this HubSpot ID
    const existingByHubSpotId = await ctx.db
      .query("clients")
      .withIndex("by_hubspot_id", (q) => q.eq("hubspotCompanyId", hubspotCompanyId))
      .first();
    
    if (existingByHubSpotId) {
      // Update existing client (HubSpot data wins)
      const status = mapLifecycleStageToStatus(args.lifecycleStage);
      const metadata = mergeMetadata(existingByHubSpotId.metadata, args.customProperties);
      
      await ctx.db.patch(existingByHubSpotId._id, {
        name: companyData.name,
        phone: companyData.phone,
        website: companyData.website,
        address: companyData.address,
        city: companyData.city,
        state: companyData.state,
        zip: companyData.zip,
        country: companyData.country,
        industry: companyData.industry,
        status,
        hubspotLifecycleStage: args.lifecycleStage,
        hubspotUrl: args.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        source: "hubspot",
        metadata,
      });
      return { id: existingByHubSpotId._id, action: "updated" };
    }
    
    // Check for duplicate by name (case-insensitive)
    const allClients = await ctx.db.query("clients").collect();
    const existingByName = allClients.find(c => 
      c.name.toLowerCase() === companyData.name.toLowerCase()
    );
    
    if (existingByName) {
      // Update existing client with HubSpot data
      const status = mapLifecycleStageToStatus(args.lifecycleStage);
      const metadata = mergeMetadata(existingByName.metadata, args.customProperties);
      
      await ctx.db.patch(existingByName._id, {
        hubspotCompanyId,
        name: companyData.name,
        phone: companyData.phone || existingByName.phone,
        website: companyData.website || existingByName.website,
        address: companyData.address || existingByName.address,
        city: companyData.city || existingByName.city,
        state: companyData.state || existingByName.state,
        zip: companyData.zip || existingByName.zip,
        country: companyData.country || existingByName.country,
        industry: companyData.industry || existingByName.industry,
        status,
        hubspotLifecycleStage: args.lifecycleStage,
        hubspotUrl: args.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        source: "hubspot",
        metadata,
      });
      return { id: existingByName._id, action: "updated" };
    }
    
    // Create new client
    const status = mapLifecycleStageToStatus(args.lifecycleStage);
    const metadata = mergeMetadata(undefined, args.customProperties);
    
    const clientId = await ctx.db.insert("clients", {
      hubspotCompanyId,
      name: companyData.name,
      phone: companyData.phone,
      website: companyData.website,
      address: companyData.address,
      city: companyData.city,
      state: companyData.state,
      zip: companyData.zip,
      country: companyData.country,
      industry: companyData.industry,
      status,
      hubspotLifecycleStage: args.lifecycleStage,
      hubspotUrl: args.hubspotUrl,
      lastHubSpotSync: new Date().toISOString(),
      source: "hubspot",
      metadata,
      createdAt: new Date().toISOString(),
    });
    
    return { id: clientId, action: "created" };
  },
});

