import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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
    return await ctx.db.insert("replyEvents", {
      ...args,
      processed: false,
    });
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

// Count of unrouted replies — for the home-page badge.
export const countUnrouted = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("replyEvents")
      .withIndex("by_dispatched_to", (q) => q.eq("dispatchedTo", "operator_review"))
      .collect();
    return rows.length;
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
