import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all code mappings
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    categoryCode: v.optional(v.string()),
    inputCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let mappings;
    
    if (args.categoryCode) {
      mappings = await ctx.db
        .query("modelingCodeMappings")
        .withIndex("by_categoryCode", (q: any) => q.eq("categoryCode", args.categoryCode!))
        .collect();
    } else if (args.inputCode) {
      mappings = await ctx.db
        .query("modelingCodeMappings")
        .withIndex("by_inputCode", (q: any) => q.eq("inputCode", args.inputCode!))
        .collect();
    } else {
      mappings = await ctx.db.query("modelingCodeMappings").collect();
    }
    
    if (args.activeOnly !== false) {
      mappings = mappings.filter(m => m.isActive);
    }
    
    // Sort by priority (descending), then by categoryCode
    return mappings.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.categoryCode.localeCompare(b.categoryCode);
    });
  },
});

// Query: Get mapping by ID
export const get = query({
  args: { id: v.id("modelingCodeMappings") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get mappings for a specific template (by input codes)
export const getMappingsForTemplate = query({
  args: {
    inputCodes: v.array(v.string()), // Array of input codes from template
  },
  handler: async (ctx, args) => {
    const allMappings = await ctx.db.query("modelingCodeMappings").collect();
    
    // Filter to active mappings that match any of the input codes
    const matchingMappings = allMappings.filter(m => 
      m.isActive && args.inputCodes.includes(m.inputCode)
    );
    
    // Group by inputCode and sort by priority
    const grouped = new Map<string, typeof matchingMappings>();
    matchingMappings.forEach(mapping => {
      if (!grouped.has(mapping.inputCode)) {
        grouped.set(mapping.inputCode, []);
      }
      grouped.get(mapping.inputCode)!.push(mapping);
    });
    
    // Sort each group by priority (descending)
    grouped.forEach((mappings, inputCode) => {
      mappings.sort((a, b) => b.priority - a.priority);
    });
    
    return Object.fromEntries(grouped);
  },
});

// Query: Get all unique category codes
export const getCategoryCodes = query({
  args: {},
  handler: async (ctx) => {
    const mappings = await ctx.db.query("modelingCodeMappings").collect();
    const codes = new Set(mappings.map(m => m.categoryCode));
    return Array.from(codes).sort();
  },
});

// Query: Get all unique input codes
export const getInputCodes = query({
  args: {},
  handler: async (ctx) => {
    const mappings = await ctx.db.query("modelingCodeMappings").collect();
    const codes = new Set(mappings.map(m => m.inputCode));
    return Array.from(codes).sort();
  },
});

// Mutation: Create code mapping
export const create = mutation({
  args: {
    categoryCode: v.string(),
    inputCode: v.string(),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    dataType: v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("date"),
      v.literal("boolean"),
      v.literal("array")
    ),
    format: v.optional(v.string()),
    priority: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const mappingId = await ctx.db.insert("modelingCodeMappings", {
      categoryCode: args.categoryCode,
      inputCode: args.inputCode,
      displayName: args.displayName,
      description: args.description,
      dataType: args.dataType,
      format: args.format,
      priority: args.priority ?? 0,
      isActive: true,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    return mappingId;
  },
});

// Mutation: Update code mapping
export const update = mutation({
  args: {
    id: v.id("modelingCodeMappings"),
    categoryCode: v.optional(v.string()),
    inputCode: v.optional(v.string()),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    dataType: v.optional(v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("date"),
      v.literal("boolean"),
      v.literal("array")
    )),
    format: v.optional(v.string()),
    priority: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Code mapping not found");
    }
    
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return id;
  },
});

// Mutation: Bulk update code mappings
export const bulkUpdate = mutation({
  args: {
    mappings: v.array(v.object({
      id: v.optional(v.id("modelingCodeMappings")),
      categoryCode: v.string(),
      inputCode: v.string(),
      displayName: v.optional(v.string()),
      description: v.optional(v.string()),
      dataType: v.union(
        v.literal("string"),
        v.literal("number"),
        v.literal("date"),
        v.literal("boolean"),
        v.literal("array")
      ),
      format: v.optional(v.string()),
      priority: v.optional(v.number()),
      isActive: v.optional(v.boolean()),
    })),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const results: { created: string[]; updated: string[] } = {
      created: [],
      updated: [],
    };
    
    for (const mapping of args.mappings) {
      if (mapping.id) {
        // Update existing
        const existing = await ctx.db.get(mapping.id);
        if (existing) {
          await ctx.db.patch(mapping.id, {
            categoryCode: mapping.categoryCode,
            inputCode: mapping.inputCode,
            displayName: mapping.displayName,
            description: mapping.description,
            dataType: mapping.dataType,
            format: mapping.format,
            priority: mapping.priority ?? existing.priority,
            isActive: mapping.isActive ?? existing.isActive,
            updatedAt: now,
          });
          results.updated.push(mapping.id);
        }
      } else {
        // Create new
        const newId = await ctx.db.insert("modelingCodeMappings", {
          categoryCode: mapping.categoryCode,
          inputCode: mapping.inputCode,
          displayName: mapping.displayName,
          description: mapping.description,
          dataType: mapping.dataType,
          format: mapping.format,
          priority: mapping.priority ?? 0,
          isActive: mapping.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        });
        results.created.push(newId);
      }
    }
    
    return results;
  },
});

// Mutation: Delete code mapping
export const remove = mutation({
  args: { id: v.id("modelingCodeMappings") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Mutation: Import mappings from placeholder configs (to be run manually via dashboard)
// This is a placeholder - actual import should be done via migration script
export const importFromConfigs = mutation({
  args: {},
  handler: async (ctx) => {
    // This function should be populated with the actual configs
    // For now, return a message indicating manual import is needed
    return {
      message: "Please run the migration script to import existing mappings. See convex/migrations/seedCodeMappings.ts",
      success: false,
    };
  },
});

