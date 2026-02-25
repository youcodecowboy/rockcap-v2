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
  uploadedAt: string | Date,
  options?: {
    scope?: "client" | "internal" | "personal";
    uploaderInitials?: string;
  }
): string {
  const typeCode = abbreviateCategory(category);
  const dateCode = formatDateDDMMYY(uploadedAt);
  const scope = options?.scope || "client";

  // Internal scope: RC-TYPE-DATE (e.g., RC-POLICY-231215)
  if (scope === "internal") {
    return `RC-${typeCode}-${dateCode}`;
  }

  // Personal scope: INITIALS-TYPE-DATE (e.g., JS-NOTE-231215)
  if (scope === "personal") {
    const initials = options?.uploaderInitials || "XX";
    return `${initials}-${typeCode}-${dateCode}`;
  }

  // Client scope: CLIENT-TYPE-PROJECT-DATE (existing behavior)
  const clientCode = abbreviateText(clientName, 8);
  const projectCode = projectName ? abbreviateText(projectName, 10) : '';

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
        .filter((q) => q.neq(q.field("isDeleted"), true))
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
        .filter((q) => q.neq(q.field("isDeleted"), true))
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
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();
      return docs.filter(doc => {
        if (args.status && doc.status !== args.status) return false;
        return true;
      });
    } else if (args.status) {
      return await ctx.db
        .query("documents")
        .withIndex("by_status", (q: any) => q.eq("status", args.status!))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();
    } else {
      return await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    }
  },
});

// Query: Get document by ID
export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record || record.isDeleted) {
      return null;
    }
    return record;
  },
});

// Query: Get documents by client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
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
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
  },
});

// Query: Get internal documents (no client/project)
export const getInternal = query({
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    return allDocs.filter(doc => !doc.clientId && !doc.projectId);
  },
});

// Query: Get unclassified documents (no client AND no project)
export const getUnclassified = query({
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    return allDocs.filter(doc => !doc.clientId && !doc.projectId);
  },
});

// Query: Get folder statistics for clients
export const getFolderStats = query({
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    const clients = await ctx.db.query("clients").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    const projects = await ctx.db.query("projects").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    
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
    let docs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
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
    const docs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    const types = new Set(docs.map(doc => doc.fileTypeDetected));
    return Array.from(types).sort();
  },
});

// Query: Get unique categories
export const getUniqueCategories = query({
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    const categories = new Set(docs.map(doc => doc.category));
    return Array.from(categories).sort();
  },
});

