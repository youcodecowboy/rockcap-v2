import type { AtomicTool } from "../types";

export const CONTACT_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getContacts",
    domain: "contact",
    action: "read",
    description:
      "Get all contacts, optionally filtered by client or project.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Filter by client ID" },
        projectId: { type: "string", description: "Filter by project ID" },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "contacts.getAll" },
    contextRelevance: ["contact", "client", "project"],
  },
  {
    name: "getContact",
    domain: "contact",
    action: "read",
    description:
      "Get detailed info about a specific contact, including linked companies and deals.",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "The ID of the contact" },
      },
      required: ["contactId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "contacts.get" },
    contextRelevance: ["contact"],
  },
  {
    name: "searchContactsByClient",
    domain: "contact",
    action: "read",
    description: "Get all contacts associated with a specific client.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The ID of the client" },
      },
      required: ["clientId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "contacts.getByClient" },
    contextRelevance: ["contact", "client"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createContact",
    domain: "contact",
    action: "write",
    description:
      "Create a new contact with name, role, email, phone, and optional client/project link.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name (required)" },
        email: { type: "string", description: "Contact email" },
        phone: { type: "string", description: "Contact phone number" },
        role: { type: "string", description: "Contact role/title" },
        company: { type: "string", description: "Company name" },
        clientId: { type: "string", description: "Link to a client" },
        projectId: { type: "string", description: "Link to a project" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["name"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "contacts.create" },
    contextRelevance: ["contact", "client", "project"],
  },
  {
    name: "updateContact",
    domain: "contact",
    action: "write",
    description: "Update an existing contact's information.",
    parameters: {
      type: "object",
      properties: {
        contactId: {
          type: "string",
          description: "The ID of the contact to update",
        },
        name: { type: "string", description: "Updated name" },
        email: { type: "string", description: "Updated email" },
        phone: { type: "string", description: "Updated phone" },
        role: { type: "string", description: "Updated role/title" },
        company: { type: "string", description: "Updated company name" },
        notes: { type: "string", description: "Updated notes" },
      },
      required: ["contactId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "contacts.update" },
    contextRelevance: ["contact"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteContact",
    domain: "contact",
    action: "delete",
    description: "Delete a contact.",
    parameters: {
      type: "object",
      properties: {
        contactId: {
          type: "string",
          description: "The ID of the contact to delete",
        },
      },
      required: ["contactId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "contacts.remove" },
    contextRelevance: ["contact"],
  },
];
