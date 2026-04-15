import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const register = mutation({
  args: {
    token: v.string(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { lastUsedAt: Date.now() });
      return existing._id;
    }

    return ctx.db.insert("pushTokens", {
      userId: user._id,
      token: args.token,
      platform: args.platform,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const getByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .collect();
  },
});
