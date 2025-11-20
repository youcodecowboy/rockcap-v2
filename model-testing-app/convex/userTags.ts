import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get tags for current user
export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      // Return default tags if not authenticated
      return [
        "email",
        "call",
        "meeting",
        "follow-up",
        "review",
        "send",
        "prepare",
        "update",
        "check",
        "schedule",
      ];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      // Return default tags if user not found
      return [
        "email",
        "call",
        "meeting",
        "follow-up",
        "review",
        "send",
        "prepare",
        "update",
        "check",
        "schedule",
      ];
    }

    const userId = user._id;

    const userTags = await ctx.db
      .query("userTags")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    // Return default tags if none exist
    if (!userTags) {
      return [
        "email",
        "call",
        "meeting",
        "follow-up",
        "review",
        "send",
        "prepare",
        "update",
        "check",
        "schedule",
      ];
    }

    return userTags.tags;
  },
});

// Update tags for current user
export const update = mutation({
  args: {
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const userId = user._id;

    const existing = await ctx.db
      .query("userTags")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tags: args.tags,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await ctx.db.insert("userTags", {
        userId,
        tags: args.tags,
        updatedAt: new Date().toISOString(),
      });
    }
  },
});

