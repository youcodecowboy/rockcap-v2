import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Save or update a property title
 */
export const savePropertyTitle = mutation({
  args: {
    titleNumber: v.string(),
    country: v.optional(v.string()),
    address: v.optional(v.string()),
    postcode: v.optional(v.string()),
    geometrySource: v.optional(v.union(
      v.literal("none"),
      v.literal("inspire_index"),
      v.literal("nps")
    )),
    geometryReference: v.optional(v.string()),
    rawPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if property title already exists
    const existing = await ctx.db
      .query("propertyTitles")
      .withIndex("by_title_number", (q) =>
        q.eq("titleNumber", args.titleNumber)
      )
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        country: args.country,
        address: args.address,
        postcode: args.postcode,
        geometrySource: args.geometrySource,
        geometryReference: args.geometryReference,
        rawPayload: args.rawPayload,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Create new
      const propertyTitleId = await ctx.db.insert("propertyTitles", {
        titleNumber: args.titleNumber,
        country: args.country,
        address: args.address,
        postcode: args.postcode,
        geometrySource: args.geometrySource,
        geometryReference: args.geometryReference,
        rawPayload: args.rawPayload,
        createdAt: now,
        updatedAt: now,
      });
      return propertyTitleId;
    }
  },
});

/**
 * Link a company to a property title
 */
export const linkCompanyToProperty = mutation({
  args: {
    companyNumber: v.string(),
    propertyTitleId: v.id("propertyTitles"),
    ownershipType: v.optional(v.union(
      v.literal("FREEHOLD"),
      v.literal("LEASEHOLD"),
      v.literal("UNKNOWN")
    )),
    fromDataset: v.union(
      v.literal("uk_companies_own_property"),
      v.literal("overseas_companies_own_property")
    ),
    acquiredDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if link already exists
    const existing = await ctx.db
      .query("companyPropertyLinks")
      .withIndex("by_company_number", (q) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .filter((q) =>
        q.eq(q.field("propertyTitleId"), args.propertyTitleId)
      )
      .first();

    if (existing) {
      // Update existing link
      await ctx.db.patch(existing._id, {
        ownershipType: args.ownershipType,
        fromDataset: args.fromDataset,
        acquiredDate: args.acquiredDate,
      });
      return existing._id;
    } else {
      // Create new link
      const linkId = await ctx.db.insert("companyPropertyLinks", {
        companyNumber: args.companyNumber,
        propertyTitleId: args.propertyTitleId,
        ownershipType: args.ownershipType,
        fromDataset: args.fromDataset,
        acquiredDate: args.acquiredDate,
        createdAt: now,
      });
      return linkId;
    }
  },
});

/**
 * Get properties for a company
 */
export const getPropertiesForCompany = query({
  args: { companyNumber: v.string() },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("companyPropertyLinks")
      .withIndex("by_company_number", (q) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .collect();

    // Fetch property title details for each link
    const properties = await Promise.all(
      links.map(async (link) => {
        const property = await ctx.db.get(link.propertyTitleId);
        return {
          ...link,
          propertyTitle: property,
        };
      })
    );

    return properties;
  },
});

/**
 * Get property title by title number
 */
export const getPropertyTitleByTitleNumber = query({
  args: { titleNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("propertyTitles")
      .withIndex("by_title_number", (q) =>
        q.eq("titleNumber", args.titleNumber)
      )
      .first();
  },
});

