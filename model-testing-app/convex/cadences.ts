import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isCadenceFireable } from "./lib/cadenceGating";
import { applyPipelineStage } from "./prospectStages";

// Internal API for the cadences table. The MCP tools cadence.create and
// cadence.cancel wrap these (see convex/mcp.ts). The cron dispatcher in
// cadenceDispatcher.ts uses the internal queries to find due rows and the
// internal mutations to advance state.

// ── Create a cadence row (called by cadence.create MCP tool) ───────────

export const createInternal = internalMutation({
  args: {
    // Phase 3: optional. When absent, the row is a held "needs_contact" draft
    // (see handler) — reviewable on the board but never fired by the dispatcher.
    contactId: v.optional(v.id("contacts")),
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
    // Phase 3: a contactless row is a held draft. Force it inactive +
    // needs_contact so the dispatcher (findDueInternal: isActive=true AND
    // packageApprovalStatus approved/undefined) can never fire it, while the
    // board can still surface it for review. The caller's isActive /
    // packageApprovalStatus are overridden in this case on purpose.
    if (!args.contactId) {
      return await ctx.db.insert("cadences", {
        ...args,
        isActive: false,
        packageApprovalStatus: "needs_contact",
        needsContact: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return await ctx.db.insert("cadences", {
      ...args,
      // A package member starts pending; cadences.approvePackage flips it to
      // "approved" before the dispatcher (findDueInternal) will stage it. A
      // non-package recurring cadence has no package gate, so leave it unset.
      ...(args.packageId ? { packageApprovalStatus: "pending" as const } : {}),
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
    //
    // Phase 3: this also excludes contactless held drafts. They are isActive=
    // false (so the by_active_next_due index above never returns them) AND
    // packageApprovalStatus="needs_contact" (so this filter would drop them
    // too). A contactless draft therefore cannot fire — confirmed safe.
    // v1.2 gate (hardened): a package member fires only once its package is
    // approved; a non-package recurring cadence has no package gate. See
    // ./lib/cadenceGating. Previously `undefined` was treated as approved for
    // all rows, which let a never-approved package member stage itself.
    return rows.filter((row) => isCadenceFireable(row));
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
      v.literal("approval_staged"),  // fired → staged a pending approval (did NOT send)
      v.literal("sent"),             // legacy-tolerated; nothing writes it anymore
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

    // Trigger-B base: a fired touch (an approval was staged, or the legacy
    // "sent" result) is an outbound send, so stamp the related prospect's
    // lastOutreachSendAt — this is the base the 30-day cadence-gap freshness
    // check measures from. Skips (paused / holiday / opted-out) are NOT sends,
    // so they leave the clock untouched.
    if (args.lastResult === "approval_staged" || args.lastResult === "sent") {
      const row = await ctx.db.get(args.cadenceId);
      if (row?.relatedClientId) {
        await ctx.db.patch(row.relatedClientId, { lastOutreachSendAt: now });
      }
    }
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
    // Configurable cadence shape (MCP cadence management). Optional — only
    // patched when provided.
    cadenceType: v.optional(v.union(
      v.literal("prospect_followup"),
      v.literal("warm_lead_chase"),
      v.literal("execution_chaser"),
      v.literal("client_checkin"),
      v.literal("bdm_relationship"),
      v.literal("monitoring_ask"),
      v.literal("post_lost_re_engagement"),
      v.literal("custom"),
    )),
    scheduleConfig: v.optional(v.object({
      intervalDays: v.optional(v.number()),
      anchorDate: v.optional(v.string()),
      customSchedule: v.optional(v.any()),
    })),
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
    if (args.cadenceType !== undefined) patch.cadenceType = args.cadenceType;
    if (args.scheduleConfig !== undefined) patch.scheduleConfig = args.scheduleConfig;
    await ctx.db.patch(args.cadenceId, patch);
    return { ok: true };
  },
});

// ── Approve all cadences in a package (single-gate approval model) ──
//
// THE shared package-approval helper. A plain async helper (NOT a registered
// Convex function) so both the public approvePackage and the internal
// approvePackageInternal route through one place. `ctx` is always a mutation
// ctx (both callers are mutations), which lets the pipeline-stage write go
// through applyPipelineStage directly for same-transaction consistency.
//
// Responsibilities, in order:
//   1. NO-CONTACT GUARD — mirror the dispatcher's fire-time sendability check
//      (cadenceDispatcher.ts ~lines 84-92: a touch with no contact email can
//      never send). If no package member has a contact with an email on file,
//      refuse to approve rather than approving a package that can only fail at
//      fire time.
//   2. Flip every row to approved (+ approvedBy / approvedAt / updatedAt).
//   3. Stage write → cold_outreach (forward_only, so a prospect already further
//      along is never demoted), keyed off the package's relatedClientId.
//   4. Backfill clients.outreachReadyAt if unset (plumbing).
//   5. Kick the dispatcher now so a touch already due fires within seconds.
export async function applyPackageApproval(
  ctx: any,
  args: { packageId: string; userId: Id<"users"> },
  // Batch callers (approvePackageBatchInternal) kick the dispatcher ONCE after
  // the last package instead of once per package — concurrent ticks can race
  // the lastFireKey idempotency check and double-stage a due touch.
  opts?: { skipDispatcherKick?: boolean },
): Promise<{ ok: boolean; patched: number }> {
  const rows = await ctx.db
    .query("cadences")
    .withIndex("by_package", (q: any) => q.eq("packageId", args.packageId))
    .collect();

  // 1. No-contact guard — at least one member must have a contact with an email.
  const contactIds = Array.from(
    new Set(rows.map((r: any) => r.contactId).filter(Boolean)),
  );
  const contacts = await Promise.all(
    contactIds.map((cid: any) => ctx.db.get(cid)),
  );
  const hasSendableContact = contacts.some((c: any) => c?.email);
  if (!hasSendableContact) {
    throw new Error(
      "Cannot approve cadence package: no contact with an email address on file. Attach a sendable contact before approving.",
    );
  }

  const now = new Date().toISOString();

  // 2. Flip every row to approved.
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

  // 3 + 4. Stage write + outreachReadyAt backfill, keyed off the package's
  // related client (same value across the members, but tolerate stragglers).
  const relatedClientId = rows.find((r: any) => r.relatedClientId)
    ?.relatedClientId as Id<"clients"> | undefined;
  if (relatedClientId) {
    await applyPipelineStage(ctx, {
      clientId: relatedClientId,
      toStage: "cold_outreach",
      reason: "cadence_approved",
      userId: args.userId,
      mode: "forward_only",
    });
    const client = await ctx.db.get(relatedClientId);
    if (client && !(client as any).outreachReadyAt) {
      await ctx.db.patch(relatedClientId, { outreachReadyAt: now });
    }
  }

  // 5. "Approve & Schedule" should feel immediate: run the dispatcher now so
  // any touch already due (touch 1 usually is) fires within seconds instead of
  // waiting up to 5 minutes for the next cron tick. Future touches are
  // untouched — they fire on their own nextDueAt.
  if (!opts?.skipDispatcherKick) {
    await ctx.scheduler.runAfter(0, internal.cadenceDispatcher.tick, {});
  }

  return { ok: true, patched };
}

// Batch package approval — the /outreach triage path. Each package still gets
// the full applyPackageApproval treatment (no-contact guard, stage write,
// outreachReadyAt backfill); a package that fails its guard is reported in the
// per-item results instead of aborting the batch. One dispatcher kick at the
// end covers every newly-approved due touch.
const PACKAGE_BATCH_CAP = 25;

export const approvePackageBatchInternal = internalMutation({
  args: {
    packageIds: v.array(v.string()),
    userId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    total: number;
    approved: number;
    results: Array<
      | { packageId: string; ok: true; patched: number }
      | { packageId: string; ok: false; error: string }
    >;
  }> => {
    if (args.packageIds.length > PACKAGE_BATCH_CAP) {
      throw new Error(
        `Batch too large: ${args.packageIds.length} > ${PACKAGE_BATCH_CAP}. Split into smaller batches.`,
      );
    }
    const results: Array<
      | { packageId: string; ok: true; patched: number }
      | { packageId: string; ok: false; error: string }
    > = [];
    let approved = 0;
    for (const packageId of args.packageIds) {
      try {
        const r = await applyPackageApproval(
          ctx,
          { packageId, userId: args.userId },
          { skipDispatcherKick: true },
        );
        results.push({ packageId, ok: true, patched: r.patched });
        approved++;
      } catch (err: any) {
        results.push({
          packageId,
          ok: false,
          error: err?.message ?? String(err),
        });
      }
    }
    if (approved > 0) {
      await ctx.scheduler.runAfter(0, internal.cadenceDispatcher.tick, {});
    }
    return { total: args.packageIds.length, approved, results };
  },
});

export const approvePackageInternal = internalMutation({
  args: {
    packageId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) =>
    applyPackageApproval(ctx, { packageId: args.packageId, userId: args.userId }),
});

// ── Hold / release a cadence for an in-flight intel run ──
// holdForIntelInternal pauses a cadence while intel is (re)gathered: deactivate
// it but PRESERVE nextDueAt so clearIntelHoldInternal can reactivate it in
// place. The intelHoldAt / intelHoldReason fields are the audit trail.

export const holdForIntelInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.cadenceId, {
      isActive: false,
      intelHoldAt: now,
      intelHoldReason: args.reason,
      updatedAt: now,
    });
    return { ok: true };
  },
});

// Reactivate a STALLED cadence — the operator-facing recovery for the three
// silent stall states the triage queue surfaces (intel hold, 3-strike
// auto-deactivation, pause). Deliberate stops are refused: a cancelled row
// (reply cancellation / operator cancel) or a denied package member is a
// decision, not a stall — those go back through their own flows.
export const reactivateInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    userId: v.id("users"),
    newNextDueAt: v.optional(v.string()), // ISO; reschedule on reactivation
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.cadenceId);
    if (!row) return { ok: false as const, error: "cadence_not_found" };
    if (row.cancelledReason) {
      return {
        ok: false as const,
        error: "cadence_cancelled",
        message: `Cancelled (${row.cancelledReason}) — a deliberate stop, not a stall. Create a fresh cadence if outreach should restart.`,
      };
    }
    if (row.packageApprovalStatus === "denied") {
      return {
        ok: false as const,
        error: "package_denied",
        message: "This package was denied by the operator; reactivation would bypass that decision.",
      };
    }
    if (row.packageApprovalStatus === "needs_contact") {
      return {
        ok: false as const,
        error: "needs_contact",
        message: "Held for a missing contact — attach one via cadence.setPackageContact instead.",
      };
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.cadenceId, {
      isActive: true,
      pauseUntil: undefined,
      intelHoldAt: undefined,
      intelHoldReason: undefined,
      consecutiveFailures: 0,
      ...(args.newNextDueAt ? { nextDueAt: args.newNextDueAt } : {}),
      editedByOperator: true,
      editedAt: now,
      editedBy: args.userId,
      updatedAt: now,
    });
    return {
      ok: true as const,
      cadenceId: args.cadenceId,
      nextDueAt: args.newNextDueAt ?? row.nextDueAt,
      clearedIntelHold: !!row.intelHoldAt,
      clearedFailures: (row.consecutiveFailures ?? 0) > 0,
    };
  },
});

