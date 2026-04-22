import { NextRequest, NextResponse, after } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api, internal } from '../../../../../convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const deployKey = process.env.CONVEX_DEPLOY_KEY;

// One long-lived client for queries. The internal-action invocation
// constructs its own client below so the auth surface is explicit.
const convex = new ConvexHttpClient(convexUrl);

export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id');
  const channelToken = request.headers.get('x-goog-channel-token');
  const resourceState = request.headers.get('x-goog-resource-state');

  // Initial handshake ping — Google sends this right after watchCalendar.
  // Return 200 immediately; nothing to sync yet.
  if (resourceState === 'sync') {
    return NextResponse.json({ ok: true });
  }

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channel ID' }, { status: 400 });
  }

  try {
    const channel = await convex.query(
      api.googleCalendar.getChannelByChannelId,
      { channelId },
    );
    if (!channel) {
      // Channel row has been deleted (e.g., user disconnected). Return 404
      // so Google stops retrying.
      return NextResponse.json({ error: 'Unknown channel' }, { status: 404 });
    }

    // Per-channel token authentication. Channels registered before this
    // change won't have a `token` field; accept them for a grace period
    // but log so we can track the migration.
    if (channel.token) {
      if (!channelToken || channelToken !== channel.token) {
        console.warn(
          `[google/webhook] channel-token mismatch for ${channelId}`,
        );
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      // TODO (2026-05-01): remove this grace branch. Channels registered
      // before Task 4 (2026-04-22) have no stored token. Google channels
      // expire after ~7 days, so by this date all pre-migration channels
      // will have been re-registered (with a token) during cron renewal.
      console.warn(
        `[google/webhook] channel ${channelId} has no stored token — pre-migration channel, allowing`,
      );
    }

    // Fire-and-forget: build a deploy-key client and invoke the internal
    // sync action. Don't await — Google's webhook has a 10s timeout, and
    // our action can take longer. The action writes its own log row so
    // failures are still visible.
    if (!deployKey) {
      console.error(
        '[google/webhook] CONVEX_DEPLOY_KEY is not set — fast-path sync disabled, relying on cron tick',
      );
      // Write a sync-log row so operators can see (via the DB) that
      // webhooks are silently no-op'ing. Internal mutations are out of
      // reach in this branch (no deploy key), so we call the narrow
      // public `recordWebhookBootstrapError` endpoint gated on the
      // channelId. Best-effort: if this also fails, we still fall
      // through to 200 below.
      try {
        await convex.mutation(
          api.googleCalendarLog.recordWebhookBootstrapError,
          {
            channelId,
            ranAt: new Date().toISOString(),
            error:
              'CONVEX_DEPLOY_KEY not configured — webhook cannot invoke internal sync action',
          },
        );
      } catch (logErr) {
        console.error(
          '[google/webhook] also failed to write bootstrap-error log row:',
          logErr,
        );
      }
      // Fall through to 200 — returning 5xx would cause Google to retry;
      // we'd rather drop the event and let the next cron tick catch up.
      return NextResponse.json({ ok: true });
    }
    const authedClient = new ConvexHttpClient(convexUrl);
    authedClient.setAuth(deployKey);

    // Run the sync after returning the response. `after()` tells Vercel's
    // runtime to keep the container alive until this completes; without
    // it, the fire-and-forget promise could be dropped when the container
    // freezes post-response (cron would backfill, but we'd lose the
    // low-latency fast path that's the whole point of push webhooks).
    after(async () => {
      try {
        await authedClient.action(internal.googleCalendarSync.syncForUser, {
          userId: channel.userId,
          trigger: 'webhook' as const,
        });
      } catch (err) {
        console.error('[google/webhook] syncForUser rejected:', err);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[google/webhook] error:', err);
    // Still return 200 so Google doesn't retry — the cron will catch up.
    return NextResponse.json({ ok: true });
  }
}
