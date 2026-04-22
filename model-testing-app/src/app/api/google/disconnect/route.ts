import { NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';
import { revokeToken } from '@/lib/google/oauth';

export async function POST() {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);

    // 1. Capture refresh token BEFORE the action deletes the tokens row.
    const tokens = await convex.query(api.googleCalendar.getTokens, {});
    const refreshToken = tokens?.refreshToken;

    // 2. Run the disconnect action first — it needs a still-valid access token
    //    to call Google's channels.stop before deleting the local rows.
    await convex.action(api.googleCalendar.disconnect, {});

    // 3. Best-effort revoke the refresh token on Google's side after cleanup.
    if (refreshToken) {
      try {
        await revokeToken(refreshToken);
      } catch (err) {
        // Token may already be revoked — continue silently.
        console.warn('[disconnect/route] revokeToken failed:', err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
