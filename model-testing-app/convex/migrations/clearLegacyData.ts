import { internalMutation } from "../_generated/server";

/**
 * Migration: Clear Legacy Data
 * 
 * Clears all existing clients, projects, folders, and related data
 * to prepare for the new folder template system.
 * 
 * WARNING: This is destructive and cannot be undone!
 * 
 * Run with: npx convex run migrations/clearLegacyData:clearLegacyData
 */
export const clearLegacyData = internalMutation({
  handler: async (ctx) => {
    const results = {
      clientFolders: 0,
      projectFolders: 0,
      bulkUploadItems: 0,
      bulkUploadBatches: 0,
      documents: 0,
      knowledgeBankEntries: 0,
      projects: 0,
      clients: 0,
    };

    // 1. Delete all client folders
    const clientFolders = await ctx.db.query("clientFolders").collect();
    for (const folder of clientFolders) {
      await ctx.db.delete(folder._id);
      results.clientFolders++;
    }
    console.log(`Deleted ${results.clientFolders} client folders`);

    // 2. Delete all project folders
    const projectFolders = await ctx.db.query("projectFolders").collect();
    for (const folder of projectFolders) {
      await ctx.db.delete(folder._id);
      results.projectFolders++;
    }
    console.log(`Deleted ${results.projectFolders} project folders`);

    // 3. Delete all bulk upload items
    const bulkUploadItems = await ctx.db.query("bulkUploadItems").collect();
    for (const item of bulkUploadItems) {
      await ctx.db.delete(item._id);
      results.bulkUploadItems++;
    }
    console.log(`Deleted ${results.bulkUploadItems} bulk upload items`);

    // 4. Delete all bulk upload batches
    const bulkUploadBatches = await ctx.db.query("bulkUploadBatches").collect();
    for (const batch of bulkUploadBatches) {
      await ctx.db.delete(batch._id);
      results.bulkUploadBatches++;
    }
    console.log(`Deleted ${results.bulkUploadBatches} bulk upload batches`);

    // 5. Delete all documents (they reference clients/projects)
    const documents = await ctx.db.query("documents").collect();
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
      results.documents++;
    }
    console.log(`Deleted ${results.documents} documents`);

    // 6. Delete all knowledge bank entries (they reference clients/projects)
    const knowledgeBankEntries = await ctx.db.query("knowledgeBankEntries").collect();
    for (const entry of knowledgeBankEntries) {
      await ctx.db.delete(entry._id);
      results.knowledgeBankEntries++;
    }
    console.log(`Deleted ${results.knowledgeBankEntries} knowledge bank entries`);

    // 7. Delete all projects
    const projects = await ctx.db.query("projects").collect();
    for (const project of projects) {
      await ctx.db.delete(project._id);
      results.projects++;
    }
    console.log(`Deleted ${results.projects} projects`);

    // 8. Delete all clients
    const clients = await ctx.db.query("clients").collect();
    for (const client of clients) {
      await ctx.db.delete(client._id);
      results.clients++;
    }
    console.log(`Deleted ${results.clients} clients`);

    console.log("=== Legacy Data Cleanup Complete ===");
    console.log(JSON.stringify(results, null, 2));

    return results;
  },
});
