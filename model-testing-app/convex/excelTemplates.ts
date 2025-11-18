import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get Excel template file URL by name
export const getTemplateByName = query({
  args: { fileName: v.string() },
  handler: async (ctx, args) => {
    // First try to find in documents table
    const doc = await ctx.db
      .query("documents")
      .filter((q) => q.eq(q.field("fileName"), args.fileName))
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
export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db
      .query("documents")
      .filter((q) => 
        q.or(
          q.eq(q.field("fileType"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
          q.eq(q.field("fileType"), "application/vnd.ms-excel")
        )
      )
      .collect();
    
    return docs;
  },
});

// Query: Get template file URL by storage ID
export const getTemplateUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

