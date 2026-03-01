import type { AtomicTool } from "../types";

export const NOTE_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getNotes",
    domain: "note",
    action: "read",
    description:
      "Get notes, optionally filtered by client or project.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Filter by client ID" },
        projectId: { type: "string", description: "Filter by project ID" },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "notes.getAll" },
    contextRelevance: ["note", "client", "project"],
  },
  {
    name: "getNote",
    domain: "note",
    action: "read",
    description: "Get a specific note by its ID.",
    parameters: {
      type: "object",
      properties: {
        noteId: { type: "string", description: "The ID of the note" },
      },
      required: ["noteId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "notes.get" },
    contextRelevance: ["note"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createNote",
    domain: "note",
    action: "write",
    description:
      "Create a new note, optionally linked to a client or project.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title (required)" },
        content: { type: "string", description: "Note content (required)" },
        clientId: { type: "string", description: "Link to a client" },
        projectId: { type: "string", description: "Link to a project" },
        tags: { type: "string", description: "Comma-separated tags" },
        emoji: { type: "string", description: "Emoji icon for the note" },
      },
      required: ["title", "content"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "notes.create" },
    contextRelevance: ["note", "client", "project"],
  },
  {
    name: "updateNote",
    domain: "note",
    action: "write",
    description: "Update a note's title, content, or linked entities. Can also re-link to a different client or project.",
    parameters: {
      type: "object",
      properties: {
        noteId: { type: "string", description: "The ID of the note to update" },
        title: { type: "string", description: "Updated title" },
        content: { type: "string", description: "Updated content" },
        tags: { type: "string", description: "Updated tags (comma-separated)" },
        clientId: { type: "string", description: "Link the note to a different client (or null to unlink)" },
        projectId: { type: "string", description: "Link the note to a different project (or null to unlink)" },
      },
      required: ["noteId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "notes.update" },
    contextRelevance: ["note"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteNote",
    domain: "note",
    action: "delete",
    description: "Delete a note.",
    parameters: {
      type: "object",
      properties: {
        noteId: { type: "string", description: "The ID of the note to delete" },
      },
      required: ["noteId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "notes.remove" },
    contextRelevance: ["note"],
  },
];
