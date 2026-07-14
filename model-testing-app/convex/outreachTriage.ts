import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isCadenceFireable } from "./lib/cadenceGating";

// Outreach triage read-model (2026-07-14).
//
// ONE cross-prospect answer to "what needs the operator's attention and what
// will the machine do next?". Before this module the actionable state was
// scattered: pending cadence packages live on cadence rows, staged/failed
// sends in approvals, unrouted replies in replyEvents, and the silent stall
// states (intel hold, needs_contact, 3-strike auto-deactivation, pause) had
// NO reader at all — a cadence could die invisibly.
//
// Two queries:
//   triageQueue  — every open action, grouped by kind. Powers the
//                  outreach.triageQueue MCP tool (the /outreach skill's first
//                  call), the session-start digest route, and (later) the web
//                  action queue.
//   listUpcoming — the outbox: every touch scheduled in the next N days with
//                  an honest per-touch fire-status (will it actually send, or
//                  is it gated/paused/blocked?).
//
// Both are public (no Clerk gate) on the listPendingByClient precedent: the
// MCP server and the digest route call them via ConvexHttpClient without a
// user session. They return TRIMMED rows (no email bodies, no preDraftedTouch
// HTML) — countUnrouted once blew the 16MB read limit on full bodies; every
// section here is capped and body-free. Full detail is one follow-up call
// away (approval.get / reply.get / cadence.get).

// Per-section caps. Triage is a most-recent-first surface; a section that
// hits its cap reports `capped: true` so the consumer renders "50+".
const PACKAGE_ROW_CAP = 200;      // cadence rows scanned per approval-status bucket
const APPROVAL_CAP = 150;
const FAILED_SEND_CAP = 50;
const REPLY_CAP = 50;
const DEAD_END_CAP = 25;          // per dead-end bucket
const STALL_SCAN_CAP = 250;       // inactive/active cadence rows scanned for stalls
const CLIENT_FLAG_CAP = 100;

// ── Shared enrichment: client + contact lookups with per-call caches ──

type ClientLite = {
  clientId: string;
  name: string | null;
  pipelineStage: string | null;
} | null;

async function getClientLite(
  ctx: any,
  cache: Map<string, ClientLite>,
  id: Id<"clients"> | undefined | null,
): Promise<ClientLite> {
  if (!id) return null;
  const key = String(id);
  if (cache.has(key)) return cache.get(key)!;
  const doc: any = await ctx.db.get(id);
  const lite: ClientLite = doc
    ? {
        clientId: key,
        name: doc.name ?? doc.companyName ?? null,
        pipelineStage: doc.pipelineStage ?? null,
      }
    : null;
  cache.set(key, lite);
  return lite;
}

type ContactLite = { contactId: string; name: string | null; hasEmail: boolean } | null;

async function getContactLite(
  ctx: any,
  cache: Map<string, ContactLite>,
  id: Id<"contacts"> | undefined | null,
): Promise<ContactLite> {
  if (!id) return null;
  const key = String(id);
  if (cache.has(key)) return cache.get(key)!;
  const doc: any = await ctx.db.get(id);
  const lite: ContactLite = doc
    ? { contactId: key, name: doc.name ?? null, hasEmail: !!doc.email }
    : null;
  cache.set(key, lite);
  return lite;
}

