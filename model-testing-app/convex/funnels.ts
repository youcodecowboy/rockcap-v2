import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all funnels
export const list = query({
  args: {
    prospectType: v.optional(v.union(
      v.literal("new-prospect"),
      v.literal("existing-prospect"),
      v.literal("reactivation")
    )),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("emailFunnels");
    
    if (args.prospectType) {
      query = query.withIndex("by_prospect_type", (q) => q.eq("prospectType", args.prospectType));
    }
    
    const funnels = await query.collect();
    
    if (args.activeOnly !== false) {
      return funnels.filter(f => f.isActive);
    }
    
    return funnels;
  },
});

// Query: Get funnel by ID
export const get = query({
  args: { id: v.id("emailFunnels") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get funnels by prospect type
export const getByProspectType = query({
  args: {
    prospectType: v.union(
      v.literal("new-prospect"),
      v.literal("existing-prospect"),
      v.literal("reactivation")
    ),
  },
  handler: async (ctx, args) => {
    const funnels = await ctx.db
      .query("emailFunnels")
      .withIndex("by_prospect_type", (q) => q.eq("prospectType", args.prospectType))
      .collect();
    return funnels.filter(f => f.isActive);
  },
});

// Mutation: Create funnel
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    prospectType: v.union(
      v.literal("new-prospect"),
      v.literal("existing-prospect"),
      v.literal("reactivation")
    ),
    templates: v.array(v.object({
      templateId: v.id("emailTemplates"),
      order: v.number(),
      delayDays: v.optional(v.number()),
    })),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const funnelId = await ctx.db.insert("emailFunnels", {
      name: args.name,
      description: args.description,
      prospectType: args.prospectType,
      templates: args.templates,
      isActive: args.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return funnelId;
  },
});

// Mutation: Update funnel
export const update = mutation({
  args: {
    id: v.id("emailFunnels"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    prospectType: v.optional(v.union(
      v.literal("new-prospect"),
      v.literal("existing-prospect"),
      v.literal("reactivation")
    )),
    templates: v.optional(v.array(v.object({
      templateId: v.id("emailTemplates"),
      order: v.number(),
      delayDays: v.optional(v.number()),
    }))),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Funnel not found");
    }
    
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return id;
  },
});

// Mutation: Delete funnel
export const remove = mutation({
  args: { id: v.id("emailFunnels") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

