import type { AtomicTool } from "../types";

export const REMINDER_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getReminders",
    domain: "reminder",
    action: "read",
    description:
      "Get user's reminders with optional filters for status, client, project, or date range.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "completed", "dismissed", "overdue"],
          description: "Filter reminders by status",
        },
        clientId: { type: "string", description: "Filter by client ID" },
        projectId: { type: "string", description: "Filter by project ID" },
        startDate: {
          type: "string",
          description: "Filter from this date (ISO timestamp)",
        },
        endDate: {
          type: "string",
          description: "Filter until this date (ISO timestamp)",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "reminders.getByUser" },
    contextRelevance: ["reminder", "client", "project"],
  },
  {
    name: "getUpcomingReminders",
    domain: "reminder",
    action: "read",
    description: "Get user's upcoming reminders for the next N days.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days ahead to look (default 7)",
        },
        limit: {
          type: "number",
          description: "Maximum number of reminders to return",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "reminders.getUpcoming" },
    contextRelevance: ["reminder"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createReminder",
    domain: "reminder",
    action: "write",
    description:
      "Create a reminder that triggers at a scheduled time. Can link to a client, project, or task.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Reminder title (required)" },
        scheduledFor: {
          type: "string",
          description: "When to trigger the reminder (ISO timestamp, required)",
        },
        description: { type: "string", description: "Reminder description" },
        clientId: { type: "string", description: "Link to a client" },
        projectId: { type: "string", description: "Link to a project" },
        taskId: { type: "string", description: "Link to a task" },
      },
      required: ["title", "scheduledFor"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "reminders.create" },
    contextRelevance: ["reminder", "client", "project", "task"],
  },
  {
    name: "completeReminder",
    domain: "reminder",
    action: "write",
    description: "Mark a reminder as completed.",
    parameters: {
      type: "object",
      properties: {
        reminderId: {
          type: "string",
          description: "The ID of the reminder to complete",
        },
      },
      required: ["reminderId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "reminders.complete" },
    contextRelevance: ["reminder"],
  },
  {
    name: "dismissReminder",
    domain: "reminder",
    action: "write",
    description: "Dismiss a reminder without completing it.",
    parameters: {
      type: "object",
      properties: {
        reminderId: {
          type: "string",
          description: "The ID of the reminder to dismiss",
        },
      },
      required: ["reminderId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "reminders.dismiss" },
    contextRelevance: ["reminder"],
  },
];
