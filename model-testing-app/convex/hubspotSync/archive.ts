import { v } from 'convex/values';
import { mutation } from '../_generated/server';

/**
 * Soft-archive a Convex record that was deleted in HubSpot.
 *
 * Called by the webhook processor on `*.deletion` events. Preserves all
 * linked activities/history — the record just gets a `archivedAt` ISO
 * timestamp. UI layers should filter `archivedAt !== undefined` from
 * default queries (separate follow-up task).
 *
 * If HubSpot later restores the record, the next `*.creation` webhook
 * runs `syncXFromHubSpot` which patches `archivedAt: undefined` — clearing
 * the archive flag and un-hiding the record.
 *
 * Returns { found, archived } for observability; never throws on "record
 * not found" — that's an expected no-op if the deletion arrived before
 * we ever synced the record.
 */

// Maps HubSpot objectTypeId → Convex table + the HubSpot ID field on that table.
const OBJECT_TYPE_MAP: Record<
  string,
  { table: 'companies' | 'contacts' | 'deals'; hubspotField: string }
> = {
  '0-1': { table: 'contacts', hubspotField: 'hubspotContactId' },
  '0-2': { table: 'companies', hubspotField: 'hubspotCompanyId' },
  '0-3': { table: 'deals', hubspotField: 'hubspotDealId' },
};

export const archiveHubSpotRecord = mutation({
  args: {
    objectType: v.string(), // "0-1" | "0-2" | "0-3"
    hubspotId: v.string(),
  },
  handler: async (ctx, { objectType, hubspotId }) => {
    const cfg = OBJECT_TYPE_MAP[objectType];
    if (!cfg) {
      return { found: false, reason: `unknown objectType: ${objectType}` };
    }

    const record: any = await ctx.db
      .query(cfg.table)
      .withIndex('by_hubspot_id', (q: any) => q.eq(cfg.hubspotField, hubspotId))
      .first();

    if (!record) {
      return { found: false, reason: 'no matching record' };
    }

    if (record.archivedAt) {
      return { found: true, archived: true, alreadyArchived: true };
    }

    await ctx.db.patch(record._id, {
      archivedAt: new Date().toISOString(),
    });

    return { found: true, archived: true };
  },
});