// Query: Get recent documents
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    const allDocs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
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
    reasoning: v.optional(v.string()), // Optional for direct uploads
    confidence: v.optional(v.number()), // Optional for direct uploads
    tokensUsed: v.optional(v.number()), // Optional for direct uploads
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
    uploadedBy: v.optional(v.id("users")),
    // Folder filing fields
    folderId: v.optional(v.string()), // Folder type/key (e.g., "background", "custom_dubai_docs")
    folderType: v.optional(v.union(v.literal("client"), v.literal("project"))),
    isInternal: v.optional(v.boolean()),
    uploaderInitials: v.optional(v.string()),
    version: v.optional(v.string()),
    previousVersionId: v.optional(v.id("documents")),
    // Document scope (client, internal, personal)
    scope: v.optional(v.union(
      v.literal("client"),
      v.literal("internal"),
      v.literal("personal")
    )),
    ownerId: v.optional(v.id("users")), // Required for personal scope
    // Full parsed text content for re-analysis without re-uploading
    textContent: v.optional(v.string()),
    // Document analysis from AI pipeline
    documentAnalysis: v.optional(v.object({
      documentDescription: v.string(),
      documentPurpose: v.string(),
      entities: v.object({
        people: v.array(v.string()),
        companies: v.array(v.string()),
        locations: v.array(v.string()),
        projects: v.array(v.string()),
      }),
      keyTerms: v.array(v.string()),
      keyDates: v.array(v.string()),
      keyAmounts: v.array(v.string()),
      executiveSummary: v.string(),
      detailedSummary: v.string(),
      sectionBreakdown: v.optional(v.array(v.string())),
      documentCharacteristics: v.object({
        isFinancial: v.boolean(),
        isLegal: v.boolean(),
        isIdentity: v.boolean(),
        isReport: v.boolean(),
        isDesign: v.boolean(),
        isCorrespondence: v.boolean(),
        hasMultipleProjects: v.boolean(),
        isInternal: v.boolean(),
      }),
      rawContentType: v.string(),
      confidenceInAnalysis: v.number(),
    })),
    classificationReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const uploadedAt = new Date().toISOString();
    
    // Generate document code based on scope
    let documentCode = args.documentCode;
    const scope = args.scope || (args.clientId ? "client" : undefined);

    if (!documentCode) {
      // Generate code based on scope
      if (scope === "internal" || scope === "personal") {
        // Internal and personal documents use different naming convention
        documentCode = generateDocumentCode(
          "", // No client name needed
          args.category,
          undefined,
          uploadedAt,
          { scope, uploaderInitials: args.uploaderInitials }
        );
      } else if (args.clientName) {
        // Client scope: existing behavior
        const projectNameForCode = args.isBaseDocument ? undefined : args.projectName;
        documentCode = generateDocumentCode(
          args.clientName,
          args.category,
          projectNameForCode,
          uploadedAt,
          { scope: "client" }
        );
      }

      // Ensure uniqueness if code was generated
      if (documentCode) {
        const existingDocs = await ctx.db.query("documents").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
        let finalCode = documentCode;
        let counter = 1;
        while (existingDocs.some(doc => doc.documentCode === finalCode)) {
          finalCode = `${documentCode}-${counter}`;
          counter++;
        }
        documentCode = finalCode;
      }
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
      reasoning: args.reasoning || "Direct upload to folder",
      confidence: args.confidence ?? 1.0,
      tokensUsed: args.tokensUsed ?? 0,
      clientId: args.clientId,
      clientName: args.clientName,
      projectId: args.projectId,
      projectName: args.projectName,
      suggestedClientName: args.suggestedClientName,
      suggestedProjectName: args.suggestedProjectName,
      documentCode: documentCode,
      extractedData: args.extractedData,
      textContent: args.textContent,
      // Folder filing fields
      folderId: args.folderId,
      folderType: args.folderType,
      isInternal: args.isInternal ?? false,
      uploaderInitials: args.uploaderInitials,
      version: args.version,
      previousVersionId: args.previousVersionId,
      // Document scope - defaults to "client" for backwards compatibility
      scope: args.scope ?? (args.clientId ? "client" : undefined),
      ownerId: args.ownerId,
      status: args.status || "completed",
      error: args.error,
      savedAt: uploadedAt,
      uploadedBy: args.uploadedBy,
      // Document analysis from AI pipeline
      documentAnalysis: args.documentAnalysis,
      classificationReasoning: args.classificationReasoning,
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

      // Meeting extraction: Check if this is a meeting document
      const meetingTypes = ['Meeting Minutes', 'Meeting Notes', 'Minutes'];
      const fileTypeLower = args.fileTypeDetected.toLowerCase();
      const fileNameLower = args.fileName.toLowerCase();
      const isMeetingDocument = meetingTypes.some(t => t.toLowerCase() === fileTypeLower) ||
        (fileNameLower.includes('meeting') && (fileNameLower.includes('minutes') || fileNameLower.includes('notes')));

      if (isMeetingDocument && args.fileStorageId) {
        try {
          // Check if job already exists for this document
          const existingJob = await ctx.db
            .query("meetingExtractionJobs")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .first();

          if (!existingJob) {
            await ctx.db.insert("meetingExtractionJobs", {
              documentId,
              clientId: args.clientId,
              projectId: args.projectId,
              fileStorageId: args.fileStorageId,
              documentName: args.fileName,
              status: "pending",
              attempts: 0,
              maxAttempts: 3,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            // Jobs are processed by /api/process-meeting-queue (handles PDFs properly)
            console.log(`[Documents.create] 🗓️ Created meeting extraction job for "${args.fileName}"`);
          }
        } catch (error) {
          console.error("[Documents.create] Failed to create meeting extraction job:", error);
        }
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
    uploadedBy: v.optional(v.id("users")),
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
      const existingDocs = await ctx.db.query("documents").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
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
      uploadedBy: args.uploadedBy,
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
    summary: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
    error: v.optional(v.string()),
    documentCode: v.optional(v.string()),
    // Folder assignment
    folderId: v.optional(v.union(v.string(), v.null())),
    folderType: v.optional(v.union(v.literal("client"), v.literal("project"), v.null())),
    // Full parsed text content for re-analysis
    textContent: v.optional(v.string()),
    // Intelligence flag
    addedToIntelligence: v.optional(v.boolean()),
    // Document analysis from AI pipeline
    documentAnalysis: v.optional(v.object({
      documentDescription: v.string(),
      documentPurpose: v.string(),
      entities: v.object({
        people: v.array(v.string()),
        companies: v.array(v.string()),
        locations: v.array(v.string()),
        projects: v.array(v.string()),
      }),
      keyTerms: v.array(v.string()),
      keyDates: v.array(v.string()),
      keyAmounts: v.array(v.string()),
      executiveSummary: v.string(),
      detailedSummary: v.string(),
      sectionBreakdown: v.optional(v.array(v.string())),
      documentCharacteristics: v.object({
        isFinancial: v.boolean(),
        isLegal: v.boolean(),
        isIdentity: v.boolean(),
        isReport: v.boolean(),
        isDesign: v.boolean(),
        isCorrespondence: v.boolean(),
        hasMultipleProjects: v.boolean(),
        isInternal: v.boolean(),
      }),
      rawContentType: v.string(),
      confidenceInAnalysis: v.number(),
    })),
    classificationReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Document not found");
    }

    // Validate folder assignment if being updated
    const newFolderId = updates.folderId !== undefined ? updates.folderId : existing.folderId;
    const newFolderType = updates.folderType !== undefined ? updates.folderType : existing.folderType;
    const newClientId = updates.clientId !== undefined ? updates.clientId : existing.clientId;
    const newProjectId = updates.projectId !== undefined ? updates.projectId : existing.projectId;

    if (newFolderId && newFolderType && newClientId) {
      // Validate folderType-projectId logic
      if (newFolderType === "project" && !newProjectId) {
        throw new Error("Project folder requires a projectId");
      }

      // Validate folder exists
      if (newFolderType === "project" && newProjectId) {
        const projectFolder = await ctx.db
          .query("projectFolders")
          .withIndex("by_project_type", (q: any) =>
            q.eq("projectId", newProjectId).eq("folderType", newFolderId)
          )
          .first();
        if (!projectFolder) {
          throw new Error(`Folder "${newFolderId}" does not exist for this project`);
        }
      } else if (newFolderType === "client") {
        const clientFolder = await ctx.db
          .query("clientFolders")
          .withIndex("by_client_type", (q: any) =>
            q.eq("clientId", newClientId).eq("folderType", newFolderId)
          )
          .first();
        if (!clientFolder) {
          throw new Error(`Folder "${newFolderId}" does not exist for this client`);
        }
      }
    }

    // Clean updates to handle null values
    const cleanUpdates: any = {};
    Object.keys(updates).forEach(key => {
      const value = (updates as any)[key];
      if (value !== undefined) {
        // Convert null to undefined for optional fields
        if (value === null && (key === 'clientId' || key === 'projectId' || key === 'folderId' || key === 'folderType')) {
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

    // If projectId changed, update any associated codified extraction
    if (cleanUpdates.projectId !== undefined && cleanUpdates.projectId !== existing.projectId) {
      const extraction = await ctx.db
        .query("codifiedExtractions")
        .withIndex("by_document", (q) => q.eq("documentId", id))
        .first();
      
      if (extraction) {
        await ctx.db.patch(extraction._id, {
          projectId: cleanUpdates.projectId,
        });
        
        // If extraction is confirmed and now has a projectId, trigger merge
        if (cleanUpdates.projectId && extraction.isFullyConfirmed && !extraction.mergedToProjectLibrary && extraction.items.length > 0) {
          await ctx.scheduler.runAfter(0, api.projectDataLibrary.mergeExtractionToLibrary, {
            extractionId: extraction._id,
            projectId: cleanUpdates.projectId,
            documentId: id,
            documentName: existing.fileName,
          });
        }
      }
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
    const existingDocs = await ctx.db.query("documents").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
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
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .collect();

    // Filter out excluded document if provided
    const docsToUpdate = args.excludeDocumentId
      ? clientDocs.filter(doc => doc._id !== args.excludeDocumentId)
      : clientDocs;

    // Get all existing document codes to check uniqueness
    const allDocs = await ctx.db.query("documents").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
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
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .collect();

    // Filter out excluded document if provided
    const docsToUpdate = args.excludeDocumentId
      ? projectDocs.filter(doc => doc._id !== args.excludeDocumentId)
      : projectDocs;

    // Get all existing document codes to check uniqueness
    const allDocs = await ctx.db.query("documents").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
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

    await ctx.db.patch(args.id, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedReason: "user_deleted",
    });

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
      .filter((q) => q.neq(q.field("isDeleted"), true))
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
    if (!doc || doc.isDeleted) {
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
      const existingDocs = await ctx.db.query("documents").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
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

// Mutation: Move document between scopes (client/internal/personal)
export const moveDocumentCrossScope = mutation({
  args: {
    documentId: v.id("documents"),
    targetScope: v.union(v.literal("client"), v.literal("internal"), v.literal("personal")),
    // For client scope
    targetClientId: v.optional(v.id("clients")),
    targetProjectId: v.optional(v.id("projects")),
    targetIsBaseDocument: v.optional(v.boolean()),
    // For folder assignment (all scopes)
    targetFolderId: v.optional(v.string()),
    targetFolderType: v.optional(v.union(v.literal("client"), v.literal("project"))),
  },
  handler: async (ctx, args) => {
    // 1. Authentication check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // 2. Get document
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.isDeleted) {
      throw new Error("Document not found");
    }

    // 3. Permission check for personal docs
    if (doc.scope === "personal" && doc.ownerId !== user._id) {
      throw new Error("You can only move your own personal documents");
    }

    // 4. Validate target location
    let clientName: string | undefined;
    let projectName: string | undefined;

    if (args.targetScope === "client") {
      if (!args.targetClientId) {
        throw new Error("Client ID required for client scope");
      }
      const client = await ctx.db.get(args.targetClientId);
      if (!client) {
        throw new Error("Target client not found");
      }
      clientName = client.name;

      if (args.targetProjectId) {
        const project = await ctx.db.get(args.targetProjectId);
        if (!project) {
          throw new Error("Target project not found");
        }
        projectName = project.name;
      }
    } else if (args.targetScope === "internal" && args.targetFolderId) {
      // Validate internal folder exists
      const folder = await ctx.db
        .query("internalFolders")
        .withIndex("by_type", (q: any) => q.eq("folderType", args.targetFolderId))
        .first();
      if (!folder) {
        throw new Error("Target internal folder not found");
      }
    } else if (args.targetScope === "personal" && args.targetFolderId) {
      // Validate personal folder exists for this user
      const folder = await ctx.db
        .query("personalFolders")
        .withIndex("by_user_type", (q: any) =>
          q.eq("userId", user._id).eq("folderType", args.targetFolderId)
        )
        .first();
      if (!folder) {
        throw new Error("Target personal folder not found");
      }
    }

    // 5. Generate new document code based on target scope
    const uploaderInitials = user.name
      ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : "XX";

    let newDocumentCode = generateDocumentCode(
      clientName || "Unknown",
      doc.category,
      projectName,
      doc.uploadedAt,
      { scope: args.targetScope, uploaderInitials }
    );

    // Ensure uniqueness
    const existingDocs = await ctx.db.query("documents").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
    let finalCode = newDocumentCode;
    let counter = 1;
    while (existingDocs.some(d => d._id !== args.documentId && d.documentCode === finalCode)) {
      finalCode = `${newDocumentCode}-${counter}`;
      counter++;
    }
    newDocumentCode = finalCode;

    // 6. Build update object based on target scope
    const updates: Record<string, any> = {
      scope: args.targetScope,
      documentCode: newDocumentCode,
      folderId: args.targetFolderId,
    };

    if (args.targetScope === "client") {
      updates.clientId = args.targetClientId;
      updates.clientName = clientName;
      updates.projectId = args.targetIsBaseDocument ? undefined : args.targetProjectId;
      updates.projectName = args.targetIsBaseDocument ? undefined : projectName;
      updates.isBaseDocument = args.targetIsBaseDocument ?? !args.targetProjectId;
      updates.folderType = args.targetFolderType;
      updates.ownerId = undefined;
    } else if (args.targetScope === "internal") {
      updates.clientId = undefined;
      updates.clientName = undefined;
      updates.projectId = undefined;
      updates.projectName = undefined;
      updates.isBaseDocument = undefined;
      updates.folderType = undefined;
      updates.ownerId = undefined;
      updates.suggestedClientName = undefined;
      updates.suggestedProjectName = undefined;
    } else if (args.targetScope === "personal") {
      updates.clientId = undefined;
      updates.clientName = undefined;
      updates.projectId = undefined;
      updates.projectName = undefined;
      updates.isBaseDocument = undefined;
      updates.folderType = undefined;
      updates.ownerId = user._id;
      updates.suggestedClientName = undefined;
      updates.suggestedProjectName = undefined;
    }

    // 7. Update document
    await ctx.db.patch(args.documentId, updates);

    // 8. Update related codified extractions
    const codifiedExtractions = await ctx.db
      .query("codifiedExtractions")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();

    for (const extraction of codifiedExtractions) {
      if (args.targetScope === "client" && args.targetProjectId && !args.targetIsBaseDocument) {
        await ctx.db.patch(extraction._id, { projectId: args.targetProjectId });
      } else {
        // Clear project ID for internal/personal or base documents
        await ctx.db.patch(extraction._id, { projectId: undefined });
      }
    }

    return { documentId: args.documentId, newDocumentCode };
  },
});

// Mutation: Mark document as opened (for document reader tracking)
export const markAsOpened = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    let userId = undefined;

    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
        .first();
      userId = user?._id;
    }

    const now = new Date().toISOString();

    await ctx.db.patch(args.documentId, {
      lastOpenedAt: now,
      lastOpenedBy: userId,
    });

    return args.documentId;
  },
});

// Query: Get extraction history for a project
export const getExtractionHistory = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // Get all documents for this project
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    // Get all extractions for these documents
    const allExtractions = await ctx.db.query("documentExtractions").collect();
    
    // Filter to extractions for documents in this project
    const documentIds = new Set(documents.map(d => d._id));
    const projectExtractions = allExtractions.filter(e => 
      documentIds.has(e.documentId) || e.projectId === args.projectId
    );
    
    // Sort by extractedAt (most recent first)
    projectExtractions.sort((a, b) => 
      new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime()
    );
    
    // Group by document
    const groupedByDocument = new Map<string, typeof projectExtractions>();
    projectExtractions.forEach(extraction => {
      const docId = extraction.documentId;
      if (!groupedByDocument.has(docId)) {
        groupedByDocument.set(docId, []);
      }
      groupedByDocument.get(docId)!.push(extraction);
    });
    
    // Get document details
    const result = Array.from(groupedByDocument.entries()).map(([documentId, extractions]) => {
      const document = documents.find(d => d._id === documentId);
      return {
        documentId,
        document: document ? {
          _id: document._id,
          fileName: document.fileName,
          uploadedAt: document.uploadedAt,
        } : null,
        extractions: extractions.map(e => ({
          _id: e._id,
          version: e.version,
          extractedAt: e.extractedAt,
          sourceFileName: e.sourceFileName,
        })),
        latestExtraction: extractions[0], // Most recent is first
      };
    });
    
    return result;
  },
});

