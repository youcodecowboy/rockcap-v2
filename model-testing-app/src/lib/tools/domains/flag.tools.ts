import type { AtomicTool } from "../types";

export const FLAG_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getFlags",
    domain: "flag",
    action: "read",
    description:
      "Get flags for a specific entity. Returns all flags (open and resolved) for the given entity type and ID.",
    parameters: {
      type: "object",
      properties: {
        entityType: {
          type: "string",
          description:
            "Entity type: document, meeting, task, project, client, or checklist_item",
        },
        entityId: {
          type: "string",
          description: "The entity ID to get flags for",
        },
      },
      required: ["entityType", "entityId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "flags.getByEntity" },
    contextRelevance: [
      "flag",
      "document",
      "meeting",
      "task",
      "project",
      "client",
    ],
  },
  {
    name: "getFlagThread",
    domain: "flag",
    action: "read",
    description:
      "Get the thread entries (messages and activity log) for a specific flag.",
    parameters: {
      type: "object",
      properties: {
        flagId: { type: "string", description: "The flag ID" },
      },
      required: ["flagId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "flags.getThread" },
    contextRelevance: ["flag"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createFlag",
    domain: "flag",
    action: "write",
    description:
      "Create a flag on any entity to request review or attention from another user. Can flag documents, meetings, tasks, projects, clients, or checklist items.",
    parameters: {
      type: "object",
      properties: {
        entityType: {
          type: "string",
          description:
            "Entity type: document, meeting, task, project, client, or checklist_item",
        },
        entityId: {
          type: "string",
          description: "The entity ID to flag",
        },
        note: {
          type: "string",
          description:
            "The flag message/note explaining what needs attention",
        },
        assignedTo: {
          type: "string",
          description:
            "User ID to assign the flag to (optional, defaults to self)",
        },
        priority: {
          type: "string",
          description: "Priority level: normal or urgent (default: normal)",
        },
        clientId: {
          type: "string",
          description: "Client ID for context (optional)",
        },
        projectId: {
          type: "string",
          description: "Project ID for context (optional)",
        },
      },
      required: ["entityType", "entityId", "note"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "flags.create" },
    contextRelevance: [
      "flag",
      "document",
      "meeting",
      "task",
      "project",
      "client",
    ],
  },
  {
    name: "replyToFlag",
    domain: "flag",
    action: "write",
    description:
      "Reply to a flag thread with a message. Optionally resolve the flag at the same time.",
    parameters: {
      type: "object",
      properties: {
        flagId: {
          type: "string",
          description: "The flag ID to reply to",
        },
        content: {
          type: "string",
          description: "The reply message",
        },
        resolve: {
          type: "boolean",
          description:
            "Whether to resolve the flag with this reply (default: false)",
        },
      },
      required: ["flagId", "content"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "flags.reply" },
    contextRelevance: ["flag"],
  },
  {
    name: "resolveFlag",
    domain: "flag",
    action: "write",
    description: "Resolve/close a flag without adding a reply.",
    parameters: {
      type: "object",
      properties: {
        flagId: {
          type: "string",
          description: "The flag ID to resolve",
        },
      },
      required: ["flagId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "flags.resolve" },
    contextRelevance: ["flag"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteFlag",
    domain: "flag",
    action: "delete",
    description:
      "Permanently delete a flag and all its thread entries.",
    parameters: {
      type: "object",
      properties: {
        flagId: {
          type: "string",
          description: "The flag ID to delete",
        },
      },
      required: ["flagId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "flags.remove" },
    contextRelevance: ["flag"],
  },
];
