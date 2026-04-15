import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';
import { refreshAccessToken } from '@/lib/google/oauth';
import { insertEvent, updateEvent, deleteEvent, type CalendarEvent } from '@/lib/google/calendar';

async function getValidAccessToken(convex: any): Promise<string> {
  const tokens = await convex.query(api.googleCalendar.getTokens, {});
  if (!tokens) throw new Error('Google Calendar not connected');

  const expiresAt = new Date(tokens.expiresAt).getTime();
  const buffer = 5 * 60 * 1000;

  if (Date.now() > expiresAt - buffer) {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await convex.mutation(api.googleCalendar.updateAccessToken, {
      accessToken: refreshed.access_token,
      expiresAt: newExpiry,
    });
    return refreshed.access_token;
  }

  return tokens.accessToken;
}

export async function POST(request: NextRequest) {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);
    const accessToken = await getValidAccessToken(convex);
    const body = await request.json();

    const event: CalendarEvent = {
      summary: body.title,
      description: body.description,
      start: body.allDay
        ? { date: body.startDate }
        : { dateTime: body.startTime, timeZone: body.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: body.allDay
        ? { date: body.endDate || body.startDate }
        : { dateTime: body.endTime || body.startTime, timeZone: body.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone },
      attendees: body.attendees?.map((a: { email: string; name?: string }) => ({
        email: a.email,
        displayName: a.name,
      })),
    };

    const created = await insertEvent(accessToken, event);
    return NextResponse.json({ success: true, googleEventId: created.id });
  } catch (error) {
    console.error('Create event error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);
    const accessToken = await getValidAccessToken(convex);
    const body = await request.json();

    if (!body.googleEventId) {
      return NextResponse.json({ error: 'googleEventId required' }, { status: 400 });
    }

    const updates: Partial<CalendarEvent> = {};
    if (body.title) updates.summary = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.startTime) {
      updates.start = body.allDay
        ? { date: body.startDate }
        : { dateTime: body.startTime, timeZone: body.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
    if (body.endTime || body.endDate) {
      updates.end = body.allDay
        ? { date: body.endDate }
        : { dateTime: body.endTime, timeZone: body.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone };
    }

    await updateEvent(accessToken, body.googleEventId, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update event error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);
    const accessToken = await getValidAccessToken(convex);
    const { searchParams } = new URL(request.url);
    const googleEventId = searchParams.get('googleEventId');

    if (!googleEventId) {
      return NextResponse.json({ error: 'googleEventId required' }, { status: 400 });
    }

    await deleteEvent(accessToken, googleEventId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
