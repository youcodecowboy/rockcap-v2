import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";

// Mutation: Create a new queue job
export const createJob = mutation({
  args: {
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    userId: v.optional(v.id("users")),
    hasCustomInstructions: v.optional(v.boolean()),
    forceExtraction: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Capture authenticated user ID if not provided
    let userId = args.userId;
    if (!userId) {
      try {
        const user = await getAuthenticatedUser(ctx);
        userId = user._id; // Store Convex user ID as string
        console.log('[fileQueue.createJob] Captured userId:', userId);
      } catch (error) {
        // If user is not authenticated, userId will remain undefined
        // This allows for backward compatibility
        console.log('[fileQueue.createJob] Failed to get authenticated user:', error);
      }
    }
    
    const jobId = await ctx.db.insert("fileUploadQueue", {
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileType: args.fileType,
      status: "pending",
      progress: 0,
      isRead: false,
      userId: userId,
      hasCustomInstructions: args.hasCustomInstructions || false,
      forceExtraction: args.forceExtraction || false,
      createdAt: now,
      updatedAt: now,
    });
    return jobId;
  },
});

// Mutation: Update job status and progress
export const updateJobStatus = mutation({
  args: {
    jobId: v.id("fileUploadQueue"),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("analyzing"),
      v.literal("completed"),
      v.literal("error"),
      v.literal("needs_confirmation")
    )),
    progress: v.optional(v.number()),
    fileStorageId: v.optional(v.id("_storage")),
    analysisResult: v.optional(v.any()),
    documentId: v.optional(v.id("documents")),
    error: v.optional(v.string()),
    customInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { jobId, ...updates } = args;
    const existing = await ctx.db.get(jobId);
    if (!existing) {
      throw new Error("Job not found");
    }
    
    await ctx.db.patch(jobId, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return jobId;
  },
});

// Query: Get jobs by status
export const getJobs = query({
  args: {
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("analyzing"),
      v.literal("completed"),
      v.literal("error"),
      v.literal("needs_confirmation")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let jobs;
    
    if (args.status) {
      jobs = await ctx.db
        .query("fileUploadQueue")
        .withIndex("by_status", (q: any) => q.eq("status", args.status!))
        .collect();
    } else {
      jobs = await ctx.db.query("fileUploadQueue").collect();
    }
    // If no status filter, query all and sort in memory
    
    // Sort by createdAt descending (most recent first)
    const sorted = jobs.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    if (args.limit) {
      return sorted.slice(0, args.limit);
    }
    
    return sorted;
  },
});

// Query: Get single job by ID
export const getJob = query({
  args: { jobId: v.id("fileUploadQueue") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

// Query: Get file URL from storage ID
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Query: Get recent jobs for notification dropdown (last 20)
export const getRecentJobs = query({
  args: {
    includeRead: v.optional(v.boolean()), // Include read notifications
  },
  handler: async (ctx, args) => {
    // Query all jobs (no index needed for full table scan)
    const allJobs = await ctx.db
      .query("fileUploadQueue")
      .collect();
    
    // Sort by createdAt descending
    const sorted = allJobs.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Filter out read notifications if includeRead is false
    const filtered = args.includeRead === false
      ? sorted.filter(job => !job.isRead)
      : sorted;
    
    // Return last 20
    return filtered.slice(0, 20);
  },
});

// Query: Get unread count
export const getUnreadCount = query({
  handler: async (ctx) => {
    const allJobs = await ctx.db.query("fileUploadQueue").collect();
    return allJobs.filter(job => !job.isRead && 
      (job.status === "completed" || job.status === "needs_confirmation" || job.status === "error")
    ).length;
  },
});

// Mutation: Mark job as read
export const markAsRead = mutation({
  args: { jobId: v.id("fileUploadQueue") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.jobId);
    if (!existing) {
      throw new Error("Job not found");
    }
    
    await ctx.db.patch(args.jobId, {
      isRead: true,
      updatedAt: new Date().toISOString(),
    });
    return args.jobId;
  },
});

// Mutation: Mark all as read
export const markAllAsRead = mutation({
  handler: async (ctx) => {
    const allJobs = await ctx.db.query("fileUploadQueue").collect();
    const unreadJobs = allJobs.filter(job => !job.isRead);
    
    for (const job of unreadJobs) {
      await ctx.db.patch(job._id, {
        isRead: true,
        updatedAt: new Date().toISOString(),
      });
    }
    
    return unreadJobs.length;
  },
});

// Mutation: Delete job (cleanup)
export const deleteJob = mutation({
  args: { jobId: v.id("fileUploadQueue") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.jobId);
  },
});

// Query: Get pending jobs (for processing)
export const getPendingJobs = query({
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("fileUploadQueue")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .collect();
    
    // Sort by createdAt ascending (oldest first for FIFO processing)
    return pending.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  },
});