// ============================================================================
// DOCUMENT LIBRARY QUERIES - For new 3-pane document browser
// ============================================================================

// Query: Get unfiled documents (unified inbox across all scopes)
// Returns: client docs without clientId, internal docs without folderId, personal docs without folderId
export const getUnfiled = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    const allDocs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();

    // Get current user for personal document access
    let currentUserId: string | null = null;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
        .first();
      currentUserId = user?._id ?? null;
    }

    return allDocs.filter(doc => {
      const scope = doc.scope || "client";

      // Client scope: unfiled = no clientId
      if (scope === "client") {
        return !doc.clientId;
      }

      // Internal scope: unfiled = no folderId
      if (scope === "internal") {
        return !doc.folderId;
      }

      // Personal scope: unfiled = no folderId AND belongs to current user
      if (scope === "personal") {
        if (!currentUserId || doc.ownerId !== currentUserId) {
          return false; // Don't show other users' personal docs
        }
        return !doc.folderId;
      }

      return false;
    });
  },
});

// Query: Get count of unfiled documents
export const getUnfiledCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    const allDocs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();

    // Get current user for personal document access
    let currentUserId: string | null = null;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
        .first();
      currentUserId = user?._id ?? null;
    }

    return allDocs.filter(doc => {
      const scope = doc.scope || "client";

      if (scope === "client") {
        return !doc.clientId;
      }

      if (scope === "internal") {
        return !doc.folderId;
      }

      if (scope === "personal") {
        if (!currentUserId || doc.ownerId !== currentUserId) {
          return false;
        }
        return !doc.folderId;
      }

      return false;
    }).length;
  },
});

