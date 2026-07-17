import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all deals for prospecting
 */
export const getAllDeals = query({
  handler: async (ctx) => {
    const deals = await ctx.db.query("deals").collect();
    
    // Fetch associated contacts and companies
    const dealsWithDetails = await Promise.all(
      deals.map(async (deal) => {
        const contacts = deal.linkedContactIds 
          ? await Promise.all(deal.linkedContactIds.map(id => ctx.db.get(id)))
          : [];
        const companies = deal.linkedCompanyIds
          ? await Promise.all(deal.linkedCompanyIds.map(id => ctx.db.get(id)))
          : [];
        
        return {
          ...deal,
          contacts: contacts.filter(c => c !== null),
          companies: companies.filter(c => c !== null),
        };
      })
    );
    
    return dealsWithDetails;
  },
});

/**
 * Get deal by ID
 */
export const getDealById = query({
  args: { dealId: v.id("deals") },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.dealId);
    if (!deal) return null;
    
    const contacts = deal.linkedContactIds 
      ? await Promise.all(deal.linkedContactIds.map(id => ctx.db.get(id)))
      : [];
    const companies = deal.linkedCompanyIds
      ? await Promise.all(deal.linkedCompanyIds.map(id => ctx.db.get(id)))
      : [];
    
    return {
      ...deal,
      contacts: contacts.filter(c => c !== null),
      companies: companies.filter(c => c !== null),
    };
  },
});

/**
 * Get deals by stage
 */
export const getDealsByStage = query({
  args: { stage: v.string() },
  handler: async (ctx, args) => {
    const deals = await ctx.db
      .query("deals")
      .withIndex("by_stage", (q: any) => q.eq("stage", args.stage))
      .collect();
    
    return deals;
  },
});

/**
 * Get deals by pipeline
 */
export const getDealsByPipeline = query({
  args: { pipeline: v.string() },
  handler: async (ctx, args) => {
    const deals = await ctx.db
      .query("deals")
      .withIndex("by_pipeline", (q: any) => q.eq("pipeline", args.pipeline))
      .collect();
    
    return deals;
  },
});

/**
 * Get pipeline total value (sum of all deal amounts)
 */
export const getPipelineTotal = query({
  handler: async (ctx) => {
    const deals = await ctx.db.query("deals").collect();
    const total = deals.reduce((sum, deal) => {
      return sum + (deal.amount || 0);
    }, 0);
    return total;
  },
});

// ---- Client-scoped queries (Plan 2 phase A) ----

/**
 * List all deals associated with a client, resolved via the companies
 * that have been promoted to this client.
 */
export const listForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const allDeals = await ctx.db.query("deals").collect();
    return allDeals.filter((d) =>
      (d.linkedCompanyIds ?? []).some((id) => companyIds.has(id)),
    );
  },
});

/**
 * List only OPEN deals (not closed-won/closed-lost) for a client.
 * Used by the Overview hero "Open Deals" card.
 */
export const listOpenForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
    if (companies.length === 0) return [];
    const companyIds = new Set(companies.map((c) => c._id));
    const allDeals = await ctx.db.query("deals").collect();
    return allDeals.filter(
      (d) =>
        (d.linkedCompanyIds ?? []).some((id) => companyIds.has(id)) &&
        d.isClosed !== true,
    );
  },
});


/**
 * Update specific deal fields locally (does NOT round-trip to HubSpot).
 *
 * Used by the mobile Deal detail sheet's edit mode. The next HubSpot sync
 * will overwrite any field HubSpot has a value for — consider this a
 * display-level override until the sync back to HubSpot is built.
 *
 * Tracks who made the edit and when so we can surface a "locally edited"
 * affordance in the UI and, eventually, replay edits back to HubSpot.
 */
export const updateLocalEdits = mutation({
  args: {
    dealId: v.id("deals"),
    closeDate: v.optional(v.string()),
    dealType: v.optional(v.string()),
    stageName: v.optional(v.string()),
    probability: v.optional(v.number()),
    spvName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { dealId, ...fields } = args;
    const patch: any = {
      updatedAt: new Date().toISOString(),
    };
    // Only apply fields that were explicitly passed (undefined = untouched).
    // Callers can pass empty strings to clear a field.
    if (fields.closeDate !== undefined) patch.closeDate = fields.closeDate || undefined;
    if (fields.dealType !== undefined) patch.dealType = fields.dealType || undefined;
    if (fields.stageName !== undefined) patch.stageName = fields.stageName || undefined;
    if (fields.probability !== undefined) patch.probability = fields.probability;
    if (fields.spvName !== undefined) patch.spvName = fields.spvName || undefined;

    await ctx.db.patch(dealId, patch);
    return dealId;
  },
});

