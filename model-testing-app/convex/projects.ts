import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

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

// Helper: Generate auto-suggest shortcode from project name
function generateShortcodeSuggestion(name: string): string {
  // Remove special characters, keep alphanumeric
  const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
  // Split into words
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 0) return '';
  
  // Strategy: Take first letters of each word, then fill with numbers if present
  let shortcode = '';
  const numbers = name.replace(/[^0-9]/g, '');
  
  // Take first 2-3 letters from first word
  if (words[0]) {
    shortcode += words[0].slice(0, words.length > 2 ? 3 : 4);
  }
  
  // Take first letter from subsequent words
  for (let i = 1; i < words.length && shortcode.length < 7; i++) {
    shortcode += words[i].charAt(0);
  }
  
  // Append numbers if available and we have room
  if (numbers && shortcode.length + numbers.length <= 10) {
    shortcode += numbers;
  } else if (numbers) {
    // Truncate to fit
    shortcode = shortcode.slice(0, 10 - Math.min(numbers.length, 4)) + numbers.slice(0, 4);
  }
  
  return shortcode.slice(0, 10).toUpperCase();
}

// Fallback project folder types (used when no template exists)
const FALLBACK_PROJECT_FOLDERS = [
  { name: "Background", folderKey: "background", order: 1 },
  { name: "Terms Comparison", folderKey: "terms_comparison", order: 2 },
  { name: "Terms Request", folderKey: "terms_request", order: 3 },
  { name: "Credit Submission", folderKey: "credit_submission", order: 4 },
  { name: "Post-completion Documents", folderKey: "post_completion", order: 5 },
  { name: "Appraisals", folderKey: "appraisals", order: 6 },
  { name: "Notes", folderKey: "notes", order: 7 },
  { name: "Operational Model", folderKey: "operational_model", order: 8 },
];

// Mutation: Create project
export const create = mutation({
  args: {
    name: v.string(),
    projectShortcode: v.optional(v.string()), // Max 10 chars for document naming
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
    // Validate shortcode if provided (max 10 chars)
    let shortcode = args.projectShortcode;
    if (shortcode) {
      shortcode = shortcode.toUpperCase().slice(0, 10);
      // Check for uniqueness
      const existing = await ctx.db
        .query("projects")
        .withIndex("by_shortcode", (q: any) => q.eq("projectShortcode", shortcode))
        .first();
      if (existing) {
        throw new Error(`Project shortcode "${shortcode}" is already in use`);
      }
    } else {
      // Auto-generate shortcode suggestion
      shortcode = generateShortcodeSuggestion(args.name);
      // Ensure uniqueness by appending number if needed
      let counter = 1;
      let baseShortcode = shortcode;
      while (true) {
        const existing = await ctx.db
          .query("projects")
          .withIndex("by_shortcode", (q: any) => q.eq("projectShortcode", shortcode))
          .first();
        if (!existing) break;
        shortcode = `${baseShortcode.slice(0, 8)}${counter}`;
        counter++;
        if (counter > 99) break; // Safety limit
      }
    }

    // Get the primary client to determine client type for folder template
    let clientType = "borrower"; // default
    if (args.clientRoles.length > 0) {
      const primaryClient = await ctx.db.get(args.clientRoles[0].clientId);
      if (primaryClient?.type) {
        clientType = primaryClient.type.toLowerCase();
      }
    }

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      projectShortcode: shortcode,
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

    // Look up folder template for this client type
    const templates = await ctx.db
      .query("folderTemplates")
      .withIndex("by_client_type_level", (q: any) => 
        q.eq("clientType", clientType).eq("level", "project")
      )
      .collect();
    
    // Use template folders or fallback
    const folderTemplate = templates.find(t => t.isDefault) || templates[0];
    const folders = folderTemplate?.folders || FALLBACK_PROJECT_FOLDERS;

    // Auto-create project folders from template
    const now = new Date().toISOString();
    const sortedFolders = [...folders].sort((a, b) => a.order - b.order);
    
    for (const folder of sortedFolders) {
      await ctx.db.insert("projectFolders", {
        projectId,
        folderType: folder.folderKey as any, // The schema will validate
        name: folder.name,
        createdAt: now,
      });
    }

    return projectId;
  },
});

// Mutation: Update project
export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    projectShortcode: v.optional(v.string()), // Max 10 chars
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
    
    // Validate shortcode uniqueness if being updated
    if (updates.projectShortcode !== undefined) {
      const shortcode = updates.projectShortcode.toUpperCase().slice(0, 10);
      const existingWithCode = await ctx.db
        .query("projects")
        .withIndex("by_shortcode", (q: any) => q.eq("projectShortcode", shortcode))
        .first();
      if (existingWithCode && existingWithCode._id !== id) {
        throw new Error(`Project shortcode "${shortcode}" is already in use`);
      }
      updates.projectShortcode = shortcode;
    }
    
    await ctx.db.patch(id, updates);

    // Invalidate context cache for this project
    await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
      contextType: "project",
      contextId: id,
    });

    // Also invalidate cache for all related clients
    const finalClientRoles = updates.clientRoles !== undefined ? updates.clientRoles : existing.clientRoles;
    if (finalClientRoles) {
      for (const cr of finalClientRoles) {
        await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
          contextType: "client",
          contextId: cr.clientId,
        });
      }
    }

    return id;
  },
});

