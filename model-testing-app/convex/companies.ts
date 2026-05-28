import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import {
  type GroupCharge,
  distinctLenders,
  classifySchemeStatus,
  parseCandidateAddress,
  rankByRecency,
} from "./lib/schemeGrouping";

/**
 * Get company by ID
 */
export const get = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.id);
    if (!company) return null;
    
    // Fetch associated contacts
    const contacts = company.linkedContactIds 
      ? await Promise.all(company.linkedContactIds.map(id => ctx.db.get(id)))
      : [];
    
    // Fetch associated deals
    const deals = company.linkedDealIds
      ? await Promise.all(company.linkedDealIds.map(id => ctx.db.get(id)))
      : [];
    
    return {
      ...company,
      contacts: contacts.filter(c => c !== null),
      deals: deals.filter(d => d !== null),
    };
  },
});

/**
 * Get all companies
 */
export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("companies").collect();
  },
});

/**
 * Get companies by lifecycle stage
 */
export const getByLifecycleStage = query({
  args: { lifecycleStage: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("companies")
      .filter((q) => q.eq(q.field("hubspotLifecycleStage"), args.lifecycleStage))
      .collect();
  },
});

/**
 * Create a company manually (not from HubSpot)
 */
export const create = mutation({
  args: {
    name: v.string(),
    domain: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
    type: v.optional(v.string()),
    website: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    linkedContactIds: v.optional(v.array(v.id("contacts"))),
  },
  handler: async (ctx, args) => {
    // Generate a unique ID for manual entries (not from HubSpot)
    const manualHubspotId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const companyId = await ctx.db.insert("companies", {
      name: args.name,
      domain: args.domain,
      phone: args.phone,
      address: args.address,
      city: args.city,
      state: args.state,
      zip: args.zip,
      country: args.country,
      industry: args.industry,
      type: args.type,
      website: args.website,
      tags: args.tags,
      notes: args.notes,
      hubspotCompanyId: manualHubspotId,
      linkedContactIds: args.linkedContactIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Update linked contacts to include this company
    if (args.linkedContactIds && args.linkedContactIds.length > 0) {
      for (const contactId of args.linkedContactIds) {
        const contact = await ctx.db.get(contactId);
        if (contact) {
          const existingCompanyIds = contact.linkedCompanyIds || [];
          if (!existingCompanyIds.includes(companyId)) {
            await ctx.db.patch(contactId, {
              linkedCompanyIds: [...existingCompanyIds, companyId],
            });
          }
        }
      }
    }

    return companyId;
  },
});

/**
 * Get multiple companies by an array of IDs (used to resolve contact.linkedCompanyIds).
 */
export const listByIds = query({
  args: { ids: v.array(v.id("companies")) },
  handler: async (ctx, args) => {
    const results = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return results.filter((c) => c !== null);
  },
});

/**
 * List all companies that have a HubSpot ID linked.
 * Used by the sync-all engagement phase to iterate per-company.
 */
export const listWithHubspotId = query({
  args: {},
  handler: async (ctx) => {
    const companies = await ctx.db.query('companies').collect();
    return companies
      .filter((c: any) => c.hubspotCompanyId && typeof c.hubspotCompanyId === 'string')
      .map((c: any) => ({
        _id: c._id,
        hubspotCompanyId: c.hubspotCompanyId as string,
        name: c.name,
        // Used by the incremental engagement sync to skip companies whose
        // activity timeline hasn't moved since the last successful sync.
        // On a 500-company portal with ~5% movement per 6h window, this
        // turns 500 API calls into ~25.
        lastActivityDate: c.lastActivityDate as string | undefined,
      }));
  },
});

/**
 * Promote a company to a client
 * Creates a client record from the company data and links them
 */
export const promoteToClient = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.id);
    if (!company) {
      throw new Error("Company not found");
    }

    // Check if already promoted
    if (company.promotedToClientId) {
      return company.promotedToClientId;
    }

    // Determine source - use hubspot if it's from HubSpot, otherwise manual
    const isFromHubSpot = !company.hubspotCompanyId.startsWith("manual-");
    const source = isFromHubSpot ? "hubspot" : "manual";

    // Create client from company data
    const clientId = await ctx.db.insert("clients", {
      name: company.name,
      type: company.type,
      status: "active", // Default to active when promoted
      companyName: company.name,
      address: company.address,
      city: company.city,
      state: company.state,
      zip: company.zip,
      country: company.country,
      phone: company.phone,
      website: company.website,
      industry: company.industry,
      tags: company.tags,
      notes: company.notes,
      source: source as "hubspot" | "manual",
      createdAt: new Date().toISOString(),
      // Preserve HubSpot data if available
      hubspotCompanyId: isFromHubSpot ? company.hubspotCompanyId : undefined,
      hubspotUrl: company.hubspotUrl,
      lastHubSpotSync: company.lastHubSpotSync,
      hubspotLifecycleStage: company.hubspotLifecycleStageName,
    });

    // Update company to link to the client
    await ctx.db.patch(args.id, {
      promotedToClientId: clientId,
    });

    return clientId;
  },
});