// ── Prospecting selection read (cold-reachout Phase 1, 2026-07-15) ──────────
//
// Powers the deal.listByStage MCP tool: the /cold-reachout action command
// selects its N candidates from a mirrored HubSpot pipeline stage (e.g.
// Weekly Targets). Joins each deal to the app-side prospect where one exists
// (linkedCompanyIds → companies.promotedToClientId, falling back to a
// case-insensitive company-name match against clients) and returns explicit
// dedupe / readiness flags so the command can skip rows that are already
// being worked instead of re-researching them. dealstage ids are only unique
// within a pipeline in HubSpot, so the pipeline id is required and enforced.

const SELECTION_CAP = 100;

export const listByStageForSelectionInternal = internalQuery({
  args: {
    pipelineId: v.string(),
    stageId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), SELECTION_CAP);
    const raw = await ctx.db
      .query("deals")
      .withIndex("by_stage", (q: any) => q.eq("stage", args.stageId))
      .take(SELECTION_CAP * 3);
    const deals = raw
      .filter((d: any) => d.pipeline === args.pipelineId && !d.archivedAt)
      .slice(0, limit);

    const out = [];
    for (const deal of deals) {
      // Company join: first linked companies row, if any.
      let company: any = null;
      for (const cid of deal.linkedCompanyIds ?? []) {
        company = await ctx.db.get(cid);
        if (company) break;
      }

      // App-prospect join: promotion link first, then name match.
      let client: any = null;
      if (company?.promotedToClientId) {
        client = await ctx.db.get(company.promotedToClientId);
      }
      const matchName = (company?.name ?? deal.name ?? "").trim();
      if (!client && matchName) {
        const exact = await ctx.db
          .query("clients")
          .withIndex("by_name", (q: any) => q.eq("name", matchName))
          .first();
        client = exact ?? null;
      }

      // Contact readiness: does any linked contact carry an email?
      let contactWithEmail: { contactId: string; name: string | null; email: string } | null = null;
      let linkedContactCount = 0;
      for (const cid of deal.linkedContactIds ?? []) {
        const c: any = await ctx.db.get(cid);
        if (!c || c.isDeleted) continue;
        linkedContactCount++;
        if (!contactWithEmail && c.email) {
          contactWithEmail = { contactId: String(c._id), name: c.name ?? null, email: c.email };
        }
      }

      out.push({
        dealId: String(deal._id),
        hubspotDealId: deal.hubspotDealId,
        hubspotUrl: deal.hubspotUrl ?? null,
        name: deal.name,
        stageId: deal.stage ?? null,
        stageName: deal.stageName ?? null,
        pipelineName: deal.pipelineName ?? null,
        lastContactedDate: deal.lastContactedDate ?? null,
        lastActivityDate: deal.lastActivityDate ?? null,
        company: company
          ? {
              companyId: String(company._id),
              name: company.name ?? null,
              companiesHouseNumber: company.companiesHouseNumber ?? null,
            }
          : null,
        // The dedupe verdict the command acts on:
        appClient: client
          ? {
              clientId: String(client._id),
              name: client.name ?? null,
              status: client.status ?? null,
              pipelineStage: client.pipelineStage ?? null,
              prospectState: client.prospectState ?? null,
              lastOutreachSendAt: client.lastOutreachSendAt ?? null,
              outreachReadyAt: client.outreachReadyAt ?? null,
            }
          : null,
        alreadyWorked: !!(client && (client.lastOutreachSendAt || client.prospectState === "active")),
        linkedContactCount,
        contactWithEmail,
      });
    }
    return {
      pipelineId: args.pipelineId,
      stageId: args.stageId,
      count: out.length,
      capped: deals.length >= limit && raw.length > deals.length,
      deals: out,
    };
  },
});
