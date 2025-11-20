import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Helper function to abbreviate text
function abbreviateText(text: string, maxLength: number): string {
  if (!text) return '';
  const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, maxLength);
}

// Helper function to abbreviate category
function abbreviateCategory(category: string): string {
  if (!category) return 'DOC';
  
  const categoryMap: Record<string, string> = {
    'valuation': 'VAL',
    'operating': 'OPR',
    'operating statement': 'OPR',
    'appraisal': 'APP',
    'financial': 'FIN',
    'contract': 'CNT',
    'agreement': 'AGR',
    'invoice': 'INV',
    'report': 'RPT',
    'letter': 'LTR',
    'email': 'EML',
    'note': 'NTE',
    'memo': 'MEM',
    'proposal': 'PRP',
    'quote': 'QTE',
    'receipt': 'RCP',
  };
  
  const categoryLower = category.toLowerCase();
  for (const [key, value] of Object.entries(categoryMap)) {
    if (categoryLower.includes(key)) {
      return value;
    }
  }
  
  return abbreviateText(category, 3);
}

// Helper function to format date to DDMMYY
function formatDateDDMMYY(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

// Generate internal document code
function generateInternalDocumentCode(category: string, uploadedAt: string | Date): string {
  const topicCode = abbreviateText(category || 'DOC', 8);
  const dateCode = formatDateDDMMYY(uploadedAt);
  return `ROCK-INT-${topicCode}-${dateCode}`;
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
    let docs = await ctx.db.query("internalDocuments").collect();
    
    // Filter by linked client if provided
    if (args.linkedClientId) {
      docs = docs.filter(doc => doc.linkedClientId === args.linkedClientId);
    }
    
    // Filter by category if provided
    if (args.category) {
      docs = docs.filter(doc => doc.category === args.category);
    }
    
    // Filter by status if provided
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
    const allDocs = await ctx.db.query("internalDocuments").collect();
    return allDocs.filter(doc => 
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
    let docs = await ctx.db.query("internalDocuments").collect();
    
    if (args.folderId === undefined || args.folderId === null) {
      // Return documents without a folder (null or undefined folderId)
      docs = docs.filter(doc => !doc.folderId);
    } else {
      // Return documents in the specified folder
      docs = docs.filter(doc => doc.folderId === args.folderId);
    }
    
    return docs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  },
});

// Query: Get all folders (including empty ones)
export const getFolders = query({
  handler: async (ctx) => {
    const folders = await ctx.db.query("internalDocumentFolders").collect();
    return folders.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Query: Get folder by ID
export const getFolder = query({
  args: { folderId: v.id("internalDocumentFolders") },
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
    // Check if folder with same name already exists
    const existingFolders = await ctx.db
      .query("internalDocumentFolders")
      .withIndex("by_name", (q: any) => q.eq("name", args.name))
      .collect();
    
    if (existingFolders.length > 0) {
      throw new Error("Folder with this name already exists");
    }
    
    const folderId = await ctx.db.insert("internalDocumentFolders", {
      name: args.name,
      createdAt: new Date().toISOString(),
    });
    
    return folderId;
  },
});

// Mutation: Delete folder
export const deleteFolder = mutation({
  args: {
    folderId: v.id("internalDocumentFolders"),
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
    folderId: v.optional(v.union(v.id("internalDocumentFolders"), v.null())),
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

