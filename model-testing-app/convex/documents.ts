import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";

// Helper functions for document code generation
function abbreviateText(text: string, maxLength: number): string {
  if (!text) return '';
  const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, maxLength);
}

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

function formatDateDDMMYY(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

function generateDocumentCode(
  clientName: string,
  category: string,
  projectName: string | undefined,
  uploadedAt: string | Date
): string {
  const clientCode = abbreviateText(clientName, 8);
  const typeCode = abbreviateCategory(category);
  const projectCode = projectName ? abbreviateText(projectName, 10) : '';
  const dateCode = formatDateDDMMYY(uploadedAt);
  
  if (projectCode) {
    return `${clientCode}-${typeCode}-${projectCode}-${dateCode}`;
  } else {
    return `${clientCode}-${typeCode}-${dateCode}`;
  }
}

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

// Query: Get unclassified documents (no client AND no project)
export const getUnclassified = query({
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").collect();
    return allDocs.filter(doc => !doc.clientId && !doc.projectId);
  },
});

// Query: Get folder statistics for clients
export const getFolderStats = query({
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").collect();
    const clients = await ctx.db.query("clients").collect();
    const projects = await ctx.db.query("projects").collect();
    
    // Group documents by client
    const clientStats = clients.map(client => {
      const clientDocs = allDocs.filter(doc => doc.clientId === client._id);
      const lastUpdated = clientDocs.length > 0
        ? Math.max(...clientDocs.map(doc => new Date(doc.uploadedAt).getTime()))
        : 0;
      
      return {
        clientId: client._id,
        clientName: client.name,
        documentCount: clientDocs.length,
        lastUpdated: lastUpdated > 0 ? new Date(lastUpdated).toISOString() : null,
      };
    });
    
    // Group documents by project
    const projectStats = projects.map(project => {
      const projectDocs = allDocs.filter(doc => doc.projectId === project._id);
      const lastUpdated = projectDocs.length > 0
        ? Math.max(...projectDocs.map(doc => new Date(doc.uploadedAt).getTime()))
        : 0;
      
      // Get client name for this project
      const clientId = project.clientRoles?.[0]?.clientId;
      const client = clientId ? clients.find(c => c._id === clientId) : null;
      
      return {
        projectId: project._id,
        projectName: project.name,
        clientId: clientId,
        clientName: client?.name,
        documentCount: projectDocs.length,
        lastUpdated: lastUpdated > 0 ? new Date(lastUpdated).toISOString() : null,
      };
    });
    
    return {
      clients: clientStats.sort((a, b) => {
        const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return bTime - aTime;
      }),
      projects: projectStats.sort((a, b) => {
        const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return bTime - aTime;
      }),
    };
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
    documentCode: v.optional(v.string()), // Optional - will auto-generate if not provided
    isBaseDocument: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const uploadedAt = new Date().toISOString();
    
    // Generate document code if client/project info available and code not provided
    let documentCode = args.documentCode;
    if (!documentCode && args.clientName) {
      // For base documents, don't include project name in code
      const projectNameForCode = args.isBaseDocument ? undefined : args.projectName;
      documentCode = generateDocumentCode(
        args.clientName,
        args.category,
        projectNameForCode,
        uploadedAt
      );
      
      // Ensure uniqueness
      const existingDocs = await ctx.db.query("documents").collect();
      let finalCode = documentCode;
      let counter = 1;
      while (existingDocs.some(doc => doc.documentCode === finalCode)) {
        finalCode = `${documentCode}-${counter}`;
        counter++;
      }
      documentCode = finalCode;
    }
    
    const documentId = await ctx.db.insert("documents", {
      fileStorageId: args.fileStorageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileType: args.fileType,
      uploadedAt: uploadedAt,
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
      documentCode: documentCode,
      extractedData: args.extractedData,
      status: args.status || "completed",
      error: args.error,
      savedAt: uploadedAt,
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

    // Invalidate context cache for client if provided
    if (args.clientId) {
      // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "client",
        contextId: args.clientId,
      });
    }

    // Invalidate context cache for project if provided
    if (args.projectId) {
      // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: args.projectId,
      });
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
    isBaseDocument: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const uploadedAt = new Date().toISOString();
    
    // Generate document code if client/project info available
    let documentCode: string | undefined = undefined;
    if (args.clientName) {
      // For base documents, don't include project name in code
      const projectNameForCode = args.isBaseDocument ? undefined : args.projectName;
      documentCode = generateDocumentCode(
        args.clientName,
        args.category,
        projectNameForCode,
        uploadedAt
      );
      
      // Ensure uniqueness
      const existingDocs = await ctx.db.query("documents").collect();
      let finalCode = documentCode;
      let counter = 1;
      while (existingDocs.some(doc => doc.documentCode === finalCode)) {
        finalCode = `${documentCode}-${counter}`;
        counter++;
      }
      documentCode = finalCode;
    }
    
    const documentId = await ctx.db.insert("documents", {
      fileStorageId: args.storageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileType: args.fileType,
      uploadedAt: uploadedAt,
      summary: args.summary,
      fileTypeDetected: args.fileTypeDetected,
      category: args.category,
      reasoning: args.reasoning,
      confidence: args.confidence,
      tokensUsed: args.tokensUsed,
      clientId: args.clientId,
      clientName: args.clientName,
      projectId: args.isBaseDocument ? undefined : args.projectId,
      projectName: args.isBaseDocument ? undefined : args.projectName,
      suggestedClientName: args.suggestedClientName,
      suggestedProjectName: args.suggestedProjectName,
      documentCode: documentCode,
      isBaseDocument: args.isBaseDocument || false,
      extractedData: args.extractedData,
      status: args.status || "completed",
      error: args.error,
      savedAt: uploadedAt,
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
    documentCode: v.optional(v.string()),
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

    // Invalidate context cache for client if changed
    const finalClientId = cleanUpdates.clientId !== undefined ? cleanUpdates.clientId : existing.clientId;
    if (finalClientId) {
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "client",
        contextId: finalClientId,
      });
    }

    // Invalidate context cache for project if changed
    const finalProjectId = cleanUpdates.projectId !== undefined ? cleanUpdates.projectId : existing.projectId;
    if (finalProjectId) {
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: finalProjectId,
      });
    }

    return id;
  },
});

