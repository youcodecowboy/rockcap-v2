import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Add a new changelog entry
 * @param title - Title of the change
 * @param description - Detailed description of the change
 * @param pagesAffected - Optional array of page names affected
 * @param featuresAffected - Optional array of feature names affected
 */
export const add = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    pagesAffected: v.optional(v.array(v.string())),
    featuresAffected: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Insert changelog entry
    const changelogId = await ctx.db.insert("changelog", {
      title: args.title,
      description: args.description,
      pagesAffected: args.pagesAffected,
      featuresAffected: args.featuresAffected,
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
        message: args.title,
        relatedId: changelogId.toString(),
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

/**
 * Remove a changelog entry
 */
export const remove = mutation({
  args: { id: v.id("changelog") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

