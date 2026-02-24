import { internalMutation } from "../_generated/server";

/**
 * Migration: Set Default Document Scope
 *
 * Sets scope: "client" for all existing documents that don't have a scope set.
 * This ensures backward compatibility after adding the multi-scope document feature.
 *
 * Run with: npx convex run migrations/setDefaultDocumentScope:setDefaultDocumentScope
 */
export const setDefaultDocumentScope = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").collect();
    let updated = 0;
    let skipped = 0;

    for (const doc of allDocs) {
      // Skip if scope is already set
      if (doc.scope) {
        skipped++;
        continue;
      }

      try {
        // Set scope to "client" for all existing documents
        await ctx.db.patch(doc._id, { scope: "client" });
        updated++;
      } catch (error) {
        console.error(`Failed to update document ${doc._id}:`, error);
        skipped++;
      }
    }

    console.log("=== Document Scope Migration Complete ===");
    console.log(`Total documents: ${allDocs.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (already had scope): ${skipped}`);

    return {
      total: allDocs.length,
      updated,
      skipped,
    };
  },
});
