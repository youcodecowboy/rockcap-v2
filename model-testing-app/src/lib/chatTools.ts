import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

// Initialize Convex client for server-side operations
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || '';

/**
 * Tool definitions for the AI chat assistant
 * These tools allow the assistant to interact with the application
 */

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  requiresConfirmation: boolean; // Whether this tool requires user confirmation
}

export const CHAT_TOOLS: Tool[] = [
  // DATA RETRIEVAL TOOLS (No confirmation needed)
  {
    name: "searchClients",
    description: "Search and list clients. Can filter by status (prospect, active, archived, past) or type.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["prospect", "active", "archived", "past"],
          description: "Filter clients by status"
        },
        type: {
          type: "string",
          description: "Filter clients by type (e.g., lender, borrower, real-estate-developer)"
        },
        searchTerm: {
          type: "string",
          description: "Search term to filter clients by name"
        }
      },
      required: []
    },
    requiresConfirmation: false
  },
  {
    name: "getClient",
    description: "Get detailed information about a specific client by their ID.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "The ID of the client to retrieve"
        }
      },
      required: ["clientId"]
    },
    requiresConfirmation: false
  },
  {
    name: "searchProjects",
    description: "Search and list projects. Can filter by client ID or status.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "Filter projects by client ID"
        },
        status: {
          type: "string",
          enum: ["active", "inactive", "completed", "on-hold", "cancelled"],
          description: "Filter projects by status"
        }
      },
      required: []
    },
    requiresConfirmation: false
  },
  {
    name: "getProject",
    description: "Get detailed information about a specific project by its ID.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project to retrieve"
        }
      },
      required: ["projectId"]
    },
    requiresConfirmation: false
  },
  {
    name: "searchDocuments",
    description: "Search and list documents. Can filter by client, project, category, or search term.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "Filter documents by client ID"
        },
        projectId: {
          type: "string",
          description: "Filter documents by project ID"
        },
        category: {
          type: "string",
          description: "Filter documents by category"
        },
        searchTerm: {
          type: "string",
          description: "Search term to filter documents by filename or content"
        }
      },
      required: []
    },
    requiresConfirmation: false
  },
  {
    name: "getKnowledgeBank",
    description: "Get knowledge bank entries for a client or project. Returns consolidated knowledge and insights.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "Filter by client ID"
        },
        projectId: {
          type: "string",
          description: "Filter by project ID"
        },
        entryType: {
          type: "string",
          enum: ["deal_update", "call_transcript", "email", "document_summary", "project_status", "general"],
          description: "Filter by entry type"
        }
      },
      required: []
    },
    requiresConfirmation: false
  },
  {
    name: "getNotes",
    description: "Get notes, optionally filtered by client or project.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "Filter by client ID"
        },
        projectId: {
          type: "string",
          description: "Filter by project ID"
        }
      },
      required: []
    },
    requiresConfirmation: false
  },
  
  // DATA CREATION TOOLS (Require confirmation)
  {
    name: "createClient",
    description: "Create a new client in the system.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Client name (required)"
        },
        type: {
          type: "string",
          description: "Client type (e.g., lender, borrower, real-estate-developer)"
        },
        status: {
          type: "string",
          enum: ["prospect", "active", "archived", "past"],
          description: "Client status"
        },
        email: {
          type: "string",
          description: "Email address"
        },
        phone: {
          type: "string",
          description: "Phone number"
        },
        address: {
          type: "string",
          description: "Street address"
        },
        city: {
          type: "string",
          description: "City"
        },
        companyName: {
          type: "string",
          description: "Company name"
        },
        website: {
          type: "string",
          description: "Website URL"
        },
        notes: {
          type: "string",
          description: "Additional notes"
        }
      },
      required: ["name"]
    },
    requiresConfirmation: true
  },
  {
    name: "createProject",
    description: "Create a new project in the system.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Project name (required)"
        },
        clientId: {
          type: "string",
          description: "Primary client ID for this project (required)"
        },
        clientRole: {
          type: "string",
          description: "Role of the client (e.g., borrower, lender, developer)"
        },
        description: {
          type: "string",
          description: "Project description"
        },
        address: {
          type: "string",
          description: "Property address"
        },
        status: {
          type: "string",
          enum: ["active", "inactive", "completed", "on-hold", "cancelled"],
          description: "Project status"
        },
        loanAmount: {
          type: "number",
          description: "Loan amount"
        },
        loanNumber: {
          type: "string",
          description: "Loan number/ID"
        }
      },
      required: ["name", "clientId"]
    },
    requiresConfirmation: true
  },
  {
    name: "createKnowledgeBankEntry",
    description: "Create a new knowledge bank entry for a client.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "Client ID (required)"
        },
        projectId: {
          type: "string",
          description: "Project ID (optional)"
        },
        title: {
          type: "string",
          description: "Entry title (required)"
        },
        content: {
          type: "string",
          description: "Entry content (required)"
        },
        entryType: {
          type: "string",
          enum: ["deal_update", "call_transcript", "email", "document_summary", "project_status", "general"],
          description: "Type of entry"
        },
        keyPoints: {
          type: "array",
          items: { type: "string" },
          description: "Key points from the entry"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization"
        }
      },
      required: ["clientId", "title", "content"]
    },
    requiresConfirmation: true
  },
  {
    name: "createNote",
    description: "Create a new note, optionally linked to a client or project.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note title (required)"
        },
        content: {
          type: "string",
          description: "Note content (required)"
        },
        clientId: {
          type: "string",
          description: "Link to client (optional)"
        },
        projectId: {
          type: "string",
          description: "Link to project (optional)"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization"
        }
      },
      required: ["title", "content"]
    },
    requiresConfirmation: true
  },
  {
    name: "createContact",
    description: "Create a new contact, optionally linked to a client or project.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Contact name (required)"
        },
        email: {
          type: "string",
          description: "Email address"
        },
        phone: {
          type: "string",
          description: "Phone number"
        },
        role: {
          type: "string",
          description: "Role/title"
        },
        company: {
          type: "string",
          description: "Company name"
        },
        clientId: {
          type: "string",
          description: "Link to client (optional)"
        },
        projectId: {
          type: "string",
          description: "Link to project (optional)"
        },
        notes: {
          type: "string",
          description: "Additional notes"
        }
      },
      required: ["name"]
    },
    requiresConfirmation: true
  },
  
  // UPDATE TOOLS (Require confirmation)
  {
    name: "updateClient",
    description: "Update an existing client's information.",
    parameters: {
      type: "object",
      properties: {
        clientId: {
          type: "string",
          description: "Client ID (required)"
        },
        name: {
          type: "string",
          description: "Updated name"
        },
        type: {
          type: "string",
          description: "Updated client type"
        },
        status: {
          type: "string",
          enum: ["prospect", "active", "archived", "past"],
          description: "Updated status"
        },
        email: {
          type: "string",
          description: "Updated email"
        },
        phone: {
          type: "string",
          description: "Updated phone"
        },
        notes: {
          type: "string",
          description: "Updated notes"
        }
      },
      required: ["clientId"]
    },
    requiresConfirmation: true
  },
  {
    name: "updateProject",
    description: "Update an existing project's information.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project ID (required)"
        },
        name: {
          type: "string",
          description: "Updated name"
        },
        description: {
          type: "string",
          description: "Updated description"
        },
        status: {
          type: "string",
          enum: ["active", "inactive", "completed", "on-hold", "cancelled"],
          description: "Updated status"
        },
        loanAmount: {
          type: "number",
          description: "Updated loan amount"
        }
      },
      required: ["projectId"]
    },
    requiresConfirmation: true
  },
  {
    name: "updateNote",
    description: "Update an existing note's title, content, or metadata.",
    parameters: {
      type: "object",
      properties: {
        noteId: {
          type: "string",
          description: "Note ID (required)"
        },
        title: {
          type: "string",
          description: "Updated title"
        },
        content: {
          type: "string",
          description: "Updated content"
        },
        clientId: {
          type: "string",
          description: "Link to client (optional, use null to unlink)"
        },
        projectId: {
          type: "string",
          description: "Link to project (optional, use null to unlink)"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization"
        }
      },
      required: ["noteId"]
    },
    requiresConfirmation: true
  },
  
  // FILE OPERATIONS (Require confirmation)
  {
    name: "getFileSummary",
    description: "Get the summary and analysis of a previously uploaded file/document.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "Document ID (required)"
        }
      },
      required: ["documentId"]
    },
    requiresConfirmation: false
  },
  
  // REMINDER OPERATIONS
  {
    name: "createReminder",
    description: "Create a reminder with optional LLM enhancement. Reminders trigger notifications at the scheduled time.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Reminder title (required)"
        },
        description: {
          type: "string",
          description: "Reminder description/notes (optional)"
        },
        scheduledFor: {
          type: "string",
          description: "ISO timestamp when reminder should trigger (required)"
        },
        clientId: {
          type: "string",
          description: "Link reminder to a client (optional)"
        },
        projectId: {
          type: "string",
          description: "Link reminder to a project (optional)"
        },
        taskId: {
          type: "string",
          description: "Link reminder to a task (optional)"
        }
      },
      required: ["title", "scheduledFor"]
    },
    requiresConfirmation: true
  },
  {
    name: "getReminders",
    description: "Get user's reminders with optional filters (status, date range, client, project).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "completed", "dismissed", "overdue"],
          description: "Filter by reminder status"
        },
        clientId: {
          type: "string",
          description: "Filter by client ID"
        },
        projectId: {
          type: "string",
          description: "Filter by project ID"
        },
        startDate: {
          type: "string",
          description: "Filter reminders from this date (ISO timestamp)"
        },
        endDate: {
          type: "string",
          description: "Filter reminders until this date (ISO timestamp)"
        }
      },
      required: []
    },
    requiresConfirmation: false
  },
  {
    name: "getUpcomingReminders",
    description: "Get user's upcoming reminders (next N days).",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days ahead to look (default: 7)"
        },
        limit: {
          type: "number",
          description: "Maximum number of reminders to return"
        }
      },
      required: []
    },
    requiresConfirmation: false
  },
  
  // TASK OPERATIONS
  {
    name: "createTask",
    description: "Create a new task with optional due date, priority, and client/project association.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title (required)"
        },
        description: {
          type: "string",
          description: "Task description (optional)"
        },
        notes: {
          type: "string",
          description: "Additional notes (optional)"
        },
        dueDate: {
          type: "string",
          description: "Due date/time in ISO timestamp format (optional)"
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Task priority (default: medium)"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization (optional)"
        },
        clientId: {
          type: "string",
          description: "Link task to a client (optional)"
        },
        projectId: {
          type: "string",
          description: "Link task to a project (optional)"
        },
        assignedTo: {
          type: "string",
          description: "User ID to assign task to (optional, defaults to current user)"
        }
      },
      required: ["title"]
    },
    requiresConfirmation: true
  },
  {
    name: "getTasks",
    description: "Get user's tasks with optional filters (status, client, project).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["todo", "in-progress", "completed", "cancelled"],
          description: "Filter by task status"
        },
        clientId: {
          type: "string",
          description: "Filter by client ID"
        },
        projectId: {
          type: "string",
          description: "Filter by project ID"
        }
      },
      required: []
    },
    requiresConfirmation: false
  },
  
  // EVENT OPERATIONS
  {
    name: "createEvent",
    description: "Create a new calendar event.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Event title (required)"
        },
        description: {
          type: "string",
          description: "Event description"
        },
        location: {
          type: "string",
          description: "Event location"
        },
        startTime: {
          type: "string",
          description: "Event start time (ISO timestamp, required)"
        },
        endTime: {
          type: "string",
          description: "Event end time (ISO timestamp, required)"
        },
        allDay: {
          type: "boolean",
          description: "Whether this is an all-day event"
        },
        clientId: {
          type: "string",
          description: "Link event to a client (optional)"
        },
        projectId: {
          type: "string",
          description: "Link event to a project (optional)"
        }
      },
      required: ["title", "startTime", "endTime"]
    },
    requiresConfirmation: true
  },
  {
    name: "getEvents",
    description: "Get user's calendar events with optional filters (date range, client, project).",
    parameters: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Filter events from this date (ISO timestamp)"
        },
        endDate: {
          type: "string",
          description: "Filter events until this date (ISO timestamp)"
        },
        clientId: {
          type: "string",
          description: "Filter by client ID"
        },
        projectId: {
          type: "string",
          description: "Filter by project ID"
        }
      },
      required: []
    },
    requiresConfirmation: false
  },
  {
    name: "getNextEvent",
    description: "Get the user's next upcoming event.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    requiresConfirmation: false
  },
  {
    name: "updateEvent",
    description: "Update an existing calendar event.",
    parameters: {
      type: "object",
      properties: {
        eventId: {
          type: "string",
          description: "Event ID (required)"
        },
        title: {
          type: "string",
          description: "Updated title"
        },
        description: {
          type: "string",
          description: "Updated description"
        },
        location: {
          type: "string",
          description: "Updated location"
        },
        startTime: {
          type: "string",
          description: "Updated start time (ISO timestamp)"
        },
        endTime: {
          type: "string",
          description: "Updated end time (ISO timestamp)"
        },
        allDay: {
          type: "boolean",
          description: "Whether this is an all-day event"
        },
        clientId: {
          type: "string",
          description: "Link event to a client (optional, use null to unlink)"
        },
        projectId: {
          type: "string",
          description: "Link event to a project (optional, use null to unlink)"
        }
      },
      required: ["eventId"]
    },
    requiresConfirmation: true
  },
  {
    name: "deleteEvent",
    description: "Delete a calendar event.",
    parameters: {
      type: "object",
      properties: {
        eventId: {
          type: "string",
          description: "Event ID (required)"
        }
      },
      required: ["eventId"]
    },
    requiresConfirmation: true
  }
];

