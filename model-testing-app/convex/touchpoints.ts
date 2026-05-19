import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

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
    await getAuthenticatedUser(ctx);
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