/**
 * List all companies that have been promoted to a given client. Used by the
 * mobile Overview tab to resolve HubSpot metadata (owner, sync time, URL,
 * Beauhurst) for the client's primary linked company.
 */
export const listByPromotedClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();
  },
});

/**
 * Search companies by name (case-insensitive substring), unpromoted first.
 * Returns top N for autocomplete UI.
 */
export const searchByName = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = args.query.trim().toLowerCase();
    if (q.length < 2) return [];
    const limit = args.limit ?? 8;

    const all = await ctx.db.query("companies").collect();
    const matches = all.filter((c) => c.name.toLowerCase().includes(q));

    // Score: exact match > starts-with > contains, and unpromoted > promoted
    const scored = matches
      .map((c) => {
        const n = c.name.toLowerCase();
        let score = 0;
        if (n === q) score += 100;
        else if (n.startsWith(q)) score += 50;
        else score += 10;
        if (!c.promotedToClientId) score += 5; // prefer unpromoted (available to link)
        return { company: c, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.company);

    return scored;
  },
});

// v1.2: list HubSpot-synced companies that haven't been processed by
// prospect-intel yet (NEW state) — or are currently in-flight (RUNNING)
// or stuck (RUNNING > 2h). Joins against skillRuns to derive state per row.

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export const listUnprocessedInternal = internalQuery({
  args: {
    limit: v.number(),
    sinceDays: v.number(),
    states: v.array(v.string()),
    excludePromoted: v.boolean(),
    lifecycleStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sinceMs = Date.now() - args.sinceDays * 24 * 60 * 60 * 1000;

    // Pull recent companies. There's no index on createdAt, so use _creationTime
    // via collect + filter (acceptable for the 30d window + ~hundreds of rows).
    const allRecent = await ctx.db
      .query("companies")
      .filter((q) => q.gt(q.field("_creationTime"), sinceMs))
      .collect();

    const candidates: Array<{
      company: any;
      state: "new" | "running" | "stuck";
      runId?: string;
      runOwnerId?: string;
      runAgeMinutes?: number;
    }> = [];

    for (const company of allRecent) {
      if (args.lifecycleStage && (company as any).hubspotLifecycleStage !== args.lifecycleStage) continue;

      // Look up the most recent prospect-intel skillRun for this company.
      // Dedup key is the CH number; derive it from the description if present.
      const chMatch = (company as any).metadata?.hubspotCustomProperties?.description?.match(/CH\s+(\d{6,8})/);
      const dedupKey = chMatch?.[1];
      if (!dedupKey) {
        // No CH number available — treat as NEW since we can't dedup
        candidates.push({ company, state: "new" });
        continue;
      }

      const runs = await ctx.db
        .query("skillRuns")
        .withIndex("by_skill_and_dedup_key", (q) =>
          q.eq("skillName", "prospect-intel").eq("dedupKey", dedupKey),
        )
        .order("desc")
        .take(1);

      const latest = runs[0];

      if (!latest) {
        candidates.push({ company, state: "new" });
      } else if (latest.status === "running") {
        const ageMs = Date.now() - latest._creationTime;
        const isStuck = ageMs > TWO_HOURS_MS;
        candidates.push({
          company,
          state: isStuck ? "stuck" : "running",
          runId: latest._id,
          runOwnerId: latest.userId,
          runAgeMinutes: Math.round(ageMs / 60000),
        });
      } else if (
        args.excludePromoted &&
        (latest.status === "complete" || latest.status === "complete_with_gaps")
      ) {
        // Has a completed run — not a candidate
        continue;
      }
    }

    // Filter by requested states
    const filtered = candidates.filter((c) => args.states.includes(c.state));

    // Sort by most recent first
    filtered.sort((a, b) => (b.company as any)._creationTime - (a.company as any)._creationTime);

    return filtered.slice(0, args.limit);
  },
});