/**
 * Validation helper functions
 */

/**
 * Validate that a string is a valid ISO timestamp
 */
function validateISODate(dateString: string): { valid: boolean; error?: string; date?: Date } {
  if (!dateString || typeof dateString !== 'string') {
    return { valid: false, error: 'Date is required and must be a string' };
  }

  // Check for shell command syntax (like $(date +'%Y-%m-%dT15:00:00Z'))
  if (dateString.includes('$(') || dateString.includes('date +')) {
    return { valid: false, error: 'Invalid date format: shell command syntax detected. Use ISO 8601 format (e.g., 2025-11-20T15:00:00Z)' };
  }

  // Try to parse as ISO date
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    return { valid: false, error: `Invalid date format: "${dateString}". Use ISO 8601 format (e.g., 2025-11-20T15:00:00Z)` };
  }

  // Check if it's a valid ISO string format (more lenient - allow various ISO formats)
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/;
  if (!isoRegex.test(dateString)) {
    // If date parses correctly but doesn't match regex, still accept it (might be a valid variant)
    // But warn about format
    const parsedDate = new Date(dateString);
    if (!isNaN(parsedDate.getTime())) {
      // Date is valid, but format might not be standard - accept it but suggest better format
      return { valid: true, date: parsedDate };
    }
    return { valid: false, error: `Invalid ISO timestamp format: "${dateString}". Use format: YYYY-MM-DDTHH:mm:ssZ` };
  }

  return { valid: true, date };
}

