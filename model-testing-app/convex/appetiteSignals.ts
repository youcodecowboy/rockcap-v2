import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

/**
 * v1.3 Sprint F — lender appetite signals surface.
 *
 * The schema defines `appetiteSignals` with rich versioning (isCurrent flag +
 * supersededBy linking) but until this file landed, NO code wrote or read
 * the table. This module implements the full CRUD + matching surface.
 *
 * Core concept:
 * - Each signal is (lenderClientId, fieldPath, value, valueType, sourceType, asOfDate, confidence).
 * - When a new signal is recorded for an existing (lender, fieldPath), the prior
 *   signal is marked isCurrent=false + supersededBy=<new id>. New signal is isCurrent=true.
 * - Read surfaces always default to isCurrent=true unless the caller explicitly
 *   asks for history.
 *
 * Matching:
 * - Given a deal's criteria (e.g., {dealSize: 1500000, dealType: "bridging", assetClass: "residential"}),
 *   find lenders whose current signals are compatible.
 * - Compatibility rules are documented in
 *   `skills/skills/lender-intel/references/lender-matching-rules.md`.
 */

const VALUE_TYPE = v.union(
  v.literal("number"),
  v.literal("currency"),
  v.literal("percentage"),
  v.literal("string"),
  v.literal("array"),
  v.literal("boolean"),
  v.literal("date"),
);

const SOURCE_TYPE = v.union(
  v.literal("bdm_meeting"),
  v.literal("lender_doc"),
  v.literal("publication"),
  v.literal("deal_behaviour"),
  v.literal("manual"),
);

// ── Internal: write a new signal + supersede the prior current one ────

export const recordInternal = internalMutation({
  args: {
    lenderClientId: v.id("clients"),
    fieldPath: v.string(),
    value: v.any(),
    valueType: VALUE_TYPE,
    sourceType: SOURCE_TYPE,
    sourceRef: v.optional(v.string()),
    asOfDate: v.string(),
    confidence: v.optional(v.number()),
    notes: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Find the prior current signal for this (lender, fieldPath) and supersede
    const prior = await ctx.db
      .query("appetiteSignals")
      .withIndex("by_lender_field", (q) =>
        q.eq("lenderClientId", args.lenderClientId).eq("fieldPath", args.fieldPath),
      )
      .filter((q) => q.eq(q.field("isCurrent"), true))
      .first();

    const now = new Date().toISOString();
    const newId = await ctx.db.insert("appetiteSignals", {
      lenderClientId: args.lenderClientId,
      fieldPath: args.fieldPath,
      value: args.value,
      valueType: args.valueType,
      sourceType: args.sourceType,
      sourceRef: args.sourceRef,
      asOfDate: args.asOfDate,
      confidence: args.confidence,
      isCurrent: true,
      notes: args.notes,
      createdBy: args.userId,
      createdAt: now,
    });

    if (prior) {
      await ctx.db.patch(prior._id, {
        isCurrent: false,
        supersededBy: newId,
      });
    }

    return { ok: true, signalId: newId, supersededPriorId: prior?._id ?? null };
  },
});

// ── Public mutation: operator-driven write (Clerk-authed) ──────────────

export const record = mutation({
  args: {
    lenderClientId: v.id("clients"),
    fieldPath: v.string(),
    value: v.any(),
    valueType: VALUE_TYPE,
    sourceType: SOURCE_TYPE,
    sourceRef: v.optional(v.string()),
    asOfDate: v.optional(v.string()), // defaults to now
    confidence: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]?._id;
    if (!userId) throw new Error("No user available");

    // Verify the lender exists and is type=lender
    const lender = await ctx.db.get(args.lenderClientId);
    if (!lender) throw new Error("lender_not_found");
    if ((lender as any).type !== "lender") {
      return {
        ok: false as const,
        error: "not_a_lender",
        message: `Client ${args.lenderClientId} has type='${(lender as any).type}', not 'lender'. Recorded signals are filtered by type=lender; create or update the client first.`,
      };
    }

    const prior = await ctx.db
      .query("appetiteSignals")
      .withIndex("by_lender_field", (q) =>
        q.eq("lenderClientId", args.lenderClientId).eq("fieldPath", args.fieldPath),
      )
      .filter((q) => q.eq(q.field("isCurrent"), true))
      .first();

    const now = new Date().toISOString();
    const newId = await ctx.db.insert("appetiteSignals", {
      lenderClientId: args.lenderClientId,
      fieldPath: args.fieldPath,
      value: args.value,
      valueType: args.valueType,
      sourceType: args.sourceType,
      sourceRef: args.sourceRef,
      asOfDate: args.asOfDate ?? now,
      confidence: args.confidence,
      isCurrent: true,
      notes: args.notes,
      createdBy: userId,
      createdAt: now,
    });

    if (prior) {
      await ctx.db.patch(prior._id, {
        isCurrent: false,
        supersededBy: newId,
      });
    }

    return {
      ok: true as const,
      signalId: newId,
      supersededPriorId: prior?._id ?? null,
      lenderName: (lender as any).name,
    };
  },
});

