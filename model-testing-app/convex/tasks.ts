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

// Mutation: Create task
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    dueDate: v.optional(v.string()), // ISO timestamp
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    )),
    tags: v.optional(v.array(v.string())),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    assignedTo: v.optional(v.id("users")), // Can assign to another user
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    const taskId = await ctx.db.insert("tasks", {
      createdBy: user._id,
      assignedTo: args.assignedTo || user._id, // Default to creator if not assigned
      title: args.title,
      description: args.description,
      notes: args.notes,
      dueDate: args.dueDate,
      status: "todo",
      priority: args.priority || "medium",
      tags: args.tags || [],
      clientId: args.clientId,
      projectId: args.projectId,
      reminderIds: [],
      createdAt: now,
      updatedAt: now,
    });

    return taskId;
  },
});

// Mutation: Update task
export const update = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    dueDate: v.optional(v.union(v.string(), v.null())),
    status: v.optional(v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("cancelled")
    )),
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    )),
    tags: v.optional(v.array(v.string())),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    assignedTo: v.optional(v.union(v.id("users"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Task not found");
    }

    // Verify user can edit: creator or assigned user can edit
    if (existing.createdBy !== user._id && existing.assignedTo !== user._id) {
      throw new Error("Unauthorized: You can only edit tasks you created or are assigned to");
    }

    const patchData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Convert null to undefined for optional ID fields
    if (patchData.clientId === null) patchData.clientId = undefined;
    if (patchData.projectId === null) patchData.projectId = undefined;
    if (patchData.assignedTo === null) patchData.assignedTo = undefined;
    if (patchData.dueDate === null) patchData.dueDate = undefined;

    await ctx.db.patch(id, patchData);
    return id;
  },
});

// Mutation: Assign task to another user
export const assign = mutation({
  args: {
    id: v.id("tasks"),
    assignedTo: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    // Verify user can assign: creator can assign
    if (task.createdBy !== user._id) {
      throw new Error("Unauthorized: Only the task creator can assign tasks");
    }

    // Verify assigned user exists
    const assignedUser = await ctx.db.get(args.assignedTo);
    if (!assignedUser) {
      throw new Error("Assigned user not found");
    }

    await ctx.db.patch(args.id, {
      assignedTo: args.assignedTo,
      updatedAt: new Date().toISOString(),
    });

    return args.id;
  },
});

// Mutation: Add reminder to task
export const addReminder = mutation({
  args: {
    id: v.id("tasks"),
    reminderId: v.id("reminders"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    // Verify user can edit
    if (task.createdBy !== user._id && task.assignedTo !== user._id) {
      throw new Error("Unauthorized: You can only edit tasks you created or are assigned to");
    }

    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    // Verify reminder belongs to user
    if (reminder.userId !== user._id) {
      throw new Error("Unauthorized: You can only link your own reminders");
    }

    // Add reminder to task's reminderIds array
    const currentReminderIds = task.reminderIds || [];
    if (!currentReminderIds.includes(args.reminderId)) {
      await ctx.db.patch(args.id, {
        reminderIds: [...currentReminderIds, args.reminderId],
        updatedAt: new Date().toISOString(),
      });

      // Also update reminder to link to task
      await ctx.db.patch(args.reminderId, {
        taskId: args.id,
        updatedAt: new Date().toISOString(),
      });
    }

    return args.id;
  },
});

// Mutation: Remove reminder from task
export const removeReminder = mutation({
  args: {
    id: v.id("tasks"),
    reminderId: v.id("reminders"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    // Verify user can edit
    if (task.createdBy !== user._id && task.assignedTo !== user._id) {
      throw new Error("Unauthorized: You can only edit tasks you created or are assigned to");
    }

    // Remove reminder from task's reminderIds array
    const currentReminderIds = task.reminderIds || [];
    const updatedReminderIds = currentReminderIds.filter(id => id !== args.reminderId);

    await ctx.db.patch(args.id, {
      reminderIds: updatedReminderIds,
      updatedAt: new Date().toISOString(),
    });

    // Also update reminder to unlink from task
    const reminder = await ctx.db.get(args.reminderId);
    if (reminder && reminder.taskId === args.id) {
      await ctx.db.patch(args.reminderId, {
        taskId: undefined,
        updatedAt: new Date().toISOString(),
      });
    }

    return args.id;
  },
});

// Mutation: Delete task
export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    // Verify user can delete: creator can delete
    if (task.createdBy !== user._id) {
      throw new Error("Unauthorized: Only the task creator can delete tasks");
    }

    await ctx.db.delete(args.id);
  },
});