/**
 * Search for a client by name (fuzzy matching)
 */
async function searchClientByName(
  clientName: string,
  client: ConvexHttpClient
): Promise<{ found: boolean; clientId?: Id<"clients">; matches?: any[] }> {
  if (!clientName || typeof clientName !== 'string') {
    return { found: false };
  }

  try {
    // Get all clients
    const allClients = await client.query(api.clients.list, {});
    
    // Normalize search term
    const normalizedSearch = clientName.toLowerCase().trim();
    
    // Try exact match first
    let exactMatch = allClients.find(
      (c: any) => c.name?.toLowerCase() === normalizedSearch ||
                  c.companyName?.toLowerCase() === normalizedSearch
    );
    
    if (exactMatch) {
      return { found: true, clientId: exactMatch._id };
    }
    
    // Try partial match
    const partialMatches = allClients.filter(
      (c: any) => c.name?.toLowerCase().includes(normalizedSearch) ||
                  c.companyName?.toLowerCase().includes(normalizedSearch) ||
                  normalizedSearch.includes(c.name?.toLowerCase() || '') ||
                  normalizedSearch.includes(c.companyName?.toLowerCase() || '')
    );
    
    if (partialMatches.length === 1) {
      return { found: true, clientId: partialMatches[0]._id, matches: partialMatches };
    }
    
    if (partialMatches.length > 1) {
      return { found: false, matches: partialMatches };
    }
    
    return { found: false };
  } catch (error) {
    console.error('Error searching for client:', error);
    return { found: false };
  }
}

