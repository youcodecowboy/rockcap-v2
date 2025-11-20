import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all templates
export const list = query({
  args: {
    category: v.optional(v.union(
      v.literal("first-contact"),
      v.literal("follow-up"),
      v.literal("proposal"),
      v.literal("check-in")
    )),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let templates;
    
    if (args.category) {
      templates = await ctx.db
        .query("emailTemplates")
        .withIndex("by_category", (q: any) => q.eq("category", args.category!))
        .collect();
    } else {
      templates = await ctx.db.query("emailTemplates").collect();
    }
    
    if (args.activeOnly !== false) {
      return templates.filter(t => t.isActive);
    }
    
    return templates;
  },
});

// Query: Get template by ID
export const get = query({
  args: { id: v.id("emailTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get templates by category
export const getByCategory = query({
  args: {
    category: v.union(
      v.literal("first-contact"),
      v.literal("follow-up"),
      v.literal("proposal"),
      v.literal("check-in")
    ),
  },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("emailTemplates")
      .withIndex("by_category", (q: any) => q.eq("category", args.category))
      .collect();
    return templates.filter(t => t.isActive);
  },
});

// Mutation: Create template
export const create = mutation({
  args: {
    name: v.string(),
    category: v.union(
      v.literal("first-contact"),
      v.literal("follow-up"),
      v.literal("proposal"),
      v.literal("check-in")
    ),
    prospectType: v.optional(v.union(
      v.literal("new-prospect"),
      v.literal("existing-prospect"),
      v.literal("reactivation")
    )),
    subject: v.string(),
    body: v.string(),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const templateId = await ctx.db.insert("emailTemplates", {
      name: args.name,
      category: args.category,
      prospectType: args.prospectType,
      subject: args.subject,
      body: args.body,
      description: args.description,
      isActive: args.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return templateId;
  },
});

// Mutation: Update template
export const update = mutation({
  args: {
    id: v.id("emailTemplates"),
    name: v.optional(v.string()),
    category: v.optional(v.union(
      v.literal("first-contact"),
      v.literal("follow-up"),
      v.literal("proposal"),
      v.literal("check-in")
    )),
    prospectType: v.optional(v.union(
      v.literal("new-prospect"),
      v.literal("existing-prospect"),
      v.literal("reactivation")
    )),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    description: v.optional(v.string()),
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
  args: { id: v.id("emailTemplates") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

