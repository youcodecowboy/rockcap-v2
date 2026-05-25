import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Approvals (BL-1.9 surface, BL-5.7 queries + dispatch).
// Cross-cutting staged-draft layer. Every output that leaves the building
// (Gmail send, HubSpot write, lender outreach, IC paper publish, etc.)
// originated by a skill or background job lands here as a pending row.
// A human reviews; on approval, a per-entityType executor runs as an
// internal action and writes back the result.
//
// Authorisation model (v1, simplified):
//   - Any authenticated user can approve, reject, or list approvals.
//   - Only the requestedBy user can cancel their own pending approval.
//   - TODO: layer in role-based controls (e.g., only senior team can
//     approve gmail_send for closed-won deals over a threshold).

// ── Auth helper ──────────────────────────────────────────────
async function getAuthenticatedUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return user;
}

// ── Validators reused across signatures ──────────────────────

const ENTITY_TYPE = v.union(
  v.literal("gmail_send"),
  v.literal("hubspot_write"),
  v.literal("document_publish"),
  v.literal("lender_outreach"),
  v.literal("client_communication"),
  v.literal("skill_action"),
  v.literal("cadence_fire"),
  v.literal("other"),
);

const REQUEST_SOURCE = v.union(
  v.literal("skill"),
  v.literal("background_job"),
  v.literal("cadence"),
  v.literal("manual"),
);

const STATUS_FILTER = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("expired"),
  v.literal("executed"),
  v.literal("execution_failed"),
  v.literal("cancelled"),
  v.literal("all"),
);

// ── Public queries ───────────────────────────────────────────

export const listPending = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    const limit = args.limit ?? 100;
    return ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .order("desc")
      .take(limit);
  },
});

export const listMine = query({
  args: {
    status: v.optional(STATUS_FILTER),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const limit = args.limit ?? 100;
    const status = args.status ?? "pending";
    if (status === "all") {
      return ctx.db
        .query("approvals")
        .withIndex("by_requested_by", (q: any) => q.eq("requestedBy", user._id))
        .order("desc")
        .take(limit);
    }
    return ctx.db
      .query("approvals")
      .withIndex("by_status_requested_by", (q: any) =>
        q.eq("status", status).eq("requestedBy", user._id),
      )
      .order("desc")
      .take(limit);
  },
});

export const listAll = query({
  args: {
    status: v.optional(STATUS_FILTER),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    const limit = args.limit ?? 100;
    const status = args.status ?? "pending";
    if (status === "all") {
      return ctx.db.query("approvals").order("desc").take(limit);
    }
    return ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", status))
      .order("desc")
      .take(limit);
  },
});

export const get = query({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    return ctx.db.get(args.approvalId);
  },
});

export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    await getAuthenticatedUser(ctx);
    // Cheap counts via index walks. For larger volumes this would
    // become a separate denormalised counter; today the volume is zero.
    const pending = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .collect();
    const failed = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", "execution_failed"))
      .collect();
    return {
      pending: pending.length,
      executionFailed: failed.length,
    };
  },
});

// ── Public create (manual approval requests from operator) ───
//
// Skills and background jobs use entity-specific wrappers (e.g.,
// gmailSend.requestSend) that internalCreate beneath. This manual path
// is for ad-hoc operator submissions, primarily for testing the queue.