// v1.2: Public-facing version of listUnprocessedInternal — exposed via
// api.companies.listUnprocessed so the prospects CRM CandidatesSection
// can subscribe via useQuery. Body is intentionally duplicated rather than
// proxying through ctx.runQuery to avoid the extra hop; if/when this query
// grows complex, extract a shared helper.
export const listUnprocessed = query({
  args: {
    limit: v.number(),
    sinceDays: v.number(),
    states: v.array(v.string()),
    excludePromoted: v.boolean(),
    lifecycleStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sinceMs = Date.now() - args.sinceDays * 24 * 60 * 60 * 1000;

    const allRecent = await ctx.db
      .query("companies")
      .filter((q) => q.gt(q.field("_creationTime"), sinceMs))
      .collect();

    const candidates: Array<{
      company: any;
      state: "new" | "running" | "stuck";
      runId?: string;
      runOwnerId?: string;
      runAgeMinutes?: number;
    }> = [];

    for (const company of allRecent) {
      if (args.lifecycleStage && (company as any).hubspotLifecycleStage !== args.lifecycleStage) continue;

      const chMatch = (company as any).metadata?.hubspotCustomProperties?.description?.match(/CH\s+(\d{6,8})/);
      const dedupKey = chMatch?.[1];
      if (!dedupKey) {
        candidates.push({ company, state: "new" });
        continue;
      }

      const runs = await ctx.db
        .query("skillRuns")
        .withIndex("by_skill_and_dedup_key", (q) =>
          q.eq("skillName", "prospect-intel").eq("dedupKey", dedupKey),
        )
        .order("desc")
        .take(1);

      const latest = runs[0];

      if (!latest) {
        candidates.push({ company, state: "new" });
      } else if (latest.status === "running") {
        const ageMs = Date.now() - latest._creationTime;
        const isStuck = ageMs > TWO_HOURS_MS;
        candidates.push({
          company,
          state: isStuck ? "stuck" : "running",
          runId: latest._id,
          runOwnerId: latest.userId,
          runAgeMinutes: Math.round(ageMs / 60000),
        });
      } else if (
        args.excludePromoted &&
        (latest.status === "complete" || latest.status === "complete_with_gaps")
      ) {
        continue;
      }
    }

    const filtered = candidates.filter((c) => args.states.includes(c.state));
    filtered.sort((a, b) => (b.company as any)._creationTime - (a.company as any)._creationTime);

    return filtered.slice(0, args.limit);
  },
});

/**
 * Aggregate the Companies House charge book across a prospect's whole
 * corporate group — the parent (clients.companiesHouseNumber) plus the
 * sibling SPVs persisted on clients.relatedCompaniesHouseNumbers (set by the
 * resolve-related-entities sub-skill). Powers the "Group charges" rollup in
 * the prospect detail CH tab.
 *
 * Single CH numbers understate a developer's borrowing because UK developers
 * spread schemes across SPVs; this rolls the group's charges into one view.
 *
 * Returns an empty shape (companyCount: 0) when the client has no related
 * numbers, so the UI can hide the section. Each company number is looked up
 * in companiesHouseCompanies via `by_company_number`; a number with no synced
 * company row is skipped (still counted in the requested set but contributing
 * no charges). Charges are fetched via the companiesHouseCharges `by_company`
 * index. Lenders are grouped by chargeeName (trimmed; "(unnamed)" fallback).
 */
