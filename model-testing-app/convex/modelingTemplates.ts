import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Query: Get all templates
export const list = query({
  args: {
    modelType: v.optional(v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom")
    )),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let templates;
    
    if (args.modelType) {
      templates = await ctx.db
        .query("modelingTemplates")
        .withIndex("by_modelType", (q: any) => q.eq("modelType", args.modelType!))
        .collect();
    } else {
      templates = await ctx.db.query("modelingTemplates").collect();
    }
    
    if (args.activeOnly !== false) {
      return templates.filter(t => t.isActive);
    }
    
    return templates;
  },
});

// Query: Get template by ID
export const get = query({
  args: { id: v.id("modelingTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get active templates (for model dropdown)
export const getActiveTemplates = query({
  args: {
    modelType: v.optional(v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom")
    )),
  },
  handler: async (ctx, args) => {
    let templates = await ctx.db
      .query("modelingTemplates")
      .withIndex("by_active", (q: any) => q.eq("isActive", true))
      .collect();
    
    if (args.modelType) {
      templates = templates.filter(t => t.modelType === args.modelType);
    }
    
    // Sort by name
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Query: Get template file URL
export const getTemplateUrl = query({
  args: { id: v.id("modelingTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) {
      throw new Error("Template not found");
    }
    
    return await ctx.storage.getUrl(template.fileStorageId);
  },
});

// Mutation: Create template
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom")
    ),
    fileStorageId: v.id("_storage"),
    version: v.string(),
    placeholderCodes: v.optional(v.array(v.string())),
    createdBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const templateId = await ctx.db.insert("modelingTemplates", {
      name: args.name,
      description: args.description,
      modelType: args.modelType,
      fileStorageId: args.fileStorageId,
      version: args.version,
      isActive: true,
      placeholderCodes: args.placeholderCodes,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    return templateId;
  },
});

// Mutation: Update template
export const update = mutation({
  args: {
    id: v.id("modelingTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    modelType: v.optional(v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom")
    )),
    fileStorageId: v.optional(v.id("_storage")),
    version: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    placeholderCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Template not found");
    }
    
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return id;
  },
});

// Mutation: Delete template
export const remove = mutation({
  args: { id: v.id("modelingTemplates") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Mutation: Seed existing appraisal template
export const seedAppraisalTemplate = mutation({
  args: {},
  handler: async (ctx) => {
    const APPRAISAL_TEMPLATE_STORAGE_ID = 'kg2ejfhc72k3qhvbn2ahgmnhys7vh4r1' as Id<"_storage">;
    
    // Check if template already exists
    const existingTemplates = await ctx.db
      .query("modelingTemplates")
      .filter((q) => q.eq(q.field("fileStorageId"), APPRAISAL_TEMPLATE_STORAGE_ID))
      .collect();
    
    if (existingTemplates.length > 0) {
      return {
        success: true,
        message: "Appraisal template already exists in library",
        templateId: existingTemplates[0]._id,
      };
    }
    
    // Verify storage exists
    try {
      const url = await ctx.storage.getUrl(APPRAISAL_TEMPLATE_STORAGE_ID);
      if (!url) {
        throw new Error("Template file not found in storage");
      }
    } catch (error) {
      return {
        success: false,
        message: `Template file not found: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
    
    // Create template entry
    const now = new Date().toISOString();
    const templateId = await ctx.db.insert("modelingTemplates", {
      name: "Appraisal Model Template",
      description: "Standard appraisal model template for financial modeling",
      modelType: "appraisal",
      fileStorageId: APPRAISAL_TEMPLATE_STORAGE_ID,
      version: "1.0.0",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    
    return {
      success: true,
      message: "Appraisal template added to library successfully",
      templateId,
    };
  },
});

