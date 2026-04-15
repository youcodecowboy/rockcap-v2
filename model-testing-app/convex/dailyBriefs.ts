import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

async function getAuthenticatedUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return user;
}

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const getToday = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const today = getTodayDateString();
    return ctx.db
      .query("dailyBriefs")
      .withIndex("by_user_date", (q: any) => q.eq("userId", user._id).eq("date", today))
      .first();
  },
});

export const save = mutation({
  args: {
    date: v.string(),
    content: v.any(),
    generatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("dailyBriefs")
      .withIndex("by_user_date", (q: any) => q.eq("userId", user._id).eq("date", args.date))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return ctx.db.insert("dailyBriefs", {
      userId: user._id,
      date: args.date,
      content: args.content,
      generatedAt: args.generatedAt,
    });
  },
});

export const cronTrigger = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log(`[Daily Brief] Cron triggered at ${new Date().toISOString()}`);
  },
});