// Mutation: Update document code specifically
export const updateDocumentCode = mutation({
  args: {
    id: v.id("documents"),
    documentCode: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Document not found");
    }
    
    // Check for uniqueness
    const existingDocs = await ctx.db.query("documents").collect();
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

// Mutation: Bulk update document codes for a client
export const updateDocumentCodesForClient = mutation({
  args: {
    clientId: v.id("clients"),
    documentCodePattern: v.string(), // The new pattern to apply
    excludeDocumentId: v.optional(v.id("documents")), // Optional document to exclude
  },
  handler: async (ctx, args) => {
    // Get all documents for this client
    const clientDocs = await ctx.db
      .query("documents")
      .filter((q: any) => q.eq(q.field("clientId"), args.clientId))
      .collect();
    
    // Filter out excluded document if provided
    const docsToUpdate = args.excludeDocumentId
      ? clientDocs.filter(doc => doc._id !== args.excludeDocumentId)
      : clientDocs;
    
    // Get all existing document codes to check uniqueness
    const allDocs = await ctx.db.query("documents").collect();
    const existingCodes = new Set(allDocs.map(doc => doc.documentCode).filter(Boolean));
    
    // Update each document with unique code
    const updatedIds: string[] = [];
    for (const doc of docsToUpdate) {
      let newCode = args.documentCodePattern;
      let counter = 1;
      
      // Ensure uniqueness
      while (existingCodes.has(newCode) && newCode !== doc.documentCode) {
        newCode = `${args.documentCodePattern}-${counter}`;
        counter++;
      }
      
      // Update document
      await ctx.db.patch(doc._id, { documentCode: newCode });
      existingCodes.add(newCode);
      updatedIds.push(doc._id);
    }
    
    return {
      updatedCount: updatedIds.length,
      documentIds: updatedIds,
    };
  },
});

// Mutation: Bulk update document codes for a project
export const updateDocumentCodesForProject = mutation({
  args: {
    projectId: v.id("projects"),
    documentCodePattern: v.string(), // The new pattern to apply
    excludeDocumentId: v.optional(v.id("documents")), // Optional document to exclude
  },
  handler: async (ctx, args) => {
    // Get all documents for this project
    const projectDocs = await ctx.db
      .query("documents")
      .filter((q: any) => q.eq(q.field("projectId"), args.projectId))
      .collect();
    
    // Filter out excluded document if provided
    const docsToUpdate = args.excludeDocumentId
      ? projectDocs.filter(doc => doc._id !== args.excludeDocumentId)
      : projectDocs;
    
    // Get all existing document codes to check uniqueness
    const allDocs = await ctx.db.query("documents").collect();
    const existingCodes = new Set(allDocs.map(doc => doc.documentCode).filter(Boolean));
    
    // Update each document with unique code
    const updatedIds: string[] = [];
    for (const doc of docsToUpdate) {
      let newCode = args.documentCodePattern;
      let counter = 1;
      
      // Ensure uniqueness
      while (existingCodes.has(newCode) && newCode !== doc.documentCode) {
        newCode = `${args.documentCodePattern}-${counter}`;
        counter++;
      }
      
      // Update document
      await ctx.db.patch(doc._id, { documentCode: newCode });
      existingCodes.add(newCode);
      updatedIds.push(doc._id);
    }
    
    return {
      updatedCount: updatedIds.length,
      documentIds: updatedIds,
    };
  },
});

// Mutation: Delete document
export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      return;
    }

    await ctx.db.delete(args.id);

    // Invalidate context cache for client
    if (existing.clientId) {
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "client",
        contextId: existing.clientId,
      });
    }

    // Invalidate context cache for project
    if (existing.projectId) {
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: existing.projectId,
      });
    }
  },
});

