import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getGoogleEmail } from '@/lib/google/oauth';
import { getAuthenticatedConvexClient } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/m-settings?google=denied', request.url));
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/m-settings?google=error', request.url));
  }

  try {
    const state = JSON.parse(Buffer.from(stateParam, 'base64').toString());
    if (!state.userId) {
      return NextResponse.redirect(new URL('/m-settings?google=error', request.url));
    }
    const tokens = await exchangeCodeForTokens(code);
    const email = await getGoogleEmail(tokens.access_token);
    const convex = await getAuthenticatedConvexClient();
    await convex.mutation(api.googleCalendar.saveTokens, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      connectedEmail: email,
    });
    return NextResponse.redirect(new URL('/m-settings?google=success', request.url));
  } catch (err) {
    console.error('Google callback error:', err);
    return NextResponse.redirect(new URL('/m-settings?google=error', request.url));
  }
}
