import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { makeFunctionReference } from "convex/server";

// String-built reference to this file's own executeApproval action.
// `ctx.scheduler.runAfter(0, internal.approvals.executeApproval, ...)` hits
// TS2589 (excessively deep type instantiation): the runAfter generic has to
// resolve the full generated api type from inside the module that circularly
// feeds it. A string reference bypasses the generated type entirely.
const executeApprovalRef = makeFunctionReference<"action", { approvalId: Id<"approvals"> }>(
  "approvals:executeApproval",
);
// Same TS2589 workaround for executeApproval's own self-file calls.
const getApprovalForExecutionRef = makeFunctionReference<"query", { approvalId: Id<"approvals"> }>(
  "approvals:getApprovalForExecution",
);
const markExecutedRef = makeFunctionReference<"mutation", { approvalId: Id<"approvals">; result?: any }>(
  "approvals:markExecuted",
);
const markExecutionFailedRef = makeFunctionReference<"mutation", { approvalId: Id<"approvals">; error: string }>(
  "approvals:markExecutionFailed",
);
// ...and for the dispatcher's per-entityType executors: once typeof internal
// is poisoned by the circularity above, every use in this file hits TS2589,
// cross-file references included.
const executeApprovedSendRef = makeFunctionReference<"action", { approvalId: Id<"approvals"> }>(
  "gmailSend:executeApprovedSend",
);
const recordPublishedDocsRef = makeFunctionReference<"mutation", { approvalId: Id<"approvals"> }>(
  "documentPublish:recordPublishedDocs",
);
const executeClientCommunicationRef = makeFunctionReference<"action", { approvalId: Id<"approvals"> }>(
  "gmailSend:executeClientCommunication",
);
const executeLenderOutreachRef = makeFunctionReference<"action", { approvalId: Id<"approvals"> }>(
  "gmailSend:executeLenderOutreach",
);
const executeDriveWriteRef = makeFunctionReference<"action", { approvalId: Id<"approvals"> }>(
  "driveWriteback:execute",
);
import { getAuthenticatedUserOrNull } from "./authHelpers";

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
  v.literal("drive_write"),
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
    // Tolerate the cold-load pre-auth window (Clerk token not yet at
    // Convex): return an empty default instead of crashing useQuery callers.
    if (!(await getAuthenticatedUserOrNull(ctx))) return [];
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

// Badge counts saturate at this cap rather than walking the whole status
// partition — approval rows carry full draft bodies, and an unbounded
// .collect() over a re-accumulated backlog is how countUnrouted blew the
// 16MB read limit in production (spec-3 F5).
const COUNT_CAP = 200;

async function countByStatus(ctx: any, status: string): Promise<number> {
  const rows = await ctx.db
    .query("approvals")
    .withIndex("by_status", (q: any) => q.eq("status", status))
    .take(COUNT_CAP);
  return rows.length;
}

export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    // Tolerate the cold-load pre-auth window (Clerk token not yet at
    // Convex): return an empty default instead of crashing useQuery callers.
    if (!(await getAuthenticatedUserOrNull(ctx))) {
      return { pending: 0, executionFailed: 0, expired: 0 };
    }
    return {
      pending: await countByStatus(ctx, "pending"),
      executionFailed: await countByStatus(ctx, "execution_failed"),
      expired: await countByStatus(ctx, "expired"),
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
    // Single-gate model: when the operator has ALREADY approved this exact
    // content upstream (a cadence package's "Approve & Schedule" covers the
    // subject/body/recipient of every touch), creating a second pending
    // gate here just parks the send invisibly at /approvals. autoApprove
    // inserts the row pre-approved (audit trail intact: approvedBy =
    // requester, requestSourceName says who authorised) and schedules the
    // executor immediately. The gmail kill-switches are still enforced at
    // execute time, so this never bypasses /settings/gmail.
    autoApprove: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const approvalId = await ctx.db.insert("approvals", {
      entityType: args.entityType,
      summary: args.summary,
      draftPayload: args.draftPayload,
      entityRefId: args.entityRefId,
      status: args.autoApprove ? "approved" : "pending",
      requestedBy: args.requestedBy,
      requestedAt: now,
      requestSource: args.requestSource,
      requestSourceName: args.requestSourceName,
      relatedClientId: args.relatedClientId,
      relatedProjectId: args.relatedProjectId,
      relatedContactId: args.relatedContactId,
      relatedCadenceId: args.relatedCadenceId,
      relatedReplyEventId: args.relatedReplyEventId,
      relatedSkillRunId: args.relatedSkillRunId,
      expiresAt: args.expiresAt,
      ...(args.autoApprove
        ? { approvedBy: args.requestedBy, approvedAt: now }
        : {}),
    });
    if (args.autoApprove) {
      await ctx.scheduler.runAfter(0, executeApprovalRef, { approvalId });
    }
    return approvalId;
  },
});