// Query: Get file URL from storage ID
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Query: Get base documents for a client
export const getBaseDocumentsByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
    
    // Filter for base documents (isBaseDocument: true and projectId is null/undefined)
    return docs.filter(doc => 
      doc.isBaseDocument === true && 
      (!doc.projectId || doc.projectId === undefined)
    );
  },
});

// Mutation: Move document between projects or to/from base documents
export const moveDocument = mutation({
  args: {
    documentId: v.id("documents"),
    targetClientId: v.id("clients"),
    targetProjectId: v.optional(v.id("projects")),
    targetProjectName: v.optional(v.string()),
    isBaseDocument: v.boolean(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error("Document not found");
    }
    
    // Validate same client constraint
    if (doc.clientId !== args.targetClientId) {
      throw new Error("Cannot move document to different client");
    }
    
    // Get client name if needed
    let clientName = doc.clientName;
    if (!clientName && args.targetClientId) {
      const client = await ctx.db.get(args.targetClientId);
      clientName = client?.name || "Unknown";
    }
    
    // Determine project name for code generation
    const projectNameForCode = args.isBaseDocument ? undefined : args.targetProjectName;
    
    // Regenerate document code based on new location
    let newDocumentCode: string | undefined = undefined;
    if (clientName) {
      newDocumentCode = generateDocumentCode(
        clientName,
        doc.category,
        projectNameForCode,
        doc.uploadedAt
      );
      
      // Ensure uniqueness
      const existingDocs = await ctx.db.query("documents").collect();
      let finalCode = newDocumentCode;
      let counter = 1;
      while (existingDocs.some(d => d._id !== args.documentId && d.documentCode === finalCode)) {
        finalCode = `${newDocumentCode}-${counter}`;
        counter++;
      }
      newDocumentCode = finalCode;
    }
    
    // Update document
    await ctx.db.patch(args.documentId, {
      projectId: args.isBaseDocument ? undefined : args.targetProjectId,
      projectName: args.isBaseDocument ? undefined : args.targetProjectName,
      isBaseDocument: args.isBaseDocument,
      documentCode: newDocumentCode || doc.documentCode,
    });
    
    return args.documentId;
  },
});
