import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Mutation: Create knowledge bank entry from document
export const createFromDocument = mutation({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    documentId: v.id("documents"),
    entryType: v.union(
      v.literal("deal_update"),
      v.literal("call_transcript"),
      v.literal("email"),
      v.literal("document_summary"),
      v.literal("project_status"),
      v.literal("general")
    ),
    title: v.string(),
    content: v.string(),
    keyPoints: v.array(v.string()),
    metadata: v.optional(v.any()),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const entryId = await ctx.db.insert("knowledgeBankEntries", {
      clientId: args.clientId,
      projectId: args.projectId,
      sourceType: "document",
      sourceId: args.documentId,
      entryType: args.entryType,
      title: args.title,
      content: args.content,
      keyPoints: args.keyPoints,
      metadata: args.metadata,
      tags: args.tags,
      createdAt: now,
      updatedAt: now,
    });
    return entryId;
  },
});

// Mutation: Sync knowledge entries - create entries for clients/projects/documents that don't have them
export const syncKnowledgeEntries = mutation({
  handler: async (ctx) => {
    const results = {
      clientsCreated: 0,
      projectsCreated: 0,
      documentsCreated: 0,
      errors: [] as string[],
    };

    try {
      // Get all clients
      const clients = await ctx.db.query("clients").collect();
      
      // Get all projects
      const projects = await ctx.db.query("projects").collect();
      
      // Get all documents
      const documents = await ctx.db.query("documents").collect();

      // Get existing knowledge bank entries
      const existingEntries = await ctx.db.query("knowledgeBankEntries").collect();
      const entriesByClient = new Map<string, Set<string>>();
      const entriesByProject = new Map<string, Set<string>>();
      const entriesByDocument = new Map<string, boolean>();

      existingEntries.forEach(entry => {
        // Track client entries
        if (!entriesByClient.has(entry.clientId)) {
          entriesByClient.set(entry.clientId, new Set());
        }
        entriesByClient.get(entry.clientId)!.add(entry.entryType);

        // Track project entries
        if (entry.projectId) {
          if (!entriesByProject.has(entry.projectId)) {
            entriesByProject.set(entry.projectId, new Set());
          }
          entriesByProject.get(entry.projectId)!.add(entry.entryType);
        }

        // Track document entries
        if (entry.sourceId && entry.sourceType === "document") {
          entriesByDocument.set(entry.sourceId, true);
        }
      });

      // Create client-level summary entries for clients without them
      for (const client of clients) {
        const clientEntries = entriesByClient.get(client._id);
        if (!clientEntries || !clientEntries.has("general")) {
          try {
            const now = new Date().toISOString();
            await ctx.db.insert("knowledgeBankEntries", {
              clientId: client._id,
              sourceType: "manual",
              entryType: "general",
              title: `${client.name} - Overview`,
              content: `Client overview for ${client.name}. ${client.companyName ? `Company: ${client.companyName}. ` : ''}${client.notes || ''}`,
              keyPoints: [
                client.companyName ? `Company: ${client.companyName}` : '',
                client.type ? `Type: ${client.type}` : '',
                client.status ? `Status: ${client.status}` : '',
              ].filter(Boolean),
              metadata: {
                clientName: client.name,
                companyName: client.companyName,
                type: client.type,
                status: client.status,
              },
              tags: [client.type || 'client', client.status || 'active'].filter(Boolean),
              createdAt: now,
              updatedAt: now,
            });
            results.clientsCreated++;
          } catch (error) {
            results.errors.push(`Failed to create entry for client ${client.name}: ${error}`);
          }
        }
      }

      // Create project-level entries for projects without them
      for (const project of projects) {
        const projectEntries = entriesByProject.get(project._id);
        if (!projectEntries || !projectEntries.has("project_status")) {
          try {
            // Find client for this project
            const clientId = project.clientRoles[0]?.clientId;
            if (!clientId) continue;

            const now = new Date().toISOString();
            await ctx.db.insert("knowledgeBankEntries", {
              clientId: clientId,
              projectId: project._id,
              sourceType: "manual",
              entryType: "project_status",
              title: `${project.name} - Project Overview`,
              content: `Project overview for ${project.name}. ${project.description || ''} ${project.notes || ''}`,
              keyPoints: [
                project.status ? `Status: ${project.status}` : '',
                project.lifecycleStage ? `Lifecycle: ${project.lifecycleStage}` : '',
                project.loanAmount ? `Loan Amount: ${project.loanAmount}` : '',
                project.interestRate ? `Interest Rate: ${project.interestRate}` : '',
              ].filter(Boolean),
              metadata: {
                projectName: project.name,
                status: project.status,
                lifecycleStage: project.lifecycleStage,
                loanAmount: project.loanAmount,
                interestRate: project.interestRate,
              },
              tags: ['project', project.status || 'active'].filter(Boolean),
              createdAt: now,
              updatedAt: now,
            });
            results.projectsCreated++;
          } catch (error) {
            results.errors.push(`Failed to create entry for project ${project.name}: ${error}`);
          }
        }
      }

      // Create document-level entries for documents without them
      for (const document of documents) {
        if (!document.clientId) continue;
        if (entriesByDocument.has(document._id)) continue;

        try {
          const now = new Date().toISOString();
          
          // Determine entry type
          let entryType: "deal_update" | "call_transcript" | "email" | "document_summary" | "project_status" | "general" = "document_summary";
          const categoryLower = document.category.toLowerCase();
          const fileNameLower = document.fileName.toLowerCase();
          
          if (categoryLower.includes("deal") || categoryLower.includes("loan") || categoryLower.includes("term")) {
            entryType = "deal_update";
          } else if (categoryLower.includes("project") || categoryLower.includes("development")) {
            entryType = "project_status";
          } else if (fileNameLower.includes("call") || fileNameLower.includes("transcript")) {
            entryType = "call_transcript";
          } else if (categoryLower.includes("email") || fileNameLower.includes("email")) {
            entryType = "email";
          }

          // Extract key points
          const keyPoints: string[] = [];
          const summaryLines = document.summary.split(/[.!?]\s+/).filter(line => line.trim().length > 0);
          keyPoints.push(...summaryLines.slice(0, 5).map(line => line.trim()));

          // Extract metadata
          const metadata: any = {};
          if (document.extractedData) {
            if (document.extractedData.loanAmount) metadata.loanAmount = document.extractedData.loanAmount;
            if (document.extractedData.interestRate) metadata.interestRate = document.extractedData.interestRate;
            if (document.extractedData.loanNumber) metadata.loanNumber = document.extractedData.loanNumber;
            if (document.extractedData.costsTotal) metadata.costsTotal = document.extractedData.costsTotal;
            if (document.extractedData.detectedCurrency) metadata.currency = document.extractedData.detectedCurrency;
          }

          await ctx.db.insert("knowledgeBankEntries", {
            clientId: document.clientId,
            projectId: document.projectId,
            sourceType: "document",
            sourceId: document._id,
            entryType: entryType,
            title: `${document.fileName} - ${document.category}`,
            content: document.summary,
            keyPoints: keyPoints,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            tags: [document.category, document.fileTypeDetected].filter(Boolean),
            createdAt: now,
            updatedAt: now,
          });
          results.documentsCreated++;
        } catch (error) {
          results.errors.push(`Failed to create entry for document ${document.fileName}: ${error}`);
        }
      }

      return results;
    } catch (error) {
      results.errors.push(`Sync failed: ${error}`);
      return results;
    }
  },
});

