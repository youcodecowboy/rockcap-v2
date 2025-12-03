import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get extraction by ID
export const get = query({
  args: { id: v.id("documentExtractions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get extractions for a document
export const getByDocument = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const extractions = await ctx.db
      .query("documentExtractions")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
    
    // Sort by version (descending) - most recent first
    return extractions.sort((a, b) => b.version - a.version);
  },
});

// Query: Get latest extraction for a document
export const getLatestByDocument = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const extractions = await ctx.db
      .query("documentExtractions")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
    
    if (extractions.length === 0) {
      return null;
    }
    
    // Sort by version (descending) and return most recent
    extractions.sort((a, b) => b.version - a.version);
    return extractions[0];
  },
});

// Query: Get extractions for a project
export const getByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const extractions = await ctx.db
      .query("documentExtractions")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();
    
    // Sort by extractedAt (descending) - most recent first
    return extractions.sort((a, b) => 
      new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime()
    );
  },
});

// Mutation: Create extraction record
export const create = mutation({
  args: {
    documentId: v.id("documents"),
    projectId: v.optional(v.id("projects")),
    extractedData: v.any(),
    sourceFileName: v.string(),
  },
  handler: async (ctx, args) => {
    // Get existing extractions for this document to determine next version
    const existingExtractions = await ctx.db
      .query("documentExtractions")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
    
    const nextVersion = existingExtractions.length > 0
      ? Math.max(...existingExtractions.map(e => e.version)) + 1
      : 1;
    
    const now = new Date().toISOString();
    const extractionId = await ctx.db.insert("documentExtractions", {
      documentId: args.documentId,
      projectId: args.projectId,
      extractedData: args.extractedData,
      extractedAt: now,
      version: nextVersion,
      sourceFileName: args.sourceFileName,
    });
    
    return extractionId;
  },
});

// Mutation: Update extraction
export const update = mutation({
  args: {
    id: v.id("documentExtractions"),
    extractedData: v.optional(v.any()),
    sourceFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Extraction not found");
    }
    
    await ctx.db.patch(id, updates);
    return id;
  },
});

// Mutation: Delete extraction
export const remove = mutation({
  args: { id: v.id("documentExtractions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

