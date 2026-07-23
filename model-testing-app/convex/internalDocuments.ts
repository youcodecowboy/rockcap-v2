import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { buildInternalDocumentName } from "../src/lib/documentNaming";

// Generate internal document code via the canonical convention.
// RockCap_<Topic>_<YYYYMMDD> (e.g. RockCap_LendingPolicy_20260707) replaces the
// legacy ROCK-INT-<TOPIC>-<DDMMYY> prefix — the RockCap producer token keeps the
// RC-internal semantics. Forward-only: existing codes are never regenerated.
function generateInternalDocumentCode(category: string, uploadedAt: string | Date): string {
  return buildInternalDocumentName(category, uploadedAt);
}

// Query: Get all internal documents
export const list = query({
  args: {
    linkedClientId: v.optional(v.id("clients")),
    category: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
  },
  handler: async (ctx, args) => {
    // Use an index for the narrowing filter instead of collecting the whole
    // table (rows carry heavy extractedData blobs). by_linked_client and
    // by_category are exact-match indexes; status has no index so it stays a JS
    // post-filter. The unfiltered fallback is bounded to the 200 newest via the
    // by_uploadedAt index — an unbounded collect could hit the 16MB read limit.
    let docs;
    if (args.linkedClientId) {
      docs = await ctx.db
        .query("internalDocuments")
        .withIndex("by_linked_client", (q: any) => q.eq("linkedClientId", args.linkedClientId))
        .collect();
    } else if (args.category) {
      docs = await ctx.db
        .query("internalDocuments")
        .withIndex("by_category", (q: any) => q.eq("category", args.category))
        .collect();
    } else {
      docs = await ctx.db
        .query("internalDocuments")
        .withIndex("by_uploadedAt")
        .order("desc")
        .take(200);
    }

    // Remaining filters that the chosen index did not already satisfy.
    if (args.linkedClientId && args.category) {
      docs = docs.filter(doc => doc.category === args.category);
    }
    if (args.status) {
      docs = docs.filter(doc => doc.status === args.status);
    }

    // Sort by most recent first
    return docs.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  },
});

// Query: Get internal document by ID
export const get = query({
  args: { id: v.id("internalDocuments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get internal documents linked to a client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("internalDocuments")
      .withIndex("by_linked_client", (q: any) => q.eq("linkedClientId", args.clientId))
      .collect();
  },
});

// Query: Get internal documents linked to a project
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // linkedProjectIds is an ARRAY column, so Convex can't index membership —
    // this is an unavoidable scan + JS filter. Bounded to the 200 newest via the
    // by_uploadedAt index so a growing internalDocuments table can't blow the
    // 16MB read limit. FOLLOW-UP: a junction table (internalDocumentProjects) or
    // a by_project index would make this exact and unbounded.
    const recentDocs = await ctx.db
      .query("internalDocuments")
      .withIndex("by_uploadedAt")
      .order("desc")
      .take(200);
    return recentDocs.filter(doc =>
      doc.linkedProjectIds && doc.linkedProjectIds.includes(args.projectId)
    );
  },
});

// Mutation: Create internal document
export const create = mutation({
  args: {
    fileStorageId: v.optional(v.id("_storage")),
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    summary: v.string(),
    fileTypeDetected: v.string(),
    category: v.string(),
    reasoning: v.string(),
    confidence: v.number(),
    tokensUsed: v.number(),
    linkedClientId: v.optional(v.id("clients")),
    clientName: v.optional(v.string()),
    linkedProjectIds: v.optional(v.array(v.id("projects"))),
    projectNames: v.optional(v.array(v.string())),
    extractedData: v.optional(v.any()),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
    error: v.optional(v.string()),
    documentCode: v.optional(v.string()), // Optional - will auto-generate if not provided
  },
  handler: async (ctx, args) => {
    const uploadedAt = new Date().toISOString();
    
    // Generate document code if not provided
    const code = args.documentCode || generateInternalDocumentCode(
      args.category,
      uploadedAt
    );
    
    // Ensure uniqueness by checking existing codes
    let finalCode = code;
    let counter = 1;
    const existingDocs = await ctx.db.query("internalDocuments").collect();
    while (existingDocs.some(doc => doc.documentCode === finalCode)) {
      finalCode = `${code}-${counter}`;
      counter++;
    }
    
    const documentId = await ctx.db.insert("internalDocuments", {
      fileStorageId: args.fileStorageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileType: args.fileType,
      uploadedAt: uploadedAt,
      documentCode: finalCode,
      summary: args.summary,
      fileTypeDetected: args.fileTypeDetected,
      category: args.category,
      reasoning: args.reasoning,
      confidence: args.confidence,
      tokensUsed: args.tokensUsed,
      linkedClientId: args.linkedClientId,
      clientName: args.clientName,
      linkedProjectIds: args.linkedProjectIds,
      projectNames: args.projectNames,
      extractedData: args.extractedData,
      status: args.status || "completed",
      error: args.error,
      savedAt: uploadedAt,
    });

    return documentId;
  },
});

