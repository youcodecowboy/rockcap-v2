import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { buildAuthUrl } from '@/lib/google/oauth';
import crypto from 'crypto';

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    // Where to land after the OAuth round-trip. Only accept a same-origin
    // relative path (reject protocol-relative "//host" to avoid open redirect).
    const raw = new URL(request.url).searchParams.get('returnTo');
    const returnTo = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : undefined;
    const csrf = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(JSON.stringify({ userId, csrf, returnTo })).toString('base64');
    const url = buildAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Google auth error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
