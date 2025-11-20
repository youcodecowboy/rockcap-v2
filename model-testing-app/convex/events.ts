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

// Mutation: Create event
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.string(), // ISO timestamp
    endTime: v.string(), // ISO timestamp
    allDay: v.optional(v.boolean()),
    attendees: v.optional(v.array(v.object({
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      responseStatus: v.optional(v.union(
        v.literal("needsAction"),
        v.literal("declined"),
        v.literal("tentative"),
        v.literal("accepted")
      )),
    }))),
    recurrence: v.optional(v.string()), // RRULE format
    colorId: v.optional(v.string()),
    visibility: v.optional(v.union(
      v.literal("default"),
      v.literal("public"),
      v.literal("private"),
      v.literal("confidential")
    )),
    status: v.optional(v.union(
      v.literal("confirmed"),
      v.literal("tentative"),
      v.literal("cancelled")
    )),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    organizerId: v.optional(v.id("users")),
    reminders: v.optional(v.array(v.object({
      method: v.union(
        v.literal("email"),
        v.literal("popup")
      ),
      minutes: v.number(),
    }))),
    attachments: v.optional(v.array(v.id("_storage"))),
    conferenceData: v.optional(v.object({
      videoLink: v.optional(v.string()),
      conferenceId: v.optional(v.string()),
      entryPoints: v.optional(v.array(v.object({
        entryPointType: v.optional(v.string()),
        uri: v.optional(v.string()),
        label: v.optional(v.string()),
      }))),
    })),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();

    const eventId = await ctx.db.insert("events", {
      title: args.title,
      description: args.description,
      location: args.location,
      startTime: args.startTime,
      endTime: args.endTime,
      allDay: args.allDay || false,
      attendees: args.attendees,
      recurrence: args.recurrence,
      colorId: args.colorId,
      visibility: args.visibility || "default",
      status: args.status || "confirmed",
      createdBy: user._id,
      organizerId: args.organizerId || user._id,
      clientId: args.clientId,
      projectId: args.projectId,
      reminders: args.reminders,
      attachments: args.attachments,
      conferenceData: args.conferenceData,
      metadata: args.metadata,
      syncStatus: "local_only", // Will be synced to Google when OAuth is set up
      createdAt: now,
      updatedAt: now,
    });

    return eventId;
  },
});

// Mutation: Update event
export const update = mutation({
  args: {
    id: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    allDay: v.optional(v.boolean()),
    attendees: v.optional(v.array(v.object({
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      responseStatus: v.optional(v.union(
        v.literal("needsAction"),
        v.literal("declined"),
        v.literal("tentative"),
        v.literal("accepted")
      )),
    }))),
    recurrence: v.optional(v.union(v.string(), v.null())),
    colorId: v.optional(v.string()),
    visibility: v.optional(v.union(
      v.literal("default"),
      v.literal("public"),
      v.literal("private"),
      v.literal("confidential")
    )),
    status: v.optional(v.union(
      v.literal("confirmed"),
      v.literal("tentative"),
      v.literal("cancelled")
    )),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    organizerId: v.optional(v.union(v.id("users"), v.null())),
    reminders: v.optional(v.array(v.object({
      method: v.union(
        v.literal("email"),
        v.literal("popup")
      ),
      minutes: v.number(),
    }))),
    attachments: v.optional(v.array(v.id("_storage"))),
    conferenceData: v.optional(v.object({
      videoLink: v.optional(v.string()),
      conferenceId: v.optional(v.string()),
      entryPoints: v.optional(v.array(v.object({
        entryPointType: v.optional(v.string()),
        uri: v.optional(v.string()),
        label: v.optional(v.string()),
      }))),
    })),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Event not found");
    }

    // Verify user can edit: creator or organizer can edit
    if (existing.createdBy !== user._id && existing.organizerId !== user._id) {
      throw new Error("Unauthorized: You can only edit events you created or are organizing");
    }

    const patchData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Convert null to undefined for optional ID fields
    if (patchData.clientId === null) patchData.clientId = undefined;
    if (patchData.projectId === null) patchData.projectId = undefined;
    if (patchData.organizerId === null) patchData.organizerId = undefined;
    if (patchData.recurrence === null) patchData.recurrence = undefined;

    // Update sync status to pending if event was synced before
    if (existing.syncStatus === "synced") {
      patchData.syncStatus = "pending";
    }

    await ctx.db.patch(id, patchData);
    return id;
  },
});

// Mutation: Delete event
export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const event = await ctx.db.get(args.id);
    if (!event) {
      throw new Error("Event not found");
    }

    // Verify user can delete: creator or organizer can delete
    if (event.createdBy !== user._id && event.organizerId !== user._id) {
      throw new Error("Unauthorized: Only the event creator or organizer can delete events");
    }

    await ctx.db.delete(args.id);
  },
});