// ── Public reads ───────────────────────────────────────────────────────

// Get the current appetite for a lender — all isCurrent=true signals.
// Returns an array, optionally grouped into a single object for convenience.
export const getCurrentForLender = query({
  args: {
    lenderClientId: v.id("clients"),
    asMap: v.optional(v.boolean()), // if true, returns {fieldPath: {value, ...}, ...}
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("appetiteSignals")
      .withIndex("by_lender_current", (q) =>
        q.eq("lenderClientId", args.lenderClientId).eq("isCurrent", true),
      )
      .collect();

    if (args.asMap) {
      const map: Record<string, any> = {};
      for (const r of rows) {
        map[r.fieldPath] = {
          value: r.value,
          valueType: r.valueType,
          sourceType: r.sourceType,
          asOfDate: r.asOfDate,
          confidence: r.confidence,
        };
      }
      return map;
    }
    return rows;
  },
});

// Get full history for a lender (current + superseded).
export const getHistoryForLender = query({
  args: {
    lenderClientId: v.id("clients"),
    fieldPath: v.optional(v.string()), // optionally filter to one fieldPath
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows;
    if (args.fieldPath) {
      rows = await ctx.db
        .query("appetiteSignals")
        .withIndex("by_lender_field", (q) =>
          q.eq("lenderClientId", args.lenderClientId).eq("fieldPath", args.fieldPath as string),
        )
        .collect();
    } else {
      rows = await ctx.db
        .query("appetiteSignals")
        .withIndex("by_lender", (q) => q.eq("lenderClientId", args.lenderClientId))
        .collect();
    }
    rows.sort((a, b) => (b.asOfDate ?? "").localeCompare(a.asOfDate ?? ""));
    return args.limit ? rows.slice(0, args.limit) : rows;
  },
});

// ── Matching ────────────────────────────────────────────────────────────
//
// Given a deal's criteria, find lenders whose current signals are
// compatible. Returns a ranked list with match reasoning per lender.
//
// Compatibility scoring (per signal): each current signal that's relevant
// to the deal criteria contributes to a +match (compatible) or -match
// (incompatible) score. Aggregate per lender. Sort by net score desc.

// ── Deal-type vocabulary bridge ───────────────────────────────────────
//
// Two intentionally separate taxonomies meet here at the matching boundary:
//   - prospect-intel classifies borrowers into 4 canonical deal types
//     (new_development / bridging / existing_asset / unclassifiable)
//   - lenders publish a richer 7-value product catalogue in products.offered
//     (bridging / development_finance / term / btl / mezzanine / commercial / land)
// They are NOT unified (4-vs-7 cardinality, different purpose). Instead a
// prospect code maps onto a lender product code; lender codes pass through
// unchanged. `unclassifiable` has no product equivalent → the dimension is
// skipped (contributes 0), never penalised. Docs single-source-of-truth:
// skills/skills/lender-intel/references/lender-matching-rules.md
const PROSPECT_TO_LENDER_PRODUCT: Record<string, string | null> = {
  new_development: "development_finance",
  bridging: "bridging",
  existing_asset: "term",
  unclassifiable: null, // no lender-product equivalent → skip dimension
};

