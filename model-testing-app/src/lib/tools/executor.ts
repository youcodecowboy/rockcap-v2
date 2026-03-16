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

  deleteDocument: async (params, client) =>
    client.mutation(api.documents.remove, {
      id: params.documentId as Id<"documents">,
    }),

  // ==========================================================================
  // FOLDER
  // ==========================================================================
  mapCategoryToFolder: async (params, client) =>
    client.query(api.folderStructure.mapCategoryToFolder, {
      category: params.category,
      hasProject: params.hasProject,
    }),

  getProjectSubfolders: async (params, client) =>
    client.query(api.projects.getProjectSubfolders, {
      projectId: params.projectId as Id<"projects">,
      parentFolderId: params.parentFolderId as Id<"projectFolders"> | undefined,
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

  queryIntelligence: async (params, client) =>
    client.query(api.intelligence.queryIntelligence, {
      scope: params.scope,
      clientId: params.clientId as Id<"clients"> | undefined,
      projectId: params.projectId as Id<"projects"> | undefined,
      category: params.category,
      fieldName: params.fieldName,
      query: params.query,
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
      folderId: params.folderId as Id<"internalFolders">,
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

  // ==========================================================================
  // ANALYSIS (V4 Pipeline integration for chat)
  // ==========================================================================

  analyzeUploadedDocument: async (params, client) => {
    // 1. Get the file URL from Convex storage
    const fileUrl = await client.query(api.fileQueue.getFileUrl, {
      storageId: params.storageId as Id<"_storage">,
    });
    if (!fileUrl) {
      throw new Error("Could not get file URL from storage");
    }

    // 2. Fetch the file content
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error("Failed to download file from storage");
    }
    const fileBuffer = await fileResponse.arrayBuffer();

    // 3. Build client context for V4 pipeline
    const clientContext: any = {
      clientId: params.clientId,
      projectId: params.projectId,
    };
    if (params.clientId) {
      try {
        const clientData = await client.query(api.clients.get, {
          id: params.clientId as Id<"clients">,
        });
        if (clientData) {
          clientContext.clientName = clientData.name;
          clientContext.clientType = clientData.type;
        }
      } catch {}
    }

    // 4. Gather available folders for context-aware classification
    let availableFolders: any[] = [];
    if (params.clientId) {
      try {
        const folders = await client.query(api.clients.getClientFolders, {
          clientId: params.clientId as Id<"clients">,
        });
        if (folders) {
          availableFolders = folders.map((f: any) => ({
            folderKey: f.folderType || f.name,
            name: f.name,
            level: "client" as const,
          }));
        }
      } catch {}
    }
    if (params.projectId) {
      try {
        const folders = await client.query(api.projects.getProjectFolders, {
          projectId: params.projectId as Id<"projects">,
        });
        if (folders) {
          availableFolders.push(
            ...folders.map((f: any) => ({
              folderKey: f.folderType || f.name,
              name: f.name,
              level: "project" as const,
            }))
          );
        }
      } catch {}
    }

    // 5. Gather checklist items for matching
    let checklistItems: any[] = [];
    if (params.clientId) {
      try {
        const items = await client.query(api.knowledgeLibrary.getChecklistByClient, {
          clientId: params.clientId as Id<"clients">,
        });
        if (items) {
          checklistItems = items
            .filter((item: any) => item.status === "missing" || item.status === "pending_review")
            .map((item: any) => ({
              id: item._id,
              name: item.label || item.name,
              category: item.category,
              status: item.status,
            }));
        }
      } catch {}
    }

    // 6. Run V4 pipeline
    const { classifySingleDocument } = await import("@/v4/lib/pipeline");
    const { DEFAULT_V4_CONFIG } = await import("@/v4/types");

    const apiKey = process.env.ANTHROPIC_API_KEY || "";
    const config = {
      ...DEFAULT_V4_CONFIG,
      anthropicApiKey: apiKey,
      useMock: !apiKey,
    };

    const fileObj = {
      name: params.fileName,
      size: fileBuffer.byteLength,
      type: params.fileType,
      arrayBuffer: async () => fileBuffer,
    };

    const classification = await classifySingleDocument(
      fileObj,
      undefined,
      clientContext,
      availableFolders,
      checklistItems,
      config,
    );

    if (!classification) {
      throw new Error("V4 pipeline returned no classification");
    }

    // 7. Return structured results for Claude to present
    return {
      fileName: params.fileName,
      storageId: params.storageId,
      fileType: classification.classification.fileType,
      category: classification.classification.category,
      confidence: classification.classification.confidence,
      suggestedFolder: classification.classification.suggestedFolder,
      reasoning: classification.classification.reasoning,
      executiveSummary: classification.summary?.executiveSummary || "",
      documentPurpose: classification.summary?.documentPurpose || "",
      keyEntities: classification.summary?.keyEntities || {},
      keyDates: classification.summary?.keyDates || [],
      keyAmounts: classification.summary?.keyAmounts || [],
      checklistMatches: classification.checklistMatches || [],
      intelligenceFields: classification.intelligenceFields || [],
    };
  },

  reanalyzeDocument: async (params, client) => {
    // 1. Get the existing document
    const doc = await client.query(api.documents.get, {
      id: params.documentId as Id<"documents">,
    });
    if (!doc) throw new Error("Document not found");
    if (!doc.fileStorageId) throw new Error("Document has no file attached — cannot re-analyze");

    // 2. Re-use analyzeUploadedDocument handler with the document's storageId
    const analysisResult = await handlers.analyzeUploadedDocument(
      {
        storageId: doc.fileStorageId,
        fileName: doc.fileName,
        fileType: doc.fileType,
        clientId: doc.clientId,
        projectId: doc.projectId,
      },
      client
    );

    // 3. Update the document with new analysis results
    const updateArgs: any = {
      id: params.documentId as Id<"documents">,
    };
    if (analysisResult.category) updateArgs.category = analysisResult.category;
    if (analysisResult.fileType) updateArgs.fileTypeDetected = analysisResult.fileType;
    if (analysisResult.executiveSummary) updateArgs.summary = analysisResult.executiveSummary;
    if (analysisResult.confidence) updateArgs.confidence = analysisResult.confidence;

    await client.mutation(api.documents.update, updateArgs);

    return {
      documentId: params.documentId,
      previousType: doc.fileTypeDetected,
      ...analysisResult,
      updated: true,
    };
  },

  // ==========================================================================
  // MEETINGS
  // ==========================================================================
  getMeetingsByClient: async (params, client) =>
    client.query(api.meetings.getByClient, {
      clientId: params.clientId as Id<"clients">,
      limit: params.limit ? parseInt(params.limit, 10) : undefined,
    }),

  getMeetingsByProject: async (params, client) =>
    client.query(api.meetings.getByProject, {
      projectId: params.projectId as Id<"projects">,
      limit: params.limit ? parseInt(params.limit, 10) : undefined,
    }),

  getMeeting: async (params, client) =>
    client.query(api.meetings.get, {
      meetingId: params.meetingId as Id<"meetings">,
    }),

  getMeetingCount: async (params, client) =>
    client.query(api.meetings.getCountByClient, {
      clientId: params.clientId as Id<"clients">,
    }),

  getPendingActionItems: async (params, client) =>
    client.query(api.meetings.getPendingActionItemsCount, {
      clientId: params.clientId as Id<"clients">,
    }),

  createMeeting: async (params, client) => {
    const now = new Date().toISOString();
    const parseJsonArray = (val: any) => {
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try { return JSON.parse(val); } catch { return []; }
      }
      return [];
    };

    return client.mutation(api.meetings.create, {
      clientId: params.clientId as Id<"clients">,
      projectId: params.projectId ? (params.projectId as Id<"projects">) : undefined,
      title: params.title,
      meetingDate: params.meetingDate,
      meetingType: params.meetingType,
      summary: params.summary,
      keyPoints: parseJsonArray(params.keyPoints),
      decisions: parseJsonArray(params.decisions),
      actionItems: parseJsonArray(params.actionItems).map((item: any, i: number) => ({
        id: item.id || `action-${i + 1}`,
        description: item.description || "",
        assignee: item.assignee,
        dueDate: item.dueDate,
        status: item.status || "pending",
        createdAt: item.createdAt || now,
      })),
      attendees: parseJsonArray(params.attendees).map((a: any) => ({
        name: a.name || "Unknown",
        role: a.role,
        company: a.company,
      })),
      notes: params.notes,
    });
  },

  updateMeeting: async (params, client) =>
    client.mutation(api.meetings.update, {
      meetingId: params.meetingId as Id<"meetings">,
      title: params.title,
      meetingDate: params.meetingDate,
      meetingType: params.meetingType,
      summary: params.summary,
      notes: params.notes,
    }),

  updateActionItemStatus: async (params, client) =>
    client.mutation(api.meetings.updateActionItemStatus, {
      meetingId: params.meetingId as Id<"meetings">,
      actionItemId: params.actionItemId,
      status: params.status,
    }),

  extractMeetingFromText: async (params, _client) => {
    // Call the meeting-extract API route which uses Claude Haiku 4.5
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const response = await fetch(`${baseUrl}/api/meeting-extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: params.clientId,
        projectId: params.projectId,
        content: params.content,
        documentName: params.documentName,
        save: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Meeting extraction failed");
    }

    const result = await response.json();
    return {
      meetingId: result.meetingId,
      extraction: result.extraction,
      message: `Created meeting "${result.extraction.title}" with ${result.extraction.actionItems.length} action items and ${result.extraction.attendees.length} attendees.`,
    };
  },

  verifyMeeting: async (params, client) =>
    client.mutation(api.meetings.verifyMeeting, {
      meetingId: params.meetingId as Id<"meetings">,
    }),

  deleteMeeting: async (params, client) =>
    client.mutation(api.meetings.deleteMeeting, {
      meetingId: params.meetingId as Id<"meetings">,
    }),

  // ==========================================================================
  // FLAG
  // ==========================================================================
  getFlags: async (params, client) =>
    client.query(api.flags.getByEntity, {
      entityType: params.entityType,
      entityId: params.entityId,
    }),

  getFlagThread: async (params, client) =>
    client.query(api.flags.getThread, {
      flagId: params.flagId as Id<"flags">,
    }),

  createFlag: async (params, client) =>
    client.mutation(api.flags.create, {
      entityType: params.entityType,
      entityId: params.entityId,
      assignedTo: params.assignedTo ? (params.assignedTo as Id<"users">) : undefined,
      note: params.note,
      priority: params.priority,
      clientId: params.clientId ? (params.clientId as Id<"clients">) : undefined,
      projectId: params.projectId ? (params.projectId as Id<"projects">) : undefined,
    }),

  replyToFlag: async (params, client) =>
    client.mutation(api.flags.reply, {
      flagId: params.flagId as Id<"flags">,
      content: params.content,
      resolve: params.resolve,
    }),

  resolveFlag: async (params, client) =>
    client.mutation(api.flags.resolve, {
      id: params.flagId as Id<"flags">,
    }),

  deleteFlag: async (params, client) =>
    client.mutation(api.flags.remove, {
      id: params.flagId as Id<"flags">,
    }),

  // ==========================================================================
  // ANALYSIS / FILING
  // ==========================================================================
  saveChatDocument: async (params, client) => {
    // Convex IDs are lowercase alphanumeric, 20+ chars — validate before passing
    const isConvexId = (v: unknown) =>
      typeof v === "string" && /^[a-z0-9]{20,}$/i.test(v);

    // Create the document record using the existing documents.create mutation
    const createArgs: any = {
      fileName: params.fileName,
      fileSize: params.fileSize || 0,
      fileType: params.fileType || "application/octet-stream",
      summary: params.summary,
      fileTypeDetected: params.fileTypeDetected,
      category: params.category,
      confidence: params.confidence,
      status: "completed" as const,
    };

    // Only pass ID fields if they're actual Convex IDs (not entity names)
    if (isConvexId(params.storageId)) {
      createArgs.fileStorageId = params.storageId as Id<"_storage">;
    }
    if (isConvexId(params.clientId)) {
      createArgs.clientId = params.clientId as Id<"clients">;
    }
    if (isConvexId(params.projectId)) {
      createArgs.projectId = params.projectId as Id<"projects">;
    }
    if (params.folderId) {
      createArgs.folderId = params.folderId;
    }
    if (params.folderType) {
      createArgs.folderType = params.folderType;
    }
    if (params.classificationReasoning) {
      createArgs.classificationReasoning = params.classificationReasoning;
    }

    const documentId = await client.mutation(api.documents.create, createArgs);

    // Auto-suggest checklist matches for the newly filed document
    if (isConvexId(params.clientId) && params.fileTypeDetected && params.category) {
      try {
        await client.mutation(api.knowledgeLibrary.suggestDocumentMatches, {
          clientId: params.clientId as Id<"clients">,
          documentId: documentId as Id<"documents">,
          documentType: params.fileTypeDetected,
          category: params.category,
        });
      } catch (err) {
        console.error("[saveChatDocument] Checklist suggestion failed:", err);
        // Don't fail the filing if checklist suggestion fails
      }
    }

    return documentId;
  },

  // Deep reclassify — handled by dedicated module
  reclassify: async (params, client) => {
    const { handleReclassify } = await import('../chat/reclassify');
    const result = await handleReclassify(params as any, client);
    const lines: string[] = [];
    if (result.found) {
      lines.push(`Found: ${result.answer}`);
      if (result.evidence?.quote) lines.push(`Source: "${result.evidence.quote}"`);
    } else {
      lines.push(`Did not find the specific answer in ${result.documentName}.`);
    }
    if (result.newFields.length > 0) {
      lines.push(`\nExtracted ${result.newFields.length} new data points saved to intelligence:`);
      for (const f of result.newFields) {
        lines.push(`- ${f.label}: ${f.value} (${Math.round(f.confidence * 100)}% confidence)`);
      }
    }
    return lines.join('\n');
  },

  // ==========================================================================
  // FINANCIAL (analysis tools — compose existing Convex queries)
  // ==========================================================================

  getFinancialSummary: async (params, client) => {
    const items = await client.query(
      api.knowledgeLibrary.getKnowledgeItemsByProject,
      { projectId: params.projectId as Id<"projects"> }
    );

    // Financial field path prefixes
    const sections: Record<string, { label: string; prefixes: string[] }> = {
      dealEconomics: {
        label: 'Deal Economics',
        prefixes: ['financials.'],
      },
      loanTerms: {
        label: 'Loan Terms',
        prefixes: ['loanTerms.', 'loan.'],
      },
      valuation: {
        label: 'Valuation',
        prefixes: ['valuation.'],
      },
      construction: {
        label: 'Construction',
        prefixes: ['construction.'],
      },
      exit: {
        label: 'Exit / Sales',
        prefixes: ['exit.'],
      },
    };

    const lines: string[] = ['# Financial Summary\n'];

    for (const [, section] of Object.entries(sections)) {
      const sectionItems = items.filter((item: any) =>
        item.status === 'active' &&
        section.prefixes.some((p: string) => item.fieldPath.startsWith(p))
      );

      lines.push(`## ${section.label}`);
      if (sectionItems.length === 0) {
        lines.push('No data yet.\n');
        continue;
      }

      for (const item of sectionItems) {
        const conf = item.normalizationConfidence
          ? ` (${Math.round(item.normalizationConfidence * 100)}% confidence)`
          : '';
        const displayValue = typeof item.value === 'object'
          ? JSON.stringify(item.value)
          : String(item.value);
        lines.push(`- ${item.label}: ${displayValue}${conf}`);
      }
      lines.push('');
    }

    // Count totals
    const financialItems = items.filter((item: any) =>
      item.status === 'active' &&
      Object.values(sections).some(s =>
        s.prefixes.some(p => item.fieldPath.startsWith(p))
      )
    );
    lines.push(`---\n${financialItems.length} financial data points across ${Object.keys(sections).length} sections.`);

    return lines.join('\n');
  },

  assessDealMetrics: async (params, client) => {
    const items = await client.query(
      api.knowledgeLibrary.getKnowledgeItemsByProject,
      { projectId: params.projectId as Id<"projects"> }
    );

    // Build lookup: fieldPath → numeric value
    const lookup = new Map<string, number>();
    for (const item of items) {
      if ((item as any).status !== 'active') continue;
      const val = parseFloat(String((item as any).value));
      if (!isNaN(val)) {
        lookup.set((item as any).fieldPath, val);
      }
    }

    // Helper to find a value by checking multiple possible field paths
    const find = (...paths: string[]): number | null => {
      for (const p of paths) {
        const val = lookup.get(p);
        if (val !== undefined) return val;
      }
      return null;
    };

    const loanAmount = find('financials.loanAmount', 'loanTerms.facilityAmount', 'loan.amount');
    const marketValue = find('valuation.marketValue', 'financials.currentValue', 'valuation.dayOneValue');
    const gdv = find('financials.gdv', 'valuation.gdv', 'project.gdv');
    const tdc = find('financials.totalDevelopmentCost', 'project.totalDevelopmentCost');
    const constructionCost = find('financials.constructionCost', 'construction.contractSum');
    const totalSqFt = find('development.totalSqFt');
    const interestRate = find('loanTerms.interestRate', 'loan.interestRate');
    const termMonths = find('loanTerms.termMonths');

    interface Metric {
      name: string;
      value: string;
      status: 'ok' | 'warning' | 'missing';
      note: string;
    }

    const metrics: Metric[] = [];

    // LTV
    if (loanAmount !== null && marketValue !== null && marketValue > 0) {
      const ltv = (loanAmount / marketValue) * 100;
      metrics.push({
        name: 'LTV (Loan-to-Value)',
        value: `${ltv.toFixed(1)}%`,
        status: ltv > 70 ? 'warning' : 'ok',
        note: ltv > 70
          ? `Above typical 65-70% senior threshold — may require mezzanine or additional equity`
          : `Within normal senior debt range (55-70%)`,
      });
    } else {
      metrics.push({
        name: 'LTV (Loan-to-Value)',
        value: 'N/A',
        status: 'missing',
        note: `Need: ${!loanAmount ? 'loan amount' : ''}${!loanAmount && !marketValue ? ' + ' : ''}${!marketValue ? 'market value/day-one value' : ''}`,
      });
    }

    // LTGDV
    if (loanAmount !== null && gdv !== null && gdv > 0) {
      const ltgdv = (loanAmount / gdv) * 100;
      metrics.push({
        name: 'LTGDV (Loan-to-GDV)',
        value: `${ltgdv.toFixed(1)}%`,
        status: ltgdv > 65 ? 'warning' : 'ok',
        note: ltgdv > 65
          ? `Above typical 50-65% senior range — higher risk exposure`
          : `Within normal range (50-65%)`,
      });
    } else {
      metrics.push({
        name: 'LTGDV (Loan-to-GDV)',
        value: 'N/A',
        status: 'missing',
        note: `Need: ${!loanAmount ? 'loan amount' : ''}${!loanAmount && !gdv ? ' + ' : ''}${!gdv ? 'GDV' : ''}`,
      });
    }

    // LTC
    if (loanAmount !== null && tdc !== null && tdc > 0) {
      const ltc = (loanAmount / tdc) * 100;
      metrics.push({
        name: 'LTC (Loan-to-Cost)',
        value: `${ltc.toFixed(1)}%`,
        status: ltc > 85 ? 'warning' : 'ok',
        note: ltc > 85
          ? `High leverage — typical range is 65-80%`
          : `Within normal range (65-80%)`,
      });
    } else {
      metrics.push({
        name: 'LTC (Loan-to-Cost)',
        value: 'N/A',
        status: 'missing',
        note: `Need: ${!loanAmount ? 'loan amount' : ''}${!loanAmount && !tdc ? ' + ' : ''}${!tdc ? 'total development cost' : ''}`,
      });
    }

    // Profit on Cost
    if (gdv !== null && tdc !== null && tdc > 0) {
      const poc = ((gdv - tdc) / tdc) * 100;
      metrics.push({
        name: 'Profit on Cost',
        value: `${poc.toFixed(1)}%`,
        status: poc < 15 ? 'warning' : 'ok',
        note: poc < 15
          ? `Below typical 15-25% for residential development — thin margin`
          : `Within normal range (15-25% residential)`,
      });
    } else {
      metrics.push({
        name: 'Profit on Cost',
        value: 'N/A',
        status: 'missing',
        note: `Need: ${!gdv ? 'GDV' : ''}${!gdv && !tdc ? ' + ' : ''}${!tdc ? 'total development cost' : ''}`,
      });
    }

    // Profit on GDV
    if (gdv !== null && tdc !== null && gdv > 0) {
      const pog = ((gdv - tdc) / gdv) * 100;
      metrics.push({
        name: 'Profit on GDV',
        value: `${pog.toFixed(1)}%`,
        status: pog < 12 ? 'warning' : 'ok',
        note: pog < 12
          ? `Below typical 15-20% — limited buffer for cost overruns`
          : `Within normal range (15-20%)`,
      });
    } else {
      metrics.push({
        name: 'Profit on GDV',
        value: 'N/A',
        status: 'missing',
        note: `Need: GDV + total development cost`,
      });
    }

    // Build cost per sq ft
    if (constructionCost !== null && totalSqFt !== null && totalSqFt > 0) {
      const costPerSqFt = constructionCost / totalSqFt;
      metrics.push({
        name: 'Build Cost per sq ft',
        value: `£${Math.round(costPerSqFt).toLocaleString('en-GB')}`,
        status: costPerSqFt > 300 || costPerSqFt < 100 ? 'warning' : 'ok',
        note: costPerSqFt > 300
          ? `Above typical £150-250/sqft for residential — verify scope`
          : costPerSqFt < 100
            ? `Below typical range — may indicate incomplete cost data`
            : `Within typical residential range (£150-250/sqft)`,
      });
    } else {
      metrics.push({
        name: 'Build Cost per sq ft',
        value: 'N/A',
        status: 'missing',
        note: `Need: ${!constructionCost ? 'construction cost' : ''}${!constructionCost && !totalSqFt ? ' + ' : ''}${!totalSqFt ? 'total sq ft' : ''}`,
      });
    }

    // Annualized interest cost
    if (loanAmount !== null && interestRate !== null) {
      const annualInterest = loanAmount * (interestRate / 100);
      const totalInterest = termMonths
        ? annualInterest * (termMonths / 12)
        : annualInterest;
      const termLabel = termMonths ? `over ${termMonths} months` : 'per annum';
      metrics.push({
        name: 'Interest Cost',
        value: `£${Math.round(totalInterest).toLocaleString('en-GB')} ${termLabel}`,
        status: interestRate > 15 ? 'warning' : 'ok',
        note: `Rate: ${interestRate}%${interestRate > 12 ? ' — above typical SONIA + 5-9% range' : ''}`,
      });
    }

    // Format output
    const lines: string[] = ['# Deal Metrics Assessment\n'];
    const warnings = metrics.filter(m => m.status === 'warning');
    const ok = metrics.filter(m => m.status === 'ok');
    const missing = metrics.filter(m => m.status === 'missing');

    if (warnings.length > 0) {
      lines.push(`⚠ ${warnings.length} metric(s) flagged:\n`);
      for (const m of warnings) {
        lines.push(`**${m.name}: ${m.value}**`);
        lines.push(`  ${m.note}\n`);
      }
    }

    if (ok.length > 0) {
      lines.push(`✓ ${ok.length} metric(s) within normal range:\n`);
      for (const m of ok) {
        lines.push(`${m.name}: ${m.value}`);
        lines.push(`  ${m.note}\n`);
      }
    }

    if (missing.length > 0) {
      lines.push(`○ ${missing.length} metric(s) cannot be calculated:\n`);
      for (const m of missing) {
        lines.push(`${m.name}: ${m.note}\n`);
      }
    }

    return lines.join('\n');
  },

  compareDocumentValues: async (params, client) => {
    // Get ALL knowledge items for the project (including superseded for history)
    const activeItems = await client.query(
      api.knowledgeLibrary.getKnowledgeItemsByProject,
      { projectId: params.projectId as Id<"projects"> }
    );
    const supersededItems = await client.query(
      api.knowledgeLibrary.getKnowledgeItemsByProject,
      { projectId: params.projectId as Id<"projects">, status: 'superseded' as any }
    );
    const allItems = [...activeItems, ...supersededItems];

    // Find matching items by fieldPath or fuzzy fieldName
    let matches = allItems.filter((item: any) =>
      params.fieldPath && item.fieldPath === params.fieldPath
    );

    // Fallback to fuzzy match on label/fieldPath if no exact matches
    if (matches.length === 0 && params.fieldName) {
      const search = params.fieldName.toLowerCase();
      matches = allItems.filter((item: any) =>
        item.label?.toLowerCase().includes(search) ||
        item.fieldPath?.toLowerCase().includes(search)
      );
    }

    if (matches.length === 0) {
      return `No data found for ${params.fieldPath || params.fieldName}. Use getFinancialSummary to see available fields.`;
    }

    // Group by source document
    const bySource = new Map<string, any[]>();
    for (const item of matches) {
      const docId = (item as any).sourceDocumentId || 'unknown';
      if (!bySource.has(docId)) bySource.set(docId, []);
      bySource.get(docId)!.push(item);
    }

    // Get document names for each source
    const docNames = new Map<string, string>();
    for (const docId of bySource.keys()) {
      if (docId === 'unknown') {
        docNames.set(docId, 'Unknown source');
        continue;
      }
      try {
        const doc = await client.query(api.documents.get, { id: docId as any });
        docNames.set(docId, doc?.fileName || doc?.fileTypeDetected || 'Unknown');
      } catch {
        docNames.set(docId, docId);
      }
    }

    const fieldLabel = matches[0]?.label || params.fieldPath || params.fieldName;
    const lines: string[] = [`# ${fieldLabel} — Cross-Document Comparison\n`];

    // Collect numeric values for variance calculation
    const numericValues: { value: number; source: string }[] = [];

    for (const [docId, docItems] of bySource) {
      const docName = docNames.get(docId) || docId;
      // Pick the most recent/highest confidence item per source
      const best = docItems.sort((a: any, b: any) =>
        (b.normalizationConfidence || 0) - (a.normalizationConfidence || 0)
      )[0];

      const conf = best.normalizationConfidence
        ? ` [confidence: ${(best.normalizationConfidence * 100).toFixed(0)}%]`
        : '';
      const status = best.status !== 'active' ? ` (${best.status})` : '';
      const displayValue = typeof best.value === 'object'
        ? JSON.stringify(best.value)
        : String(best.value);

      lines.push(`- **${docName}**: ${displayValue}${conf}${status}`);

      const numVal = parseFloat(String(best.value));
      if (!isNaN(numVal)) {
        numericValues.push({ value: numVal, source: docName });
      }
    }

    // Calculate variance if we have multiple numeric values
    if (numericValues.length >= 2) {
      const values = numericValues.map(v => v.value);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const variance = max - min;
      const variancePct = min > 0 ? (variance / min) * 100 : 0;

      lines.push('');
      if (variancePct > 5) {
        const maxSource = numericValues.find(v => v.value === max)!.source;
        const minSource = numericValues.find(v => v.value === min)!.source;
        lines.push(`⚠ **Variance: £${variance.toLocaleString('en-GB')} (${variancePct.toFixed(1)}%)**`);
        lines.push(`  Highest: ${maxSource} — Lowest: ${minSource}`);
        lines.push(`  Discrepancy exceeds 5% threshold — recommend investigation.`);
      } else {
        lines.push(`✓ Values are consistent (variance: ${variancePct.toFixed(1)}%).`);
      }
    }

    return lines.join('\n');
  },
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
