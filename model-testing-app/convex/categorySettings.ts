import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./authHelpers";

export type CategoryType = "client_status" | "client_type" | "client_tag" | "prospecting_stage";

/**
 * Get all active category settings for a specific type
 */
export const getByType = query({
  args: {
    categoryType: v.union(
      v.literal("client_status"),
      v.literal("client_type"),
      v.literal("client_tag"),
      v.literal("prospecting_stage")
    ),
  },
  handler: async (ctx, args) => {
    const categories = await ctx.db
      .query("categorySettings")
      .withIndex("by_category_type_and_active", (q) =>
        q.eq("categoryType", args.categoryType).eq("isActive", true)
      )
      .collect();

    // Sort by displayOrder
    return categories.sort((a, b) => a.displayOrder - b.displayOrder);
  },
});

/**
 * Get all category settings (including inactive) for a specific type
 */
export const getAllByType = query({
  args: {
    categoryType: v.union(
      v.literal("client_status"),
      v.literal("client_type"),
      v.literal("client_tag"),
      v.literal("prospecting_stage")
    ),
  },
  handler: async (ctx, args) => {
    const categories = await ctx.db
      .query("categorySettings")
      .withIndex("by_category_type", (q) => q.eq("categoryType", args.categoryType))
      .collect();

    // Sort by displayOrder
    return categories.sort((a, b) => a.displayOrder - b.displayOrder);
  },
});

/**
 * Get all category settings (for admin/settings page)
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("categorySettings").collect();
    return categories.sort((a, b) => {
      // Sort by categoryType first, then displayOrder
      if (a.categoryType !== b.categoryType) {
        const typeOrder = ["client_status", "client_type", "client_tag", "prospecting_stage"];
        return typeOrder.indexOf(a.categoryType) - typeOrder.indexOf(b.categoryType);
      }
      return a.displayOrder - b.displayOrder;
    });
  },
});

/**
 * Get a single category setting by ID
 */