/**
 * Parse and validate reminder parameters
 * Extracts client names from description if clientId is not provided
 */
async function parseAndValidateReminderParams(
  params: any,
  client: ConvexHttpClient
): Promise<{
  valid: boolean;
  error?: string;
  validatedParams?: any;
  needsClientConfirmation?: boolean;
  clientMatches?: any[];
}> {
  // Validate required fields
  if (!params.title || typeof params.title !== 'string' || !params.title.trim()) {
    return { valid: false, error: 'Reminder title is required' };
  }

  if (!params.scheduledFor) {
    return { valid: false, error: 'Scheduled date/time is required' };
  }

  // Validate date
  const dateValidation = validateISODate(params.scheduledFor);
  if (!dateValidation.valid) {
    return { valid: false, error: dateValidation.error };
  }

  const validatedParams: any = {
    title: params.title.trim(),
    description: params.description,
    scheduledFor: params.scheduledFor,
    projectId: params.projectId,
    taskId: params.taskId,
  };

  // Handle client ID - client is optional, so we'll try to find it but won't fail if we can't
  let clientId = params.clientId;
  
  // If clientId is provided, validate it's a valid Convex ID
  if (clientId) {
    if (typeof clientId === 'string' && clientId.startsWith('j')) {
      // Valid Convex ID format
      validatedParams.clientId = clientId;
    } else {
      // Might be a client name - try to search for it
      const clientSearch = await searchClientByName(clientId, client);
      if (clientSearch.found && clientSearch.clientId) {
        // Found exact match - use it
        validatedParams.clientId = clientSearch.clientId;
      } else if (clientSearch.matches && clientSearch.matches.length === 1) {
        // Single match - use it
        validatedParams.clientId = clientSearch.matches[0]._id;
      }
      // If multiple matches or no matches, proceed without clientId (it's optional)
    }
  } else {
    // Try to extract client name from description or title
    const textToSearch = `${params.title} ${params.description || ''}`.toLowerCase();
    const clientSearch = await searchClientByName(textToSearch, client);
    
    if (clientSearch.found && clientSearch.clientId) {
      // Found exact match - use it
      validatedParams.clientId = clientSearch.clientId;
    } else if (clientSearch.matches && clientSearch.matches.length === 1) {
      // Single match - use it
      validatedParams.clientId = clientSearch.matches[0]._id;
    }
    // If multiple matches or no matches, proceed without clientId (it's optional)
  }

  return { valid: true, validatedParams };
}

