import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";

/**
 * Query: Get contacts associated with a client.
 *
 * A contact is associated with a client through EITHER of two links:
 *   (1) `contact.clientId === clientId`                     (direct — manually linked)
 *   (2) `contact.linkedCompanyIds[i] === company._id`        (HubSpot company link)
 *       AND `company.promotedToClientId === clientId`         (company promoted to client)
 *
 * Historically only (1) was used, but the HubSpot sync populates (2) and most
 * imported contacts only have the company-association path. This query returns
 * the UNION so the client profile surfaces all relevant contacts — see the
 * Plan 1/2 back-link work in docs/superpowers/plans/2026-04-16-hubspot-*.md.
 */
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Path (1): direct clientId match (manually-linked, fast indexed path).
    const direct = await ctx.db
      .query("contacts")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    // Path (2): via companies.promotedToClientId → contact.linkedCompanyIds.
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_promoted", (q) => q.eq("promotedToClientId", args.clientId))
      .collect();

    if (companies.length === 0) return direct;

    const companyIdSet = new Set(companies.map((c) => c._id));
    const indirectByCompany: any[] = [];
    // Per-company indexed scan would be ideal, but `linkedCompanyIds` is an
    // array field with no compound index. Scanning `contacts` once and
    // filtering in memory is acceptable here — contact docs are small and
    // we're resolving a single client view, not the whole table.
    const all = await ctx.db
      .query("contacts")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    for (const c of all) {
      if ((c.linkedCompanyIds ?? []).some((id) => companyIdSet.has(id))) {
        indirectByCompany.push(c);
      }
    }

    // Deduplicate union of paths (a contact may satisfy both at once).
    const byId = new Map<string, any>();
    for (const c of direct) byId.set(String(c._id), c);
    for (const c of indirectByCompany) byId.set(String(c._id), c);
    return Array.from(byId.values());
  },
});

// Query: Get contacts by project
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
  },
});

// Query: Get all contacts
export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("contacts").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
  },
});

// Query: Get contacts by a list of IDs (used by DealDetailSheet for linked contacts)
export const listByIds = query({
  args: { ids: v.array(v.id("contacts")) },
  handler: async (ctx, args) => {
    const results = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return results.filter((c) => c !== null);
  },
});

// Query: Get contact by ID with associated companies and deals
export const get = query({
  args: { id: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.id);
    if (!contact || contact.isDeleted) return null;
    
    // Fetch associated companies
    const companies = contact.linkedCompanyIds 
      ? await Promise.all(contact.linkedCompanyIds.map((id: any) => ctx.db.get(id)))
      : [];
    
    // Fetch associated deals
    const deals = contact.linkedDealIds
      ? await Promise.all(contact.linkedDealIds.map((id: any) => ctx.db.get(id)))
      : [];
    
    return {
      ...contact,
      companies: companies.filter(c => c !== null),
      deals: deals.filter(d => d !== null),
    };
  },
});

// Mutation: Create contact
export const create = mutation({
  args: {
    name: v.string(),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    // v1.2.4 — email verification metadata. When email is sourced from
    // Apollo, pass the emailStatus + "apollo" as emailSource. When manually
    // entered, leave both undefined (cadence guard treats undefined as
    // "operator-entered, presumed valid").
    emailStatus: v.optional(v.string()),
    emailSource: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    sourceDocumentId: v.optional(v.id("documents")),
    linkedCompanyIds: v.optional(v.array(v.id("companies"))),
  },
  handler: async (ctx, args) => {
    const contactId = await ctx.db.insert("contacts", {
      name: args.name,
      role: args.role,
      email: args.email,
      emailStatus: args.emailStatus,
      emailSource: args.emailSource,
      emailVerifiedAt: args.emailStatus === "verified" ? new Date().toISOString() : undefined,
      phone: args.phone,
      company: args.company,
      notes: args.notes,
      clientId: args.clientId,
      projectId: args.projectId,
      sourceDocumentId: args.sourceDocumentId,
      linkedCompanyIds: args.linkedCompanyIds || [],
      createdAt: new Date().toISOString(),
    });

    // Update linked companies to include this contact
    if (args.linkedCompanyIds && args.linkedCompanyIds.length > 0) {
      for (const companyId of args.linkedCompanyIds) {
        const company = await ctx.db.get(companyId);
        if (company) {
          const existingContactIds = company.linkedContactIds || [];
          if (!existingContactIds.includes(contactId)) {
            await ctx.db.patch(companyId, {
              linkedContactIds: [...existingContactIds, contactId],
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return contactId;
  },
});

// Mutation: Update contact
export const update = mutation({
  args: {
    id: v.id("contacts"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    // Enrichment fields (e.g. persisting an apollo.findEmail result so the
    // People tab can reflect a completed search even when no email was
    // published). All already exist on the contacts table.
    linkedinUrl: v.optional(v.string()),
    emailStatus: v.optional(v.string()),
    emailSource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Contact not found");
    }

    const patchData: any = { ...updates, updatedAt: new Date().toISOString() };
    if (patchData.clientId === null) patchData.clientId = undefined;

    await ctx.db.patch(id, patchData);
    return id;
  },
});

// Mutation: Delete contact
export const remove = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedReason: "user_deleted",
    });
  },
});


/**
 * Link an existing contact to a client. Used by the mobile "Link contact
 * to client" modal. Sets contact.clientId directly — the reverse look-up
 * (via linkedCompanyIds → promotedToClientId) still works, but a direct
 * clientId is stronger (survives HubSpot data moves) and is what the web
 * UI predominantly reads.
 *
 * Idempotent: if the contact is already linked to this client, it's a no-op.
 */
export const linkToClient = mutation({
  args: {
    contactId: v.id("contacts"),
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    if ((contact as any).clientId === args.clientId) {
      return { id: args.contactId, action: "already-linked" };
    }
    await ctx.db.patch(args.contactId, {
      clientId: args.clientId,
      updatedAt: new Date().toISOString(),
    });
    return { id: args.contactId, action: "linked" };
  },
});

/**
 * Unlink a contact from any client — sets clientId to undefined.
 * Also usable as "unlink from current client" from the client profile.
 */
export const unlinkFromClient = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.contactId, {
      clientId: undefined,
      updatedAt: new Date().toISOString(),
    });
    return args.contactId;
  },
});

