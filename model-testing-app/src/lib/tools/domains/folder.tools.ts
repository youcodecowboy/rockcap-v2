import type { AtomicTool } from "../types";

export const FOLDER_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "mapCategoryToFolder",
    domain: "folder",
    action: "read",
    description:
      "Get the target folder for a given document category. Returns the folder type and level (client or project).",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Document category to map to a folder",
        },
        hasProject: {
          type: "boolean",
          description: "Whether the document belongs to a project",
        },
      },
      required: ["category", "hasProject"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "folderStructure.mapCategoryToFolder" },
    contextRelevance: ["folder", "document"],
  },
  {
    name: "getDocumentsByFolder",
    domain: "folder",
    action: "read",
    description: "Get all documents in a specific folder.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Client ID (for client folders)" },
        projectId: {
          type: "string",
          description: "Project ID (for project folders)",
        },
        folderType: {
          type: "string",
          description: "The folder type identifier",
        },
      },
      required: ["folderType"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "documents.getByFolder" },
    contextRelevance: ["folder", "document"],
  },

  // -------------------------------------------------------------------------
  // WRITE — Client Folders
  // -------------------------------------------------------------------------
  {
    name: "createClientFolder",
    domain: "folder",
    action: "write",
    description: "Create a custom folder under a client.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
        name: { type: "string", description: "Folder name" },
        description: { type: "string", description: "Folder description" },
        parentFolderId: {
          type: "string",
          description: "Parent folder ID for nested folders",
        },
      },
      required: ["clientId", "name"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "clients.addCustomFolder" },
    contextRelevance: ["folder", "client"],
  },
  {
    name: "renameClientFolder",
    domain: "folder",
    action: "write",
    description: "Rename a custom client folder.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "The ID of the folder to rename" },
        name: { type: "string", description: "New folder name" },
        description: { type: "string", description: "Updated description" },
      },
      required: ["folderId", "name"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "clients.renameCustomFolder" },
    contextRelevance: ["folder", "client"],
  },
  {
    name: "deleteClientFolder",
    domain: "folder",
    action: "delete",
    description:
      "Delete a custom client folder. Only custom folders can be deleted. Documents will be moved to parent folder.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "The ID of the folder to delete" },
      },
      required: ["folderId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "clients.deleteCustomFolder" },
    contextRelevance: ["folder", "client"],
  },

  // -------------------------------------------------------------------------
  // WRITE — Project Folders
  // -------------------------------------------------------------------------
  {
    name: "createProjectFolder",
    domain: "folder",
    action: "write",
    description: "Create a custom folder under a project.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The ID of the project" },
        name: { type: "string", description: "Folder name" },
        description: { type: "string", description: "Folder description" },
        parentFolderId: {
          type: "string",
          description: "Parent folder ID for nested folders",
        },
      },
      required: ["projectId", "name"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "projects.addCustomProjectFolder" },
    contextRelevance: ["folder", "project"],
  },
  {
    name: "renameProjectFolder",
    domain: "folder",
    action: "write",
    description: "Rename a custom project folder.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "The ID of the folder to rename" },
        name: { type: "string", description: "New folder name" },
        description: { type: "string", description: "Updated description" },
      },
      required: ["folderId", "name"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "projects.renameCustomProjectFolder" },
    contextRelevance: ["folder", "project"],
  },
  {
    name: "deleteProjectFolder",
    domain: "folder",
    action: "delete",
    description:
      "Delete a custom project folder. Only custom folders can be deleted. Documents will be moved to parent folder.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "The ID of the folder to delete" },
      },
      required: ["folderId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "projects.deleteCustomProjectFolder" },
    contextRelevance: ["folder", "project"],
  },
];
