import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all documents
export const list = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    category: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
  },
  handler: async (ctx, args) => {
    if (args.clientId) {
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId!))
        .collect();
      return docs.filter(doc => {
        if (args.category && doc.category !== args.category) return false;
        if (args.status && doc.status !== args.status) return false;
        return true;
      });
    } else if (args.projectId) {
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId!))
        .collect();
      return docs.filter(doc => {
        if (args.category && doc.category !== args.category) return false;
        if (args.status && doc.status !== args.status) return false;
        return true;
      });
    } else if (args.category) {
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_category", (q: any) => q.eq("category", args.category!))
        .collect();
      return docs.filter(doc => {
        if (args.status && doc.status !== args.status) return false;
        return true;
      });
    } else if (args.status) {
      return await ctx.db
        .query("documents")
        .withIndex("by_status", (q: any) => q.eq("status", args.status!))
        .collect();
    } else {
      return await ctx.db.query("documents").collect();
    }
  },
});

// Query: Get document by ID
export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get documents by client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
  },
});

// Query: Get documents by project
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Query: Get internal documents (no client/project)
export const getInternal = query({
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").collect();
    return allDocs.filter(doc => !doc.clientId && !doc.projectId);
  },
});

// Query: Search documents
export const search = query({
  args: {
    query: v.string(),
    fileType: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let docs = await ctx.db.query("documents").collect();
    const lowerQuery = args.query.toLowerCase().trim();
    
    docs = docs.filter(doc => {
      if (args.fileType && doc.fileTypeDetected !== args.fileType) {
        return false;
      }
      if (args.category && doc.category !== args.category) {
        return false;
      }
      if (lowerQuery) {
        const summaryMatch = doc.summary.toLowerCase().includes(lowerQuery);
        const fileNameMatch = doc.fileName.toLowerCase().includes(lowerQuery);
        const clientMatch = doc.clientName?.toLowerCase().includes(lowerQuery);
        const projectMatch = doc.projectName?.toLowerCase().includes(lowerQuery) ||
                            doc.suggestedProjectName?.toLowerCase().includes(lowerQuery);
        const reasoningMatch = doc.reasoning.toLowerCase().includes(lowerQuery);
        return summaryMatch || fileNameMatch || clientMatch || projectMatch || reasoningMatch;
      }
      return true;
    });
    
    return docs;
  },
});

// Query: Get unique file types
export const getUniqueFileTypes = query({
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").collect();
    const types = new Set(docs.map(doc => doc.fileTypeDetected));
    return Array.from(types).sort();
  },
});

// Query: Get unique categories
export const getUniqueCategories = query({
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").collect();
    const categories = new Set(docs.map(doc => doc.category));
    return Array.from(categories).sort();
  },
});

// Query: Get recent documents
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    const allDocs = await ctx.db.query("documents").collect();
    const sorted = allDocs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    return sorted.slice(0, limit);
  },
});

