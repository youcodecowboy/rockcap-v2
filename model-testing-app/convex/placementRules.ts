import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

// Query: Get all placement rules
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("documentPlacementRules").collect();
  },
});

// Query: Get placement rules by client type
export const getByClientType = query({
  args: { clientType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentPlacementRules")
      .withIndex("by_client_type", (q: any) => q.eq("clientType", args.clientType))
      .collect();
  },
});

// Query: Get placement rule for a specific document type
export const getForDocumentType = query({
  args: { 
    clientType: v.string(),
    documentType: v.string(),
  },
  handler: async (ctx, args) => {
    const rules = await ctx.db
      .query("documentPlacementRules")
      .withIndex("by_client_type_document", (q: any) => 
        q.eq("clientType", args.clientType).eq("documentType", args.documentType)
      )
      .collect();
    
    // Return highest priority rule
    if (rules.length === 0) return null;
    return rules.sort((a, b) => b.priority - a.priority)[0];
  },
});

// Query: Get placement rule by category (fallback)
export const getByCategory = query({
  args: { 
    clientType: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const rules = await ctx.db
      .query("documentPlacementRules")
      .withIndex("by_client_type", (q: any) => q.eq("clientType", args.clientType))
      .collect();
    
    // Filter by category and return highest priority
    const categoryRules = rules.filter(r => r.category === args.category);
    if (categoryRules.length === 0) return null;
    return categoryRules.sort((a, b) => b.priority - a.priority)[0];
  },
});

// Query: Find placement rule (tries document type first, then category, then default)
export const findPlacementRule = query({
  args: { 
    clientType: v.string(),
    documentType: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const allRules = await ctx.db
      .query("documentPlacementRules")
      .withIndex("by_client_type", (q: any) => q.eq("clientType", args.clientType))
      .collect();
    
    // Sort by priority descending
    const sortedRules = allRules.sort((a, b) => b.priority - a.priority);
    
    // 1. Try exact document type match
    const exactMatch = sortedRules.find(r => r.documentType === args.documentType);
    if (exactMatch) return exactMatch;
    
    // 2. Try category match
    const categoryMatch = sortedRules.find(r => r.category === args.category);
    if (categoryMatch) return categoryMatch;
    
    // 3. Return "Other" fallback rule if exists
    const fallback = sortedRules.find(r => r.documentType === "Other");
    if (fallback) return fallback;
    
    // 4. Return lowest priority rule as ultimate fallback
    return sortedRules.length > 0 ? sortedRules[sortedRules.length - 1] : null;
  },
});

