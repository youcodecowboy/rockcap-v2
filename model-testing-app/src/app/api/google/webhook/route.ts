import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id');
  const resourceState = request.headers.get('x-goog-resource-state');

  if (resourceState === 'sync') {
    return NextResponse.json({ ok: true });
  }

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channel ID' }, { status: 400 });
  }

  try {
    const channel = await convex.query(api.googleCalendar.getChannelByChannelId, { channelId });
    if (!channel) {
      return NextResponse.json({ error: 'Unknown channel' }, { status: 404 });
    }

    console.log(`Webhook received for channel ${channelId}, state: ${resourceState}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ ok: true });
  }
}
