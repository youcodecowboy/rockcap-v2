import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthenticatedUserOrNull } from "./authHelpers";
import { internal } from "./_generated/api";
import { resolveEmailToContactClient } from "./contacts";

// Touchpoints (BL-4.9): unified exchange ledger across all integrations.
// Skills query this for recent history with a contact, deal, or client
// without caring which integration delivered each event.
//
// Writers: Gmail sync (inbound + outbound), Fireflies sync (meetings),
// HubSpot sync (activities via touchpoint mirroring), manual entries.
//
// Provider-agnostic by design. Contact resolution is best-effort: if no
// contact matches the participant emails, the touchpoint still lands
// with participantEmails populated and contactId left null.

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

// ── Create ───────────────────────────────────────────────────

const PROVIDER = v.union(
  v.literal("gmail"),
  v.literal("hubspot"),
  v.literal("fireflies"),
  v.literal("calendar"),
  v.literal("manual"),
  v.literal("other"),
);
const DIRECTION = v.union(
  v.literal("inbound"),
  v.literal("outbound"),
  v.literal("internal"),
);
const KIND = v.union(
  v.literal("email"),
  v.literal("call"),
  v.literal("meeting"),
  v.literal("note"),
  v.literal("message"),
  v.literal("event"),
  v.literal("other"),
);

const TOUCHPOINT_ARGS = {
  provider: PROVIDER,
  direction: DIRECTION,
  kind: KIND,
  contactId: v.optional(v.id("contacts")),
  participantEmails: v.optional(v.array(v.string())),
  relatedClientId: v.optional(v.id("clients")),
  relatedProjectId: v.optional(v.id("projects")),
  occurredAt: v.string(),
  payloadRef: v.optional(v.string()),
  payloadType: v.optional(v.string()),
  subject: v.optional(v.string()),
  summary: v.optional(v.string()),
  bodyExcerpt: v.optional(v.string()),
  providerEnrichment: v.optional(v.any()),
  threadId: v.optional(v.string()),
  capturedBy: v.optional(v.id("users")),
};

export const create = mutation({
  args: TOUCHPOINT_ARGS,
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    return ctx.db.insert("touchpoints", {
      ...args,
      capturedBy: args.capturedBy ?? user._id,
      createdAt: new Date().toISOString(),
    });
  },
});

