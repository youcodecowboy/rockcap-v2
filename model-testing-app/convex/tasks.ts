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

// Helper: notify all task stakeholders except the actor
async function notifyTaskStakeholders(
  ctx: any,
  task: { createdBy: Id<"users">; assignedTo?: Id<"users">[]; _id: any },
  actorId: Id<"users">,
  title: string,
  message: string
) {
  const now = new Date().toISOString();
  const stakeholderIds = new Set<string>();
  stakeholderIds.add(task.createdBy);
  if (task.assignedTo) {
    for (const id of task.assignedTo) {
      stakeholderIds.add(id);
    }
  }
  stakeholderIds.delete(actorId);

  for (const userId of stakeholderIds) {
    await ctx.db.insert("notifications", {
      userId: userId as Id<"users">,
      type: "task" as const,
      title,
      message,
      relatedId: String(task._id),
      isRead: false,
      createdAt: now,
    });
  }
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
    assignedTo: v.optional(v.array(v.id("users"))), // Can assign to multiple users
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    const assignees = args.assignedTo && args.assignedTo.length > 0 ? args.assignedTo : [user._id];

    const taskId = await ctx.db.insert("tasks", {
      createdBy: user._id,
      assignedTo: assignees,
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

    // Notify all assignees except the creator
    for (const assigneeId of assignees) {
      if (assigneeId !== user._id) {
        await ctx.db.insert("notifications", {
          userId: assigneeId,
          type: "task" as const,
          title: "New task assigned",
          message: `You have been assigned to task: "${args.title}"`,
          relatedId: String(taskId),
          isRead: false,
          createdAt: now,
        });
      }
    }

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
      v.literal("cancelled"),
      v.literal("paused")
    )),
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    )),
    tags: v.optional(v.array(v.string())),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    assignedTo: v.optional(v.union(v.array(v.id("users")), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Task not found");
    }

    // Verify user can edit: creator or assigned user can edit (backwards compat for old single-ID data)
    const isAssigned = Array.isArray(existing.assignedTo)
      ? existing.assignedTo.includes(user._id)
      : existing.assignedTo === user._id;
    if (existing.createdBy !== user._id && !isAssigned) {
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

    // Notifications for key changes
    const now = new Date().toISOString();
    const taskForNotify = { createdBy: existing.createdBy, assignedTo: Array.isArray(existing.assignedTo) ? existing.assignedTo : existing.assignedTo ? [existing.assignedTo] : [], _id: id };

    if (args.status !== undefined && args.status !== existing.status) {
      await notifyTaskStakeholders(ctx, taskForNotify, user._id, "Task status changed", `Task "${existing.title}" status changed to "${args.status}"`);
    }
    if (args.dueDate !== undefined && args.dueDate !== existing.dueDate) {
      await notifyTaskStakeholders(ctx, taskForNotify, user._id, "Task due date changed", `Task "${existing.title}" due date was updated`);
    }
    if (args.notes !== undefined && args.notes !== existing.notes) {
      await notifyTaskStakeholders(ctx, taskForNotify, user._id, "Task notes updated", `Notes were updated on task "${existing.title}"`);
    }

    // Notify newly added assignees
    if (args.assignedTo && Array.isArray(args.assignedTo)) {
      const oldAssignees = new Set(Array.isArray(existing.assignedTo) ? existing.assignedTo : existing.assignedTo ? [existing.assignedTo] : []);
      for (const newId of args.assignedTo) {
        if (!oldAssignees.has(newId) && newId !== user._id) {
          await ctx.db.insert("notifications", {
            userId: newId,
            type: "task" as const,
            title: "Task assigned to you",
            message: `You have been assigned to task: "${existing.title}"`,
            relatedId: String(id),
            isRead: false,
            createdAt: now,
          });
        }
      }
    }

    // Log flag activity for status or assignedTo changes
    const activityMessages: string[] = [];
    if (args.status !== undefined && args.status !== existing.status) {
      activityMessages.push(`Changed task status to "${args.status}"`);
    }
    if (args.assignedTo !== undefined) {
      if (args.assignedTo && Array.isArray(args.assignedTo)) {
        const names: string[] = [];
        for (const uid of args.assignedTo) {
          const u = await ctx.db.get(uid);
          names.push(u?.name || u?.email || "unknown");
        }
        activityMessages.push(`Reassigned task to ${names.join(", ")}`);
      } else {
        activityMessages.push("Unassigned task");
      }
    }
    if (activityMessages.length > 0) {
      const openFlags = await ctx.db
        .query("flags")
        .withIndex("by_entity", (q: any) =>
          q.eq("entityType", "task").eq("entityId", id)
        )
        .collect();
      for (const flag of openFlags.filter((f) => f.status === "open")) {
        for (const msg of activityMessages) {
          await ctx.db.insert("flagThreadEntries", {
            flagId: flag._id,
            entryType: "activity",
            userId: user._id,
            content: msg,
            metadata: { action: "updated" },
            createdAt: now,
          });
        }
      }
    }

    return id;
  },
});