export const clearIntelHoldInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cadenceId, {
      isActive: true,
      intelHoldAt: undefined,
      intelHoldReason: undefined,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
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

// Companion to linkExistingCadencesToClientInternal in prospects.ts —
// patches a single cadence to set relatedClientId, used when a clients
// row is manually promoted from a HubSpot company whose cadences pre-date
// the v1.2 promotion flow.
export const setRelatedClientForLinkInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cadenceId, {
      relatedClientId: args.clientId,
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
    // Route through the shared helper: no-contact guard, flip rows approved,
    // stage write (→ cold_outreach, forward_only), outreachReadyAt backfill,
    // immediate dispatcher kick.
    return applyPackageApproval(ctx, { packageId: args.packageId, userId });
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

// ── v1.2.1 frontend deferrals: per-touch operator editing + preset apply ──

// Update a single cadence's content (subject + body) and/or scheduled date.
// Sets the audit fields (editedByOperator / editedAt / editedBy) so the
// dispatcher knows the operator has touched this row — revision re-runs
// will respect editedByOperator and skip overwriting unless the operator's
// revision note specifically asks to redraft this touch.
export const update = mutation({
  args: {
    cadenceId: v.id("cadences"),
    preDraftedTouch: v.optional(v.object({
      subject: v.string(),
      bodyText: v.string(),
      bodyHtml: v.string(),
      dynamicVars: v.optional(v.any()),
    })),
    nextDueAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]?._id;
    if (!userId) throw new Error("No user available");

    const cadence = await ctx.db.get(args.cadenceId);
    if (!cadence) throw new Error("cadence_not_found");

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      editedByOperator: true,
      editedAt: now,
      editedBy: userId,
      updatedAt: now,
    };
    if (args.preDraftedTouch !== undefined) patch.preDraftedTouch = args.preDraftedTouch;
    if (args.nextDueAt !== undefined) patch.nextDueAt = args.nextDueAt;

    await ctx.db.patch(args.cadenceId, patch);
    return {
      ok: true,
      cadenceId: args.cadenceId,
      alreadyFired: !!cadence.lastFiredAt,
    };
  },
});