export const getById = query({
  args: {
    id: v.id("categorySettings"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Create a new category setting
 */
export const create = mutation({
  args: {
    categoryType: v.union(
      v.literal("client_status"),
      v.literal("client_type"),
      v.literal("client_tag"),
      v.literal("prospecting_stage")
    ),
    name: v.string(),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    displayOrder: v.number(),
    hubspotMapping: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const userId = user._id.toString();

    // Check if a category with this name and type already exists
    const existing = await ctx.db
      .query("categorySettings")
      .withIndex("by_category_type", (q) => q.eq("categoryType", args.categoryType))
      .collect();

    const duplicate = existing.find((cat) => cat.name.toLowerCase() === args.name.toLowerCase());
    if (duplicate) {
      throw new Error(`A ${args.categoryType} with the name "${args.name}" already exists.`);
    }

    const now = new Date().toISOString();

    const id = await ctx.db.insert("categorySettings", {
      categoryType: args.categoryType,
      name: args.name.trim(),
      displayName: args.displayName?.trim() || args.name.trim(),
      description: args.description?.trim(),
      displayOrder: args.displayOrder,
      isSystemDefault: false,
      isActive: true,
      hubspotMapping: args.hubspotMapping,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Update an existing category setting
 */
export const update = mutation({
  args: {
    id: v.id("categorySettings"),
    name: v.optional(v.string()),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    displayOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    hubspotMapping: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const category = await ctx.db.get(args.id);

    if (!category) {
      throw new Error("Category setting not found.");
    }

    // Prevent editing system defaults (except isActive)
    if (category.isSystemDefault && args.name !== undefined) {
      throw new Error("Cannot modify system default categories.");
    }

    // Check for duplicate name if name is being changed
    if (args.name && args.name.toLowerCase() !== category.name.toLowerCase()) {
      const existing = await ctx.db
        .query("categorySettings")
        .withIndex("by_category_type", (q) => q.eq("categoryType", category.categoryType))
        .collect();

      const nameToCheck = args.name; // Store in a const to help TypeScript narrow the type
      const duplicate = existing.find(
        (cat) => cat._id !== args.id && cat.name.toLowerCase() === nameToCheck.toLowerCase()
      );
      if (duplicate) {
        throw new Error(
          `A ${category.categoryType} with the name "${nameToCheck}" already exists.`
        );
      }
    }

    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (args.name !== undefined) updateData.name = args.name.trim();
    if (args.displayName !== undefined)
      updateData.displayName = args.displayName.trim() || updateData.name || category.name;
    if (args.description !== undefined) updateData.description = args.description?.trim();
    if (args.displayOrder !== undefined) updateData.displayOrder = args.displayOrder;
    if (args.isActive !== undefined) updateData.isActive = args.isActive;
    if (args.hubspotMapping !== undefined) updateData.hubspotMapping = args.hubspotMapping;

    await ctx.db.patch(args.id, updateData);
    return args.id;
  },
});

/**
 * Remove a category setting (soft delete by setting isActive to false)
 */
export const remove = mutation({
  args: {
    id: v.id("categorySettings"),
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);

    if (!category) {
      throw new Error("Category setting not found.");
    }

    if (category.isSystemDefault) {
      throw new Error("Cannot delete system default categories.");
    }

    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: new Date().toISOString(),
    });

    return args.id;
  },
});

/**
 * Toggle active status of a category setting
 */
export const toggleActive = mutation({
  args: {
    id: v.id("categorySettings"),
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);

    if (!category) {
      throw new Error("Category setting not found.");
    }

    await ctx.db.patch(args.id, {
      isActive: !category.isActive,
      updatedAt: new Date().toISOString(),
    });

    return { id: args.id, isActive: !category.isActive };
  },
});

/**
 * Seed default category settings
 */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const userId = user._id.toString();

    // Check if defaults already exist
    const existing = await ctx.db.query("categorySettings").collect();
    if (existing.length > 0) {
      return { skipped: true, message: "Default category settings already exist." };
    }

    const now = new Date().toISOString();
    let count = 0;

    // Default client statuses
    const defaultStatuses = [
      { name: "prospect", displayName: "Prospect", displayOrder: 1 },
      { name: "active", displayName: "Active", displayOrder: 2 },
      { name: "archived", displayName: "Archived", displayOrder: 3 },
      { name: "past", displayName: "Past", displayOrder: 4 },
    ];

    for (const status of defaultStatuses) {
      await ctx.db.insert("categorySettings", {
        categoryType: "client_status",
        name: status.name,
        displayName: status.displayName,
        displayOrder: status.displayOrder,
        isSystemDefault: true,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      count++;
    }

    // Default client types
    const defaultTypes = [
      { name: "lender", displayName: "Lender", displayOrder: 1 },
      { name: "borrower", displayName: "Borrower", displayOrder: 2 },
      { name: "broker", displayName: "Broker", displayOrder: 3 },
    ];

    for (const type of defaultTypes) {
      await ctx.db.insert("categorySettings", {
        categoryType: "client_type",
        name: type.name,
        displayName: type.displayName,
        displayOrder: type.displayOrder,
        isSystemDefault: true,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      count++;
    }

    // Default client tags
    const defaultTags = [
      { name: "active", displayName: "Active", displayOrder: 1 },
      { name: "archived", displayName: "Archived", displayOrder: 2 },
      { name: "inactive", displayName: "Inactive", displayOrder: 3 },
      { name: "prospect", displayName: "Prospect", displayOrder: 4 },
    ];

    for (const tag of defaultTags) {
      await ctx.db.insert("categorySettings", {
        categoryType: "client_tag",
        name: tag.name,
        displayName: tag.displayName,
        displayOrder: tag.displayOrder,
        isSystemDefault: true,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      count++;
    }

    return { skipped: false, count, message: `Successfully seeded ${count} default category settings.` };
  },
});

