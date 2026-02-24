import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Meetings - CRUD operations for meeting summaries
 *
 * Meetings are extracted from transcripts/notes and contain:
 * - Summary, key points, decisions
 * - Action items (with task promotion capability)
 * - Attendees with optional contact links
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all meetings for a client, sorted by date (newest first)
 */
export const getByClient = query({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    // Sort by meetingDate descending (newest first)
    meetings.sort((a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime());

    if (args.limit) {
      return meetings.slice(0, args.limit);
    }
    return meetings;
  },
});

/**
 * Get all meetings for a project, sorted by date (newest first)
 */
export const getByProject = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Sort by meetingDate descending (newest first)
    meetings.sort((a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime());

    if (args.limit) {
      return meetings.slice(0, args.limit);
    }
    return meetings;
  },
});

/**
 * Get a single meeting by ID
 */
export const get = query({
  args: {
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.meetingId);
  },
});

/**
 * Get meeting count for a client (for tab badge)
 */
export const getCountByClient = query({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    return meetings.length;
  },
});

/**
 * Get pending action items count for a client (for notifications)
 */
export const getPendingActionItemsCount = query({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    let pendingCount = 0;
    for (const meeting of meetings) {
      pendingCount += meeting.actionItems.filter((item) => item.status === "pending").length;
    }
    return pendingCount;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new meeting (manual entry or from extraction)
 */
export const create = mutation({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    meetingDate: v.string(),
    meetingType: v.optional(v.union(
      v.literal("progress"),
      v.literal("kickoff"),
      v.literal("review"),
      v.literal("site_visit"),
      v.literal("call"),
      v.literal("other")
    )),
    attendees: v.array(v.object({
      name: v.string(),
      role: v.optional(v.string()),
      company: v.optional(v.string()),
      contactId: v.optional(v.id("contacts")),
    })),
    summary: v.string(),
    keyPoints: v.array(v.string()),
    decisions: v.array(v.string()),
    actionItems: v.array(v.object({
      id: v.string(),
      description: v.string(),
      assignee: v.optional(v.string()),
      dueDate: v.optional(v.string()),
      status: v.union(v.literal("pending"), v.literal("completed"), v.literal("cancelled")),
      taskId: v.optional(v.id("tasks")),
      createdAt: v.string(),
      completedAt: v.optional(v.string()),
    })),
    sourceDocumentId: v.optional(v.id("documents")),
    sourceDocumentName: v.optional(v.string()),
    extractionConfidence: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const meetingId = await ctx.db.insert("meetings", {
      clientId: args.clientId,
      projectId: args.projectId,
      title: args.title,
      meetingDate: args.meetingDate,
      meetingType: args.meetingType,
      attendees: args.attendees,
      summary: args.summary,
      keyPoints: args.keyPoints,
      decisions: args.decisions,
      actionItems: args.actionItems,
      sourceDocumentId: args.sourceDocumentId,
      sourceDocumentName: args.sourceDocumentName,
      extractionConfidence: args.extractionConfidence,
      createdBy: args.createdBy,
      tags: args.tags,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    return meetingId;
  },
});

/**
 * Update meeting details
 */
export const update = mutation({
  args: {
    meetingId: v.id("meetings"),
    title: v.optional(v.string()),
    meetingDate: v.optional(v.string()),
    meetingType: v.optional(v.union(
      v.literal("progress"),
      v.literal("kickoff"),
      v.literal("review"),
      v.literal("site_visit"),
      v.literal("call"),
      v.literal("other")
    )),
    attendees: v.optional(v.array(v.object({
      name: v.string(),
      role: v.optional(v.string()),
      company: v.optional(v.string()),
      contactId: v.optional(v.id("contacts")),
    }))),
    summary: v.optional(v.string()),
    keyPoints: v.optional(v.array(v.string())),
    decisions: v.optional(v.array(v.string())),
    actionItems: v.optional(v.array(v.object({
      id: v.string(),
      description: v.string(),
      assignee: v.optional(v.string()),
      dueDate: v.optional(v.string()),
      status: v.union(v.literal("pending"), v.literal("completed"), v.literal("cancelled")),
      taskId: v.optional(v.id("tasks")),
      createdAt: v.string(),
      completedAt: v.optional(v.string()),
    }))),
    projectId: v.optional(v.id("projects")),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { meetingId, ...updates } = args;
    const meeting = await ctx.db.get(meetingId);
    if (!meeting) {
      throw new Error("Meeting not found");
    }

    const now = new Date().toISOString();

    // Build update object with only provided fields
    const updateObj: Record<string, unknown> = { updatedAt: now };

    if (updates.title !== undefined) updateObj.title = updates.title;
    if (updates.meetingDate !== undefined) updateObj.meetingDate = updates.meetingDate;
    if (updates.meetingType !== undefined) updateObj.meetingType = updates.meetingType;
    if (updates.attendees !== undefined) updateObj.attendees = updates.attendees;
    if (updates.summary !== undefined) updateObj.summary = updates.summary;
    if (updates.keyPoints !== undefined) updateObj.keyPoints = updates.keyPoints;
    if (updates.decisions !== undefined) updateObj.decisions = updates.decisions;
    if (updates.actionItems !== undefined) updateObj.actionItems = updates.actionItems;
    if (updates.projectId !== undefined) updateObj.projectId = updates.projectId;
    if (updates.tags !== undefined) updateObj.tags = updates.tags;
    if (updates.notes !== undefined) updateObj.notes = updates.notes;

    await ctx.db.patch(meetingId, updateObj);
    return meetingId;
  },
});

/**
 * Delete a meeting
 */
export const deleteMeeting = mutation({
  args: {
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) {
      throw new Error("Meeting not found");
    }

    await ctx.db.delete(args.meetingId);
    return { success: true };
  },
});

/**
 * Update a single action item's status within a meeting
 */
export const updateActionItemStatus = mutation({
  args: {
    meetingId: v.id("meetings"),
    actionItemId: v.string(),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) {
      throw new Error("Meeting not found");
    }

    const now = new Date().toISOString();
    const updatedActionItems = meeting.actionItems.map((item) => {
      if (item.id === args.actionItemId) {
        return {
          ...item,
          status: args.status,
          completedAt: args.status === "completed" ? now : item.completedAt,
        };
      }
      return item;
    });

    await ctx.db.patch(args.meetingId, {
      actionItems: updatedActionItems,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Promote an action item to a task (creates task and links back)
 */
export const promoteActionItemToTask = mutation({
  args: {
    meetingId: v.id("meetings"),
    actionItemId: v.string(),
    createdBy: v.id("users"), // Required - who is creating the task
    taskTitle: v.optional(v.string()),
    taskDueDate: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) {
      throw new Error("Meeting not found");
    }

    const actionItem = meeting.actionItems.find((item) => item.id === args.actionItemId);
    if (!actionItem) {
      throw new Error("Action item not found");
    }

    // Check if already promoted
    if (actionItem.taskId) {
      throw new Error("Action item already promoted to task");
    }

    const now = new Date().toISOString();

    // Create the task
    // Note: The task references the meeting via description text
    // The action item stores taskId for bi-directional linking
    const taskId = await ctx.db.insert("tasks", {
      title: args.taskTitle || actionItem.description,
      description: `From meeting: ${meeting.title}\n\n${actionItem.description}`,
      status: "todo",
      priority: "medium",
      dueDate: args.taskDueDate || actionItem.dueDate,
      clientId: meeting.clientId,
      projectId: meeting.projectId,
      assignedTo: args.assignedTo,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Update action item with task link
    const updatedActionItems = meeting.actionItems.map((item) => {
      if (item.id === args.actionItemId) {
        return {
          ...item,
          taskId: taskId,
        };
      }
      return item;
    });

    await ctx.db.patch(args.meetingId, {
      actionItems: updatedActionItems,
      updatedAt: now,
    });

    return { taskId };
  },
});
