import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// PERSONAL FOLDERS MANAGEMENT
// Handles user-specific folder organization for private documents
// Each user has their own set of folders that only they can access
// ============================================================================

// Default personal folder structure (created for each new user)
const DEFAULT_PERSONAL_FOLDERS = [
  { folderType: "my_documents", name: "My Documents", description: "General personal documents" },
  { folderType: "drafts", name: "Drafts", description: "Work in progress documents" },
  { folderType: "archive", name: "Archive", description: "Archived personal documents" },
];

// ============================================================================
// QUERIES
// ============================================================================

// Query: Get all personal folders for the current user
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    const folders = await ctx.db
      .query("personalFolders")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Sort alphabetically
    return folders.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Query: Get a single personal folder by ID (with ownership check)
export const get = query({
  args: { id: v.id("personalFolders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return null;
    }

    const folder = await ctx.db.get(args.id);

    // Verify ownership
    if (!folder || folder.userId !== user._id) {
      return null;
    }

    return folder;
  },
});

// Query: Get personal folder by type for current user
export const getByType = query({
  args: { folderType: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return null;
    }

    return await ctx.db
      .query("personalFolders")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", user._id).eq("folderType", args.folderType)
      )
      .first();
  },
});

// Query: Get document counts per personal folder for current user
export const getDocumentCounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {};
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return {};
    }

    // Get all personal-scoped documents for this user
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_scope_owner", (q) =>
        q.eq("scope", "personal").eq("ownerId", user._id)
      )
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    // Count documents per folder
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      const folderId = doc.folderId || "my_documents";
      counts[folderId] = (counts[folderId] || 0) + 1;
    }

    return counts;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

// Mutation: Create a new personal folder
export const create = mutation({
  args: {
    folderType: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    parentFolderId: v.optional(v.id("personalFolders")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if folder type already exists for this user
    const existing = await ctx.db
      .query("personalFolders")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", user._id).eq("folderType", args.folderType)
      )
      .first();

    if (existing) {
      throw new Error(`Personal folder with type "${args.folderType}" already exists`);
    }

    // Validate parent folder if provided
    if (args.parentFolderId) {
      const parent = await ctx.db.get(args.parentFolderId);
      if (!parent || parent.userId !== user._id) {
        throw new Error("Parent folder not found or not owned by you");
      }
    }

    const folderId = await ctx.db.insert("personalFolders", {
      userId: user._id,
      folderType: args.folderType,
      name: args.name,
      description: args.description,
      parentFolderId: args.parentFolderId,
      createdAt: new Date().toISOString(),
    });

    return folderId;
  },
});

// Mutation: Update a personal folder
export const update = mutation({
  args: {
    id: v.id("personalFolders"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const folder = await ctx.db.get(args.id);
    if (!folder) {
      throw new Error("Folder not found");
    }

    // Verify ownership
    if (folder.userId !== user._id) {
      throw new Error("You can only update your own folders");
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

// Mutation: Delete a personal folder (must be empty)
export const remove = mutation({
  args: { id: v.id("personalFolders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const folder = await ctx.db.get(args.id);
    if (!folder) {
      throw new Error("Folder not found");
    }

    // Verify ownership
    if (folder.userId !== user._id) {
      throw new Error("You can only delete your own folders");
    }

    // Check if folder has documents
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_scope_owner", (q) =>
        q.eq("scope", "personal").eq("ownerId", user._id)
      )
      .filter((q) => q.and(
        q.eq(q.field("folderId"), folder.folderType),
        q.neq(q.field("isDeleted"), true)
      ))
      .collect();

    if (documents.length > 0) {
      throw new Error(`Cannot delete folder: ${documents.length} document(s) are in this folder. Move or delete them first.`);
    }

    // Check if folder has child folders
    const childFolders = await ctx.db
      .query("personalFolders")
      .withIndex("by_parent", (q) => q.eq("parentFolderId", args.id))
      .collect();

    if (childFolders.length > 0) {
      throw new Error(`Cannot delete folder: ${childFolders.length} subfolder(s) exist. Delete them first.`);
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

// Mutation: Ensure default folders exist for current user (idempotent)
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

    if (!user) {
      throw new Error("User not found");
    }

    const now = new Date().toISOString();
    let created = 0;
    let existing = 0;

    for (const folder of DEFAULT_PERSONAL_FOLDERS) {
      // Check if folder type already exists for this user
      const existingFolder = await ctx.db
        .query("personalFolders")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", user._id).eq("folderType", folder.folderType)
        )
        .first();

      if (existingFolder) {
        existing++;
        continue;
      }

      // Create the missing folder
      await ctx.db.insert("personalFolders", {
        userId: user._id,
        folderType: folder.folderType,
        name: folder.name,
        description: folder.description,
        createdAt: now,
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

// Mutation: Create default folders for a specific user (used during user creation)
export const createDefaultFoldersForUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if folders already exist
    const existingFolders = await ctx.db
      .query("personalFolders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    if (existingFolders.length > 0) {
      return {
        created: false,
        message: "Personal folders already exist for this user",
        existingCount: existingFolders.length,
      };
    }

    const now = new Date().toISOString();
    const createdIds: Id<"personalFolders">[] = [];

    for (const folder of DEFAULT_PERSONAL_FOLDERS) {
      const id = await ctx.db.insert("personalFolders", {
        userId: args.userId,
        folderType: folder.folderType,
        name: folder.name,
        description: folder.description,
        createdAt: now,
      });
      createdIds.push(id);
    }

    return {
      created: true,
      message: `Created ${createdIds.length} default personal folders`,
      folderIds: createdIds,
    };
  },
});