// Reassign the recipient for every UNFIRED touch in a package. Fired touches
// keep their original contactId — the past doesn't move (same rule as
// applyPresetSchedule). Attaching a contact to a held "needs_contact" draft
// re-activates it as a normal pending package member so approval can flow.
//
// Deliberately does NOT enforce the v1.2.4 email guard here: the operator may
// pick a contact with no email (LinkedIn-outreach path) — the dispatcher's
// fire-time guard still blocks the actual send, and the Outreach tab surfaces
// the no-email state prominently.
export const setPackageContact = mutation({
  args: {
    packageId: v.string(),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]?._id;
    if (!userId) throw new Error("No user available");

    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("contact_not_found");

    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    if (rows.length === 0) {
      return { ok: false as const, error: "package_not_found", packageId: args.packageId };
    }

    const now = new Date().toISOString();
    let patched = 0;
    let skippedFired = 0;
    for (const row of rows) {
      if (row.lastFiredAt) {
        skippedFired++;
        continue;
      }
      const patch: Record<string, unknown> = {
        contactId: args.contactId,
        editedByOperator: true,
        editedAt: now,
        editedBy: userId,
        updatedAt: now,
      };
      if (row.packageApprovalStatus === "needs_contact") {
        patch.packageApprovalStatus = "pending";
        patch.needsContact = false;
        patch.isActive = true;
      }
      await ctx.db.patch(row._id, patch);
      patched++;
    }

    return {
      ok: true as const,
      packageId: args.packageId,
      contactId: args.contactId,
      contactName: contact.name,
      patched,
      skippedFired,
    };
  },
});

