import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { applyPipelineStage } from "./prospectStages";
import { effectiveMeetingStatus } from "./lib/meetingStatus";

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
      // v3 lifecycle: a freshly-booked meeting starts scheduled.
      status: "scheduled",
      completionSource: undefined,
      completedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Knowledge feed — one-shot meeting atomization (the action re-checks the
    // atomizedAt stamp, text presence, and the cost wall).
    await ctx.scheduler.runAfter(
      0,
      internal.knowledge.sourceAtomizer.atomizeMeeting,
      { meetingId },
    );

    // v3: booking advances a prospect to warm_pre_meeting through the canonical
    // stage spine. forward_only never drags a further-along prospect (e.g. one
    // already qualified) back to pre-meeting, and applyPipelineStage no-ops the
    // stage write for non-prospects (guarded here on status === "prospect").
    const client = await ctx.db.get(args.clientId);
    if ((client as any)?.status === "prospect") {
      await applyPipelineStage(ctx, {
        clientId: args.clientId,
        toStage: "warm_pre_meeting",
        reason: "meeting_booked",
        userId: args.createdBy,
        mode: "forward_only",
      });
      // Intel revalidation (Intel leaf owns the freshness/flag decision): a
      // newly-booked meeting may stale the prospect's last full intel run.
      await ctx.scheduler.runAfter(0, internal.intelRevalidate.onMeetingBookedInternal, {
        clientId: args.clientId,
        meetingId,
      });
    }

    // Draft pre-meeting notes (idempotent, fire-and-forget — never blocks the
    // booking mutation).
    await ctx.scheduler.runAfter(0, internal.meetings.draftPreMeetingNotes, { meetingId });

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
      // tasks.assignedTo is an array; promote the single assignee
      assignedTo: args.assignedTo ? [args.assignedTo] : undefined,
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

// ── v1.3 Sprint C — upcoming meetings across all clients ──
//
// Powers the operator's morning queue ("what calls do I have today/this week")
// AND Claude Code's "what's on my plate" surveys. Returns meetings whose
// scheduled meetingDate is in the future (>= now), oldest first (so the
// next-up meeting is at the top).
//
// Acceptable scan-and-filter approach at current row counts (<200 meetings
// in flight per quarter). Add a by_meeting_date index when scale demands.

export const listUpcoming = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const meetings = await ctx.db.query("meetings").collect();
    return meetings
      // Upcoming = future-dated AND not cancelled. Completed-but-future is rare
      // but excluded too (effectiveMeetingStatus treats undefined as scheduled).
      .filter((m) => m.meetingDate >= now && effectiveMeetingStatus(m as any) === "scheduled")
      .sort((a, b) =>
        new Date(a.meetingDate).getTime() - new Date(b.meetingDate).getTime(),
      )
      .slice(0, args.limit ?? 50);
  },
});

// Count upcoming meetings — for the home page section badge.
export const countUpcoming = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const meetings = await ctx.db.query("meetings").collect();
    return meetings.filter(
      (m) => m.meetingDate >= now && effectiveMeetingStatus(m as any) === "scheduled",
    ).length;
  },
});

// ============================================================================
// v3 MEETING LIFECYCLE — completion concept, auto-complete, transcript→intel
// ============================================================================

// Resolve the acting Clerk user (same pattern as prospectStages.resolveUserId).
async function resolveUserId(ctx: any): Promise<Id<"users"> | undefined> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return undefined;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  return user?._id;
}

