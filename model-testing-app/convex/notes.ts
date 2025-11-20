import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Mutation: Create new note
export const create = mutation({
  args: {
    title: v.string(),
    content: v.any(), // Rich text content (JSON format for editor)
    emoji: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    templateId: v.optional(v.id("noteTemplates")),
    knowledgeBankEntryIds: v.optional(v.array(v.id("knowledgeBankEntries"))),
    tags: v.optional(v.array(v.string())),
    mentionedUserIds: v.optional(v.array(v.string())),
    wordCount: v.optional(v.number()),
    isDraft: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Get user ID from identity using Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }

    const now = new Date().toISOString();
    
    // If note is unfiled (no clientId or projectId), set userId
    // If note is filed, userId is optional (shared note)
    const userId = (!args.clientId && !args.projectId) ? user._id : undefined;
    
    const noteId = await ctx.db.insert("notes", {
      title: args.title,
      content: args.content,
      emoji: args.emoji,
      userId: userId,
      clientId: args.clientId,
      projectId: args.projectId,
      templateId: args.templateId,
      knowledgeBankEntryIds: args.knowledgeBankEntryIds || [],
      tags: args.tags || [],
      mentionedUserIds: args.mentionedUserIds || [],
      wordCount: args.wordCount,
      isDraft: args.isDraft ?? false,
      createdAt: now,
      updatedAt: now,
      lastSavedAt: now,
    });
    return noteId;
  },
});

// Mutation: Update note
export const update = mutation({
  args: {
    id: v.id("notes"),
    title: v.optional(v.string()),
    content: v.optional(v.any()),
    emoji: v.optional(v.string()),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    knowledgeBankEntryIds: v.optional(v.array(v.id("knowledgeBankEntries"))),
    tags: v.optional(v.array(v.string())),
    mentionedUserIds: v.optional(v.array(v.string())),
    wordCount: v.optional(v.number()),
    isDraft: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Get user ID from identity using Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }

    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Note not found");
    }

    // Verify ownership for unfiled notes
    if (existing.userId && existing.userId !== user._id) {
      throw new Error("Unauthorized: You can only edit your own notes");
    }

    // Determine if note is being filed or unfiled
    const newClientId = updates.clientId !== undefined ? updates.clientId : existing.clientId;
    const newProjectId = updates.projectId !== undefined ? updates.projectId : existing.projectId;
    const isUnfiled = !newClientId && !newProjectId;
    const wasUnfiled = !existing.clientId && !existing.projectId;

    // Set userId based on filing status
    // If unfiled, set userId. If filed, clear userId (shared)
    const userIdUpdate = isUnfiled ? user._id : (wasUnfiled && !isUnfiled ? null : undefined);

    const now = new Date().toISOString();
    // Filter out null values - convert to undefined for optional fields
    const patchData: any = {
      ...updates,
      ...(userIdUpdate !== undefined && { userId: userIdUpdate }),
      updatedAt: now,
      lastSavedAt: now,
    };
    // Convert null to undefined for optional ID fields
    if (patchData.clientId === null) patchData.clientId = undefined;
    if (patchData.projectId === null) patchData.projectId = undefined;
    if (patchData.templateId === null) patchData.templateId = undefined;
    if (patchData.userId === null) patchData.userId = undefined;
    
    await ctx.db.patch(id, patchData);
    return id;
  },
});

// Mutation: Delete note
export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Get user ID from identity using Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }

    const note = await ctx.db.get(args.id);
    if (!note) {
      throw new Error("Note not found");
    }

    // Verify ownership for unfiled notes
    // Filed notes (with clientId/projectId) can be deleted by anyone (shared)
    // Unfiled notes can only be deleted by their owner
    if (note.userId && note.userId !== user._id) {
      throw new Error("Unauthorized: You can only delete your own notes");
    }

    await ctx.db.delete(args.id);
  },
});

// Query: Get note by ID
export const get = query({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get notes by client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Filed notes are shared - no need to filter by user
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    
    return notes.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },
});

// Query: Get notes by project
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    return notes.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },
});

