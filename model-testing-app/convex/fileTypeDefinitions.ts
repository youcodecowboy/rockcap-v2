import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";
import { internal } from "./_generated/api";

/**
 * Get all active file type definitions
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const definitions = await ctx.db
      .query("fileTypeDefinitions")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    return definitions.sort((a, b) => {
      // Sort by category first, then by file type name
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.fileType.localeCompare(b.fileType);
    });
  },
});

/**
 * Get all file type definitions (including inactive)
 */
export const getAllIncludingInactive = query({
  args: {},
  handler: async (ctx) => {
    const definitions = await ctx.db
      .query("fileTypeDefinitions")
      .collect();
    
    return definitions.sort((a, b) => {
      // Sort by category first, then by file type name
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.fileType.localeCompare(b.fileType);
    });
  },
});

/**
 * Get a single file type definition by ID
 */
export const getById = query({
  args: { id: v.id("fileTypeDefinitions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get file type definitions by category
 */
export const getByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fileTypeDefinitions")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * Create a new file type definition
 */
export const create = mutation({
  args: {
    fileType: v.string(),
    category: v.string(),
    parentType: v.optional(v.string()),
    description: v.string(),
    keywords: v.array(v.string()),
    identificationRules: v.array(v.string()),
    categoryRules: v.optional(v.string()),
    exampleFileStorageId: v.optional(v.id("_storage")),
    exampleFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const userId = user._id.toString();
    
    // Validate description is at least 100 words
    const wordCount = args.description.trim().split(/\s+/).length;
    if (wordCount < 100) {
      throw new Error(`Description must be at least 100 words. Current: ${wordCount} words.`);
    }

    const now = new Date().toISOString();
    
    const id = await ctx.db.insert("fileTypeDefinitions", {
      fileType: args.fileType,
      category: args.category,
      parentType: args.parentType,
      description: args.description,
      keywords: args.keywords,
      identificationRules: args.identificationRules,
      categoryRules: args.categoryRules,
      exampleFileStorageId: args.exampleFileStorageId,
      exampleFileName: args.exampleFileName,
      isSystemDefault: false,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Update an existing file type definition
 */
export const update = mutation({
  args: {
    id: v.id("fileTypeDefinitions"),
    fileType: v.optional(v.string()),
    category: v.optional(v.string()),
    parentType: v.optional(v.string()),
    description: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    identificationRules: v.optional(v.array(v.string())),
    categoryRules: v.optional(v.string()),
    exampleFileStorageId: v.optional(v.id("_storage")),
    exampleFileName: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("File type definition not found");
    }

    // Prevent editing system defaults
    if (existing.isSystemDefault) {
      throw new Error("Cannot edit system default file type definitions");
    }

    // Validate description if provided
    if (args.description !== undefined) {
      const wordCount = args.description.trim().split(/\s+/).length;
      if (wordCount < 100) {
        throw new Error(`Description must be at least 100 words. Current: ${wordCount} words.`);
      }
    }

    const updates: any = {
      updatedAt: new Date().toISOString(),
    };

    if (args.fileType !== undefined) updates.fileType = args.fileType;
    if (args.category !== undefined) updates.category = args.category;
    if (args.parentType !== undefined) updates.parentType = args.parentType;
    if (args.description !== undefined) updates.description = args.description;
    if (args.keywords !== undefined) updates.keywords = args.keywords;
    if (args.identificationRules !== undefined) updates.identificationRules = args.identificationRules;
    if (args.categoryRules !== undefined) updates.categoryRules = args.categoryRules;
    if (args.exampleFileStorageId !== undefined) updates.exampleFileStorageId = args.exampleFileStorageId;
    if (args.exampleFileName !== undefined) updates.exampleFileName = args.exampleFileName;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

/**
 * Delete a file type definition (soft delete by setting isActive to false)
 */
export const remove = mutation({
  args: { id: v.id("fileTypeDefinitions") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("File type definition not found");
    }

    // Prevent deleting system defaults
    if (existing.isSystemDefault) {
      throw new Error("Cannot delete system default file type definitions");
    }

    // Soft delete by setting isActive to false
    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: new Date().toISOString(),
    });

    return args.id;
  },
});

/**
 * Hard delete a file type definition (only for non-system defaults)
 */
export const hardDelete = mutation({
  args: { id: v.id("fileTypeDefinitions") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("File type definition not found");
    }

    // Prevent deleting system defaults
    if (existing.isSystemDefault) {
      throw new Error("Cannot delete system default file type definitions");
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

/**
 * Get file URL from storage ID for example files
 */
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Public wrapper to seed file type definitions (calls internal migration)
 * This can be called from the UI to initialize the database
 */
export const seedDefinitions = mutation({
  args: {},
  handler: async (ctx): Promise<{ skipped: boolean; count: number; message: string }> => {
    await getAuthenticatedUser(ctx); // Ensure user is authenticated
    
    // Check if definitions already exist
    const existing = await ctx.db.query("fileTypeDefinitions").collect();
    if (existing.length > 0) {
      return { skipped: true, count: existing.length, message: 'File type definitions already exist' };
    }

    // Call the internal migration
    const result = await ctx.runMutation(internal.migrations.seedFileTypeDefinitions.seedFileTypeDefinitions, {}) as { skipped: boolean; count: number };
    
    return { 
      ...result, 
      message: result.skipped 
        ? 'File type definitions already exist' 
        : `Successfully seeded ${result.count} file type definitions` 
    };
  },
});