// ── v1.3 — public queries for the prospect-detail Overview + Claude Code ──

// Global pending queue (2026-07-17) — EVERYTHING waiting for an operator,
// any entity type, any client, newest first. The chat-first approval flow's
// session-opening read: without it an agent could only see pending work
// per-client (listPendingByClient) or outreach-scoped (triageQueue), so
// "what's waiting for me?" had no answer. Trimmed rows + client names; the
// full draftPayload stays behind approval.get.
export const listPendingInternal = internalQuery({
  args: { entityType: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .filter((q) =>
        args.entityType ? q.eq(q.field("entityType"), args.entityType) : q.eq(q.field("status"), "pending"),
      )
      .take(limit);
    const clientNames = new Map<string, string | null>();
    const out = [];
    for (const r of rows) {
      let clientName: string | null = null;
      if (r.relatedClientId) {
        const key = String(r.relatedClientId);
        if (!clientNames.has(key)) {
          const c: any = await ctx.db.get(r.relatedClientId);
          clientNames.set(key, c?.name ?? c?.companyName ?? null);
        }
        clientName = clientNames.get(key) ?? null;
      }
      out.push({
        approvalId: r._id,
        entityType: r.entityType,
        summary: r.summary,
        requestedAt: r.requestedAt,
        requestSourceName: r.requestSourceName,
        relatedClientId: r.relatedClientId,
        clientName,
        relatedProjectId: r.relatedProjectId,
        expiresAt: r.expiresAt,
      });
    }
    return out;
  },
});

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
  // Explicit return annotation breaks the TS2589 inference cycle: this
  // handler references internal.approvals.* from inside approvals.ts, so
  // inferring its return type would require resolving this file's own
  // export types circularly.
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
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
    await ctx.scheduler.runAfter(0, executeApprovalRef, {
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

// Internal approve — MCP path. The public `approve` derives the actor from a
// Clerk session; the MCP server authenticates by bearer token and passes the
// resolved userId explicitly. Same effect: flip to approved + schedule the
// executor that actually performs the action (Gmail send, document publish, …).
export const approveInternal = internalMutation({
  args: {
    approvalId: v.id("approvals"),
    actorUserId: v.id("users"),
  },
  // Return annotation: same TS2589 cycle-break as `approve`.
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "pending") {
      return { ok: false, reason: `not_pending_${approval.status}` };
    }
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      approvedBy: args.actorUserId,
      approvedAt: new Date().toISOString(),
    });
    await ctx.scheduler.runAfter(0, executeApprovalRef, {
      approvalId: args.approvalId,
    });
    return { ok: true };
  },
});

// Batch approve — the /outreach triage path. One operator "yes" covers a
// reviewed batch (each item was itemised to the operator first — recipient,
// subject, touch — batch approval is a convenience, not a blind bulk flip).
// Per-item no-op-safe: a row that is missing or no longer pending is reported
// in `skipped`, never thrown, so one stale id doesn't abort the batch. Each
// approved row schedules its own executor, same as approveInternal.
const APPROVE_BATCH_CAP = 50;

export const approveBatchInternal = internalMutation({
  args: {
    approvalIds: v.array(v.id("approvals")),
    actorUserId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    total: number;
    approved: number;
    skipped: Array<{ approvalId: string; reason: string }>;
  }> => {
    if (args.approvalIds.length > APPROVE_BATCH_CAP) {
      throw new Error(
        `Batch too large: ${args.approvalIds.length} > ${APPROVE_BATCH_CAP}. Split into smaller batches.`,
      );
    }
    const now = new Date().toISOString();
    const skipped: Array<{ approvalId: string; reason: string }> = [];
    let approved = 0;
    for (const approvalId of args.approvalIds) {
      const approval = await ctx.db.get(approvalId);
      if (!approval) {
        skipped.push({ approvalId: String(approvalId), reason: "not_found" });
        continue;
      }
      if (approval.status !== "pending") {
        skipped.push({
          approvalId: String(approvalId),
          reason: `not_pending_${approval.status}`,
        });
        continue;
      }
      await ctx.db.patch(approvalId, {
        status: "approved",
        approvedBy: args.actorUserId,
        approvedAt: now,
      });
      await ctx.scheduler.runAfter(0, executeApprovalRef, { approvalId });
      approved++;
    }
    return { total: args.approvalIds.length, approved, skipped };
  },
});