// Apply a preset schedule (Light / Moderate / Aggressive) to all unfired
// cadences in a package. Touch 1's scheduled date stays as the anchor;
// Touches 2-4 are rescheduled relative to Touch 1's nextDueAt (or
// lastFiredAt if Touch 1 has already fired).
//
// Touches that have already fired are NEVER rescheduled — the past doesn't
// move. Operators expect "Apply Aggressive" to shorten FUTURE gaps, not
// retroactively change history.
//
// Preset offsets (days after Touch 1):
//   light:      T2 +10, T3 +25, T4 +60   (lower-pressure; rare follow-ups)
//   moderate:   T2 +5,  T3 +12, T4 +30   (default; matches SKILL.md cadence package spec)
//   aggressive: T2 +2,  T3 +5,  T4 +10   (tight chase; near-term opportunity)
//
// "Custom" is not handled here — operator edits per-touch via cadence.update.

const PRESET_OFFSETS: Record<string, number[]> = {
  light: [0, 10, 25, 60],
  moderate: [0, 5, 12, 30],
  aggressive: [0, 2, 5, 10],
};

export const applyPresetSchedule = mutation({
  args: {
    packageId: v.string(),
    preset: v.union(v.literal("light"), v.literal("moderate"), v.literal("aggressive")),
  },
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
    if (rows.length === 0) {
      return { ok: false as const, error: "package_not_found", packageId: args.packageId };
    }

    const sorted = [...rows].sort((a, b) => (a.packageOrder ?? 0) - (b.packageOrder ?? 0));
    const touch1 = sorted[0];
    const anchorIso = touch1.lastFiredAt ?? touch1.nextDueAt;
    if (!anchorIso) {
      return { ok: false as const, error: "touch_1_has_no_anchor_date" };
    }
    const anchorMs = new Date(anchorIso).getTime();
    const offsets = PRESET_OFFSETS[args.preset];
    const now = new Date().toISOString();

    let rescheduled = 0;
    let skippedFired = 0;
    for (const row of sorted) {
      const order = row.packageOrder ?? 0;
      if (order < 1 || order > 4) continue;
      if (row.lastFiredAt) {
        skippedFired++;
        continue;
      }
      const offsetDays = offsets[order - 1] ?? offsets[offsets.length - 1];
      const newDueMs = anchorMs + offsetDays * 24 * 60 * 60 * 1000;
      const newDueIso = new Date(newDueMs).toISOString();

      if (row.nextDueAt === newDueIso) continue;

      await ctx.db.patch(row._id, {
        nextDueAt: newDueIso,
        editedByOperator: true,
        editedAt: now,
        editedBy: userId,
        updatedAt: now,
      });
      rescheduled++;
    }

    return {
      ok: true as const,
      packageId: args.packageId,
      preset: args.preset,
      rescheduled,
      skippedFired,
      anchor: anchorIso,
    };
  },
});

