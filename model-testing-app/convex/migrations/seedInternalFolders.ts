import { internalMutation } from "../_generated/server";

/**
 * Migration: Seed Default Internal Folders
 *
 * Creates the default internal folder structure for RockCap company-wide documents.
 * This is idempotent - it will only create folders that don't already exist.
 *
 * Default folders:
 * - Templates: Document templates and forms
 * - Policies & Procedures: Company policies and standard procedures
 * - Marketing Materials: Marketing collateral and branding assets
 * - Training Resources: Training materials and guides
 * - Miscellaneous: General internal documents
 *
 * Run with: npx convex run migrations/seedInternalFolders:seedInternalFolders
 */

const DEFAULT_INTERNAL_FOLDERS = [
  { folderType: "templates", name: "Templates", description: "Document templates and forms" },
  { folderType: "policies", name: "Policies & Procedures", description: "Company policies and standard procedures" },
  { folderType: "marketing", name: "Marketing Materials", description: "Marketing collateral and branding assets" },
  { folderType: "training", name: "Training Resources", description: "Training materials and guides" },
  { folderType: "miscellaneous", name: "Miscellaneous", description: "General internal documents" },
];

export const seedInternalFolders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const results = {
      created: 0,
      skipped: 0,
      folders: [] as string[],
    };

    for (const folder of DEFAULT_INTERNAL_FOLDERS) {
      // Check if folder already exists
      const existing = await ctx.db
        .query("internalFolders")
        .withIndex("by_type", (q) => q.eq("folderType", folder.folderType))
        .first();

      if (existing) {
        results.skipped++;
        console.log(`Folder "${folder.name}" already exists, skipping`);
        continue;
      }

      // Create the folder
      await ctx.db.insert("internalFolders", {
        folderType: folder.folderType,
        name: folder.name,
        description: folder.description,
        isCustom: false,
        createdAt: now,
      });

      results.created++;
      results.folders.push(folder.name);
      console.log(`Created folder: ${folder.name}`);
    }

    console.log("=== Internal Folders Seeding Complete ===");
    console.log(`Created: ${results.created}`);
    console.log(`Skipped (already exist): ${results.skipped}`);
    if (results.folders.length > 0) {
      console.log(`New folders: ${results.folders.join(", ")}`);
    }

    return results;
  },
});