export const create = mutation({
  args: {
    entityType: ENTITY_TYPE,
    summary: v.string(),
    draftPayload: v.any(),
    entityRefId: v.optional(v.string()),
    requestSource: v.optional(REQUEST_SOURCE),
    requestSourceName: v.optional(v.string()),
    relatedClientId: v.optional(v.id("clients")),
    relatedProjectId: v.optional(v.id("projects")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedCadenceId: v.optional(v.id("cadences")),
    relatedReplyEventId: v.optional(v.id("replyEvents")),
    relatedSkillRunId: v.optional(v.id("skillRuns")),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    return ctx.db.insert("approvals", {
      entityType: args.entityType,
      summary: args.summary,
      draftPayload: args.draftPayload,
      entityRefId: args.entityRefId,
      status: "pending",
      requestedBy: user._id,
      requestedAt: new Date().toISOString(),
      requestSource: args.requestSource ?? "manual",
      requestSourceName: args.requestSourceName,
      relatedClientId: args.relatedClientId,
      relatedProjectId: args.relatedProjectId,
      relatedContactId: args.relatedContactId,
      relatedCadenceId: args.relatedCadenceId,
      relatedReplyEventId: args.relatedReplyEventId,
      relatedSkillRunId: args.relatedSkillRunId,
      expiresAt: args.expiresAt,
    });
  },
});

// Internal variant: skill / send-wrapper / cadence-fire callers use this.
// requestedBy is passed in (caller already resolved it).
export const internalCreate = internalMutation({
  args: {
    entityType: ENTITY_TYPE,
    summary: v.string(),
    draftPayload: v.any(),
    entityRefId: v.optional(v.string()),
    requestedBy: v.id("users"),
    requestSource: REQUEST_SOURCE,
    requestSourceName: v.optional(v.string()),
    relatedClientId: v.optional(v.id("clients")),
    relatedProjectId: v.optional(v.id("projects")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedCadenceId: v.optional(v.id("cadences")),
    relatedReplyEventId: v.optional(v.id("replyEvents")),
    relatedSkillRunId: v.optional(v.id("skillRuns")),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("approvals", {
      entityType: args.entityType,
      summary: args.summary,
      draftPayload: args.draftPayload,
      entityRefId: args.entityRefId,
      status: "pending",
      requestedBy: args.requestedBy,
      requestedAt: new Date().toISOString(),
      requestSource: args.requestSource,
      requestSourceName: args.requestSourceName,
      relatedClientId: args.relatedClientId,
      relatedProjectId: args.relatedProjectId,
      relatedContactId: args.relatedContactId,
      relatedCadenceId: args.relatedCadenceId,
      relatedReplyEventId: args.relatedReplyEventId,
      relatedSkillRunId: args.relatedSkillRunId,
      expiresAt: args.expiresAt,
    });
  },
});

// ── v1.3 — public queries for the prospect-detail Overview + Claude Code ──

// List pending approvals related to a client. Used by the Overview's
// "Pending approvals" card AND by Claude Code when checking the status
// of a drafted reply.
export const listPendingByClient = query({
  args: { clientId: v.id("clients"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_related_client", (q) => q.eq("relatedClientId", args.clientId))
      .order("desc")
      .take(args.limit ?? 20);
    return rows.filter((r) => r.status === "pending");
  },
});

// List approvals related to a specific reply event (typically one — the
// qualify-and-draft or meeting-prep-respond output).
export const listByReplyEvent = query({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_related_reply_event", (q) => q.eq("relatedReplyEventId", args.replyEventId))
      .collect();
    return rows;
  },
});

// ── State transitions ────────────────────────────────────────

export const approve = mutation({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "pending") {
      throw new Error(`Cannot approve an approval that is ${approval.status}`);
    }
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      approvedBy: user._id,
      approvedAt: new Date().toISOString(),
    });
    // Dispatch the executor. Using scheduler.runAfter(0, ...) decouples
    // the mutation transaction from the action call (mutations cannot
    // call actions inline).
    await ctx.scheduler.runAfter(0, internal.approvals.executeApproval, {
      approvalId: args.approvalId,
    });
    return { ok: true };
  },
});

export const reject = mutation({
  args: {
    approvalId: v.id("approvals"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "pending") {
      throw new Error(`Cannot reject an approval that is ${approval.status}`);
    }
    await ctx.db.patch(args.approvalId, {
      status: "rejected",
      approvedBy: user._id,
      approvedAt: new Date().toISOString(),
      rejectedReason: args.reason,
    });
    return { ok: true };
  },
});

export const cancel = mutation({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.requestedBy !== user._id) {
      throw new Error("Only the requester can cancel their own approval");
    }
    if (approval.status !== "pending") {
      throw new Error(`Cannot cancel an approval that is ${approval.status}`);
    }
    await ctx.db.patch(args.approvalId, { status: "cancelled" });
    return { ok: true };
  },
});

// ── Internal: executor dispatch ──────────────────────────────

export const getApprovalForExecution = internalQuery({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.approvalId);
  },
});

export const markExecuted = internalMutation({
  args: {
    approvalId: v.id("approvals"),
    result: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.approvalId, {
      status: "executed",
      executedAt: new Date().toISOString(),
      executionResult: args.result,
    });
  },
});

export const markExecutionFailed = internalMutation({
  args: {
    approvalId: v.id("approvals"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.approvalId, {
      status: "execution_failed",
      executedAt: new Date().toISOString(),
      executionError: args.error,
    });
  },
});

// The dispatcher. Reads an approved approval, hands off to the
// per-entityType executor. New entityTypes register their executor
// by adding a case here.
export const executeApproval = internalAction({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const approval: any = await ctx.runQuery(
      internal.approvals.getApprovalForExecution,
      { approvalId: args.approvalId },
    );
    if (!approval) {
      return { ok: false, reason: "approval_not_found" };
    }
    if (approval.status !== "approved") {
      // Already executed or cancelled in a race.
      return { ok: false, reason: `unexpected_status_${approval.status}` };
    }

    try {
      let result: unknown;
      switch (approval.entityType) {
        case "gmail_send":
          result = await ctx.runAction(internal.gmailSend.executeApprovedSend, {
            approvalId: args.approvalId,
          });
          break;
        // Other entity types register here. For v1, only gmail_send has
        // a real executor; the rest mark executed with no payload so
        // the lifecycle still advances.
        case "hubspot_write":
        case "document_publish":
        case "lender_outreach":
        case "client_communication":
        case "skill_action":
        case "cadence_fire":
        case "other":
          result = { stub: true, note: `Executor for ${approval.entityType} not yet wired` };
          break;
        default:
          throw new Error(`No executor for entityType=${approval.entityType}`);
      }
      await ctx.runMutation(internal.approvals.markExecuted, {
        approvalId: args.approvalId,
        result,
      });
      return { ok: true };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      await ctx.runMutation(internal.approvals.markExecutionFailed, {
        approvalId: args.approvalId,
        error: message,
      });
      // Rethrowing causes the action runtime to log the failure; the
      // mark above is the source of truth for UI display.
      throw err;
    }
  },
});

// v1.2: skill-side read of an approval row. Closes the gap from v1.1
// where approvals queries gate on Clerk auth and skills couldn't audit
// the rows they created.
export const getInternal = internalQuery({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.approvalId);
  },
});
