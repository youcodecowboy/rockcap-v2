import type { AtomicTool } from "../types";

export const PROJECT_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "searchProjects",
    domain: "project",
    action: "read",
    description: "Search and list projects. Can filter by client ID or status.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "Filter projects by client ID",
        },
        status: {
          type: "string",
          enum: ["active", "inactive", "completed", "on-hold", "cancelled"],
          description: "Filter projects by status",
        },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "projects.list" },
    contextRelevance: ["project", "client"],
  },
  {
    name: "getProject",
    domain: "project",
    action: "read",
    description: "Get detailed information about a specific project by its ID.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project to retrieve",
        },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "projects.get" },
    contextRelevance: ["project"],
  },
  {
    name: "getProjectsByClient",
    domain: "project",
    action: "read",
    description: "Get all projects for a specific client.",
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
    convexMapping: { type: "query", path: "projects.getByClient" },
    contextRelevance: ["project", "client"],
  },
  {
    name: "getProjectFolders",
    domain: "project",
    action: "read",
    description:
      "Get the folder structure for a project, including standard and custom folders.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project",
        },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "projects.getProjectFolders" },
    contextRelevance: ["project", "folder", "document"],
  },
  {
    name: "getProjectStats",
    domain: "project",
    action: "read",
    description:
      "Get project statistics including document count, costs, loan amount, and last activity.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project",
        },
      },
      required: ["projectId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "projects.getStats" },
    contextRelevance: ["project"],
  },
  {
    name: "checkProjectExists",
    domain: "project",
    action: "read",
    description: "Check if a project already exists for a client by name.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name to check" },
        clientId: { type: "string", description: "Client ID to scope the check" },
      },
      required: ["name", "clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "projects.exists" },
    contextRelevance: ["project", "client"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createProject",
    domain: "project",
    action: "write",
    description:
      "Create a new project linked to a client. Automatically creates folder structure and checklist from template.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name (required)" },
        clientId: {
          type: "string",
          description: "Client ID to link the project to (required)",
        },
        clientRole: {
          type: "string",
          description: "Role of the client in the project (default: client)",
        },
        description: { type: "string", description: "Project description" },
        address: { type: "string", description: "Project/property address" },
        status: {
          type: "string",
          enum: ["active", "inactive", "completed", "on-hold", "cancelled"],
          description: "Project status (default: active)",
        },
        loanAmount: {
          type: "number",
          description: "Loan amount for the project",
        },
        loanNumber: { type: "string", description: "Loan reference number" },
        projectShortcode: {
          type: "string",
          description: "Short code for the project (auto-generated if not provided)",
        },
        tags: {
          type: "string",
          description: "Comma-separated tags",
        },
      },
      required: ["name", "clientId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "projects.create" },
    contextRelevance: ["project", "client"],
  },
  {
    name: "updateProject",
    domain: "project",
    action: "write",
    description: "Update an existing project's information.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project to update",
        },
        name: { type: "string", description: "Updated project name" },
        description: { type: "string", description: "Updated description" },
        status: {
          type: "string",
          enum: ["active", "inactive", "completed", "on-hold", "cancelled"],
          description: "Updated status",
        },
        loanAmount: { type: "number", description: "Updated loan amount" },
        loanNumber: { type: "string", description: "Updated loan number" },
        address: { type: "string", description: "Updated address" },
        projectShortcode: { type: "string", description: "Updated shortcode" },
      },
      required: ["projectId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "projects.update" },
    contextRelevance: ["project"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteProject",
    domain: "project",
    action: "delete",
    description:
      "Delete a project. WARNING: This may have cascading effects on related documents.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project to delete",
        },
      },
      required: ["projectId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "projects.remove" },
    contextRelevance: ["project"],
  },
];
