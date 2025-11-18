import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Save formula results for a scenario version
 */
export const saveResults = mutation({
  args: {
    scenarioId: v.id("scenarios"),
    version: v.number(),
    inputs: v.any(),
    outputs: v.any(),
    allValues: v.any(),
  },
  handler: async (ctx, args) => {
    const { scenarioId, version, inputs, outputs, allValues } = args;
    
    // Check if results already exist for this version
    const existing = await ctx.db
      .query("scenarioResults")
      .withIndex("by_scenario_version", (q) => 
        q.eq("scenarioId", scenarioId).eq("version", version)
      )
      .first();
    
    if (existing) {
      // Update existing results
      await ctx.db.patch(existing._id, {
        inputs,
        outputs,
        allValues,
        extractedAt: new Date().toISOString(),
      });
      return existing._id;
    } else {
      // Create new results
      return await ctx.db.insert("scenarioResults", {
        scenarioId,
        version,
        inputs,
        outputs,
        allValues,
        extractedAt: new Date().toISOString(),
      });
    }
  },
});

/**
 * Get results for a specific scenario version
 */
export const getResults = query({
  args: { 
    scenarioId: v.id("scenarios"), 
    version: v.number() 
  },
  handler: async (ctx, args) => {
    const { scenarioId, version } = args;
    
    const results = await ctx.db
      .query("scenarioResults")
      .withIndex("by_scenario_version", (q) => 
        q.eq("scenarioId", scenarioId).eq("version", version)
      )
      .first();
    
    return results;
  },
});

/**
 * Get all results for a scenario (all versions)
 */
export const getAllResults = query({
  args: { scenarioId: v.id("scenarios") },
  handler: async (ctx, args) => {
    const { scenarioId } = args;
    
    const results = await ctx.db
      .query("scenarioResults")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", scenarioId))
      .order("desc")
      .collect();
    
    return results;
  },
});

/**
 * Compare two versions of results
 */
export const compareVersions = query({
  args: { 
    scenarioId: v.id("scenarios"),
    version1: v.number(),
    version2: v.number()
  },
  handler: async (ctx, args) => {
    const { scenarioId, version1, version2 } = args;
    
    const [results1, results2] = await Promise.all([
      ctx.db
        .query("scenarioResults")
        .withIndex("by_scenario_version", (q) => 
          q.eq("scenarioId", scenarioId).eq("version", version1)
        )
        .first(),
      ctx.db
        .query("scenarioResults")
        .withIndex("by_scenario_version", (q) => 
          q.eq("scenarioId", scenarioId).eq("version", version2)
        )
        .first(),
    ]);
    
    if (!results1 || !results2) {
      return null;
    }
    
    // Compare outputs (formula results)
    const changes: Array<{
      cellAddress: string;
      version1: any;
      version2: any;
      difference?: number;
    }> = [];
    
    const outputs1 = results1.outputs as Record<string, any>;
    const outputs2 = results2.outputs as Record<string, any>;
    
    // Find all unique cell addresses
    const allAddresses = new Set([
      ...Object.keys(outputs1),
      ...Object.keys(outputs2),
    ]);
    
    allAddresses.forEach(address => {
      const val1 = outputs1[address];
      const val2 = outputs2[address];
      
      // Check if values are different
      if (val1 !== val2) {
        const change: any = {
          cellAddress: address,
          version1: val1,
          version2: val2,
        };
        
        // Calculate numeric difference if both are numbers
        if (typeof val1 === 'number' && typeof val2 === 'number') {
          change.difference = val2 - val1;
        }
        
        changes.push(change);
      }
    });
    
    return {
      version1: results1.version,
      version2: results2.version,
      changes,
      totalChanges: changes.length,
    };
  },
});

/**
 * Get latest results for a scenario
 */
export const getLatestResults = query({
  args: { scenarioId: v.id("scenarios") },
  handler: async (ctx, args) => {
    const { scenarioId } = args;
    
    const results = await ctx.db
      .query("scenarioResults")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", scenarioId))
      .order("desc")
      .first();
    
    return results;
  },
});

