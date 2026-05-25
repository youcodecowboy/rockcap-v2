import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

// Internal API for the cadences table. The MCP tools cadence.create and
// cadence.cancel wrap these (see convex/mcp.ts). The cron dispatcher in
// cadenceDispatcher.ts uses the internal queries to find due rows and the
// internal mutations to advance state.

// ── Create a cadence row (called by cadence.create MCP tool) ───────────

export const createInternal = internalMutation({
  args: {
    contactId: v.id("contacts"),
    cadenceType: v.union(
      v.literal("prospect_followup"),
      v.literal("warm_lead_chase"),
      v.literal("execution_chaser"),
      v.literal("client_checkin"),
      v.literal("bdm_relationship"),
      v.literal("monitoring_ask"),
      v.literal("post_lost_re_engagement"),
      v.literal("custom"),
    ),
    scheduleConfig: v.object({
      intervalDays: v.optional(v.number()),
      anchorDate: v.optional(v.string()),
      customSchedule: v.optional(v.any()),
    }),
    nextDueAt: v.string(),
    isActive: v.boolean(),
    relatedClientId: v.optional(v.id("clients")),
    relatedProjectId: v.optional(v.id("projects")),
    packageId: v.optional(v.string()),
    packageOrder: v.optional(v.number()),
    preDraftedTouch: v.optional(v.object({
      subject: v.string(),
      bodyText: v.string(),
      bodyHtml: v.string(),
      dynamicVars: v.optional(v.any()),
    })),
    sourceSkillRunId: v.optional(v.id("skillRuns")),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("cadences", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Find due cadences for the dispatcher cron ────────────────────────

export const findDueInternal = internalQuery({
  args: { nowIso: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_active_next_due", (q) =>
        q.eq("isActive", true).lte("nextDueAt", args.nowIso),
      )
      .take(args.limit);
    // v1.2: respect package-level approval gate. Skip rows that haven't been
    // approved yet OR were denied. Legacy rows (no packageApprovalStatus
    // field at all) are treated as approved for back-compat — see the
    // one-shot migration in a follow-on commit.
    return rows.filter((row) =>
      row.packageApprovalStatus === undefined ||
      row.packageApprovalStatus === "approved"
    );
  },
});

// ── Find active cadences for a contact (reply handler cancellation) ──

export const findActiveByContactInternal = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cadences")
      .withIndex("by_contact_active", (q) =>
        q.eq("contactId", args.contactId).eq("isActive", true),
      )
      .collect();
  },
});

// ── Cancel a single cadence (used by reply handler) ──────────────────

export const cancelInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    reason: v.string(),
    replyEventId: v.optional(v.id("replyEvents")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cadenceId, {
      isActive: false,
      cancelledReason: args.reason,
      cancelledByEventId: args.replyEventId,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});

// ── Restore a cancelled cadence (used by out_of_office intent) ───────

export const restoreInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    pauseUntil: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cadenceId, {
      isActive: true,
      pauseUntil: args.pauseUntil,
      cancelledReason: undefined,
      cancelledByEventId: undefined,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});

// ── Advance cadence state after a successful fire ────────────────────

export const advanceAfterFireInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    fireKey: v.string(),
    lastResult: v.union(
      v.literal("sent"),
      v.literal("skipped_paused"),
      v.literal("skipped_holiday"),
      v.literal("skipped_user_opted_out"),
      // "failed" intentionally excluded here. Failures must use
      // recordFailureInternal so the consecutiveFailures counter increments
      // and the auto-deactivate-at-3 guard fires correctly.
    ),
    nextDueAt: v.optional(v.string()),  // undefined means one-shot complete → set isActive: false
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      lastFiredAt: now,
      lastResult: args.lastResult,
      lastFireKey: args.fireKey,
      consecutiveFailures: 0,
      updatedAt: now,
    };
    if (args.nextDueAt === undefined) {
      patch.isActive = false;
    } else {
      patch.nextDueAt = args.nextDueAt;
    }
    await ctx.db.patch(args.cadenceId, patch);
    return { ok: true };
  },
});

// ── Record a fire failure ────────────────────────────────────────────

export const recordFailureInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    step: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.cadenceId);
    if (!row) throw new Error(`cadence not found: ${args.cadenceId}`);
    const prevFailures = row.consecutiveFailures ?? 0;
    const prevErrors = row.errors ?? [];
    const now = new Date().toISOString();
    const newErrors = [
      ...prevErrors.slice(-9),  // keep last 10
      { at: now, step: args.step, message: args.message },
    ];
    const consecutiveFailures = prevFailures + 1;
    const patch: Record<string, unknown> = {
      lastResult: "failed" as const,
      consecutiveFailures,
      errors: newErrors,
      updatedAt: now,
    };
    if (consecutiveFailures >= 3) {
      patch.isActive = false;
    }
    await ctx.db.patch(args.cadenceId, patch);
    return { ok: true, deactivated: consecutiveFailures >= 3 };
  },
});