// Resolve a dealType criterion (prospect canonical OR lender product code) to
// the products.offered vocabulary. Returns undefined when there is no usable
// product match (e.g., unclassifiable), signalling "skip this dimension".
function resolveDealTypeToProduct(dealType: string): string | undefined {
  if (dealType in PROSPECT_TO_LENDER_PRODUCT) {
    return PROSPECT_TO_LENDER_PRODUCT[dealType] ?? undefined;
  }
  return dealType; // already a lender product code (or custom) → passthrough
}

interface MatchCriteria {
  dealSize?: number;
  dealType?: string;       // prospect canonical OR lender product code; resolved via resolveDealTypeToProduct
  assetClass?: string;     // "residential" / "commercial" / "mixed_use"
  geography?: string;      // "london" / "south_east" / "north_west" / etc.
  ltv?: number;            // 0-1; loan-to-value
  ltgdv?: number;          // 0-1; loan-to-GDV
  timelineWeeks?: number;  // urgency
}

export const matchForDeal = query({
  args: {
    criteria: v.object({
      dealSize: v.optional(v.number()),
      dealType: v.optional(v.string()),
      assetClass: v.optional(v.string()),
      geography: v.optional(v.string()),
      ltv: v.optional(v.number()),
      ltgdv: v.optional(v.number()),
      timelineWeeks: v.optional(v.number()),
    }),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const criteria = args.criteria as MatchCriteria;
    // Pull all lender clients (type=lender)
    const allClients = await ctx.db.query("clients").collect();
    const lenders = allClients.filter(
      (c: any) => c.type === "lender" && c.isDeleted !== true,
    );

    if (lenders.length === 0) {
      return {
        matchCount: 0,
        lenders: [],
        note: "No lenders in database. Add lenders via lender.create with type=lender first.",
      };
    }

    const ranked: Array<{
      lenderClientId: string;
      lenderName: string;
      matchScore: number;
      matchReasons: string[];
      fitConcerns: string[];
      currentSignalsCount: number;
    }> = [];

    for (const lender of lenders) {
      const signals = await ctx.db
        .query("appetiteSignals")
        .withIndex("by_lender_current", (q: any) =>
          q.eq("lenderClientId", lender._id).eq("isCurrent", true),
        )
        .collect();

      if (signals.length === 0) {
        // No appetite data — include with low score + note
        ranked.push({
          lenderClientId: lender._id,
          lenderName: (lender as any).name,
          matchScore: 0,
          matchReasons: [],
          fitConcerns: ["No appetite signals recorded for this lender; matching is uninformed"],
          currentSignalsCount: 0,
        });
        continue;
      }

      const reasons: string[] = [];
      const concerns: string[] = [];
      let score = 0;

      const signalMap: Record<string, any> = {};
      for (const s of signals) signalMap[s.fieldPath] = s;

      // Deal size check
      if (criteria.dealSize !== undefined) {
        const min = signalMap["dealSize.min"]?.value;
        const max = signalMap["dealSize.max"]?.value;
        if (typeof min === "number" && criteria.dealSize < min) {
          concerns.push(`Deal size £${criteria.dealSize.toLocaleString()} below lender's min £${min.toLocaleString()}`);
          score -= 5;
        } else if (typeof max === "number" && criteria.dealSize > max) {
          concerns.push(`Deal size £${criteria.dealSize.toLocaleString()} above lender's max £${max.toLocaleString()}`);
          score -= 5;
        } else if (typeof min === "number" || typeof max === "number") {
          reasons.push(`Deal size £${criteria.dealSize.toLocaleString()} within lender's range`);
          score += 3;
        }
      }

      // Deal type check. criteria.dealType may arrive as a prospect canonical
      // code (new_development / existing_asset / ...) or a lender product code;
      // resolve to the products.offered vocabulary before matching. Codes with
      // no product equivalent (unclassifiable) resolve to undefined → skip.
      if (criteria.dealType) {
        const product = resolveDealTypeToProduct(criteria.dealType);
        const products = signalMap["products.offered"]?.value as string[] | undefined;
        if (product && Array.isArray(products)) {
          if (products.includes(product)) {
            reasons.push(`Lender offers ${product}`);
            score += 4;
          } else {
            concerns.push(`Lender doesn't offer ${product} (offers: ${products.join(", ")})`);
            score -= 4;
          }
        }
      }

      // Asset class check
      if (criteria.assetClass) {
        const allowed = signalMap["propertyType.allowed"]?.value as string[] | undefined;
        if (Array.isArray(allowed)) {
          if (allowed.includes(criteria.assetClass)) {
            reasons.push(`Lender accepts ${criteria.assetClass} asset class`);
            score += 3;
          } else {
            concerns.push(`Lender doesn't fund ${criteria.assetClass} (accepts: ${allowed.join(", ")})`);
            score -= 3;
          }
        }
      }

      // Geography check
      if (criteria.geography) {
        const regions = signalMap["geography.regions"]?.value as string[] | undefined;
        if (Array.isArray(regions)) {
          if (regions.includes(criteria.geography) || regions.includes("uk_wide")) {
            reasons.push(`Lender covers ${criteria.geography}`);
            score += 2;
          } else {
            concerns.push(`Lender doesn't cover ${criteria.geography} (covers: ${regions.join(", ")})`);
            score -= 2;
          }
        }
      }

      // LTV check
      if (criteria.ltv !== undefined) {
        const maxLtv = signalMap["ltv.maximum"]?.value;
        if (typeof maxLtv === "number") {
          if (criteria.ltv <= maxLtv) {
            reasons.push(`Required LTV ${(criteria.ltv * 100).toFixed(0)}% within lender's max ${(maxLtv * 100).toFixed(0)}%`);
            score += 2;
          } else {
            concerns.push(`Required LTV ${(criteria.ltv * 100).toFixed(0)}% above lender's max ${(maxLtv * 100).toFixed(0)}%`);
            score -= 3;
          }
        }
      }

      // LTGDV check
      if (criteria.ltgdv !== undefined) {
        const maxLtgdv = signalMap["ltgdv.maximum"]?.value;
        if (typeof maxLtgdv === "number") {
          if (criteria.ltgdv <= maxLtgdv) {
            reasons.push(`Required LTGDV ${(criteria.ltgdv * 100).toFixed(0)}% within lender's max ${(maxLtgdv * 100).toFixed(0)}%`);
            score += 2;
          } else {
            concerns.push(`Required LTGDV ${(criteria.ltgdv * 100).toFixed(0)}% above lender's max ${(maxLtgdv * 100).toFixed(0)}%`);
            score -= 3;
          }
        }
      }

      // Timeline check
      if (criteria.timelineWeeks !== undefined) {
        const typicalWeeks = signalMap["timeline.typicalWeeksToOffer"]?.value;
        if (typeof typicalWeeks === "number") {
          if (typicalWeeks <= criteria.timelineWeeks) {
            reasons.push(`Lender typically delivers offer in ${typicalWeeks}w (need ${criteria.timelineWeeks}w)`);
            score += 2;
          } else {
            concerns.push(`Lender typically needs ${typicalWeeks}w; deal timeline is ${criteria.timelineWeeks}w`);
            score -= 2;
          }
        }
      }

      ranked.push({
        lenderClientId: lender._id,
        lenderName: (lender as any).name,
        matchScore: score,
        matchReasons: reasons,
        fitConcerns: concerns,
        currentSignalsCount: signals.length,
      });
    }

    ranked.sort((a, b) => b.matchScore - a.matchScore);
    const limit = args.limit ?? 10;
    return {
      matchCount: ranked.length,
      criteriaUsed: criteria,
      lenders: ranked.slice(0, limit),
    };
  },
});

