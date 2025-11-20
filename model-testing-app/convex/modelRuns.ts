import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get model runs by scenario
export const list = query({
  args: {
    scenarioId: v.id("scenarios"),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("modelRuns")
      .withIndex("by_scenario", (q: any) => q.eq("scenarioId", args.scenarioId))
      .collect();
    
    // Sort by version descending (newest first)
    return runs.sort((a, b) => b.version - a.version);
  },
});

// Query: Get model run by ID
export const get = query({
  args: { id: v.id("modelRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get latest run for a scenario
export const getLatest = query({
  args: {
    scenarioId: v.id("scenarios"),
    modelType: v.optional(v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("other")
    )),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("modelRuns")
      .withIndex("by_scenario", (q: any) => q.eq("scenarioId", args.scenarioId))
      .collect();
    
    let filtered = runs;
    if (args.modelType) {
      filtered = runs.filter(r => r.modelType === args.modelType);
    }
    
    if (filtered.length === 0) return null;
    
    // Sort by version descending and return latest
    return filtered.sort((a, b) => b.version - a.version)[0];
  },
});

// Query: Get all versions for a scenario
export const getVersions = query({
  args: {
    scenarioId: v.id("scenarios"),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("modelRuns")
      .withIndex("by_scenario", (q: any) => q.eq("scenarioId", args.scenarioId))
      .collect();
    
    // Sort by version descending
    return runs.sort((a, b) => b.version - a.version);
  },
});

// Mutation: Create new model run
export const create = mutation({
  args: {
    scenarioId: v.id("scenarios"),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("other")
    ),
    version: v.number(),
    versionName: v.optional(v.string()),
    inputs: v.any(),
    outputs: v.optional(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("error")
    ),
    error: v.optional(v.string()),
    runBy: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const runId = await ctx.db.insert("modelRuns", {
      scenarioId: args.scenarioId,
      modelType: args.modelType,
      version: args.version,
      versionName: args.versionName,
      inputs: args.inputs,
      outputs: args.outputs,
      status: args.status,
      error: args.error,
      runAt: new Date().toISOString(),
      runBy: args.runBy,
      metadata: args.metadata,
    });
    return runId;
  },
});

// Mutation: Manually save a new version
export const saveVersion = mutation({
  args: {
    scenarioId: v.id("scenarios"),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("other")
    ),
    version: v.number(),
    versionName: v.optional(v.string()),
    inputs: v.any(),
    outputs: v.optional(v.any()),
    runBy: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const runId = await ctx.db.insert("modelRuns", {
      scenarioId: args.scenarioId,
      modelType: args.modelType,
      version: args.version,
      versionName: args.versionName,
      inputs: args.inputs,
      outputs: args.outputs,
      status: "completed",
      runAt: new Date().toISOString(),
      runBy: args.runBy,
      metadata: args.metadata,
    });
    return runId;
  },
});

