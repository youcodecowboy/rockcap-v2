import { v } from "convex/values";
import { mutation } from "../_generated/server";
import {
    cleanArgs as cleanArgsUtil,
    parseCreatedAt,
    parseUpdatedAt,
    mergeMetadata
} from "./utils";

/**
 * Helper function to map deal stage to deal status
 */
function mapDealStageToStatus(stage?: string): "new" | "contacted" | "qualified" | "negotiation" | "closed-won" | "closed-lost" {
  if (!stage) return "new";
  
  const stageLower = stage.toLowerCase();
  if (stageLower.includes('closed-won') || stageLower.includes('closedwon')) {
    return "closed-won";
  } else if (stageLower.includes('closed-lost') || stageLower.includes('closedlost')) {
    return "closed-lost";
  } else if (stageLower.includes('qualified')) {
    return "qualified";
  } else if (stageLower.includes('contacted')) {
    return "contacted";
  } else if (stageLower.includes('negotiation')) {
    return "negotiation";
  }
  return "new";
}

/**
 * Helper function to link contacts and companies to a deal
 */
async function linkDealAssociations(
  ctx: any,
  dealId: any,
  contactIds?: string[],
  companyIds?: string[]
) {
  // Link contacts
  if (contactIds && contactIds.length > 0) {
    try {
      const linkedContactIds: any[] = [];
      const seenContactIds = new Set<string>();
      for (const hubspotContactId of contactIds) {
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
        await ctx.db.patch(dealId, { linkedContactIds: linkedContactIds as any });
      }
    } catch (linkError) {
      console.error('Error linking contacts to deal:', linkError);
    }
  }
  
  // Link companies
  if (companyIds && companyIds.length > 0) {
    try {
      const linkedCompanyIds: any[] = [];
      const seenCompanyIds = new Set<string>();
      for (const hubspotCompanyId of companyIds) {
        if (seenCompanyIds.has(hubspotCompanyId)) continue;
        seenCompanyIds.add(hubspotCompanyId);
        
        const company = await ctx.db
          .query("companies")
          .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotCompanyId", hubspotCompanyId))
          .first();
        if (company && !linkedCompanyIds.some(id => id === company._id)) {
          linkedCompanyIds.push(company._id as any);
        }
      }
      if (linkedCompanyIds.length > 0) {
        await ctx.db.patch(dealId, { linkedCompanyIds: linkedCompanyIds as any });
      }
    } catch (linkError) {
      console.error('Error linking companies to deal:', linkError);
    }
  }
}

/**
 * Create or update deal in deals table from HubSpot deal data (for prospecting)
 */