// Query: Get documents by folder (client or project level)
export const getByFolder = query({
  args: {
    clientId: v.id("clients"),
    folderType: v.string(),
    level: v.union(v.literal("client"), v.literal("project")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (args.level === "project") {
      if (!args.projectId) {
        return [];
      }
      // Get documents for this project and folder type
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();

      // Filter for documents in this specific folder within the project
      return docs.filter(doc => doc.folderId === args.folderType);
    } else {
      // Client-level folder
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();
      
      // Filter for documents in this folder that are NOT in a project
      return docs.filter(doc =>
        doc.folderId === args.folderType &&
        doc.folderType === "client" &&
        !doc.projectId
      );
    }
  },
});

// Query: Get documents by scope (for internal and personal documents)
export const getByScope = query({
  args: {
    scope: v.union(v.literal("internal"), v.literal("personal")),
    folderId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Get current user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    if (args.scope === "internal") {
      // Internal documents - accessible to all authenticated users
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_scope", (q: any) => q.eq("scope", "internal"))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();

      // Filter by folder if provided
      if (args.folderId) {
        return docs.filter(doc => doc.folderId === args.folderId);
      }

      return docs;
    }

    if (args.scope === "personal") {
      // Personal documents - only show user's own documents
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_scope_owner", (q: any) =>
          q.eq("scope", "personal").eq("ownerId", user._id)
        )
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();

      // Filter by folder if provided
      if (args.folderId) {
        return docs.filter(doc => doc.folderId === args.folderId);
      }

      return docs;
    }

    return [];
  },
});

