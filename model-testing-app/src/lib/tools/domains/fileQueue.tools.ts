import type { AtomicTool } from "../types";

export const FILE_QUEUE_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getFileQueueJobs",
    domain: "fileQueue",
    action: "read",
    description: "Get file processing queue jobs, optionally filtered by status.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "pending",
            "uploading",
            "analyzing",
            "completed",
            "error",
            "needs_confirmation",
          ],
          description: "Filter jobs by processing status",
        },
        limit: {
          type: "number",
          description: "Maximum number of jobs to return",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "fileQueue.getJobs" },
    contextRelevance: ["fileQueue", "document"],
  },
  {
    name: "getFileQueueJob",
    domain: "fileQueue",
    action: "read",
    description: "Get a specific file queue job by its ID.",
    parameters: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "The ID of the queue job" },
      },
      required: ["jobId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "fileQueue.getJob" },
    contextRelevance: ["fileQueue"],
  },
  {
    name: "getReviewQueue",
    domain: "fileQueue",
    action: "read",
    description:
      "Get documents waiting in the review queue for filing confirmation.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "fileQueue.getReviewQueueWithNav" },
    contextRelevance: ["fileQueue", "document"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "fileDocument",
    domain: "fileQueue",
    action: "write",
    description:
      "File a document from the queue into a client/project folder. This is an atomic operation that creates the document record, links checklist items, and saves extracted intelligence.",
    parameters: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The queue job ID for the document to file",
        },
        clientId: {
          type: "string",
          description: "The client ID to file the document under",
        },
        folderId: {
          type: "string",
          description: "The target folder ID",
        },
        folderType: {
          type: "string",
          description: "The target folder type identifier",
        },
        projectId: {
          type: "string",
          description: "The project ID (if filing to a project folder)",
        },
        category: {
          type: "string",
          description: "Document category override",
        },
        fileTypeDetected: {
          type: "string",
          description: "File type classification override",
        },
        checklistItemIds: {
          type: "string",
          description:
            "Comma-separated checklist item IDs to link this document to",
        },
        extractedIntelligence: {
          type: "string",
          description: "JSON string of extracted intelligence fields to save",
        },
      },
      required: ["jobId", "clientId", "folderId", "folderType"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "fileQueue.fileDocument" },
    contextRelevance: ["fileQueue", "document", "checklist"],
  },
  {
    name: "skipQueuedDocument",
    domain: "fileQueue",
    action: "write",
    description:
      "Skip a document in the queue without filing it. Marks it as completed.",
    parameters: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The queue job ID to skip",
        },
      },
      required: ["jobId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "fileQueue.skipDocument" },
    contextRelevance: ["fileQueue"],
  },
];