// Shared, same-transaction completion logic. Idempotent: a no-op when the
// meeting is already completed (avoids duplicate stage events + duplicate
// transcript-into-intel appends) or cancelled. On the first real completion of
// a prospect's meeting it advances the pipeline to warm_post_meeting (forward
// only — never regresses a qualified prospect) and schedules the transcript
// digest append.
async function completeMeetingTx(
  ctx: any,
  args: {
    meetingId: Id<"meetings">;
    completionSource: "transcript" | "date_passed" | "manual";
    byUserId?: Id<"users">;
  },
): Promise<{ ok: boolean; skipped: boolean; reason?: string }> {
  const meeting = await ctx.db.get(args.meetingId);
  if (!meeting) return { ok: false, skipped: true, reason: "not_found" };

  const eff = effectiveMeetingStatus(meeting as any);
  if (eff === "completed" || eff === "cancelled") {
    return { ok: true, skipped: true, reason: eff };
  }

  const now = new Date().toISOString();
  await ctx.db.patch(args.meetingId, {
    status: "completed",
    completedAt: now,
    completionSource: args.completionSource,
    updatedAt: now,
  });

  const client = await ctx.db.get(meeting.clientId);
  if ((client as any)?.status === "prospect") {
    await applyPipelineStage(ctx, {
      clientId: meeting.clientId,
      toStage: "warm_post_meeting",
      reason: "meeting_completed",
      userId: args.byUserId,
      mode: "forward_only",
    });
  }

  // Pull the transcript (if any) into the prospect's intel context. Deferred to
  // its own transaction; independently idempotent via a content marker.
  await ctx.scheduler.runAfter(0, internal.meetings.appendTranscriptToIntel, {
    meetingId: args.meetingId,
  });

  return { ok: true, skipped: false };
}

// Internal entrypoint (cron / fireflies / scheduler callers). Idempotent.
export const markCompletedInternal = internalMutation({
  args: {
    meetingId: v.id("meetings"),
    completionSource: v.union(
      v.literal("transcript"),
      v.literal("date_passed"),
      v.literal("manual"),
    ),
    byUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) =>
    completeMeetingTx(ctx, {
      meetingId: args.meetingId,
      completionSource: args.completionSource,
      byUserId: args.byUserId,
    }),
});

// Operator manual override — marks a scheduled meeting complete.
export const markCompleted = mutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx);
    return completeMeetingTx(ctx, {
      meetingId: args.meetingId,
      completionSource: "manual",
      byUserId: userId,
    });
  },
});

// Operator manual override — cancels a meeting. Does NOT advance pipelineStage.
export const markCancelled = mutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) throw new Error("Meeting not found");
    const now = new Date().toISOString();
    await ctx.db.patch(args.meetingId, { status: "cancelled", updatedAt: now });
    return { ok: true };
  },
});

// Hourly cron entrypoint: auto-complete scheduled meetings whose date has
// passed. completionSource = 'date_passed'.
//
// GUARD: capped per run. There is a backlog of legacy meetings with no status
// (treated as scheduled) and past dates; without a cap the first cron tick
// would mass-complete them all in one transaction (mass stage moves + a flood
// of transcript appends). The cap drains the backlog gradually over successive
// ticks instead.
const AUTO_COMPLETE_PER_RUN_CAP = 25;
export const autoCompleteDueMeetings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    // by_status_date is [status, meetingDate]. Query the two "scheduled"
    // representations separately: explicit 'scheduled' and legacy undefined.
    const scheduled = await ctx.db
      .query("meetings")
      .withIndex("by_status_date", (q: any) =>
        q.eq("status", "scheduled").lte("meetingDate", now),
      )
      .take(AUTO_COMPLETE_PER_RUN_CAP);
    const legacy = await ctx.db
      .query("meetings")
      .withIndex("by_status_date", (q: any) =>
        q.eq("status", undefined).lte("meetingDate", now),
      )
      .take(AUTO_COMPLETE_PER_RUN_CAP);

    const due = [...scheduled, ...legacy].slice(0, AUTO_COMPLETE_PER_RUN_CAP);

    let completed = 0;
    for (const m of due) {
      const r = await completeMeetingTx(ctx, {
        meetingId: m._id,
        completionSource: "date_passed",
      });
      if (r.ok && !r.skipped) completed += 1;
    }
    return { ok: true, scanned: due.length, completed };
  },
});