// Query: Get internal document counts per folder
export const getInternalDocumentCounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {};
    }

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_scope", (q: any) => q.eq("scope", "internal"))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    const counts: Record<string, number> = {};
    for (const doc of docs) {
      const folderId = doc.folderId || "miscellaneous";
      counts[folderId] = (counts[folderId] || 0) + 1;
    }

    return counts;
  },
});

// Query: Get personal document counts per folder for current user
export const getPersonalDocumentCounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {};
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return {};
    }

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_scope_owner", (q: any) =>
        q.eq("scope", "personal").eq("ownerId", user._id)
      )
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    const counts: Record<string, number> = {};
    for (const doc of docs) {
      const folderId = doc.folderId || "my_documents";
      counts[folderId] = (counts[folderId] || 0) + 1;
    }

    return counts;
  },
});

// Query: Get document counts per client
export const getClientDocumentCounts = query({
  args: {},
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    const counts: Record<string, number> = {};

    for (const doc of allDocs) {
      if (doc.clientId) {
        counts[doc.clientId] = (counts[doc.clientId] || 0) + 1;
      }
    }

    return counts;
  },
});

// Query: Get folder counts for a client (both client-level and project-level)
export const getFolderCounts = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    const clientFolders: Record<string, number> = {};
    const projectFolders: Record<string, Record<string, number>> = {};
    
    for (const doc of docs) {
      if (doc.projectId) {
        // Project-level document
        if (!projectFolders[doc.projectId]) {
          projectFolders[doc.projectId] = {};
        }
        const folderKey = doc.folderId || 'uncategorized';
        projectFolders[doc.projectId][folderKey] = (projectFolders[doc.projectId][folderKey] || 0) + 1;
      } else if (doc.folderId && doc.folderType === 'client') {
        // Client-level document
        clientFolders[doc.folderId] = (clientFolders[doc.folderId] || 0) + 1;
      }
    }
    
    return { clientFolders, projectFolders };
  },
});

