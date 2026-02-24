import { mutation, query } from "../_generated/server";
import { api } from "../_generated/api";

/**
 * Migration: Resync all intelligence data
 * 
 * This migration:
 * 1. Flags subtotals in projectDataItems
 * 2. Resyncs all project intelligence (to exclude subtotals from totals)
 * 3. Resyncs all client intelligence (to include aggregated project data)
 * 
 * Run with: npx convex run migrations/resyncIntelligence:resyncAll
 * Dry run:  npx convex run migrations/resyncIntelligence:previewResync
 */

/**
 * Subtotal detection patterns
 */
const SUBTOTAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^total\b/i, reason: 'Starts with "total"' },
  { pattern: /\btotal$/i, reason: 'Ends with "total"' },
  { pattern: /^sub[\s-]?total/i, reason: 'Starts with "subtotal"' },
  { pattern: /\bsub[\s-]?total$/i, reason: 'Ends with "subtotal"' },
  { pattern: /\bgrand\s+total\b/i, reason: 'Contains "grand total"' },
  { pattern: /\bnet\s+total\b/i, reason: 'Contains "net total"' },
  { pattern: /\bgross\s+total\b/i, reason: 'Contains "gross total"' },
  { pattern: /^total\s+(cost|costs|expense|expenses|fees|amount)/i, reason: 'Total cost/expense line' },
  { pattern: /\b(cost|costs|expense|expenses|fees)\s+total$/i, reason: 'Category total line' },
  { pattern: /^sum\b/i, reason: 'Starts with "sum"' },
  { pattern: /\bsum$/i, reason: 'Ends with "sum"' },
  { pattern: /^overall\b/i, reason: 'Starts with "overall"' },
  { pattern: /\b(section|category)\s+total\b/i, reason: 'Section/category total' },
  { pattern: /^aggregate\b/i, reason: 'Aggregate line' },
  { pattern: /^total\s+\d+/i, reason: 'Total with row number' },
  { pattern: /^\d+[\.\)]?\s*total\b/i, reason: 'Numbered total line' },
];

function detectSubtotal(name: string): { isSubtotal: boolean; reason?: string } {
  if (!name) return { isSubtotal: false };
  const trimmedName = name.trim();
  for (const { pattern, reason } of SUBTOTAL_PATTERNS) {
    if (pattern.test(trimmedName)) {
      return { isSubtotal: true, reason };
    }
  }
  return { isSubtotal: false };
}

/**
 * Preview what will be resynced
 */
export const previewResync = query({
  args: {},
  handler: async (ctx) => {
    // Count data items and detect subtotals
    const dataItems = await ctx.db.query("projectDataItems").collect();
    const activeItems = dataItems.filter(i => !i.isDeleted);
    
    let subtotalsToFlag = 0;
    let alreadyFlagged = 0;
    
    for (const item of activeItems) {
      if (item.isSubtotal) {
        alreadyFlagged++;
      } else {
        const detection = detectSubtotal(item.originalName);
        if (detection.isSubtotal) {
          subtotalsToFlag++;
        }
      }
    }

    // Count projects with data
    const projects = await ctx.db.query("projects").collect();
    const projectsWithData = new Set<string>();
    for (const item of activeItems) {
      projectsWithData.add(item.projectId);
    }

    // Count clients
    const clients = await ctx.db.query("clients").collect();

    // Get current intelligence counts
    const projectIntelligence = await ctx.db.query("projectIntelligence").collect();
    const clientIntelligence = await ctx.db.query("clientIntelligence").collect();

    return {
      dataItems: {
        total: activeItems.length,
        subtotalsToFlag,
        alreadyFlagged,
      },
      projects: {
        total: projects.length,
        withData: projectsWithData.size,
        existingIntelligence: projectIntelligence.length,
      },
      clients: {
        total: clients.length,
        existingIntelligence: clientIntelligence.length,
      },
      actions: [
        `Flag ${subtotalsToFlag} items as subtotals`,
        `Resync ${projectsWithData.size} project intelligence records`,
        `Resync ${clients.length} client intelligence records`,
      ],
    };
  },
});

/**
 * Execute full resync
 */
export const resyncAll = mutation({
  args: {},
  handler: async (ctx) => {
    const results = {
      subtotalsFlagged: 0,
      projectsSynced: 0,
      clientsSynced: 0,
      errors: [] as string[],
    };

    // Step 1: Flag subtotals
    const dataItems = await ctx.db.query("projectDataItems").collect();
    for (const item of dataItems) {
      if (item.isDeleted || item.isSubtotal) continue;
      
      const detection = detectSubtotal(item.originalName);
      if (detection.isSubtotal) {
        await ctx.db.patch(item._id, {
          isSubtotal: true,
          subtotalReason: detection.reason,
        });
        results.subtotalsFlagged++;
      }
    }

    // Step 2: Resync project intelligence for all projects with data
    const projectsWithData = new Set<string>();
    for (const item of dataItems) {
      if (!item.isDeleted) {
        projectsWithData.add(item.projectId);
      }
    }

    for (const projectId of projectsWithData) {
      try {
        await ctx.scheduler.runAfter(0, api.intelligence.syncDataLibraryToIntelligence, {
          projectId: projectId as any,
        });
        results.projectsSynced++;
      } catch (error) {
        results.errors.push(`Project ${projectId}: ${error}`);
      }
    }

    // Step 3: Resync client intelligence for all clients
    const clients = await ctx.db.query("clients").collect();
    for (const client of clients) {
      try {
        await ctx.scheduler.runAfter(0, api.intelligence.syncProjectSummariesToClient, {
          clientId: client._id,
        });
        results.clientsSynced++;
      } catch (error) {
        results.errors.push(`Client ${client._id}: ${error}`);
      }
    }

    return {
      ...results,
      message: `Flagged ${results.subtotalsFlagged} subtotals, scheduled sync for ${results.projectsSynced} projects and ${results.clientsSynced} clients`,
    };
  },
});

/**
 * Resync a specific project's intelligence
 */
export const resyncProject = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all projects with data and resync them
    const dataItems = await ctx.db.query("projectDataItems").collect();
    const projectsWithData = new Set<string>();
    
    for (const item of dataItems) {
      if (!item.isDeleted) {
        projectsWithData.add(item.projectId);
      }
    }

    let synced = 0;
    for (const projectId of projectsWithData) {
      await ctx.scheduler.runAfter(0, api.intelligence.syncDataLibraryToIntelligence, {
        projectId: projectId as any,
      });
      synced++;
    }

    return { synced, projectIds: Array.from(projectsWithData) };
  },
});

/**
 * Resync all client intelligence
 */
export const resyncClients = mutation({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query("clients").collect();
    
    let synced = 0;
    for (const client of clients) {
      await ctx.scheduler.runAfter(0, api.intelligence.syncProjectSummariesToClient, {
        clientId: client._id,
      });
      synced++;
    }

    return { synced, clientIds: clients.map(c => c._id) };
  },
});