// Query: Get task by ID
export const get = query({
  args: { id: v.id("tasks") },
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

    const task = await ctx.db.get(args.id);
    if (!task) {
      return null;
    }

    // Only return if user created or is assigned to the task
    if (task.createdBy !== user._id && task.assignedTo !== user._id) {
      return null;
    }

    return task;
  },
});

// Query: Get user's tasks with filters
export const getByUser = query({
  args: {
    status: v.optional(v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("cancelled")
    )),
    assignedTo: v.optional(v.id("users")), // Filter by assigned user
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    tags: v.optional(v.array(v.string())),
    includeCreated: v.optional(v.boolean()), // Include tasks created by user
    includeAssigned: v.optional(v.boolean()), // Include tasks assigned to user
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

    // Determine which tasks to include
    const includeCreated = args.includeCreated !== false; // Default true
    const includeAssigned = args.includeAssigned !== false; // Default true

    // Get all tasks
    let tasks = await ctx.db
      .query("tasks")
      .collect();

    // Filter by user relationship
    tasks = tasks.filter(task => {
      if (includeCreated && task.createdBy === user._id) return true;
      if (includeAssigned && task.assignedTo === user._id) return true;
      return false;
    });

    // Filter by status
    if (args.status) {
      tasks = tasks.filter(t => t.status === args.status);
    }

    // Filter by assignedTo
    if (args.assignedTo) {
      tasks = tasks.filter(t => t.assignedTo === args.assignedTo);
    }

    // Filter by client
    if (args.clientId) {
      tasks = tasks.filter(t => t.clientId === args.clientId);
    }

    // Filter by project
    if (args.projectId) {
      tasks = tasks.filter(t => t.projectId === args.projectId);
    }

    // Filter by tags
    if (args.tags && args.tags.length > 0) {
      tasks = tasks.filter(t => 
        t.tags && args.tags!.some(tag => t.tags!.includes(tag))
      );
    }

    // Sort by updatedAt descending (most recently updated first)
    return tasks.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },
});

// Query: Get tasks by client
export const getByClient = query({
  args: { clientId: v.id("clients") },
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

    let tasks = await ctx.db
      .query("tasks")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();

    // Filter to tasks user created or is assigned to
    tasks = tasks.filter(task => 
      task.createdBy === user._id || task.assignedTo === user._id
    );

    return tasks.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },
});

// Query: Get tasks by project
export const getByProject = query({
  args: { projectId: v.id("projects") },
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

    let tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();

    // Filter to tasks user created or is assigned to
    tasks = tasks.filter(task => 
      task.createdBy === user._id || task.assignedTo === user._id
    );

    return tasks.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },
});

// Query: Get task metrics for current user
export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        activeTasks: 0,
        completed: 0,
        upNext: null,
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return {
        activeTasks: 0,
        completed: 0,
        upNext: null,
      };
    }

    // Get all tasks for user
    const allTasks = await ctx.db.query("tasks").collect();
    const userTasks = allTasks.filter(task => 
      task.createdBy === user._id || task.assignedTo === user._id
    );

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Calculate metrics
    const activeTasks = userTasks.filter(t => 
      t.status !== 'completed' && t.status !== 'cancelled'
    ).length;
    
    const completed = userTasks.filter(t => t.status === 'completed').length;

    // Find up next task (earliest due date, not completed)
    // Include all non-completed tasks (overdue, upcoming, or no due date)
    const upcomingTasks = userTasks
      .filter(t => {
        // Exclude only completed and cancelled tasks
        return t.status !== 'completed' && t.status !== 'cancelled';
      })
      .sort((a, b) => {
        // Sort: overdue tasks first (most urgent), then upcoming tasks, then tasks without due dates
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1; // Tasks without due dates go to end
        if (!b.dueDate) return -1;
        const dateA = new Date(a.dueDate!).getTime();
        const dateB = new Date(b.dueDate!).getTime();
        // Sort by date ascending (earliest first, including overdue)
        return dateA - dateB;
      });

    const upNext = upcomingTasks.length > 0 ? upcomingTasks[0] : null;

    return {
      activeTasks,
      completed,
      upNext,
    };
  },
});