// Mutation: Update Google sync status
export const updateGoogleSync = mutation({
  args: {
    id: v.id("events"),
    googleEventId: v.optional(v.string()),
    googleCalendarUrl: v.optional(v.string()),
    syncStatus: v.union(
      v.literal("synced"),
      v.literal("pending"),
      v.literal("failed"),
      v.literal("local_only")
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const { id, ...updates } = args;

    const event = await ctx.db.get(id);
    if (!event) {
      throw new Error("Event not found");
    }

    // Verify user can update sync: creator or organizer
    if (event.createdBy !== user._id && event.organizerId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(id, {
      ...updates,
      lastGoogleSync: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return id;
  },
});

// Query: Get event by ID
export const get = query({
  args: { id: v.id("events") },
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

    const event = await ctx.db.get(args.id);
    if (!event) {
      return null;
    }

    // Only return if user created or is organizer, or is an attendee
    if (event.createdBy !== user._id && event.organizerId !== user._id) {
      // Check if user is an attendee
      const isAttendee = event.attendees?.some(
        attendee => attendee.email === user.email
      );
      if (!isAttendee) {
        return null;
      }
    }

    return event;
  },
});

// Query: List events with filters
export const list = query({
  args: {
    startDate: v.optional(v.string()), // ISO timestamp - filter events starting from this date
    endDate: v.optional(v.string()), // ISO timestamp - filter events ending before this date
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    includeCancelled: v.optional(v.boolean()),
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

    // Get all events
    let events = await ctx.db
      .query("events")
      .collect();

    // Filter to events user created, is organizing, or is attending
    events = events.filter(event => {
      if (event.createdBy === user._id || event.organizerId === user._id) {
        return true;
      }
      // Check if user is an attendee
      return event.attendees?.some(
        attendee => attendee.email === user.email
      );
    });

    // Filter by date range
    if (args.startDate) {
      const startDate = new Date(args.startDate);
      events = events.filter(event => {
        const eventEnd = new Date(event.endTime);
        return eventEnd >= startDate;
      });
    }

    if (args.endDate) {
      const endDate = new Date(args.endDate);
      events = events.filter(event => {
        const eventStart = new Date(event.startTime);
        return eventStart <= endDate;
      });
    }

    // Filter by client
    if (args.clientId) {
      events = events.filter(e => e.clientId === args.clientId);
    }

    // Filter by project
    if (args.projectId) {
      events = events.filter(e => e.projectId === args.projectId);
    }

    // Filter cancelled events
    if (!args.includeCancelled) {
      events = events.filter(e => e.status !== "cancelled");
    }

    // Sort by start time ascending
    return events.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  },
});

// Query: Get events by date range (for calendar views)
export const getByDateRange = query({
  args: {
    startDate: v.string(), // ISO timestamp
    endDate: v.string(), // ISO timestamp
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

    // Get all events
    let events = await ctx.db
      .query("events")
      .collect();

    // Filter to events user created, is organizing, or is attending
    events = events.filter(event => {
      if (event.createdBy === user._id || event.organizerId === user._id) {
        return true;
      }
      // Check if user is an attendee
      return event.attendees?.some(
        attendee => attendee.email === user.email
      );
    });

    // Filter by date range
    const startDate = new Date(args.startDate);
    const endDate = new Date(args.endDate);
    events = events.filter(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      // Event overlaps with range if it starts before range ends and ends after range starts
      return eventStart <= endDate && eventEnd >= startDate;
    });

    // Filter out cancelled events
    events = events.filter(e => e.status !== "cancelled");

    // Sort by start time ascending
    return events.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  },
});

// Query: Get user's events
export const getByUser = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
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

    // Get all events
    let events = await ctx.db
      .query("events")
      .collect();

    // Filter to events user created, is organizing, or is attending
    events = events.filter(event => {
      if (event.createdBy === user._id || event.organizerId === user._id) {
        return true;
      }
      // Check if user is an attendee
      return event.attendees?.some(
        attendee => attendee.email === user.email
      );
    });

    // Filter by date range if provided
    if (args.startDate) {
      const startDate = new Date(args.startDate);
      events = events.filter(event => {
        const eventEnd = new Date(event.endTime);
        return eventEnd >= startDate;
      });
    }

    if (args.endDate) {
      const endDate = new Date(args.endDate);
      events = events.filter(event => {
        const eventStart = new Date(event.startTime);
        return eventStart <= endDate;
      });
    }

    // Filter out cancelled events
    events = events.filter(e => e.status !== "cancelled");

    // Sort by start time ascending
    return events.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  },
});

// Query: Get upcoming events
export const getUpcoming = query({
  args: {
    limit: v.optional(v.number()), // Number of events to return
    days: v.optional(v.number()), // Number of days ahead to look (default: 7)
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

    const now = new Date();
    const daysAhead = args.days || 7;
    const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    // Get all events
    let events = await ctx.db
      .query("events")
      .collect();

    // Filter to events user created, is organizing, or is attending
    events = events.filter(event => {
      if (event.createdBy === user._id || event.organizerId === user._id) {
        return true;
      }
      // Check if user is an attendee
      return event.attendees?.some(
        attendee => attendee.email === user.email
      );
    });

    // Filter by date range
    events = events.filter(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventStart >= now && eventStart <= endDate;
    });

    // Filter out cancelled events
    events = events.filter(e => e.status !== "cancelled");

    // Sort by start time and limit
    const sorted = events.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return args.limit ? sorted.slice(0, args.limit) : sorted;
  },
});

// Query: Get next event (for dashboard)
export const getNextEvent = query({
  args: {},
  handler: async (ctx) => {
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

    const now = new Date();

    // Get all events
    let events = await ctx.db
      .query("events")
      .collect();

    // Filter to events user created, is organizing, or is attending
    events = events.filter(event => {
      if (event.createdBy === user._id || event.organizerId === user._id) {
        return true;
      }
      // Check if user is an attendee
      return event.attendees?.some(
        attendee => attendee.email === user.email
      );
    });

    // Find the next event (earliest start time after now)
    const upcomingEvents = events.filter(event => {
      const eventStart = new Date(event.startTime);
      return eventStart >= now && event.status !== "cancelled";
    });

    if (upcomingEvents.length === 0) {
      return null;
    }

    // Sort by start time and return the first one
    upcomingEvents.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return upcomingEvents[0];
  },
});

