import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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
  v.literal("researched"),
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
    // Fire-and-forget HubSpot push-back. Doesn't block the transition.
    await ctx.scheduler.runAfter(0, internal.prospects.pushStateToHubspotInternal, {
      clientId: args.clientId,
      newState: args.newState,
    });
    return { ok: true, transitionedAt: now };
  },
});

// Per-prospect outreach rollup for the /prospects ladder table: how many
// emails have actually gone OUT (outbound gmail touchpoints — written by the
// send chokepoint in gmailSend.performApprovedSend, so this counts real
// sends, not staged approvals) and when the latest inbound reply arrived.
// Batched over all prospect rows in one query so the table holds a single
// reactive subscription instead of one per row.
export const outreachStats = query({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query("clients").collect();
    const prospects = clients.filter(
      (c: any) => c.status === "prospect" && c.prospectState,
    );
    const stats: Record<
      string,
      { emailsSent: number; lastSentAt?: string; lastReplyAt?: string }
    > = {};
    for (const p of prospects) {
      const touchpoints = await ctx.db
        .query("touchpoints")
        .withIndex("by_related_client", (q) => q.eq("relatedClientId", p._id))
        .collect();
      const outbound = touchpoints.filter(
        (t: any) => t.direction === "outbound" && t.kind === "email",
      );
      let lastSentAt: string | undefined;
      for (const t of outbound) {
        if (!lastSentAt || t.occurredAt > lastSentAt) lastSentAt = t.occurredAt;
      }
      const lastReply = await ctx.db
        .query("replyEvents")
        .withIndex("by_linked_client", (q) => q.eq("linkedClientId", p._id))
        .order("desc")
        .first();
      stats[p._id] = {
        emailsSent: outbound.length,
        lastSentAt,
        lastReplyAt: (lastReply as any)?.receivedAt,
      };
    }
    return stats;
  },
});

// Auto-transition on a successful outbound send: a prospect still in a
// pre-outreach state (researched / drafted / needs_revision) moves to
// "active" — outreach is now in flight. Called from the send chokepoint
// (gmailSend.performApprovedSend) AFTER the email has actually left, not at
// approval-staging time: a staged draft awaiting /approvals sign-off is not
// outreach in flight yet. Never downgrades: replied / engaged / promoted /
// parked / lost stay where they are, and non-prospect clients are untouched.
export const markOutreachInFlightInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return { ok: false as const, reason: "client_not_found" };
    const state = (client as any).prospectState;
    if (state !== "researched" && state !== "drafted" && state !== "needs_revision") {
      return { ok: false as const, reason: state ? `state_${state}_not_pre_outreach` : "not_a_prospect" };
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.clientId, {
      prospectState: "active",
      prospectStateChangedAt: now,
      prospectStateChangedBy: args.userId,
    });
    await ctx.scheduler.runAfter(0, internal.prospects.pushStateToHubspotInternal, {
      clientId: args.clientId,
      newState: "active",
    });
    return { ok: true as const, from: state, to: "active" as const };
  },
});

