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

/**
 * Locate the 27 MEETING_NOTE activities and show where they actually
 * live (which companyId they're linked to + the associated company's
 * name + HubSpot ID). Tells us whether our fix needs to:
 *   (a) expand the query to also match on `hubspotCompanyIds[]`
 *   (b) re-link some activities to the right companyId
 *   (c) both
 */
export const whereAreMeetingNotes = query({
  args: {},
  handler: async (ctx) => {
    const meetingNotes = await ctx.db
      .query('activities')
      .withIndex('by_activity_type', (q) => q.eq('activityType', 'MEETING_NOTE'))
      .collect();

    const byCompany = new Map<
      string,
      { count: number; companyName: string | null; hubspotId: string | undefined; isBayfieldMentioned: boolean }
    >();

    for (const a of meetingNotes) {
      const companyId = (a as any).companyId ? String((a as any).companyId) : '(none)';
      const existing = byCompany.get(companyId);
      if (existing) {
        existing.count++;
      } else {
        let companyName: string | null = null;
        let hubspotId: string | undefined;
        if ((a as any).companyId) {
          const c: any = await ctx.db.get((a as any).companyId);
          companyName = c?.name ?? null;
          hubspotId = c?.hubspotCompanyId;
        }
        // Check if Bayfield HubSpot ID (163259202780) appears in the
        // activity's hubspotCompanyIds array — if yes, that means this
        // activity SHOULD logically also show on the Bayfield profile.
        const hubspotCompanyIds: string[] = (a as any).hubspotCompanyIds ?? [];
        const isBayfieldMentioned = hubspotCompanyIds.includes('163259202780');
        byCompany.set(companyId, {
          count: 1,
          companyName,
          hubspotId,
          isBayfieldMentioned,
        });
      }
    }

    return {
      totalMeetingNotes: meetingNotes.length,
      byCompany: Array.from(byCompany.entries()).map(([cid, info]) => ({
        companyId: cid,
        ...info,
      })),
      // Sample one full activity to see the full shape including
      // hubspotCompanyIds array
      sampleActivity: meetingNotes[0]
        ? {
            _id: String(meetingNotes[0]._id),
            subject: meetingNotes[0].subject,
            companyId: (meetingNotes[0] as any).companyId ? String((meetingNotes[0] as any).companyId) : null,
            hubspotCompanyId: (meetingNotes[0] as any).hubspotCompanyId,
            hubspotCompanyIds: (meetingNotes[0] as any).hubspotCompanyIds,
            hubspotContactIds: (meetingNotes[0] as any).hubspotContactIds,
            hubspotDealIds: (meetingNotes[0] as any).hubspotDealIds,
            linkedContactIds: (meetingNotes[0] as any).linkedContactIds,
            linkedDealIds: (meetingNotes[0] as any).linkedDealIds,
            activityDate: meetingNotes[0].activityDate,
          }
        : null,
    };
  },
});
