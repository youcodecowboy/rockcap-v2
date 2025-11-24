import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./authHelpers";

// Query: Get comments for a job or document
export const getByJob = query({
  args: { jobId: v.id("fileUploadQueue") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_job", (q: any) => q.eq("jobId", args.jobId))
      .collect();
    
    // Sort by createdAt ascending (oldest first)
    return comments.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  },
});

export const getByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
    
    // Sort by createdAt ascending (oldest first)
    return comments.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  },
});

// Mutation: Create comment
export const create = mutation({
  args: {
    jobId: v.optional(v.id("fileUploadQueue")),
    documentId: v.optional(v.id("documents")),
    content: v.string(),
    taggedUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const now = new Date().toISOString();
    
    if (!args.jobId && !args.documentId) {
      throw new Error("Either jobId or documentId must be provided");
    }
    
    const commentId = await ctx.db.insert("comments", {
      jobId: args.jobId,
      documentId: args.documentId,
      userId: user._id,
      content: args.content,
      taggedUserIds: args.taggedUserIds,
      createdAt: now,
    });
    
    // Create notifications for tagged users
    if (args.taggedUserIds && args.taggedUserIds.length > 0) {
      const userName = user.name || user.email;
      for (const taggedUserId of args.taggedUserIds) {
        await ctx.db.insert("notifications", {
          userId: taggedUserId,
          type: "file_upload",
          title: `${userName} mentioned you in a comment`,
          message: args.content.substring(0, 100),
          relatedId: args.jobId || args.documentId,
          isRead: false,
          createdAt: now,
        });
      }
    }
    
    return commentId;
  },
});

// Mutation: Update comment
export const update = mutation({
  args: {
    id: v.id("comments"),
    content: v.string(),
    taggedUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const comment = await ctx.db.get(args.id);
    
    if (!comment) {
      throw new Error("Comment not found");
    }
    
    // Only allow user to edit their own comments
    if (comment.userId !== user._id) {
      throw new Error("Unauthorized");
    }
    
    const now = new Date().toISOString();
    
    // Get previous tagged users to see if we need to create new notifications
    const previousTagged = comment.taggedUserIds || [];
    const newTagged = args.taggedUserIds || [];
    const newlyTagged = newTagged.filter(id => !previousTagged.includes(id));
    
    await ctx.db.patch(args.id, {
      content: args.content,
      taggedUserIds: args.taggedUserIds,
      updatedAt: now,
    });
    
    // Create notifications for newly tagged users
    if (newlyTagged.length > 0) {
      const userName = user.name || user.email;
      for (const taggedUserId of newlyTagged) {
        await ctx.db.insert("notifications", {
          userId: taggedUserId,
          type: "file_upload",
          title: `${userName} mentioned you in a comment`,
          message: args.content.substring(0, 100),
          relatedId: comment.jobId || comment.documentId,
          isRead: false,
          createdAt: now,
        });
      }
    }
    
    return args.id;
  },
});

// Mutation: Delete comment
export const remove = mutation({
  args: { id: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const comment = await ctx.db.get(args.id);
    
    if (!comment) {
      throw new Error("Comment not found");
    }
    
    // Only allow user to delete their own comments
    if (comment.userId !== user._id) {
      throw new Error("Unauthorized");
    }
    
    await ctx.db.delete(args.id);
    return args.id;
  },
});