// Query: Get project folder counts for all projects under a client
export const getProjectFolderCounts = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get all projects for this client
    const allProjects = await ctx.db.query("projects").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    const clientProjects = allProjects.filter(p =>
      p.clientRoles.some(cr => cr.clientId === args.clientId)
    );

    // Get all documents for this client
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    
    // Build counts per project
    const result: Record<string, { folders: Record<string, number>; total: number }> = {};
    
    for (const project of clientProjects) {
      result[project._id] = { folders: {}, total: 0 };
    }
    
    for (const doc of docs) {
      if (doc.projectId && result[doc.projectId]) {
        const folderKey = doc.folderId || 'uncategorized';
        result[doc.projectId].folders[folderKey] = (result[doc.projectId].folders[folderKey] || 0) + 1;
        result[doc.projectId].total++;
      }
    }

    return result;
  },
});

// =============================================================================
// SAVE DOCUMENT INTELLIGENCE
// =============================================================================
// Saves extracted intelligence fields to the knowledgeItems table.
// Called after the lightweight /api/extract-intelligence route runs.
// Handles deduplication: if a knowledgeItem with the same fieldPath + sourceDocumentId
// already exists, it supersedes the old one rather than creating duplicates.

export const saveDocumentIntelligence = mutation({
  args: {
    documentId: v.id("documents"),
    fields: v.array(v.object({
      fieldPath: v.string(),
      label: v.string(),
      value: v.any(),
      valueType: v.string(),
      confidence: v.number(),
      sourceText: v.optional(v.string()),
      scope: v.string(),
      isCanonical: v.boolean(),
      category: v.string(),
      originalLabel: v.optional(v.string()),
      templateTags: v.optional(v.array(v.string())),
      pageReference: v.optional(v.string()),
    })),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");

    const now = new Date().toISOString();
    let fieldsAdded = 0;
    let fieldsUpdated = 0;

    for (const field of args.fields) {
      try {
        const targetClientId = field.scope === 'client' ? (args.clientId || document.clientId) : undefined;
        const targetProjectId = field.scope === 'project' ? (args.projectId || document.projectId) : undefined;

        // Check for existing item with same fieldPath from same document
        const existingFromDoc = await ctx.db
          .query("knowledgeItems")
          .withIndex("by_source_document", (q: any) => q.eq("sourceDocumentId", args.documentId))
          .filter((q: any) => q.eq(q.field("fieldPath"), field.fieldPath))
          .first();

        if (existingFromDoc) {
          // Update existing item from same document
          await ctx.db.patch(existingFromDoc._id, {
            value: field.value,
            valueType: field.valueType as any,
            label: field.label,
            sourceText: field.sourceText,
            normalizationConfidence: field.confidence,
            tags: field.templateTags || ['general'],
            updatedAt: now,
          });
          fieldsUpdated++;
        } else {
          // Check for existing item with same fieldPath from a different source
          let existingItem = null;
          if (targetProjectId) {
            existingItem = await ctx.db
              .query("knowledgeItems")
              .withIndex("by_project_field", (q: any) => q.eq("projectId", targetProjectId).eq("fieldPath", field.fieldPath))
              .filter((q: any) => q.eq(q.field("status"), "active"))
              .first();
          } else if (targetClientId) {
            existingItem = await ctx.db
              .query("knowledgeItems")
              .withIndex("by_client_field", (q: any) => q.eq("clientId", targetClientId).eq("fieldPath", field.fieldPath))
              .filter((q: any) => q.eq(q.field("status"), "active"))
              .first();
          }

          if (existingItem && field.confidence > (existingItem.normalizationConfidence || 0.5)) {
            // Higher confidence — supersede old item
            const newItemId = await ctx.db.insert("knowledgeItems", {
              clientId: targetClientId,
              projectId: targetProjectId,
              fieldPath: field.fieldPath,
              isCanonical: field.isCanonical,
              category: field.category,
              label: field.label,
              value: field.value,
              valueType: field.valueType as any,
              status: "active",
              sourceType: "ai_extraction",
              sourceDocumentId: args.documentId,
              sourceDocumentName: document.fileName,
              sourceText: field.sourceText,
              originalLabel: field.originalLabel,
              normalizationConfidence: field.confidence,
              tags: field.templateTags || ['general'],
              addedAt: now,
              updatedAt: now,
            });
            await ctx.db.patch(existingItem._id, {
              status: "superseded",
              supersededBy: newItemId,
              updatedAt: now,
            });
            fieldsUpdated++;
          } else if (!existingItem) {
            // New field — create
            await ctx.db.insert("knowledgeItems", {
              clientId: targetClientId,
              projectId: targetProjectId,
              fieldPath: field.fieldPath,
              isCanonical: field.isCanonical,
              category: field.category,
              label: field.label,
              value: field.value,
              valueType: field.valueType as any,
              status: "active",
              sourceType: "ai_extraction",
              sourceDocumentId: args.documentId,
              sourceDocumentName: document.fileName,
              sourceText: field.sourceText,
              originalLabel: field.originalLabel,
              normalizationConfidence: field.confidence,
              tags: field.templateTags || ['general'],
              addedAt: now,
              updatedAt: now,
            });
            fieldsAdded++;
          }
          // else: existing item has higher confidence, skip
        }
      } catch (fieldError) {
        console.error(`[saveDocumentIntelligence] Error saving field ${field.fieldPath}:`, fieldError);
      }
    }

    // Mark document as having intelligence
    await ctx.db.patch(args.documentId, { addedToIntelligence: true });

    console.log(`[saveDocumentIntelligence] "${document.fileName}": ${fieldsAdded} added, ${fieldsUpdated} updated`);
    return { fieldsAdded, fieldsUpdated };
  },
});

// Query: Get knowledge items extracted from a specific document
export const getDocumentIntelligence = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knowledgeItems")
      .withIndex("by_source_document", (q: any) => q.eq("sourceDocumentId", args.documentId))
      .filter((q: any) => q.neq(q.field("status"), "superseded"))
      .collect();
  },
});