/**
 * Parse and validate task parameters
 */
async function parseAndValidateTaskParams(
  params: any,
  client: ConvexHttpClient
): Promise<{
  valid: boolean;
  error?: string;
  validatedParams?: any;
  needsClientConfirmation?: boolean;
  clientMatches?: any[];
}> {
  // Validate required fields
  if (!params.title || typeof params.title !== 'string' || !params.title.trim()) {
    return { valid: false, error: 'Task title is required' };
  }

  const validatedParams: any = {
    title: params.title.trim(),
    description: params.description,
    notes: params.notes,
    priority: params.priority || 'medium',
    tags: params.tags || [],
    assignedTo: params.assignedTo,
    projectId: params.projectId,
  };

  // Validate due date if provided
  if (params.dueDate) {
    const dateValidation = validateISODate(params.dueDate);
    if (!dateValidation.valid) {
      return { valid: false, error: dateValidation.error };
    }
    validatedParams.dueDate = params.dueDate;
  }

  // Handle client ID - client is optional, so we'll try to find it but won't fail if we can't
  let clientId = params.clientId;
  
  if (clientId) {
    if (typeof clientId === 'string' && clientId.startsWith('j')) {
      // Valid Convex ID format
      validatedParams.clientId = clientId;
    } else {
      // Might be a client name - try to search for it
      const clientSearch = await searchClientByName(clientId, client);
      if (clientSearch.found && clientSearch.clientId) {
        // Found exact match - use it
        validatedParams.clientId = clientSearch.clientId;
      } else if (clientSearch.matches && clientSearch.matches.length === 1) {
        // Single match - use it
        validatedParams.clientId = clientSearch.matches[0]._id;
      }
      // If multiple matches or no matches, proceed without clientId (it's optional)
    }
  } else {
    // Try to extract client name from description or title
    const textToSearch = `${params.title} ${params.description || ''}`.toLowerCase();
    const clientSearch = await searchClientByName(textToSearch, client);
    
    if (clientSearch.found && clientSearch.clientId) {
      // Found exact match - use it
      validatedParams.clientId = clientSearch.clientId;
    } else if (clientSearch.matches && clientSearch.matches.length === 1) {
      // Single match - use it
      validatedParams.clientId = clientSearch.matches[0]._id;
    }
    // If multiple matches or no matches, proceed without clientId (it's optional)
  }

  return { valid: true, validatedParams };
}

