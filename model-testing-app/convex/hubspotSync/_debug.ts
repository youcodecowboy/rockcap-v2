import { v } from 'convex/values';
import { query } from '../_generated/server';

/**
 * One-off diagnostic: find activities that look like Fireflies.ai
 * call transcripts in Convex, and dump their shape (subject, body
 * preview, metadata) so we can design reliable detection logic
 * before building the "Fireflies note → meeting" transform.
 *
 * Run from the Convex dashboard:
 *   Functions tab → hubspotSync/_debug → findFirefliesActivity → Run
 *
 * Accepts optional args to page through or tune the scan:
 *   { pageSize?: number, scanBodyHtml?: boolean }
 *
 * Default: read 25 most recent NOTE activities, scan subject +
 * bodyPreview only (not bodyHtml — transcripts are huge). If no
 * match found, call again with pageSize: 50 (single page read) or
 * scanBodyHtml: true (heavier but catches signals that only live in
 * the HTML body).
 *
 * Delete this file after the Fireflies transform feature ships.
 */
export const findFirefliesActivity = query({
  args: {
    pageSize: v.optional(v.number()),
    scanBodyHtml: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const pageSize = Math.min(args.pageSize ?? 25, 75);
    const scanBodyHtml = args.scanBodyHtml ?? false;

    // Narrow via by_activity_type index so we only read NOTE documents.
    // Fireflies transcripts always come in as notes; no point scanning
    // the full activities table (which hits the 16MB read limit).
    const notes = await ctx.db
      .query('activities')
      .withIndex('by_activity_type', (q) => q.eq('activityType', 'NOTE'))
      .order('desc')
      .take(pageSize);

    const matches = notes.filter((a: any) => {
      // By default scan only the small fields (subject + bodyPreview
      // capped at 400 chars during sync). Heavy `bodyHtml` only when
      // the caller opts in.
      const parts = [a.subject ?? '', a.bodyPreview ?? ''];
      if (scanBodyHtml) parts.push(a.bodyHtml ?? '');
      const blob = parts.join(' ').toLowerCase();
      return (
        blob.includes('fireflies') ||
        blob.includes('call transcript')
      );
    });

    return {
      scannedNotes: notes.length,
      scanBodyHtml,
      firefliesMatches: matches.length,
      // Return at most 2 samples to stay well under the response-size
      // limit. Each sample includes enough raw fields for us to design
      // detection logic without dumping full transcripts.
      samples: matches.slice(0, 2).map((m: any) => ({
        _id: m._id,
        hubspotActivityId: m.hubspotActivityId,
        activityType: m.activityType,
        activityDate: m.activityDate,
        subject: m.subject,
        direction: m.direction,
        hubspotOwnerId: m.hubspotOwnerId,
        ownerName: m.ownerName,
        bodyPreview: m.bodyPreview?.slice(0, 500),
        // Head (2KB) + tail (500B) of bodyHtml — enough to see Fireflies
        // URL markers at the top AND any integration signature at the
        // bottom, without dumping the full transcript.
        bodyHtmlHead: m.bodyHtml?.slice(0, 2000),
        bodyHtmlTail:
          m.bodyHtml && m.bodyHtml.length > 2500
            ? m.bodyHtml.slice(-500)
            : null,
        bodyHtmlLength: m.bodyHtml?.length ?? 0,
        // Raw HubSpot engagement metadata — most likely place for the
        // source-integration signal (app id, source, transcript URL).
        metadata: m.metadata,
      })),
    };
  },
});
