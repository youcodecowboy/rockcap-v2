import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Mutation: Create template
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    template: v.any(), // JSON structure defining template layout
    knowledgeBankFields: v.array(v.string()), // Fields to pull from knowledge bank
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const templateId = await ctx.db.insert("noteTemplates", {
      name: args.name,
      description: args.description,
      template: args.template,
      knowledgeBankFields: args.knowledgeBankFields,
      isActive: args.isActive !== undefined ? args.isActive : true,
      createdAt: now,
      updatedAt: now,
    });
    return templateId;
  },
});

// Mutation: Update template
export const update = mutation({
  args: {
    id: v.id("noteTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    template: v.optional(v.any()),
    knowledgeBankFields: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
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
  args: { id: v.id("noteTemplates") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Query: Get template by ID
export const get = query({
  args: { id: v.id("noteTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: List all templates
export const list = query({
  args: {
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let templates;

    if (args.isActive !== undefined) {
      templates = await ctx.db
        .query("noteTemplates")
        .withIndex("by_active", (q: any) => q.eq("isActive", args.isActive!))
        .collect();
    } else {
      templates = await ctx.db
        .query("noteTemplates")
        .collect();
    }

    // Sort by name
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  },
});

