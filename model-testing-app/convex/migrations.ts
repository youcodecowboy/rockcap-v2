import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Dry-run preview: shows what documents WOULD be moved without changing anything.
 * This is a read-only query — completely safe to run.
 *
 * Call with a specific projectId to scope to one project, or omit for all projects.
 */
export const previewAppraisalMigration = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const wouldMove: Array<{
      documentId: string;
      documentName: string;
      projectId: string;
      category: string;
      fileType: string;
      currentFolder: string;
      targetFolder: string;
    }> = [];

    const wouldSkip: Array<{
      documentId: string;
      documentName: string;
      reason: string;
    }> = [];

    const wouldKeep: Array<{
      documentId: string;
      documentName: string;
      category: string;
      fileType: string;
    }> = [];

    // Query all documents in the "appraisals" folder
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_folder", (q: any) => q.eq("folderId", "appraisals"))
      .collect();

    // Filter to project-level only, and optionally to a specific project
    const projectDocs = docs.filter(d =>
      d.folderType === "project" &&
      (!args.projectId || d.projectId === args.projectId)
    );

    for (const doc of projectDocs) {
      const docName = doc.documentName || doc.fileName || String(doc._id);
      const category = doc.category;
      const fileType = doc.fileTypeDetected || "unknown";

      // Correctly-filed appraisals stay
      if (category === "Appraisals") {
        wouldKeep.push({
          documentId: doc._id,
          documentName: docName,
          category: category,
          fileType,
        });
        continue;
      }

      // No category — skip for manual review
      if (!category) {
        wouldSkip.push({
          documentId: doc._id,
          documentName: docName,
          reason: "No category field — cannot determine if misfiled",
        });
        continue;
      }

      // No project — skip
      if (!doc.projectId) {
        wouldSkip.push({
          documentId: doc._id,
          documentName: docName,
          reason: "No projectId — cannot verify target folder",
        });
        continue;
      }

      // Would be moved
      wouldMove.push({
        documentId: doc._id,
        documentName: docName,
        projectId: doc.projectId,
        category,
        fileType,
        currentFolder: "appraisals",
        targetFolder: "background",
      });
    }

    return {
      totalInAppraisalsFolder: projectDocs.length,
      wouldKeep: wouldKeep.length,
      wouldMove: wouldMove.length,
      wouldSkip: wouldSkip.length,
      keeping: wouldKeep,
      moving: wouldMove,
      skipping: wouldSkip,
    };
  },
});

/**
 * One-time migration: move non-appraisal documents out of the appraisals folder.
 *
 * After CLS-01 fixed the placement rules so only Appraisals category goes to
 * the appraisals folder, this migration cleans up documents that were misfiled
 * under the old rules.
 *
 * Paginates by project to stay within Convex mutation execution limits.
 * Call with a specific projectId to migrate one project, or omit to migrate all.
 * Run previewAppraisalMigration first to review what will be moved.
 */
export const migrateAppraisalFolder = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const moves: Array<{
      documentId: string;
      documentName: string;
      projectId: string;
      oldCategory: string;
      oldFolderId: string;
      newFolderId: string;
      timestamp: string;
    }> = [];

    const skipped: Array<{
      documentId: string;
      documentName: string;
      reason: string;
    }> = [];

    // Query all documents in the "appraisals" folder
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_folder", (q: any) => q.eq("folderId", "appraisals"))
      .collect();

    // Filter to project-level only, and optionally to a specific project
    const projectDocs = docs.filter(d =>
      d.folderType === "project" &&
      (!args.projectId || d.projectId === args.projectId)
    );

    for (const doc of projectDocs) {
      const docName = doc.documentName || doc.fileName || String(doc._id);
      const category = doc.category;

      // Skip correctly-filed appraisals
      if (category === "Appraisals") {
        continue;
      }

      // Skip documents with no category — log for manual review
      if (!category) {
        skipped.push({
          documentId: doc._id,
          documentName: docName,
          reason: "No category field — cannot determine if misfiled",
        });
        continue;
      }

      // Skip documents without a project — can't verify background folder exists
      if (!doc.projectId) {
        skipped.push({
          documentId: doc._id,
          documentName: docName,
          reason: "No projectId — cannot verify target folder",
        });
        continue;
      }

      // Verify background folder exists for this project
      const backgroundFolder = await ctx.db
        .query("projectFolders")
        .withIndex("by_project_type", (q: any) =>
          q.eq("projectId", doc.projectId).eq("folderType", "background")
        )
        .first();

      if (!backgroundFolder) {
        await ctx.db.insert("projectFolders", {
          projectId: doc.projectId,
          folderType: "background",
          name: "Background",
          createdAt: new Date().toISOString(),
        });
      }

      // Move the document
      await ctx.db.patch(doc._id, {
        folderId: "background",
        // folderType stays "project" — background is also project-level
      });

      moves.push({
        documentId: doc._id,
        documentName: docName,
        projectId: doc.projectId,
        oldCategory: category,
        oldFolderId: "appraisals",
        newFolderId: "background",
        timestamp: new Date().toISOString(),
      });
    }

    const result = {
      totalScanned: projectDocs.length,
      moved: moves.length,
      skipped: skipped.length,
      moves,
      skippedDetails: skipped,
    };

    console.log(
      `[MIGRATION] migrateAppraisalFolder${args.projectId ? ` (project: ${args.projectId})` : " (all projects)"}:`,
      `scanned=${result.totalScanned}, moved=${result.moved}, skipped=${result.skipped}`
    );

    if (moves.length > 0) {
      console.log("[MIGRATION] Moves:", JSON.stringify(moves, null, 2));
    }
    if (skipped.length > 0) {
      console.log("[MIGRATION] Skipped:", JSON.stringify(skipped, null, 2));
    }

    return result;
  },
});
