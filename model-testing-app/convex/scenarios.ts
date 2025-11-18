import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get scenarios by project
export const list = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scenarios")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Query: Get scenario by ID
export const get = query({
  args: { id: v.id("scenarios") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Mutation: Create new scenario
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    data: v.optional(v.any()),
    createdBy: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const scenarioId = await ctx.db.insert("scenarios", {
      projectId: args.projectId,
      name: args.name,
      description: args.description,
      data: args.data,
      createdAt: now,
      updatedAt: now,
      createdBy: args.createdBy,
      metadata: args.metadata,
    });
    return scenarioId;
  },
});

// Mutation: Update scenario
export const update = mutation({
  args: {
    id: v.id("scenarios"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    data: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Scenario not found");
    }
    
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return id;
  },
});

// Mutation: Update just the data field (for auto-save)
export const updateData = mutation({
  args: {
    id: v.id("scenarios"),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Scenario not found");
    }
    
    await ctx.db.patch(args.id, {
      data: args.data,
      updatedAt: new Date().toISOString(),
    });
    return args.id;
  },
});

// Mutation: Delete scenario
export const remove = mutation({
  args: { id: v.id("scenarios") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