// ── Lender list + deep context queries ────────────────────────────────

// Public query: list all lenders (clients with type=lender). Optionally
// filter by name substring. Used by MCP lender.list and any "show me all
// lenders" operator question.
export const listLenders = query({
  args: { nameQuery: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("clients").collect();
    let lenders = all.filter(
      (c: any) => c.type === "lender" && c.isDeleted !== true,
    );
    if (args.nameQuery) {
      const q = args.nameQuery.toLowerCase();
      lenders = lenders.filter(
        (l: any) =>
          (l.name?.toLowerCase().includes(q)) ||
          (l.companyName?.toLowerCase().includes(q)),
      );
    }
    lenders.sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? ""));
    return lenders.slice(0, args.limit ?? 100);
  },
});

// Public query: comprehensive lender snapshot. Sister to client.getDeepContext
// and project.getDeepContext but adapted for lender-side concerns: appetite
// signals (current + recent changes), projects where the lender appears in
// clientRoles, BDM meetings, cadences (relationship maintenance), pending
// approvals (lender-bound outreach).
export const lenderGetDeepContext = query({
  args: { lenderClientId: v.id("clients") },
  handler: async (ctx, args) => {
    const lender = await ctx.db.get(args.lenderClientId);
    if (!lender) return null;
    if ((lender as any).type !== "lender") {
      return {
        error: "not_a_lender",
        message: `Client ${args.lenderClientId} has type='${(lender as any).type}'; lender.getDeepContext requires type='lender'. Use client.getDeepContext for non-lender clients.`,
      };
    }

    // 1. Current appetite (isCurrent=true)
    const currentSignals = await ctx.db
      .query("appetiteSignals")
      .withIndex("by_lender_current", (q) =>
        q.eq("lenderClientId", args.lenderClientId).eq("isCurrent", true),
      )
      .collect();
    const appetiteMap: Record<string, any> = {};
    for (const s of currentSignals) {
      appetiteMap[s.fieldPath] = {
        value: s.value,
        valueType: s.valueType,
        sourceType: s.sourceType,
        asOfDate: s.asOfDate,
        confidence: s.confidence,
      };
    }

    // 2. Recent signals changes (any signals where _creationTime > 90 days ago)
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const recentChanges = (await ctx.db
      .query("appetiteSignals")
      .withIndex("by_lender", (q) => q.eq("lenderClientId", args.lenderClientId))
      .collect())
      .filter((s: any) => s._creationTime > ninetyDaysAgo)
      .sort((a: any, b: any) => b._creationTime - a._creationTime)
      .slice(0, 30);

    // 3. Contacts (BDMs at this lender)
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_client", (q) => q.eq("clientId", args.lenderClientId))
      .collect();

    // 4. Projects where this lender appears in clientRoles
    const allProjects = await ctx.db.query("projects").collect();
    const linkedProjects = allProjects.filter((p: any) =>
      (p.clientRoles ?? []).some((cr: any) => cr.clientId === args.lenderClientId),
    );

    // 5. Meetings linked directly to lender (BDM check-ins)
    const allMeetings = await ctx.db.query("meetings").collect();
    const meetings = allMeetings.filter((m: any) => m.clientId === args.lenderClientId);
    const nowIso = new Date().toISOString();
    const meetingsUpcoming = meetings
      .filter((m: any) => m.meetingDate >= nowIso)
      .sort((a: any, b: any) => a.meetingDate.localeCompare(b.meetingDate));
    const meetingsPast = meetings
      .filter((m: any) => m.meetingDate < nowIso)
      .sort((a: any, b: any) => b.meetingDate.localeCompare(a.meetingDate))
      .slice(0, 10);

    // 6. Cadences targeting this lender (relationship maintenance)
    const allCadences = await ctx.db.query("cadences").collect();
    const cadences = allCadences.filter((c: any) => c.relatedClientId === args.lenderClientId);

    // 7. Pending approvals (lender-bound outreach)
    const pendingApprovals = (await ctx.db
      .query("approvals")
      .withIndex("by_related_client", (q) => q.eq("relatedClientId", args.lenderClientId))
      .collect())
      .filter((a: any) => a.status === "pending");

    const summary = {
      name: (lender as any).name,
      companyName: (lender as any).companyName,
      type: "lender",
      status: (lender as any).status,
      contactsCount: contacts.length,
      currentAppetiteFieldCount: currentSignals.length,
      recentChangesIn90d: recentChanges.length,
      linkedProjectsCount: linkedProjects.length,
      meetingsUpcoming: meetingsUpcoming.length,
      meetingsPast: meetingsPast.length,
      activeCadences: cadences.filter((c: any) => c.isActive).length,
      pendingApprovals: pendingApprovals.length,
    };

    return {
      summary,
      lender,
      currentAppetite: appetiteMap,
      currentSignals,
      recentChanges,
      contacts,
      linkedProjects,
      meetings: { upcoming: meetingsUpcoming, past: meetingsPast },
      cadences,
      pendingApprovals,
    };
  },
});