// Internal variant for sync code paths that already have the userId.
export const internalCreate = internalMutation({
  args: TOUCHPOINT_ARGS,
  handler: async (ctx, args) => {
    return ctx.db.insert("touchpoints", {
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

// ── Read ─────────────────────────────────────────────────────

export const getByContact = query({
  args: { contactId: v.id("contacts"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    const limit = args.limit ?? 50;
    return ctx.db
      .query("touchpoints")
      .withIndex("by_contact", (q: any) => q.eq("contactId", args.contactId))
      .order("desc")
      .take(limit);
  },
});

export const getByProject = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Tolerate the cold-load pre-auth window (Clerk token not yet at
    // Convex): return an empty default instead of crashing useQuery callers.
    if (!(await getAuthenticatedUserOrNull(ctx))) return [];
    const limit = args.limit ?? 50;
    return ctx.db
      .query("touchpoints")
      .withIndex("by_related_project", (q: any) => q.eq("relatedProjectId", args.projectId))
      .order("desc")
      .take(limit);
  },
});

export const getByClient = query({
  args: { clientId: v.id("clients"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    const limit = args.limit ?? 50;
    return ctx.db
      .query("touchpoints")
      .withIndex("by_related_client", (q: any) => q.eq("relatedClientId", args.clientId))
      .order("desc")
      .take(limit);
  },
});

// Dedup check for syncs: returns the existing touchpoint if one already
// covers this provider + payloadRef pair, else null.
export const findByProviderRef = query({
  args: { provider: PROVIDER, payloadRef: v.string() },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    return ctx.db
      .query("touchpoints")
      .withIndex("by_provider_payload", (q: any) =>
        q.eq("provider", args.provider).eq("payloadRef", args.payloadRef),
      )
      .first();
  },
});

export const getByThread = query({
  args: { threadId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    const limit = args.limit ?? 100;
    return ctx.db
      .query("touchpoints")
      .withIndex("by_thread", (q: any) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(limit);
  },
});

// Time-range query for skills that want "recent activity" without a
// specific contact/project filter.
export const getRecent = query({
  args: { sinceIso: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    const limit = args.limit ?? 200;
    return ctx.db
      .query("touchpoints")
      .withIndex("by_occurred_at", (q: any) => q.gte("occurredAt", args.sinceIso))
      .order("desc")
      .take(limit);
  },
});

// ── Manual-send backfill (backlog reset, 2026-07-14) ──────────────────
//
// Outreach that happened OUTSIDE the system (operator sent from a generic
// Gmail tool) is invisible to touchpoints, so per-prospect history lies and
// clients.lastOutreachSendAt (which drives the cold-stage split + the
// intel-freshness Trigger B) stays unset. This batch mutation is the
// reconciliation write: log each manual send as an outbound email touchpoint,
// stamp lastOutreachSendAt forward, and advance the prospect state machine
// exactly as a real send would (markOutreachInFlightInternal, which is
// no-op-safe on non-pre-outreach states).
//
// Dedup: entries carrying a gmailMessageId are idempotent via the
// (provider "gmail", payloadRef) index — re-running a reset never
// double-logs. Entries without one always insert (provider "manual").

const MANUAL_LOG_CAP = 50;

export const logManualOutboundBatchInternal = internalMutation({
  args: {
    entries: v.array(
      v.object({
        contactId: v.optional(v.id("contacts")),
        contactEmail: v.optional(v.string()),
        clientId: v.optional(v.id("clients")),
        occurredAt: v.string(), // ISO — when the manual email was actually sent
        subject: v.optional(v.string()),
        gmailMessageId: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
    actorUserId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    total: number;
    logged: number;
    skipped: Array<{ index: number; reason: string }>;
  }> => {
    if (args.entries.length > MANUAL_LOG_CAP) {
      throw new Error(
        `Batch too large: ${args.entries.length} > ${MANUAL_LOG_CAP}. Split into smaller batches.`,
      );
    }
    const now = new Date().toISOString();
    const skipped: Array<{ index: number; reason: string }> = [];
    let logged = 0;

    for (let i = 0; i < args.entries.length; i++) {
      const e = args.entries[i];

      // Resolve contact + client.
      let contactId = e.contactId as any;
      let clientId = e.clientId as any;
      if (!contactId && e.contactEmail) {
        const hit = await resolveEmailToContactClient(ctx, e.contactEmail);
        if (hit) {
          contactId = hit.contactId as any;
          clientId = clientId ?? (hit.clientId as any);
        }
      }
      if (contactId && !clientId) {
        const contact: any = await ctx.db.get(contactId);
        clientId = contact?.clientId;
      }
      if (!contactId && !clientId) {
        skipped.push({ index: i, reason: "no_contact_or_client_match" });
        continue;
      }

      // Idempotency on the Gmail message id when supplied.
      if (e.gmailMessageId) {
        const dup = await ctx.db
          .query("touchpoints")
          .withIndex("by_provider_payload", (q: any) =>
            q.eq("provider", "gmail").eq("payloadRef", e.gmailMessageId),
          )
          .first();
        if (dup) {
          skipped.push({ index: i, reason: "already_logged" });
          continue;
        }
      }

      await ctx.db.insert("touchpoints", {
        provider: e.gmailMessageId ? ("gmail" as const) : ("manual" as const),
        direction: "outbound" as const,
        kind: "email" as const,
        contactId,
        relatedClientId: clientId,
        occurredAt: e.occurredAt,
        payloadRef: e.gmailMessageId,
        payloadType: e.gmailMessageId ? "gmail.message" : undefined,
        subject: e.subject,
        summary: e.note ?? "Manual send logged during backlog reconciliation",
        capturedBy: args.actorUserId,
        createdAt: now,
      });
      logged++;

      // Truth repair on the prospect: outreach happened.
      if (clientId) {
        const client: any = await ctx.db.get(clientId);
        if (client) {
          const prev = client.lastOutreachSendAt;
          if (!prev || prev < e.occurredAt) {
            await ctx.db.patch(clientId, { lastOutreachSendAt: e.occurredAt });
          }
          await ctx.scheduler.runAfter(0, internal.prospects.markOutreachInFlightInternal, {
            clientId,
            userId: args.actorUserId,
          });
        }
      }
    }
    return { total: args.entries.length, logged, skipped };
  },
});