export const syncDealToDealsTable = mutation({
  args: {
    hubspotDealId: v.string(),
    name: v.string(),
    amount: v.optional(v.number()),
    stage: v.optional(v.string()), // Stage ID
    stageName: v.optional(v.string()), // Stage name (human-readable)
    pipeline: v.optional(v.string()), // Pipeline ID
    pipelineName: v.optional(v.string()), // Pipeline name (human-readable)
    closeDate: v.optional(v.string()),
    dealType: v.optional(v.string()),
    nextStep: v.optional(v.string()),
    hubspotOwnerId: v.optional(v.string()), // HubSpot owner/user ID
    lastContactedDate: v.optional(v.string()),
    lastActivityDate: v.optional(v.string()),
    contactIds: v.optional(v.array(v.string())), // HubSpot contact IDs
    companyIds: v.optional(v.array(v.string())), // HubSpot company IDs
    customProperties: v.optional(v.any()),
    hubspotUrl: v.optional(v.string()),
    metadata: v.optional(v.any()), // Custom properties from HubSpot
    createdAt: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { hubspotDealId, contactIds, companyIds, ...dealData } = args;
    
    // Clean args - filter out null/undefined values
    const cleaned = cleanArgsUtil(dealData);
    const cleanArgs: any = { hubspotDealId, ...cleaned };
    if (contactIds) cleanArgs.contactIds = contactIds;
    if (companyIds) cleanArgs.companyIds = companyIds;
    
    // Check if deal exists with this HubSpot ID
    const existingDeal = await ctx.db
      .query("deals")
      .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotDealId", hubspotDealId))
      .first();
    
    if (existingDeal) {
      // Update existing deal
      const metadata = mergeMetadata(
        existingDeal.metadata,
        cleanArgs.customProperties,
        cleanArgs.metadata
      );
      
      // Map deal stage to status
      let status = existingDeal.status;
      if (cleanArgs.stage) {
        status = mapDealStageToStatus(cleanArgs.stage);
      }
      
      const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt);
      
      const updateData: any = {
        name: cleanArgs.name,
        status,
        hubspotUrl: cleanArgs.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        metadata,
        updatedAt: updatedAtDate,
      };
      
      // Only include fields that have actual values
      if (cleanArgs.amount !== undefined && cleanArgs.amount !== null && !isNaN(cleanArgs.amount)) {
        updateData.amount = cleanArgs.amount;
      }
      if (cleanArgs.stage) updateData.stage = cleanArgs.stage;
      if (cleanArgs.stageName) updateData.stageName = cleanArgs.stageName;
      if (cleanArgs.pipeline) updateData.pipeline = cleanArgs.pipeline;
      if (cleanArgs.pipelineName) updateData.pipelineName = cleanArgs.pipelineName;
      if (cleanArgs.closeDate) updateData.closeDate = cleanArgs.closeDate;
      if (cleanArgs.dealType) updateData.dealType = cleanArgs.dealType;
      if (cleanArgs.nextStep) updateData.nextStep = cleanArgs.nextStep;
      if (cleanArgs.hubspotOwnerId) updateData.hubspotOwnerId = cleanArgs.hubspotOwnerId;
      if (cleanArgs.lastContactedDate) updateData.lastContactedDate = cleanArgs.lastContactedDate;
      if (cleanArgs.lastActivityDate) updateData.lastActivityDate = cleanArgs.lastActivityDate;
      if (contactIds && contactIds.length > 0) updateData.contactIds = contactIds;
      if (companyIds && companyIds.length > 0) updateData.companyIds = companyIds;
      
      await ctx.db.patch(existingDeal._id, updateData);
      
      // Link contacts and companies
      await linkDealAssociations(ctx, existingDeal._id, contactIds, companyIds);
      
      return { id: existingDeal._id, action: "updated" };
    }
    
    // Create new deal
    const metadata = mergeMetadata(undefined, cleanArgs.customProperties, cleanArgs.metadata);
    const status = mapDealStageToStatus(cleanArgs.stage);
    const createdAtDate = parseCreatedAt(cleanArgs.createdAt);
    const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt);
    
    const dealDataClean: any = {
      hubspotDealId,
      name: cleanArgs.name,
      status,
      hubspotUrl: cleanArgs.hubspotUrl,
      lastHubSpotSync: new Date().toISOString(),
      metadata,
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
    };
    
    // Only include fields that have actual values
    if (cleanArgs.amount !== undefined && cleanArgs.amount !== null && !isNaN(cleanArgs.amount)) {
      dealDataClean.amount = cleanArgs.amount;
    }
    if (cleanArgs.stage) dealDataClean.stage = cleanArgs.stage;
    if (cleanArgs.stageName) dealDataClean.stageName = cleanArgs.stageName;
    if (cleanArgs.pipeline) dealDataClean.pipeline = cleanArgs.pipeline;
    if (cleanArgs.pipelineName) dealDataClean.pipelineName = cleanArgs.pipelineName;
    if (cleanArgs.closeDate) dealDataClean.closeDate = cleanArgs.closeDate;
    if (cleanArgs.dealType) dealDataClean.dealType = cleanArgs.dealType;
    if (cleanArgs.nextStep) dealDataClean.nextStep = cleanArgs.nextStep;
    if (cleanArgs.hubspotOwnerId) dealDataClean.hubspotOwnerId = cleanArgs.hubspotOwnerId;
    if (cleanArgs.lastContactedDate) dealDataClean.lastContactedDate = cleanArgs.lastContactedDate;
    if (cleanArgs.lastActivityDate) dealDataClean.lastActivityDate = cleanArgs.lastActivityDate;
    if (contactIds && contactIds.length > 0) dealDataClean.contactIds = contactIds;
    if (companyIds && companyIds.length > 0) dealDataClean.companyIds = companyIds;
    
    const dealId = await ctx.db.insert("deals", dealDataClean);
    
    // Link contacts and companies
    await linkDealAssociations(ctx, dealId, contactIds, companyIds);
    
    return { id: dealId, action: "created" };
  },
});

