import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Migration: Flag existing projectDataItems as subtotals
 * 
 * This migration applies the same subtotal detection logic that is now
 * built into the extraction pipeline to existing data items.
 * 
 * Run with: npx convex run migrations/flagSubtotals:flagSubtotals
 * Dry run:  npx convex run migrations/flagSubtotals:flagSubtotalsDryRun
 */

/**
 * Patterns that indicate an item is a subtotal/total line
 * These should be excluded from category totals to avoid double-counting
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
  // Common spreadsheet total row patterns
  { pattern: /^total\s+\d+/i, reason: 'Total with row number' },
  { pattern: /^\d+[\.\)]?\s*total\b/i, reason: 'Numbered total line' },
];

/**
 * Detect if an item name indicates it's a subtotal/total
 */
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
 * Dry run - show what would be flagged as subtotals
 */
export const flagSubtotalsDryRun = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("projectDataItems").collect();
    
    const wouldFlag: {
      id: string;
      projectId: string;
      originalName: string;
      itemCode: string;
      category: string;
      value: number;
      reason: string;
    }[] = [];
    
    const alreadyFlagged: string[] = [];
    const notSubtotal: number[] = [];
    
    for (const item of items) {
      if (item.isDeleted) continue;
      
      // Skip items already flagged
      if (item.isSubtotal) {
        alreadyFlagged.push(item.originalName);
        continue;
      }
      
      const detection = detectSubtotal(item.originalName);
      
      if (detection.isSubtotal) {
        wouldFlag.push({
          id: item._id,
          projectId: item.projectId,
          originalName: item.originalName,
          itemCode: item.itemCode,
          category: item.category,
          value: item.currentValueNormalized,
          reason: detection.reason!,
        });
      } else {
        notSubtotal.push(1);
      }
    }
    
    return {
      summary: {
        totalItems: items.filter(i => !i.isDeleted).length,
        wouldFlag: wouldFlag.length,
        alreadyFlagged: alreadyFlagged.length,
        notSubtotal: notSubtotal.length,
      },
      itemsToFlag: wouldFlag,
      message: `Would flag ${wouldFlag.length} items as subtotals`,
    };
  },
});

/**
 * Execute the migration - flag subtotals
 */
export const flagSubtotals = mutation({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("projectDataItems").collect();
    
    let flagged = 0;
    let skipped = 0;
    let alreadyFlagged = 0;
    
    const results: {
      id: string;
      originalName: string;
      reason: string;
    }[] = [];
    
    for (const item of items) {
      if (item.isDeleted) {
        skipped++;
        continue;
      }
      
      // Skip items already flagged
      if (item.isSubtotal) {
        alreadyFlagged++;
        continue;
      }
      
      const detection = detectSubtotal(item.originalName);
      
      if (detection.isSubtotal) {
        await ctx.db.patch(item._id, {
          isSubtotal: true,
          subtotalReason: detection.reason,
        });
        
        flagged++;
        results.push({
          id: item._id,
          originalName: item.originalName,
          reason: detection.reason!,
        });
      }
    }
    
    return {
      summary: {
        totalItems: items.length,
        flagged,
        alreadyFlagged,
        skipped,
      },
      flaggedItems: results,
      message: `Flagged ${flagged} items as subtotals`,
    };
  },
});

/**
 * Unflag all subtotals (rollback)
 */
export const unflagAllSubtotals = mutation({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query("projectDataItems")
      .collect();
    
    let unflagged = 0;
    
    for (const item of items) {
      if (item.isSubtotal) {
        await ctx.db.patch(item._id, {
          isSubtotal: undefined,
          subtotalReason: undefined,
        });
        unflagged++;
      }
    }
    
    return {
      unflagged,
      message: `Unflagged ${unflagged} items`,
    };
  },
});

/**
 * Get current subtotal stats
 */
export const getSubtotalStats = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("projectDataItems").collect();
    
    const activeItems = items.filter(i => !i.isDeleted);
    const subtotals = activeItems.filter(i => i.isSubtotal);
    
    // Group by project
    const byProject: Record<string, { total: number; subtotals: number }> = {};
    
    for (const item of activeItems) {
      if (!byProject[item.projectId]) {
        byProject[item.projectId] = { total: 0, subtotals: 0 };
      }
      byProject[item.projectId].total++;
      if (item.isSubtotal) {
        byProject[item.projectId].subtotals++;
      }
    }
    
    return {
      totalItems: activeItems.length,
      subtotalItems: subtotals.length,
      regularItems: activeItems.length - subtotals.length,
      byProject,
      subtotalNames: subtotals.map(s => ({
        name: s.originalName,
        reason: s.subtotalReason,
        value: s.currentValueNormalized,
      })),
    };
  },
});
