import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// Internal API for the replyEvents table. Written by the Gmail push webhook
// and the HubSpot sync sweep. Idempotency guard is the (source, externalId)
// index — the same Gmail message arriving via both paths processes once.

// ── Find by source + externalId (idempotency check) ──────────────────

export const findBySourceExternalIdInternal = internalQuery({
  args: {
    source: v.union(v.literal("gmail_push"), v.literal("hubspot_sync")),
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("replyEvents")
      .withIndex("by_source_externalId", (q) =>
        q.eq("source", args.source).eq("externalId", args.externalId),
      )
      .first();
  },
});

// ── Create a new event row ───────────────────────────────────────────

export const createInternal = internalMutation({
  args: {
    source: v.union(v.literal("gmail_push"), v.literal("hubspot_sync")),
    externalId: v.string(),
    contactId: v.optional(v.id("contacts")),
    receivedAt: v.string(),
    rawMessageRef: v.optional(v.string()),
    userId: v.id("users"),
    // v1.3 — optional content + linkage fields. Body + subject persist the
    // raw reply for UI display + Claude Code. linkedClientId is denormalised
    // at ingest from contact.clientId so the by_linked_client index serves
    // direct prospect-detail-page reads without a JOIN.
    replyBodyText: v.optional(v.string()),
    replySubject: v.optional(v.string()),
    linkedClientId: v.optional(v.id("clients")),
    ingestedManuallyByUserId: v.optional(v.id("users")),
    ingestedManuallyAt: v.optional(v.string()),
    // Gmail inbound capture (see schema.ts replyEvents notes).
    gmailThreadId: v.optional(v.string()),
    gmailMessageId: v.optional(v.string()),
    fromEmail: v.optional(v.string()),
    fromName: v.optional(v.string()),
    replyBodyHtml: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const replyEventId = await ctx.db.insert("replyEvents", {
      ...args,
      processed: false,
    });
    // Knowledge feed — one-shot inbound-reply atomization (the action skips
    // rows without a linked client, body text, or a knowledge-enabled client).
    await ctx.scheduler.runAfter(
      0,
      internal.knowledge.sourceAtomizer.atomizeReply,
      { replyEventId },
    );
    return replyEventId;
  },
});

// ── Patch classification result onto a row ───────────────────────────

export const patchClassificationInternal = internalMutation({
  args: {
    replyEventId: v.id("replyEvents"),
    classifiedIntent: v.union(
      v.literal("book_meeting"),
      v.literal("defer_long_term"),
      v.literal("not_interested"),
      v.literal("info_question"),
      v.literal("out_of_office"),
      v.literal("positive"),
      v.literal("unknown"),
    ),
    classifiedConfidence: v.number(),
    classifierEvidence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { replyEventId, ...rest } = args;
    await ctx.db.patch(replyEventId, rest);
    return { ok: true };
  },
});

// ── Mark cancelled cadences onto the row ─────────────────────────────

export const patchCancelledInternal = internalMutation({
  args: {
    replyEventId: v.id("replyEvents"),
    cadencesCancelled: v.array(v.id("cadences")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.replyEventId, {
      cadencesCancelled: args.cadencesCancelled,
    });
    return { ok: true };
  },
});

// ── Mark processed + dispatched ──────────────────────────────────────

export const markProcessedInternal = internalMutation({
  args: {
    replyEventId: v.id("replyEvents"),
    dispatchedTo: v.union(
      v.literal("meeting-prep"),
      v.literal("long-term-monitor"),
      v.literal("qualify-and-draft"),
      v.literal("opt_out_marker"),
      v.literal("operator_review"),
      v.literal("restored_cadences"),
      v.literal("no_contact_match"),
      v.literal("unlinked_no_review"),
      v.literal("reply_drafted"),
      v.literal("flag_only"),
    ),
    dispatchedSkillRunId: v.optional(v.id("skillRuns")),
  },
  handler: async (ctx, args) => {
    const { replyEventId, ...rest } = args;
    await ctx.db.patch(replyEventId, {
      ...rest,
      processed: true,
    });
    return { ok: true };
  },
});

// ── Append error ─────────────────────────────────────────────────────

export const appendErrorInternal = internalMutation({
  args: { replyEventId: v.id("replyEvents"), message: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.replyEventId);
    if (!row) throw new Error(`replyEvent not found: ${args.replyEventId}`);
    const prev = row.errors ?? [];
    await ctx.db.patch(args.replyEventId, {
      errors: [...prev.slice(-9), args.message],
    });
    return { ok: true };
  },
});

