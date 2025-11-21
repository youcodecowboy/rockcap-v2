import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";

// Query: Get all sessions for the current user, optionally filtered by context
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
    // Get authenticated user
    const user = await getAuthenticatedUser(ctx);
    
    if (args.clientId) {
      return await ctx.db
        .query("chatSessions")
        .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
        .filter((q: any) => q.eq(q.field("userId"), user._id))
        .order("desc")
        .collect();
    }
    
    if (args.projectId) {
      return await ctx.db
        .query("chatSessions")
        .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
        .filter((q: any) => q.eq(q.field("userId"), user._id))
        .order("desc")
        .collect();
    }
    
    if (args.contextType) {
      return await ctx.db
        .query("chatSessions")
        .withIndex("by_user_contextType", (q: any) => 
          q.eq("userId", user._id).eq("contextType", args.contextType!)
        )
        .order("desc")
        .collect();
    }
    
    // Return all sessions for the user ordered by last message
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

// Query: Get a specific session by ID (only if owned by current user)
export const get = query({
  args: { id: v.id("chatSessions") },
  handler: async (ctx, args) => {
    // Get authenticated user
    const user = await getAuthenticatedUser(ctx);
    
    const session = await ctx.db.get(args.id);
    if (!session) {
      return null;
    }
    
    // Verify session belongs to user
    if (session.userId !== user._id) {
      throw new Error("Unauthorized: Session does not belong to current user");
    }
    
    return session;
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
    // Get authenticated user
    const user = await getAuthenticatedUser(ctx);
    
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
      userId: user._id,
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
    // Get authenticated user
    const user = await getAuthenticatedUser(ctx);
    
    // Verify session belongs to user
    const session = await ctx.db.get(args.id);
    if (!session) {
      throw new Error("Session not found");
    }
    
    if (session.userId !== user._id) {
      throw new Error("Unauthorized: Session does not belong to current user");
    }
    
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
    // Get authenticated user
    const user = await getAuthenticatedUser(ctx);
    
    // Verify session belongs to user
    const session = await ctx.db.get(args.id);
    if (!session) {
      throw new Error("Session not found");
    }
    
    if (session.userId !== user._id) {
      throw new Error("Unauthorized: Session does not belong to current user");
    }
    
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
    // Get authenticated user
    const user = await getAuthenticatedUser(ctx);
    
    const session = await ctx.db.get(args.id);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // Verify session belongs to user
    if (session.userId !== user._id) {
      throw new Error("Unauthorized: Session does not belong to current user");
    }
    
    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      messageCount: session.messageCount + 1,
      lastMessageAt: now,
      updatedAt: now,
    });
  },
});

