import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

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
    return await ctx.db
      .query("cadences")
      .withIndex("by_active_next_due", (q) =>
        q.eq("isActive", true).lte("nextDueAt", args.nowIso),
      )
      .take(args.limit);
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
