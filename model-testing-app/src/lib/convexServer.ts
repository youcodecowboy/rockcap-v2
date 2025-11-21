import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

// Server-side Convex client for use in API routes
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";

if (!convexUrl) {
  console.warn("NEXT_PUBLIC_CONVEX_URL not set - Convex server client will not work");
}

export const convexServer = convexUrl ? new ConvexHttpClient(convexUrl) : null;

// Helper functions for server-side Convex operations
export async function getClientsServer(status?: string, type?: string): Promise<any> {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  const statusEnum = status as 'prospect' | 'active' | 'archived' | 'past' | undefined;
  const queryParams: any = { status: statusEnum, type };
  const queryFn: any = api.clients.list;
  const server: any = convexServer;
  const result = await server.query(queryFn, queryParams);
  return result;
}

export async function getProjectsServer(clientId?: string, status?: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  const clientIdTyped = clientId as Id<"clients"> | undefined;
  const statusEnum = status as 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled' | undefined;
  const result = await convexServer.query(api.projects.list, { clientId: clientIdTyped, status: statusEnum }) as any;
  return result;
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
  const statusEnum = data.status as 'completed' | 'pending' | 'processing' | 'error' | undefined;
  const result = await convexServer.mutation(api.documents.create, {
    ...data,
    fileStorageId: data.fileStorageId as Id<"_storage"> | undefined,
    clientId: data.clientId as Id<"clients"> | undefined,
    projectId: data.projectId as Id<"projects"> | undefined,
    status: statusEnum,
  }) as any;
  return result;
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
  const typeEnum = data.type as 'email' | 'address' | 'phone' | 'other' | 'company' | 'contact' | 'date';
  const result = await convexServer.mutation(api.enrichment.create, {
    ...data,
    type: typeEnum,
    documentId: data.documentId as Id<"documents">,
    clientId: data.clientId as Id<"clients"> | undefined,
    projectId: data.projectId as Id<"projects"> | undefined,
  }) as any;
  return result;
}

export async function getClientServer(clientId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  const result = await convexServer.query(api.clients.get, { id: clientId as any }) as any;
  return result;
}

export async function getProjectServer(projectId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  const result = await convexServer.query(api.projects.get, { id: projectId as any }) as any;
  return result;
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
  const result = await convexServer.query(api.knowledgeBank.search, params as any) as any;
  return result;
}

export async function getKnowledgeBankByClientServer(clientId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  const result = await convexServer.query(api.knowledgeBank.getByClient, { clientId: clientId as any }) as any;
  return result;
}

export async function getKnowledgeBankByProjectServer(projectId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  const result = await convexServer.query(api.knowledgeBank.getByProject, { projectId: projectId as any }) as any;
  return result;
}

export async function getClientSummaryServer(clientId: string) {
  if (!convexServer) {
    throw new Error("Convex server client not configured");
  }
  const result = await convexServer.query(api.knowledgeBank.aggregateClientSummary, { clientId: clientId as any }) as any;
  return result;
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
  const result = await convexServer.query(api.documents.list, params as any) as any;
  return result;
}