// ── v1.3: stamp manual-ingest provenance after processReplyEvent runs ──

export const patchManualIngestInternal = internalMutation({
  args: {
    replyEventId: v.id("replyEvents"),
    ingestedManuallyByUserId: v.id("users"),
    ingestedManuallyAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.replyEventId, {
      ingestedManuallyByUserId: args.ingestedManuallyByUserId,
      ingestedManuallyAt: args.ingestedManuallyAt,
    });
    return { ok: true };
  },
});

// ── Get one row by id ────────────────────────────────────────────────

export const getInternal = internalQuery({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.replyEventId);
  },
});

// ── HTML backfill (one-time): rows ingested before replyBodyHtml capture ──
// List gmail_push rows missing an HTML body so the backfill action can
// re-fetch + populate them. Newest first (most useful to fix first).
export const listMissingHtmlInternal = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("replyEvents")
      .withIndex("by_source_received_at", (q) => q.eq("source", "gmail_push"))
      .order("desc")
      .take(args.limit ?? 100);
    return rows
      .filter((r) => !r.replyBodyHtml)
      .map((r) => ({
        _id: r._id,
        userId: r.userId,
        externalId: r.externalId,
        gmailThreadId: r.gmailThreadId,
      }));
  },
});

export const patchBodyHtmlInternal = internalMutation({
  args: {
    replyEventId: v.id("replyEvents"),
    replyBodyHtml: v.optional(v.string()),
    replyBodyText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.replyBodyHtml !== undefined) patch.replyBodyHtml = args.replyBodyHtml;
    if (args.replyBodyText !== undefined) patch.replyBodyText = args.replyBodyText;
    if (Object.keys(patch).length > 0) await ctx.db.patch(args.replyEventId, patch);
    return { ok: true };
  },
});

// ── Public get by id (used by /api/meeting-prep-respond) ─────────────
// Called from a Next.js route via ConvexHttpClient (no user session).
// Intentionally public — the route is already protected by
// x-convex-internal-secret; the data it reads is not user-sensitive.

export const getById = query({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.replyEventId);
  },
});

// Find a Gmail-captured replyEvent for the same contact near a timestamp.
// Used by the HubSpot-sweep ingest path to suppress contentless duplicate
// rows: the Gmail OAuth poller (5-min) captures the same inbound mail with
// full body/subject long before the 6h HubSpot engagement sweep sees it,
// so when a Gmail twin exists the sweep row adds nothing but a "Body not
// captured" duplicate on the Replies tab.
export const findGmailTwinInternal = internalQuery({
  args: {
    contactId: v.id("contacts"),
    receivedAt: v.string(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const t = Date.parse(args.receivedAt);
    const rows = await ctx.db
      .query("replyEvents")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .take(100);
    return (
      rows.find(
        (r) =>
          r.source === "gmail_push" &&
          Math.abs(Date.parse(r.receivedAt) - t) <= args.windowMs,
      ) ?? null
    );
  },
});

// ── v1.3 public queries: power the Replies tab + operator-review queue ──

// List replies for a contact, newest first. Used by the prospect-detail
// Replies tab when a single contact is the focus.
export const listByContact = query({
  args: { contactId: v.id("contacts"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("replyEvents")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .take(args.limit ?? 50);
    return rows;
  },
});

// List replies for a client (via the denormalised linkedClientId). Used by
// the prospect-detail Replies tab as the primary query — covers all contacts
// linked to this client in one read.
export const listByClient = query({
  args: { clientId: v.id("clients"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("replyEvents")
      .withIndex("by_linked_client", (q) => q.eq("linkedClientId", args.clientId))
      .order("desc")
      .take(args.limit ?? 50);
    return rows;
  },
});

// List unrouted replies (dispatchedTo === "operator_review"). Powers the
// "Replies awaiting triage" section on the /prospects home page — the
// operator's morning queue of replies the classifier didn't auto-route.
export const listUnrouted = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("replyEvents")
      .withIndex("by_dispatched_to", (q) => q.eq("dispatchedTo", "operator_review"))
      .order("desc")
      .take(args.limit ?? 50);
    return rows;
  },
});