// Public state transition for the prospect detail UI — the operator can advance
// the prospect to ANY stage manually (every step is operator-controllable, not
// just the auto-triggers). Resolves the acting user from the Clerk identity
// (same pattern as clients.activate). NOTE: moving to "promoted" should go through
// clients.activate (it also flips clients.status → active); this only moves
// prospectState, so the UI routes the promote action to activate instead.
export const transitionState = mutation({
  args: { clientId: v.id("clients"), newState: PROSPECT_STATE },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let userId: Id<"users"> | undefined;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
        .first();
      userId = user?._id;
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.clientId, {
      prospectState: args.newState,
      prospectStateChangedAt: now,
      prospectStateChangedBy: userId,
    });
    await ctx.scheduler.runAfter(0, internal.prospects.pushStateToHubspotInternal, {
      clientId: args.clientId,
      newState: args.newState,
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

// ── v1.3 — prospect.getDeepContext: the central "where are we at?" tool ──
//
// One-shot snapshot of EVERYTHING about a prospect. Designed so Claude Code
// can answer operator questions like "where are we at with Mccarthy?" with
// a single tool call instead of 8-12 separate reads.
//
// Returns a structured payload covering: the prospect itself, all linked
// contacts, all cadences (active + completed), all reply events, the
// prospect-intel skillRun, all meetings, the CH profile (if synced),
// pending approvals (not yet implemented — placeholder), and the
// clientIntelligence row.
//
// Each section is best-effort: missing data returns null/empty rather than
// erroring, so Claude Code can synthesise even partial answers. The cost
// is one query call per prospect — acceptable given operator-driven usage
// pattern (a few calls per session, not a hot loop).

export const getDeepContext = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // 1. Prospect itself
    const prospect = await ctx.db.get(args.clientId);
    if (!prospect) return null;

    // 2. Contacts linked to this client
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    // 3. Cadences — split by state for easier consumption
    const cadencesAll = await ctx.db
      .query("cadences")
      .withIndex("by_related_client", (q) => q.eq("relatedClientId", args.clientId))
      .collect();
    const cadencesActive = cadencesAll.filter((c) => c.isActive);
    const cadencesFired = cadencesAll.filter((c) => c.lastFiredAt);
    const cadencesQueued = cadencesAll.filter((c) => c.isActive && !c.lastFiredAt);

    // 4. Reply events linked to this client
    const replyEvents = await ctx.db
      .query("replyEvents")
      .withIndex("by_linked_client", (q) => q.eq("linkedClientId", args.clientId))
      .order("desc")
      .take(20);

    // 5. Latest prospect-intel skillRun
    const latestProspectIntel = await ctx.db
      .query("skillRuns")
      .filter((q) => q.eq(q.field("linkedClientId"), args.clientId))
      .order("desc")
      .take(5);
    const latestIntelRun = latestProspectIntel.find(
      (r: any) => r.skillName === "prospect-intel",
    );

    // 6. Meetings — both upcoming and past
    const meetingsAll = (await ctx.db
      .query("meetings")
      .collect()).filter((m: any) => m.clientId === args.clientId);
    const nowIso = new Date().toISOString();
    const meetingsUpcoming = meetingsAll
      .filter((m: any) => m.scheduledAt && m.scheduledAt >= nowIso)
      .sort((a: any, b: any) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
    const meetingsPast = meetingsAll
      .filter((m: any) => !m.scheduledAt || m.scheduledAt < nowIso)
      .sort((a: any, b: any) => (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? ""))
      .slice(0, 10);

    // 7. CH profile if synced
    let chProfile: any = null;
    const chNumber =
      (prospect as any).companiesHouseNumber ??
      (latestIntelRun as any)?.dedupKey;
    if (chNumber) {
      const ch = await ctx.db
        .query("companiesHouseCompanies")
        .withIndex("by_company_number", (q) => q.eq("companyNumber", chNumber))
        .first();
      if (ch) {
        const charges = await ctx.db
          .query("companiesHouseCharges")
          .filter((q) => q.eq(q.field("companyId"), ch._id))
          .collect();
        chProfile = { ...ch, charges };
      }
    }

    // 8. Client intelligence row (richer structured intel)
    const clientIntelligence = await ctx.db
      .query("clientIntelligence")
      .filter((q) => q.eq(q.field("clientId"), args.clientId))
      .first();

    // 9. Touchpoints (any logged outreach activity)
    const touchpoints = (await ctx.db
      .query("touchpoints")
      .collect())
      .filter((t: any) => t.clientId === args.clientId)
      .sort((a: any, b: any) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""))
      .slice(0, 20);

    // 10. v1.3 — Deals linked to this client (active-client primary view).
    // Deals table has clientId field. We fetch all then sort by amount/date.
    const deals = (await ctx.db.query("deals").collect())
      .filter((d: any) => d.clientId === args.clientId)
      .sort((a: any, b: any) => (b.amount ?? 0) - (a.amount ?? 0));
    const dealsActive = deals.filter((d: any) => {
      const s = (d.status ?? "").toLowerCase();
      // Active = anything not closed-won/lost/dropped. Heuristic — adapt
      // when the deal lifecycle stages stabilise.
      return !s.includes("closed") && !s.includes("lost") && !s.includes("dropped");
    });

    // 11. v1.3 — Projects linked via the many-to-many clientRoles array.
    // Projects can have multiple client roles (borrower / lender / etc.);
    // surface all where this client appears in any role.
    const projects = (await ctx.db.query("projects").collect()).filter((p: any) =>
      (p.clientRoles ?? []).some((cr: any) => cr.clientId === args.clientId),
    );
    const projectsActive = projects.filter((p: any) => {
      const s = (p.status ?? "").toLowerCase();
      return s === "active" || s === "in_progress" || s === "underwriting" || s === "execution" || s === "post_credit";
    });

    // 12. v1.3 — Pending approvals targeting this client. The approvals
    // table doesn't have a direct clientId column (uses entityRefId as
    // a flexible string); we'd need a denormalised link to filter
    // efficiently. For now: scan for any approval whose draftPayload
    // references this client. Best-effort; the operator can drill into
    // /approvals for the full picture.
    const allApprovals = await ctx.db.query("approvals").collect();
    const pendingApprovals = allApprovals
      .filter((a: any) => a.status === "pending")
      .filter((a: any) => {
        // Match on draftPayload string contents (loose; could be tightened
        // when approvals get a structured clientId field)
        const payload = JSON.stringify(a.draftPayload ?? {});
        return payload.includes(args.clientId);
      })
      .slice(0, 20);

    // Compose a synthesis-friendly summary block. Claude Code can use this
    // for a quick "headline" answer, then drill into the structured fields.
    // Adapts to entity state: prospects show outreach counts; active clients
    // show deal/project counts. Both shapes share core identity + counts.
    const isActiveClient = (prospect as any).status === "active";
    const summary: Record<string, any> = {
      name: (prospect as any).name,
      type: (prospect as any).type,
      status: (prospect as any).status,
      prospectState: (prospect as any).prospectState ?? "n/a",
      companiesHouseNumber: chNumber,
      contactsCount: contacts.length,
      contactsWithEmail: contacts.filter((c: any) => c.email).length,
      meetingsUpcoming: meetingsUpcoming.length,
      meetingsPast: meetingsPast.length,
      pendingApprovals: pendingApprovals.length,
      // Prospect-flavour counts (always returned; will be 0 for active clients)
      cadencesActive: cadencesActive.length,
      cadencesFired: cadencesFired.length,
      cadencesQueued: cadencesQueued.length,
      repliesReceived: replyEvents.length,
      repliesAwaitingTriage: replyEvents.filter((r: any) => r.dispatchedTo === "operator_review").length,
      latestIntelRunStatus: latestIntelRun?.status ?? "no_run",
      latestIntelRunCompletedAt: latestIntelRun?.completedAt,
      chargesActive: chProfile?.charges?.filter((c: any) => c.chargeStatus === "outstanding").length ?? 0,
      chargesTotal: chProfile?.charges?.length ?? 0,
      // Active-client-flavour counts (always returned; will be 0 for prospects)
      dealsActive: dealsActive.length,
      dealsTotal: deals.length,
      projectsActive: projectsActive.length,
      projectsTotal: projects.length,
      touchpointsCount: touchpoints.length,
    };
    if ((prospect as any).prospectStateChangedAt) {
      summary.prospectStateChangedAt = (prospect as any).prospectStateChangedAt;
    }
    // Outreach-ready gate (2026-05-30): surface the accept flag at a glance so
    // the agent reads readiness from the summary without parsing the full row.
    // outreachReady true = operator has accepted the intel; outreach-draft may
    // now compose the cadence package.
    summary.outreachReady = Boolean((prospect as any).outreachReadyAt);
    if ((prospect as any).outreachReadyAt) {
      summary.outreachReadyAt = (prospect as any).outreachReadyAt;
      summary.outreachReadyBy = (prospect as any).outreachReadyBy;
    }
    // Operator context (2026-05-31): flag whether the running operator-knowledge
    // reference (clientIntelligence.contextMarkdown) has been populated, so the
    // agent knows to read it. The full md rides along on `clientIntelligence`.
    summary.hasOperatorContext = Boolean((clientIntelligence as any)?.contextMarkdown);
    if ((clientIntelligence as any)?.contextMarkdownUpdatedAt) {
      summary.contextUpdatedAt = (clientIntelligence as any).contextMarkdownUpdatedAt;
    }
    summary.entityFocus = isActiveClient ? "active_client" : "prospect";

    // Knowledge items (structured facts) for this client — active only.
    // These previously lived only in the knowledgeItems table, invisible to this
    // read path; surfacing them here lets downstream skills + the Knowledge tab
    // read the AI-/operator-captured facts (lender DNA, classification, related
    // entities, manual facts) without re-parsing intelMarkdown.
    const knowledgeItems = (
      await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect()
    )
      .filter((k: any) => k.status === "active")
      .sort((a: any, b: any) =>
        a.category !== b.category
          ? a.category.localeCompare(b.category)
          : a.fieldPath.localeCompare(b.fieldPath),
      );
    summary.knowledgeItemCount = knowledgeItems.length;

    return {
      summary,
      prospect,
      contacts,
      cadences: {
        all: cadencesAll,
        active: cadencesActive,
        fired: cadencesFired,
        queued: cadencesQueued,
      },
      replyEvents,
      latestIntelRun,
      recentSkillRuns: latestProspectIntel,
      meetings: { upcoming: meetingsUpcoming, past: meetingsPast },
      chProfile,
      clientIntelligence,
      knowledgeItems,
      touchpoints,
      // v1.3 — active-client sections (returned for any clients row; empty arrays for prospects)
      deals: { all: deals, active: dealsActive },
      projects: { all: projects, active: projectsActive },
      pendingApprovals,
    };
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

// One-shot admin tool: link an existing cadence package to a clients row.
// Used when a clients row is manually promoted from a HubSpot company that
// already had a prospect-intel skillRun + cadences (the cadences were
// created against just a contact, with no relatedClientId yet). The CRM
// detail page reads cadences via api.cadences.listByClient, so this link
// is the join that makes the Outreach tab populate.
//
// Idempotent: only patches rows where relatedClientId is unset OR
// differs from the target.
export const linkExistingCadencesToClientInternal = internalAction({
  args: {
    clientId: v.id("clients"),
    packageId: v.string(),
  },
  handler: async (ctx, args) => {
    const allRows = await ctx.runQuery(internal.cadences.findAllForMigrationInternal, {});
    const matching = allRows.filter((r: any) => r.packageId === args.packageId);
    let patched = 0;
    for (const row of matching) {
      if (row.relatedClientId !== args.clientId) {
        await ctx.runMutation(internal.cadences.setRelatedClientForLinkInternal, {
          cadenceId: row._id,
          clientId: args.clientId,
        });
        patched++;
      }
    }
    return { ok: true, patched, total: matching.length };
  },
});

// HubSpot lifecycle + lead status mapping per spec section 2.8
const HUBSPOT_MAPPING: Record<string, { lifecycleStage: string; hs_lead_status: string }> = {
  researched: { lifecycleStage: "lead", hs_lead_status: "open" },
  drafted: { lifecycleStage: "lead", hs_lead_status: "open" },
  needs_revision: { lifecycleStage: "lead", hs_lead_status: "open" },
  active: { lifecycleStage: "marketingqualifiedlead", hs_lead_status: "contacted" },
  replied: { lifecycleStage: "marketingqualifiedlead", hs_lead_status: "contacted" },
  engaged: { lifecycleStage: "salesqualifiedlead", hs_lead_status: "qualified" },
  promoted: { lifecycleStage: "customer", hs_lead_status: "connected" },
  parked: { lifecycleStage: "lead", hs_lead_status: "nurturing" },
  lost: { lifecycleStage: "lead", hs_lead_status: "bad_fit" },
};

// Fire-and-forget HubSpot push-back. Called from transitionStateInternal via
// ctx.scheduler.runAfter so the transition mutation isn't blocked on the
// HubSpot API roundtrip. Failure is logged but doesn't roll back the
// state transition (RockCap state is source-of-truth; HubSpot will reconcile
// at the next 6h sync if push fails).
//
// v1.2: STUB — logs the intended PATCH. Real HubSpot API call lands in v1.2.1
// once the OAuth token retrieval pattern is wired (see hubspotSync/contacts.ts
// for the canonical pattern).
export const pushStateToHubspotInternal = internalAction({
  args: {
    clientId: v.id("clients"),
    newState: v.union(
      v.literal("drafted"),
      v.literal("needs_revision"),
      v.literal("active"),
      v.literal("replied"),
      v.literal("engaged"),
      v.literal("promoted"),
      v.literal("parked"),
      v.literal("lost"),
    ),
  },
  handler: async (ctx, args) => {
    const client = await ctx.runQuery(internal.prospects.getInternal, { clientId: args.clientId });
    if (!client) {
      console.warn(`[hubspot-push] client ${args.clientId} not found; skipping push`);
      return { ok: false, reason: "client_not_found" };
    }
    const hubspotCompanyId = (client as any).hubspotCompanyId;
    if (!hubspotCompanyId) {
      return { ok: false, reason: "no_hubspot_company_id" };
    }
    const mapping = HUBSPOT_MAPPING[args.newState];
    if (!mapping) {
      return { ok: false, reason: `no_mapping_for_state_${args.newState}` };
    }
    // STUB: actual HubSpot PATCH deferred to v1.2.1.
    console.log(
      `[hubspot-push] would PATCH company ${hubspotCompanyId} → lifecycleStage=${mapping.lifecycleStage}, hs_lead_status=${mapping.hs_lead_status}`,
    );
    return { ok: true, hubspotCompanyId, mapping };
  },
});
