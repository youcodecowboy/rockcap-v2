import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

// Server-side Convex client for use in API routes
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";

if (!convexUrl) {
  console.warn("NEXT_PUBLIC_CONVEX_URL not set - Convex server client will not work");
}

export const convexServer = convexUrl ? new ConvexHttpClient(convexUrl) : null;

// Helper functions for server-side Convex operations
export async function getClientsServer(status?: string, type?: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.query(api.clients.list, { status, type });
}

export async function getProjectsServer(clientId?: string, status?: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.query(api.projects.list, { clientId, status });
}

export async function createDocumentServer(data: {
  fileStorageId?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  summary: string;
  fileTypeDetected: string;
  category: string;
  reasoning: string;
  confidence: number;
  tokensUsed: number;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  suggestedClientName?: string;
  suggestedProjectName?: string;
  extractedData?: any;
  status?: string;
  error?: string;
}) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.mutation(api.documents.create, data);
}

export async function createEnrichmentServer(data: {
  type: string;
  field: string;
  value: any;
  source: string;
  documentId: string;
  clientId?: string;
  projectId?: string;
  confidence: number;
}) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.mutation(api.enrichment.create, data);
}

export async function getClientServer(clientId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.query(api.clients.get, { id: clientId as any });
}

export async function getProjectServer(projectId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.query(api.projects.get, { id: projectId as any });
}

export async function searchKnowledgeBankServer(params: {
  clientId?: string;
  projectId?: string;
  query?: string;
  tags?: string[];
  entryType?: string;
}) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.query(api.knowledgeBank.search, params as any);
}

export async function getKnowledgeBankByClientServer(clientId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.query(api.knowledgeBank.getByClient, { clientId: clientId as any });
}

export async function getKnowledgeBankByProjectServer(projectId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.query(api.knowledgeBank.getByProject, { projectId: projectId as any });
}

export async function getClientSummaryServer(clientId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.query(api.knowledgeBank.aggregateClientSummary, { clientId: clientId as any });
}

export async function getDocumentsServer(params: {
  clientId?: string;
  projectId?: string;
  category?: string;
  status?: string;
}) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  return await convexServer.query(api.documents.list, params as any);
}