// Internal reject — for system flows (a denied/parked cadence package clearing
// its staged gmail_send approvals, or operator-driven cleanup) that have no
// auth session. Idempotent: only acts on pending rows.
export const rejectInternal = internalMutation({
  args: {
    approvalId: v.id("approvals"),
    reason: v.optional(v.string()),
    actorUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "pending") {
      return { ok: false, reason: `not_pending_${approval.status}` };
    }
    await ctx.db.patch(args.approvalId, {
      status: "rejected",
      approvedBy: args.actorUserId,
      approvedAt: new Date().toISOString(),
      rejectedReason: args.reason ?? "system_rejected",
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

// Retry a send that failed at execution time (a kill switch was off, the
// Gmail token needed reconnect, a transient network error, …). The operator
// already approved this exact action, so re-queue it rather than forcing a
// re-draft. Only acts on execution_failed rows: clears the prior error, flips
// back to approved, and re-schedules the same executor the approve path uses.
export const retry = mutation({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const user = await getAuthenticatedUser(ctx);
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "execution_failed") {
      throw new Error(
        `Can only retry a failed approval (this one is ${approval.status})`,
      );
    }
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      approvedBy: user._id,
      approvedAt: new Date().toISOString(),
      // Clear the stale failure record so the row reads cleanly if it fails
      // again. Setting an optional field to undefined removes it in Convex.
      executionError: undefined,
      executedAt: undefined,
    });
    await ctx.scheduler.runAfter(0, executeApprovalRef, {
      approvalId: args.approvalId,
    });
    return { ok: true };
  },
});

// Batch reject — the backlog-reset counterpart of approveBatchInternal.
// Discards up to 50 pending drafts in one call (nothing fires). Per-item
// no-op-safe: missing / non-pending rows land in `skipped`.
export const rejectBatchInternal = internalMutation({
  args: {
    approvalIds: v.array(v.id("approvals")),
    reason: v.optional(v.string()),
    actorUserId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    total: number;
    rejected: number;
    skipped: Array<{ approvalId: string; reason: string }>;
  }> => {
    if (args.approvalIds.length > APPROVE_BATCH_CAP) {
      throw new Error(
        `Batch too large: ${args.approvalIds.length} > ${APPROVE_BATCH_CAP}. Split into smaller batches.`,
      );
    }
    const now = new Date().toISOString();
    const skipped: Array<{ approvalId: string; reason: string }> = [];
    let rejected = 0;
    for (const approvalId of args.approvalIds) {
      const approval = await ctx.db.get(approvalId);
      if (!approval) {
        skipped.push({ approvalId: String(approvalId), reason: "not_found" });
        continue;
      }
      if (approval.status !== "pending") {
        skipped.push({
          approvalId: String(approvalId),
          reason: `not_pending_${approval.status}`,
        });
        continue;
      }
      await ctx.db.patch(approvalId, {
        status: "rejected",
        approvedBy: args.actorUserId,
        approvedAt: now,
        rejectedReason: args.reason ?? "operator_batch_reject",
      });
      rejected++;
    }
    return { total: args.approvalIds.length, rejected, skipped };
  },
});

// Internal retry — MCP path (mirrors `retry` above with an explicit actor).
// Re-queues an execution_failed approval: the operator already approved this
// exact content, so clear the failure record, flip back to approved, and
// re-schedule the same executor. No-op-safe on non-failed rows.
export const retryInternal = internalMutation({
  args: {
    approvalId: v.id("approvals"),
    actorUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) return { ok: false, reason: "not_found" };
    if (approval.status !== "execution_failed") {
      return { ok: false, reason: `not_failed_${approval.status}` };
    }
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      approvedBy: args.actorUserId,
      approvedAt: new Date().toISOString(),
      executionError: undefined,
      executedAt: undefined,
    });
    await ctx.scheduler.runAfter(0, executeApprovalRef, {
      approvalId: args.approvalId,
    });
    return { ok: true };
  },
});

