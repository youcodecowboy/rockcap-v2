import type { AtomicTool } from "../types";

export const CLIENT_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "searchClients",
    domain: "client",
    action: "read",
    description:
      "Search and list clients. Can filter by status (prospect, active, archived, past) or type.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["prospect", "active", "archived", "past"],
          description: "Filter clients by status",
        },
        type: {
          type: "string",
          description:
            "Filter clients by type (e.g., lender, borrower, real-estate-developer)",
        },
        searchTerm: {
          type: "string",
          description: "Search term to filter clients by name",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "clients.list" },
    contextRelevance: ["client"],
  },
  {
    name: "getClient",
    domain: "client",
    action: "read",
    description: "Get detailed information about a specific client by their ID.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "The ID of the client to retrieve",
        },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "clients.get" },
    contextRelevance: ["client"],
  },
  {
    name: "getClientStats",
    domain: "client",
    action: "read",
    description:
      "Get client statistics including project count, document count, and last activity.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "The ID of the client",
        },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "clients.getStats" },
    contextRelevance: ["client"],
  },
  {
    name: "getRecentClients",
    domain: "client",
    action: "read",
    description: "Get the most recently created clients.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of clients to return (default 10)",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "clients.getRecent" },
    contextRelevance: ["client"],
  },
  {
    name: "checkClientExists",
    domain: "client",
    action: "read",
    description: "Check if a client already exists by name.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Client name to check",
        },
      },
      required: ["name"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "clients.exists" },
    contextRelevance: ["client"],
  },
  {
    name: "getClientFolders",
    domain: "client",
    action: "read",
    description:
      "Get the folder structure for a client, including standard and custom folders.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "The ID of the client",
        },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "clients.getClientFolders" },
    contextRelevance: ["client", "folder", "document"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createClient",
    domain: "client",
    action: "write",
    description:
      "Create a new client with name, type, status, and contact info. Automatically creates folder structure and checklist from template.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Client name (required)" },
        type: {
          type: "string",
          description:
            "Client type (e.g., lender, borrower, real-estate-developer)",
        },
        status: {
          type: "string",
          enum: ["prospect", "active", "archived", "past"],
          description: "Client status (default: active)",
        },
        email: { type: "string", description: "Client email address" },
        phone: { type: "string", description: "Client phone number" },
        address: { type: "string", description: "Client street address" },
        city: { type: "string", description: "Client city" },
        companyName: { type: "string", description: "Company name" },
        website: { type: "string", description: "Company website" },
        notes: { type: "string", description: "Additional notes about the client" },
        industry: { type: "string", description: "Industry classification" },
        tags: {
          type: "string",
          description: "Comma-separated tags for the client",
        },
      },
      required: ["name"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "clients.create" },
    contextRelevance: ["client"],
  },
  {
    name: "updateClient",
    domain: "client",
    action: "write",
    description: "Update an existing client's information.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client to update" },
        name: { type: "string", description: "Updated client name" },
        type: { type: "string", description: "Updated client type" },
        status: {
          type: "string",
          enum: ["prospect", "active", "archived", "past"],
          description: "Updated client status",
        },
        email: { type: "string", description: "Updated email" },
        phone: { type: "string", description: "Updated phone" },
        address: { type: "string", description: "Updated address" },
        city: { type: "string", description: "Updated city" },
        companyName: { type: "string", description: "Updated company name" },
        website: { type: "string", description: "Updated website" },
        notes: { type: "string", description: "Updated notes" },
        industry: { type: "string", description: "Updated industry" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "clients.update" },
    contextRelevance: ["client"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteClient",
    domain: "client",
    action: "delete",
    description:
      "Delete a client. WARNING: This may have cascading effects on related projects and documents.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client to delete" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "clients.remove" },
    contextRelevance: ["client"],
  },
];
