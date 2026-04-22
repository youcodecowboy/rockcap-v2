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
 * Get all meetings for a client, merged with MEETING_NOTE activities (e.g. Fireflies
 * transcripts synced from HubSpot). Each row carries a `source` discriminator:
 *   - 'native'    → row from the `meetings` table (full structured shape)
 *   - 'fireflies' → derived from an MEETING_NOTE activity (adapted to meeting-row shape)
 *
 * Fireflies-derived rows use synthetic `_id` values prefixed with `activity-` so the
 * client can still key lists by `_id` without colliding with real meeting doc IDs.
 * Server-side sort by date desc is correct regardless of origin.
 *
 * Kept separate from `getByClient` so other callers that expect only native meetings
 * (e.g. unverified-meetings flows) are unaffected.
 */
export const getByClientIncludingMeetingNotes = query({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Native meetings (existing behaviour)
    const nativeMeetings = await ctx.db
      .query("meetings")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    const nativeRows = nativeMeetings.map((m) => ({
      ...m,
      source: "native" as const,
    }));

    // 2. MEETING_NOTE activities — resolve via companies promoted to this client,
    //    then pull activities keyed to each company via the `by_company` index.
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();

    const activityRows = [] as Array<{
      _id: string;
      _creationTime: number;
      source: "fireflies";
      clientId: typeof args.clientId;
      projectId: undefined;
      title: string;
      meetingDate: string;
      meetingType: undefined;
      attendees: Array<{ name: string }>;
      summary: string;
      keyPoints: never[];
      decisions: never[];
      actionItems: never[];
      sourceDocumentId: undefined;
      sourceDocumentName: undefined;
      extractionConfidence: undefined;
      verified: boolean;
      createdBy: undefined;
      tags: undefined;
      notes: undefined;
      createdAt: string;
      updatedAt: string;
      // Fireflies-specific passthroughs
      transcriptUrl: string | undefined;
      fullBody: string | undefined;
      bodyPreview: string | undefined;
      durationMinutes: number | undefined;
      sourceIntegration: string | undefined;
      activityId: string;
    }>;

    if (companies.length > 0) {
      // 2a. Direct match: MEETING_NOTE activities whose primary
      // `companyId` points to one of this client's companies.
      const perCompany = await Promise.all(
        companies.map((c) =>
          ctx.db
            .query("activities")
            .withIndex("by_company", (q) => q.eq("companyId", c._id))
            .collect(),
        ),
      );
      const directMatches = perCompany
        .flat()
        .filter((a) => a.activityType === "MEETING_NOTE");

      // 2b. Contact-transitive match: MEETING_NOTE activities linked to
      // contacts that belong to one of this client's companies. HubSpot
      // associates an engagement with multiple companies+contacts, but our
      // sync only captures ONE primary `companyId`. So an activity whose
      // primary company is e.g. Falco (a counterparty) won't surface on
      // the Bayfield Homes profile via direct lookup — even though one of
      // its linked contacts (jbird@bayfieldhomes.co.uk) belongs to
      // Bayfield. Walking linkedContactIds → contact.linkedCompanyIds
      // catches those.
      //
      // Bounded scan: there's typically a small number of MEETING_NOTE
      // activities (<100 expected), so filtering in-memory is fine. If
      // this grows past a few thousand, switch to an index-backed path.
      const companyConvexIdSet = new Set(companies.map((c) => String(c._id)));
      const allMeetingNotes = await ctx.db
        .query("activities")
        .withIndex("by_activity_type", (q) =>
          q.eq("activityType", "MEETING_NOTE"),
        )
        .collect();

      const transitiveMatches: any[] = [];
      for (const a of allMeetingNotes) {
        // Skip if already found via direct lookup (dedupe by _id)
        if (directMatches.some((d) => String(d._id) === String(a._id))) {
          continue;
        }
        const linkedContactIds = (a as any).linkedContactIds ?? [];
        if (linkedContactIds.length === 0) continue;

        // Check each contact's linkedCompanyIds for overlap with this
        // client's companies. Short-circuit on first hit.
        for (const contactId of linkedContactIds) {
          const contact: any = await ctx.db.get(contactId);
          const contactCompanies: any[] = contact?.linkedCompanyIds ?? [];
          if (
            contactCompanies.some((cc: any) =>
              companyConvexIdSet.has(String(cc)),
            )
          ) {
            transitiveMatches.push(a);
            break;
          }
        }
      }

      const meetingNotes = [...directMatches, ...transitiveMatches];

      for (const a of meetingNotes) {
        const attendees = (a.toEmails ?? []).map((email) => ({ name: email }));
        activityRows.push({
          _id: `activity-${String(a._id)}`,
          _creationTime: a._creationTime,
          source: "fireflies",
          clientId: args.clientId,
          projectId: undefined,
          title: a.subject || "Call transcript",
          meetingDate: a.activityDate,
          meetingType: undefined,
          attendees,
          summary: a.bodyPreview ?? "",
          keyPoints: [],
          decisions: [],
          actionItems: [],
          sourceDocumentId: undefined,
          sourceDocumentName: undefined,
          extractionConfidence: undefined,
          verified: true,
          createdBy: undefined,
          tags: undefined,
          notes: undefined,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          // Fireflies-specific passthroughs
          transcriptUrl: a.transcriptUrl,
          fullBody: a.bodyHtml,
          bodyPreview: a.bodyPreview,
          durationMinutes:
            typeof a.duration === "number" && a.duration > 0
              ? Math.round(a.duration / 60000)
              : undefined,
          sourceIntegration: a.sourceIntegration,
          activityId: String(a._id),
        });
      }
    }

    // 3. Merge + sort newest-first by meetingDate
    const merged = [...nativeRows, ...activityRows] as Array<
      typeof nativeRows[number] | typeof activityRows[number]
    >;
    merged.sort(
      (a, b) =>
        new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime(),
    );

    return args.limit ? merged.slice(0, args.limit) : merged;
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
 * Get unverified (auto-extracted) meetings for a client
 */
export const getUnverifiedByClient = query({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    return meetings.filter((m) => m.verified === false);
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
    verified: v.optional(v.boolean()),
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
      verified: args.verified !== undefined ? args.verified : true,
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
    verified: v.optional(v.boolean()),
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
    if (updates.verified !== undefined) updateObj.verified = updates.verified;
    if (updates.tags !== undefined) updateObj.tags = updates.tags;
    if (updates.notes !== undefined) updateObj.notes = updates.notes;

    await ctx.db.patch(meetingId, updateObj);

    // Log flag activity
    const changedKeys = Object.keys(updates).filter((k) => (updates as any)[k] !== undefined);
    if (changedKeys.length > 0) {
      const openFlags = await ctx.db
        .query("flags")
        .withIndex("by_entity", (q: any) =>
          q.eq("entityType", "meeting").eq("entityId", meetingId)
        )
        .collect();
      for (const flag of openFlags.filter((f) => f.status === "open")) {
        await ctx.db.insert("flagThreadEntries", {
          flagId: flag._id,
          entryType: "activity",
          content: `Updated meeting details (${changedKeys.join(", ")})`,
          metadata: { action: "updated", fields: changedKeys },
          createdAt: now,
        });
      }
    }

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
 * Verify (approve) an auto-extracted meeting
 */
export const verifyMeeting = mutation({
  args: {
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) {
      throw new Error("Meeting not found");
    }

    await ctx.db.patch(args.meetingId, {
      verified: true,
      updatedAt: new Date().toISOString(),
    });

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

    // Log flag activity for action item status change
    const actionItem = meeting.actionItems.find((item) => item.id === args.actionItemId);
    const itemTitle = actionItem ? actionItem.description.substring(0, 60) : args.actionItemId;
    const openFlags = await ctx.db
      .query("flags")
      .withIndex("by_entity", (q: any) =>
        q.eq("entityType", "meeting").eq("entityId", args.meetingId)
      )
      .collect();
    for (const flag of openFlags.filter((f) => f.status === "open")) {
      await ctx.db.insert("flagThreadEntries", {
        flagId: flag._id,
        entryType: "activity",
        content: `Marked action item "${itemTitle}" as ${args.status}`,
        metadata: { action: "action_item_status", status: args.status, actionItemId: args.actionItemId },
        createdAt: now,
      });
    }

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