// Mutation: Assign task to users
export const assign = mutation({
  args: {
    id: v.id("tasks"),
    assignedTo: v.array(v.id("users")),
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

    // Verify all assigned users exist
    const assigneeNames: string[] = [];
    for (const uid of args.assignedTo) {
      const assignedUser = await ctx.db.get(uid);
      if (!assignedUser) {
        throw new Error(`Assigned user not found: ${uid}`);
      }
      assigneeNames.push(assignedUser.name || assignedUser.email || "unknown");
    }

    const now = new Date().toISOString();
    const oldAssignees = new Set(Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : []);

    await ctx.db.patch(args.id, {
      assignedTo: args.assignedTo,
      updatedAt: now,
    });

    // Notify newly added assignees
    for (const uid of args.assignedTo) {
      if (!oldAssignees.has(uid) && uid !== user._id) {
        await ctx.db.insert("notifications", {
          userId: uid,
          type: "task" as const,
          title: "Task assigned to you",
          message: `You have been assigned to task: "${task.title}"`,
          relatedId: String(args.id),
          isRead: false,
          createdAt: now,
        });
      }
    }

    // Log flag activity for reassignment
    const openFlags = await ctx.db
      .query("flags")
      .withIndex("by_entity", (q: any) =>
        q.eq("entityType", "task").eq("entityId", args.id)
      )
      .collect();
    for (const flag of openFlags.filter((f) => f.status === "open")) {
      await ctx.db.insert("flagThreadEntries", {
        flagId: flag._id,
        entryType: "activity",
        userId: user._id,
        content: `Reassigned task to ${assigneeNames.join(", ")}`,
        metadata: { action: "reassigned", to: assigneeNames.join(", ") },
        createdAt: now,
      });
    }

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
    const isAssigned = Array.isArray(task.assignedTo) && task.assignedTo.includes(user._id);
    if (task.createdBy !== user._id && !isAssigned) {
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
    const isAssigned = Array.isArray(task.assignedTo) && task.assignedTo.includes(user._id);
    if (task.createdBy !== user._id && !isAssigned) {
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

// Mutation: Mark task as completed
export const complete = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    // Verify user can complete: creator or assigned user can complete
    const isAssigned = Array.isArray(task.assignedTo) && task.assignedTo.includes(user._id);
    if (task.createdBy !== user._id && !isAssigned) {
      throw new Error("Unauthorized: You can only complete tasks you created or are assigned to");
    }

    await ctx.db.patch(args.id, {
      status: "completed",
      updatedAt: new Date().toISOString(),
    });

    // Notify stakeholders about completion
    const taskForNotify = { createdBy: task.createdBy, assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : [], _id: args.id };
    await notifyTaskStakeholders(ctx, taskForNotify, user._id, "Task completed", `Task "${task.title}" has been marked as completed`);

    // Log flag activity for completion
    const openFlags = await ctx.db
      .query("flags")
      .withIndex("by_entity", (q: any) =>
        q.eq("entityType", "task").eq("entityId", args.id)
      )
      .collect();
    for (const flag of openFlags.filter((f) => f.status === "open")) {
      await ctx.db.insert("flagThreadEntries", {
        flagId: flag._id,
        entryType: "activity",
        userId: user._id,
        content: 'Changed task status to "completed"',
        metadata: { action: "completed" },
        createdAt: new Date().toISOString(),
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

    // Notify stakeholders before deletion
    const taskForNotify = { createdBy: task.createdBy, assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : [], _id: args.id };
    await notifyTaskStakeholders(ctx, taskForNotify, user._id, "Task deleted", `Task "${task.title}" has been deleted`);

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
    const isAssigned = Array.isArray(task.assignedTo) && task.assignedTo.includes(user._id);
    if (task.createdBy !== user._id && !isAssigned) {
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
      v.literal("cancelled"),
      v.literal("paused")
    )),
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
      if (includeAssigned) {
        if (Array.isArray(task.assignedTo)) {
          return task.assignedTo.includes(user._id);
        }
        return task.assignedTo === user._id;
      }
      return false;
    });

    // Filter by status
    if (args.status) {
      tasks = tasks.filter(t => t.status === args.status);
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
    tasks = tasks.filter(task => {
      if (task.createdBy === user._id) return true;
      if (Array.isArray(task.assignedTo)) return task.assignedTo.includes(user._id);
      return task.assignedTo === user._id;
    });

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
    tasks = tasks.filter(task => {
      if (task.createdBy === user._id) return true;
      if (Array.isArray(task.assignedTo)) return task.assignedTo.includes(user._id);
      return task.assignedTo === user._id;
    });

    return tasks.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },
});

// Query: Get active task count by client (for display in tabs/overview)
export const getActiveCountByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();

    return tasks.filter(t =>
      t.status === "todo" || t.status === "in_progress" || t.status === "paused"
    ).length;
  },
});

