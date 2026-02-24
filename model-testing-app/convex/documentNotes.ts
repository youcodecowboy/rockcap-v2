import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all notes for a document
export const getByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("documentNotes")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .collect();

    // Get user info for each note
    const notesWithUsers = await Promise.all(
      notes.map(async (note) => {
        const user = await ctx.db.get(note.createdBy);
        return {
          ...note,
          createdByName: user?.name || user?.email || "Unknown",
          createdByInitials: user?.name
            ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
            : "??",
        };
      })
    );

    return notesWithUsers;
  },
});

// Query: Get note counts for multiple documents (for list view efficiency)
export const getNoteCounts = query({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const counts: Record<string, number> = {};

    for (const docId of args.documentIds) {
      const notes = await ctx.db
        .query("documentNotes")
        .withIndex("by_document", (q) => q.eq("documentId", docId))
        .collect();
      counts[docId] = notes.length;
    }

    return counts;
  },
});

// Query: Get a single note by ID
export const get = query({
  args: { noteId: v.id("documentNotes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.noteId);
  },
});

// Mutation: Create a new document note
export const create = mutation({
  args: {
    documentId: v.id("documents"),
    content: v.string(),
    addToIntelligence: v.boolean(),
    intelligenceTarget: v.optional(v.union(v.literal("client"), v.literal("project"))),
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
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the document to copy client/project IDs
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    const now = new Date().toISOString();
    let knowledgeItemId: any = undefined;

    // If adding to intelligence, create the knowledgeItem entry
    if (args.addToIntelligence && args.content.trim()) {
      const noteTarget = args.intelligenceTarget || (document.projectId ? 'project' : 'client');
      const docTypeSlug = (document.fileTypeDetected || 'document')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');

      // Only create intelligence if we have a client
      if (document.clientId) {
        knowledgeItemId = await ctx.db.insert("knowledgeItems", {
          clientId: document.clientId,
          projectId: noteTarget === 'project' ? document.projectId : undefined,
          fieldPath: `notes.${docTypeSlug}_context`,
          isCanonical: false,
          category: "notes",
          label: `Note: ${document.fileName}`,
          value: args.content,
          valueType: "text",
          sourceType: "manual",
          sourceDocumentId: args.documentId,
          sourceDocumentName: document.fileName,
          status: "active",
          addedAt: now,
          updatedAt: now,
          addedBy: "document-reader",
        });
      }
    }

    // Create the document note
    const noteId = await ctx.db.insert("documentNotes", {
      documentId: args.documentId,
      clientId: document.clientId,
      projectId: document.projectId,
      content: args.content,
      addedToIntelligence: args.addToIntelligence,
      intelligenceTarget: args.addToIntelligence ? args.intelligenceTarget : undefined,
      knowledgeItemId: knowledgeItemId,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Update denormalized note count on document
    const existingNotes = await ctx.db
      .query("documentNotes")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    await ctx.db.patch(args.documentId, {
      hasNotes: true,
      noteCount: existingNotes.length,
    });

    return noteId;
  },
});

// Mutation: Update a document note
export const update = mutation({
  args: {
    noteId: v.id("documentNotes"),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const note = await ctx.db.get(args.noteId);
    if (!note) {
      throw new Error("Note not found");
    }

    const now = new Date().toISOString();
    const updates: any = { updatedAt: now };

    if (args.content !== undefined) {
      updates.content = args.content;

      // If this note was added to intelligence, update the knowledge item too
      if (note.knowledgeItemId && args.content) {
        await ctx.db.patch(note.knowledgeItemId, {
          value: args.content,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.noteId, updates);
    return args.noteId;
  },
});

// Mutation: Delete a document note
export const remove = mutation({
  args: { noteId: v.id("documentNotes") },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const note = await ctx.db.get(args.noteId);
    if (!note) {
      throw new Error("Note not found");
    }

    const documentId = note.documentId;

    // If this note was added to intelligence, also delete the knowledge item
    if (note.knowledgeItemId) {
      await ctx.db.delete(note.knowledgeItemId);
    }

    // Delete the note
    await ctx.db.delete(args.noteId);

    // Update denormalized note count on document
    const remainingNotes = await ctx.db
      .query("documentNotes")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();

    await ctx.db.patch(documentId, {
      hasNotes: remainingNotes.length > 0,
      noteCount: remainingNotes.length,
    });

    return args.noteId;
  },
});
