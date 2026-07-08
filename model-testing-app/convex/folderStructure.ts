import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// FOLDER STRUCTURE MANAGEMENT
// Handles client and project folder organization for the bulk upload system
// ============================================================================

// Category to folder type mapping
// Maps document categories/types to their target folders.
// Folder keys follow the Dark Mills taxonomy (2026-07-07 —
// docs/classification/dark-mills-exemplar-pack.md §1; canonical rules live in
// src/v4/lib/placement-rules.ts). This map keeps mobile display/upload
// consistent with the new key vocabulary.
export const CATEGORY_TO_FOLDER_MAP: Record<string, {
  level: "client" | "project";
  folderType: string;
}> = {
  // Project-level folders
  "appraisal": { level: "project", folderType: "modelling_info" },
  "appraisals": { level: "project", folderType: "modelling_info" },
  "valuation": { level: "project", folderType: "modelling_info" },
  "red book valuation": { level: "project", folderType: "modelling_info" },
  "rics valuation": { level: "project", folderType: "modelling_info" },
  "client land appraisal": { level: "project", folderType: "client_appraisals" },
  "rockcap appraisal model": { level: "project", folderType: "rockcap_appraisals" },

  "term sheet": { level: "project", folderType: "terms_received" },
  "termsheet": { level: "project", folderType: "terms_received" },
  "loan terms": { level: "project", folderType: "terms_received" },
  "indicative terms": { level: "project", folderType: "terms_received" },
  "terms received": { level: "project", folderType: "terms_received" },
  "terms comparison": { level: "project", folderType: "terms_analysis" },
  "terms analysis": { level: "project", folderType: "terms_analysis" },
  "lender comparison": { level: "project", folderType: "terms_analysis" },

  // Terms-request material (outbound briefs/models) lives in the
  // "Modelling Info and Terms Request" folder in the new taxonomy.
  "term request": { level: "project", folderType: "modelling_info" },
  "terms request": { level: "project", folderType: "modelling_info" },
  "loan request": { level: "project", folderType: "modelling_info" },

  "credit memo": { level: "project", folderType: "credit" },
  "credit submission": { level: "project", folderType: "credit" },
  "credit application": { level: "project", folderType: "credit" },
  "credit checklist": { level: "project", folderType: "credit" },

  "completion certificate": { level: "project", folderType: "post_completion" },
  "post completion": { level: "project", folderType: "post_completion" },
  "closing documents": { level: "project", folderType: "post_completion" },
  "settlement": { level: "project", folderType: "post_completion" },

  "financial model": { level: "project", folderType: "modelling_info" },
  "operating model": { level: "project", folderType: "modelling_info" },
  "operating statement": { level: "project", folderType: "modelling_info" },
  "cash flow": { level: "project", folderType: "modelling_info" },
  "pro forma": { level: "project", folderType: "modelling_info" },

  "note": { level: "project", folderType: "notes" },
  "notes": { level: "project", folderType: "notes" },
  "memo": { level: "project", folderType: "notes" },
  "internal memo": { level: "project", folderType: "notes" },

  "background": { level: "project", folderType: "modelling_info" },
  "project background": { level: "project", folderType: "modelling_info" },
  "professional report": { level: "project", folderType: "modelling_info" },
  "professional reports": { level: "project", folderType: "modelling_info" },
  "plans": { level: "project", folderType: "modelling_info" },
  "floor plan": { level: "project", folderType: "modelling_info" },
  "site plan": { level: "project", folderType: "modelling_info" },
  "photographs": { level: "project", folderType: "modelling_info" },
  "site photographs": { level: "project", folderType: "modelling_info" },
  "project documents": { level: "project", folderType: "modelling_info" },
  "accommodation schedule": { level: "project", folderType: "comps" },
  "comps": { level: "project", folderType: "comps" },
  "comparable schedule": { level: "project", folderType: "comps_appendix" },
  "comparables": { level: "project", folderType: "comps_appendix" },
  "build programme": { level: "project", folderType: "modelling_info" },
  "specification": { level: "project", folderType: "modelling_info" },
  "tender": { level: "project", folderType: "modelling_info" },
  "cgi": { level: "project", folderType: "modelling_info" },
  "renders": { level: "project", folderType: "modelling_info" },
  "warranties": { level: "project", folderType: "post_completion" },

  "captured photos": { level: "project", folderType: "captured_photos" },
  "site photos": { level: "project", folderType: "captured_photos" },
  "site photo": { level: "project", folderType: "captured_photos" },

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
    
    // Default: if project exists, route to project's "unfiled" folder; otherwise client "miscellaneous"
    if (args.hasProject) {
      return {
        level: "project" as const,
        folderType: "unfiled",
        reason: "No category mapping found — routed to project unfiled",
      };
    }
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
    const allProjects = await ctx.db.query("projects").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
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
    
    // Standard project folder types — mirrors the borrower/project default
    // template (Dark Mills taxonomy, migrations/seedFolderTemplatesV2.ts),
    // plus app-only folders (captured_photos, unfiled) not in the template.
    const PROJECT_FOLDER_TYPES: Array<{ type: string; name: string; parentKey?: string; order: number }> = [
      { type: "modelling_info", name: "1. Modelling Info and Terms Request", order: 1 },
      { type: "client_appraisals", name: "Client Appraisals", parentKey: "modelling_info", order: 1 },
      { type: "lender_pack", name: "Lender Pack", parentKey: "modelling_info", order: 2 },
      { type: "rockcap_appraisals", name: "Rockcap Appraisals", parentKey: "modelling_info", order: 3 },
      { type: "terms_received", name: "2. Terms Received", order: 2 },
      { type: "terms_analysis", name: "3. Terms Analysis", order: 3 },
      { type: "comps", name: "4. Comps", order: 4 },
      { type: "comps_appendix", name: "Appendix", parentKey: "comps", order: 1 },
      { type: "credit", name: "5. Credit", order: 5 },
      { type: "post_completion", name: "6. Post Completion", order: 6 },
      { type: "notes", name: "Notes", order: 7 },
      { type: "captured_photos", name: "Captured Photos", order: 8 },
      { type: "unfiled", name: "Unfiled", order: 9 },
    ];

    const now = new Date().toISOString();
    const folderIdMap: Record<string, Id<"projectFolders">> = {};

    // First pass: top-level folders
    for (const folder of PROJECT_FOLDER_TYPES) {
      if (!folder.parentKey) {
        const folderId = await ctx.db.insert("projectFolders", {
          projectId: args.projectId,
          folderType: folder.type,
          name: folder.name,
          depth: 0,
          order: folder.order,
          createdAt: now,
        });
        folderIdMap[folder.type] = folderId;
      }
    }

    // Second pass: subfolders (this list only nests one level deep)
    for (const folder of PROJECT_FOLDER_TYPES) {
      if (folder.parentKey && folderIdMap[folder.parentKey]) {
        await ctx.db.insert("projectFolders", {
          projectId: args.projectId,
          folderType: folder.type,
          name: folder.name,
          parentFolderId: folderIdMap[folder.parentKey],
          depth: 1,
          order: folder.order,
          createdAt: now,
        });
      }
    }

    return { created: true, foldersCount: PROJECT_FOLDER_TYPES.length };
  },
});