// Mutation: Create knowledge bank entry from email (prepared for Gmail integration)
export const createFromEmail = mutation({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    emailId: v.string(), // Will be prospectingEmails ID or external email ID
    entryType: v.union(
      v.literal("deal_update"),
      v.literal("call_transcript"),
      v.literal("email"),
      v.literal("document_summary"),
      v.literal("project_status"),
      v.literal("general")
    ),
    title: v.string(),
    content: v.string(),
    keyPoints: v.array(v.string()),
    metadata: v.optional(v.any()),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const entryId = await ctx.db.insert("knowledgeBankEntries", {
      clientId: args.clientId,
      projectId: args.projectId,
      sourceType: "email",
      sourceId: args.emailId,
      entryType: args.entryType,
      title: args.title,
      content: args.content,
      keyPoints: args.keyPoints,
      metadata: args.metadata,
      tags: args.tags,
      createdAt: now,
      updatedAt: now,
    });
    return entryId;
  },
});

// Mutation: Create manual knowledge bank entry
export const createManual = mutation({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    entryType: v.union(
      v.literal("deal_update"),
      v.literal("call_transcript"),
      v.literal("email"),
      v.literal("document_summary"),
      v.literal("project_status"),
      v.literal("general")
    ),
    title: v.string(),
    content: v.string(),
    keyPoints: v.array(v.string()),
    metadata: v.optional(v.any()),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const entryId = await ctx.db.insert("knowledgeBankEntries", {
      clientId: args.clientId,
      projectId: args.projectId,
      sourceType: "manual",
      entryType: args.entryType,
      title: args.title,
      content: args.content,
      keyPoints: args.keyPoints,
      metadata: args.metadata,
      tags: args.tags,
      createdAt: now,
      updatedAt: now,
    });
    return entryId;
  },
});

