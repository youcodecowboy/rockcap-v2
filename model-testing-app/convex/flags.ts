import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";

// ============================================================================
// Queries
// ============================================================================

// Get flags assigned to the current user, with optional status filter
export const getMyFlags = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    let flags;
    if (args.status) {
      flags = await ctx.db
        .query("flags")
        .withIndex("by_assignedTo_status", (q: any) =>
          q.eq("assignedTo", user._id).eq("status", args.status)
        )
        .collect();
    } else {
      flags = await ctx.db
        .query("flags")
        .withIndex("by_assignedTo", (q: any) => q.eq("assignedTo", user._id))
        .collect();
    }

    // Sort by createdAt descending
    flags.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return flags;
  },
});

// Get flags created by the current user
export const getMyCreatedFlags = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    let flags = await ctx.db
      .query("flags")
      .withIndex("by_createdBy", (q: any) => q.eq("createdBy", user._id))
      .collect();

    if (args.status) {
      flags = flags.filter((f) => f.status === args.status);
    }

    // Sort by createdAt descending
    flags.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return flags;
  },
});

// Get flags for a specific entity
export const getByEntity = query({
  args: {
    entityType: v.union(
      v.literal("document"),
      v.literal("meeting"),
      v.literal("task"),
      v.literal("project"),
      v.literal("client"),
      v.literal("checklist_item")
    ),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_entity", (q: any) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();

    // Sort by createdAt descending
    flags.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return flags;
  },
});

// Get count of open flags for an entity
export const getOpenCountByEntity = query({
  args: {
    entityType: v.union(
      v.literal("document"),
      v.literal("meeting"),
      v.literal("task"),
      v.literal("project"),
      v.literal("client"),
      v.literal("checklist_item")
    ),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_entity", (q: any) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();

    return flags.filter((f) => f.status === "open").length;
  },
});

