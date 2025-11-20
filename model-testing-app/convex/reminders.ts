import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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

// Mutation: Create reminder
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    scheduledFor: v.string(), // ISO timestamp
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    llmContext: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    const reminderId = await ctx.db.insert("reminders", {
      userId: user._id,
      title: args.title,
      description: args.description,
      scheduledFor: args.scheduledFor,
      clientId: args.clientId,
      projectId: args.projectId,
      taskId: args.taskId,
      status: "pending",
      isRead: false,
      llmContext: args.llmContext,
      createdAt: now,
      updatedAt: now,
    });

    return reminderId;
  },
});

// Mutation: Update reminder
export const update = mutation({
  args: {
    id: v.id("reminders"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduledFor: v.optional(v.string()),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    taskId: v.optional(v.union(v.id("tasks"), v.null())),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("dismissed"),
      v.literal("overdue")
    )),
    llmContext: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Reminder not found");
    }

    // Verify ownership - reminders are user-specific
    if (existing.userId !== user._id) {
      throw new Error("Unauthorized: You can only edit your own reminders");
    }

    const patchData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Convert null to undefined for optional ID fields
    if (patchData.clientId === null) patchData.clientId = undefined;
    if (patchData.projectId === null) patchData.projectId = undefined;
    if (patchData.taskId === null) patchData.taskId = undefined;

    await ctx.db.patch(id, patchData);
    return id;
  },
});

// Mutation: Delete reminder
export const remove = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const reminder = await ctx.db.get(args.id);
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    // Verify ownership
    if (reminder.userId !== user._id) {
      throw new Error("Unauthorized: You can only delete your own reminders");
    }

    await ctx.db.delete(args.id);
  },
});

// Mutation: Mark reminder as completed
export const complete = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const reminder = await ctx.db.get(args.id);
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    // Verify ownership
    if (reminder.userId !== user._id) {
      throw new Error("Unauthorized: You can only complete your own reminders");
    }

    await ctx.db.patch(args.id, {
      status: "completed",
      updatedAt: new Date().toISOString(),
    });

    return args.id;
  },
});

// Mutation: Dismiss reminder
export const dismiss = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const reminder = await ctx.db.get(args.id);
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    // Verify ownership
    if (reminder.userId !== user._id) {
      throw new Error("Unauthorized: You can only dismiss your own reminders");
    }

    await ctx.db.patch(args.id, {
      status: "dismissed",
      updatedAt: new Date().toISOString(),
    });

    return args.id;
  },
});

// Mutation: Mark reminder notification as read
export const markAsRead = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const reminder = await ctx.db.get(args.id);
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    // Verify ownership
    if (reminder.userId !== user._id) {
      throw new Error("Unauthorized: You can only mark your own reminders as read");
    }

    await ctx.db.patch(args.id, {
      isRead: true,
      updatedAt: new Date().toISOString(),
    });

    return args.id;
  },
});

// Query: Get reminder by ID
export const get = query({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return null;
    }

    const reminder = await ctx.db.get(args.id);
    if (!reminder) {
      return null;
    }

    // Only return if user owns the reminder
    if (reminder.userId !== user._id) {
      return null;
    }

    return reminder;
  },
});

// Query: Get user's reminders with filters
export const getByUser = query({
  args: {
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("dismissed"),
      v.literal("overdue")
    )),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    startDate: v.optional(v.string()), // ISO timestamp
    endDate: v.optional(v.string()), // ISO timestamp
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

    // Start with user's reminders
    let reminders = await ctx.db
      .query("reminders")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Filter by status
    if (args.status) {
      reminders = reminders.filter(r => r.status === args.status);
    }

    // Filter by client
    if (args.clientId) {
      reminders = reminders.filter(r => r.clientId === args.clientId);
    }

    // Filter by project
    if (args.projectId) {
      reminders = reminders.filter(r => r.projectId === args.projectId);
    }

    // Filter by task
    if (args.taskId) {
      reminders = reminders.filter(r => r.taskId === args.taskId);
    }

    // Filter by date range
    if (args.startDate) {
      const startDate = new Date(args.startDate);
      reminders = reminders.filter(r => new Date(r.scheduledFor) >= startDate);
    }

    if (args.endDate) {
      const endDate = new Date(args.endDate);
      reminders = reminders.filter(r => new Date(r.scheduledFor) <= endDate);
    }

    // Sort by scheduledFor ascending (soonest first)
    return reminders.sort((a, b) => 
      new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
    );
  },
});

// Query: Get upcoming reminders (next N days)
export const getUpcoming = query({
  args: {
    days: v.optional(v.number()), // Default to 7 days
    limit: v.optional(v.number()), // Limit number of results
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

    const days = args.days || 7;
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Get user's pending reminders
    let reminders = await ctx.db
      .query("reminders")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Filter to pending reminders (include overdue and upcoming within date range)
    reminders = reminders.filter(r => {
      const scheduledDate = new Date(r.scheduledFor);
      return r.status === "pending" && 
             (scheduledDate < now || scheduledDate <= endDate);
    });

    // Sort: overdue reminders first (most urgent), then upcoming reminders
    reminders.sort((a, b) => {
      const aDate = new Date(a.scheduledFor);
      const bDate = new Date(b.scheduledFor);
      const aOverdue = aDate < now;
      const bOverdue = bDate < now;
      
      // Overdue reminders come first
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      
      // Within same category (both overdue or both upcoming), sort by date ascending
      return aDate.getTime() - bDate.getTime();
    });

    // Apply limit if provided
    if (args.limit) {
      reminders = reminders.slice(0, args.limit);
    }

    return reminders;
  },
});

// Query: Get reminders due now (for notification checking)
export const getDue = query({
  args: {
    bufferMinutes: v.optional(v.number()), // Minutes before/after scheduled time to consider "due"
  },
  handler: async (ctx, args) => {
    const bufferMinutes = args.bufferMinutes || 0;
    const now = new Date();
    const bufferMs = bufferMinutes * 60 * 1000;
    const startTime = new Date(now.getTime() - bufferMs);
    const endTime = new Date(now.getTime() + bufferMs);

    // Get all pending reminders
    let reminders = await ctx.db
      .query("reminders")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .collect();

    // Filter to reminders scheduled within the time window
    reminders = reminders.filter(r => {
      const scheduledDate = new Date(r.scheduledFor);
      return scheduledDate >= startTime && scheduledDate <= endTime;
    });

    return reminders;
  },
});

// Query: Get reminders metrics
export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        activeReminders: 0,
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return {
        activeReminders: 0,
      };
    }

    // Get all reminders for user
    const allReminders = await ctx.db
      .query("reminders")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Calculate active reminders (pending, not completed or dismissed)
    const activeReminders = allReminders.filter(r => r.status === 'pending').length;

    return {
      activeReminders,
    };
  },
});

