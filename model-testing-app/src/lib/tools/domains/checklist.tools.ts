import type { AtomicTool } from "../types";

export const CHECKLIST_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getChecklistByClient",
    domain: "checklist",
    action: "read",
    description:
      "Get all checklist items for a client, including linked document info and fulfillment status.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getChecklistByClient" },
    contextRelevance: ["checklist", "client"],
  },
  {
    name: "getChecklistByProject",
    domain: "checklist",
    action: "read",
    description:
      "Get all checklist items for a specific project, with linked document info.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The ID of the project" },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getChecklistByProject" },
    contextRelevance: ["checklist", "project"],
  },
  {
    name: "getChecklistSummary",
    domain: "checklist",
    action: "read",
    description:
      "Get checklist completion summary stats: fulfilled, missing, partial counts by category.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getChecklistSummary" },
    contextRelevance: ["checklist", "client"],
  },
  {
    name: "getMissingChecklistItems",
    domain: "checklist",
    action: "read",
    description:
      "Get only missing/unfulfilled checklist items. Useful for identifying what documents are still needed.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
        projectId: {
          type: "string",
          description: "Optionally scope to a specific project",
        },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getMissingItems" },
    contextRelevance: ["checklist", "client", "project"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "addChecklistItem",
    domain: "checklist",
    action: "write",
    description:
      "Add a custom checklist requirement for a client or project.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
        name: {
          type: "string",
          description: "Name/title of the checklist requirement",
        },
        category: {
          type: "string",
          description: "Document category this requirement belongs to",
        },
        priority: {
          type: "string",
          enum: ["required", "recommended", "optional"],
          description: "Priority level of the requirement",
        },
        projectId: {
          type: "string",
          description: "Optionally scope to a specific project",
        },
        description: {
          type: "string",
          description: "Detailed description of what is needed",
        },
      },
      required: ["clientId", "name", "category", "priority"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "knowledgeLibrary.addCustomRequirement" },
    contextRelevance: ["checklist", "client", "project"],
  },
  {
    name: "linkDocumentToChecklist",
    domain: "checklist",
    action: "write",
    description:
      "Manually link a document to a checklist item, marking it as fulfilled.",
    parameters: {
      type: "object",
      properties: {
        checklistItemId: {
          type: "string",
          description: "The ID of the checklist item",
        },
        documentId: {
          type: "string",
          description: "The ID of the document to link",
        },
      },
      required: ["checklistItemId", "documentId"],
    },
    requiresConfirmation: true,
    convexMapping: {
      type: "mutation",
      path: "knowledgeLibrary.linkDocumentToRequirement",
    },
    contextRelevance: ["checklist", "document"],
  },
  {
    name: "unlinkDocumentFromChecklist",
    domain: "checklist",
    action: "write",
    description:
      "Remove all document links from a checklist item, marking it as missing again.",
    parameters: {
      type: "object",
      properties: {
        checklistItemId: {
          type: "string",
          description: "The ID of the checklist item to unlink",
        },
      },
      required: ["checklistItemId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "knowledgeLibrary.unlinkDocument" },
    contextRelevance: ["checklist", "document"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteChecklistItem",
    domain: "checklist",
    action: "delete",
    description: "Delete a custom checklist requirement.",
    parameters: {
      type: "object",
      properties: {
        checklistItemId: {
          type: "string",
          description: "The ID of the checklist item to delete",
        },
      },
      required: ["checklistItemId"],
    },
    requiresConfirmation: true,
    convexMapping: {
      type: "mutation",
      path: "knowledgeLibrary.deleteCustomRequirement",
    },
    contextRelevance: ["checklist"],
  },
];
