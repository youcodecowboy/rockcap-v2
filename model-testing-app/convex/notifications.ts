import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Helper function to get authenticated user
async function getAuthenticatedUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  
  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

// Mutation: Create notification
export const create = mutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task")
    ),
    title: v.string(),
    message: v.string(),
    relatedId: v.optional(v.string()), // ID of related entity (reminder, task, etc.)
  },
  handler: async (ctx, args) => {
    // Verify the caller is authenticated (but can create notifications for any user)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const now = new Date().toISOString();

    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      relatedId: args.relatedId,
      isRead: false,
      createdAt: now,
    });

    return notificationId;
  },
});

// Query: Get user's notifications with filters
export const getByUser = query({
  args: {
    type: v.optional(v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task")
    )),
    isRead: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    // Get user's notifications
    let notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Filter by type
    if (args.type) {
      notifications = notifications.filter(n => n.type === args.type);
    }

    // Filter by read status
    if (args.isRead !== undefined) {
      notifications = notifications.filter(n => 
        (n.isRead || false) === args.isRead
      );
    }

    // Sort by createdAt descending (most recent first)
    notifications.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply limit if provided
    if (args.limit) {
      notifications = notifications.slice(0, args.limit);
    }

    return notifications;
  },
});

// Mutation: Mark notification as read
export const markAsRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const notification = await ctx.db.get(args.id);
    if (!notification) {
      throw new Error("Notification not found");
    }

    // Verify ownership
    if (notification.userId !== user._id) {
      throw new Error("Unauthorized: You can only mark your own notifications as read");
    }

    await ctx.db.patch(args.id, {
      isRead: true,
    });

    return args.id;
  },
});

// Mutation: Mark all user notifications as read
export const markAllAsRead = mutation({
  args: {
    type: v.optional(v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task")
    )),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Get user's unread notifications
    let notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Filter by read status
    notifications = notifications.filter(n => !n.isRead);

    // Filter by type if provided
    if (args.type) {
      notifications = notifications.filter(n => n.type === args.type);
    }

    // Mark all as read
    for (const notification of notifications) {
      await ctx.db.patch(notification._id, {
        isRead: true,
      });
    }

    return notifications.length;
  },
});

// Query: Get unread count by type
export const getUnreadCount = query({
  args: {
    type: v.optional(v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task")
    )),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return 0;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return 0;
    }

    // Get user's unread notifications
    let notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Filter by read status
    notifications = notifications.filter(n => !n.isRead);

    // Filter by type if provided
    if (args.type) {
      notifications = notifications.filter(n => n.type === args.type);
    }

    return notifications.length;
  },
});

// Query: Get recent notifications (for dropdown)
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
    includeRead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    // Get user's notifications
    let notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Filter out read notifications if includeRead is false
    if (args.includeRead === false) {
      notifications = notifications.filter(n => !n.isRead);
    }

    // Sort by createdAt descending (most recent first)
    notifications.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply limit if provided (default to 20)
    const limit = args.limit || 20;
    return notifications.slice(0, limit);
  },
});

