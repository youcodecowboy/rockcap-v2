import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { resolveEmailToContactClient } from "./contacts";

// One-off: bulk-reject the stale pending approvals that accumulated while
// the reply-intent classifier was broken (every reply fell through to a
// pending client_communication "operator review" row — 227 of them by
// 2026-06-06) plus the pre-single-gate pending gmail_send rows. The
// operator confirmed all of these were handled manually outside the
// system. Scoped by entityType + a creation cutoff so any approval staged
// AFTER the fix is untouched.
//
//   npx convex run migrations:rejectStaleApprovals '{"beforeIso": "2026-06-06T15:00:00Z"}'
export const rejectStaleApprovals = internalMutation({
  args: {
    beforeIso: v.string(),
    cursor: v.optional(v.string()),
    // Defaults to the reply-router + cadence types; pass explicitly to
    // sweep other types (e.g. smoke-test skill_action/other rows).
    entityTypes: v.optional(v.array(v.string())),
    // Override the rejection reason recorded on each swept row. Defaults to
    // the original 2026-06-06 classifier-fix cleanup wording.
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const types = args.entityTypes ?? ["client_communication", "gmail_send"];
    const page = await ctx.db
      .query("approvals")
      .paginate({ numItems: 300, cursor: args.cursor ?? null });
    const now = new Date().toISOString();
    let rejected = 0;
    for (const a of page.page) {
      if (a.status !== "pending") continue;
      if (!types.includes(a.entityType)) continue;
      if (a.requestedAt >= args.beforeIso) continue;
      await ctx.db.patch(a._id, {
        status: "rejected",
        approvedAt: now,
        rejectedReason:
          args.reason ??
          "stale — handled manually outside the system; bulk-cleared 2026-06-06 after classifier fix",
      });
      rejected++;
    }
    return {
      scanned: page.page.length,
      rejected,
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

const GMAIL_TWIN_WINDOW_MS = 6 * 60 * 60 * 1000;

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

// Unlink historical contentless HubSpot-sweep rows that duplicate a
// Gmail-captured reply (same contact, received within the twin window).
// Ingest now skips these (processReplyEvent step 2.5); this hides the
// already-created ones from the prospect Replies tab by clearing
// linkedClientId. Rows are kept (not deleted) so any skillRun/approval
// references stay valid.
//
//   npx convex run migrations:unlinkHubspotSweepDuplicates '{}'
export const unlinkHubspotSweepDuplicates = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("replyEvents")
      .paginate({ numItems: 200, cursor: args.cursor ?? null });
    let unlinked = 0;
    for (const r of page.page) {
      if (r.source !== "hubspot_sync") continue;
      if (r.replyBodyText) continue; // manual paste — always has a body
      if (!r.contactId || !r.linkedClientId) continue;
      const t = Date.parse(r.receivedAt);
      const siblings = await ctx.db
        .query("replyEvents")
        .withIndex("by_contact", (q) => q.eq("contactId", r.contactId))
        .order("desc")
        .take(100);
      const twin = siblings.find(
        (s) =>
          s.source === "gmail_push" &&
          Math.abs(Date.parse(s.receivedAt) - t) <= GMAIL_TWIN_WINDOW_MS,
      );
      if (twin) {
        await ctx.db.patch(r._id, { linkedClientId: undefined });
        unlinked++;
      }
    }
    return {
      scanned: page.page.length,
      unlinked,
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});
