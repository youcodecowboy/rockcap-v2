import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Helper to normalize alias text for matching
function normalizeAlias(alias: string): string {
  return alias.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Query: Get all aliases
export const list = query({
  args: {
    canonicalCodeId: v.optional(v.id("extractedItemCodes")),
    source: v.optional(v.union(
      v.literal("system_seed"),
      v.literal("llm_suggested"),
      v.literal("user_confirmed"),
      v.literal("manual")
    )),
  },
  handler: async (ctx, args) => {
    let aliases;
    
    if (args.canonicalCodeId) {
      aliases = await ctx.db
        .query("itemCodeAliases")
        .withIndex("by_canonical_code", (q) => q.eq("canonicalCodeId", args.canonicalCodeId!))
        .collect();
    } else if (args.source) {
      aliases = await ctx.db
        .query("itemCodeAliases")
        .withIndex("by_source", (q) => q.eq("source", args.source!))
        .collect();
    } else {
      aliases = await ctx.db.query("itemCodeAliases").collect();
    }
    
    // Sort by alias text
    return aliases.sort((a, b) => a.alias.localeCompare(b.alias));
  },
});

// Query: Get alias by ID
export const get = query({
  args: { id: v.id("itemCodeAliases") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Look up alias by normalized text (for Fast Pass matching)
export const lookupByAlias = query({
  args: { alias: v.string() },
  handler: async (ctx, args) => {
    const normalized = normalizeAlias(args.alias);
    
    const matches = await ctx.db
      .query("itemCodeAliases")
      .withIndex("by_alias_normalized", (q) => q.eq("aliasNormalized", normalized))
      .collect();
    
    if (matches.length === 0) {
      return null;
    }
    
    // Return the highest confidence match
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
  },
});

// Query: Bulk lookup aliases (for Fast Pass - more efficient)
export const bulkLookup = query({
  args: { aliases: v.array(v.string()) },
  handler: async (ctx, args) => {
    // Get all aliases from database (will be cached by Convex)
    const allAliases = await ctx.db.query("itemCodeAliases").collect();
    
    // Build lookup map
    const lookupMap = new Map<string, typeof allAliases[0]>();
    allAliases.forEach(alias => {
      const existing = lookupMap.get(alias.aliasNormalized);
      // Keep highest confidence match
      if (!existing || alias.confidence > existing.confidence) {
        lookupMap.set(alias.aliasNormalized, alias);
      }
    });
    
    // Look up each requested alias
    const results: Record<string, {
      canonicalCode: string;
      canonicalCodeId: string;
      confidence: number;
      source: string;
    } | null> = {};
    
    for (const alias of args.aliases) {
      const normalized = normalizeAlias(alias);
      const match = lookupMap.get(normalized);
      
      if (match) {
        results[alias] = {
          canonicalCode: match.canonicalCode,
          canonicalCodeId: match.canonicalCodeId,
          confidence: match.confidence,
          source: match.source,
        };
      } else {
        results[alias] = null;
      }
    }
    
    return results;
  },
});

// Query: Get aliases grouped by canonical code
export const getGroupedByCode = query({
  args: {},
  handler: async (ctx) => {
    const aliases = await ctx.db.query("itemCodeAliases").collect();
    
    // Group by canonical code
    const grouped: Record<string, typeof aliases> = {};
    aliases.forEach(alias => {
      if (!grouped[alias.canonicalCode]) {
        grouped[alias.canonicalCode] = [];
      }
      grouped[alias.canonicalCode].push(alias);
    });
    
    // Sort aliases within each group
    Object.keys(grouped).forEach(code => {
      grouped[code].sort((a, b) => b.confidence - a.confidence);
    });
    
    return grouped;
  },
});

// Mutation: Create alias
export const create = mutation({
  args: {
    alias: v.string(),
    canonicalCodeId: v.id("extractedItemCodes"),
    confidence: v.optional(v.number()),
    source: v.union(
      v.literal("system_seed"),
      v.literal("llm_suggested"),
      v.literal("user_confirmed"),
      v.literal("manual")
    ),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeAlias(args.alias);
    
    // Get the canonical code
    const canonicalCode = await ctx.db.get(args.canonicalCodeId);
    if (!canonicalCode) {
      throw new Error("Canonical code not found");
    }
    
    // Check if this exact alias already exists
    const existing = await ctx.db
      .query("itemCodeAliases")
      .withIndex("by_alias_normalized", (q) => q.eq("aliasNormalized", normalized))
      .first();
    
    if (existing) {
      // Update existing alias if this one has higher confidence or is from user
      if (
        args.source === "user_confirmed" ||
        args.source === "manual" ||
        (args.confidence || 1.0) > existing.confidence
      ) {
        await ctx.db.patch(existing._id, {
          canonicalCodeId: args.canonicalCodeId,
          canonicalCode: canonicalCode.code,
          confidence: args.confidence ?? 1.0,
          source: args.source,
          usageCount: (existing.usageCount || 0) + 1,
        });
        return existing._id;
      }
      return existing._id;
    }
    
    const aliasId = await ctx.db.insert("itemCodeAliases", {
      alias: args.alias,
      aliasNormalized: normalized,
      canonicalCodeId: args.canonicalCodeId,
      canonicalCode: canonicalCode.code,
      confidence: args.confidence ?? 1.0,
      source: args.source,
      usageCount: 1,
      createdAt: new Date().toISOString(),
    });
    
    return aliasId;
  },
});

// Mutation: Update alias
export const update = mutation({
  args: {
    id: v.id("itemCodeAliases"),
    canonicalCodeId: v.optional(v.id("extractedItemCodes")),
    confidence: v.optional(v.number()),
    source: v.optional(v.union(
      v.literal("system_seed"),
      v.literal("llm_suggested"),
      v.literal("user_confirmed"),
      v.literal("manual")
    )),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    
    if (!existing) {
      throw new Error("Alias not found");
    }
    
    // If changing canonical code, get the new code string
    if (updates.canonicalCodeId) {
      const newCode = await ctx.db.get(updates.canonicalCodeId);
      if (!newCode) {
        throw new Error("New canonical code not found");
      }
      await ctx.db.patch(id, {
        ...updates,
        canonicalCode: newCode.code,
      });
    } else {
      await ctx.db.patch(id, updates);
    }
    
    return id;
  },
});

// Mutation: Delete alias
export const remove = mutation({
  args: { id: v.id("itemCodeAliases") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Mutation: Increment usage count (called when alias is matched)
export const incrementUsage = mutation({
  args: { id: v.id("itemCodeAliases") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return;
    
    await ctx.db.patch(args.id, {
      usageCount: (existing.usageCount || 0) + 1,
    });
  },
});

// Mutation: Bulk create aliases (for seeding or LLM suggestions)
export const bulkCreate = mutation({
  args: {
    aliases: v.array(v.object({
      alias: v.string(),
      canonicalCodeId: v.id("extractedItemCodes"),
      confidence: v.optional(v.number()),
      source: v.union(
        v.literal("system_seed"),
        v.literal("llm_suggested"),
        v.literal("user_confirmed"),
        v.literal("manual")
      ),
    })),
  },
  handler: async (ctx, args) => {
    const results: { created: string[]; updated: string[]; skipped: string[] } = {
      created: [],
      updated: [],
      skipped: [],
    };
    
    for (const aliasData of args.aliases) {
      const normalized = normalizeAlias(aliasData.alias);
      
      // Get the canonical code
      const canonicalCode = await ctx.db.get(aliasData.canonicalCodeId);
      if (!canonicalCode) {
        results.skipped.push(aliasData.alias);
        continue;
      }
      
      // Check if alias already exists
      const existing = await ctx.db
        .query("itemCodeAliases")
        .withIndex("by_alias_normalized", (q) => q.eq("aliasNormalized", normalized))
        .first();
      
      if (existing) {
        // Update if higher priority source or confidence
        const shouldUpdate = 
          aliasData.source === "user_confirmed" ||
          aliasData.source === "manual" ||
          (aliasData.confidence || 1.0) > existing.confidence;
        
        if (shouldUpdate) {
          await ctx.db.patch(existing._id, {
            canonicalCodeId: aliasData.canonicalCodeId,
            canonicalCode: canonicalCode.code,
            confidence: aliasData.confidence ?? 1.0,
            source: aliasData.source,
          });
          results.updated.push(existing._id);
        } else {
          results.skipped.push(aliasData.alias);
        }
      } else {
        const aliasId = await ctx.db.insert("itemCodeAliases", {
          alias: aliasData.alias,
          aliasNormalized: normalized,
          canonicalCodeId: aliasData.canonicalCodeId,
          canonicalCode: canonicalCode.code,
          confidence: aliasData.confidence ?? 1.0,
          source: aliasData.source,
          usageCount: 0,
          createdAt: new Date().toISOString(),
        });
        results.created.push(aliasId);
      }
    }
    
    return results;
  },
});