// Mutation: Update internal document
export const update = mutation({
  args: {
    id: v.id("internalDocuments"),
    linkedClientId: v.optional(v.union(v.id("clients"), v.null())),
    clientName: v.optional(v.string()),
    linkedProjectIds: v.optional(v.array(v.id("projects"))),
    projectNames: v.optional(v.array(v.string())),
    fileTypeDetected: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Internal document not found");
    }
    
    // Clean updates to handle null values
    const cleanUpdates: any = {};
    Object.keys(updates).forEach(key => {
      const value = (updates as any)[key];
      if (value !== undefined) {
        // Convert null to undefined for optional fields
        if (value === null && key === 'linkedClientId') {
          cleanUpdates[key] = undefined;
        } else {
          cleanUpdates[key] = value;
        }
      }
    });
    
    await ctx.db.patch(id, cleanUpdates);
    return id;
  },
});

// Mutation: Update document code specifically
export const updateDocumentCode = mutation({
  args: {
    id: v.id("internalDocuments"),
    documentCode: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Internal document not found");
    }
    
    // Check for uniqueness
    const existingDocs = await ctx.db.query("internalDocuments").collect();
    const isDuplicate = existingDocs.some(
      doc => doc._id !== args.id && doc.documentCode === args.documentCode
    );
    
    if (isDuplicate) {
      throw new Error("Document code already exists");
    }
    
    await ctx.db.patch(args.id, { documentCode: args.documentCode });
    return args.id;
  },
});

// Mutation: Delete internal document
export const remove = mutation({
  args: { id: v.id("internalDocuments") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Query: Get file URL from storage ID
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Query: Get internal documents by folder
export const getByFolder = query({
  args: { folderId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Use the by_folder index instead of collecting the whole table and
    // JS-filtering (rows carry heavy extractedData blobs). "No folder" docs have
    // folderId undefined, which the index matches directly.
    let docs;
    if (args.folderId === undefined || args.folderId === null) {
      docs = await ctx.db
        .query("internalDocuments")
        .withIndex("by_folder", (q: any) => q.eq("folderId", undefined))
        .collect();
    } else {
      docs = await ctx.db
        .query("internalDocuments")
        .withIndex("by_folder", (q: any) => q.eq("folderId", args.folderId))
        .collect();
    }

    return docs.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  },
});

// Query: Get all folders (including empty ones)
export const getFolders = query({
  handler: async (ctx) => {
    const folders = await ctx.db
      .query("internalFolders")
      .withIndex("by_type", (q: any) => q.eq("folderType", "internalDocument"))
      .collect();
    return folders.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Query: Get folder by ID
export const getFolder = query({
  args: { folderId: v.id("internalFolders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.folderId);
  },
});

// Mutation: Create folder
export const createFolder = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if folder with same name already exists within internalDocument type
    const existingFolders = await ctx.db
      .query("internalFolders")
      .withIndex("by_type", (q: any) => q.eq("folderType", "internalDocument"))
      .collect();

    const duplicateFolder = existingFolders.find(f => f.name === args.name);
    if (duplicateFolder) {
      throw new Error("Folder with this name already exists");
    }

    const folderId = await ctx.db.insert("internalFolders", {
      name: args.name,
      folderType: "internalDocument",
      isCustom: true,
      createdAt: new Date().toISOString(),
    });

    return folderId;
  },
});

// Mutation: Delete folder
export const deleteFolder = mutation({
  args: {
    folderId: v.id("internalFolders"),
  },
  handler: async (ctx, args) => {
    // Move all documents in this folder to unorganized (null folderId)
    const docsInFolder = await ctx.db
      .query("internalDocuments")
      .withIndex("by_folder", (q: any) => q.eq("folderId", args.folderId))
      .collect();
    
    // Get folder name to use as folderId string
    const folder = await ctx.db.get(args.folderId);
    if (!folder) {
      throw new Error("Folder not found");
    }
    
    // Update all documents to remove folderId
    for (const doc of docsInFolder) {
      await ctx.db.patch(doc._id, { folderId: undefined });
    }
    
    // Delete the folder
    await ctx.db.delete(args.folderId);
    return args.folderId;
  },
});

// Mutation: Update document folder
export const updateFolder = mutation({
  args: {
    id: v.id("internalDocuments"),
    folderId: v.optional(v.union(v.id("internalFolders"), v.null())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Internal document not found");
    }
    
    // Convert folder ID to string for storage (folderId field stores the folder _id as string)
    const folderIdString = args.folderId ? (args.folderId as string) : undefined;
    await ctx.db.patch(args.id, { folderId: folderIdString });
    return args.id;
  },
});

