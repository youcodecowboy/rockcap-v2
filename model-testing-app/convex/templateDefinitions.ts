import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// =============================================================================
// TEMPLATE DEFINITIONS - CRUD Operations
// =============================================================================

/**
 * Get all active template definitions
 */
export const listActive = query({
  args: {
    modelType: v.optional(v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("other")
    )),
  },
  handler: async (ctx, args) => {
    let templates;
    
    if (args.modelType !== undefined) {
      templates = await ctx.db
        .query("templateDefinitions")
        .withIndex("by_modelType", (q) => q.eq("modelType", args.modelType!))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    } else {
      templates = await ctx.db
        .query("templateDefinitions")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    
    return templates;
  },
});

/**
 * Get all template definitions (including inactive)
 */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("templateDefinitions").collect();
  },
});

/**
 * Get a single template definition by ID
 */
export const getById = query({
  args: {
    templateId: v.id("templateDefinitions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.templateId);
  },
});

/**
 * Get the original file URL for a template (for Quick Export)
 */
export const getOriginalFileUrl = query({
  args: {
    templateId: v.id("templateDefinitions"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    
    if (!template.originalFileStorageId) {
      return null;
    }
    
    return await ctx.storage.getUrl(template.originalFileStorageId);
  },
});

/**
 * Get a template definition by name
 */
export const getByName = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("templateDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

/**
 * Get a template with all its sheet metadata (not full data)
 */
export const getWithSheetMetadata = query({
  args: {
    templateId: v.id("templateDefinitions"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;

    // Get all sheets for this template (metadata only, no full data)
    const sheets = await ctx.db
      .query("templateSheets")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    // Sort by order
    sheets.sort((a, b) => a.order - b.order);

    // Return template with sheet metadata (excluding inlineData)
    const sheetMetadata = sheets.map(sheet => ({
      _id: sheet._id,
      name: sheet.name,
      order: sheet.order,
      type: sheet.type,
      groupId: sheet.groupId,
      dimensions: sheet.dimensions,
      hasFormulas: sheet.hasFormulas,
      hasStyles: sheet.hasStyles,
      hasMergedCells: sheet.hasMergedCells,
      estimatedSizeBytes: sheet.estimatedSizeBytes,
      hasInlineData: !!sheet.inlineData,
      hasStorageData: !!sheet.dataStorageId,
    }));

    return {
      ...template,
      sheets: sheetMetadata,
    };
  },
});

/**
 * Create a new template definition
 */
export const create = mutation({
  args: {
    name: v.string(),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("other")
    ),
    description: v.optional(v.string()),
    originalFileStorageId: v.optional(v.id("_storage")),
    originalFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check for duplicate name
    const existing = await ctx.db
      .query("templateDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    
    if (existing) {
      throw new Error(`Template with name "${args.name}" already exists`);
    }

    const templateId = await ctx.db.insert("templateDefinitions", {
      name: args.name,
      modelType: args.modelType,
      version: 1,
      description: args.description,
      originalFileStorageId: args.originalFileStorageId,
      originalFileName: args.originalFileName,
      coreSheetIds: [],
      dynamicGroups: [],
      totalSheetCount: 0,
      isActive: false, // Start inactive until sheets are added
      createdAt: now,
      updatedAt: now,
    });

    return templateId;
  },
});

/**
 * Update template definition metadata
 */
export const update = mutation({
  args: {
    templateId: v.id("templateDefinitions"),
    name: v.optional(v.string()),
    modelType: v.optional(v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("other")
    )),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // Check for duplicate name if changing name
    if (args.name !== undefined && args.name !== template.name) {
      const existing = await ctx.db
        .query("templateDefinitions")
        .withIndex("by_name", (q) => q.eq("name", args.name!))
        .first();
      
      if (existing) {
        throw new Error(`Template with name "${args.name}" already exists`);
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.modelType !== undefined) updates.modelType = args.modelType;
    if (args.description !== undefined) updates.description = args.description;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.templateId, updates);
    return args.templateId;
  },
});

/**
 * Update sheet configuration (core sheets and dynamic groups)
 */
export const updateSheetConfiguration = mutation({
  args: {
    templateId: v.id("templateDefinitions"),
    coreSheetIds: v.array(v.id("templateSheets")),
    dynamicGroups: v.array(v.object({
      groupId: v.string(),
      label: v.string(),
      sheetIds: v.array(v.id("templateSheets")),
      min: v.number(),
      max: v.number(),
      defaultCount: v.number(),
      namePlaceholder: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // Calculate total sheet count
    const dynamicSheetCount = args.dynamicGroups.reduce(
      (sum, group) => sum + group.sheetIds.length,
      0
    );
    const totalSheetCount = args.coreSheetIds.length + dynamicSheetCount;

    await ctx.db.patch(args.templateId, {
      coreSheetIds: args.coreSheetIds,
      dynamicGroups: args.dynamicGroups,
      totalSheetCount,
      updatedAt: new Date().toISOString(),
    });

    return args.templateId;
  },
});

/**
 * Increment template version
 */
export const incrementVersion = mutation({
  args: {
    templateId: v.id("templateDefinitions"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    await ctx.db.patch(args.templateId, {
      version: template.version + 1,
      updatedAt: new Date().toISOString(),
    });

    return template.version + 1;
  },
});

/**
 * Delete a template definition and all its sheets
 */
export const deleteTemplate = mutation({
  args: {
    templateId: v.id("templateDefinitions"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // Delete all associated sheets
    const sheets = await ctx.db
      .query("templateSheets")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    for (const sheet of sheets) {
      // Delete file storage if exists
      if (sheet.dataStorageId) {
        await ctx.storage.delete(sheet.dataStorageId);
      }
      await ctx.db.delete(sheet._id);
    }

    // Delete original file if exists
    if (template.originalFileStorageId) {
      await ctx.storage.delete(template.originalFileStorageId);
    }

    // Delete the template definition
    await ctx.db.delete(args.templateId);

    return { deleted: true, sheetsDeleted: sheets.length };
  },
});

/**
 * Activate a template (make it available for use)
 */
export const activate = mutation({
  args: {
    templateId: v.id("templateDefinitions"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // Verify template has at least one sheet
    if (template.totalSheetCount === 0) {
      throw new Error("Cannot activate template with no sheets");
    }

    await ctx.db.patch(args.templateId, {
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    return args.templateId;
  },
});

/**
 * Deactivate a template
 */
export const deactivate = mutation({
  args: {
    templateId: v.id("templateDefinitions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.templateId, {
      isActive: false,
      updatedAt: new Date().toISOString(),
    });

    return args.templateId;
  },
});

