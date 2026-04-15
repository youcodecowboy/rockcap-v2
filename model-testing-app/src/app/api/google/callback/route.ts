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
    console.log('[Google callback] Decoding state...');
    const state = JSON.parse(Buffer.from(stateParam, 'base64').toString());
    if (!state.userId) {
      console.error('[Google callback] No userId in state');
      return NextResponse.redirect(new URL('/m-settings?google=error', request.url));
    }

    console.log('[Google callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(code);
    console.log('[Google callback] Got tokens, fetching email...');

    const email = await getGoogleEmail(tokens.access_token);
    console.log('[Google callback] Email:', email);

    console.log('[Google callback] Getting Convex client...');
    const convex = await getAuthenticatedConvexClient();

    console.log('[Google callback] Saving tokens to Convex...');
    await convex.mutation(api.googleCalendar.saveTokens, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      connectedEmail: email,
    });

    console.log('[Google callback] Success!');
    return NextResponse.redirect(new URL('/m-settings?google=success', request.url));
  } catch (err) {
    console.error('[Google callback] ERROR:', err);
    return NextResponse.redirect(new URL('/m-settings?google=error', request.url));
  }
}
