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
      "Get only missing/unfulfilled checklist items. Useful for identifying what documents are still needed. Supports filtering by deal phase.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
        projectId: {
          type: "string",
          description: "Optionally scope to a specific project",
        },
        phaseFilter: {
          type: "string",
          enum: ["indicative_terms", "credit_submission", "post_credit"],
          description: "Optionally filter by deal phase",
        },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getMissingItems" },
    contextRelevance: ["checklist", "client", "project"],
  },
  {
    name: "getLinkedDocuments",
    domain: "checklist",
    action: "read",
    description:
      "Get all documents linked to a specific checklist item, with primary document first.",
    parameters: {
      type: "object",
      properties: {
        checklistItemId: {
          type: "string",
          description: "The ID of the checklist item",
        },
      },
      required: ["checklistItemId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "knowledgeLibrary.getLinkedDocuments" },
    contextRelevance: ["checklist", "document"],
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
          enum: ["required", "nice_to_have", "optional"],
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
      "Link a document to a checklist item. First linked document marks item as fulfilled.",
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
        userId: {
          type: "string",
          description: "The ID of the user performing the link (optional)",
        },
      },
      required: ["checklistItemId", "documentId"],
    },
    requiresConfirmation: true,
    convexMapping: {
      type: "mutation",
      path: "knowledgeLibrary.linkDocumentToChecklistItem",
    },
    contextRelevance: ["checklist", "document"],
  },
  {
    name: "unlinkDocumentFromChecklist",
    domain: "checklist",
    action: "write",
    description:
      "Remove a specific document link from a checklist item. If the last link is removed, item reverts to missing.",
    parameters: {
      type: "object",
      properties: {
        checklistItemId: {
          type: "string",
          description: "The ID of the checklist item",
        },
        documentId: {
          type: "string",
          description: "The ID of the document to unlink",
        },
      },
      required: ["checklistItemId", "documentId"],
    },
    requiresConfirmation: true,
    convexMapping: {
      type: "mutation",
      path: "knowledgeLibrary.unlinkDocumentFromChecklistItem",
    },
    contextRelevance: ["checklist", "document"],
  },
  {
    name: "updateChecklistItemStatus",
    domain: "checklist",
    action: "write",
    description:
      "Manually update the status of a checklist item (missing, pending_review, or fulfilled).",
    parameters: {
      type: "object",
      properties: {
        checklistItemId: {
          type: "string",
          description: "The ID of the checklist item",
        },
        status: {
          type: "string",
          enum: ["missing", "pending_review", "fulfilled"],
          description: "The new status to set",
        },
      },
      required: ["checklistItemId", "status"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "knowledgeLibrary.updateItemStatus" },
    contextRelevance: ["checklist"],
  },
  {
    name: "confirmSuggestedLink",
    domain: "checklist",
    action: "write",
    description:
      "Confirm an AI-suggested document match for a checklist item, creating the link and clearing the suggestion.",
    parameters: {
      type: "object",
      properties: {
        checklistItemId: {
          type: "string",
          description: "The ID of the checklist item with a pending suggestion",
        },
        userId: {
          type: "string",
          description: "The ID of the user confirming the suggestion",
        },
      },
      required: ["checklistItemId", "userId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "knowledgeLibrary.confirmSuggestedLink" },
    contextRelevance: ["checklist", "document"],
  },
  {
    name: "rejectSuggestedLink",
    domain: "checklist",
    action: "write",
    description:
      "Reject an AI-suggested document match for a checklist item, clearing the suggestion.",
    parameters: {
      type: "object",
      properties: {
        checklistItemId: {
          type: "string",
          description: "The ID of the checklist item with a pending suggestion",
        },
      },
      required: ["checklistItemId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "knowledgeLibrary.rejectSuggestedLink" },
    contextRelevance: ["checklist"],
  },
  {
    name: "initializeChecklistForClient",
    domain: "checklist",
    action: "write",
    description:
      "Initialize a checklist for a client from the default template for their client type.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
        clientType: {
          type: "string",
          description: "The client type (e.g. borrower, lender) to load template for",
        },
      },
      required: ["clientId", "clientType"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "knowledgeLibrary.initializeChecklistForClient" },
    contextRelevance: ["checklist", "client"],
  },
  {
    name: "initializeChecklistForProject",
    domain: "checklist",
    action: "write",
    description:
      "Initialize a checklist for a project from the default template for the client type.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
        projectId: { type: "string", description: "The ID of the project" },
        clientType: {
          type: "string",
          description: "The client type (e.g. borrower, lender) to load template for",
        },
      },
      required: ["clientId", "projectId", "clientType"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "knowledgeLibrary.initializeChecklistForProject" },
    contextRelevance: ["checklist", "project"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteChecklistItem",
    domain: "checklist",
    action: "delete",
    description: "Delete a custom checklist requirement and clean up its document links.",
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
