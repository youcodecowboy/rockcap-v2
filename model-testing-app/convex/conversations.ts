import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";

// ============================================================================
// Queries
// ============================================================================

export const getMyConversations = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const allConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessage")
      .order("desc")
      .collect();

    let myConversations = allConversations.filter((c) =>
      c.participantIds.some((pid: any) => pid === user._id)
    );

    if (args.clientId) {
      myConversations = myConversations.filter((c) => c.clientId === args.clientId);
    }
    if (args.projectId) {
      myConversations = myConversations.filter((c) => c.projectId === args.projectId);
    }

    const enriched = await Promise.all(
      myConversations.map(async (conv) => {
        const participants = await Promise.all(
          conv.participantIds.map(async (pid: any) => {
            const u = await ctx.db.get(pid);
            return u ? { id: u._id, name: u.name || u.email || "Unknown" } : null;
          })
        );

        const readCursors = (conv.readCursors || {}) as Record<string, string>;
        const myReadCursor = readCursors[user._id];

        const messages = await ctx.db
          .query("directMessages")
          .withIndex("by_conversation", (q: any) => q.eq("conversationId", conv._id))
          .collect();

        let unreadCount = 0;
        if (myReadCursor) {
          unreadCount = messages.filter(
            (m) => m._id > myReadCursor && m.senderId !== user._id
          ).length;
        } else {
          unreadCount = messages.filter((m) => m.senderId !== user._id).length;
        }

        let clientName: string | undefined;
        let projectName: string | undefined;
        if (conv.clientId) {
          const client = await ctx.db.get(conv.clientId);
          clientName = client?.name;
        }
        if (conv.projectId) {
          const project = await ctx.db.get(conv.projectId);
          projectName = project?.name;
        }

        return {
          ...conv,
          participants: participants.filter(Boolean),
          unreadCount,
          clientName,
          projectName,
        };
      })
    );

    return enriched;
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const conv = await ctx.db.get(args.id);
    if (!conv) throw new Error("Conversation not found");

    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }

    const participants = await Promise.all(
      conv.participantIds.map(async (pid: any) => {
        const u = await ctx.db.get(pid);
        return u ? { id: u._id, name: u.name || u.email || "Unknown" } : null;
      })
    );

    let clientName: string | undefined;
    let projectName: string | undefined;
    if (conv.clientId) {
      const client = await ctx.db.get(conv.clientId);
      clientName = client?.name;
    }
    if (conv.projectId) {
      const project = await ctx.db.get(conv.projectId);
      projectName = project?.name;
    }

    return {
      ...conv,
      participants: participants.filter(Boolean),
      clientName,
      projectName,
      currentUserId: user._id,
    };
  },
});

export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    const allConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessage")
      .collect();

    const myConversations = allConversations.filter((c) =>
      c.participantIds.some((pid: any) => pid === user._id)
    );

    let total = 0;
    for (const conv of myConversations) {
      const readCursors = (conv.readCursors || {}) as Record<string, string>;
      const myReadCursor = readCursors[user._id];

      const messages = await ctx.db
        .query("directMessages")
        .withIndex("by_conversation", (q: any) => q.eq("conversationId", conv._id))
        .collect();

      if (myReadCursor) {
        total += messages.filter(
          (m) => m._id > myReadCursor && m.senderId !== user._id
        ).length;
      } else {
        total += messages.filter((m) => m.senderId !== user._id).length;
      }
    }

    return total;
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const create = mutation({
  args: {
    participantIds: v.array(v.id("users")),
    title: v.string(),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    const allParticipants = args.participantIds.includes(user._id)
      ? args.participantIds
      : [user._id, ...args.participantIds];

    if (!args.title.trim()) {
      throw new Error("Conversation title is required");
    }

    const id = await ctx.db.insert("conversations", {
      participantIds: allParticipants,
      title: args.title.trim(),
      clientId: args.clientId,
      projectId: args.projectId,
      createdAt: now,
      createdBy: user._id,
    });

    return id;
  },
});

export const markAsRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    const latestMessage = await ctx.db
      .query("directMessages")
      .withIndex("by_conversation", (q: any) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .first();

    if (!latestMessage) return;

    const readCursors = (conv.readCursors || {}) as Record<string, string>;
    readCursors[user._id] = latestMessage._id;

    await ctx.db.patch(conv._id, { readCursors });
  },
});

export const rename = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");
    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }
    if (!args.title.trim()) throw new Error("Title cannot be empty");

    await ctx.db.patch(args.conversationId, { title: args.title.trim() });
  },
});