/**
 * Create or update project from HubSpot deal data (legacy - for backward compatibility)
 */
export const syncDealFromHubSpot = mutation({
  args: {
    hubspotDealId: v.string(),
    name: v.string(),
    amount: v.optional(v.number()),
    stage: v.optional(v.string()),
    pipeline: v.optional(v.string()),
    closeDate: v.optional(v.string()),
    associatedCompanyIds: v.optional(v.array(v.string())),
    customProperties: v.optional(v.any()),
    hubspotUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { hubspotDealId, associatedCompanyIds, ...dealData } = args;
    
    // First, check if project exists with this HubSpot deal ID
    const allProjects = await ctx.db.query("projects").collect();
    const existingByHubSpotId = allProjects.find(p => 
      (p as any).hubspotDealId === hubspotDealId
    );
    
    if (existingByHubSpotId) {
      // Update existing project
      const metadata = mergeMetadata(existingByHubSpotId.metadata, args.customProperties);
      
      // Map deal stage to project status
      let status = existingByHubSpotId.status;
      if (args.stage) {
        const stageLower = args.stage.toLowerCase();
        if (stageLower.includes('closed-won') || stageLower.includes('closedwon')) {
          status = "completed";
        } else if (stageLower.includes('closed-lost') || stageLower.includes('closedlost')) {
          status = "cancelled";
        } else {
          status = "active";
        }
      }
      
      await ctx.db.patch(existingByHubSpotId._id, {
        name: dealData.name,
        loanAmount: args.amount,
        hubspotStage: args.stage,
        hubspotPipeline: args.pipeline,
        endDate: args.closeDate,
        status,
        hubspotUrl: args.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        metadata,
      });
      return { id: existingByHubSpotId._id, action: "updated" };
    }
    
    // Try to find associated clients by HubSpot company ID
    const clientRoles: Array<{ clientId: string; role: string }> = [];
    if (associatedCompanyIds && associatedCompanyIds.length > 0) {
      for (const companyId of associatedCompanyIds) {
        const client = await ctx.db
          .query("clients")
          .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotCompanyId", companyId))
          .first();
        
        if (client) {
          clientRoles.push({
            clientId: client._id,
            role: "client", // Default role
          });
        }
      }
    }
    
    // Create new project
    const metadata = mergeMetadata(undefined, args.customProperties);
    
    let status: "active" | "inactive" | "completed" | "on-hold" | "cancelled" = "active";
    if (args.stage) {
      const stageLower = args.stage.toLowerCase();
      if (stageLower.includes('closed-won') || stageLower.includes('closedwon')) {
        status = "completed";
      } else if (stageLower.includes('closed-lost') || stageLower.includes('closedlost')) {
        status = "cancelled";
      }
    }
    
    const projectId = await ctx.db.insert("projects", {
      hubspotDealId,
      name: dealData.name,
      clientRoles: clientRoles.length > 0 ? clientRoles : [],
      loanAmount: args.amount,
      hubspotStage: args.stage,
      hubspotPipeline: args.pipeline,
      endDate: args.closeDate,
      status,
      hubspotUrl: args.hubspotUrl,
      lastHubSpotSync: new Date().toISOString(),
      metadata,
      createdAt: new Date().toISOString(),
    });
    
    return { id: projectId, action: "created" };
  },
});