// Mutation: Create document
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
    clientId: v.optional(v.id("clients")),
    clientName: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    suggestedClientName: v.optional(v.string()),
    suggestedProjectName: v.optional(v.string()),
    extractedData: v.optional(v.any()),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const documentId = await ctx.db.insert("documents", {
      fileStorageId: args.fileStorageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileType: args.fileType,
      uploadedAt: new Date().toISOString(),
      summary: args.summary,
      fileTypeDetected: args.fileTypeDetected,
      category: args.category,
      reasoning: args.reasoning,
      confidence: args.confidence,
      tokensUsed: args.tokensUsed,
      clientId: args.clientId,
      clientName: args.clientName,
      projectId: args.projectId,
      projectName: args.projectName,
      suggestedClientName: args.suggestedClientName,
      suggestedProjectName: args.suggestedProjectName,
      extractedData: args.extractedData,
      status: args.status || "completed",
      error: args.error,
      savedAt: new Date().toISOString(),
    });

    // Automatically create knowledge bank entry if document is linked to a client
    if (args.clientId && args.status !== "error") {
      try {
        // Determine entry type based on category and file type
        let entryType: "deal_update" | "call_transcript" | "email" | "document_summary" | "project_status" | "general" = "document_summary";
        
        const categoryLower = args.category.toLowerCase();
        const fileNameLower = args.fileName.toLowerCase();
        
        if (categoryLower.includes("deal") || categoryLower.includes("loan") || categoryLower.includes("term")) {
          entryType = "deal_update";
        } else if (categoryLower.includes("project") || categoryLower.includes("development")) {
          entryType = "project_status";
        } else if (fileNameLower.includes("call") || fileNameLower.includes("transcript")) {
          entryType = "call_transcript";
        } else if (categoryLower.includes("email") || fileNameLower.includes("email")) {
          entryType = "email";
        }

        // Extract key points from summary (first 3-5 sentences or bullet points)
        const keyPoints: string[] = [];
        const summaryLines = args.summary.split(/[.!?]\s+/).filter(line => line.trim().length > 0);
        keyPoints.push(...summaryLines.slice(0, 5).map(line => line.trim()));

        // Extract metadata from extractedData if available
        const metadata: any = {};
        if (args.extractedData) {
          // Store relevant extracted data in metadata
          if (args.extractedData.loanAmount) metadata.loanAmount = args.extractedData.loanAmount;
          if (args.extractedData.interestRate) metadata.interestRate = args.extractedData.interestRate;
          if (args.extractedData.loanNumber) metadata.loanNumber = args.extractedData.loanNumber;
          if (args.extractedData.costsTotal) metadata.costsTotal = args.extractedData.costsTotal;
          if (args.extractedData.detectedCurrency) metadata.currency = args.extractedData.detectedCurrency;
        }

        // Generate tags from category and file type
        const tags: string[] = [args.category];
        if (args.fileTypeDetected) tags.push(args.fileTypeDetected);
        if (args.projectName) tags.push("project-related");

        // Create knowledge bank entry
        await ctx.db.insert("knowledgeBankEntries", {
          clientId: args.clientId,
          projectId: args.projectId,
          sourceType: "document",
          sourceId: documentId,
          entryType: entryType,
          title: `${args.fileName} - ${args.category}`,
          content: args.summary,
          keyPoints: keyPoints,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          tags: tags,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        // Log error but don't fail document creation if knowledge bank entry fails
        console.error("Failed to create knowledge bank entry:", error);
      }
    }

    return documentId;
  },
});

// Mutation: Store file and create document in one operation (convenience function)
export const uploadFileAndCreateDocument = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    summary: v.string(),
    fileTypeDetected: v.string(),
    category: v.string(),
    reasoning: v.string(),
    confidence: v.number(),
    tokensUsed: v.number(),
    clientId: v.optional(v.id("clients")),
    clientName: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    suggestedClientName: v.optional(v.string()),
    suggestedProjectName: v.optional(v.string()),
    extractedData: v.optional(v.any()),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const documentId = await ctx.db.insert("documents", {
      fileStorageId: args.storageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileType: args.fileType,
      uploadedAt: new Date().toISOString(),
      summary: args.summary,
      fileTypeDetected: args.fileTypeDetected,
      category: args.category,
      reasoning: args.reasoning,
      confidence: args.confidence,
      tokensUsed: args.tokensUsed,
      clientId: args.clientId,
      clientName: args.clientName,
      projectId: args.projectId,
      projectName: args.projectName,
      suggestedClientName: args.suggestedClientName,
      suggestedProjectName: args.suggestedProjectName,
      extractedData: args.extractedData,
      status: args.status || "completed",
      error: args.error,
      savedAt: new Date().toISOString(),
    });
    return documentId;
  },
});

// Mutation: Update document
export const update = mutation({
  args: {
    id: v.id("documents"),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    clientName: v.optional(v.string()),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    projectName: v.optional(v.string()),
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
      throw new Error("Document not found");
    }
    
    // Clean updates to handle null values
    const cleanUpdates: any = {};
    Object.keys(updates).forEach(key => {
      const value = (updates as any)[key];
      if (value !== undefined) {
        // Convert null to undefined for optional fields
        if (value === null && (key === 'clientId' || key === 'projectId')) {
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

// Mutation: Delete document
export const remove = mutation({
  args: { id: v.id("documents") },
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
