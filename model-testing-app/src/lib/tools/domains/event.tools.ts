import type { AtomicTool } from "../types";

export const EVENT_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getEvents",
    domain: "event",
    action: "read",
    description:
      "Get user's calendar events with optional filters (date range, client, project).",
    parameters: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Filter events from this date (ISO timestamp)",
        },
        endDate: {
          type: "string",
          description: "Filter events until this date (ISO timestamp)",
        },
        clientId: { type: "string", description: "Filter by client ID" },
        projectId: { type: "string", description: "Filter by project ID" },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "events.list" },
    contextRelevance: ["event", "client", "project"],
  },
  {
    name: "getNextEvent",
    domain: "event",
    action: "read",
    description: "Get the user's next upcoming event.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "events.getNextEvent" },
    contextRelevance: ["event"],
  },
  {
    name: "getUpcomingEvents",
    domain: "event",
    action: "read",
    description: "Get upcoming events for the next N days.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days ahead to look (default 7)",
        },
        limit: {
          type: "number",
          description: "Maximum number of events to return",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "events.getUpcoming" },
    contextRelevance: ["event"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createEvent",
    domain: "event",
    action: "write",
    description: "Create a new calendar event.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title (required)" },
        startTime: {
          type: "string",
          description: "Event start time (ISO timestamp, required)",
        },
        endTime: {
          type: "string",
          description: "Event end time (ISO timestamp, required)",
        },
        description: { type: "string", description: "Event description" },
        location: { type: "string", description: "Event location" },
        allDay: {
          type: "boolean",
          description: "Whether this is an all-day event",
        },
        clientId: { type: "string", description: "Link to a client" },
        projectId: { type: "string", description: "Link to a project" },
      },
      required: ["title", "startTime", "endTime"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "events.create" },
    contextRelevance: ["event", "client", "project"],
  },
  {
    name: "updateEvent",
    domain: "event",
    action: "write",
    description: "Update an existing calendar event.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Event ID (required)" },
        title: { type: "string", description: "Updated title" },
        description: { type: "string", description: "Updated description" },
        location: { type: "string", description: "Updated location" },
        startTime: {
          type: "string",
          description: "Updated start time (ISO timestamp)",
        },
        endTime: {
          type: "string",
          description: "Updated end time (ISO timestamp)",
        },
        allDay: {
          type: "boolean",
          description: "Whether this is an all-day event",
        },
        clientId: {
          type: "string",
          description: "Link to a client (use null to unlink)",
        },
        projectId: {
          type: "string",
          description: "Link to a project (use null to unlink)",
        },
      },
      required: ["eventId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "events.update" },
    contextRelevance: ["event"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteEvent",
    domain: "event",
    action: "delete",
    description: "Delete a calendar event.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Event ID (required)" },
      },
      required: ["eventId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "events.remove" },
    contextRelevance: ["event"],
  },
];