// Query: Get jobs needing review with navigation support
export const getReviewQueueWithNav = query({
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("fileUploadQueue")
      .withIndex("by_status", (q: any) => q.eq("status", "needs_confirmation"))
      .collect();
    
    // Sort by createdAt descending (newest first)
    const sortedJobs = jobs.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    return {
      jobs: sortedJobs,
      total: sortedJobs.length,
    };
  },
});

// Mutation: File a document from the queue
export const fileDocument = mutation({
  args: {
    jobId: v.id("fileUploadQueue"),
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    folderId: v.string(),
    folderType: v.union(v.literal("client"), v.literal("project")),
    summary: v.optional(v.string()),
    category: v.optional(v.string()),
    fileTypeDetected: v.optional(v.string()),
    // Knowledge Library checklist linking
    checklistItemIds: v.optional(v.array(v.id("knowledgeChecklistItems"))),
    userId: v.optional(v.id("users")),
    // Pre-extracted intelligence from bulk-analyze (Sprint 4+)
    extractedIntelligence: v.optional(v.object({
      fields: v.array(v.object({
        fieldPath: v.string(),
        label: v.string(),
        category: v.string(),
        value: v.any(),
        valueType: v.union(
          v.literal("string"),
          v.literal("number"),
          v.literal("currency"),
          v.literal("date"),
          v.literal("percentage"),
          v.literal("array"),
          v.literal("text"),
          v.literal("boolean")
        ),
        isCanonical: v.boolean(),
        confidence: v.number(),
        sourceText: v.optional(v.string()),
        originalLabel: v.optional(v.string()),
        matchedAlias: v.optional(v.string()),
        templateTags: v.optional(v.array(v.string())),
        pageReference: v.optional(v.string()),
        scope: v.optional(v.string()),
      })),
      insights: v.optional(v.object({
        keyFindings: v.optional(v.array(v.string())),
        risks: v.optional(v.array(v.object({
          risk: v.string(),
          severity: v.optional(v.string()),
        }))),
      })),
    })),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }
    
    if (!job.documentId) {
      throw new Error("Job has no associated document");
    }

    // ============================================================================
    // VALIDATION: Ensure filing data integrity
    // ============================================================================

    // 1. Validate client exists
    const client = await ctx.db.get(args.clientId);
    if (!client) {
      throw new Error("Client not found");
    }

    // 2. Validate projectId-clientId relationship (if project provided)
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) {
        throw new Error("Project not found");
      }

      // Check project belongs to client
      const belongsToClient = project.clientRoles.some(
        (cr: { clientId: any }) => cr.clientId === args.clientId
      );
      if (!belongsToClient) {
        throw new Error("Project does not belong to this client");
      }
    }

    // 3. Validate folderType-projectId logic
    if (args.folderType === "project" && !args.projectId) {
      throw new Error("Project folder requires a projectId");
    }

    // 4. Validate folderId exists in correct folder table
    if (args.folderType === "project" && args.projectId) {
      const projectFolder = await ctx.db
        .query("projectFolders")
        .withIndex("by_project_type", (q: any) =>
          q.eq("projectId", args.projectId).eq("folderType", args.folderId)
        )
        .first();
      if (!projectFolder) {
        throw new Error(`Folder "${args.folderId}" does not exist for this project`);
      }
    } else if (args.folderType === "client") {
      const clientFolder = await ctx.db
        .query("clientFolders")
        .withIndex("by_client_type", (q: any) =>
          q.eq("clientId", args.clientId).eq("folderType", args.folderId)
        )
        .first();
      if (!clientFolder) {
        throw new Error(`Folder "${args.folderId}" does not exist for this client`);
      }
    }

    // ============================================================================
    // Update the document with filing info
    await ctx.db.patch(job.documentId, {
      clientId: args.clientId,
      projectId: args.projectId,
      folderId: args.folderId,
      folderType: args.folderType,
      ...(args.summary && { summary: args.summary }),
      ...(args.category && { category: args.category }),
      ...(args.fileTypeDetected && { fileTypeDetected: args.fileTypeDetected }),
    });
    
    // Link to checklist items if any were selected
    const linkedItems: string[] = [];
    for (const itemId of args.checklistItemIds || []) {
      // Check if link already exists
      const existingLink = await ctx.db
        .query("knowledgeChecklistDocumentLinks")
        .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", itemId))
        .filter((q) => q.eq(q.field("documentId"), job.documentId))
        .first();
      
      if (existingLink) {
        linkedItems.push(itemId);
        continue;
      }
      
      // Check if this is the first link (will be primary)
      const existingLinks = await ctx.db
        .query("knowledgeChecklistDocumentLinks")
        .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", itemId))
        .collect();
      
      const isPrimary = existingLinks.length === 0;
      
      // Create the link
      await ctx.db.insert("knowledgeChecklistDocumentLinks", {
        checklistItemId: itemId,
        documentId: job.documentId,
        documentName: job.fileName,
        linkedAt: now,
        linkedBy: args.userId,
        isPrimary,
      });
      
      // If first link, mark checklist item as fulfilled
      if (isPrimary) {
        await ctx.db.patch(itemId, {
          status: "fulfilled",
          suggestedDocumentId: undefined,
          suggestedDocumentName: undefined,
          suggestedConfidence: undefined,
          updatedAt: now,
        });
      }
      
      linkedItems.push(itemId);
    }

    // ============================================================================
    // SAVE PRE-EXTRACTED INTELLIGENCE (Sprint 4+)
    // ============================================================================
    let intelligenceSaved = 0;
    if (args.extractedIntelligence && args.extractedIntelligence.fields.length > 0) {
      console.log(`[fileDocument] Saving ${args.extractedIntelligence.fields.length} pre-extracted intelligence fields`);

      for (const field of args.extractedIntelligence.fields) {
        try {
          // Check if this field path already exists for this client/project
          let existingItem = null;
          if (args.projectId) {
            existingItem = await ctx.db
              .query("knowledgeItems")
              .withIndex("by_project_field", (q) =>
                q.eq("projectId", args.projectId).eq("fieldPath", field.fieldPath)
              )
              .filter((q) => q.eq(q.field("status"), "active"))
              .first();
          } else {
            existingItem = await ctx.db
              .query("knowledgeItems")
              .withIndex("by_client_field", (q) =>
                q.eq("clientId", args.clientId).eq("fieldPath", field.fieldPath)
              )
              .filter((q) => q.eq(q.field("status"), "active"))
              .first();
          }

          if (existingItem) {
            // If new value is different, check confidence - higher confidence wins
            if (
              JSON.stringify(existingItem.value) !== JSON.stringify(field.value) &&
              field.confidence > (existingItem.normalizationConfidence || 0.5)
            ) {
              // Create new item first
              const newItemId = await ctx.db.insert("knowledgeItems", {
                clientId: args.projectId ? undefined : args.clientId,
                projectId: args.projectId,
                fieldPath: field.fieldPath,
                isCanonical: field.isCanonical,
                category: field.category,
                label: field.label,
                value: field.value,
                valueType: field.valueType,
                status: "active",
                sourceType: "ai_extraction",
                sourceDocumentId: job.documentId,
                sourceDocumentName: job.fileName,
                sourceText: field.sourceText,
                originalLabel: field.originalLabel,
                matchedAlias: field.matchedAlias,
                normalizationConfidence: field.confidence,
                addedAt: now,
                updatedAt: now,
              });

              // Then archive old item and link to new one
              await ctx.db.patch(existingItem._id, {
                status: "superseded",
                supersededBy: newItemId,
                updatedAt: now,
              });
              intelligenceSaved++;
            }
            // If same value or lower confidence, skip (keep existing)
          } else {
            // Create new knowledge item
            await ctx.db.insert("knowledgeItems", {
              clientId: args.projectId ? undefined : args.clientId,
              projectId: args.projectId,
              fieldPath: field.fieldPath,
              isCanonical: field.isCanonical,
              category: field.category,
              label: field.label,
              value: field.value,
              valueType: field.valueType,
              status: "active",
              sourceType: "ai_extraction",
              sourceDocumentId: job.documentId,
              sourceDocumentName: job.fileName,
              sourceText: field.sourceText,
              originalLabel: field.originalLabel,
              matchedAlias: field.matchedAlias,
              normalizationConfidence: field.confidence,
              addedAt: now,
              updatedAt: now,
            });
            intelligenceSaved++;
          }
        } catch (fieldError) {
          console.error(`[fileDocument] Error saving field ${field.fieldPath}:`, fieldError);
          // Continue with other fields
        }
      }

      console.log(`[fileDocument] Saved ${intelligenceSaved} knowledge items`);
    }

    // Mark job as completed
    await ctx.db.patch(args.jobId, {
      status: "completed",
      updatedAt: now,
    });

    return {
      success: true,
      documentId: job.documentId,
      linkedChecklistItems: linkedItems.length,
      intelligenceSaved,
    };
  },
});

// Mutation: Skip a document in the queue (mark as completed without filing)
export const skipDocument = mutation({
  args: {
    jobId: v.id("fileUploadQueue"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "completed",
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  },
});