// Get a single flag by ID
export const get = query({
  args: { id: v.id("flags") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get thread entries for a flag
export const getThread = query({
  args: { flagId: v.id("flags") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("flagThreadEntries")
      .withIndex("by_flag", (q: any) => q.eq("flagId", args.flagId))
      .collect();

    // Sort by createdAt ascending (oldest first, chronological)
    entries.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return entries;
  },
});

// Get combined inbox items (flags + notifications) for the current user
export const getInboxItems = query({
  args: {
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("flags"),
        v.literal("notifications"),
        v.literal("mentions"),
        v.literal("resolved")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const filter = args.filter || "all";
    const limit = args.limit || 50;

    const items: Array<{
      kind: "flag" | "notification";
      id: string;
      createdAt: string;
      data: any;
    }> = [];

    // Fetch flags if needed
    if (filter === "all" || filter === "flags" || filter === "resolved") {
      let flags;
      if (filter === "resolved") {
        flags = await ctx.db
          .query("flags")
          .withIndex("by_assignedTo_status", (q: any) =>
            q.eq("assignedTo", user._id).eq("status", "resolved")
          )
          .collect();
      } else {
        flags = await ctx.db
          .query("flags")
          .withIndex("by_assignedTo", (q: any) =>
            q.eq("assignedTo", user._id)
          )
          .collect();

        // For "flags" filter, only show open
        if (filter === "flags") {
          flags = flags.filter((f) => f.status === "open");
        }
      }

      for (const flag of flags) {
        items.push({
          kind: "flag",
          id: flag._id,
          createdAt: flag.createdAt,
          data: flag,
        });
      }
    }

    // Fetch notifications if needed
    if (
      filter === "all" ||
      filter === "notifications" ||
      filter === "mentions"
    ) {
      let notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect();

      // For "mentions" filter, show flag-type and mention-type notifications
      if (filter === "mentions") {
        notifications = notifications.filter((n) => n.type === "flag" || n.type === "mention");
      }

      for (const notif of notifications) {
        items.push({
          kind: "notification",
          id: notif._id,
          createdAt: notif.createdAt,
          data: notif,
        });
      }
    }

    // Sort by createdAt descending
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return items.slice(0, limit);
  },
});

// ============================================================================
// Mutations
// ============================================================================

// Create a new flag
export const create = mutation({
  args: {
    entityType: v.union(
      v.literal("document"),
      v.literal("meeting"),
      v.literal("task"),
      v.literal("project"),
      v.literal("client"),
      v.literal("checklist_item")
    ),
    entityId: v.string(),
    assignedTo: v.optional(v.id("users")),
    note: v.string(),
    priority: v.optional(v.union(v.literal("normal"), v.literal("urgent"))),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();
    const assignedTo = args.assignedTo || user._id;
    const priority = args.priority || "normal";

    const flagId = await ctx.db.insert("flags", {
      entityType: args.entityType,
      entityId: args.entityId,
      createdBy: user._id,
      assignedTo,
      note: args.note,
      status: "open",
      priority,
      clientId: args.clientId,
      projectId: args.projectId,
      createdAt: now,
    });

    // Notify assigned user if not self
    if (assignedTo !== user._id) {
      const userName = user.name || user.email;
      await ctx.db.insert("notifications", {
        userId: assignedTo,
        type: "flag",
        title: `${userName} flagged something for you`,
        message: args.note.substring(0, 100),
        relatedId: flagId,
        isRead: false,
        createdAt: now,
      });
    }

    return flagId;
  },
});

// Reply to a flag thread
export const reply = mutation({
  args: {
    flagId: v.id("flags"),
    content: v.string(),
    resolve: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    const flag = await ctx.db.get(args.flagId);
    if (!flag) {
      throw new Error("Flag not found");
    }

    // Add message to thread
    const entryId = await ctx.db.insert("flagThreadEntries", {
      flagId: args.flagId,
      entryType: "message",
      userId: user._id,
      content: args.content,
      createdAt: now,
    });

    // Resolve if requested
    if (args.resolve) {
      await ctx.db.patch(args.flagId, {
        status: "resolved" as const,
        resolvedBy: user._id,
        resolvedAt: now,
      });
    }

    // Collect all participants (creator + assignee + thread repliers)
    const participantIds = new Set<string>();
    participantIds.add(flag.createdBy);
    participantIds.add(flag.assignedTo);

    // Get all thread entries to find other participants
    const threadEntries = await ctx.db
      .query("flagThreadEntries")
      .withIndex("by_flag", (q: any) => q.eq("flagId", args.flagId))
      .collect();

    for (const entry of threadEntries) {
      if (entry.userId) {
        participantIds.add(entry.userId);
      }
    }

    // Remove current user from notification list
    participantIds.delete(user._id);

    // Notify all other participants
    const userName = user.name || user.email;
    const action = args.resolve ? "resolved a flag" : "replied to a flag";
    for (const participantId of participantIds) {
      await ctx.db.insert("notifications", {
        userId: participantId as any,
        type: "flag",
        title: `${userName} ${action}`,
        message: args.content.substring(0, 100),
        relatedId: args.flagId,
        isRead: false,
        createdAt: now,
      });
    }

    return entryId;
  },
});

// Resolve a flag
export const resolve = mutation({
  args: { id: v.id("flags") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    const flag = await ctx.db.get(args.id);
    if (!flag) {
      throw new Error("Flag not found");
    }

    await ctx.db.patch(args.id, {
      status: "resolved" as const,
      resolvedBy: user._id,
      resolvedAt: now,
    });

    // Log activity
    await ctx.db.insert("flagThreadEntries", {
      flagId: args.id,
      entryType: "activity",
      userId: user._id,
      content: "Resolved this flag",
      createdAt: now,
    });

    return args.id;
  },
});

// Reopen a resolved flag
export const reopen = mutation({
  args: { id: v.id("flags") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    const flag = await ctx.db.get(args.id);
    if (!flag) {
      throw new Error("Flag not found");
    }

    await ctx.db.patch(args.id, {
      status: "open" as const,
      resolvedBy: undefined,
      resolvedAt: undefined,
    });

    // Log activity
    await ctx.db.insert("flagThreadEntries", {
      flagId: args.id,
      entryType: "activity",
      userId: user._id,
      content: "Reopened this flag",
      createdAt: now,
    });

    return args.id;
  },
});

// Delete a flag and its thread entries
export const remove = mutation({
  args: { id: v.id("flags") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const flag = await ctx.db.get(args.id);
    if (!flag) {
      throw new Error("Flag not found");
    }

    // Only creator can delete
    if (flag.createdBy !== user._id) {
      throw new Error("Unauthorized: Only the flag creator can delete it");
    }

    // Delete all thread entries
    const entries = await ctx.db
      .query("flagThreadEntries")
      .withIndex("by_flag", (q: any) => q.eq("flagId", args.id))
      .collect();

    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    // Delete the flag
    await ctx.db.delete(args.id);

    return args.id;
  },
});

// Log an activity entry on all open flags for an entity
// Called by other mutations when entities are updated
export const logActivity = mutation({
  args: {
    entityType: v.union(
      v.literal("document"),
      v.literal("meeting"),
      v.literal("task"),
      v.literal("project"),
      v.literal("client"),
      v.literal("checklist_item")
    ),
    entityId: v.string(),
    content: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Query open flags for this entity
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_entity", (q: any) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();

    // Filter to open only
    const openFlags = flags.filter((f) => f.status === "open");

    // Zero overhead if no open flags
    if (openFlags.length === 0) {
      return 0;
    }

    const now = new Date().toISOString();

    // Get current user if authenticated (optional for system-triggered activities)
    let userId: any = undefined;
    try {
      const user = await getAuthenticatedUser(ctx);
      userId = user._id;
    } catch {
      // System-triggered activity, no user
    }

    // Insert activity entry for each open flag
    for (const flag of openFlags) {
      await ctx.db.insert("flagThreadEntries", {
        flagId: flag._id,
        entryType: "activity",
        userId,
        content: args.content,
        metadata: args.metadata,
        createdAt: now,
      });
    }

    return openFlags.length;
  },
});
