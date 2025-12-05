import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all item codes
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let codes;
    
    if (args.category) {
      codes = await ctx.db
        .query("extractedItemCodes")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else {
      codes = await ctx.db.query("extractedItemCodes").collect();
    }
    
    // Filter by active status if requested (default to active only)
    if (args.activeOnly !== false) {
      codes = codes.filter(c => c.isActive);
    }
    
    // Sort by category, then by displayName
    return codes.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.displayName.localeCompare(b.displayName);
    });
  },
});

// Query: Get item code by ID
export const get = query({
  args: { id: v.id("extractedItemCodes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get item code by code string
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const codes = await ctx.db
      .query("extractedItemCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .collect();
    return codes[0] || null;
  },
});

// Query: Get all unique categories
export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    const codes = await ctx.db
      .query("extractedItemCodes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    const categories = new Set(codes.map(c => c.category));
    return Array.from(categories).sort();
  },
});

// Query: Get codes grouped by category
export const getGroupedByCategory = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let codes = await ctx.db.query("extractedItemCodes").collect();
    
    if (args.activeOnly !== false) {
      codes = codes.filter(c => c.isActive);
    }
    
    // Group by category
    const grouped: Record<string, typeof codes> = {};
    codes.forEach(code => {
      if (!grouped[code.category]) {
        grouped[code.category] = [];
      }
      grouped[code.category].push(code);
    });
    
    // Sort codes within each category
    Object.keys(grouped).forEach(category => {
      grouped[category].sort((a, b) => a.displayName.localeCompare(b.displayName));
    });
    
    return grouped;
  },
});

// Mutation: Create item code
export const create = mutation({
  args: {
    code: v.string(),
    displayName: v.string(),
    category: v.string(),
    dataType: v.union(
      v.literal("currency"),
      v.literal("number"),
      v.literal("percentage"),
      v.literal("string")
    ),
    isSystemDefault: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Check if code already exists
    const existing = await ctx.db
      .query("extractedItemCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    
    if (existing) {
      throw new Error(`Item code "${args.code}" already exists`);
    }
    
    const now = new Date().toISOString();
    const codeId = await ctx.db.insert("extractedItemCodes", {
      code: args.code,
      displayName: args.displayName,
      category: args.category,
      dataType: args.dataType,
      isSystemDefault: args.isSystemDefault,
      isActive: true,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    
    return codeId;
  },
});

// Mutation: Update item code
export const update = mutation({
  args: {
    id: v.id("extractedItemCodes"),
    code: v.optional(v.string()),
    displayName: v.optional(v.string()),
    category: v.optional(v.string()),
    dataType: v.optional(v.union(
      v.literal("currency"),
      v.literal("number"),
      v.literal("percentage"),
      v.literal("string")
    )),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    
    if (!existing) {
      throw new Error("Item code not found");
    }
    
    // If changing code, check for duplicates
    if (updates.code && updates.code !== existing.code) {
      const duplicate = await ctx.db
        .query("extractedItemCodes")
        .withIndex("by_code", (q) => q.eq("code", updates.code!))
        .first();
      
      if (duplicate) {
        throw new Error(`Item code "${updates.code}" already exists`);
      }
    }
    
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    
    return id;
  },
});

// Mutation: Delete item code
export const remove = mutation({
  args: { id: v.id("extractedItemCodes") },
  handler: async (ctx, args) => {
    // Check if there are aliases pointing to this code
    const aliases = await ctx.db
      .query("itemCodeAliases")
      .withIndex("by_canonical_code", (q) => q.eq("canonicalCodeId", args.id))
      .collect();
    
    if (aliases.length > 0) {
      throw new Error(`Cannot delete item code with ${aliases.length} aliases. Delete aliases first.`);
    }
    
    await ctx.db.delete(args.id);
  },
});

// Mutation: Change category for an item code
export const changeCategory = mutation({
  args: {
    id: v.id("extractedItemCodes"),
    newCategory: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    
    if (!existing) {
      throw new Error("Item code not found");
    }
    
    if (existing.category === args.newCategory) {
      return args.id; // No change needed
    }
    
    await ctx.db.patch(args.id, {
      category: args.newCategory,
      updatedAt: new Date().toISOString(),
    });
    
    return args.id;
  },
});

// Mutation: Bulk change category for multiple item codes
export const bulkChangeCategory = mutation({
  args: {
    ids: v.array(v.id("extractedItemCodes")),
    newCategory: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    let updated = 0;
    
    for (const id of args.ids) {
      const existing = await ctx.db.get(id);
      if (existing && existing.category !== args.newCategory) {
        await ctx.db.patch(id, {
          category: args.newCategory,
          updatedAt: now,
        });
        updated++;
      }
    }
    
    return { updated };
  },
});

// Mutation: Bulk create item codes (for seeding)
export const bulkCreate = mutation({
  args: {
    codes: v.array(v.object({
      code: v.string(),
      displayName: v.string(),
      category: v.string(),
      dataType: v.union(
        v.literal("currency"),
        v.literal("number"),
        v.literal("percentage"),
        v.literal("string")
      ),
      isSystemDefault: v.optional(v.boolean()),
    })),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const results: { created: string[]; skipped: string[] } = {
      created: [],
      skipped: [],
    };
    
    for (const code of args.codes) {
      // Check if code already exists
      const existing = await ctx.db
        .query("extractedItemCodes")
        .withIndex("by_code", (q) => q.eq("code", code.code))
        .first();
      
      if (existing) {
        results.skipped.push(code.code);
        continue;
      }
      
      const codeId = await ctx.db.insert("extractedItemCodes", {
        ...code,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      
      results.created.push(codeId);
    }
    
    return results;
  },
});