// Query: Get all notes with filters
export const getAll = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    templateId: v.optional(v.id("noteTemplates")),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return []; // Return empty array if not authenticated
    }

    // Get user ID from identity using Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    if (!user) {
      return []; // Return empty array if user not found
    }

    let notes;

    // Start with appropriate index
    if (args.clientId) {
      // Filed notes by client - all users can see (shared)
      notes = await ctx.db
        .query("notes")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect();
    } else if (args.projectId) {
      // Filed notes by project - all users can see (shared)
      notes = await ctx.db
        .query("notes")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else if (args.templateId) {
      // Notes by template - filter by user for unfiled notes
      notes = await ctx.db
        .query("notes")
        .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
        .collect();
      
      // Filter: Show all filed notes, but only user's own unfiled notes
      notes = notes.filter(note => {
        // If note is filed (has clientId or projectId), show it (shared)
        if (note.clientId || note.projectId) return true;
        // If note is unfiled, only show if it belongs to current user
        return note.userId === user._id;
      });
    } else {
      // Get all notes
      notes = await ctx.db
        .query("notes")
        .collect();
      
      // Filter: Show all filed notes (shared), but only user's own unfiled notes
      notes = notes.filter(note => {
        // If note is filed (has clientId or projectId), show it (shared)
        if (note.clientId || note.projectId) return true;
        // If note is unfiled, only show if it belongs to current user
        return note.userId === user._id;
      });
    }

    // Filter by tags if provided
    if (args.tags && args.tags.length > 0) {
      notes = notes.filter(n => 
        args.tags!.some(tag => n.tags.includes(tag))
      );
    }

    // Sort by updatedAt descending (most recently updated first)
    return notes.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },
});

// Mutation: Apply template to create note from knowledge bank entries
export const applyTemplate = mutation({
  args: {
    templateId: v.id("noteTemplates"),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    knowledgeBankEntryIds: v.array(v.id("knowledgeBankEntries")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get template
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    if (!template.isActive) {
      throw new Error("Template is not active");
    }

    // Get knowledge bank entries
    const entries = await Promise.all(
      args.knowledgeBankEntryIds.map(id => ctx.db.get(id))
    );

    // Filter out any null entries
    const validEntries = entries.filter(e => e !== null);

    // Extract data from knowledge bank entries based on template fields
    const extractedData: Record<string, any> = {};
    
    template.knowledgeBankFields.forEach(field => {
      // Try to extract field from entries
      validEntries.forEach(entry => {
        if (entry) {
          // Check if field exists in metadata
          if (entry.metadata && entry.metadata[field]) {
            extractedData[field] = entry.metadata[field];
          }
          // Check if field matches common entry properties
          if (field === "title" && !extractedData[field]) {
            extractedData[field] = entry.title;
          }
          if (field === "content" && !extractedData[field]) {
            extractedData[field] = entry.content;
          }
          if (field === "keyPoints" && !extractedData[field]) {
            extractedData[field] = entry.keyPoints;
          }
        }
      });
    });

    // Merge template structure with extracted data
    // The template.template is a JSON structure that defines the layout
    // We'll merge the extracted data into it
    const templateContent = typeof template.template === "object" 
      ? template.template 
      : {};

    // Create merged content by replacing placeholders with actual data
    const mergedContent = {
      ...templateContent,
      data: extractedData,
      entries: validEntries.map(e => ({
        id: e!._id,
        title: e!.title,
        content: e!.content,
        keyPoints: e!.keyPoints,
        entryType: e!.entryType,
        createdAt: e!.createdAt,
      })),
    };

    // Generate title if not provided
    const noteTitle = args.title || 
      `${template.name} - ${new Date().toLocaleDateString()}`;

    // Create note
    const now = new Date().toISOString();
    const noteId = await ctx.db.insert("notes", {
      title: noteTitle,
      content: mergedContent,
      clientId: args.clientId,
      projectId: args.projectId,
      templateId: args.templateId,
      knowledgeBankEntryIds: args.knowledgeBankEntryIds,
      tags: validEntries.flatMap(e => e!.tags),
      createdAt: now,
      updatedAt: now,
    });

    return noteId;
  },
});

