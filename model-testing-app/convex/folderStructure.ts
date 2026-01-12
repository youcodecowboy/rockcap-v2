import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// FOLDER STRUCTURE MANAGEMENT
// Handles client and project folder organization for the bulk upload system
// ============================================================================

// Category to folder type mapping
// Maps document categories/types to their target folders
export const CATEGORY_TO_FOLDER_MAP: Record<string, { 
  level: "client" | "project";
  folderType: string;
}> = {
  // Project-level folders
  "appraisal": { level: "project", folderType: "appraisals" },
  "appraisals": { level: "project", folderType: "appraisals" },
  "valuation": { level: "project", folderType: "appraisals" },
  "red book valuation": { level: "project", folderType: "appraisals" },
  "rics valuation": { level: "project", folderType: "appraisals" },
  
  "term sheet": { level: "project", folderType: "terms_comparison" },
  "termsheet": { level: "project", folderType: "terms_comparison" },
  "loan terms": { level: "project", folderType: "terms_comparison" },
  "terms comparison": { level: "project", folderType: "terms_comparison" },
  
  "term request": { level: "project", folderType: "terms_request" },
  "terms request": { level: "project", folderType: "terms_request" },
  "loan request": { level: "project", folderType: "terms_request" },
  
  "credit memo": { level: "project", folderType: "credit_submission" },
  "credit submission": { level: "project", folderType: "credit_submission" },
  "credit application": { level: "project", folderType: "credit_submission" },
  
  "completion certificate": { level: "project", folderType: "post_completion" },
  "post completion": { level: "project", folderType: "post_completion" },
  "closing documents": { level: "project", folderType: "post_completion" },
  "settlement": { level: "project", folderType: "post_completion" },
  
  "financial model": { level: "project", folderType: "operational_model" },
  "operating model": { level: "project", folderType: "operational_model" },
  "operating statement": { level: "project", folderType: "operational_model" },
  "cash flow": { level: "project", folderType: "operational_model" },
  "pro forma": { level: "project", folderType: "operational_model" },
  
  "note": { level: "project", folderType: "notes" },
  "notes": { level: "project", folderType: "notes" },
  "memo": { level: "project", folderType: "notes" },
  "internal memo": { level: "project", folderType: "notes" },
  
  "background": { level: "project", folderType: "background" },
  "project background": { level: "project", folderType: "background" },
  
  // Client-level folders
  "kyc": { level: "client", folderType: "kyc" },
  "kyc document": { level: "client", folderType: "kyc" },
  "identity verification": { level: "client", folderType: "kyc" },
  "passport": { level: "client", folderType: "kyc" },
  "id document": { level: "client", folderType: "kyc" },
  
  "client background": { level: "client", folderType: "background_docs" },
  "company information": { level: "client", folderType: "background_docs" },
  "corporate documents": { level: "client", folderType: "background_docs" },
};

// Document type abbreviations for naming convention
export const TYPE_ABBREVIATIONS: Record<string, string> = {
  "appraisal": "APPRAISAL",
  "valuation": "APPRAISAL",
  "red book valuation": "APPRAISAL",
  "rics valuation": "APPRAISAL",
  "term sheet": "TERMSHEET",
  "termsheet": "TERMSHEET",
  "loan terms": "TERMSHEET",
  "terms comparison": "TERMSHEET",
  "term request": "TERMREQ",
  "terms request": "TERMREQ",
  "credit memo": "CREDIT",
  "credit submission": "CREDIT",
  "credit application": "CREDIT",
  "operating statement": "OPERATING",
  "operating model": "OPERATING",
  "financial model": "FINMODEL",
  "contract": "CONTRACT",
  "agreement": "CONTRACT",
  "invoice": "INVOICE",
  "correspondence": "CORRESP",
  "email": "CORRESP",
  "letter": "CORRESP",
  "kyc": "KYC",
  "kyc document": "KYC",
  "note": "NOTE",
  "notes": "NOTE",
  "memo": "MEMO",
  "report": "REPORT",
  "other": "DOC",
};

// Query: Map a category to its target folder
export const mapCategoryToFolder = query({
  args: {
    category: v.string(),
    hasProject: v.boolean(),
  },
  handler: async (ctx, args) => {
    const categoryLower = args.category.toLowerCase().trim();
    
    // Check for exact match first
    if (CATEGORY_TO_FOLDER_MAP[categoryLower]) {
      const mapping = CATEGORY_TO_FOLDER_MAP[categoryLower];
      
      // If category maps to project folder but no project selected, use miscellaneous
      if (mapping.level === "project" && !args.hasProject) {
        return {
          level: "client" as const,
          folderType: "miscellaneous",
          reason: "No project selected for project-level document",
        };
      }
      
      return {
        level: mapping.level,
        folderType: mapping.folderType,
        reason: "Direct category match",
      };
    }
    
    // Check for partial matches
    for (const [key, mapping] of Object.entries(CATEGORY_TO_FOLDER_MAP)) {
      if (categoryLower.includes(key) || key.includes(categoryLower)) {
        if (mapping.level === "project" && !args.hasProject) {
          return {
            level: "client" as const,
            folderType: "miscellaneous",
            reason: "No project selected for project-level document",
          };
        }
        return {
          level: mapping.level,
          folderType: mapping.folderType,
          reason: `Partial match: ${key}`,
        };
      }
    }
    
    // Default to miscellaneous
    return {
      level: "client" as const,
      folderType: "miscellaneous",
      reason: "No category mapping found",
    };
  },
});