export const getGroupCharges = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const empty = {
      companyCount: 0,
      totalCharges: 0,
      activeCharges: 0,
      satisfiedCharges: 0,
      distinctLenders: 0,
      lendersByCount: [] as Array<{ name: string; total: number; active: number }>,
      byCompany: [] as Array<{
        companyNumber: string;
        companyName: string;
        chargesCount: number;
        activeCount: number;
      }>,
      charges: [] as Array<{
        companyNumber: string;
        companyName: string;
        companyStatus?: string;
        chargeId: string;
        lender: string;
        date?: string;
        status?: string;
        description?: string;
      }>,
    };

    const client = await ctx.db.get(args.clientId);
    if (!client) return empty;

    const parentNumber = (client as any).companiesHouseNumber as string | undefined;
    const relatedNumbers = ((client as any).relatedCompaniesHouseNumbers ?? []) as string[];

    // Build the deduped company-number set: parent first, then siblings.
    // Drop falsy entries (empty strings / nullish) and de-duplicate while
    // preserving order so the parent stays first in byCompany.
    const seen = new Set<string>();
    const numbers: string[] = [];
    for (const n of [parentNumber, ...relatedNumbers]) {
      const num = (n ?? "").trim();
      if (!num || seen.has(num)) continue;
      seen.add(num);
      numbers.push(num);
    }

    // No related numbers → nothing to roll up (parent alone is shown by the
    // existing single-company profile/charges; the UI only renders the group
    // section when companyCount > 1).
    if (numbers.length === 0) return empty;

    const lenderCounts: Record<string, { total: number; active: number }> = {};
    const byCompany: Array<{
      companyNumber: string;
      companyName: string;
      chargesCount: number;
      activeCount: number;
    }> = [];
    const allCharges: Array<{
      companyNumber: string;
      companyName: string;
      companyStatus?: string;
      chargeId: string;
      lender: string;
      date?: string;
      status?: string;
      description?: string;
    }> = [];

    let totalCharges = 0;
    let activeCharges = 0;
    let satisfiedCharges = 0;

    for (const companyNumber of numbers) {
      const company = await ctx.db
        .query("companiesHouseCompanies")
        .withIndex("by_company_number", (q: any) =>
          q.eq("companyNumber", companyNumber),
        )
        .first();

      // Number requested but not synced yet — skip (contributes no charges).
      if (!company) continue;

      const charges = await ctx.db
        .query("companiesHouseCharges")
        .withIndex("by_company", (q: any) => q.eq("companyId", company._id))
        .collect();

      let companyActive = 0;
      for (const c of charges) {
        totalCharges++;
        const status = (c.chargeStatus ?? "").toLowerCase();
        const isActive = c.chargeStatus === "outstanding";
        if (isActive) {
          activeCharges++;
          companyActive++;
        }
        if (status.startsWith("fully-satisfied") || status === "satisfied") {
          satisfiedCharges++;
        }
        const name = c.chargeeName?.trim() || "(unnamed)";
        if (!lenderCounts[name]) lenderCounts[name] = { total: 0, active: 0 };
        lenderCounts[name].total++;
        if (isActive) lenderCounts[name].active++;

        allCharges.push({
          companyNumber,
          companyName: company.companyName,
          companyStatus: (company as any).companyStatus,
          chargeId: c.chargeId,
          lender: name,
          date: c.chargeDate,
          status: c.chargeStatus,
          description: c.chargeDescription,
        });
      }

      byCompany.push({
        companyNumber,
        companyName: company.companyName,
        chargesCount: charges.length,
        activeCount: companyActive,
      });
    }

    const lendersByCount = Object.entries(lenderCounts)
      .map(([name, counts]) => ({ name, total: counts.total, active: counts.active }))
      .sort((a, b) => b.total - a.total || b.active - a.active);

    allCharges.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

    return {
      // companyCount reflects companies that actually resolved to synced CH
      // rows (the set the rollup is computed over), not the requested-number
      // count. The UI gates the section on companyCount > 1.
      companyCount: byCompany.length,
      totalCharges,
      activeCharges,
      satisfiedCharges,
      distinctLenders: Object.keys(lenderCounts).length,
      lendersByCount,
      byCompany,
      charges: allCharges,
    };
  },
});

/**
 * Build the prospect's scheme list by joining Companies House charge data
 * with any per-scheme enrichment rows from prospectSchemes. Returns two
 * buckets: live (outstanding charges or active company) and past (dissolved
 * or fully satisfied). SPVs with zero charges are excluded because schemes
 * are charge-bearing by definition.
 *
 * `address` and `parseCandidateAddress` fallback: the skill/operator address
 * in the enrichment row always wins; the charge description is used only when
 * no enrichment row exists (addressIsEstimate: true).
 */
