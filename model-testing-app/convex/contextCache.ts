import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const CACHE_TTL_HOURS = 24;

/**
 * Get cached context by context type and ID
 */
export const get = query({
  args: {
    contextType: v.union(v.literal("client"), v.literal("project")),
    contextId: v.string(),
  },
  handler: async (ctx, args) => {
    const cache = await ctx.db
      .query("contextCache")
      .withIndex("by_context", (q: any) =>
        q.eq("contextType", args.contextType).eq("contextId", args.contextId)
      )
      .first();

    return cache;
  },
});

/**
 * Set/update cached context
 */
export const set = mutation({
  args: {
    contextType: v.union(v.literal("client"), v.literal("project")),
    contextId: v.string(),
    cachedContext: v.string(),
    metadata: v.object({
      knowledgeBankCount: v.number(),
      documentsCount: v.number(),
      notesCount: v.number(),
      contactsCount: v.optional(v.number()),
      dealsCount: v.optional(v.number()),
      tasksCount: v.optional(v.number()),
      eventsCount: v.optional(v.number()),
      lastDataUpdate: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    // Check if cache already exists
    const existing = await ctx.db
      .query("contextCache")
      .withIndex("by_context", (q: any) =>
        q.eq("contextType", args.contextType).eq("contextId", args.contextId)
      )
      .first();

    if (existing) {
      // Update existing cache
      await ctx.db.patch(existing._id, {
        cachedContext: args.cachedContext,
        metadata: args.metadata,
        updatedAt: now,
        expiresAt,
      });
      return existing._id;
    } else {
      // Create new cache entry
      const cacheId = await ctx.db.insert("contextCache", {
        contextType: args.contextType,
        contextId: args.contextId,
        cachedContext: args.cachedContext,
        metadata: args.metadata,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      });
      return cacheId;
    }
  },
});

/**
 * Invalidate cache for a specific context
 */
export const invalidate = mutation({
  args: {
    contextType: v.union(v.literal("client"), v.literal("project")),
    contextId: v.string(),
  },
  handler: async (ctx, args) => {
    const cache = await ctx.db
      .query("contextCache")
      .withIndex("by_context", (q: any) =>
        q.eq("contextType", args.contextType).eq("contextId", args.contextId)
      )
      .first();

    if (cache) {
      await ctx.db.delete(cache._id);
    }
  },
});

/**
 * Check if cache is valid (not expired and data hasn't changed)
 */
export const isValid = query({
  args: {
    contextType: v.union(v.literal("client"), v.literal("project")),
    contextId: v.string(),
  },
  handler: async (ctx, args) => {
    const cache = await ctx.db
      .query("contextCache")
      .withIndex("by_context", (q: any) =>
        q.eq("contextType", args.contextType).eq("contextId", args.contextId)
      )
      .first();

    if (!cache) {
      return false;
    }

    // Check if cache has expired
    const now = new Date();
    const expiresAt = new Date(cache.expiresAt);
    if (now > expiresAt) {
      return false;
    }

    // Check if data has been updated since cache was created
    // We'll check the lastDataUpdate timestamp against actual data
    const cacheLastUpdate = new Date(cache.metadata.lastDataUpdate);
    
    // Get the most recent update timestamp from related tables
    let mostRecentUpdate: Date | null = null;

    if (args.contextType === "client") {
      const clientId = args.contextId as Id<"clients">;
      
      // Check knowledge bank entries
      const kbEntries = await ctx.db
        .query("knowledgeBankEntries")
        .withIndex("by_client", (q: any) => q.eq("clientId", clientId))
        .collect();
      for (const entry of kbEntries) {
        const entryDate = new Date(entry.updatedAt || entry.createdAt);
        if (!mostRecentUpdate || entryDate > mostRecentUpdate) {
          mostRecentUpdate = entryDate;
        }
      }

      // Check documents
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_client", (q: any) => q.eq("clientId", clientId))
        .collect();
      for (const doc of docs) {
        const docDate = new Date(doc.savedAt);
        if (!mostRecentUpdate || docDate > mostRecentUpdate) {
          mostRecentUpdate = docDate;
        }
      }

      // Check notes
      const notes = await ctx.db
        .query("notes")
        .withIndex("by_client", (q: any) => q.eq("clientId", clientId))
        .collect();
      for (const note of notes) {
        const noteDate = new Date(note.updatedAt);
        if (!mostRecentUpdate || noteDate > mostRecentUpdate) {
          mostRecentUpdate = noteDate;
        }
      }

      // Check client itself
      const client = await ctx.db.get(clientId);
      if (client) {
        // Clients don't have updatedAt, so we'll skip this check
      }
    } else if (args.contextType === "project") {
      const projectId = args.contextId as Id<"projects">;
      
      // Check knowledge bank entries
      const kbEntries = await ctx.db
        .query("knowledgeBankEntries")
        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
        .collect();
      for (const entry of kbEntries) {
        const entryDate = new Date(entry.updatedAt || entry.createdAt);
        if (!mostRecentUpdate || entryDate > mostRecentUpdate) {
          mostRecentUpdate = entryDate;
        }
      }

      // Check documents
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
        .collect();
      for (const doc of docs) {
        const docDate = new Date(doc.savedAt);
        if (!mostRecentUpdate || docDate > mostRecentUpdate) {
          mostRecentUpdate = docDate;
        }
      }

      // Check notes
      const notes = await ctx.db
        .query("notes")
        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
        .collect();
      for (const note of notes) {
        const noteDate = new Date(note.updatedAt);
        if (!mostRecentUpdate || noteDate > mostRecentUpdate) {
          mostRecentUpdate = noteDate;
        }
      }

      // Check project itself
      const project = await ctx.db.get(projectId);
      if (project) {
        // Projects don't have updatedAt, so we'll skip this check
      }
    }

    // If we found a more recent update, cache is invalid
    if (mostRecentUpdate && mostRecentUpdate > cacheLastUpdate) {
      return false;
    }

    return true;
  },
});

