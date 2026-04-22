const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  recurrence?: string[];
  reminders?: { useDefault: boolean; overrides?: { method: string; minutes: number }[] };
}

interface EventsListResponse {
  items: CalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

interface WatchResponse {
  id: string;
  resourceId: string;
  expiration: string;
}

async function calendarFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${err}`);
  }

  return res;
}

export async function listEvents(
  accessToken: string,
  opts: { syncToken?: string; timeMin?: string; timeMax?: string },
): Promise<EventsListResponse> {
  const params = new URLSearchParams();
  if (opts.syncToken) {
    params.set('syncToken', opts.syncToken);
  } else {
    if (opts.timeMin) params.set('timeMin', opts.timeMin);
    if (opts.timeMax) params.set('timeMax', opts.timeMax);
    params.set('singleEvents', 'true');
    params.set('orderBy', 'startTime');
  }
  params.set('maxResults', '250');

  const res = await calendarFetch(
    `/calendars/primary/events?${params.toString()}`,
    accessToken,
  );
  return res.json();
}

export async function insertEvent(
  accessToken: string,
  event: CalendarEvent,
): Promise<CalendarEvent> {
  const res = await calendarFetch('/calendars/primary/events', accessToken, {
    method: 'POST',
    body: JSON.stringify(event),
  });
  return res.json();
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  event: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  const res = await calendarFetch(`/calendars/primary/events/${eventId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(event),
  });
  return res.json();
}

export async function deleteEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  await calendarFetch(`/calendars/primary/events/${eventId}`, accessToken, {
    method: 'DELETE',
  });
}

export async function watchCalendar(
  accessToken: string,
  webhookUrl: string,
  channelId: string,
  token: string,
): Promise<WatchResponse> {
  const res = await calendarFetch('/calendars/primary/events/watch', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token,  // Google passes this back as `x-goog-channel-token` on every webhook
    }),
  });
  return res.json();
}

export async function stopChannel(
  accessToken: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  await fetch(`${CALENDAR_API}/channels/stop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}

export type { CalendarEvent, EventsListResponse, WatchResponse };