// ── Get one cadence by id ────────────────────────────────────────────

export const getInternal = internalQuery({
  args: { cadenceId: v.id("cadences") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.cadenceId);
  },
});

// ── Public query for the composer route ─────────────────────────────
// Returns a cadence row by id. Used by /api/cadence-compose which
// authenticates the caller via CONVEX_INTERNAL_SECRET but needs to
// read cadence data to compose its touch. Public (not internal) so
// the route's ConvexHttpClient can call it without user-auth tokens.
export const getById = query({
  args: { cadenceId: v.id("cadences") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.cadenceId);
  },
});

// ── Public query: list cadences by package (powers detail page Outreach tab) ──

export const listByPackage = query({
  args: { packageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
  },
});

// ── Public query: list cadences by contact (detail page sidebar) ──

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cadences")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

// ── Public query: list cadences by related client (prospect detail page) ──

export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cadences")
      .withIndex("by_related_client", (q) => q.eq("relatedClientId", args.clientId))
      .collect();
  },
});

// ── Update a single cadence (operator edit; called by cadence.update MCP) ──

export const updateInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    userId: v.id("users"),
    preDraftedTouch: v.optional(v.object({
      subject: v.string(),
      bodyText: v.string(),
      bodyHtml: v.string(),
      dynamicVars: v.optional(v.any()),
    })),
    nextDueAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      editedByOperator: true,
      editedAt: now,
      editedBy: args.userId,
      updatedAt: now,
    };
    if (args.preDraftedTouch !== undefined) patch.preDraftedTouch = args.preDraftedTouch;
    if (args.nextDueAt !== undefined) patch.nextDueAt = args.nextDueAt;
    await ctx.db.patch(args.cadenceId, patch);
    return { ok: true };
  },
});

// ── Approve all cadences in a package (single-gate approval model) ──

export const approvePackageInternal = internalMutation({
  args: {
    packageId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const now = new Date().toISOString();
    let patched = 0;
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        packageApprovalStatus: "approved",
        approvedBy: args.userId,
        approvedAt: now,
        updatedAt: now,
      });
      patched++;
    }
    return { ok: true, patched };
  },
});

// ── Deny all cadences in a package ──

export const denyPackageInternal = internalMutation({
  args: {
    packageId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const now = new Date().toISOString();
    let patched = 0;
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        packageApprovalStatus: "denied",
        isActive: false,
        cancelledReason: "operator_denied_package",
        updatedAt: now,
      });
      patched++;
    }
    return { ok: true, patched };
  },
});

// ── Request revision on a package (mark for skill re-run) ──

export const requestRevisionInternal = internalMutation({
  args: {
    packageId: v.string(),
    userId: v.id("users"),
    revisionNote: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const now = new Date().toISOString();
    let patched = 0;
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        revisionRequested: true,
        revisionNote: args.revisionNote,
        revisionRequestedBy: args.userId,
        revisionRequestedAt: now,
        updatedAt: now,
      });
      patched++;
    }
    return { ok: true, patched };
  },
});

// ── Migration helpers (used once by the v1.2 migration action) ────────

export const findAllForMigrationInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("cadences").collect();
  },
});

export const markApprovedForMigrationInternal = internalMutation({
  args: { cadenceId: v.id("cadences") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cadenceId, {
      packageApprovalStatus: "approved",
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});

// ── Public mutation wrappers for the prospects CRM (v1.2) ──────────────────
// These wrap the internal mutations with auth resolution. They resolve userId
// by querying the first user row — safe for the single-tenant RockCap setup.

export const approvePackage = mutation({
  args: { packageId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]?._id;
    if (!userId) throw new Error("No user available");
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const now = new Date().toISOString();
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        packageApprovalStatus: "approved",
        approvedBy: userId,
        approvedAt: now,
        updatedAt: now,
      });
    }
    return { ok: true, patched: rows.length };
  },
});

export const denyPackage = mutation({
  args: { packageId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]?._id;
    if (!userId) throw new Error("No user available");
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const now = new Date().toISOString();
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        packageApprovalStatus: "denied",
        isActive: false,
        cancelledReason: "operator_denied_package",
        updatedAt: now,
      });
    }
    return { ok: true, patched: rows.length };
  },
});

export const requestRevision = mutation({
  args: { packageId: v.string(), revisionNote: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]?._id;
    if (!userId) throw new Error("No user available");
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const now = new Date().toISOString();
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        revisionRequested: true,
        revisionNote: args.revisionNote,
        revisionRequestedBy: userId,
        revisionRequestedAt: now,
        updatedAt: now,
      });
    }
    return { ok: true, patched: rows.length };
  },
});