// Mutation: Backfill the Dark Mills taxonomy onto a project that ALREADY has
// folders (ensureProjectFolders early-returns in that case). Idempotent:
// inserts missing new-taxonomy folders with correct nesting/depth, renames
// folders whose folderType is shared between old and new taxonomies
// (notes, post_completion) to the new display names, and leaves all other
// legacy folders untouched — documents are moved out separately and legacy
// folders cleaned up after.
export const backfillProjectFoldersV2 = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const NEW_TAXONOMY: Array<{ type: string; name: string; parentKey?: string; order: number }> = [
      { type: "modelling_info", name: "1. Modelling Info and Terms Request", order: 1 },
      { type: "client_appraisals", name: "Client Appraisals", parentKey: "modelling_info", order: 1 },
      { type: "lender_pack", name: "Lender Pack", parentKey: "modelling_info", order: 2 },
      { type: "rockcap_appraisals", name: "Rockcap Appraisals", parentKey: "modelling_info", order: 3 },
      { type: "terms_received", name: "2. Terms Received", order: 2 },
      { type: "terms_analysis", name: "3. Terms Analysis", order: 3 },
      { type: "comps", name: "4. Comps", order: 4 },
      { type: "comps_appendix", name: "Appendix", parentKey: "comps", order: 1 },
      { type: "credit", name: "5. Credit", order: 5 },
      { type: "post_completion", name: "6. Post Completion", order: 6 },
      { type: "notes", name: "Notes", order: 7 },
    ];

    const existing = await ctx.db
      .query("projectFolders")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();
    const byType = new Map(existing.map((f) => [f.folderType, f]));

    const now = new Date().toISOString();
    let created = 0;
    let renamed = 0;
    const idByType: Record<string, Id<"projectFolders">> = {};
    for (const f of existing) idByType[f.folderType] = f._id;

    // Top-level first so children can resolve parentFolderId.
    for (const folder of NEW_TAXONOMY.filter((f) => !f.parentKey)) {
      const hit = byType.get(folder.type);
      if (hit) {
        if (hit.name !== folder.name || (hit as any).order !== folder.order) {
          await ctx.db.patch(hit._id, { name: folder.name, order: folder.order });
          renamed++;
        }
      } else {
        idByType[folder.type] = await ctx.db.insert("projectFolders", {
          projectId: args.projectId,
          folderType: folder.type,
          name: folder.name,
          depth: 0,
          order: folder.order,
          createdAt: now,
        });
        created++;
      }
    }
    for (const folder of NEW_TAXONOMY.filter((f) => f.parentKey)) {
      const hit = byType.get(folder.type);
      if (hit) {
        if ((hit as any).order !== folder.order) {
          await ctx.db.patch(hit._id, { order: folder.order });
          renamed++;
        }
        continue;
      }
      await ctx.db.insert("projectFolders", {
        projectId: args.projectId,
        folderType: folder.type,
        name: folder.name,
        parentFolderId: idByType[folder.parentKey!],
        depth: 1,
        order: folder.order,
        createdAt: now,
      });
      created++;
    }

    return { created, renamed, totalFolders: existing.length + created };
  },
});