// Query: Get type abbreviation for document naming
export const getTypeAbbreviation = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    const categoryLower = args.category.toLowerCase().trim();
    
    // Check for exact match
    if (TYPE_ABBREVIATIONS[categoryLower]) {
      return TYPE_ABBREVIATIONS[categoryLower];
    }
    
    // Check for partial matches
    for (const [key, abbrev] of Object.entries(TYPE_ABBREVIATIONS)) {
      if (categoryLower.includes(key) || key.includes(categoryLower)) {
        return abbrev;
      }
    }
    
    // Default: uppercase first 8 chars
    return categoryLower.replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 8) || "DOC";
  },
});

// Query: Get all folders for a client (including project folders)
export const getAllFoldersForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get client folders
    const clientFolders = await ctx.db
      .query("clientFolders")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
    
    // Get all projects for this client
    const allProjects = await ctx.db.query("projects").collect();
    const clientProjects = allProjects.filter(p => 
      p.clientRoles.some(cr => cr.clientId === args.clientId)
    );
    
    // Get project folders for each project
    const projectFoldersPromises = clientProjects.map(async (project) => {
      const folders = await ctx.db
        .query("projectFolders")
        .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
        .collect();
      return {
        project: {
          _id: project._id,
          name: project.name,
          projectShortcode: project.projectShortcode,
        },
        folders,
      };
    });
    
    const projectFoldersResults = await Promise.all(projectFoldersPromises);
    
    return {
      clientFolders,
      projectFolders: projectFoldersResults,
    };
  },
});

// Mutation: Ensure client folders exist (for existing clients without folders)
export const ensureClientFolders = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Check if folders already exist
    const existingFolders = await ctx.db
      .query("clientFolders")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
    
    if (existingFolders.length > 0) {
      return { created: false, foldersCount: existingFolders.length };
    }
    
    // Create standard client folder structure
    const now = new Date().toISOString();
    const folderIdMap: Record<string, Id<"clientFolders">> = {};
    
    // Create parent folders first
    const backgroundId = await ctx.db.insert("clientFolders", {
      clientId: args.clientId,
      folderType: "background",
      name: "Background",
      createdAt: now,
    });
    folderIdMap["background"] = backgroundId;
    
    const miscId = await ctx.db.insert("clientFolders", {
      clientId: args.clientId,
      folderType: "miscellaneous",
      name: "Miscellaneous",
      createdAt: now,
    });
    folderIdMap["miscellaneous"] = miscId;
    
    // Create child folders
    await ctx.db.insert("clientFolders", {
      clientId: args.clientId,
      folderType: "kyc",
      name: "KYC",
      parentFolderId: backgroundId,
      createdAt: now,
    });
    
    await ctx.db.insert("clientFolders", {
      clientId: args.clientId,
      folderType: "background_docs",
      name: "Background",
      parentFolderId: backgroundId,
      createdAt: now,
    });
    
    return { created: true, foldersCount: 4 };
  },
});

// Mutation: Ensure project folders exist (for existing projects without folders)
export const ensureProjectFolders = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Check if folders already exist
    const existingFolders = await ctx.db
      .query("projectFolders")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();
    
    if (existingFolders.length > 0) {
      return { created: false, foldersCount: existingFolders.length };
    }
    
    // Standard project folder types
    const PROJECT_FOLDER_TYPES = [
      { type: "background" as const, name: "Background" },
      { type: "terms_comparison" as const, name: "Terms comparison" },
      { type: "terms_request" as const, name: "Terms request" },
      { type: "credit_submission" as const, name: "Credit submission" },
      { type: "post_completion" as const, name: "Post-completion documents" },
      { type: "appraisals" as const, name: "Appraisals" },
      { type: "notes" as const, name: "Notes" },
      { type: "operational_model" as const, name: "Operational Model" },
    ];
    
    const now = new Date().toISOString();
    for (const folder of PROJECT_FOLDER_TYPES) {
      await ctx.db.insert("projectFolders", {
        projectId: args.projectId,
        folderType: folder.type,
        name: folder.name,
        createdAt: now,
      });
    }
    
    return { created: true, foldersCount: PROJECT_FOLDER_TYPES.length };
  },
});

// Query: Get folder display name
export const getFolderDisplayNames = query({
  args: {},
  handler: async () => {
    return {
      client: {
        background: "Background",
        kyc: "KYC",
        background_docs: "Background Documents",
        miscellaneous: "Miscellaneous",
      },
      project: {
        background: "Background",
        terms_comparison: "Terms Comparison",
        terms_request: "Terms Request",
        credit_submission: "Credit Submission",
        post_completion: "Post-completion Documents",
        appraisals: "Appraisals",
        notes: "Notes",
        operational_model: "Operational Model",
      },
    };
  },
});
