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
    const now = new Date().toISOString();
    const noteId = await ctx.db.insert("notes", {
      title: args.title,
      content: args.content,
      emoji: args.emoji,
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
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Note not found");
    }

    const now = new Date().toISOString();
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: now,
      lastSavedAt: now,
    });
    return id;
  },
});

// Mutation: Delete note
export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
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
    let notes;

    // Start with appropriate index
    if (args.clientId) {
      notes = await ctx.db
        .query("notes")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect();
    } else if (args.projectId) {
      notes = await ctx.db
        .query("notes")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else if (args.templateId) {
      notes = await ctx.db
        .query("notes")
        .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
        .collect();
    } else {
      notes = await ctx.db
        .query("notes")
        .collect();
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

