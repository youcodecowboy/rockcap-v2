import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { STANDARD_PLACEHOLDERS, APPRAISAL_MODEL_PLACEHOLDERS, OPERATING_MODEL_PLACEHOLDERS } from "../../src/lib/placeholderConfigs";

/**
 * Seed code mappings from existing placeholderConfigs.ts
 * This migration imports all existing placeholder mappings into the database
 */
export const seedCodeMappings = mutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const createdIds: string[] = [];
    
    // Helper to convert PlaceholderConfig to database mappings
    const processConfig = async (config: typeof STANDARD_PLACEHOLDERS) => {
      for (const [inputCode, mapping] of Object.entries(config)) {
        // Handle array mappings (ArrayPlaceholderMapping)
        if ('startMarker' in mapping && 'endMarker' in mapping) {
          const arrayMapping = mapping as any;
          const mappingId = await ctx.db.insert("modelingCodeMappings", {
            categoryCode: arrayMapping.source,
            inputCode: inputCode,
            displayName: inputCode.replace(/[<>]/g, '').replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            description: `Array mapping for ${inputCode}`,
            dataType: 'array',
            format: undefined,
            priority: arrayMapping.priority || 0,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });
          createdIds.push(mappingId);
        } 
        // Handle array of mappings (multiple priorities)
        else if (Array.isArray(mapping)) {
          for (const singleMapping of mapping) {
            const mappingId = await ctx.db.insert("modelingCodeMappings", {
              categoryCode: singleMapping.source,
              inputCode: inputCode,
              displayName: inputCode.replace(/[<>]/g, '').replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              description: `Mapping for ${inputCode}`,
              dataType: singleMapping.type,
              format: singleMapping.format,
              priority: singleMapping.priority || 0,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            });
            createdIds.push(mappingId);
          }
        }
        // Handle single mapping
        else if ('source' in mapping && 'type' in mapping) {
          const singleMapping = mapping as any;
          const mappingId = await ctx.db.insert("modelingCodeMappings", {
            categoryCode: singleMapping.source,
            inputCode: inputCode,
            displayName: inputCode.replace(/[<>]/g, '').replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            description: `Mapping for ${inputCode}`,
            dataType: singleMapping.type,
            format: singleMapping.format,
            priority: singleMapping.priority || 0,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });
          createdIds.push(mappingId);
        }
      }
    };
    
    // Import all configs
    await processConfig(STANDARD_PLACEHOLDERS);
    await processConfig(APPRAISAL_MODEL_PLACEHOLDERS);
    await processConfig(OPERATING_MODEL_PLACEHOLDERS);
    
    return {
      success: true,
      count: createdIds.length,
      ids: createdIds,
    };
  },
});

