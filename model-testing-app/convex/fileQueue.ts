import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Mutation: Create a new queue job
export const createJob = mutation({
  args: {
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const jobId = await ctx.db.insert("fileUploadQueue", {
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileType: args.fileType,
      status: "pending",
      progress: 0,
      isRead: false,
      userId: args.userId,
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
    let query = ctx.db.query("fileUploadQueue");
    
    if (args.status) {
      query = query.withIndex("by_status", (q) => q.eq("status", args.status));
    }
    // If no status filter, query all and sort in memory
    
    const jobs = await query.collect();
    
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
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    
    // Sort by createdAt ascending (oldest first for FIFO processing)
    return pending.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  },
});