// Query: Get knowledge bank entries by client
export const getByClient = query({
  args: {
    clientId: v.id("clients"),
    entryType: v.optional(v.union(
      v.literal("deal_update"),
      v.literal("call_transcript"),
      v.literal("email"),
      v.literal("document_summary"),
      v.literal("project_status"),
      v.literal("general")
    )),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    let entries = await ctx.db
      .query("knowledgeBankEntries")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    // Filter by entryType if provided
    if (args.entryType) {
      entries = entries.filter(e => e.entryType === args.entryType);
    }

    // Filter by tags if provided
    if (args.tags && args.tags.length > 0) {
      entries = entries.filter(e => 
        args.tags!.some(tag => e.tags.includes(tag))
      );
    }

    // Sort by createdAt descending (newest first)
    return entries.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
});

// Query: Get knowledge bank entries by project
export const getByProject = query({
  args: {
    projectId: v.id("projects"),
    entryType: v.optional(v.union(
      v.literal("deal_update"),
      v.literal("call_transcript"),
      v.literal("email"),
      v.literal("document_summary"),
      v.literal("project_status"),
      v.literal("general")
    )),
  },
  handler: async (ctx, args) => {
    let entries = await ctx.db
      .query("knowledgeBankEntries")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Filter by entryType if provided
    if (args.entryType) {
      entries = entries.filter(e => e.entryType === args.entryType);
    }

    // Sort by createdAt descending (newest first)
    return entries.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
});

// Query: Get knowledge bank entry by ID
export const get = query({
  args: { id: v.id("knowledgeBankEntries") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Mutation: Update knowledge bank entry
export const update = mutation({
  args: {
    id: v.id("knowledgeBankEntries"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    keyPoints: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    tags: v.optional(v.array(v.string())),
    entryType: v.optional(v.union(
      v.literal("deal_update"),
      v.literal("call_transcript"),
      v.literal("email"),
      v.literal("document_summary"),
      v.literal("project_status"),
      v.literal("general")
    )),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Knowledge bank entry not found");
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return id;
  },
});

// Mutation: Delete knowledge bank entry
export const remove = mutation({
  args: { id: v.id("knowledgeBankEntries") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Query: Aggregate client summary - comprehensive summary of all client information
export const aggregateClientSummary = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get all knowledge bank entries for the client
    const entries = await ctx.db
      .query("knowledgeBankEntries")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    // Get client info
    const client = await ctx.db.get(args.clientId);
    if (!client) {
      throw new Error("Client not found");
    }

    // Get related projects
    const projects = await ctx.db
      .query("projects")
      .collect();
    const relatedProjects = projects.filter(p => 
      p.clientRoles.some(cr => cr.clientId === args.clientId)
    );

    // Group entries by type
    const entriesByType: Record<string, typeof entries> = {};
    entries.forEach(entry => {
      if (!entriesByType[entry.entryType]) {
        entriesByType[entry.entryType] = [];
      }
      entriesByType[entry.entryType].push(entry);
    });

    // Extract all key points
    const allKeyPoints = entries.flatMap(e => e.keyPoints);

    // Extract all tags
    const allTags = Array.from(new Set(entries.flatMap(e => e.tags)));

    // Get most recent deal updates
    const dealUpdates = entries
      .filter(e => e.entryType === "deal_update")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    // Get most recent project status updates
    const projectStatusUpdates = entries
      .filter(e => e.entryType === "project_status")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return {
      client,
      totalEntries: entries.length,
      entriesByType,
      allKeyPoints,
      allTags,
      recentDealUpdates: dealUpdates,
      recentProjectStatusUpdates: projectStatusUpdates,
      relatedProjects: relatedProjects.map(p => ({
        id: p._id,
        name: p.name,
        status: p.status,
        lifecycleStage: p.lifecycleStage,
      })),
      lastUpdated: entries.length > 0 
        ? entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0].updatedAt
        : null,
    };
  },
});

// Query: Search knowledge bank entries
export const search = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    query: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    entryType: v.optional(v.union(
      v.literal("deal_update"),
      v.literal("call_transcript"),
      v.literal("email"),
      v.literal("document_summary"),
      v.literal("project_status"),
      v.literal("general")
    )),
  },
  handler: async (ctx, args) => {
    let entries;

    // Start with appropriate index
    if (args.clientId) {
      entries = await ctx.db
        .query("knowledgeBankEntries")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect();
    } else if (args.projectId) {
      entries = await ctx.db
        .query("knowledgeBankEntries")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      entries = await ctx.db
        .query("knowledgeBankEntries")
        .collect();
    }

    // Filter by entryType if provided
    if (args.entryType) {
      entries = entries.filter(e => e.entryType === args.entryType);
    }

    // Filter by tags if provided
    if (args.tags && args.tags.length > 0) {
      entries = entries.filter(e => 
        args.tags!.some(tag => e.tags.includes(tag))
      );
    }

    // Search by query string (case-insensitive)
    if (args.query) {
      const queryLower = args.query.toLowerCase();
      entries = entries.filter(e => 
        e.title.toLowerCase().includes(queryLower) ||
        e.content.toLowerCase().includes(queryLower) ||
        e.keyPoints.some(kp => kp.toLowerCase().includes(queryLower)) ||
        e.tags.some(tag => tag.toLowerCase().includes(queryLower))
      );
    }

    // Sort by createdAt descending (newest first)
    return entries.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
});
