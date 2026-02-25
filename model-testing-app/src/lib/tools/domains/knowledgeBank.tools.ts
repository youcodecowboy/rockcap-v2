import type { AtomicTool } from "../types";

export const KNOWLEDGE_BANK_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getKnowledgeBank",
    domain: "knowledgeBank",
    action: "read",
    description:
      "Get knowledge bank entries for a client or project. Contains deal updates, call transcripts, and other intelligence.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Filter by client ID" },
        projectId: { type: "string", description: "Filter by project ID" },
        entryType: {
          type: "string",
          description: "Filter by entry type (e.g., general, call, meeting)",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeBank.getByClient" },
    contextRelevance: ["knowledgeBank", "client", "project"],
  },
  {
    name: "getKnowledgeItems",
    domain: "knowledgeBank",
    action: "read",
    description:
      "Get structured knowledge items (extracted intelligence fields with values and confidence scores).",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Filter by client ID" },
        projectId: { type: "string", description: "Filter by project ID" },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: {
      type: "query",
      path: "knowledgeLibrary.getKnowledgeItemsByClient",
    },
    contextRelevance: ["knowledgeBank", "client", "project", "intelligence"],
  },
  {
    name: "getKnowledgeStats",
    domain: "knowledgeBank",
    action: "read",
    description:
      "Get knowledge extraction statistics for a client: total items, items by field, confidence distribution.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getKnowledgeStats" },
    contextRelevance: ["knowledgeBank", "client"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createKnowledgeBankEntry",
    domain: "knowledgeBank",
    action: "write",
    description:
      "Create a new knowledge bank entry (deal update, call transcript, general note, etc.).",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Client ID (required)" },
        title: { type: "string", description: "Entry title (required)" },
        content: { type: "string", description: "Entry content (required)" },
        projectId: { type: "string", description: "Link to a project" },
        entryType: {
          type: "string",
          description: "Entry type (default: general)",
        },
        keyPoints: {
          type: "string",
          description: "Comma-separated key points",
        },
        tags: { type: "string", description: "Comma-separated tags" },
      },
      required: ["clientId", "title", "content"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "knowledgeBank.createManual" },
    contextRelevance: ["knowledgeBank", "client", "project"],
  },
];