function snippet(text: unknown, n = 140): string | null {
  if (typeof text !== "string" || !text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat ? flat.slice(0, n) : null;
}

// Group raw cadence rows sharing a packageId into one reviewable line.
// Solo rows (no packageId) get a synthetic `cadence:<id>` key.
function groupPackages(rows: any[]): Map<string, any[]> {
  const byPackage = new Map<string, any[]>();
  for (const row of rows) {
    const key = row.packageId ? String(row.packageId) : `cadence:${String(row._id)}`;
    const arr = byPackage.get(key) ?? [];
    arr.push(row);
    byPackage.set(key, arr);
  }
  return byPackage;
}

async function packageSummary(
  ctx: any,
  clientCache: Map<string, ClientLite>,
  contactCache: Map<string, ContactLite>,
  packageKey: string,
  members: any[],
) {
  const sorted = [...members].sort(
    (a, b) => (a.packageOrder ?? 0) - (b.packageOrder ?? 0),
  );
  const head = sorted[0];
  const client = await getClientLite(ctx, clientCache, head.relatedClientId);
  const contact = await getContactLite(ctx, contactCache, head.contactId);
  const unfired = sorted.filter((r) => !r.lastFiredAt);
  return {
    packageId: head.packageId ? String(head.packageId) : null,
    packageKey,
    cadenceIds: sorted.map((r) => String(r._id)),
    cadenceType: head.cadenceType ?? null,
    touchCount: sorted.length,
    unfiredCount: unfired.length,
    firstDueAt: unfired[0]?.nextDueAt ?? null,
    touch1Subject: snippet(head.preDraftedTouch?.subject, 90),
    revisionRequested: sorted.some((r) => r.revisionRequested),
    createdAt: head.createdAt ?? null,
    client,
    contact,
  };
}

// ── triageQueue ───────────────────────────────────────────────────────

export const triageQueue = query({
  args: {},
  handler: async (ctx) => {
    const nowIso = new Date().toISOString();
    const clientCache = new Map<string, ClientLite>();
    const contactCache = new Map<string, ContactLite>();

    // 1. Cadence packages awaiting the operator's approve/deny.
    const pendingRows = await ctx.db
      .query("cadences")
      .withIndex("by_approval_status", (q: any) =>
        q.eq("packageApprovalStatus", "pending"),
      )
      .order("desc")
      .take(PACKAGE_ROW_CAP);
    const pendingPackages = [];
    for (const [key, members] of groupPackages(pendingRows)) {
      pendingPackages.push(
        await packageSummary(ctx, clientCache, contactCache, key, members),
      );
    }

    // 2. Held drafts with no sendable contact — invisible everywhere else
    // (the action queue only reads packageApprovalStatus === "pending").
    const needsContactRows = await ctx.db
      .query("cadences")
      .withIndex("by_approval_status", (q: any) =>
        q.eq("packageApprovalStatus", "needs_contact"),
      )
      .order("desc")
      .take(PACKAGE_ROW_CAP);
    const needsContact = [];
    for (const [key, members] of groupPackages(needsContactRows)) {
      needsContact.push(
        await packageSummary(ctx, clientCache, contactCache, key, members),
      );
    }

    // 3. Pending approvals — reply drafts (inline accept/edit) vs the rest.
    const pendingApprovalRows = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .order("desc")
      .take(APPROVAL_CAP);
    const replyDrafts = [];
    const otherApprovals = [];
    for (const a of pendingApprovalRows) {
      const p: any = a.draftPayload ?? {};
      const client = await getClientLite(ctx, clientCache, a.relatedClientId);
      const lite = {
        approvalId: String(a._id),
        entityType: a.entityType,
        payloadKind: typeof p.kind === "string" ? p.kind : null,
        summary: snippet(a.summary, 120),
        subject: snippet(p.subject, 90),
        requestedAt: a.requestedAt,
        requestSourceName: a.requestSourceName ?? null,
        relatedReplyEventId: a.relatedReplyEventId ? String(a.relatedReplyEventId) : null,
        client,
      };
      if (a.relatedReplyEventId && p.kind === "email_reply") replyDrafts.push(lite);
      else otherApprovals.push(lite);
    }

    // 4. Failed sends — approved actions that errored at execution. The
    // operator already signed these off; each needs a retry or a reject.
    const failedRows = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", "execution_failed"))
      .order("desc")
      .take(FAILED_SEND_CAP);
    const failedSends = [];
    for (const a of failedRows) {
      failedSends.push({
        approvalId: String(a._id),
        entityType: a.entityType,
        summary: snippet(a.summary, 120),
        executionError: snippet(a.executionError, 200),
        executedAt: a.executedAt ?? null,
        client: await getClientLite(ctx, clientCache, a.relatedClientId),
      });
    }

    // 5. Replies awaiting a human decision (classifier → operator_review).
    const unroutedRows = await ctx.db
      .query("replyEvents")
      .withIndex("by_dispatched_to", (q: any) =>
        q.eq("dispatchedTo", "operator_review"),
      )
      .order("desc")
      .take(REPLY_CAP);
    const unroutedReplies = [];
    for (const r of unroutedRows) {
      unroutedReplies.push({
        replyEventId: String(r._id),
        fromEmail: r.fromEmail ?? null,
        subject: snippet(r.replySubject, 90),
        bodySnippet: snippet(r.replyBodyText),
        intent: r.classifiedIntent ?? null,
        confidence: r.classifiedConfidence ?? null,
        receivedAt: r.receivedAt,
        client: await getClientLite(ctx, clientCache, r.linkedClientId),
      });
    }

    // 6. Dead-end replies — ingested but silently parked because no contact
    // (or no linked prospect) matched. Previously surfaced NOWHERE.
    const deadEndReplies = [];
    for (const bucket of ["no_contact_match", "unlinked_no_review"] as const) {
      const rows = await ctx.db
        .query("replyEvents")
        .withIndex("by_dispatched_to", (q: any) => q.eq("dispatchedTo", bucket))
        .order("desc")
        .take(DEAD_END_CAP);
      for (const r of rows) {
        deadEndReplies.push({
          replyEventId: String(r._id),
          deadEnd: bucket,
          fromEmail: r.fromEmail ?? null,
          subject: snippet(r.replySubject, 90),
          bodySnippet: snippet(r.replyBodyText),
          receivedAt: r.receivedAt,
        });
      }
    }
    deadEndReplies.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));

    // 7. Stalled cadences — every way a touch silently stops firing.
    //    intel_hold          isActive=false + intelHoldAt (Trigger B parked it)
    //    auto_deactivated    isActive=false after 3 consecutive failures
    //    paused              isActive=true but pauseUntil is in the future
    // Deliberate stops (operator deny, reply cancellation, completed one-shots,
    // needs_contact holds — section 2) are excluded: they are decisions, not stalls.
    const stalledCadences = [];
    const inactiveRows = await ctx.db
      .query("cadences")
      .withIndex("by_active_next_due", (q: any) => q.eq("isActive", false))
      .order("desc")
      .take(STALL_SCAN_CAP);
    for (const row of inactiveRows) {
      if (row.cancelledReason) continue;
      if (row.packageApprovalStatus === "denied") continue;
      if (row.packageApprovalStatus === "needs_contact") continue;
      let reason: string | null = null;
      let detail: string | null = null;
      if (row.intelHoldAt) {
        reason = "intel_hold";
        detail = snippet(row.intelHoldReason, 160) ?? row.intelHoldAt;
      } else if (
        (row.consecutiveFailures ?? 0) >= 3 &&
        row.lastResult === "failed"
      ) {
        reason = "auto_deactivated_failures";
        detail = snippet(row.errors?.[row.errors.length - 1]?.message, 160);
      }
      if (!reason) continue; // completed one-shots etc. — not stalls
      stalledCadences.push({
        cadenceId: String(row._id),
        packageId: row.packageId ? String(row.packageId) : null,
        packageOrder: row.packageOrder ?? null,
        reason,
        detail,
        nextDueAt: row.nextDueAt,
        subject: snippet(row.preDraftedTouch?.subject, 90),
        client: await getClientLite(ctx, clientCache, row.relatedClientId),
      });
    }
    const activeRows = await ctx.db
      .query("cadences")
      .withIndex("by_active_next_due", (q: any) => q.eq("isActive", true))
      .order("asc")
      .take(STALL_SCAN_CAP);
    for (const row of activeRows) {
      if (!row.pauseUntil || row.pauseUntil <= nowIso) continue;
      stalledCadences.push({
        cadenceId: String(row._id),
        packageId: row.packageId ? String(row.packageId) : null,
        packageOrder: row.packageOrder ?? null,
        reason: "paused",
        detail: `paused until ${row.pauseUntil}`,
        nextDueAt: row.nextDueAt,
        subject: snippet(row.preDraftedTouch?.subject, 90),
        client: await getClientLite(ctx, clientCache, row.relatedClientId),
      });
    }

    // 8. Prospects flagged needs-action (reply lifecycle raises these) and
    // prospects whose intel is flagged stale. Read straight off the client
    // docs via their dedicated indexes.
    const flaggedClients = [];
    const needsActionDocs = await ctx.db
      .query("clients")
      .withIndex("by_needs_action_at", (q: any) => q.gt("needsActionAt", ""))
      .order("desc")
      .take(CLIENT_FLAG_CAP);
    for (const doc of needsActionDocs) {
      flaggedClients.push({
        clientId: String(doc._id),
        name: doc.name ?? null,
        pipelineStage: doc.pipelineStage ?? null,
        needsActionAt: doc.needsActionAt ?? null,
        flags: (doc.needsActionFlags ?? []).map((f: any) => ({
          kind: f.kind,
          reason: snippet(f.reason, 120),
          raisedAt: f.raisedAt,
        })),
      });
    }
    const staleIntel = [];
    const staleDocs = await ctx.db
      .query("clients")
      .withIndex("by_intel_attention", (q: any) => q.gt("intelAttentionAt", ""))
      .order("desc")
      .take(CLIENT_FLAG_CAP);
    for (const doc of staleDocs) {
      staleIntel.push({
        clientId: String(doc._id),
        name: doc.name ?? null,
        pipelineStage: doc.pipelineStage ?? null,
        intelAttentionAt: doc.intelAttentionAt ?? null,
        reason: doc.intelAttentionReason ?? null,
      });
    }

    return {
      generatedAt: nowIso,
      counts: {
        pendingPackages: pendingPackages.length,
        needsContact: needsContact.length,
        replyDrafts: replyDrafts.length,
        otherApprovals: otherApprovals.length,
        failedSends: failedSends.length,
        unroutedReplies: unroutedReplies.length,
        deadEndReplies: deadEndReplies.length,
        stalledCadences: stalledCadences.length,
        flaggedClients: flaggedClients.length,
        staleIntel: staleIntel.length,
      },
      capped: {
        approvals: pendingApprovalRows.length >= APPROVAL_CAP,
        unroutedReplies: unroutedRows.length >= REPLY_CAP,
        stallScan:
          inactiveRows.length >= STALL_SCAN_CAP ||
          activeRows.length >= STALL_SCAN_CAP,
      },
      pendingPackages,
      needsContact,
      replyDrafts,
      otherApprovals,
      failedSends,
      unroutedReplies,
      deadEndReplies,
      stalledCadences,
      flaggedClients,
      staleIntel,
    };
  },
});

