import type { AtomicTool } from "../types";

export const ANALYSIS_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ — Analyze uploaded document via V4 pipeline
  // -------------------------------------------------------------------------
  {
    name: "analyzeUploadedDocument",
    domain: "document",
    action: "read",
    description:
      "Analyze an uploaded document using the V4 classification pipeline. Returns classification (type, category, confidence), summary, extracted intelligence, suggested folder placement, and checklist matches. Use this when the user uploads a file and wants it analyzed or filed.",
    parameters: {
      type: "object",
      properties: {
        storageId: {
          type: "string",
          description: "The Convex storage ID of the uploaded file",
        },
        fileName: {
          type: "string",
          description: "Original filename of the uploaded document",
        },
        fileType: {
          type: "string",
          description: "MIME type of the file (e.g., application/pdf)",
        },
        clientId: {
          type: "string",
          description: "Client ID for context-aware analysis (optional)",
        },
        projectId: {
          type: "string",
          description: "Project ID for context-aware analysis (optional)",
        },
        instructions: {
          type: "string",
          description:
            "User-provided instructions to guide the analysis (optional)",
        },
      },
      required: ["storageId", "fileName", "fileType"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "fileQueue.getFileUrl" },
    contextRelevance: ["document", "fileQueue", "client", "project"],
  },

  // -------------------------------------------------------------------------
  // WRITE — Save/file an analyzed document from chat
  // -------------------------------------------------------------------------
  {
    name: "saveChatDocument",
    domain: "document",
    action: "write",
    description:
      "File an analyzed document into the system. Creates a document record with classification, summary, and extracted data. Use this after analyzeUploadedDocument to save the results. Requires user confirmation.",
    parameters: {
      type: "object",
      properties: {
        storageId: {
          type: "string",
          description: "The Convex storage ID of the uploaded file",
        },
        fileName: {
          type: "string",
          description: "Original filename",
        },
        fileSize: {
          type: "number",
          description: "File size in bytes",
        },
        fileType: {
          type: "string",
          description: "MIME type of the file",
        },
        summary: {
          type: "string",
          description: "Document summary from analysis",
        },
        fileTypeDetected: {
          type: "string",
          description: "Detected document type (e.g., 'Planning Approval')",
        },
        category: {
          type: "string",
          description: "Document category (e.g., 'Plans', 'Financial Documents')",
        },
        confidence: {
          type: "number",
          description: "Classification confidence score (0-1)",
        },
        clientId: {
          type: "string",
          description: "Client ID to file the document under",
        },
        projectId: {
          type: "string",
          description: "Project ID to file the document under (optional)",
        },
        folderId: {
          type: "string",
          description: "Target folder key (e.g., 'background', 'financials')",
        },
        folderType: {
          type: "string",
          description: "Folder scope: 'client' or 'project'",
          enum: ["client", "project"],
        },
        classificationReasoning: {
          type: "string",
          description: "Reasoning for the classification",
        },
      },
      required: ["storageId", "fileName", "fileSize", "fileType", "summary", "fileTypeDetected", "category", "clientId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documents.create" },
    contextRelevance: ["document", "client", "project"],
  },
  // -------------------------------------------------------------------------
  // READ — Re-analyze an existing filed document
  // -------------------------------------------------------------------------
  {
    name: "reanalyzeDocument",
    domain: "document",
    action: "read",
    description:
      "Re-analyze an existing filed document using the V4 classification pipeline. Fetches the document from storage, runs full analysis, and updates the document's classification, summary, and metadata. Use when a user wants to re-classify or re-extract data from an already-filed document.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The ID of the existing document to re-analyze",
        },
      },
      required: ["documentId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documents.get" },
    contextRelevance: ["document", "client", "project"],
  },
];