export const getProspectSchemes = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return { live: [], past: [] };

    const parentNumber = (client as any).companiesHouseNumber as string | undefined;
    const relatedNumbers = ((client as any).relatedCompaniesHouseNumbers ?? []) as string[];
    const seen = new Set<string>();
    const numbers: string[] = [];
    for (const n of [parentNumber, ...relatedNumbers]) {
      const num = (n ?? "").trim();
      if (!num || seen.has(num)) continue;
      seen.add(num);
      numbers.push(num);
    }
    if (numbers.length === 0) return { live: [], past: [] };

    const enrichmentRows = await ctx.db
      .query("prospectSchemes")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
    const enrichmentByCompany = new Map(enrichmentRows.map((r) => [r.companyNumber, r]));

    const schemes: any[] = [];
    for (const companyNumber of numbers) {
      const company = await ctx.db
        .query("companiesHouseCompanies")
        .withIndex("by_company_number", (q: any) => q.eq("companyNumber", companyNumber))
        .first();
      if (!company) continue;

      const rawCharges = await ctx.db
        .query("companiesHouseCharges")
        .withIndex("by_company", (q: any) => q.eq("companyId", company._id))
        .collect();
      if (rawCharges.length === 0) continue; // schemes are charge-bearing SPVs

      const charges: GroupCharge[] = rawCharges
        .map((c) => ({
          companyNumber,
          companyName: company.companyName,
          companyStatus: (company as any).companyStatus,
          chargeId: c.chargeId,
          lender: c.chargeeName?.trim() || "(unnamed)",
          date: c.chargeDate,
          status: c.chargeStatus,
          description: c.chargeDescription,
        }))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

      const enrichment = enrichmentByCompany.get(companyNumber);
      const lastChargeDate = charges[0]?.date;
      schemes.push({
        companyNumber,
        companyName: company.companyName,
        companyStatus: (company as any).companyStatus,
        lenders: distinctLenders(charges),
        charges,
        lastChargeDate,
        status: classifySchemeStatus((company as any).companyStatus, charges),
        address: enrichment?.address ?? parseCandidateAddress(charges[0]?.description),
        addressIsEstimate: !enrichment?.address,
        planningRefs: enrichment?.planningRefs ?? [],
        estimatedUnits: enrichment?.estimatedUnits,
        schemeType: enrichment?.schemeType,
        whatBuilding: enrichment?.whatBuilding,
        gdvEstimate: enrichment?.gdvEstimate,
        confidence: enrichment?.confidence,
        sourceUrls: enrichment?.sourceUrls ?? [],
        operatorConfirmed: enrichment?.operatorConfirmed ?? false,
      });
    }

    const live = rankByRecency(schemes.filter((s) => s.status === "live"));
    const past = rankByRecency(schemes.filter((s) => s.status === "past"));
    return { live, past };
  },
});

/**
 * Create or update a per-scheme enrichment row. Used by the prospect-intel
 * skill (operatorConfirmed=false) and the Track Record tab operator UI
 * (operatorConfirmed=true). The confirmed-preservation rule is intentional:
 * a skill re-run that omits operatorConfirmed must NOT clear a row an
 * operator has already confirmed.
 */
export const upsertProspectScheme = mutation({
  args: {
    clientId: v.id("clients"),
    companyNumber: v.string(),
    companyName: v.string(),
    schemeName: v.optional(v.string()),
    address: v.optional(v.string()),
    planningRefs: v.optional(v.array(v.string())),
    estimatedUnits: v.optional(v.number()),
    schemeType: v.optional(v.string()),
    whatBuilding: v.optional(v.string()),
    gdvEstimate: v.optional(v.string()),
    confidence: v.optional(v.string()),
    status: v.optional(v.string()),
    sourceUrls: v.optional(v.array(v.string())),
    operatorConfirmed: v.optional(v.boolean()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("prospectSchemes")
      .withIndex("by_client_company", (q: any) =>
        q.eq("clientId", args.clientId).eq("companyNumber", args.companyNumber),
      )
      .first();

    const { clientId, companyNumber, operatorConfirmed, ...rest } = args;
    if (existing) {
      const keepConfirmed = existing.operatorConfirmed && operatorConfirmed === undefined;
      await ctx.db.patch(existing._id, {
        ...rest,
        operatorConfirmed: keepConfirmed ? true : (operatorConfirmed ?? existing.operatorConfirmed),
        updatedAt: now,
      });
      return { schemeId: existing._id, created: false };
    }
    const schemeId = await ctx.db.insert("prospectSchemes", {
      clientId,
      companyNumber,
      ...rest,
      operatorConfirmed: operatorConfirmed ?? false,
      createdAt: now,
      updatedAt: now,
    } as any);
    return { schemeId, created: true };
  },
});