// Internal applyPresetSchedule — MCP path (bearer auth → explicit userId).
// Same logic as applyPresetSchedule but takes userId instead of a Clerk session.
export const applyPresetScheduleInternal = internalMutation({
  args: {
    packageId: v.string(),
    preset: v.union(v.literal("light"), v.literal("moderate"), v.literal("aggressive")),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    if (rows.length === 0) {
      return { ok: false as const, error: "package_not_found", packageId: args.packageId };
    }

    const sorted = [...rows].sort((a, b) => (a.packageOrder ?? 0) - (b.packageOrder ?? 0));
    const touch1 = sorted[0];
    const anchorIso = touch1.lastFiredAt ?? touch1.nextDueAt;
    if (!anchorIso) {
      return { ok: false as const, error: "touch_1_has_no_anchor_date" };
    }
    const anchorMs = new Date(anchorIso).getTime();
    const offsets = PRESET_OFFSETS[args.preset];
    const now = new Date().toISOString();

    let rescheduled = 0;
    let skippedFired = 0;
    for (const row of sorted) {
      const order = row.packageOrder ?? 0;
      if (order < 1 || order > 4) continue;
      if (row.lastFiredAt) {
        skippedFired++;
        continue;
      }
      const offsetDays = offsets[order - 1] ?? offsets[offsets.length - 1];
      const newDueIso = new Date(anchorMs + offsetDays * 24 * 60 * 60 * 1000).toISOString();
      if (row.nextDueAt === newDueIso) continue;
      await ctx.db.patch(row._id, {
        nextDueAt: newDueIso,
        editedByOperator: true,
        editedAt: now,
        editedBy: args.userId,
        updatedAt: now,
      });
      rescheduled++;
    }

    return {
      ok: true as const,
      packageId: args.packageId,
      preset: args.preset,
      rescheduled,
      skippedFired,
      anchor: anchorIso,
    };
  },
});