// ── Expiry sweep (spec-3 F6, nightly cron) ───────────────────
//
// Pending approvals used to live forever: "expired" + expiresAt existed in
// the schema with zero enforcement, and the queue re-accumulated stale rows
// (227 bulk-rejected 2026-06-06). Nightly, mark pending rows past their
// expiresAt — or past a 14-day default from requestedAt when unset — as
// expired. Bounded take: expired rows leave "pending", so a backlog larger
// than one batch drains across consecutive runs.
const DEFAULT_APPROVAL_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const expireStale = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ scanned: number; expired: number }> => {
    const now = Date.now();
    const pending = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .take(500);
    let expired = 0;
    for (const row of pending) {
      const deadline = row.expiresAt
        ? new Date(row.expiresAt).getTime()
        : new Date(row.requestedAt).getTime() + DEFAULT_APPROVAL_TTL_MS;
      if (Number.isFinite(deadline) && deadline < now) {
        await ctx.db.patch(row._id, { status: "expired" });
        expired++;
      }
    }
    return { scanned: pending.length, expired };
  },
});

// ── W0-F1 audit (2026-07-07) ─────────────────────────────────
//
// Before the email_fresh executor was wired, approved fresh-outreach
// approvals fell through client_communication's stub branch and were
// marked "executed" WITHOUT any mail leaving (spec-3 F1). These two
// functions let the operator audit that history and selectively re-send.
// Run from the Convex dashboard / CLI:
//   npx convex run approvals:listStubbedEmailFresh
//   npx convex run approvals:resendStubbedEmailFresh '{"approvalId": "..."}'

export const listStubbedEmailFresh = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", "executed"))
      .order("desc")
      .take(args.limit ?? 500);
    return rows
      .filter((r) => {
        const p: any = r.draftPayload;
        return (
          r.entityType === "client_communication" &&
          p?.kind === "email_fresh" &&
          (r.executionResult as any)?.stub === true
        );
      })
      .map((r) => ({
        approvalId: r._id,
        summary: r.summary,
        subject: (r.draftPayload as any)?.subject,
        requestedAt: r.requestedAt,
        executedAt: r.executedAt,
        relatedClientId: r.relatedClientId,
        relatedContactId: r.relatedContactId,
      }));
  },
});

// Re-queue one stub-executed email_fresh approval for a REAL send. The
// operator already approved this exact content; "executed" was recorded
// without a send. Same re-queue shape as retry, gated to exactly the rows
// the audit above surfaces. The kill switches still gate at execute time,
// and staleness is the operator's call — they review the audit list first.
export const resendStubbedEmailFresh = internalMutation({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    const p: any = approval.draftPayload;
    if (
      approval.status !== "executed" ||
      approval.entityType !== "client_communication" ||
      p?.kind !== "email_fresh" ||
      (approval.executionResult as any)?.stub !== true
    ) {
      throw new Error("Not a stub-executed email_fresh approval");
    }
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      executionResult: undefined,
      executedAt: undefined,
    });
    await ctx.scheduler.runAfter(0, executeApprovalRef, {
      approvalId: args.approvalId,
    });
    return { ok: true };
  },
});

// ── Inline draft editing ─────────────────────────────────────
//
// Generic partial patch of a pending approval's draftPayload. The operator
// tweaks subject/body/recipient inline before approving (the InlineDraftEditor
// surface). draftPayload is v.any() and may be EITHER a gmail_send shape
// ({ subject, bodyText, bodyHtml, to, ... }) OR a client_communication /
// email_reply shape ({ kind: "email_reply", subject, bodyText, bodyHtml, ... }).
// We patch only the keys provided, in place, preserving every other key.

// Shared core: applies the partial patch + stamps the editor. The actor is
// already resolved by the caller (public path = Clerk session, internal path =
// passed-in userId).
async function applyDraftEdit(
  ctx: any,
  args: {
    approvalId: Id<"approvals">;
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    to?: string[];
    editedBy: Id<"users">;
  },
): Promise<{ ok: boolean; approvalId: Id<"approvals"> }> {
  const approval = await ctx.db.get(args.approvalId);
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "pending") {
    throw new Error(`Cannot edit the draft of an approval that is ${approval.status}`);
  }
  const current: any =
    approval.draftPayload && typeof approval.draftPayload === "object" && !Array.isArray(approval.draftPayload)
      ? approval.draftPayload
      : {};
  const next: any = { ...current };
  if (args.subject !== undefined) next.subject = args.subject;
  if (args.bodyText !== undefined) next.bodyText = args.bodyText;
  if (args.bodyHtml !== undefined) next.bodyHtml = args.bodyHtml;
  if (args.to !== undefined) next.to = args.to;
  await ctx.db.patch(args.approvalId, {
    draftPayload: next,
    draftEditedAt: new Date().toISOString(),
    draftEditedBy: args.editedBy,
    // Phase 2 metrics/learning: preserve the as-drafted payload on the FIRST
    // edit so triage can diff exactly what the operator changed vs. the
    // template. Subsequent edits keep the original original.
    ...(approval.originalDraftPayload === undefined
      ? { originalDraftPayload: approval.draftPayload }
      : {}),
  });
  return { ok: true, approvalId: args.approvalId };
}

