import { v } from 'convex/values';
import { mutation } from '../_generated/server';

/**
 * One-shot: link a synced HubSpot company to an existing client.
 * Sets companies.promotedToClientId = (oldest client with matching name).
 *
 * Returns:
 *   { linked: true, clientId, alreadyLinked, multipleMatches }
 *   { linked: false, reason }
 *
 * Dupe handling: if multiple clients share the same (case-insensitive) name,
 * picks the OLDEST by createdAt and returns multipleMatches: true.
 *
 * Idempotent: running twice is safe. If already linked to the same client,
 * returns { linked: true, alreadyLinked: true }. If linked to a DIFFERENT
 * client, returns { linked: false, reason: "already linked to different client" }
 * — does NOT silently overwrite existing promotion links.
 */
export const backlinkCompanyToClient = mutation({
  args: {
    hubspotCompanyId: v.string(),
    clientName: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the synced Convex company by HubSpot ID
    const company = await ctx.db
      .query('companies')
      .withIndex('by_hubspot_id', (q) => q.eq('hubspotCompanyId', args.hubspotCompanyId))
      .first();

    if (!company) {
      return {
        linked: false as const,
        reason: `Company ${args.hubspotCompanyId} not found in Convex (sync first?)`,
      };
    }

    // Find matching clients by name (case-insensitive exact, non-deleted)
    const nameLower = args.clientName.toLowerCase();
    const allClients = await ctx.db.query('clients').collect();
    const matches = allClients.filter(
      (c) => c.name.toLowerCase() === nameLower && c.isDeleted !== true,
    );

    if (matches.length === 0) {
      return {
        linked: false as const,
        reason: `Client "${args.clientName}" not found`,
      };
    }

    // Pick OLDEST (by createdAt ascending)
    const picked = matches.slice().sort((a, b) => {
      const ta = a.createdAt ?? '';
      const tb = b.createdAt ?? '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    })[0]!;

    const multipleMatches = matches.length > 1;

    // Already linked to the same client? Idempotent success.
    if (company.promotedToClientId === picked._id) {
      return {
        linked: true as const,
        clientId: picked._id,
        alreadyLinked: true,
        multipleMatches,
      };
    }

    // Already linked to a DIFFERENT client? Refuse to overwrite.
    if (company.promotedToClientId && company.promotedToClientId !== picked._id) {
      return {
        linked: false as const,
        reason: `Company already linked to a different client (${String(company.promotedToClientId)}) — refusing to overwrite`,
      };
    }

    // Clean link: patch the company row.
    await ctx.db.patch(company._id, { promotedToClientId: picked._id });

    return {
      linked: true as const,
      clientId: picked._id,
      alreadyLinked: false,
      multipleMatches,
    };
  },
});