// Internal query: direct single-row lookup by id.
// Used by cadenceDispatcher for opt-out checks and email resolution.
export const getInternal = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.contactId);
  },
});

// Internal query: look up a contact by email address.
// Used by replyEventProcessor to match inbound replies to a known contact.
export const findByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

// Internal query: resolve an inbound reply's email to a contact AND a client.
//
// Replaces the naive findByEmailInternal + contact.clientId chain in the
// reply processor, which broke two ways in production:
//   (a) duplicate contacts share an email (old HubSpot import without
//       clientId + newer prospect-intel row with it) and `.first()` returned
//       the old row, so the reply never linked to the prospect;
//   (b) HubSpot-synced contacts only carry clientId if their company was
//       already promoted at sync time — contacts synced before promotion
//       have linkedCompanyIds but no clientId.
// This resolver mirrors getByClient's two-path union: prefer a candidate
// with a direct clientId, else bridge linkedCompanyIds → the linked
// company's promotedToClientId. Falls back to a lowercased lookup because
// the Gmail poller lowercases sender addresses but HubSpot-sourced contact
// emails are stored verbatim.
export const resolveByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await resolveEmailToContactClient(ctx, args.email);
  },
});

// Shared resolution logic — also used by the migrations backfill to relink
// historical replyEvents that ingested before this resolver existed.
export async function resolveEmailToContactClient(
  ctx: { db: any },
  email: string,
): Promise<{ contactId: string; clientId?: string } | null> {
  const lookup = async (e: string) =>
    await ctx.db
      .query("contacts")
      .withIndex("by_email", (q: any) => q.eq("email", e))
      .collect();

  let candidates = await lookup(email);
  const lower = email.toLowerCase();
  if (candidates.length === 0 && lower !== email) {
    candidates = await lookup(lower);
  }
  candidates = candidates.filter((c: any) => !c.isDeleted);
  if (candidates.length === 0) return null;

  // Path (1): a candidate with a direct clientId wins.
  const direct = candidates.find((c: any) => c.clientId);
  if (direct) {
    return { contactId: direct._id, clientId: direct.clientId };
  }

  // Path (2): bridge via a linked company that's been promoted to a client.
  for (const c of candidates) {
    for (const companyId of c.linkedCompanyIds ?? []) {
      const company = await ctx.db.get(companyId);
      if (company?.promotedToClientId) {
        return { contactId: c._id, clientId: company.promotedToClientId };
      }
    }
  }

  // Contact known, but no client linkage either way.
  return { contactId: candidates[0]._id, clientId: undefined };
}

// Helper (not a registered function): when a company is promoted to a
// client, back-fill clientId onto every contact linked to that company.
// Without this, contacts synced from HubSpot BEFORE the promotion keep
// linkedCompanyIds but never gain a clientId, so inbound replies from them
// don't link to the prospect. Mirrors getByClient's in-memory scan over
// linkedCompanyIds (array field, no compound index). Manually-assigned
// clientIds are never overwritten.
export async function backfillContactClientLinks(
  ctx: { db: any },
  companyId: string,
  clientId: string,
) {
  const all = await ctx.db.query("contacts").collect();
  for (const c of all) {
    if (c.isDeleted || c.clientId) continue;
    if ((c.linkedCompanyIds ?? []).some((id: string) => id === companyId)) {
      await ctx.db.patch(c._id, { clientId });
    }
  }
}

// Internal mutation: mark a contact as opted-out.
// Sets optedOutAt and audit trail back to the triggering replyEvent.
export const markOptedOutInternal = internalMutation({
  args: {
    contactId: v.id("contacts"),
    replyEventId: v.id("replyEvents"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.contactId, {
      optedOutAt: new Date().toISOString(),
      optedOutByReplyEventId: args.replyEventId,
    });
    return { ok: true };
  },
});
