import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────────────────
// Prospect SOURCING from the charges service.
//
// Flow: pick a lender RockCap already knows -> pull the companies that lender
// has charged (from charges-service) -> enrich each with ONE lightweight
// Companies House profile call -> store as `sourcedCompanies` candidates.
// These are NOT prospects. An operator reviews the list and PROMOTES the few
// that fit, which creates a real client (prospect) and only THEN runs the full
// intel gauntlet. See charges-service/ for the upstream HTTP API.
// ─────────────────────────────────────────────────────────────────────────

const CH_BASE_URL = "https://api.company-information.service.gov.uk";

// Hard cap so a huge lender (e.g. Paragon Bank = 24k companies) can't fire tens
// of thousands of CH calls in one run. Narrow with filters (registeredSince).
const MAX_COMPANIES = 500;

async function chProfile(num: string, apiKey: string): Promise<any | null> {
  const auth = btoa(`${apiKey}:`);
  const res = await fetch(`${CH_BASE_URL}/company/${num}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null; // tolerate per-company failures; name stays pending
  return await res.json();
}

function chargesServiceConfig(): { base: string; key: string } {
  const base = process.env.CHARGES_SERVICE_URL;
  const key = process.env.CHARGES_API_KEY;
  if (!base) throw new Error("CHARGES_SERVICE_URL not set in Convex env");
  if (!key) throw new Error("CHARGES_API_KEY not set in Convex env");
  return { base: base.replace(/\/$/, ""), key };
}

async function chargesServiceGet(path: string): Promise<any> {
  const { base, key } = chargesServiceConfig();
  const res = await fetch(`${base}${path}`, { headers: { "X-API-Key": key } });
  if (!res.ok) {
    throw new Error(`charges-service error ${res.status} on ${path}: ${await res.text()}`);
  }
  return await res.json();
}

// ── Lender discovery / disambiguation ────────────────────────────────────
// Wraps GET /lenders. Resolve a fuzzy name ("PARAGON") to the exact canonical
// entity (e.g. "PARAGON DEVELOPMENT FINANCE LIMITED") before sourcing.
export const searchLenders = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (_ctx, args) => {
    const q = encodeURIComponent(args.query);
    const limit = args.limit ?? 25;
    return await chargesServiceGet(`/lenders?q=${q}&limit=${limit}`);
  },
});

// ── Source candidates from a lender ───────────────────────────────────────
export const sourceFromLender = action({
  args: {
    lender: v.string(), // exact canonical lender name (use searchLenders first)
    status: v.optional(v.string()), // all | outstanding | satisfied
    registeredSince: v.optional(v.string()), // YYYY-MM-DD
    registeredUntil: v.optional(v.string()),
    jurisdiction: v.optional(v.string()), // ew | sc | ni
    entityType: v.optional(v.string()), // company | llp
    propertyContains: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) throw new Error("COMPANIES_HOUSE_API_KEY not set in Convex env");

    const limit = Math.min(args.limit ?? MAX_COMPANIES, MAX_COMPANIES);
    const params = new URLSearchParams({ name: args.lender, limit: String(limit) });
    if (args.status) params.set("status", args.status);
    if (args.registeredSince) params.set("registered_since", args.registeredSince);
    if (args.registeredUntil) params.set("registered_until", args.registeredUntil);
    if (args.jurisdiction) params.set("jurisdiction", args.jurisdiction);
    if (args.entityType) params.set("entity_type", args.entityType);
    if (args.propertyContains) params.set("property_contains", args.propertyContains);

    const result = await chargesServiceGet(`/charges/by-lender?${params.toString()}`);
    const companies: any[] = result.companies ?? [];

    // One CH profile call per company (lightweight — no charges/officers/PSC).
    const batch = `${args.lender}|${result.dataAsOf ?? ""}|${Date.now()}`;
    const records = [];
    for (const c of companies) {
      const profile = await chProfile(c.companyNumber, apiKey);
      const ro = profile?.registered_office_address ?? {};
      records.push({
        companyNumber: c.companyNumber,
        companyName: profile?.company_name ?? undefined,
        companyStatus: profile?.company_status ?? undefined,
        companyType: profile?.type ?? undefined,
        sicCodes: profile?.sic_codes ?? undefined,
        incorporationDate: profile?.date_of_creation ?? undefined,
        town: ro.locality ?? undefined,
        postcode: ro.postal_code ?? undefined,
        registeredOfficeAddress: profile?.registered_office_address ?? undefined,
        sourcedFromLender: args.lender,
        latestChargeDate: c.latestChargeDate ?? undefined,
        earliestChargeDate: c.earliestChargeDate ?? undefined,
        chargeCount: c.chargeCount ?? undefined,
        outstandingCount: c.outstandingCount ?? undefined,
        hasOutstanding: c.hasOutstanding ?? undefined,
        recentProperty: c.recentProperty ?? undefined,
        jurisdiction: c.jurisdiction ?? undefined,
        entityType: c.entityType ?? undefined,
      });
    }

    const summary = await ctx.runMutation(api.sourcing.upsertSourcedBatch, {
      batch,
      records,
    });

    return {
      lender: args.lender,
      dataAsOf: result.dataAsOf ?? null,
      batch,
      totalCandidates: result.count ?? companies.length,
      enriched: records.length,
      truncated: (result.count ?? 0) > limit,
      ...summary,
    };
  },
});

// ── Persist a batch of candidates (with dedup vs the existing book) ───────
export const upsertSourcedBatch = mutation({
  args: {
    batch: v.string(),
    records: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;
    let alreadyInBook = 0;

    for (const r of args.records as any[]) {
      // Dedup vs the client book on the CH number.
      const existingClient = await ctx.db
        .query("clients")
        .withIndex("by_companies_house_number", (q) =>
          q.eq("companiesHouseNumber", r.companyNumber),
        )
        .first();
      const inBook = !!existingClient;
      if (inBook) alreadyInBook++;

      // Dedup vs existing sourced rows (refresh facts, don't duplicate).
      const existing = await ctx.db
        .query("sourcedCompanies")
        .withIndex("by_company_number", (q) => q.eq("companyNumber", r.companyNumber))
        .first();

      const enriched = r.companyName ? now : undefined;

      if (existing) {
        // Don't disturb a row an operator has already actioned.
        if (existing.sourcingState === "promoted" || existing.sourcingState === "dismissed") {
          continue;
        }
        await ctx.db.patch(existing._id, {
          ...r,
          alreadyInBook: inBook,
          existingClientId: existingClient?._id,
          sourcingBatch: args.batch,
          enrichedAt: enriched ?? existing.enrichedAt,
          updatedAt: now,
        });
        updated++;
      } else {
        await ctx.db.insert("sourcedCompanies", {
          ...r,
          sourcingState: "new",
          alreadyInBook: inBook,
          existingClientId: existingClient?._id,
          sourcingBatch: args.batch,
          enrichedAt: enriched,
          createdAt: now,
          updatedAt: now,
        });
        inserted++;
      }
    }

    return { inserted, updated, alreadyInBook };
  },
});

// ── List candidates for the Sourcing UI tab ───────────────────────────────
export const list = query({
  args: {
    state: v.optional(v.string()), // new | reviewed | promoted | dismissed
    lender: v.optional(v.string()),
    batch: v.optional(v.string()),
    includeInBook: v.optional(v.boolean()), // default true
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows;
    if (args.batch) {
      rows = await ctx.db
        .query("sourcedCompanies")
        .withIndex("by_batch", (q) => q.eq("sourcingBatch", args.batch))
        .collect();
    } else if (args.state) {
      rows = await ctx.db
        .query("sourcedCompanies")
        .withIndex("by_state", (q) => q.eq("sourcingState", args.state as any))
        .collect();
    } else if (args.lender) {
      rows = await ctx.db
        .query("sourcedCompanies")
        .withIndex("by_lender", (q) => q.eq("sourcedFromLender", args.lender!))
        .collect();
    } else {
      rows = await ctx.db.query("sourcedCompanies").collect();
    }

    if (args.includeInBook === false) {
      rows = rows.filter((r) => !r.alreadyInBook);
    }
    rows.sort((a, b) => (b.latestChargeDate ?? "").localeCompare(a.latestChargeDate ?? ""));
    return args.limit ? rows.slice(0, args.limit) : rows;
  },
});

// ── Promote a candidate into the prospect pipeline ────────────────────────
export const promote = mutation({
  args: { id: v.id("sourcedCompanies") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("sourced company not found");
    if (row.promotedToClientId) return row.promotedToClientId;

    const clientId = await ctx.runMutation(api.clients.create, {
      name: row.companyName ?? row.companyNumber,
      type: "borrower",
      status: "prospect",
      companyName: row.companyName,
      notes: `Sourced from charges held by ${row.sourcedFromLender}. CH ${row.companyNumber}.`,
      source: "other",
      metadata: {
        sourcedFrom: "charges",
        lender: row.sourcedFromLender,
        sourcedCompanyId: args.id,
        recentProperty: row.recentProperty,
      },
    });

    // Link the CH number and kick off the full CH sync (charges/officers/PSC).
    // Apollo / deep intel is a further, operator-driven step.
    await ctx.db.patch(clientId, { companiesHouseNumber: row.companyNumber });
    await ctx.scheduler.runAfter(0, internal.companiesHouse.syncOneCompanyFromCHInternal, {
      companyNumber: row.companyNumber,
    });

    await ctx.db.patch(args.id, {
      sourcingState: "promoted",
      promotedToClientId: clientId,
      updatedAt: new Date().toISOString(),
    });
    return clientId;
  },
});

// ── Mark a candidate reviewed / dismissed ─────────────────────────────────
export const setState = mutation({
  args: {
    id: v.id("sourcedCompanies"),
    state: v.union(v.literal("new"), v.literal("reviewed"), v.literal("dismissed")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      sourcingState: args.state,
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});