// ── listUpcoming — the outbox ─────────────────────────────────────────

// Every ACTIVE cadence touch due inside the horizon, with an honest
// fire-status. Overdue rows (nextDueAt already past) are included — an
// overdue row that is fireable will go on the next 5-min dispatcher tick;
// an overdue row that is blocked is exactly the "why didn't it send?" answer.
export const listUpcoming = query({
  args: {
    daysAhead: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = Math.min(Math.max(args.daysAhead ?? 7, 1), 90);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const horizonIso = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();

    const rows = await ctx.db
      .query("cadences")
      .withIndex("by_active_next_due", (q: any) =>
        q.eq("isActive", true).lte("nextDueAt", horizonIso),
      )
      .order("asc")
      .take(limit);

    const clientCache = new Map<string, ClientLite>();
    const contactCache = new Map<string, ContactLite>();

    const touches = [];
    for (const row of rows) {
      const contact = await getContactLite(ctx, contactCache, row.contactId);
      // Mirror the dispatcher's own gates (cadenceDispatcher.tick) so this
      // list never claims a blocked touch will send.
      let fireStatus: string;
      if (row.pauseUntil && row.pauseUntil > nowIso) {
        fireStatus = "paused";
      } else if (!isCadenceFireable(row)) {
        fireStatus =
          row.packageApprovalStatus === "pending"
            ? "blocked_package_pending"
            : `blocked_package_${row.packageApprovalStatus ?? "unapproved"}`;
      } else if (!contact) {
        fireStatus = "blocked_no_contact";
      } else if (!contact.hasEmail) {
        fireStatus = "blocked_no_contact_email";
      } else {
        fireStatus = row.nextDueAt <= nowIso ? "due_now" : "scheduled";
      }
      touches.push({
        cadenceId: String(row._id),
        packageId: row.packageId ? String(row.packageId) : null,
        packageOrder: row.packageOrder ?? null,
        cadenceType: row.cadenceType ?? null,
        nextDueAt: row.nextDueAt,
        fireStatus,
        subject: snippet(row.preDraftedTouch?.subject, 90),
        lastResult: row.lastResult ?? null,
        pauseUntil: row.pauseUntil ?? null,
        client: await getClientLite(ctx, clientCache, row.relatedClientId),
        contact,
      });
    }

    return {
      generatedAt: nowIso,
      horizonDays: days,
      capped: rows.length >= limit,
      counts: {
        total: touches.length,
        willFire: touches.filter(
          (t) => t.fireStatus === "scheduled" || t.fireStatus === "due_now",
        ).length,
        blocked: touches.filter((t) => t.fireStatus.startsWith("blocked")).length,
        paused: touches.filter((t) => t.fireStatus === "paused").length,
      },
      touches,
    };
  },
});
