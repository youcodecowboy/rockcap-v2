import { NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';
import { refreshAccessToken } from '@/lib/google/oauth';
import { listEvents, watchCalendar } from '@/lib/google/calendar';
import crypto from 'crypto';

export async function POST() {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);

    const tokens = await convex.query(api.googleCalendar.getTokens, {});
    if (!tokens) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 });
    }

    let accessToken = tokens.accessToken;

    const expiresAt = new Date(tokens.expiresAt).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      accessToken = refreshed.access_token;
      await convex.mutation(api.googleCalendar.updateAccessToken, {
        accessToken: refreshed.access_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      });
    }

    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const eventsResponse = await listEvents(accessToken, {
      timeMin: now.toISOString(),
      timeMax: thirtyDaysOut.toISOString(),
    });

    const syncToken = eventsResponse.nextSyncToken || '';

    const channelId = crypto.randomUUID();
    const webhookUrl = `${process.env.GOOGLE_OAUTH_REDIRECT_URI?.replace('/api/google/callback', '')}/api/google/webhook`;

    let resourceId = '';
    let expiration = '';
    try {
      const watchResponse = await watchCalendar(accessToken, webhookUrl, channelId);
      resourceId = watchResponse.resourceId;
      expiration = watchResponse.expiration;
    } catch (err) {
      console.warn('Webhook setup failed (may need public URL):', err);
    }

    if (resourceId) {
      await convex.mutation(api.googleCalendar.saveChannel, {
        channelId,
        resourceId,
        expiration,
        syncToken,
      });
    }

    return NextResponse.json({
      success: true,
      eventsSynced: eventsResponse.items?.length ?? 0,
      webhookActive: !!resourceId,
    });
  } catch (error) {
    console.error('Setup sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
