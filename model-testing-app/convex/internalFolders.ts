import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// INTERNAL FOLDERS MANAGEMENT
// Handles company-wide folder organization for RockCap internal documents
// These folders are shared across all users in the organization
// ============================================================================

// Default internal folder structure
const DEFAULT_INTERNAL_FOLDERS = [
  { folderType: "templates", name: "Templates", description: "Document templates and forms" },
  { folderType: "policies", name: "Policies & Procedures", description: "Company policies and standard procedures" },
  { folderType: "marketing", name: "Marketing Materials", description: "Marketing collateral and branding assets" },
  { folderType: "training", name: "Training Resources", description: "Training materials and guides" },
  { folderType: "miscellaneous", name: "Miscellaneous", description: "General internal documents" },
];

// ============================================================================
// QUERIES
// ============================================================================

// Query: Get all internal folders
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const folders = await ctx.db
      .query("internalFolders")
      .collect();

    // Sort: default folders first (alphabetically), then custom folders (alphabetically)
    return folders.sort((a, b) => {
      // Default folders come first
      if (a.isCustom !== b.isCustom) {
        return a.isCustom ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  },
});

// Query: Get a single internal folder by ID
export const get = query({
  args: { id: v.id("internalFolders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get internal folder by type
export const getByType = query({
  args: { folderType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("internalFolders")
      .withIndex("by_type", (q) => q.eq("folderType", args.folderType))
      .first();
  },
});

// Query: Get document counts per internal folder
export const getDocumentCounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {};
    }

    // Get all internal-scoped documents
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_scope", (q) => q.eq("scope", "internal"))
      .collect();

    // Count documents per folder
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      const folderId = doc.folderId || "miscellaneous";
      counts[folderId] = (counts[folderId] || 0) + 1;
    }

    return counts;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

// Mutation: Create a new internal folder (any authenticated user)
export const create = mutation({
  args: {
    folderType: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    parentFolderId: v.optional(v.id("internalFolders")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Get user for createdBy tracking
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    // Check if folder type already exists
    const existing = await ctx.db
      .query("internalFolders")
      .withIndex("by_type", (q) => q.eq("folderType", args.folderType))
      .first();

    if (existing) {
      throw new Error(`Internal folder with type "${args.folderType}" already exists`);
    }

    // Validate parent folder if provided
    if (args.parentFolderId) {
      const parent = await ctx.db.get(args.parentFolderId);
      if (!parent) {
        throw new Error("Parent folder not found");
      }
    }

    const folderId = await ctx.db.insert("internalFolders", {
      folderType: args.folderType,
      name: args.name,
      description: args.description,
      parentFolderId: args.parentFolderId,
      isCustom: true,
      createdAt: new Date().toISOString(),
      createdBy: user?._id,
    });

    return folderId;
  },
});

// Mutation: Update an internal folder
export const update = mutation({
  args: {
    id: v.id("internalFolders"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const folder = await ctx.db.get(args.id);
    if (!folder) {
      throw new Error("Folder not found");
    }

    const updates: Partial<{ name: string; description: string }> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }

    return args.id;
  },
});

// Mutation: Delete an internal folder (admin only, must be empty)
export const remove = mutation({
  args: { id: v.id("internalFolders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Get user and check admin status
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user?.isAdmin) {
      throw new Error("Only administrators can delete internal folders");
    }

    const folder = await ctx.db.get(args.id);
    if (!folder) {
      throw new Error("Folder not found");
    }

    // Check if folder has documents
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_scope", (q) => q.eq("scope", "internal"))
      .filter((q) => q.eq(q.field("folderId"), folder.folderType))
      .collect();

    if (documents.length > 0) {
      throw new Error(`Cannot delete folder: ${documents.length} document(s) are in this folder. Move or delete them first.`);
    }

    // Check if folder has child folders
    const childFolders = await ctx.db
      .query("internalFolders")
      .withIndex("by_parent", (q) => q.eq("parentFolderId", args.id))
      .collect();

    if (childFolders.length > 0) {
      throw new Error(`Cannot delete folder: ${childFolders.length} subfolder(s) exist. Delete them first.`);
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

// Mutation: Seed default internal folders (run once during setup)
export const seedDefaultFolders = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Check if any folders exist
    const existingFolders = await ctx.db.query("internalFolders").collect();
    if (existingFolders.length > 0) {
      return {
        created: false,
        message: "Internal folders already exist",
        existingCount: existingFolders.length
      };
    }

    // Get user for createdBy tracking
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    const now = new Date().toISOString();
    const createdIds: Id<"internalFolders">[] = [];

    for (const folder of DEFAULT_INTERNAL_FOLDERS) {
      const id = await ctx.db.insert("internalFolders", {
        folderType: folder.folderType,
        name: folder.name,
        description: folder.description,
        isCustom: false,
        createdAt: now,
        createdBy: user?._id,
      });
      createdIds.push(id);
    }

    return {
      created: true,
      message: `Created ${createdIds.length} default internal folders`,
      folderIds: createdIds,
    };
  },
});

// Mutation: Ensure default folders exist (idempotent - safe to call multiple times)
export const ensureDefaultFolders = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    const now = new Date().toISOString();
    let created = 0;
    let existing = 0;

    for (const folder of DEFAULT_INTERNAL_FOLDERS) {
      // Check if folder type already exists
      const existingFolder = await ctx.db
        .query("internalFolders")
        .withIndex("by_type", (q) => q.eq("folderType", folder.folderType))
        .first();

      if (existingFolder) {
        existing++;
        continue;
      }

      // Create the missing folder
      await ctx.db.insert("internalFolders", {
        folderType: folder.folderType,
        name: folder.name,
        description: folder.description,
        isCustom: false,
        createdAt: now,
        createdBy: user?._id,
      });
      created++;
    }

    return {
      created,
      existing,
      message: created > 0
        ? `Created ${created} missing default folder(s)`
        : "All default folders already exist",
    };
  },
});
