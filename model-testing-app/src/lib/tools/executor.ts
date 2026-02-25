/**
 * Tool Executor
 *
 * Dispatch-table executor replacing the switch statement in chatTools.ts.
 * Each handler maps a tool name to a function that calls the appropriate
 * Convex query or mutation.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  parseAndValidateReminderParams,
  parseAndValidateTaskParams,
} from "./validators";

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------

type ToolHandler = (
  params: Record<string, any>,
  client: ConvexHttpClient
) => Promise<any>;

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const handlers: Record<string, ToolHandler> = {
  // ==========================================================================
  // CLIENT
  // ==========================================================================
  searchClients: async (params, client) => {
    const allClients = await client.query(api.clients.list, {
      status: params.status,
      type: params.type,
    });
    if (params.searchTerm && typeof params.searchTerm === "string") {
      const term = params.searchTerm.toLowerCase().trim();
      return allClients.filter(
        (c: any) =>
          c.name?.toLowerCase().includes(term) ||
          c.companyName?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term)
      );
    }
    return allClients;
  },

  getClient: async (params, client) =>
    client.query(api.clients.get, { id: params.clientId as Id<"clients"> }),

  getClientStats: async (params, client) =>
    client.query(api.clients.getStats, {
      clientId: params.clientId as Id<"clients">,
    }),

  getRecentClients: async (params, client) =>
    client.query(api.clients.getRecent, { limit: params.limit }),

  checkClientExists: async (params, client) =>
    client.query(api.clients.exists, { name: params.name }),

  getClientFolders: async (params, client) =>
    client.query(api.clients.getClientFolders, {
      clientId: params.clientId as Id<"clients">,
    }),

  createClient: async (params, client) =>
    client.mutation(api.clients.create, {
      name: params.name,
      type: params.type,
      status: params.status,
      email: params.email,
      phone: params.phone,
      address: params.address,
      city: params.city,
      companyName: params.companyName,
      website: params.website,
      notes: params.notes,
    }),

  updateClient: async (params, client) => {
    const { clientId, ...updates } = params;
    return client.mutation(api.clients.update, {
      id: clientId as Id<"clients">,
      ...updates,
    });
  },

  deleteClient: async (params, client) =>
    client.mutation(api.clients.remove, {
      id: params.clientId as Id<"clients">,
    }),

  // ==========================================================================
  // PROJECT
  // ==========================================================================
  searchProjects: async (params, client) =>
    client.query(api.projects.list, {
      clientId: params.clientId as Id<"clients"> | undefined,
      status: params.status,
    }),

  getProject: async (params, client) =>
    client.query(api.projects.get, { id: params.projectId as Id<"projects"> }),

  getProjectsByClient: async (params, client) =>
    client.query(api.projects.getByClient, {
      clientId: params.clientId as Id<"clients">,
    }),

  getProjectFolders: async (params, client) =>
    client.query(api.projects.getProjectFolders, {
      projectId: params.projectId as Id<"projects">,
    }),

  getProjectStats: async (params, client) =>
    client.query(api.projects.getStats, {
      projectId: params.projectId as Id<"projects">,
    }),

  checkProjectExists: async (params, client) =>
    client.query(api.projects.exists, {
      name: params.name,
      clientId: params.clientId as Id<"clients">,
    }),

  createProject: async (params, client) =>
    client.mutation(api.projects.create, {
      name: params.name,
      clientRoles: [
        {
          clientId: params.clientId,
          role: params.clientRole || "client",
        },
      ],
      description: params.description,
      address: params.address,
      status: params.status,
      loanAmount: params.loanAmount,
      loanNumber: params.loanNumber,
    }),

  updateProject: async (params, client) => {
    const { projectId, ...updates } = params;
    return client.mutation(api.projects.update, {
      id: projectId as Id<"projects">,
      ...updates,
    });
  },

  deleteProject: async (params, client) =>
    client.mutation(api.projects.remove, {
      id: params.projectId as Id<"projects">,
    }),

  // ==========================================================================
  // DOCUMENT
  // ==========================================================================
  searchDocuments: async (params, client) => {
    if (params.clientId) {
      return client.query(api.documents.getByClient, {
        clientId: params.clientId as Id<"clients">,
      });
    } else if (params.projectId) {
      return client.query(api.documents.getByProject, {
        projectId: params.projectId as Id<"projects">,
      });
    }
    return client.query(api.documents.list, { category: params.category });
  },

  getDocument: async (params, client) =>
    client.query(api.documents.get, {
      id: params.documentId as Id<"documents">,
    }),

  getDocumentsByClient: async (params, client) =>
    client.query(api.documents.getByClient, {
      clientId: params.clientId as Id<"clients">,
    }),

  getDocumentsByProject: async (params, client) =>
    client.query(api.documents.getByProject, {
      projectId: params.projectId as Id<"projects">,
    }),

  getDocumentNotes: async (params, client) =>
    client.query(api.documentNotes.getByDocument, {
      documentId: params.documentId as Id<"documents">,
    }),

  getDocumentExtractions: async (params, client) =>
    client.query(api.documentExtractions.getByDocument, {
      documentId: params.documentId as Id<"documents">,
    }),

  getDocumentUrl: async (params, client) =>
    client.query(api.documents.getFileUrl, { storageId: params.storageId }),

  moveDocument: async (params, client) =>
    client.mutation(api.documents.moveDocument, {
      documentId: params.documentId as Id<"documents">,
      targetClientId: params.targetClientId as Id<"clients">,
      targetProjectId: params.targetProjectId
        ? (params.targetProjectId as Id<"projects">)
        : undefined,
      targetProjectName: params.targetProjectName,
      isBaseDocument: params.isBaseDocument ?? false,
    }),

  updateDocumentMetadata: async (params, client) => {
    const { documentId, ...updates } = params;
    return client.mutation(api.documents.update, {
      id: documentId as Id<"documents">,
      ...updates,
    });
  },

  addDocumentNote: async (params, client) =>
    client.mutation(api.documentNotes.create, {
      documentId: params.documentId as Id<"documents">,
      content: params.content,
      addToIntelligence: params.addToIntelligence || false,
    }),

  // ==========================================================================
  // FOLDER
  // ==========================================================================
  mapCategoryToFolder: async (params, client) =>
    client.query(api.folderStructure.mapCategoryToFolder, {
      category: params.category,
      hasProject: params.hasProject,
    }),

  getDocumentsByFolder: async (params, client) =>
    client.query(api.documents.getByFolder, {
      clientId: params.clientId as Id<"clients">,
      folderType: params.folderType,
      level: params.level || "client",
      projectId: params.projectId as Id<"projects"> | undefined,
    }),

  createClientFolder: async (params, client) =>
    client.mutation(api.clients.addCustomFolder, {
      clientId: params.clientId as Id<"clients">,
      name: params.name,
      description: params.description,
      parentFolderId: params.parentFolderId as Id<"clientFolders"> | undefined,
    }),

  renameClientFolder: async (params, client) =>
    client.mutation(api.clients.renameCustomFolder, {
      folderId: params.folderId as Id<"clientFolders">,
      name: params.name,
      description: params.description,
    }),

  deleteClientFolder: async (params, client) =>
    client.mutation(api.clients.deleteCustomFolder, {
      folderId: params.folderId as Id<"clientFolders">,
    }),

  createProjectFolder: async (params, client) =>
    client.mutation(api.projects.addCustomProjectFolder, {
      projectId: params.projectId as Id<"projects">,
      name: params.name,
      description: params.description,
    }),

  renameProjectFolder: async (params, client) =>
    client.mutation(api.projects.renameCustomProjectFolder, {
      folderId: params.folderId as Id<"projectFolders">,
      name: params.name,
      description: params.description,
    }),

  deleteProjectFolder: async (params, client) =>
    client.mutation(api.projects.deleteCustomProjectFolder, {
      folderId: params.folderId as Id<"projectFolders">,
    }),

  // ==========================================================================
  // CHECKLIST
  // ==========================================================================
  getChecklistByClient: async (params, client) =>
    client.query(api.knowledgeLibrary.getChecklistByClient, {
      clientId: params.clientId as Id<"clients">,
    }),

  getChecklistByProject: async (params, client) =>
    client.query(api.knowledgeLibrary.getChecklistByProject, {
      projectId: params.projectId as Id<"projects">,
    }),

  getChecklistSummary: async (params, client) =>
    client.query(api.knowledgeLibrary.getChecklistSummary, {
      clientId: params.clientId as Id<"clients">,
    }),

  getMissingChecklistItems: async (params, client) =>
    client.query(api.knowledgeLibrary.getMissingItems, {
      clientId: params.clientId as Id<"clients">,
      projectId: params.projectId as Id<"projects"> | undefined,
    }),

  addChecklistItem: async (params, client) =>
    client.mutation(api.knowledgeLibrary.addCustomRequirement, {
      clientId: params.clientId as Id<"clients">,
      name: params.name,
      category: params.category,
      priority: params.priority,
      projectId: params.projectId as Id<"projects"> | undefined,
      description: params.description,
    }),

  linkDocumentToChecklist: async (params, client) => {
    if (!params.userId) {
      throw new Error(
        "linkDocumentToChecklist requires a userId parameter. Please provide the current user's ID."
      );
    }
    return client.mutation(api.knowledgeLibrary.linkDocumentToRequirement, {
      checklistItemId: params.checklistItemId as Id<"knowledgeChecklistItems">,
      documentId: params.documentId as Id<"documents">,
      userId: params.userId as Id<"users">,
    });
  },

  unlinkDocumentFromChecklist: async (params, client) =>
    client.mutation(api.knowledgeLibrary.unlinkDocument, {
      checklistItemId: params.checklistItemId as Id<"knowledgeChecklistItems">,
    }),

  deleteChecklistItem: async (params, client) =>
    client.mutation(api.knowledgeLibrary.deleteCustomRequirement, {
      checklistItemId: params.checklistItemId as Id<"knowledgeChecklistItems">,
    }),

  // ==========================================================================
  // FILE QUEUE
  // ==========================================================================
  getFileQueueJobs: async (params, client) =>
    client.query(api.fileQueue.getJobs, {
      status: params.status,
      limit: params.limit,
    }),

  getFileQueueJob: async (params, client) =>
    client.query(api.fileQueue.getJob, {
      jobId: params.jobId as Id<"fileUploadQueue">,
    }),

  getReviewQueue: async (params, client) =>
    client.query(api.fileQueue.getReviewQueueWithNav, {}),

  fileDocument: async (params, client) => {
    const checklistItemIds = params.checklistItemIds
      ? (typeof params.checklistItemIds === "string"
          ? params.checklistItemIds.split(",")
          : params.checklistItemIds
        ).map((id: string) => id.trim())
      : undefined;

    let extractedIntelligence: any = undefined;
    if (params.extractedIntelligence) {
      if (typeof params.extractedIntelligence === "string") {
        try {
          extractedIntelligence = JSON.parse(params.extractedIntelligence);
        } catch {
          throw new Error(
            "fileDocument: extractedIntelligence must be valid JSON"
          );
        }
      } else {
        extractedIntelligence = params.extractedIntelligence;
      }
    }

    return client.mutation(api.fileQueue.fileDocument, {
      jobId: params.jobId as Id<"fileUploadQueue">,
      clientId: params.clientId as Id<"clients">,
      folderId: params.folderId,
      folderType: params.folderType,
      projectId: params.projectId as Id<"projects"> | undefined,
      category: params.category,
      fileTypeDetected: params.fileTypeDetected,
      checklistItemIds,
      extractedIntelligence,
    });
  },

  skipQueuedDocument: async (params, client) =>
    client.mutation(api.fileQueue.skipDocument, {
      jobId: params.jobId as Id<"fileUploadQueue">,
    }),

  // ==========================================================================
  // TASK
  // ==========================================================================
  getTasks: async (params, client) =>
    client.query(api.tasks.getByUser, {
      status: params.status,
      clientId: params.clientId as Id<"clients"> | undefined,
      projectId: params.projectId as Id<"projects"> | undefined,
    }),

  getTask: async (params, client) =>
    client.query(api.tasks.get, { id: params.taskId as Id<"tasks"> }),

  createTask: async (params, client) => {
    const validation = await parseAndValidateTaskParams(params, client);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid task parameters");
    }
    return client.mutation(api.tasks.create, {
      title: validation.validatedParams!.title,
      description: validation.validatedParams!.description,
      notes: validation.validatedParams!.notes,
      dueDate: validation.validatedParams!.dueDate,
      priority: validation.validatedParams!.priority,
      tags: validation.validatedParams!.tags,
      clientId: validation.validatedParams!.clientId as Id<"clients"> | undefined,
      projectId: validation.validatedParams!.projectId as Id<"projects"> | undefined,
      assignedTo: validation.validatedParams!.assignedTo as Id<"users"> | undefined,
    });
  },

  updateTask: async (params, client) => {
    const { taskId, ...updates } = params;
    return client.mutation(api.tasks.update, {
      id: taskId as Id<"tasks">,
      ...updates,
    });
  },

  completeTask: async (params, client) =>
    client.mutation(api.tasks.complete, { id: params.taskId as Id<"tasks"> }),

  deleteTask: async (params, client) =>
    client.mutation(api.tasks.remove, { id: params.taskId as Id<"tasks"> }),

  // ==========================================================================
  // NOTE
  // ==========================================================================
  getNotes: async (params, client) => {
    if (params.clientId) {
      return client.query(api.notes.getByClient, {
        clientId: params.clientId as Id<"clients">,
      });
    } else if (params.projectId) {
      return client.query(api.notes.getByProject, {
        projectId: params.projectId as Id<"projects">,
      });
    }
    return client.query(api.notes.getAll, {});
  },

  getNote: async (params, client) =>
    client.query(api.notes.get, { id: params.noteId as Id<"notes"> }),

  createNote: async (params, client) =>
    client.mutation(api.notes.create, {
      title: params.title,
      content: params.content,
      clientId: params.clientId as Id<"clients"> | undefined,
      projectId: params.projectId as Id<"projects"> | undefined,
      tags: params.tags ? (typeof params.tags === "string" ? params.tags.split(",").map((t: string) => t.trim()) : params.tags) : [],
      knowledgeBankEntryIds: [],
    }),

  updateNote: async (params, client) => {
    const { noteId, ...updates } = params;
    const updateData: any = { ...updates };
    if (updateData.clientId === null) updateData.clientId = null;
    if (updateData.projectId === null) updateData.projectId = null;
    return client.mutation(api.notes.update, {
      id: noteId as Id<"notes">,
      ...updateData,
    });
  },

  deleteNote: async (params, client) =>
    client.mutation(api.notes.remove, { id: params.noteId as Id<"notes"> }),

  // ==========================================================================
  // CONTACT
  // ==========================================================================
  getContacts: async (params, client) => {
    if (params.clientId) {
      return client.query(api.contacts.getByClient, {
        clientId: params.clientId as Id<"clients">,
      });
    } else if (params.projectId) {
      return client.query(api.contacts.getByProject, {
        projectId: params.projectId as Id<"projects">,
      });
    }
    return client.query(api.contacts.getAll, {});
  },

  getContact: async (params, client) =>
    client.query(api.contacts.get, { id: params.contactId as Id<"contacts"> }),

  searchContactsByClient: async (params, client) =>
    client.query(api.contacts.getByClient, {
      clientId: params.clientId as Id<"clients">,
    }),

  createContact: async (params, client) =>
    client.mutation(api.contacts.create, {
      name: params.name,
      email: params.email,
      phone: params.phone,
      role: params.role,
      company: params.company,
      clientId: params.clientId as Id<"clients"> | undefined,
      projectId: params.projectId as Id<"projects"> | undefined,
      notes: params.notes,
    }),

  updateContact: async (params, client) => {
    const { contactId, ...updates } = params;
    return client.mutation(api.contacts.update, {
      id: contactId as Id<"contacts">,
      ...updates,
    });
  },

  deleteContact: async (params, client) =>
    client.mutation(api.contacts.remove, {
      id: params.contactId as Id<"contacts">,
    }),

  // ==========================================================================
  // REMINDER
  // ==========================================================================
  getReminders: async (params, client) =>
    client.query(api.reminders.getByUser, {
      status: params.status,
      clientId: params.clientId as Id<"clients"> | undefined,
      projectId: params.projectId as Id<"projects"> | undefined,
      startDate: params.startDate,
      endDate: params.endDate,
    }),

  getUpcomingReminders: async (params, client) =>
    client.query(api.reminders.getUpcoming, {
      days: params.days,
      limit: params.limit,
    }),

  createReminder: async (params, client) => {
    const validation = await parseAndValidateReminderParams(params, client);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid reminder parameters");
    }
    return client.mutation(api.reminders.create, {
      title: validation.validatedParams!.title,
      description: validation.validatedParams!.description,
      scheduledFor: validation.validatedParams!.scheduledFor,
      clientId: validation.validatedParams!.clientId as Id<"clients"> | undefined,
      projectId: validation.validatedParams!.projectId as Id<"projects"> | undefined,
      taskId: validation.validatedParams!.taskId as Id<"tasks"> | undefined,
    });
  },

  completeReminder: async (params, client) =>
    client.mutation(api.reminders.complete, {
      id: params.reminderId as Id<"reminders">,
    }),

  dismissReminder: async (params, client) =>
    client.mutation(api.reminders.dismiss, {
      id: params.reminderId as Id<"reminders">,
    }),

  // ==========================================================================
  // EVENT
  // ==========================================================================
  getEvents: async (params, client) =>
    client.query(api.events.list, {
      startDate: params.startDate,
      endDate: params.endDate,
      clientId: params.clientId as Id<"clients"> | undefined,
      projectId: params.projectId as Id<"projects"> | undefined,
    }),

  getNextEvent: async (_params, client) =>
    client.query(api.events.getNextEvent, {}),

  getUpcomingEvents: async (params, client) =>
    client.query(api.events.getUpcoming, {
      days: params.days,
      limit: params.limit,
    }),

  createEvent: async (params, client) =>
    client.mutation(api.events.create, {
      title: params.title,
      description: params.description,
      location: params.location,
      startTime: params.startTime,
      endTime: params.endTime,
      allDay: params.allDay,
      clientId: params.clientId as Id<"clients"> | undefined,
      projectId: params.projectId as Id<"projects"> | undefined,
    }),

  updateEvent: async (params, client) => {
    const { eventId, ...updates } = params;
    const updateData: any = { ...updates };
    if (updateData.clientId === null) updateData.clientId = undefined;
    if (updateData.projectId === null) updateData.projectId = undefined;
    return client.mutation(api.events.update, {
      id: eventId as Id<"events">,
      ...updateData,
    });
  },

  deleteEvent: async (params, client) =>
    client.mutation(api.events.remove, {
      id: params.eventId as Id<"events">,
    }),

  // ==========================================================================
  // KNOWLEDGE BANK
  // ==========================================================================
  getKnowledgeBank: async (params, client) => {
    if (params.clientId) {
      return client.query(api.knowledgeBank.getByClient, {
        clientId: params.clientId as Id<"clients">,
      });
    } else if (params.projectId) {
      return client.query(api.knowledgeBank.getByProject, {
        projectId: params.projectId as Id<"projects">,
      });
    }
    return [];
  },

  createKnowledgeBankEntry: async (params, client) =>
    client.mutation(api.knowledgeBank.createManual, {
      clientId: params.clientId as Id<"clients">,
      projectId: params.projectId as Id<"projects"> | undefined,
      title: params.title,
      content: params.content,
      entryType: params.entryType || "general",
      keyPoints: params.keyPoints
        ? typeof params.keyPoints === "string"
          ? params.keyPoints.split(",").map((k: string) => k.trim())
          : params.keyPoints
        : [],
      tags: params.tags
        ? typeof params.tags === "string"
          ? params.tags.split(",").map((t: string) => t.trim())
          : params.tags
        : [],
    }),

  getKnowledgeItems: async (params, client) => {
    if (params.clientId) {
      return client.query(api.knowledgeLibrary.getKnowledgeItemsByClient, {
        clientId: params.clientId as Id<"clients">,
      });
    } else if (params.projectId) {
      return client.query(api.knowledgeLibrary.getKnowledgeItemsByProject, {
        projectId: params.projectId as Id<"projects">,
      });
    }
    return [];
  },

  getKnowledgeStats: async (params, client) =>
    client.query(api.knowledgeLibrary.getKnowledgeStats, {
      clientId: params.clientId as Id<"clients">,
    }),

  // ==========================================================================
  // INTELLIGENCE
  // ==========================================================================
  getClientIntelligence: async (params, client) =>
    client.query(api.intelligence.getClientIntelligence, {
      clientId: params.clientId as Id<"clients">,
    }),

  getProjectIntelligence: async (params, client) =>
    client.query(api.intelligence.getProjectIntelligence, {
      projectId: params.projectId as Id<"projects">,
    }),

  searchLenders: async (params, client) =>
    client.query(api.intelligence.searchLenders, {
      dealSize: params.dealSize ? Number(params.dealSize) : undefined,
      propertyType: params.propertyType,
      loanType: params.loanType,
      region: params.region,
    }),

  updateClientIntelligence: async (params, client) => {
    const { clientId, ...updates } = params;
    return client.mutation(api.intelligence.updateClientIntelligence, {
      clientId: clientId as Id<"clients">,
      ...updates,
      updatedBy: "chat",
    });
  },

  updateProjectIntelligence: async (params, client) => {
    const { projectId, ...updates } = params;
    return client.mutation(api.intelligence.updateProjectIntelligence, {
      projectId: projectId as Id<"projects">,
      ...updates,
      updatedBy: "chat",
    });
  },

  addClientUpdate: async (params, client) =>
    client.mutation(api.intelligence.addClientUpdate, {
      clientId: params.clientId as Id<"clients">,
      update: params.update,
    }),

  addProjectUpdate: async (params, client) =>
    client.mutation(api.intelligence.addProjectUpdate, {
      projectId: params.projectId as Id<"projects">,
      update: params.update,
    }),

  addKnowledgeItem: async (params, client) =>
    client.mutation(api.knowledgeLibrary.addKnowledgeItem, {
      clientId: params.clientId
        ? (params.clientId as Id<"clients">)
        : undefined,
      projectId: params.projectId
        ? (params.projectId as Id<"projects">)
        : undefined,
      fieldPath: params.fieldPath,
      isCanonical: false,
      category: params.category,
      label: params.label,
      value: params.value,
      valueType: params.valueType,
      sourceType: "manual" as const,
      sourceText: params.sourceText,
    }),

  // ==========================================================================
  // INTERNAL DOCUMENT
  // ==========================================================================
  getInternalDocuments: async (params, client) =>
    client.query(api.internalDocuments.list, {
      linkedClientId: params.linkedClientId as Id<"clients"> | undefined,
      category: params.category,
      status: params.status,
    }),

  getInternalDocument: async (params, client) =>
    client.query(api.internalDocuments.get, {
      id: params.documentId as Id<"internalDocuments">,
    }),

  getInternalFolders: async (_params, client) =>
    client.query(api.internalDocuments.getFolders, {}),

  getInternalDocumentsByFolder: async (params, client) =>
    client.query(api.internalDocuments.getByFolder, {
      folderId: params.folderId as Id<"internalDocumentFolders">,
    }),

  createInternalDocument: async (params, client) =>
    client.mutation(api.internalDocuments.create, {
      fileName: params.fileName,
      fileSize: params.fileSize,
      fileType: params.fileType,
      summary: params.summary,
      category: params.category,
      fileTypeDetected: params.fileTypeDetected,
      reasoning: params.reasoning || "",
      confidence: params.confidence || 0,
      tokensUsed: params.tokensUsed || 0,
      linkedClientId: params.linkedClientId as Id<"clients"> | undefined,
    }),

  createInternalFolder: async (params, client) =>
    client.mutation(api.internalDocuments.createFolder, {
      name: params.name,
    }),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";

/**
 * Execute a tool by name with the given parameters.
 * Optionally accepts a pre-authenticated ConvexHttpClient.
 */
export async function executeTool(
  toolName: string,
  parameters: Record<string, any>,
  authenticatedClient?: ConvexHttpClient
): Promise<any> {
  const client = authenticatedClient || new ConvexHttpClient(convexUrl);

  const handler = handlers[toolName];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  try {
    return await handler(parameters, client);
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    throw error;
  }
}

/**
 * Check whether a handler exists for the given tool name.
 */
export function hasHandler(toolName: string): boolean {
  return toolName in handlers;
}
