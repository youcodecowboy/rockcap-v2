import type { AtomicTool } from "../types";

export const DOCUMENT_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "searchDocuments",
    domain: "document",
    action: "read",
    description:
      "Search and list documents. Can filter by client, project, category, or search term.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Filter by client ID" },
        projectId: { type: "string", description: "Filter by project ID" },
        category: { type: "string", description: "Filter by document category" },
        searchTerm: {
          type: "string",
          description: "Search term to filter documents by name",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documents.list" },
    contextRelevance: ["document", "client", "project"],
  },
  {
    name: "getDocument",
    domain: "document",
    action: "read",
    description:
      "Get detailed info about a specific document including summary, classification, and metadata.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The ID of the document to retrieve",
        },
      },
      required: ["documentId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documents.get" },
    contextRelevance: ["document"],
  },
  {
    name: "getDocumentsByClient",
    domain: "document",
    action: "read",
    description: "Get all documents for a specific client.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documents.getByClient" },
    contextRelevance: ["document", "client"],
  },
  {
    name: "getDocumentsByProject",
    domain: "document",
    action: "read",
    description: "Get all documents for a specific project.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The ID of the project" },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documents.getByProject" },
    contextRelevance: ["document", "project"],
  },
  {
    name: "getDocumentNotes",
    domain: "document",
    action: "read",
    description: "Get all notes and annotations on a specific document.",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The ID of the document" },
      },
      required: ["documentId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documentNotes.getByDocument" },
    contextRelevance: ["document", "note"],
  },
  {
    name: "getDocumentExtractions",
    domain: "document",
    action: "read",
    description:
      "Get all data extractions for a document, sorted by version (latest first).",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The ID of the document" },
      },
      required: ["documentId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documentExtractions.getByDocument" },
    contextRelevance: ["document"],
  },
  {
    name: "getDocumentUrl",
    domain: "document",
    action: "read",
    description: "Get a download URL for a document file from storage.",
    parameters: {
      type: "object",
      properties: {
        storageId: {
          type: "string",
          description: "The storage ID of the file",
        },
      },
      required: ["storageId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documents.getFileUrl" },
    contextRelevance: ["document"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "moveDocument",
    domain: "document",
    action: "write",
    description:
      "Move a document to a different client or project. Reassigns ownership and updates document code.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The ID of the document to move (required)",
        },
        targetClientId: {
          type: "string",
          description: "Target client ID (required)",
        },
        targetProjectId: {
          type: "string",
          description: "Target project ID (optional — to move into a project under the client)",
        },
        targetProjectName: {
          type: "string",
          description: "Target project name (used if targetProjectId is provided)",
        },
        isBaseDocument: {
          type: "boolean",
          description: "Whether this is a base/template document (default: false)",
        },
      },
      required: ["documentId", "targetClientId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documents.moveDocument" },
    contextRelevance: ["document", "folder"],
  },
  {
    name: "updateDocumentMetadata",
    domain: "document",
    action: "write",
    description:
      "Update a document's category, summary, or classification metadata.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The ID of the document to update",
        },
        category: { type: "string", description: "Updated document category" },
        summary: { type: "string", description: "Updated document summary" },
        fileTypeDetected: {
          type: "string",
          description: "Updated file type classification",
        },
      },
      required: ["documentId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documents.update" },
    contextRelevance: ["document"],
  },
  {
    name: "addDocumentNote",
    domain: "document",
    action: "write",
    description:
      "Add a note or annotation to a document, optionally saving it to the client/project intelligence.",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The ID of the document" },
        content: { type: "string", description: "Note content" },
        addToIntelligence: {
          type: "boolean",
          description: "Also save this note to client/project intelligence",
        },
      },
      required: ["documentId", "content"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documentNotes.create" },
    contextRelevance: ["document", "note"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteDocument",
    domain: "document",
    action: "delete",
    description:
      "Soft-delete a document. The document is marked as deleted but can be recovered. Use when a user wants to remove a document from the library.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The ID of the document to delete",
        },
      },
      required: ["documentId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documents.remove" },
    contextRelevance: ["document"],
  },
  {
    name: "reclassify",
    domain: "document",
    action: "read", // Read action because it returns data; writes happen internally
    description:
      "Deep-analyze a document to find specific information. Pulls raw document content and runs thorough extraction focused on your query. Automatically saves any new findings to intelligence. Use this when simpler methods (queryIntelligence, loadReference) cannot answer the question.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The Convex document ID to deep-analyze",
        },
        focusQuery: {
          type: "string",
          description: "What specific information to look for in the document",
        },
        projectId: {
          type: "string",
          description: "Project ID to save intelligence findings to",
        },
        clientId: {
          type: "string",
          description: "Client ID to save intelligence findings to",
        },
      },
      required: ["documentId", "focusQuery"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "" }, // Custom handler in executor
    contextRelevance: ["document", "intelligence"],
  },
];
