import { v } from 'convex/values';
import { query } from '../_generated/server';

/**
 * One-off diagnostic: check which of multiple duplicate clients actually
 * has MEETING_NOTE activities linked via the company → promoted-to-client
 * chain.
 *
 * The user has 3 "Bayfield Homes" clients; we need to figure out which
 * one (if any) is linked to the company that owns the 27 MEETING_NOTE
 * activities migrated from Fireflies.
 *
 * Run from the Convex dashboard:
 *   Functions → hubspotSync/_debug → whichClientHasMeetingNotes → Run
 *
 * Delete this file once the duplicate-clients issue is resolved.
 */
export const whichClientHasMeetingNotes = query({
  args: {
    clientIds: v.array(v.id('clients')),
  },
  handler: async (ctx, args) => {
    const results = [] as Array<{
      clientId: string;
      clientName: string | null;
      companyCount: number;
      companies: Array<{
        _id: string;
        name: string;
        hubspotCompanyId: string | undefined;
        meetingNoteCount: number;
        noteCount: number;
        totalActivities: number;
      }>;
    }>;

    for (const clientId of args.clientIds) {
      const client: any = await ctx.db.get(clientId);

      const companies = await ctx.db
        .query('companies')
        .withIndex('by_promoted', (q) => q.eq('promotedToClientId', clientId))
        .collect();

      const companyDetails = [] as any[];
      for (const c of companies) {
        // Count activities per type for this company — use the
        // by_company index to bound the read.
        const activities = await ctx.db
          .query('activities')
          .withIndex('by_company', (q) => q.eq('companyId', c._id))
          .collect();

        const meetingNoteCount = activities.filter(
          (a: any) => a.activityType === 'MEETING_NOTE',
        ).length;
        const noteCount = activities.filter(
          (a: any) => a.activityType === 'NOTE',
        ).length;

        companyDetails.push({
          _id: String(c._id),
          name: c.name,
          hubspotCompanyId: c.hubspotCompanyId,
          meetingNoteCount,
          noteCount,
          totalActivities: activities.length,
        });
      }

      results.push({
        clientId: String(clientId),
        clientName: client?.name ?? null,
        companyCount: companies.length,
        companies: companyDetails,
      });
    }

    return results;
  },
});
