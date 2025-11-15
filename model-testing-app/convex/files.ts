import { v } from "convex/values";
import { mutation } from "./_generated/server";

// Mutation: Generate upload URL for file storage
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

