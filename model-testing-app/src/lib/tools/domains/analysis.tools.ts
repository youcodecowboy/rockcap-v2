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
  // -------------------------------------------------------------------------
  // WRITE — Generate a formatted document from composed HTML and stage for approval
  // -------------------------------------------------------------------------
  {
    name: "generateDocument",
    domain: "document",
    action: "write",
    description:
      "Generate a formatted document (PDF + DOCX) from composed HTML content and stage it for operator approval. Use this for ad-hoc document requests like 'generate a one-pager on {company}'. YOU compose the document body as semantic HTML (headings, paragraphs, tables) grounded in real data — do NOT include <html>/<head>/<style>; house styling is applied automatically. On approval the document is filed to the client's library. Requires user confirmation.",
    parameters: {
      type: "object",
      properties: {
        contentHtml: {
          type: "string",
          description:
            "The document body as semantic HTML (e.g. <h1>, <h2>, <p>, <table>). No <html>/<head>/<style> wrappers — house-style CSS is applied by the renderer. Ground every figure in real data; never fabricate.",
        },
        title: {
          type: "string",
          description: "Document title, e.g. 'Mackenzie Miller Homes — Company One-Pager'. Used in the file and as the file name stem.",
        },
        docType: {
          type: "string",
          description: "The kind of document, e.g. 'Company One-Pager', 'Lender Submission Pack'. Stored as the document's detected type.",
        },
        category: {
          type: "string",
          description: "Filing category. Defaults to 'Generated' if omitted.",
        },
        summary: {
          type: "string",
          description: "One-line operator-facing description shown in the approvals queue. Defaults to the title.",
        },
        formats: {
          type: "array",
          description: "Output formats. Defaults to both ['pdf','docx'].",
          items: { type: "string", description: "pdf or docx" },
        },
        clientId: {
          type: "string",
          description: "Client to file the document under on approval.",
        },
        projectId: {
          type: "string",
          description: "Project to associate (optional).",
        },
      },
      required: ["contentHtml", "title", "docType"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documentPublish.requestPublish" },
    contextRelevance: ["document", "client", "project"],
  },
];
