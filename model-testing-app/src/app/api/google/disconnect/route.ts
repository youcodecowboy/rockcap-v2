import { NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';
import { revokeToken } from '@/lib/google/oauth';

export async function POST() {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);

    const tokens = await convex.query(api.googleCalendar.getTokens, {});

    if (tokens?.refreshToken) {
      try {
        await revokeToken(tokens.refreshToken);
      } catch {
        // Token may already be revoked — continue with cleanup
      }
    }

    await convex.mutation(api.googleCalendar.disconnect, {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
