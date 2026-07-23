import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get Excel template file URL by name
export const getTemplateByName = query({
  args: { fileName: v.string() },
  handler: async (ctx, args) => {
    // First try to find in documents table
    const doc = await ctx.db
      .query("documents")
      .filter((q) => q.and(
        q.eq(q.field("fileName"), args.fileName),
        q.neq(q.field("isDeleted"), true)
      ))
      .first();
    
    if (doc && doc.fileStorageId) {
      const url = await ctx.storage.getUrl(doc.fileStorageId);
      return {
        url,
        document: doc,
      };
    }
    
    // If not found, return null
    return null;
  },
});

// Query: Get all Excel templates
//
// fileType (a MIME string) is not indexed, and Excel docs are rare, so a
// filtered .collect() previously scanned the ENTIRE heavy documents table
// (textContent/extractedData rows) to find a handful of matches → 16MB
// read-limit crash risk. There is no usable index (by_category / by_status hold
// unrelated values), so we bound the scan to the newest 1000 rows and filter in
// JS. Trade-off: templates older than the newest 1000 docs won't surface.
// FOLLOW-UP: a documents `.index("by_fileType", ["fileType"])` would make this
// exact and cheap again.
export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db.query("documents").order("desc").take(1000);
    return recent.filter((doc) =>
      doc.isDeleted !== true &&
      (doc.fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        doc.fileType === "application/vnd.ms-excel")
    );
  },
});

// Query: Get template file URL by storage ID
export const getTemplateUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

