import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all sessions, optionally filtered by context
export const list = query({
  args: {
    contextType: v.optional(v.union(
      v.literal("global"),
      v.literal("client"),
      v.literal("project")
    )),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (args.clientId) {
      return await ctx.db
        .query("chatSessions")
        .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
        .order("desc")
        .collect();
    }
    
    if (args.projectId) {
      return await ctx.db
        .query("chatSessions")
        .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
        .order("desc")
        .collect();
    }
    
    if (args.contextType) {
      return await ctx.db
        .query("chatSessions")
        .withIndex("by_contextType", (q: any) => q.eq("contextType", args.contextType!))
        .order("desc")
        .collect();
    }
    
    // Return all sessions ordered by last message
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .collect();
  },
});

// Query: Get a specific session by ID
export const get = query({
  args: { id: v.id("chatSessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Mutation: Create a new chat session
export const create = mutation({
  args: {
    title: v.optional(v.string()),
    contextType: v.union(
      v.literal("global"),
      v.literal("client"),
      v.literal("project")
    ),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Generate title if not provided
    let title = args.title || "New Chat";
    
    if (!args.title) {
      if (args.clientId) {
        const client = await ctx.db.get(args.clientId);
        title = client ? `Chat with ${client.name}` : "Client Chat";
      } else if (args.projectId) {
        const project = await ctx.db.get(args.projectId);
        title = project ? `Chat about ${project.name}` : "Project Chat";
      } else {
        title = "General Chat";
      }
    }
    
    const sessionId = await ctx.db.insert("chatSessions", {
      title,
      contextType: args.contextType,
      clientId: args.clientId,
      projectId: args.projectId,
      lastMessageAt: now,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    
    return sessionId;
  },
});

// Mutation: Update session metadata
export const update = mutation({
  args: {
    id: v.id("chatSessions"),
    title: v.optional(v.string()),
    lastMessageAt: v.optional(v.string()),
    messageCount: v.optional(v.number()),
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

// Mutation: Delete a session and all its messages
export const remove = mutation({
  args: { id: v.id("chatSessions") },
  handler: async (ctx, args) => {
    // Delete all messages in the session
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q: any) => q.eq("sessionId", args.id))
      .collect();
    
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    
    // Delete all actions in the session
    const actions = await ctx.db
      .query("chatActions")
      .withIndex("by_session", (q: any) => q.eq("sessionId", args.id))
      .collect();
    
    for (const action of actions) {
      await ctx.db.delete(action._id);
    }
    
    // Delete the session itself
    await ctx.db.delete(args.id);
  },
});

// Mutation: Increment message count
export const incrementMessageCount = mutation({
  args: { id: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) {
      throw new Error("Session not found");
    }
    
    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      messageCount: session.messageCount + 1,
      lastMessageAt: now,
      updatedAt: now,
    });
  },
});

