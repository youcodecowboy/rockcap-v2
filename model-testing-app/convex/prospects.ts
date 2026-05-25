import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Create a prospect from a company number
 */
export const createProspect = mutation({
  args: {
    companyNumber: v.string(),
    companyId: v.optional(v.id("companiesHouseCompanies")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if prospect already exists
    const existing = await ctx.db
      .query("prospects")
      .withIndex("by_company_number", (q: any) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .first();

    if (existing) {
      return existing._id;
    }

    // Create new prospect
    const prospectId = await ctx.db.insert("prospects", {
      companyNumber: args.companyNumber,
      companyId: args.companyId,
      prospectTier: "UNQUALIFIED",
      hasPlanningHits: false,
      hasOwnedPropertyHits: false,
      createdAt: now,
      updatedAt: now,
    });

    return prospectId;
  },
});

/**
 * Update prospect score and tier
 */
export const updateProspectScore = mutation({
  args: {
    prospectId: v.id("prospects"),
    activeProjectScore: v.optional(v.number()),
    prospectTier: v.optional(v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("UNQUALIFIED")
    )),
    hasPlanningHits: v.optional(v.boolean()),
    hasOwnedPropertyHits: v.optional(v.boolean()),
    lastGauntletRunAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { prospectId, ...updates } = args;
    const now = new Date().toISOString();

    await ctx.db.patch(prospectId, {
      ...updates,
      updatedAt: now,
    });

    return prospectId;
  },
});

/**
 * Get prospect by company number
 */
export const getProspectByCompanyNumber = query({
  args: { companyNumber: v.string() },
  handler: async (ctx, args) => {
    const prospect = await ctx.db
      .query("prospects")
      .withIndex("by_company_number", (q: any) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .first();

    return prospect;
  },
});

/**
 * Get prospect by ID
 */
export const getProspect = query({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.prospectId);
  },
});

/**
 * List prospects with optional filters
 */
export const listProspects = query({
  args: {
    tier: v.optional(v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("UNQUALIFIED")
    )),
    minScore: v.optional(v.number()),
    hasPlanningHits: v.optional(v.boolean()),
    hasOwnedPropertyHits: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Apply filters
    let prospects;
    if (args.tier) {
      prospects = await ctx.db
        .query("prospects")
        .withIndex("by_tier", (q: any) => q.eq("prospectTier", args.tier!))
        .collect();
    } else {
      prospects = await ctx.db.query("prospects").collect();
    }

    // Apply additional filters that aren't indexed
    let filtered = prospects;
    
    if (args.minScore !== undefined) {
      filtered = filtered.filter(
        (p) => (p.activeProjectScore || 0) >= args.minScore!
      );
    }
    
    if (args.hasPlanningHits !== undefined) {
      filtered = filtered.filter(
        (p) => p.hasPlanningHits === args.hasPlanningHits
      );
    }
    
    if (args.hasOwnedPropertyHits !== undefined) {
      filtered = filtered.filter(
        (p) => p.hasOwnedPropertyHits === args.hasOwnedPropertyHits
      );
    }

    return filtered;
  },
});

/**
 * Get prospects that need gauntlet refresh (older than specified days)
 */
export const getProspectsNeedingRefresh = query({
  args: { daysOld: v.number() },
  handler: async (ctx, args) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - args.daysOld);
    const cutoffISO = cutoffDate.toISOString();

    const allProspects = await ctx.db.query("prospects").collect();
    
    // Filter prospects where lastGauntletRunAt is older than cutoff or null
    return allProspects.filter((p) => {
      if (!p.lastGauntletRunAt) return true;
      return p.lastGauntletRunAt < cutoffISO;
    });
  },
});

/**
 * Get recent prospects count
 */
export const getRecentCount = query({
  handler: async (ctx) => {
    // Get prospects from prospects table
    const prospects = await ctx.db.query("prospects").collect();
    
    // Also count clients with status="prospect"
    const prospectClients = await ctx.db
      .query("clients")
      .withIndex("by_status", (q: any) => q.eq("status", "prospect"))
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .collect();
    
    return prospects.length + prospectClients.length;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// v1.2 Prospects CRM — state machine helpers
//
// A "prospect" is a clients row with prospectState set (one of 8 states).
// The CRM home page surfaces these via the per-state public queries below.
// State transitions are written through transitionStateInternal which also
// schedules HubSpot push-back via the existing sync surface (HubSpot push
// hook lands in a follow-on commit).
// ─────────────────────────────────────────────────────────────────────────────

const PROSPECT_STATE = v.union(
  v.literal("drafted"),
  v.literal("needs_revision"),
  v.literal("active"),
  v.literal("replied"),
  v.literal("engaged"),
  v.literal("promoted"),
  v.literal("parked"),
  v.literal("lost"),
);

// ── State transition (called by prospect.transitionState MCP tool) ──

export const transitionStateInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    newState: PROSPECT_STATE,
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.clientId, {
      prospectState: args.newState,
      prospectStateChangedAt: now,
      prospectStateChangedBy: args.userId,
    });
    return { ok: true, transitionedAt: now };
  },
});

// ── List prospects by state (public queries — power the home page sections) ──

export const listByState = query({
  args: { state: PROSPECT_STATE },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_prospect_state", (q) => q.eq("prospectState", args.state))
      .order("desc")
      .take(100);
  },
});

export const countByState = query({
  args: { state: PROSPECT_STATE },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("clients")
      .withIndex("by_prospect_state", (q) => q.eq("prospectState", args.state))
      .collect();
    return rows.length;
  },
});

// ── Get a single prospect with state context ──

export const getById = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.clientId);
  },
});

// ── Internal: get for MCP-side reads (no auth gate; trusted caller) ──

export const getInternal = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.clientId);
  },
});

// ── One-shot migration: backfill packageApprovalStatus=approved ──────
// Any pre-existing cadences (from v1/v1.1 smoke tests or the early
// prospect-intel runs) need packageApprovalStatus = "approved" so the
// new dispatcher filter doesn't silently stop firing them.
// Idempotent — run once, then leave.

export const migrateExistingCadencesToApprovedInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    const allRows = await ctx.runQuery(internal.cadences.findAllForMigrationInternal, {});
    let patched = 0;
    for (const row of allRows) {
      if (row.packageApprovalStatus === undefined) {
        await ctx.runMutation(internal.cadences.markApprovedForMigrationInternal, {
          cadenceId: row._id,
        });
        patched++;
      }
    }
    return { ok: true, patched, total: allRows.length };
  },
});