// Count of unrouted replies — for the home-page badge. Bounded: a full
// .collect() here blew Convex's 16MB read limit in production once the
// operator_review backlog re-accumulated (each row carries a reply body).
// A badge doesn't need an exact large number, so count up to a cap and
// report saturation via `capped` — render "100+" instead of a crash.
const UNROUTED_COUNT_CAP = 100;
export const countUnrouted = query({
  args: {},
  handler: async (ctx): Promise<{ count: number; capped: boolean }> => {
    const rows = await ctx.db
      .query("replyEvents")
      .withIndex("by_dispatched_to", (q) => q.eq("dispatchedTo", "operator_review"))
      .take(UNROUTED_COUNT_CAP + 1);
    return {
      count: Math.min(rows.length, UNROUTED_COUNT_CAP),
      capped: rows.length > UNROUTED_COUNT_CAP,
    };
  },
});

// ── Reply lifecycle: actionable drafts + flag-only replies ───────────
//
// The morning queue, post auto-draft. Powers RepliesAwaitingTriageSection
// (home) and feeds the requires-attention surface. Returns TWO row groups:
//
//   drafts: pending client_communication/email_reply approvals (auto-staged
//           by replyEventProcessor.dispatchByIntent for book_meeting /
//           info_question / positive) joined to their inbound replyEvent +
//           contact + client. The operator can Accept & send / Edit / Reject
//           inline without opening detail.
//   flags:  replyEvents dispatched flag_only (not_interested / out_of_office)
//           — flagged for an operator lost/keep decision, NO draft, NO send.
//
// Auto-drafted replies surface ONCE here (as a draft row); they are routed to
// dispatchedTo "reply_drafted" precisely so the requires-attention reply filter
// can exclude them and avoid double-counting against this approval row.

type ActionableDraftRow = {
  approvalId: Id<"approvals">;
  clientId: Id<"clients"> | null;
  clientName: string | null;
  contactId: Id<"contacts"> | null;
  contactName: string | null;
  contactEmail: string | null;
  intent: string;
  replyEventId: Id<"replyEvents"> | null;
  inReplyToSubject: string | null;
  inReplySnippet: string | null;
  draftSubject: string;
  draftBodyText: string;
  draftBodyHtml: string;
  reasoning: string | null;
  receivedAt: string | null;
  blocked: boolean;
};

type ActionableFlagRow = {
  kind: string;
  reason: string;
  replyEventId: Id<"replyEvents">;
  clientId: Id<"clients"> | null;
  clientName: string | null;
  contactName: string | null;
  receivedAt: string | null;
};

