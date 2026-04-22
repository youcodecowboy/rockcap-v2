import { NextRequest, NextResponse } from 'next/server';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import {
  isFirefliesTranscript,
  parseFirefliesTranscript,
} from '@/lib/hubspot/fireflies';

/**
 * One-off migration endpoint: paginated scan of existing NOTE
 * activities, reclassify any that match the Fireflies signature.
 *
 * Auth: X-Cron-Secret header. Called only by the migration action in
 * convex/hubspotSync/migrations.ts.
 */

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret');
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { cursor, batchSize = 50, dryRun = false } = body;

  const page: any = await fetchQuery(
    api.hubspotSync.migrations.listNotePageForFirefliesBackfill,
    { cursor: cursor ?? null, pageSize: batchSize },
  );

  let matched = 0;
  let migrated = 0;
  for (const note of page.items) {
    const body = note.bodyHtml ?? '';
    if (!isFirefliesTranscript(body)) continue;
    matched++;

    if (dryRun) continue;

    const parsed = parseFirefliesTranscript(body);
    await fetchMutation(
      api.hubspotSync.migrations.reclassifyActivityAsFirefliesMeetingNote,
      {
        activityId: note._id,
        subject: parsed.title ?? 'Call transcript',
        duration: parsed.duration,
        toEmails: parsed.participantEmails,
        transcriptUrl: parsed.transcriptUrl,
      },
    );
    migrated++;
  }

  return NextResponse.json({
    scanned: page.items.length,
    matched,
    migrated,
    isDone: page.isDone,
    nextCursor: page.continueCursor,
    dryRun,
  });
}
