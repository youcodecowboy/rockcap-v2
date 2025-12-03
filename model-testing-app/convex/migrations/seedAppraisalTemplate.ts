import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Seed the existing appraisal template into the modelingTemplates library
 * This migration adds the appraisal template that's currently referenced by storage ID
 */
export const seedAppraisalTemplate = mutation({
  args: {},
  handler: async (ctx) => {
    const APPRAISAL_TEMPLATE_STORAGE_ID = 'kg2ejfhc72k3qhvbn2ahgmnhys7vh4r1' as Id<"_storage">;
    
    // Check if template already exists
    const existingTemplates = await ctx.db
      .query("modelingTemplates")
      .filter((q) => q.eq(q.field("fileStorageId"), APPRAISAL_TEMPLATE_STORAGE_ID))
      .collect();
    
    if (existingTemplates.length > 0) {
      return {
        success: true,
        message: "Appraisal template already exists in library",
        templateId: existingTemplates[0]._id,
      };
    }
    
    // Verify storage exists
    try {
      const url = await ctx.storage.getUrl(APPRAISAL_TEMPLATE_STORAGE_ID);
      if (!url) {
        throw new Error("Template file not found in storage");
      }
    } catch (error) {
      return {
        success: false,
        message: `Template file not found: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
    
    // Create template entry
    const now = new Date().toISOString();
    const templateId = await ctx.db.insert("modelingTemplates", {
      name: "Appraisal Model Template",
      description: "Standard appraisal model template for financial modeling",
      modelType: "appraisal",
      fileStorageId: APPRAISAL_TEMPLATE_STORAGE_ID,
      version: "1.0.0",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    
    return {
      success: true,
      message: "Appraisal template added to library successfully",
      templateId,
    };
  },
});


