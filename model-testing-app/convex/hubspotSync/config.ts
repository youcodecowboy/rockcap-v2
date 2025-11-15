import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * Update sync configuration
 */
export const updateSyncConfig = mutation({
  args: {
    isRecurringSyncEnabled: v.boolean(),
    syncIntervalHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get existing config or create new one
    const existingConfigs = await ctx.db
      .query("hubspotSyncConfig")
      .collect();
    
    const config = existingConfigs[0];
    
    if (config) {
      await ctx.db.patch(config._id, {
        isRecurringSyncEnabled: args.isRecurringSyncEnabled,
        syncIntervalHours: args.syncIntervalHours,
        updatedAt: new Date().toISOString(),
      });
      return config._id;
    } else {
      const configId = await ctx.db.insert("hubspotSyncConfig", {
        isRecurringSyncEnabled: args.isRecurringSyncEnabled,
        syncIntervalHours: args.syncIntervalHours || 24,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return configId;
    }
  },
});

/**
 * Update sync status after sync completes
 */
export const updateSyncStatus = mutation({
  args: {
    status: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("in_progress")
    ),
    stats: v.optional(v.object({
      companiesSynced: v.number(),
      contactsSynced: v.number(),
      leadsSynced: v.optional(v.number()),
      dealsSynced: v.number(),
      errors: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const existingConfigs = await ctx.db
      .query("hubspotSyncConfig")
      .collect();
    
    const config = existingConfigs[0];
    
    if (config) {
      await ctx.db.patch(config._id, {
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: args.status,
        lastSyncStats: args.stats,
        updatedAt: new Date().toISOString(),
      });
      return config._id;
    } else {
      const configId = await ctx.db.insert("hubspotSyncConfig", {
        isRecurringSyncEnabled: false,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: args.status,
        lastSyncStats: args.stats,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return configId;
    }
  },
});

/**
 * Get sync configuration
 */
export const getSyncConfig = query({
  handler: async (ctx) => {
    const configs = await ctx.db
      .query("hubspotSyncConfig")
      .collect();
    
    return configs[0] || null;
  },
});