/**
 * Execute a tool with the given parameters
 * This is called after user confirmation for tools that require it
 * @param authenticatedClient - Optional authenticated Convex client. If provided, uses this instead of creating a new one.
 */
export async function executeTool(
  toolName: string,
  parameters: Record<string, any>,
  authenticatedClient?: ConvexHttpClient
): Promise<any> {
  // Use provided authenticated client, or create a new unauthenticated one (for backward compatibility)
  const client = authenticatedClient || new ConvexHttpClient(convexUrl);
  
  try {
    switch (toolName) {
      // DATA RETRIEVAL
      case "searchClients":
        const allClients = await client.query(api.clients.list, {
          status: parameters.status,
          type: parameters.type,
        });
        
        // Filter by searchTerm if provided
        if (parameters.searchTerm && typeof parameters.searchTerm === 'string') {
          const searchTerm = parameters.searchTerm.toLowerCase().trim();
          return allClients.filter((c: any) => 
            c.name?.toLowerCase().includes(searchTerm) ||
            c.companyName?.toLowerCase().includes(searchTerm) ||
            c.email?.toLowerCase().includes(searchTerm)
          );
        }
        
        return allClients;
      
      case "getClient":
        return await client.query(api.clients.get, {
          id: parameters.clientId as Id<"clients">,
        });
      
      case "searchProjects":
        return await client.query(api.projects.list, {
          clientId: parameters.clientId as Id<"clients"> | undefined,
          status: parameters.status,
        });
      
      case "getProject":
        return await client.query(api.projects.get, {
          id: parameters.projectId as Id<"projects">,
        });
      
      case "searchDocuments":
        if (parameters.clientId) {
          return await client.query(api.documents.getByClient, {
            clientId: parameters.clientId as Id<"clients">,
          });
        } else if (parameters.projectId) {
          return await client.query(api.documents.getByProject, {
            projectId: parameters.projectId as Id<"projects">,
          });
        } else {
          return await client.query(api.documents.list, {
            category: parameters.category,
          });
        }
      
      case "getKnowledgeBank":
        if (parameters.clientId) {
          return await client.query(api.knowledgeBank.getByClient, {
            clientId: parameters.clientId as Id<"clients">,
          });
        } else if (parameters.projectId) {
          return await client.query(api.knowledgeBank.getByProject, {
            projectId: parameters.projectId as Id<"projects">,
          });
        }
        return [];
      
      case "getNotes":
        if (parameters.clientId) {
          return await client.query(api.notes.getByClient, {
            clientId: parameters.clientId as Id<"clients">,
          });
        } else if (parameters.projectId) {
          return await client.query(api.notes.getByProject, {
            projectId: parameters.projectId as Id<"projects">,
          });
        } else {
          return await client.query(api.notes.getAll, {});
        }
      
      // DATA CREATION
      case "createClient":
        return await client.mutation(api.clients.create, {
          name: parameters.name,
          type: parameters.type,
          status: parameters.status,
          email: parameters.email,
          phone: parameters.phone,
          address: parameters.address,
          city: parameters.city,
          companyName: parameters.companyName,
          website: parameters.website,
          notes: parameters.notes,
        });
      
      case "createProject":
        return await client.mutation(api.projects.create, {
          name: parameters.name,
          clientRoles: [{
            clientId: parameters.clientId,
            role: parameters.clientRole || "client",
          }],
          description: parameters.description,
          address: parameters.address,
          status: parameters.status,
          loanAmount: parameters.loanAmount,
          loanNumber: parameters.loanNumber,
        });
      
      case "createKnowledgeBankEntry":
        return await client.mutation(api.knowledgeBank.createManual, {
          clientId: parameters.clientId as Id<"clients">,
          projectId: parameters.projectId as Id<"projects"> | undefined,
          title: parameters.title,
          content: parameters.content,
          entryType: parameters.entryType || "general",
          keyPoints: parameters.keyPoints || [],
          tags: parameters.tags || [],
        });
      
      case "createNote":
        return await client.mutation(api.notes.create, {
          title: parameters.title,
          content: parameters.content,
          clientId: parameters.clientId as Id<"clients"> | undefined,
          projectId: parameters.projectId as Id<"projects"> | undefined,
          tags: parameters.tags || [],
          knowledgeBankEntryIds: [],
        });
      
      case "createContact":
        return await client.mutation(api.contacts.create, {
          name: parameters.name,
          email: parameters.email,
          phone: parameters.phone,
          role: parameters.role,
          company: parameters.company,
          clientId: parameters.clientId as Id<"clients"> | undefined,
          projectId: parameters.projectId as Id<"projects"> | undefined,
          notes: parameters.notes,
        });
      
      // UPDATES
      case "updateClient":
        const { clientId, ...clientUpdates } = parameters;
        return await client.mutation(api.clients.update, {
          id: clientId as Id<"clients">,
          ...clientUpdates,
        });
      
      case "updateProject":
        const { projectId, ...projectUpdates } = parameters;
        return await client.mutation(api.projects.update, {
          id: projectId as Id<"projects">,
          ...projectUpdates,
        });
      
      case "updateNote":
        const { noteId, ...noteUpdates } = parameters;
        // Handle null values for clientId/projectId (to unlink)
        const updateData: any = { ...noteUpdates };
        if (updateData.clientId === null) updateData.clientId = null;
        if (updateData.projectId === null) updateData.projectId = null;
        return await client.mutation(api.notes.update, {
          id: noteId as Id<"notes">,
          ...updateData,
        });
      
      // FILE OPERATIONS
      case "getFileSummary":
        return await client.query(api.documents.get, {
          id: parameters.documentId as Id<"documents">,
        });
      
      // REMINDER OPERATIONS
      case "createReminder":
        // Validate and parse parameters
        const reminderValidation = await parseAndValidateReminderParams(parameters, client);
        if (!reminderValidation.valid) {
          throw new Error(reminderValidation.error || 'Invalid reminder parameters');
        }
        
        // Client is optional - proceed even if not found or multiple matches
        // The validation function will set clientId only if there's a clear match
        
        return await client.mutation(api.reminders.create, {
          title: reminderValidation.validatedParams!.title,
          description: reminderValidation.validatedParams!.description,
          scheduledFor: reminderValidation.validatedParams!.scheduledFor,
          clientId: reminderValidation.validatedParams!.clientId as Id<"clients"> | undefined,
          projectId: reminderValidation.validatedParams!.projectId as Id<"projects"> | undefined,
          taskId: reminderValidation.validatedParams!.taskId as Id<"tasks"> | undefined,
        });
      
      case "getReminders":
        return await client.query(api.reminders.getByUser, {
          status: parameters.status as "pending" | "completed" | "dismissed" | "overdue" | undefined,
          clientId: parameters.clientId as Id<"clients"> | undefined,
          projectId: parameters.projectId as Id<"projects"> | undefined,
          startDate: parameters.startDate,
          endDate: parameters.endDate,
        });
      
      case "getUpcomingReminders":
        return await client.query(api.reminders.getUpcoming, {
          days: parameters.days,
          limit: parameters.limit,
        });
      
      // TASK OPERATIONS
      case "createTask":
        // Validate and parse parameters
        const taskValidation = await parseAndValidateTaskParams(parameters, client);
        if (!taskValidation.valid) {
          throw new Error(taskValidation.error || 'Invalid task parameters');
        }
        
        // Client is optional - proceed even if not found or multiple matches
        // The validation function will set clientId only if there's a clear match
        
        return await client.mutation(api.tasks.create, {
          title: taskValidation.validatedParams!.title,
          description: taskValidation.validatedParams!.description,
          notes: taskValidation.validatedParams!.notes,
          dueDate: taskValidation.validatedParams!.dueDate,
          priority: taskValidation.validatedParams!.priority,
          tags: taskValidation.validatedParams!.tags,
          clientId: taskValidation.validatedParams!.clientId as Id<"clients"> | undefined,
          projectId: taskValidation.validatedParams!.projectId as Id<"projects"> | undefined,
          assignedTo: taskValidation.validatedParams!.assignedTo as Id<"users"> | undefined,
        });
      
      case "getTasks":
        return await client.query(api.tasks.getByUser, {
          status: parameters.status as "todo" | "in_progress" | "completed" | "cancelled" | undefined,
          clientId: parameters.clientId as Id<"clients"> | undefined,
          projectId: parameters.projectId as Id<"projects"> | undefined,
        });
      
      // EVENT OPERATIONS
      case "createEvent":
        return await client.mutation(api.events.create, {
          title: parameters.title,
          description: parameters.description,
          location: parameters.location,
          startTime: parameters.startTime,
          endTime: parameters.endTime,
          allDay: parameters.allDay,
          clientId: parameters.clientId as Id<"clients"> | undefined,
          projectId: parameters.projectId as Id<"projects"> | undefined,
        });
      
      case "getEvents":
        return await client.query(api.events.list, {
          startDate: parameters.startDate,
          endDate: parameters.endDate,
          clientId: parameters.clientId as Id<"clients"> | undefined,
          projectId: parameters.projectId as Id<"projects"> | undefined,
        });
      
      case "getNextEvent":
        return await client.query(api.events.getNextEvent, {});
      
      case "updateEvent":
        const { eventId, ...eventUpdates } = parameters;
        const updateEventData: any = { ...eventUpdates };
        if (updateEventData.clientId === null) updateEventData.clientId = undefined;
        if (updateEventData.projectId === null) updateEventData.projectId = undefined;
        return await client.mutation(api.events.update, {
          id: eventId as Id<"events">,
          ...updateEventData,
        });
      
      case "deleteEvent":
        return await client.mutation(api.events.remove, {
          id: parameters.eventId as Id<"events">,
        });
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    throw error;
  }
}

/**
 * Format tool definitions for the LLM
 */
export function formatToolsForLLM(): string {
  return CHAT_TOOLS.map(tool => {
    return `### ${tool.name}
Description: ${tool.description}
Parameters: ${JSON.stringify(tool.parameters, null, 2)}
Requires Confirmation: ${tool.requiresConfirmation}`;
  }).join('\n\n');
}

