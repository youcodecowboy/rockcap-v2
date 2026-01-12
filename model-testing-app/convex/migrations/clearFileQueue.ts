import { internalMutation } from "../_generated/server";

/**
 * Migration: Clear File Upload Queue
 * 
 * Clears all orphaned items in the fileUploadQueue table.
 * This should be run after clearing legacy client/project data.
 * 
 * Run with: npx convex run migrations/clearFileQueue:clearFileQueue
 */
export const clearFileQueue = internalMutation({
  handler: async (ctx) => {
    const results = {
      fileUploadQueue: 0,
    };

    // Delete all file upload queue items
    const fileUploadQueue = await ctx.db.query("fileUploadQueue").collect();
    for (const job of fileUploadQueue) {
      await ctx.db.delete(job._id);
      results.fileUploadQueue++;
    }
    console.log(`Deleted ${results.fileUploadQueue} file upload queue items`);

    console.log("=== File Queue Cleanup Complete ===");
    console.log(JSON.stringify(results, null, 2));

    return results;
  },
});
