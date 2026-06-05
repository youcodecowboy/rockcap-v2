import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { resolveEmailToContactClient } from "./contacts";

// One-off backfills for the inbound-reply → prospect linkage fix
// (2026-06-05). Both are cursor-paginated so they stay under mutation
// read limits — run repeatedly via `npx convex run` until nextCursor
// comes back null:
//
//   npx convex run migrations:backfillContactClientIds '{}'
//   npx convex run migrations:relinkReplyEvents '{}'

// Backfill contact.clientId from linkedCompanyIds → company.promotedToClientId.
// Contacts synced from HubSpot before their company was promoted to a client
// carry the company link but no clientId, so inbound replies from them never
// linked to the prospect. Promotion now back-fills going forward
// (backfillContactClientLinks); this catches the historical rows.
export const backfillContactClientIds = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("contacts")
      .paginate({ numItems: 500, cursor: args.cursor ?? null });
    let patched = 0;
    for (const c of page.page) {
      if (c.isDeleted || c.clientId) continue;
      for (const companyId of c.linkedCompanyIds ?? []) {
        const company = await ctx.db.get(companyId);
        if (company?.promotedToClientId) {
          await ctx.db.patch(c._id, { clientId: company.promotedToClientId });
          patched++;
          break;
        }
      }
    }
    return {
      scanned: page.page.length,
      patched,
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

// Relink replyEvents that ingested without a linkedClientId. Two repair
// paths, mirroring the fixed ingest-time resolution:
//   (1) the event matched a contact but the contact had no clientId at the
//       time — re-derive via the contact's (now backfilled) clientId or its
//       promoted-company bridge;
//   (2) the event matched no contact at all — retry the sender email against
//       the shared resolver (covers contacts synced after the reply arrived
//       and duplicate-contact .first() misses).
// Classification is NOT re-run — this only restores the prospect-page link.
export const relinkReplyEvents = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("replyEvents")
      .paginate({ numItems: 200, cursor: args.cursor ?? null });
    let relinked = 0;
    for (const r of page.page) {
      if (r.linkedClientId) continue;

      // Path (1): contact matched at ingest; resolve its client now.
      if (r.contactId) {
        const c = await ctx.db.get(r.contactId);
        let clientId = c?.clientId;
        if (!clientId && c) {
          for (const companyId of c.linkedCompanyIds ?? []) {
            const company = await ctx.db.get(companyId);
            if (company?.promotedToClientId) {
              clientId = company.promotedToClientId;
              break;
            }
          }
        }
        if (clientId) {
          await ctx.db.patch(r._id, { linkedClientId: clientId });
          relinked++;
        }
        continue;
      }

      // Path (2): no contact matched at ingest; retry by sender email.
      if (r.fromEmail) {
        const resolved = await resolveEmailToContactClient(ctx, r.fromEmail);
        if (resolved) {
          await ctx.db.patch(r._id, {
            contactId: resolved.contactId as any,
            ...(resolved.clientId
              ? { linkedClientId: resolved.clientId as any }
              : {}),
          });
          if (resolved.clientId) relinked++;
        }
      }
    }
    return {
      scanned: page.page.length,
      relinked,
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});
