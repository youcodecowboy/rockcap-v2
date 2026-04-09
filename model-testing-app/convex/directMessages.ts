import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";

// ============================================================================
// Queries
// ============================================================================

export const getByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const limit = args.limit || 100;

    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");
    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }

    const messages = await ctx.db
      .query("directMessages")
      .withIndex("by_conversation", (q: any) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .take(limit);

    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const senderMap: Record<string, string> = {};
    for (const sid of senderIds) {
      const u = await ctx.db.get(sid);
      senderMap[sid as string] = u?.name || u?.email || "Unknown";
    }

    return messages.map((m) => ({
      ...m,
      senderName: senderMap[m.senderId as string] || "Unknown",
    }));
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    references: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("document"),
            v.literal("project"),
            v.literal("client")
          ),
          id: v.string(),
          name: v.string(),
          meta: v.optional(v.any()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");
    if (!conv.participantIds.some((pid: any) => pid === user._id)) {
      throw new Error("Not a participant");
    }

    const messageId = await ctx.db.insert("directMessages", {
      conversationId: args.conversationId,
      senderId: user._id,
      content: args.content,
      references: args.references,
      createdAt: now,
    });

    const preview =
      args.content.length > 80
        ? args.content.substring(0, 80) + "..."
        : args.content;

    await ctx.db.patch(conv._id, {
      lastMessageAt: now,
      lastMessagePreview: preview,
      lastMessageSenderId: user._id,
    });

    const readCursors = (conv.readCursors || {}) as Record<string, string>;
    const userName = user.name || user.email || "Someone";

    for (const pid of conv.participantIds) {
      if (pid === user._id) continue;

      const cursorId = readCursors[pid as string];
      if (cursorId) {
        const cursorMsg = await ctx.db.get(cursorId as any);
        if (cursorMsg) {
          const cursorTime = new Date(cursorMsg.createdAt).getTime();
          const nowTime = new Date(now).getTime();
          if (nowTime - cursorTime < 60_000) continue;
        }
      }

      await ctx.db.insert("notifications", {
        userId: pid,
        type: "message",
        title: `${userName} · ${conv.title}`,
        message: preview,
        relatedId: conv._id as string,
        isRead: false,
        createdAt: now,
      });
    }

    return messageId;
  },
});

export const edit = mutation({
  args: {
    messageId: v.id("directMessages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== user._id)
      throw new Error("Can only edit own messages");

    await ctx.db.patch(args.messageId, {
      content: args.content,
      isEdited: true,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { messageId: v.id("directMessages") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== user._id)
      throw new Error("Can only delete own messages");

    await ctx.db.patch(args.messageId, {
      isDeleted: true,
      content: "",
      references: undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});
