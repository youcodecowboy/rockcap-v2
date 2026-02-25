import type { AtomicTool } from "../types";

export const INTERNAL_DOCUMENT_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getInternalDocuments",
    domain: "internalDocument",
    action: "read",
    description:
      "List internal (company-wide) documents. Can filter by linked client, category, or status.",
    parameters: {
      type: "object",
      properties: {
        linkedClientId: {
          type: "string",
          description: "Filter by linked client ID",
        },
        category: { type: "string", description: "Filter by category" },
        status: {
          type: "string",
          enum: ["pending", "processing", "completed", "error"],
          description: "Filter by processing status",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "internalDocuments.list" },
    contextRelevance: ["internalDocument", "document"],
  },
  {
    name: "getInternalDocument",
    domain: "internalDocument",
    action: "read",
    description: "Get a specific internal document by its ID.",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The ID of the internal document" },
      },
      required: ["documentId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "internalDocuments.get" },
    contextRelevance: ["internalDocument"],
  },
  {
    name: "getInternalFolders",
    domain: "internalDocument",
    action: "read",
    description: "Get all internal document folders.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "internalDocuments.getFolders" },
    contextRelevance: ["internalDocument", "folder"],
  },
  {
    name: "getInternalDocumentsByFolder",
    domain: "internalDocument",
    action: "read",
    description: "Get all internal documents in a specific folder.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "The ID of the folder" },
      },
      required: ["folderId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "internalDocuments.getByFolder" },
    contextRelevance: ["internalDocument", "folder"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createInternalDocument",
    domain: "internalDocument",
    action: "write",
    description: "Create a new internal document record.",
    parameters: {
      type: "object",
      properties: {
        fileName: { type: "string", description: "File name (required)" },
        fileSize: { type: "number", description: "File size in bytes (required)" },
        fileType: { type: "string", description: "MIME type (required)" },
        summary: { type: "string", description: "Document summary (required)" },
        category: { type: "string", description: "Document category (required)" },
        fileTypeDetected: {
          type: "string",
          description: "Detected file type classification",
        },
        reasoning: { type: "string", description: "Classification reasoning" },
        confidence: { type: "number", description: "Classification confidence (0-1)" },
        linkedClientId: {
          type: "string",
          description: "Link to a client",
        },
      },
      required: ["fileName", "fileSize", "fileType", "summary", "category"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "internalDocuments.create" },
    contextRelevance: ["internalDocument", "document"],
  },
  {
    name: "createInternalFolder",
    domain: "internalDocument",
    action: "write",
    description: "Create a new internal document folder.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Folder name (required)" },
      },
      required: ["name"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "internalDocuments.createFolder" },
    contextRelevance: ["internalDocument", "folder"],
  },
];