// ============================================================================
// VALIDATION HELPERS
// These are internal helper functions for validating folder assignments
// ============================================================================

/**
 * Validates that a folder exists and belongs to the correct client/project.
 * This is an internal helper - use it in mutations that update document folder assignments.
 *
 * @param ctx - Convex mutation/query context
 * @param folderId - The folder type string (e.g., "kyc", "appraisals")
 * @param folderType - "client" or "project"
 * @param clientId - The client ID
 * @param projectId - The project ID (required if folderType is "project")
 * @returns Object with valid: boolean and optional error message
 */
export async function validateFolderExists(
  ctx: { db: any },
  folderId: string,
  folderType: "client" | "project",
  clientId: Id<"clients">,
  projectId?: Id<"projects">
): Promise<{ valid: boolean; error?: string }> {
  // Validate folderType-projectId logic
  if (folderType === "project" && !projectId) {
    return { valid: false, error: "Project folder requires a projectId" };
  }

  // Validate folder exists in correct table
  if (folderType === "project" && projectId) {
    const projectFolder = await ctx.db
      .query("projectFolders")
      .withIndex("by_project_type", (q: any) =>
        q.eq("projectId", projectId).eq("folderType", folderId)
      )
      .first();
    if (!projectFolder) {
      return { valid: false, error: `Folder "${folderId}" does not exist for this project` };
    }
  } else if (folderType === "client") {
    const clientFolder = await ctx.db
      .query("clientFolders")
      .withIndex("by_client_type", (q: any) =>
        q.eq("clientId", clientId).eq("folderType", folderId)
      )
      .first();
    if (!clientFolder) {
      return { valid: false, error: `Folder "${folderId}" does not exist for this client` };
    }
  }

  return { valid: true };
}

/**
 * Validates that a project belongs to a client.
 * Projects use clientRoles array for many-to-many relationships.
 *
 * @param ctx - Convex mutation/query context
 * @param projectId - The project ID to check
 * @param clientId - The expected client ID
 * @returns Object with valid: boolean and optional error message
 */
export async function validateProjectBelongsToClient(
  ctx: { db: any },
  projectId: Id<"projects">,
  clientId: Id<"clients">
): Promise<{ valid: boolean; error?: string }> {
  const project = await ctx.db.get(projectId);
  if (!project) {
    return { valid: false, error: "Project not found" };
  }

  const belongsToClient = project.clientRoles.some(
    (cr: { clientId: any }) => cr.clientId === clientId
  );
  if (!belongsToClient) {
    return { valid: false, error: "Project does not belong to this client" };
  }

  return { valid: true };
}

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
        captured_photos: "Captured Photos",
        unfiled: "Unfiled",
      },
    };
  },
});
