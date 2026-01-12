import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Folder definition schema for validation
const folderSchema = v.object({
  name: v.string(),
  folderKey: v.string(),
  parentKey: v.optional(v.string()),
  description: v.optional(v.string()),
  order: v.number(),
});

// ============================================================================
// QUERIES
// ============================================================================

// Query: Get all folder templates
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("folderTemplates").collect();
  },
});

// Query: Get folder templates by client type
export const getByClientType = query({
  args: { clientType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("folderTemplates")
      .withIndex("by_client_type", (q: any) => q.eq("clientType", args.clientType))
      .collect();
  },
});

// Query: Get folder template by client type and level
export const getByClientTypeAndLevel = query({
  args: { 
    clientType: v.string(),
    level: v.union(v.literal("client"), v.literal("project")),
  },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("folderTemplates")
      .withIndex("by_client_type_level", (q: any) => 
        q.eq("clientType", args.clientType).eq("level", args.level)
      )
      .collect();
    
    // Return default template or first one
    return templates.find(t => t.isDefault) || templates[0] || null;
  },
});

// Query: Get single folder template by ID
export const get = query({
  args: { id: v.id("folderTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get available client types (distinct)
export const getClientTypes = query({
  args: {},
  handler: async (ctx) => {
    const templates = await ctx.db.query("folderTemplates").collect();
    const types = new Set(templates.map(t => t.clientType));
    return Array.from(types).sort();
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

// Mutation: Create folder template
export const create = mutation({
  args: {
    clientType: v.string(),
    level: v.union(v.literal("client"), v.literal("project")),
    folders: v.array(folderSchema),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // If this is set as default, unset other defaults for same type/level
    if (args.isDefault) {
      const existingDefaults = await ctx.db
        .query("folderTemplates")
        .withIndex("by_client_type_level", (q: any) => 
          q.eq("clientType", args.clientType).eq("level", args.level)
        )
        .collect();
      
      for (const template of existingDefaults) {
        if (template.isDefault) {
          await ctx.db.patch(template._id, { isDefault: false, updatedAt: now });
        }
      }
    }
    
    return await ctx.db.insert("folderTemplates", {
      clientType: args.clientType.toLowerCase(),
      level: args.level,
      folders: args.folders,
      isDefault: args.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Mutation: Update folder template
export const update = mutation({
  args: {
    id: v.id("folderTemplates"),
    folders: v.optional(v.array(folderSchema)),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Folder template not found");
    }
    
    const now = new Date().toISOString();
    const updates: any = { updatedAt: now };
    
    if (args.folders !== undefined) {
      updates.folders = args.folders;
    }
    
    // Handle isDefault change
    if (args.isDefault !== undefined) {
      updates.isDefault = args.isDefault;
      
      // If setting as default, unset others
      if (args.isDefault) {
        const sameTypeTemplates = await ctx.db
          .query("folderTemplates")
          .withIndex("by_client_type_level", (q: any) => 
            q.eq("clientType", existing.clientType).eq("level", existing.level)
          )
          .collect();
        
        for (const template of sameTypeTemplates) {
          if (template._id !== args.id && template.isDefault) {
            await ctx.db.patch(template._id, { isDefault: false, updatedAt: now });
          }
        }
      }
    }
    
    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

// Mutation: Delete folder template
export const remove = mutation({
  args: { id: v.id("folderTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) {
      throw new Error("Folder template not found");
    }
    
    // Don't allow deleting the last template for a client type
    const sameTypeTemplates = await ctx.db
      .query("folderTemplates")
      .withIndex("by_client_type", (q: any) => q.eq("clientType", template.clientType))
      .collect();
    
    if (sameTypeTemplates.length <= 2) { // One for client, one for project
      throw new Error("Cannot delete the last template for a client type");
    }
    
    await ctx.db.delete(args.id);
  },
});

// Mutation: Add folder to template
export const addFolder = mutation({
  args: {
    templateId: v.id("folderTemplates"),
    folder: folderSchema,
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Folder template not found");
    }
    
    // Check for duplicate folderKey
    if (template.folders.some(f => f.folderKey === args.folder.folderKey)) {
      throw new Error(`Folder key "${args.folder.folderKey}" already exists in this template`);
    }
    
    const updatedFolders = [...template.folders, args.folder];
    
    await ctx.db.patch(args.templateId, {
      folders: updatedFolders,
      updatedAt: new Date().toISOString(),
    });
    
    return args.templateId;
  },
});

// Mutation: Update folder in template
export const updateFolder = mutation({
  args: {
    templateId: v.id("folderTemplates"),
    folderKey: v.string(),
    updates: v.object({
      name: v.optional(v.string()),
      parentKey: v.optional(v.union(v.string(), v.null())),
      description: v.optional(v.string()),
      order: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Folder template not found");
    }
    
    const folderIndex = template.folders.findIndex(f => f.folderKey === args.folderKey);
    if (folderIndex === -1) {
      throw new Error(`Folder "${args.folderKey}" not found in template`);
    }
    
    const updatedFolders = [...template.folders];
    updatedFolders[folderIndex] = {
      ...updatedFolders[folderIndex],
      ...args.updates,
      // Handle null parentKey -> undefined
      parentKey: args.updates.parentKey === null ? undefined : (args.updates.parentKey ?? updatedFolders[folderIndex].parentKey),
    };
    
    await ctx.db.patch(args.templateId, {
      folders: updatedFolders,
      updatedAt: new Date().toISOString(),
    });
    
    return args.templateId;
  },
});

// Mutation: Remove folder from template
export const removeFolder = mutation({
  args: {
    templateId: v.id("folderTemplates"),
    folderKey: v.string(),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Folder template not found");
    }
    
    // Don't allow removing if it's a parent of other folders
    const isParent = template.folders.some(f => f.parentKey === args.folderKey);
    if (isParent) {
      throw new Error("Cannot remove folder that is parent of other folders. Remove children first.");
    }
    
    // Don't allow removing if only one folder left
    if (template.folders.length <= 1) {
      throw new Error("Cannot remove the last folder from template");
    }
    
    const updatedFolders = template.folders.filter(f => f.folderKey !== args.folderKey);
    
    await ctx.db.patch(args.templateId, {
      folders: updatedFolders,
      updatedAt: new Date().toISOString(),
    });
    
    return args.templateId;
  },
});

// Mutation: Reorder folders in template
export const reorderFolders = mutation({
  args: {
    templateId: v.id("folderTemplates"),
    folderKeys: v.array(v.string()), // New order of folder keys
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Folder template not found");
    }
    
    // Validate all folder keys are present
    const existingKeys = new Set(template.folders.map(f => f.folderKey));
    for (const key of args.folderKeys) {
      if (!existingKeys.has(key)) {
        throw new Error(`Folder key "${key}" not found in template`);
      }
    }
    
    // Update order based on position in array
    const updatedFolders = template.folders.map(folder => ({
      ...folder,
      order: args.folderKeys.indexOf(folder.folderKey) + 1,
    }));
    
    await ctx.db.patch(args.templateId, {
      folders: updatedFolders,
      updatedAt: new Date().toISOString(),
    });
    
    return args.templateId;
  },
});
