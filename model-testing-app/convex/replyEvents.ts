import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

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
