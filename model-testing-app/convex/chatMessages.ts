import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all messages for a session
export const list = query({
  args: {
    sessionId: v.id("chatSessions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q: any) => q.eq("sessionId", args.sessionId))
      .order("asc");
    
    if (args.limit) {
      return await query.take(args.limit);
    }
    
    return await query.collect();
  },
});

// Query: Get a specific message by ID
export const get = query({
  args: { id: v.id("chatMessages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Mutation: Add a new message to a session
export const add = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    toolCalls: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      arguments: v.string(),
    }))),
    toolResults: v.optional(v.array(v.object({
      toolCallId: v.string(),
      result: v.string(),
    }))),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    const messageId = await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      toolCalls: args.toolCalls,
      toolResults: args.toolResults,
      metadata: args.metadata,
      createdAt: now,
    });
    
    // Update session's last message time and message count
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        lastMessageAt: now,
        messageCount: session.messageCount + 1,
        updatedAt: now,
      });
    }
    
    return messageId;
  },
});

// Mutation: Update a message
export const update = mutation({
  args: {
    id: v.id("chatMessages"),
    content: v.optional(v.string()),
    toolCalls: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      arguments: v.string(),
    }))),
    toolResults: v.optional(v.array(v.object({
      toolCallId: v.string(),
      result: v.string(),
    }))),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
    return id;
  },
});

// Mutation: Delete a message
export const remove = mutation({
  args: { id: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error("Message not found");
    }
    
    // Delete any actions associated with this message
    const actions = await ctx.db
      .query("chatActions")
      .withIndex("by_message", (q: any) => q.eq("messageId", args.id))
      .collect();
    
    for (const action of actions) {
      await ctx.db.delete(action._id);
    }
    
    // Delete the message
    await ctx.db.delete(args.id);
    
    // Update session message count
    const session = await ctx.db.get(message.sessionId);
    if (session && session.messageCount > 0) {
      await ctx.db.patch(message.sessionId, {
        messageCount: session.messageCount - 1,
        updatedAt: new Date().toISOString(),
      });
    }
  },
});