// ── v1.3 Sprint D: cadence flexibility primitives ──
//
// Operator-driven pause / resume / snooze flows for in-flight cadences.
// All three patch the same underlying row; the dispatcher's pause check
// (cadenceDispatcher.ts checks pauseUntil before firing) does the rest.
//
// Pause: set pauseUntil. The dispatcher skips while pauseUntil > now.
// Resume: clear pauseUntil (set to undefined) OR set it to the past so
//   the next dispatcher tick fires.
// Snooze: push nextDueAt forward by N days. Useful when "we're waiting
//   for X" — different from pause because pause is a soft hold whereas
//   snooze is a hard reschedule.

export const pause = mutation({
  args: {
    cadenceId: v.id("cadences"),
    untilDate: v.optional(v.string()), // ISO; defaults to 14 days from now
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]?._id;
    if (!userId) throw new Error("No user available");

    const cadence = await ctx.db.get(args.cadenceId);
    if (!cadence) throw new Error("cadence_not_found");
    if (cadence.lastFiredAt) {
      return {
        ok: false as const,
        error: "cannot_pause_fired_cadence",
        message: "This cadence already fired; pausing has no effect. Use cadence.cancel to suppress future re-fires (rare) or leave it as-is.",
      };
    }

    const defaultUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const pauseUntil = args.untilDate ?? defaultUntil;
    const now = new Date().toISOString();

    await ctx.db.patch(args.cadenceId, {
      pauseUntil,
      editedByOperator: true,
      editedAt: now,
      editedBy: userId,
      updatedAt: now,
    });
    return { ok: true as const, cadenceId: args.cadenceId, pauseUntil };
  },
});

export const resume = mutation({
  args: {
    cadenceId: v.id("cadences"),
    newNextDueAt: v.optional(v.string()), // ISO; if supplied, also reschedule
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]?._id;
    if (!userId) throw new Error("No user available");

    const cadence = await ctx.db.get(args.cadenceId);
    if (!cadence) throw new Error("cadence_not_found");

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      pauseUntil: undefined,
      editedByOperator: true,
      editedAt: now,
      editedBy: userId,
      updatedAt: now,
    };
    if (args.newNextDueAt) patch.nextDueAt = args.newNextDueAt;

    await ctx.db.patch(args.cadenceId, patch);
    return {
      ok: true as const,
      cadenceId: args.cadenceId,
      nextDueAt: args.newNextDueAt ?? cadence.nextDueAt,
    };
  },
});

export const snooze = mutation({
  args: {
    cadenceId: v.id("cadences"),
    byDays: v.number(), // positive integer; 7 = push out by a week
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const users = await ctx.db.query("users").take(1);
    const userId = users[0]?._id;
    if (!userId) throw new Error("No user available");

    if (args.byDays <= 0) {
      return { ok: false as const, error: "invalid_byDays", message: "byDays must be positive" };
    }
    if (args.byDays > 365) {
      return { ok: false as const, error: "invalid_byDays", message: "byDays must be <= 365; use cadence.cancel for indefinite holds" };
    }

    const cadence = await ctx.db.get(args.cadenceId);
    if (!cadence) throw new Error("cadence_not_found");
    if (cadence.lastFiredAt) {
      return { ok: false as const, error: "cannot_snooze_fired_cadence" };
    }

    const currentDueMs = new Date(cadence.nextDueAt).getTime();
    const newDueIso = new Date(currentDueMs + args.byDays * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await ctx.db.patch(args.cadenceId, {
      nextDueAt: newDueIso,
      editedByOperator: true,
      editedAt: now,
      editedBy: userId,
      updatedAt: now,
    });
    return {
      ok: true as const,
      cadenceId: args.cadenceId,
      previousDueAt: cadence.nextDueAt,
      newDueAt: newDueIso,
      byDays: args.byDays,
    };
  },
});

// (cadences.getById already exists earlier in this file — used by
// /api/cadence-compose. The Sprint D cadence.get MCP tool wraps it
// without needing a second public query.)
