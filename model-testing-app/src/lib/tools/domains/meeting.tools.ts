import type { AtomicTool } from "../types";

export const MEETING_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getMeetingsByClient",
    domain: "meeting",
    action: "read",
    description:
      "Get all meetings for a client, sorted by date (newest first). Returns title, date, type, attendees, summary, key points, decisions, and action items.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The client ID" },
        limit: { type: "string", description: "Max number of meetings to return" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "meetings.getByClient" },
    contextRelevance: ["meeting", "client"],
  },
  {
    name: "getMeetingsByProject",
    domain: "meeting",
    action: "read",
    description:
      "Get all meetings for a project, sorted by date (newest first).",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        limit: { type: "string", description: "Max number of meetings to return" },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "meetings.getByProject" },
    contextRelevance: ["meeting", "project"],
  },
  {
    name: "getMeeting",
    domain: "meeting",
    action: "read",
    description: "Get a specific meeting by ID with full details including all action items.",
    parameters: {
      type: "object",
      properties: {
        meetingId: { type: "string", description: "The meeting ID" },
      },
      required: ["meetingId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "meetings.get" },
    contextRelevance: ["meeting"],
  },
  {
    name: "getMeetingCount",
    domain: "meeting",
    action: "read",
    description: "Get the total number of meetings for a client.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The client ID" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "meetings.getCountByClient" },
    contextRelevance: ["meeting", "client"],
  },
  {
    name: "getPendingActionItems",
    domain: "meeting",
    action: "read",
    description: "Get the count of pending (uncompleted) action items across all meetings for a client.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The client ID" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "meetings.getPendingActionItemsCount" },
    contextRelevance: ["meeting", "client"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createMeeting",
    domain: "meeting",
    action: "write",
    description:
      "Create a new meeting record. Use this when the user provides meeting notes, a transcript, or describes a meeting that took place. Extract the key details and pass them as structured data.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The client ID" },
        projectId: { type: "string", description: "Optional project ID" },
        title: { type: "string", description: "Clear descriptive meeting title" },
        meetingDate: { type: "string", description: "Meeting date in YYYY-MM-DD format" },
        meetingType: {
          type: "string",
          enum: ["progress", "kickoff", "review", "site_visit", "call", "other"],
          description: "Type of meeting",
        },
        summary: { type: "string", description: "2-4 sentence executive summary" },
        keyPoints: { type: "string", description: "JSON array of key discussion points" },
        decisions: { type: "string", description: "JSON array of decisions made" },
        actionItems: {
          type: "string",
          description: 'JSON array of action items, each with: {"id":"action-1","description":"...","assignee":"...","dueDate":"YYYY-MM-DD","status":"pending","createdAt":"ISO timestamp"}',
        },
        attendees: {
          type: "string",
          description: 'JSON array of attendees, each with: {"name":"...","role":"...","company":"..."}',
        },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["clientId", "title", "meetingDate", "summary"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "meetings.create" },
    contextRelevance: ["meeting", "client", "project"],
  },
  {
    name: "updateMeeting",
    domain: "meeting",
    action: "write",
    description: "Update an existing meeting's details.",
    parameters: {
      type: "object",
      properties: {
        meetingId: { type: "string", description: "The meeting ID to update" },
        title: { type: "string", description: "Updated title" },
        meetingDate: { type: "string", description: "Updated date (YYYY-MM-DD)" },
        meetingType: {
          type: "string",
          enum: ["progress", "kickoff", "review", "site_visit", "call", "other"],
          description: "Updated meeting type",
        },
        summary: { type: "string", description: "Updated summary" },
        notes: { type: "string", description: "Updated notes" },
      },
      required: ["meetingId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "meetings.update" },
    contextRelevance: ["meeting"],
  },
  {
    name: "updateActionItemStatus",
    domain: "meeting",
    action: "write",
    description: "Mark a meeting action item as completed, pending, or cancelled.",
    parameters: {
      type: "object",
      properties: {
        meetingId: { type: "string", description: "The meeting ID containing the action item" },
        actionItemId: { type: "string", description: "The action item ID (e.g. 'action-1')" },
        status: {
          type: "string",
          enum: ["pending", "completed", "cancelled"],
          description: "New status for the action item",
        },
      },
      required: ["meetingId", "actionItemId", "status"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "meetings.updateActionItemStatus" },
    contextRelevance: ["meeting"],
  },
  {
    name: "extractMeetingFromText",
    domain: "meeting",
    action: "write",
    description:
      "Extract structured meeting data from raw text (transcript, notes, or paste). Sends text to the AI meeting extraction pipeline and creates a meeting record. Use this when the user pastes a transcript or meeting notes into the chat.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The client ID" },
        projectId: { type: "string", description: "Optional project ID" },
        content: { type: "string", description: "The raw meeting text/transcript to extract from" },
        documentName: { type: "string", description: "Optional name for the source document" },
      },
      required: ["clientId", "content"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "meetings.create" },
    contextRelevance: ["meeting", "client", "project"],
  },

  {
    name: "verifyMeeting",
    domain: "meeting",
    action: "write",
    description: "Approve/verify an auto-extracted meeting. Auto-extracted meetings from bulk upload start as unverified and need user approval.",
    parameters: {
      type: "object",
      properties: {
        meetingId: { type: "string", description: "The meeting ID to verify/approve" },
      },
      required: ["meetingId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "meetings.verifyMeeting" },
    contextRelevance: ["meeting"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteMeeting",
    domain: "meeting",
    action: "delete",
    description: "Delete a meeting record.",
    parameters: {
      type: "object",
      properties: {
        meetingId: { type: "string", description: "The meeting ID to delete" },
      },
      required: ["meetingId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "meetings.deleteMeeting" },
    contextRelevance: ["meeting"],
  },
];
