import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all pending actions for a session
export const listPending = query({
  args: {
    sessionId: v.id("chatSessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatActions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

// Query: Get a specific action by ID
export const get = query({
  args: { id: v.id("chatActions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get all actions for a message
export const listByMessage = query({
  args: {
    messageId: v.id("chatMessages"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatActions")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();
  },
});

// Mutation: Create a pending action
export const create = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    messageId: v.id("chatMessages"),
    actionType: v.string(),
    actionData: v.any(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    const actionId = await ctx.db.insert("chatActions", {
      sessionId: args.sessionId,
      messageId: args.messageId,
      actionType: args.actionType,
      actionData: args.actionData,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    
    return actionId;
  },
});

// Mutation: Update action status
export const updateStatus = mutation({
  args: {
    id: v.id("chatActions"),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("cancelled"),
      v.literal("executed"),
      v.literal("failed")
    ),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = new Date().toISOString();
    
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: now,
    });
    
    return id;
  },
});

// Mutation: Confirm and execute an action
export const confirm = mutation({
  args: {
    id: v.id("chatActions"),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.id);
    if (!action) {
      throw new Error("Action not found");
    }
    
    if (action.status !== "pending") {
      throw new Error("Action is not in pending state");
    }
    
    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      status: "confirmed",
      updatedAt: now,
    });
    
    return args.id;
  },
});

// Mutation: Cancel an action
export const cancel = mutation({
  args: {
    id: v.id("chatActions"),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.id);
    if (!action) {
      throw new Error("Action not found");
    }
    
    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      status: "cancelled",
      updatedAt: now,
    });
    
    return args.id;
  },
});

// Mutation: Mark action as executed with result
export const markExecuted = mutation({
  args: {
    id: v.id("chatActions"),
    result: v.any(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    await ctx.db.patch(args.id, {
      status: "executed",
      result: args.result,
      updatedAt: now,
    });
    
    return args.id;
  },
});

// Mutation: Mark action as failed with error
export const markFailed = mutation({
  args: {
    id: v.id("chatActions"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    await ctx.db.patch(args.id, {
      status: "failed",
      error: args.error,
      updatedAt: now,
    });
    
    return args.id;
  },
});