export const updateDraft = mutation({
  args: {
    approvalId: v.id("approvals"),
    subject: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    to: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; approvalId: Id<"approvals"> }> => {
    const user = await getAuthenticatedUser(ctx);
    return applyDraftEdit(ctx, { ...args, editedBy: user._id });
  },
});

// Internal variant — MCP / system path. The actor is resolved by the caller
// and passed in explicitly (mirrors approveInternal / internalCreate).
export const updateDraftInternal = internalMutation({
  args: {
    approvalId: v.id("approvals"),
    subject: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    to: v.optional(v.array(v.string())),
    actorUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; approvalId: Id<"approvals"> }> => {
    const { actorUserId, ...rest } = args;
    return applyDraftEdit(ctx, { ...rest, editedBy: actorUserId });
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
      getApprovalForExecutionRef,
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
          result = await ctx.runAction(executeApprovedSendRef, {
            approvalId: args.approvalId,
          });
          break;
        case "document_publish":
          result = await ctx.runMutation(recordPublishedDocsRef, {
            approvalId: args.approvalId,
          });
          break;
        case "client_communication": {
          // client_communication covers drafted email replies
          // (kind === "email_reply", from outreach.draftReply / the web
          // inbox composer), fresh operator-initiated outreach
          // (kind === "email_fresh", from outreach.draftFreshEmail) AND
          // non-sendable operator-review markers (the reply router's
          // createOperatorReviewApproval). The first two send; the marker
          // just advances the lifecycle.
          const p: any = approval.draftPayload;
          if (p && (p.kind === "email_reply" || p.kind === "email_fresh")) {
            result = await ctx.runAction(executeClientCommunicationRef, {
              approvalId: args.approvalId,
            });
          } else {
            result = { stub: true, note: "client_communication (non-email) — no send" };
          }
          break;
        }
        case "lender_outreach":
          // Same send core as the reply path, plus attachment support
          // (attachedDocumentIds → multipart/mixed). Recipient resolves from
          // the related BDM contact. The entityType stays distinct only so the
          // approvals UI can apply lender-specific review gates.
          result = await ctx.runAction(executeLenderOutreachRef, {
            approvalId: args.approvalId,
          });
          break;
        case "drive_write":
          // Drive write-back (create folder / move file / rename / upload
          // email attachment) — the ONLY class of writes the app makes to
          // Drive; existing file contents are never edited.
          // The executor re-checks the driveWriteConfig kill switch at
          // fire time (defense-in-depth, mirrors the gmail_send pattern)
          // and echoes the result into the mirror on success.
          result = await ctx.runAction(executeDriveWriteRef, {
            approvalId: args.approvalId,
          });
          break;
        // Other entity types register here. The rest mark executed with no
        // payload so the lifecycle still advances.
        case "hubspot_write":
        case "skill_action":
        case "cadence_fire":
        case "other":
          result = { stub: true, note: `Executor for ${approval.entityType} not yet wired` };
          break;
        default:
          throw new Error(`No executor for entityType=${approval.entityType}`);
      }
      await ctx.runMutation(markExecutedRef, {
        approvalId: args.approvalId,
        result,
      });
      return { ok: true };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      await ctx.runMutation(markExecutionFailedRef, {
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

// One-off migration (2026-06-05): the cadence dispatcher staged
// draftPayload.to as a bare string before the array-shape fix; both the
// approvals UI (`to.join`) and the send executor (`to.map`) expect
// string[]. Normalizes to/cc/bcc on every approval row. Idempotent —
// safe to re-run; kept around in case another producer regresses.
export const normalizeDraftPayloadRecipients = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("approvals").collect();
    let patched = 0;
    for (const row of rows) {
      const p: any = row.draftPayload;
      if (!p || typeof p !== "object" || Array.isArray(p)) continue;
      const next: any = { ...p };
      let changed = false;
      for (const k of ["to", "cc", "bcc"]) {
        if (typeof next[k] === "string") {
          next[k] = [next[k]];
          changed = true;
        }
      }
      if (changed) {
        await ctx.db.patch(row._id, { draftPayload: next });
        patched++;
      }
    }
    return { scanned: rows.length, patched };
  },
});