// Query: Get single placement rule by ID
export const get = query({
  args: { id: v.id("documentPlacementRules") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get available document types (distinct)
export const getDocumentTypes = query({
  args: { clientType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let rules = await ctx.db.query("documentPlacementRules").collect();
    
    if (args.clientType) {
      rules = rules.filter(r => r.clientType === args.clientType);
    }
    
    const types = new Set(rules.map(r => r.documentType));
    return Array.from(types).sort();
  },
});

// Query: Get available categories (distinct)
export const getCategories = query({
  args: { clientType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let rules = await ctx.db.query("documentPlacementRules").collect();
    
    if (args.clientType) {
      rules = rules.filter(r => r.clientType === args.clientType);
    }
    
    const categories = new Set(rules.map(r => r.category));
    return Array.from(categories).sort();
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

// Mutation: Create placement rule
export const create = mutation({
  args: {
    clientType: v.string(),
    documentType: v.string(),
    category: v.string(),
    targetFolderKey: v.string(),
    targetLevel: v.union(v.literal("client"), v.literal("project")),
    priority: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check for duplicate rule
    const existing = await ctx.db
      .query("documentPlacementRules")
      .withIndex("by_client_type_document", (q: any) => 
        q.eq("clientType", args.clientType).eq("documentType", args.documentType)
      )
      .first();
    
    if (existing) {
      throw new Error(`A rule for "${args.documentType}" already exists for client type "${args.clientType}"`);
    }
    
    return await ctx.db.insert("documentPlacementRules", {
      clientType: args.clientType.toLowerCase(),
      documentType: args.documentType,
      category: args.category,
      targetFolderKey: args.targetFolderKey,
      targetLevel: args.targetLevel,
      priority: args.priority ?? 50,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Mutation: Update placement rule
export const update = mutation({
  args: {
    id: v.id("documentPlacementRules"),
    documentType: v.optional(v.string()),
    category: v.optional(v.string()),
    targetFolderKey: v.optional(v.string()),
    targetLevel: v.optional(v.union(v.literal("client"), v.literal("project"))),
    priority: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Placement rule not found");
    }
    
    const { id, ...updates } = args;
    const cleanUpdates: any = { updatedAt: new Date().toISOString() };
    
    // Only include defined updates
    if (updates.documentType !== undefined) cleanUpdates.documentType = updates.documentType;
    if (updates.category !== undefined) cleanUpdates.category = updates.category;
    if (updates.targetFolderKey !== undefined) cleanUpdates.targetFolderKey = updates.targetFolderKey;
    if (updates.targetLevel !== undefined) cleanUpdates.targetLevel = updates.targetLevel;
    if (updates.priority !== undefined) cleanUpdates.priority = updates.priority;
    if (updates.description !== undefined) cleanUpdates.description = updates.description;
    
    await ctx.db.patch(args.id, cleanUpdates);
    return args.id;
  },
});

// Mutation: Delete placement rule
export const remove = mutation({
  args: { id: v.id("documentPlacementRules") },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) {
      throw new Error("Placement rule not found");
    }
    
    await ctx.db.delete(args.id);
  },
});

// Mutation: Bulk create/update rules for a client type
export const bulkUpsert = mutation({
  args: {
    clientType: v.string(),
    rules: v.array(v.object({
      documentType: v.string(),
      category: v.string(),
      targetFolderKey: v.string(),
      targetLevel: v.union(v.literal("client"), v.literal("project")),
      priority: v.optional(v.number()),
      description: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const clientType = args.clientType.toLowerCase();
    
    // Get existing rules for this client type
    const existingRules = await ctx.db
      .query("documentPlacementRules")
      .withIndex("by_client_type", (q: any) => q.eq("clientType", clientType))
      .collect();
    
    const existingByDocType = new Map(existingRules.map(r => [r.documentType, r]));
    
    let created = 0;
    let updated = 0;
    
    for (const rule of args.rules) {
      const existing = existingByDocType.get(rule.documentType);
      
      if (existing) {
        // Update existing rule
        await ctx.db.patch(existing._id, {
          category: rule.category,
          targetFolderKey: rule.targetFolderKey,
          targetLevel: rule.targetLevel,
          priority: rule.priority ?? existing.priority,
          description: rule.description,
          updatedAt: now,
        });
        updated++;
      } else {
        // Create new rule
        await ctx.db.insert("documentPlacementRules", {
          clientType,
          documentType: rule.documentType,
          category: rule.category,
          targetFolderKey: rule.targetFolderKey,
          targetLevel: rule.targetLevel,
          priority: rule.priority ?? 50,
          description: rule.description,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }
    
    return { created, updated };
  },
});

// Mutation: Copy rules from one client type to another
export const copyRules = mutation({
  args: {
    sourceClientType: v.string(),
    targetClientType: v.string(),
    overwrite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Get source rules
    const sourceRules = await ctx.db
      .query("documentPlacementRules")
      .withIndex("by_client_type", (q: any) => q.eq("clientType", args.sourceClientType))
      .collect();
    
    if (sourceRules.length === 0) {
      throw new Error(`No rules found for client type "${args.sourceClientType}"`);
    }
    
    // Get existing target rules
    const targetRules = await ctx.db
      .query("documentPlacementRules")
      .withIndex("by_client_type", (q: any) => q.eq("clientType", args.targetClientType))
      .collect();
    
    if (targetRules.length > 0 && !args.overwrite) {
      throw new Error(`Rules already exist for client type "${args.targetClientType}". Set overwrite=true to replace.`);
    }
    
    // Delete existing target rules if overwriting
    if (args.overwrite) {
      for (const rule of targetRules) {
        await ctx.db.delete(rule._id);
      }
    }
    
    // Copy source rules to target
    let created = 0;
    for (const rule of sourceRules) {
      await ctx.db.insert("documentPlacementRules", {
        clientType: args.targetClientType.toLowerCase(),
        documentType: rule.documentType,
        category: rule.category,
        targetFolderKey: rule.targetFolderKey,
        targetLevel: rule.targetLevel,
        priority: rule.priority,
        description: rule.description,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
    
    return { created, deleted: args.overwrite ? targetRules.length : 0 };
  },
});
