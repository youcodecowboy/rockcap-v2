import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all projects
export const list = query({
  args: {
    clientId: v.optional(v.id("clients")),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("completed"),
      v.literal("on-hold"),
      v.literal("cancelled")
    )),
  },
  handler: async (ctx, args) => {
    // Note: clientId filtering happens in memory since we can't index on array elements
    // For better performance with many projects, consider denormalizing client relationships
    let projects = await ctx.db.query("projects").collect();
    
    if (args.clientId) {
      projects = projects.filter(p => 
        p.clientRoles.some(cr => cr.clientId === args.clientId)
      );
    }
    
    if (args.status) {
      projects = projects.filter(p => p.status === args.status);
    }
    
    return projects;
  },
});

// Query: Get project by ID
export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get projects by client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const allProjects = await ctx.db.query("projects").collect();
    return allProjects.filter(p => 
      p.clientRoles.some(cr => cr.clientId === args.clientId)
    );
  },
});

// Mutation: Create project
export const create = mutation({
  args: {
    name: v.string(),
    clientRoles: v.array(v.object({
      clientId: v.id("clients"),
      role: v.string(),
    })),
    description: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("completed"),
      v.literal("on-hold"),
      v.literal("cancelled")
    )),
    lifecycleStage: v.optional(v.union(
      v.literal("prospective"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("on-hold"),
      v.literal("cancelled"),
      v.literal("archived")
    )),
    tags: v.optional(v.array(v.string())),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    expectedCompletionDate: v.optional(v.string()),
    loanNumber: v.optional(v.string()),
    loanAmount: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    notes: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      clientRoles: args.clientRoles,
      description: args.description,
      address: args.address,
      city: args.city,
      state: args.state,
      zip: args.zip,
      country: args.country,
      status: args.status || "active",
      lifecycleStage: args.lifecycleStage,
      tags: args.tags,
      startDate: args.startDate,
      endDate: args.endDate,
      expectedCompletionDate: args.expectedCompletionDate,
      loanNumber: args.loanNumber,
      loanAmount: args.loanAmount,
      interestRate: args.interestRate,
      notes: args.notes,
      metadata: args.metadata,
      createdAt: new Date().toISOString(),
    });
    return projectId;
  },
});

// Mutation: Update project
export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    clientRoles: v.optional(v.array(v.object({
      clientId: v.id("clients"),
      role: v.string(),
    }))),
    description: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("completed"),
      v.literal("on-hold"),
      v.literal("cancelled")
    )),
    lifecycleStage: v.optional(v.union(
      v.literal("prospective"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("on-hold"),
      v.literal("cancelled"),
      v.literal("archived")
    )),
    tags: v.optional(v.array(v.string())),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    expectedCompletionDate: v.optional(v.string()),
    loanNumber: v.optional(v.string()),
    loanAmount: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    notes: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Project not found");
    }
    
    await ctx.db.patch(id, updates);
    return id;
  },
});

// Mutation: Delete project
export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Query: Check if project exists
export const exists = query({
  args: {
    name: v.string(),
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const allProjects = await ctx.db.query("projects").collect();
    return allProjects.some(p => 
      p.name.toLowerCase() === args.name.toLowerCase() &&
      p.clientRoles.some(cr => cr.clientId === args.clientId)
    );
  },
});

// Query: Get project stats
export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    let totalCosts: number | undefined;
    let loanAmount: number | undefined;
    
    const documentsWithData = documents.filter(doc => doc.extractedData);
    if (documentsWithData.length > 0) {
      const costs = documentsWithData
        .map(doc => doc.extractedData?.costsTotal?.amount)
        .filter((amount): amount is number => typeof amount === "number");
      
      if (costs.length > 0) {
        totalCosts = costs.reduce((sum, amount) => sum + amount, 0);
      }
      
      const loanAmounts = documentsWithData
        .map(doc => doc.extractedData?.financing?.loanAmount)
        .filter((amount): amount is number => typeof amount === "number");
      
      if (loanAmounts.length > 0) {
        loanAmount = loanAmounts[loanAmounts.length - 1];
      }
    }
    
    let lastActivity: string | undefined;
    if (documents.length > 0) {
      const sortedDocs = documents.sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
      lastActivity = sortedDocs[0].uploadedAt;
    }
    
    return {
      totalDocuments: documents.length,
      totalCosts,
      loanAmount,
      lastActivity,
    };
  },
});

// Query: Get projects that have Excel documents with extracted data
export const getWithExtractedData = query({
  args: {},
  handler: async (ctx) => {
    const allProjects = await ctx.db.query("projects").collect();
    const allDocuments = await ctx.db.query("documents").collect();
    
    // Filter documents to Excel files with extracted data
    const excelDocsWithData = allDocuments.filter(doc => {
      const fileType = doc.fileType?.toLowerCase() || "";
      const isExcel = fileType.includes("spreadsheet") || 
                      fileType.includes("excel") || 
                      fileType.includes("xlsx") || 
                      fileType.includes("xls");
      return isExcel && doc.extractedData;
    });
    
    // Get project IDs that have Excel documents with extracted data
    const projectIdsWithData = new Set(
      excelDocsWithData
        .map(doc => doc.projectId)
        .filter((id): id is string => id !== undefined)
    );
    
    // Return projects with their document dates
    return allProjects
      .filter(project => projectIdsWithData.has(project._id))
      .map(project => {
        // Find the most recent Excel document with extracted data for this project
        const projectDocs = excelDocsWithData
          .filter(doc => doc.projectId === project._id)
          .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        
        const latestDoc = projectDocs[0];
        
        return {
          ...project,
          extractionDate: latestDoc?.uploadedAt || project.createdAt,
          lastModified: latestDoc?.savedAt || project.createdAt,
        };
      });
  },
});

