import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Save or update a planning application
 */
export const savePlanningApplication = mutation({
  args: {
    externalId: v.string(),
    source: v.union(
      v.literal("planning_data_api"),
      v.literal("london_datahub"),
      v.literal("other")
    ),
    localAuthority: v.optional(v.string()),
    councilName: v.optional(v.string()),
    siteAddress: v.optional(v.string()),
    sitePostcode: v.optional(v.string()),
    geometryReference: v.optional(v.string()),
    applicantName: v.optional(v.string()),
    applicantOrganisation: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("APPROVED"),
      v.literal("REFUSED"),
      v.literal("UNDER_CONSIDERATION"),
      v.literal("UNKNOWN")
    )),
    decisionDate: v.optional(v.string()),
    receivedDate: v.optional(v.string()),
    rawPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if planning application already exists
    const existing = await ctx.db
      .query("planningApplications")
      .withIndex("by_external_id", (q: any) =>
        q.eq("externalId", args.externalId)
      )
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        source: args.source,
        localAuthority: args.localAuthority,
        councilName: args.councilName,
        siteAddress: args.siteAddress,
        sitePostcode: args.sitePostcode,
        geometryReference: args.geometryReference,
        applicantName: args.applicantName,
        applicantOrganisation: args.applicantOrganisation,
        status: args.status,
        decisionDate: args.decisionDate,
        receivedDate: args.receivedDate,
        rawPayload: args.rawPayload,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Create new
      const planningAppId = await ctx.db.insert("planningApplications", {
        externalId: args.externalId,
        source: args.source,
        localAuthority: args.localAuthority,
        councilName: args.councilName,
        siteAddress: args.siteAddress,
        sitePostcode: args.sitePostcode,
        geometryReference: args.geometryReference,
        applicantName: args.applicantName,
        applicantOrganisation: args.applicantOrganisation,
        status: args.status,
        decisionDate: args.decisionDate,
        receivedDate: args.receivedDate,
        rawPayload: args.rawPayload,
        createdAt: now,
        updatedAt: now,
      });
      return planningAppId;
    }
  },
});

/**
 * Link a company to a planning application with confidence
 */
export const linkCompanyToPlanning = mutation({
  args: {
    companyNumber: v.string(),
    planningApplicationId: v.id("planningApplications"),
    matchConfidence: v.union(
      v.literal("HIGH"),
      v.literal("MEDIUM"),
      v.literal("LOW")
    ),
    matchReason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if link already exists
    const existing = await ctx.db
      .query("companyPlanningLinks")
      .withIndex("by_company_number", (q: any) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .filter((q) =>
        q.eq(q.field("planningApplicationId"), args.planningApplicationId)
      )
      .first();

    if (existing) {
      // Update existing link (might have better confidence now)
      await ctx.db.patch(existing._id, {
        matchConfidence: args.matchConfidence,
        matchReason: args.matchReason,
      });
      return existing._id;
    } else {
      // Create new link
      const linkId = await ctx.db.insert("companyPlanningLinks", {
        companyNumber: args.companyNumber,
        planningApplicationId: args.planningApplicationId,
        matchConfidence: args.matchConfidence,
        matchReason: args.matchReason,
        createdAt: now,
      });
      return linkId;
    }
  },
});

/**
 * Get planning applications for a company
 */
export const getPlanningApplicationsForCompany = query({
  args: { companyNumber: v.string() },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("companyPlanningLinks")
      .withIndex("by_company_number", (q: any) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .collect();

    // Fetch planning application details for each link
    const planningApps = await Promise.all(
      links.map(async (link) => {
        const app = await ctx.db.get(link.planningApplicationId);
        return {
          ...link,
          planningApplication: app,
        };
      })
    );

    return planningApps;
  },
});

/**
 * Get planning application by external ID
 */
export const getPlanningApplicationByExternalId = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("planningApplications")
      .withIndex("by_external_id", (q: any) =>
        q.eq("externalId", args.externalId)
      )
      .first();
  },
});

