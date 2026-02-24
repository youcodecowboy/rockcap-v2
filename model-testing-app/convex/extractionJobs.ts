import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

// Get all pending extraction jobs
export const getPending = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    
    const jobs = await ctx.db
      .query("extractionJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(limit);
    
    return jobs;
  },
});

// Get extraction jobs for a project
export const getByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("extractionJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Get extraction job by document
export const getByDocument = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("extractionJobs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
  },
});

// Get extraction queue stats
export const getQueueStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("extractionJobs").collect();
    
    return {
      pending: all.filter(j => j.status === "pending").length,
      processing: all.filter(j => j.status === "processing").length,
      completed: all.filter(j => j.status === "completed").length,
      failed: all.filter(j => j.status === "failed").length,
      total: all.length,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

// Create an extraction job
export const create = mutation({
  args: {
    documentId: v.id("documents"),
    projectId: v.id("projects"),
    clientId: v.optional(v.id("clients")),
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if job already exists for this document
    const existing = await ctx.db
      .query("extractionJobs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    
    if (existing) {
      // Reset to pending if failed
      if (existing.status === "failed") {
        await ctx.db.patch(existing._id, {
          status: "pending",
          attempts: 0,
          error: undefined,
          updatedAt: now,
        });
        return existing._id;
      }
      return existing._id;
    }
    
    const jobId = await ctx.db.insert("extractionJobs", {
      documentId: args.documentId,
      projectId: args.projectId,
      clientId: args.clientId,
      fileStorageId: args.fileStorageId,
      fileName: args.fileName,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    });
    
    return jobId;
  },
});

// Start processing a job
export const startProcessing = mutation({
  args: {
    jobId: v.id("extractionJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    
    if (job.status !== "pending") {
      throw new Error(`Cannot start job with status: ${job.status}`);
    }
    
    const now = new Date().toISOString();
    
    await ctx.db.patch(args.jobId, {
      status: "processing",
      attempts: job.attempts + 1,
      lastAttemptAt: now,
      updatedAt: now,
    });
    
    return job;
  },
});

// Mark job as completed with results
export const complete = mutation({
  args: {
    jobId: v.id("extractionJobs"),
    extractedData: v.any(),
    codifiedExtractionId: v.optional(v.id("codifiedExtractions")),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    
    const now = new Date().toISOString();
    
    // Update the job
    await ctx.db.patch(args.jobId, {
      status: "completed",
      extractedData: args.extractedData,
      codifiedExtractionId: args.codifiedExtractionId,
      completedAt: now,
      updatedAt: now,
    });
    
    // Update the document with extracted data
    await ctx.db.patch(job.documentId, {
      extractedData: args.extractedData,
    });
    
    return args.jobId;
  },
});

// Mark job as failed
export const fail = mutation({
  args: {
    jobId: v.id("extractionJobs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    
    const now = new Date().toISOString();
    const maxAttempts = job.maxAttempts || 3;
    
    // Check if we should retry
    if (job.attempts < maxAttempts) {
      // Reset to pending for retry
      await ctx.db.patch(args.jobId, {
        status: "pending",
        error: args.error,
        updatedAt: now,
      });
    } else {
      // Mark as permanently failed
      await ctx.db.patch(args.jobId, {
        status: "failed",
        error: args.error,
        updatedAt: now,
      });
    }
    
    return args.jobId;
  },
});

// Retry a failed job
export const retry = mutation({
  args: {
    jobId: v.id("extractionJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    
    const now = new Date().toISOString();
    
    await ctx.db.patch(args.jobId, {
      status: "pending",
      attempts: 0,
      error: undefined,
      updatedAt: now,
    });
    
    return args.jobId;
  },
});

// Delete a job
export const remove = mutation({
  args: {
    jobId: v.id("extractionJobs"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.jobId);
    return args.jobId;
  },
});

// Internal mutation to process the queue
// Called by the API endpoint after processing
export const processQueueItem = internalMutation({
  args: {
    jobId: v.id("extractionJobs"),
    success: v.boolean(),
    extractedData: v.optional(v.any()),
    codifiedExtractionId: v.optional(v.id("codifiedExtractions")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;
    
    const now = new Date().toISOString();
    
    if (args.success) {
      // Update job
      await ctx.db.patch(args.jobId, {
        status: "completed",
        extractedData: args.extractedData,
        codifiedExtractionId: args.codifiedExtractionId,
        completedAt: now,
        updatedAt: now,
      });
      
      // Update document with extracted data
      if (args.extractedData) {
        await ctx.db.patch(job.documentId, {
          extractedData: args.extractedData,
        });
      }
      
      // Trigger intelligence syncs
      if (args.codifiedExtractionId) {
        // The codifiedExtractions.create already handles the merge trigger
        // But we can also schedule intelligence sync here
        await ctx.scheduler.runAfter(0, api.intelligence.syncDataLibraryToIntelligence, {
          projectId: job.projectId,
        });
        
        if (job.clientId) {
          await ctx.scheduler.runAfter(0, api.intelligence.syncProjectSummariesToClient, {
            clientId: job.clientId,
          });
        }
      }
    } else {
      // Handle failure
      const maxAttempts = job.maxAttempts || 3;
      
      if (job.attempts < maxAttempts) {
        await ctx.db.patch(args.jobId, {
          status: "pending",
          error: args.error,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(args.jobId, {
          status: "failed",
          error: args.error,
          updatedAt: now,
        });
      }
    }
  },
});