// Mutation: Delete project
export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);

    // Invalidate context cache for this project
    await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
      contextType: "project",
      contextId: args.id,
    });

    // Also invalidate cache for all related clients
    if (existing?.clientRoles) {
      for (const cr of existing.clientRoles) {
        await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
          contextType: "client",
          contextId: cr.clientId,
        });
      }
    }
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
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
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
        .filter((id): id is Id<"projects"> => id !== undefined)
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

// ============================================================================
// PROJECT SHORTCODE HELPERS
// ============================================================================

// Query: Suggest a shortcode based on project name
export const suggestShortcode = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const suggestion = generateShortcodeSuggestion(args.name);
    
    // Check if suggestion is available
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_shortcode", (q: any) => q.eq("projectShortcode", suggestion))
      .first();
    
    if (!existing) {
      return { shortcode: suggestion, isAvailable: true };
    }
    
    // Try adding numbers to make it unique
    let counter = 1;
    let newSuggestion = suggestion;
    while (counter < 100) {
      newSuggestion = `${suggestion.slice(0, 8)}${counter}`;
      const check = await ctx.db
        .query("projects")
        .withIndex("by_shortcode", (q: any) => q.eq("projectShortcode", newSuggestion))
        .first();
      if (!check) {
        return { shortcode: newSuggestion, isAvailable: true };
      }
      counter++;
    }
    
    return { shortcode: suggestion, isAvailable: false };
  },
});

// Query: Check if a shortcode is available
export const isShortcodeAvailable = query({
  args: { 
    shortcode: v.string(),
    excludeProjectId: v.optional(v.id("projects")), // Exclude current project when editing
  },
  handler: async (ctx, args) => {
    const normalized = args.shortcode.toUpperCase().slice(0, 10);
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_shortcode", (q: any) => q.eq("projectShortcode", normalized))
      .first();
    
    if (!existing) return true;
    if (args.excludeProjectId && existing._id === args.excludeProjectId) return true;
    return false;
  },
});

// Query: Get project folders
export const getProjectFolders = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectFolders")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Query: Get all project folders for projects under a client
export const getAllProjectFoldersForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get all projects for this client
    const allProjects = await ctx.db.query("projects").collect();
    const clientProjects = allProjects.filter(p => 
      p.clientRoles.some(cr => cr.clientId === args.clientId)
    );
    
    // Get all project folders
    const allProjectFolders = await ctx.db.query("projectFolders").collect();
    
    // Build a map of project ID -> folders
    const result: Record<string, Array<{
      _id: string;
      folderType: string;
      name: string;
      isCustom?: boolean;
    }>> = {};
    
    for (const project of clientProjects) {
      const folders = allProjectFolders
        .filter(f => f.projectId === project._id)
        .map(f => ({
          _id: f._id.toString(),
          folderType: f.folderType,
          name: f.name,
          isCustom: f.isCustom,
        }));
      result[project._id] = folders;
    }
    
    return result;
  },
});

// Mutation: Add a custom folder to a project
export const addCustomProjectFolder = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Generate a folderType from the name (lowercase, underscore-separated)
    const folderType = `custom_${args.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    
    // Check if folder with same type already exists for this project
    const existing = await ctx.db
      .query("projectFolders")
      .withIndex("by_project_type", (q: any) => 
        q.eq("projectId", args.projectId).eq("folderType", folderType)
      )
      .first();
    
    if (existing) {
      throw new Error(`A folder named "${args.name}" already exists for this project`);
    }
    
    return await ctx.db.insert("projectFolders", {
      projectId: args.projectId,
      folderType,
      name: args.name,
      description: args.description,
      isCustom: true,
      createdAt: new Date().toISOString(),
    });
  },
});

// Mutation: Delete a custom folder from a project (only custom folders can be deleted)
export const deleteCustomProjectFolder = mutation({
  args: {
    folderId: v.id("projectFolders"),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    
    if (!folder) {
      throw new Error("Folder not found");
    }
    
    if (!folder.isCustom) {
      throw new Error("Cannot delete template folders. Only custom folders can be deleted.");
    }
    
    // Check if folder has documents
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_project", (q: any) => q.eq("projectId", folder.projectId))
      .collect();
    
    const folderDocs = documents.filter(d => d.folderId === folder.folderType);
    
    if (folderDocs.length > 0) {
      throw new Error(`Cannot delete folder "${folder.name}". It contains ${folderDocs.length} document(s). Move or delete them first.`);
    }
    
    await ctx.db.delete(args.folderId);
    return { success: true };
  },
});

// Mutation: Rename a custom folder in a project
export const renameCustomProjectFolder = mutation({
  args: {
    folderId: v.id("projectFolders"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    
    if (!folder) {
      throw new Error("Folder not found");
    }
    
    if (!folder.isCustom) {
      throw new Error("Cannot rename template folders. Only custom folders can be renamed.");
    }
    
    await ctx.db.patch(args.folderId, {
      name: args.name,
      description: args.description,
    });
    
    return { success: true };
  },
});

