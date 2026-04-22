import { query } from '../_generated/server';

/**
 * One-off diagnostic: find activities that look like Fireflies.ai
 * call transcripts in Convex, and dump their full shape.
 *
 * Used to inspect the exact structure HubSpot sends (subject, body,
 * metadata.*) so we can design reliable detection logic before building
 * the "Fireflies note → meeting" transform. Delete this file after the
 * real feature ships.
 *
 * Run from the Convex dashboard:
 *   Functions tab → hubspotSync/_debug → findFirefliesActivity → Run
 *
 * Returns counts + up to 3 representative samples with enough detail
 * to design detection logic (text markers, URL patterns, metadata
 * source fields, etc.) without exposing full transcripts.
 */
export const findFirefliesActivity = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('activities').collect();

    // Match on any field that might carry a Fireflies marker.
    // Kept as a union of substring checks so we can see which signals
    // are strong vs weak — we'll narrow to a specific one once we see
    // real data.
    const matches = all.filter((a: any) => {
      const blob = [
        a.subject ?? '',
        a.bodyPreview ?? '',
        a.bodyHtml ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return (
        blob.includes('fireflies') ||
        blob.includes('call transcript') ||
        blob.includes('fireflies.ai')
      );
    });

    return {
      totalActivities: all.length,
      firefliesMatches: matches.length,
      // First 3 samples. Each is trimmed so the response stays well
      // under Convex's response-size limit.
      samples: matches.slice(0, 3).map((m: any) => ({
        _id: m._id,
        hubspotActivityId: m.hubspotActivityId,
        activityType: m.activityType,
        activityDate: m.activityDate,
        subject: m.subject,
        direction: m.direction,
        hubspotOwnerId: m.hubspotOwnerId,
        ownerName: m.ownerName,
        // Previews only — don't dump full transcripts into the debug
        // response.
        bodyPreview: m.bodyPreview?.slice(0, 500),
        bodyHtmlSnippet: m.bodyHtml?.slice(0, 2000),
        // The raw HubSpot engagement metadata — most likely to contain
        // the source-integration signal (app id, integration name,
        // transcript URL, etc.).
        metadata: m.metadata,
      })),
    };
  },
});
