import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Add a new changelog entry
 * @param description - Short description of the change
 */
export const add = mutation({
  args: {
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Insert changelog entry
    const changelogId = await ctx.db.insert("changelog", {
      description: args.description,
      createdAt: now,
    });
    
    // Create notifications for all users
    // Get all users
    const allUsers = await ctx.db.query("users").collect();
    
    // Create a notification for each user
    for (const user of allUsers) {
      await ctx.db.insert("notifications", {
        userId: user._id,
        type: "changelog",
        title: "New Update Available",
        message: args.description,
        relatedId: changelogId, // Convex will convert Id to string automatically
        isRead: false,
        createdAt: now,
      });
    }
    
    return changelogId;
  },
});

/**
 * Get all changelog entries, ordered by most recent first
 */
export const getAll = query({
  handler: async (ctx) => {
    const entries = await ctx.db
      .query("changelog")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
    
    return entries;
  },
});

/**
 * Get recent changelog entries (last N entries)
 */
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const entries = await ctx.db
      .query("changelog")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
    
    return entries;
  },
});

