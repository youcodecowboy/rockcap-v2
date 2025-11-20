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
          .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotContactId", hubspotContactId))
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
          .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotDealId", hubspotDealId))
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
    const cleanedCompanyData: any = { hubspotCompanyId, ...cleaned };
    
    // First, check if company exists with this HubSpot ID
    const existingByHubSpotId = await ctx.db
      .query("companies")
      .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotCompanyId", hubspotCompanyId))
      .first();
    
    if (existingByHubSpotId) {
      // Update existing company (HubSpot data wins)
      // FIX: Merge metadata properly (not replace)
      const metadata = mergeMetadata(
        existingByHubSpotId.metadata,
        args.customProperties,
        args.metadata
      );
      
      const updatedAtDate = parseUpdatedAt(cleanedCompanyData.updatedAt);
      
      const cleanData: any = {
        name: cleanedCompanyData.name,
        hubspotLifecycleStage: cleanedCompanyData.lifecycleStage,
        hubspotUrl: cleanedCompanyData.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        metadata,
        updatedAt: updatedAtDate,
      };
      
      // Only include fields that have actual values
      if (cleanedCompanyData.lifecycleStageName) cleanData.hubspotLifecycleStageName = cleanedCompanyData.lifecycleStageName;
      if (cleanedCompanyData.hubspotOwnerId) cleanData.hubspotOwnerId = cleanedCompanyData.hubspotOwnerId;
      if (cleanedCompanyData.lastContactedDate) cleanData.lastContactedDate = cleanedCompanyData.lastContactedDate;
      if (cleanedCompanyData.lastActivityDate) cleanData.lastActivityDate = cleanedCompanyData.lastActivityDate;
      if (cleanedCompanyData.phone) cleanData.phone = cleanedCompanyData.phone;
      if (cleanedCompanyData.website) {
        cleanData.website = cleanedCompanyData.website;
        cleanData.domain = cleanedCompanyData.website;
      }
      if (cleanedCompanyData.address) cleanData.address = cleanedCompanyData.address;
      if (cleanedCompanyData.city) cleanData.city = cleanedCompanyData.city;
      if (cleanedCompanyData.state) cleanData.state = cleanedCompanyData.state;
      if (cleanedCompanyData.zip) cleanData.zip = cleanedCompanyData.zip;
      if (cleanedCompanyData.country) cleanData.country = cleanedCompanyData.country;
      if (cleanedCompanyData.industry) cleanData.industry = cleanedCompanyData.industry;
      if (cleanedCompanyData.hubspotContactIds && cleanedCompanyData.hubspotContactIds.length > 0) {
        cleanData.hubspotContactIds = cleanedCompanyData.hubspotContactIds;
      }
      if (cleanedCompanyData.hubspotDealIds && cleanedCompanyData.hubspotDealIds.length > 0) {
        cleanData.hubspotDealIds = cleanedCompanyData.hubspotDealIds;
      }
      
      await ctx.db.patch(existingByHubSpotId._id, cleanData);
      
      // Link contacts and deals
      await linkCompanyAssociations(
        ctx,
        existingByHubSpotId._id,
        cleanedCompanyData.hubspotContactIds,
        cleanedCompanyData.hubspotDealIds
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
      
      const updatedAtDate = parseUpdatedAt(cleanedCompanyData.updatedAt);
      
      const cleanData: any = {
        hubspotCompanyId,
        name: cleanedCompanyData.name,
        hubspotLifecycleStage: cleanedCompanyData.lifecycleStage,
        hubspotUrl: cleanedCompanyData.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        metadata,
        updatedAt: updatedAtDate,
      };
      
      // Only include fields that have actual values
      if (cleanedCompanyData.lifecycleStageName) cleanData.hubspotLifecycleStageName = cleanedCompanyData.lifecycleStageName;
      if (cleanedCompanyData.hubspotOwnerId) cleanData.hubspotOwnerId = cleanedCompanyData.hubspotOwnerId;
      if (cleanedCompanyData.lastContactedDate) cleanData.lastContactedDate = cleanedCompanyData.lastContactedDate;
      if (cleanedCompanyData.lastActivityDate) cleanData.lastActivityDate = cleanedCompanyData.lastActivityDate;
      
      // Merge with existing values
      const phone = cleanedCompanyData.phone || existingByName.phone;
      const website = cleanedCompanyData.website || existingByName.website;
      const address = cleanedCompanyData.address || existingByName.address;
      const city = cleanedCompanyData.city || existingByName.city;
      const state = cleanedCompanyData.state || existingByName.state;
      const zip = cleanedCompanyData.zip || existingByName.zip;
      const country = cleanedCompanyData.country || existingByName.country;
      const industry = cleanedCompanyData.industry || existingByName.industry;
      
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
      if (cleanedCompanyData.hubspotContactIds && cleanedCompanyData.hubspotContactIds.length > 0) {
        cleanData.hubspotContactIds = cleanedCompanyData.hubspotContactIds;
      }
      if (cleanedCompanyData.hubspotDealIds && cleanedCompanyData.hubspotDealIds.length > 0) {
        cleanData.hubspotDealIds = cleanedCompanyData.hubspotDealIds;
      }
      
      await ctx.db.patch(existingByName._id, cleanData);
      
      // Link contacts and deals
      await linkCompanyAssociations(
        ctx,
        existingByName._id,
        cleanedCompanyData.hubspotContactIds,
        cleanedCompanyData.hubspotDealIds
      );
      
      return { id: existingByName._id, action: "updated" };
    }
    
    // Create new company
    const metadata = mergeMetadata(undefined, args.customProperties, args.metadata);
    const createdAtDate = parseCreatedAt(cleanedCompanyData.createdAt);
    const updatedAtDate = parseUpdatedAt(cleanedCompanyData.updatedAt);
    
    const companyDataClean: any = {
      hubspotCompanyId,
      name: cleanedCompanyData.name,
      hubspotLifecycleStage: cleanedCompanyData.lifecycleStage,
      hubspotUrl: cleanedCompanyData.hubspotUrl,
      lastHubSpotSync: new Date().toISOString(),
      metadata,
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
    };
    
    // Only include fields that have actual values
    if (cleanedCompanyData.lifecycleStageName) companyDataClean.hubspotLifecycleStageName = cleanedCompanyData.lifecycleStageName;
    if (cleanedCompanyData.hubspotOwnerId) companyDataClean.hubspotOwnerId = cleanedCompanyData.hubspotOwnerId;
    if (cleanedCompanyData.lastContactedDate) companyDataClean.lastContactedDate = cleanedCompanyData.lastContactedDate;
    if (cleanedCompanyData.lastActivityDate) companyDataClean.lastActivityDate = cleanedCompanyData.lastActivityDate;
    if (cleanedCompanyData.phone) companyDataClean.phone = cleanedCompanyData.phone;
    if (cleanedCompanyData.website) {
      companyDataClean.website = cleanedCompanyData.website;
      companyDataClean.domain = cleanedCompanyData.website;
    }
    if (cleanedCompanyData.address) companyDataClean.address = cleanedCompanyData.address;
    if (cleanedCompanyData.city) companyDataClean.city = cleanedCompanyData.city;
    if (cleanedCompanyData.state) companyDataClean.state = cleanedCompanyData.state;
    if (cleanedCompanyData.zip) companyDataClean.zip = cleanedCompanyData.zip;
    if (cleanedCompanyData.country) companyDataClean.country = cleanedCompanyData.country;
    if (cleanedCompanyData.industry) companyDataClean.industry = cleanedCompanyData.industry;
    if (cleanedCompanyData.hubspotContactIds && cleanedCompanyData.hubspotContactIds.length > 0) {
      companyDataClean.hubspotContactIds = cleanedCompanyData.hubspotContactIds;
    }
    if (cleanedCompanyData.hubspotDealIds && cleanedCompanyData.hubspotDealIds.length > 0) {
      companyDataClean.hubspotDealIds = cleanedCompanyData.hubspotDealIds;
    }
    
    const companyId = await ctx.db.insert("companies", companyDataClean);
    
    // Link contacts and deals
    await linkCompanyAssociations(
      ctx,
      companyId,
      cleanedCompanyData.hubspotContactIds,
      cleanedCompanyData.hubspotDealIds
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
      .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotCompanyId", hubspotCompanyId))
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