export const listActionableDrafts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ drafts: ActionableDraftRow[]; flags: ActionableFlagRow[] }> => {
    const limit = args.limit ?? 50;

    // (i) Pending email_reply approvals. by_status is the only global handle;
    // scan a bounded window of pending rows then narrow to the auto-drafted
    // reply shape (entityType client_communication, payload.kind email_reply,
    // a related reply event set).
    const pending = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(Math.max(limit * 4, 200));

    const drafts: ActionableDraftRow[] = [];
    for (const a of pending) {
      if (a.entityType !== "client_communication") continue;
      const p: any = a.draftPayload ?? {};
      if (p.kind !== "email_reply") continue;
      if (!a.relatedReplyEventId) continue;
      if (drafts.length >= limit) break;

      const replyEvent = a.relatedReplyEventId
        ? await ctx.db.get(a.relatedReplyEventId)
        : null;
      const clientId = a.relatedClientId ?? replyEvent?.linkedClientId ?? null;
      let clientName: string | null = null;
      if (clientId) {
        const client = await ctx.db.get(clientId);
        clientName = client?.name ?? client?.companyName ?? null;
      }
      const contactId = a.relatedContactId ?? p.contactId ?? replyEvent?.contactId ?? null;
      let contactName: string | null = null;
      let contactEmail: string | null = null;
      if (contactId) {
        const contact = (await ctx.db.get(contactId)) as any;
        contactName = contact?.name ?? null;
        contactEmail = contact?.email ?? null;
      }
      const inboundBody = replyEvent?.replyBodyText ?? "";
      drafts.push({
        approvalId: a._id,
        clientId,
        clientName,
        contactId,
        contactName,
        contactEmail,
        intent: p.intent ?? replyEvent?.classifiedIntent ?? "unknown",
        replyEventId: a.relatedReplyEventId,
        inReplyToSubject: replyEvent?.replySubject ?? null,
        inReplySnippet: inboundBody ? inboundBody.slice(0, 140) : null,
        draftSubject: p.subject ?? "",
        draftBodyText: p.bodyText ?? "",
        draftBodyHtml: p.bodyHtml ?? "",
        reasoning: p.reasoning ?? null,
        receivedAt: replyEvent?.receivedAt ?? a.requestedAt ?? null,
        // A reply with no resolvable recipient will fail at send time — surface
        // it as blocked so Accept doesn't silently 500.
        blocked: !contactEmail,
      });
    }

    // (ii) Flag-only replies (not_interested / out_of_office).
    const flagRows = await ctx.db
      .query("replyEvents")
      .withIndex("by_dispatched_to", (q) => q.eq("dispatchedTo", "flag_only"))
      .order("desc")
      .take(limit);

    const flags: ActionableFlagRow[] = [];
    for (const r of flagRows) {
      const clientId = r.linkedClientId ?? null;
      let clientName: string | null = null;
      const client = clientId ? await ctx.db.get(clientId) : null;
      if (client) clientName = client.name ?? client.companyName ?? null;
      let contactName: string | null = null;
      if (r.contactId) {
        const contact = await ctx.db.get(r.contactId);
        contactName = contact?.name ?? null;
      }
      // Prefer the exact kind/reason raised onto the client (matched by source
      // reply event); fall back to deriving from the classified intent.
      let kind = "reply_flag_only";
      let reason = "Reply needs your decision";
      const raised = (client?.needsActionFlags ?? []).find(
        (f: any) => f.sourceReplyEventId === r._id,
      );
      if (raised) {
        kind = raised.kind;
        reason = raised.reason;
      } else if (r.classifiedIntent === "not_interested") {
        kind = "reply_not_interested";
        reason = "Replied: not interested — keep or mark lost?";
      } else if (r.classifiedIntent === "out_of_office") {
        kind = "reply_out_of_office";
        reason = "Out of office auto-reply — cadence paused 7 days";
      }
      flags.push({
        kind,
        reason,
        replyEventId: r._id,
        clientId,
        clientName,
        contactName,
        receivedAt: r.receivedAt ?? null,
      });
    }

    return { drafts, flags };
  },
});

// ── Inbox feed: inbound EMAIL, newest first, paginated ───────────────
// Powers the dashboard Inbox panel (initialNumItems 5) and the /inbox
// "Gmail" tab (larger page). Scoped to source="gmail_push" — actual Gmail
// mail captured by the poller — via the by_source_received_at index. This
// deliberately EXCLUDES the HubSpot 6h reply-detection sweep, which writes
// contentless replyEvents (no sender/subject/body, just an engagement id)
// that would otherwise show as "Unknown sender / no subject". Manual pastes
// (reply.ingestManual) also use source="hubspot_sync" and surface on the
// prospect Replies tab, not here. Ordered by receivedAt desc; each row is
// enriched with linked client + matched contact names for the UI.
//
// User-scoped: each operator connects their OWN Gmail account, so the inbox
// shows only the viewer's own captured mail. An org-wide read here leaked one
// operator's private inbox to every other user — see by_source_user_received_at.

type EnrichedInboxRow = Doc<"replyEvents"> & {
  clientName: string | null;
  contactName: string | null;
};

async function enrichInboxRow(
  ctx: { db: any },
  row: Doc<"replyEvents">,
): Promise<EnrichedInboxRow> {
  let clientName: string | null = null;
  if (row.linkedClientId) {
    const client = await ctx.db.get(row.linkedClientId);
    clientName = client?.name ?? client?.companyName ?? null;
  }
  let contactName: string | null = null;
  if (row.contactId) {
    const contact = await ctx.db.get(row.contactId);
    contactName = contact?.name ?? null;
  }
  return { ...row, clientName, contactName };
}

export const listInboundPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    // Resolve the viewer. The inbox is scoped to the operator's own Gmail
    // account — never return another user's mail. Unauthenticated or unknown
    // users get an empty (terminal) page rather than an org-wide leak.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await ctx.db
      .query("replyEvents")
      .withIndex("by_source_user_received_at", (q) =>
        q.eq("source", "gmail_push").eq("userId", user._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map((row) => enrichInboxRow(ctx, row)),
    );
    return { ...result, page };
  },
});