// Append the meeting's transcript (or summary) into the prospect's intel as a
// dated digest in clientIntelligence.contextMarkdown — the operator lane that
// getDeepContext surfaces. Independently idempotent via an HTML-comment marker
// keyed on the meetingId, so the transcript path and the completion path can
// both schedule this without producing duplicate blocks.
export const appendTranscriptToIntel = internalMutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) return { ok: false, reason: "not_found" };

    const marker = `<!-- meeting-transcript:${String(args.meetingId)} -->`;

    // Idempotency: bail if this meeting's digest is already in the context lane.
    const intel = await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client", (q: any) => q.eq("clientId", meeting.clientId))
      .first();
    if (intel?.contextMarkdown && String(intel.contextMarkdown).includes(marker)) {
      return { ok: true, skipped: true };
    }

    const transcript = await ctx.db
      .query("meetingTranscripts")
      .withIndex("by_meeting", (q: any) => q.eq("meetingId", args.meetingId))
      .first();

    // Build the digest. Prefer the structured transcript summary; fall back to
    // the meeting's own summary so a meeting with no transcript still records a
    // dated note that it happened.
    const dateLabel = (meeting.meetingDate ?? "").slice(0, 10) || "(undated)";
    const attendees = (meeting.attendees ?? [])
      .map((a: any) => a.name)
      .filter(Boolean)
      .join(", ");
    const body =
      transcript?.fullTextSummary?.trim() ||
      meeting.summary?.trim() ||
      "(No transcript or summary captured.)";

    const lines: string[] = [];
    lines.push(marker);
    lines.push(`### Meeting — ${meeting.title || "Untitled"} (${dateLabel})`);
    if (attendees) lines.push(`**Attendees:** ${attendees}`);
    lines.push("");
    lines.push(body);
    if ((meeting.keyPoints ?? []).length > 0) {
      lines.push("");
      lines.push("**Key points:**");
      for (const k of meeting.keyPoints) lines.push(`- ${k}`);
    }
    if ((meeting.decisions ?? []).length > 0) {
      lines.push("");
      lines.push("**Decisions:**");
      for (const d of meeting.decisions) lines.push(`- ${d}`);
    }
    const markdownBlock = lines.join("\n");

    // Defer the actual context write to its own transaction (mutations cannot
    // call ctx.runMutation). appendContextInternal prepends the block.
    await ctx.scheduler.runAfter(0, internal.intelligence.appendContextInternal, {
      clientId: meeting.clientId,
      markdownBlock,
      addedBy: "meeting-lifecycle",
    });

    return { ok: true, skipped: false };
  },
});

// Draft a lightweight pre-meeting brief at booking time and stamp
// preMeetingNotesDraftedAt to make it idempotent. Internal-only output (no
// external action), so no approval gate. Builds the brief from the prospect's
// existing intel context rather than calling an LLM, keeping it cheap and
// failure-free in the booking critical path.
export const draftPreMeetingNotes = internalMutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) return { ok: false, reason: "not_found" };
    // Idempotent: only draft once per meeting.
    if ((meeting as any).preMeetingNotesDraftedAt) {
      return { ok: true, skipped: true };
    }

    const now = new Date().toISOString();
    const client = await ctx.db.get(meeting.clientId);
    const intel = await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client", (q: any) => q.eq("clientId", meeting.clientId))
      .first();

    // Take the most recent slice of the operator-context lane as the running
    // reference (newest block is prepended), trimmed to keep the note compact.
    const context = (intel?.contextMarkdown ?? "").trim();
    const contextSnippet = context ? context.slice(0, 1200) : "";

    const lines: string[] = [];
    lines.push(`## Pre-meeting brief — ${(client as any)?.name ?? "Prospect"}`);
    lines.push(`Meeting: ${meeting.title || "Untitled"} · ${(meeting.meetingDate ?? "").slice(0, 16).replace("T", " ")}`);
    lines.push("");
    if (contextSnippet) {
      lines.push("### Latest intel context");
      lines.push(contextSnippet);
    } else {
      lines.push("_No prospect intel context on file yet — run prospect-intel before the call._");
    }
    const brief = lines.join("\n");

    // Preserve any operator-entered notes; append the brief beneath them.
    const existingNotes = (meeting.notes ?? "").trim();
    const nextNotes = existingNotes
      ? `${existingNotes}\n\n---\n\n${brief}`
      : brief;

    await ctx.db.patch(args.meetingId, {
      notes: nextNotes,
      preMeetingNotesDraftedAt: now,
      updatedAt: now,
    });
    return { ok: true, skipped: false };
  },
});
