import { v } from 'convex/values';
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from '../_generated/server';
import { internal } from '../_generated/api';

/**
 * One-off migration: walk the activities table, find NOTE rows that
 * look like Fireflies.ai transcripts (same detection signal used at
 * sync time), and reclassify them in-place as MEETING_NOTE with
 * extracted metadata.
 *
 * Runs as an internalAction because we want to call into the parsing
 * library (fireflies.ts) which lives in src/ and can't be imported
 * from a Convex mutation. The action calls a bridge endpoint — same
 * pattern as recurringSync.ts and processWebhookEvent.
 *
 * Trigger from the Convex dashboard:
 *   Functions → hubspotSync/migrations → runFirefliesBackfill → Run
 *
 * Idempotent: re-running on already-migrated records is a no-op
 * (activityType is already MEETING_NOTE; detection doesn't match NOTE
 * anymore for those rows).
 */

const BATCH_SIZE = 50;

export const runFirefliesBackfill = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    maxBatches: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const maxBatches = args.maxBatches ?? 50; // safety cap

    const apiBase = process.env.NEXT_APP_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!apiBase || !cronSecret) {
      return { error: 'NEXT_APP_URL or CRON_SECRET not configured' };
    }

    const normalized = apiBase.match(/^https?:\/\//)
      ? apiBase
      : `https://${apiBase}`;
    const url = `${normalized.replace(/\/$/, '')}/api/hubspot/fireflies-backfill`;

    let cursor: string | null = null;
    let totalScanned = 0;
    let totalMatched = 0;
    let totalMigrated = 0;
    let batches = 0;
    const errors: string[] = [];

    while (batches < maxBatches) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': cronSecret,
        },
        body: JSON.stringify({ cursor, batchSize: BATCH_SIZE, dryRun }),
      });

      if (!res.ok) {
        errors.push(`batch ${batches}: HTTP ${res.status}`);
        break;
      }

      const json: any = await res.json();
      totalScanned += json.scanned ?? 0;
      totalMatched += json.matched ?? 0;
      totalMigrated += json.migrated ?? 0;
      batches++;

      if (json.isDone) break;
      cursor = json.nextCursor ?? null;
      if (!cursor) break;
    }

    return {
      totalScanned,
      totalMatched,
      totalMigrated,
      batches,
      dryRun,
      errors,
    };
  },
});

/**
 * Paginated page of NOTE-type activities for the Fireflies backfill.
 * Uses the by_activity_type index so we only scan notes.
 */
export const listNotePageForFirefliesBackfill = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query('activities')
      .withIndex('by_activity_type', (q) =>
        q.eq('activityType', 'NOTE'),
      )
      .order('desc')
      .paginate({
        numItems: args.pageSize ?? 50,
        cursor: args.cursor,
      });
    return {
      items: result.page.map((a: any) => ({
        _id: a._id,
        bodyHtml: a.bodyHtml,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * In-place reclassification of a NOTE activity as MEETING_NOTE with
 * the Fireflies-extracted metadata. Idempotent-friendly — if the
 * activity already has activityType='MEETING_NOTE', no-op.
 *
 * Exposed as a public `mutation` (not `internalMutation`) because
 * `fetchMutation` from `convex/nextjs` can only call public mutations.
 * The attack surface is gated by the bridge route's X-Cron-Secret
 * requirement — same trust model as enqueueWebhookEvent.
 */
export const reclassifyActivityAsFirefliesMeetingNote = mutation({
  args: {
    activityId: v.id('activities'),
    subject: v.string(),
    duration: v.optional(v.number()),
    toEmails: v.optional(v.array(v.string())),
    transcriptUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing: any = await ctx.db.get(args.activityId);
    if (!existing) return { found: false };
    if (existing.activityType === 'MEETING_NOTE') {
      return { found: true, alreadyMigrated: true };
    }

    const patch: Record<string, any> = {
      activityType: 'MEETING_NOTE',
      subject: args.subject,
      sourceIntegration: 'fireflies',
    };
    if (args.duration !== undefined) patch.duration = args.duration;
    if (args.toEmails !== undefined) patch.toEmails = args.toEmails;
    if (args.transcriptUrl !== undefined) {
      patch.transcriptUrl = args.transcriptUrl;
    }

    await ctx.db.patch(args.activityId, patch);
    return { found: true, migrated: true };
  },
});