// Query: Get active task count by project (for display in tabs/overview)
export const getActiveCountByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();

    return tasks.filter(t =>
      t.status === "todo" || t.status === "in_progress" || t.status === "paused"
    ).length;
  },
});

// Query: Get task metrics for current user
export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { total: 0, todo: 0, inProgress: 0, completed: 0, paused: 0, dueToday: 0, overdue: 0, upNext: null };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) {
      return { total: 0, todo: 0, inProgress: 0, completed: 0, paused: 0, dueToday: 0, overdue: 0, upNext: null };
    }

    const allTasks = await ctx.db.query("tasks").collect();
    const userTasks = allTasks.filter(task => {
      if (task.createdBy === user._id) return true;
      if (Array.isArray(task.assignedTo)) return task.assignedTo.includes(user._id);
      return task.assignedTo === user._id;
    });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const total = userTasks.filter(t => t.status !== "cancelled").length;
    const todo = userTasks.filter(t => t.status === "todo").length;
    const inProgress = userTasks.filter(t => t.status === "in_progress").length;
    const completed = userTasks.filter(t => t.status === "completed").length;
    const paused = userTasks.filter(t => t.status === "paused").length;

    const dueToday = userTasks.filter(t =>
      t.dueDate &&
      t.dueDate >= todayStart && t.dueDate < todayEnd &&
      t.status !== "completed" && t.status !== "cancelled"
    ).length;

    const overdue = userTasks.filter(t =>
      t.dueDate &&
      t.dueDate < todayStart &&
      t.status !== "completed" && t.status !== "cancelled"
    ).length;

    const upcomingTasks = userTasks
      .filter(t => t.status !== "completed" && t.status !== "cancelled")
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });

    return {
      total,
      todo,
      inProgress,
      completed,
      paused,
      dueToday,
      overdue,
      upNext: upcomingTasks.length > 0 ? upcomingTasks[0] : null,
    };
  },
});

// Query: Get task counts by date for 7-day strip
export const getByDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return {};

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return {};

    const allTasks = await ctx.db.query("tasks").collect();
    const userTasks = allTasks.filter(task => {
      if (task.createdBy === user._id) return true;
      if (Array.isArray(task.assignedTo)) return task.assignedTo.includes(user._id);
      return task.assignedTo === user._id;
    });

    const activeTasks = userTasks.filter(t =>
      t.dueDate &&
      t.status !== "completed" && t.status !== "cancelled"
    );

    const counts: Record<string, number> = {};
    for (const task of activeTasks) {
      const dateKey = task.dueDate!.split("T")[0];
      if (dateKey >= args.startDate && dateKey <= args.endDate) {
        counts[dateKey] = (counts[dateKey] || 0) + 1;
      }
    }

    return counts;
  },
});

