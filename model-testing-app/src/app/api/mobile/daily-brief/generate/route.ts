// Mobile-friendly daily-brief generator.
//
// Unlike /api/daily-brief/generate, this endpoint does not touch Convex directly and
// does not require Next.js cookie auth. The mobile app authenticates with Convex
// separately via Clerk Expo and gathers its own data (tasks, events, flags, etc.)
// via authenticated Convex queries. It POSTs that data here; this endpoint only
// performs the AI parsing and returns a structured JSON brief. The mobile client
// then persists the brief via the `dailyBriefs.save` Convex mutation.
//
// The Anthropic API key stays server-side. The endpoint does no DB reads/writes,
// so a permissive CORS policy is acceptable (same posture as /api/mobile/tasks/parse).

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const MODEL = 'claude-haiku-4-5-20251001';

export const runtime = 'nodejs';
export const maxDuration = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ---------------------------------------------------------------------------
// Input shape — the mobile client gathers these via authenticated Convex queries.
// Fields intentionally loose (using `any` arrays) because the Convex shapes
// evolve; this route only reads a handful of well-known keys defensively.
// ---------------------------------------------------------------------------

interface GenerateBody {
  scope?: 'personal' | 'organization';
  tasks?: any[];            // tasks.getByUser
  metrics?: {               // tasks.getMetrics
    total?: number;
  } | null;
  events?: any[];           // events.getUpcoming (days: 1)
  flags?: any[];            // flags.getMyFlags
  notifications?: any[];    // notifications.getRecent
  recentDocs?: any[];       // documents.getRecent
  clients?: { _id: string; name: string; _creationTime?: number }[];
  projects?: { _id: string; name: string; _creationTime?: number }[];
  // hubspotSync.dailyBriefSummary payload — new 2026-04-17. Gives the brief
  // a "CRM pulse" section (activity counts by type, new deals/contacts,
  // notable engagement subjects).
  hubspot?: {
    activitiesByType?: Record<string, number>;
    activitiesTotal?: number;
    notableActivities?: Array<{
      type: string;
      subject?: string;
      preview?: string;
      ownerName?: string;
      activityDate?: string;
    }>;
    newDealsCount?: number;
    newDealNames?: string[];
    newContactsCount?: number;
    newContactNames?: string[];
  } | null;
  // Google Calendar reconnect flag — mobile client derives this from
  // api.googleCalendar.getSyncStatus and passes it in. Older clients that
  // don't send this field simply skip the warning (safe fallback).
  calendarNeedsReconnect?: boolean;
  timeZone?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateBody;
    const {
      scope = 'personal',
      tasks = [],
      metrics,
      events = [],
      flags = [],
      notifications = [],
      recentDocs = [],
      clients = [],
      projects = [],
      hubspot,
      calendarNeedsReconnect = false,
    } = body ?? {};

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const overdueTasks = tasks.filter((t: any) =>
      t.status !== 'completed' && t.status !== 'cancelled' &&
      t.dueDate && new Date(t.dueDate) < now,
    );

    const dueTodayTasks = tasks.filter((t: any) =>
      t.status !== 'completed' && t.status !== 'cancelled' &&
      t.dueDate && String(t.dueDate).startsWith(todayStr),
    );

    const inProgressTasks = tasks.filter((t: any) => t.status === 'in_progress');

    const recentlyCompleted = tasks.filter((t: any) =>
      t.status === 'completed' && t.updatedAt && t.updatedAt > yesterdayIso,
    );

    const upcomingThisWeek = tasks.filter((t: any) => {
      if (t.status === 'completed' || t.status === 'cancelled' || !t.dueDate) return false;
      const due = new Date(t.dueDate);
      const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return due > now && due <= weekOut && !String(t.dueDate).startsWith(todayStr);
    });

    const recentDocsLast24h = recentDocs.filter((d: any) =>
      d.uploadedAt && d.uploadedAt > yesterdayIso,
    );

    const recentClients = clients.filter((c: any) =>
      c._creationTime && new Date(c._creationTime) > new Date(yesterdayIso),
    );

    const recentProjects = projects.filter((p: any) =>
      p._creationTime && new Date(p._creationTime) > new Date(yesterdayIso),
    );

    const clientMap = new Map(clients.map((c: any) => [c._id, c.name]));
    const resolveClient = (id: string) => clientMap.get(id) || 'Unknown';

    const calendarWarningBlock = calendarNeedsReconnect
      ? `⚠️ GOOGLE CALENDAR DISCONNECTED — the user's Google Calendar connection has expired. Event sync is paused until they reconnect in Settings → Integrations. This MUST appear as a high-urgency item in attentionNeeded.

`
      : '';

    const dataContext = `${calendarWarningBlock}
TODAY: ${todayStr}
SCOPE: ${scope}

TASK METRICS:
- Total active: ${metrics?.total || 0}
- Overdue: ${overdueTasks.length}
- Due today: ${dueTodayTasks.length}
- In progress: ${inProgressTasks.length}
- Completed yesterday: ${recentlyCompleted.length}

OVERDUE TASKS:
${overdueTasks.slice(0, 10).map((t: any) => `- "${t.title}" (${t.clientId ? resolveClient(t.clientId) : 'Personal'}) — due ${t.dueDate}`).join('\n') || 'None'}

DUE TODAY:
${dueTodayTasks.slice(0, 10).map((t: any) => `- "${t.title}" (${t.clientId ? resolveClient(t.clientId) : 'Personal'}) — priority: ${t.priority || 'medium'}`).join('\n') || 'None'}

IN PROGRESS:
${inProgressTasks.slice(0, 5).map((t: any) => `- "${t.title}" (${t.clientId ? resolveClient(t.clientId) : 'Personal'})`).join('\n') || 'None'}

TODAY'S CALENDAR EVENTS:
${events.map((e: any) => {
  const start = new Date(e.startTime);
  const end = new Date(e.endTime);
  const time = e.allDay ? 'All day' : `${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return `- ${time}: "${e.title}" (${e.location || 'No location'})${e.syncStatus === 'synced' ? ' [Google Calendar]' : ''}`;
}).join('\n') || 'No events today'}

OPEN FLAGS:
${flags.slice(0, 5).map((f: any) => `- "${f.note || 'Flag'}" (${f.entityType || 'unknown'}) — priority: ${f.priority || 'normal'}, created ${f.createdAt}`).join('\n') || 'None'}

UNREAD NOTIFICATIONS (last 24h):
${notifications.slice(0, 5).map((n: any) => `- [${n.type}] ${n.title}`).join('\n') || 'None'}
Total unread: ${notifications.length}

ACTIVITY SINCE YESTERDAY:
- New documents filed: ${recentDocsLast24h.length}${recentDocsLast24h.length > 0 ? ' — ' + recentDocsLast24h.slice(0, 3).map((d: any) => `"${d.displayName || d.fileName}" (${d.clientName || 'Unassigned'})`).join(', ') : ''}
- New clients: ${recentClients.length}${recentClients.length > 0 ? ' — ' + recentClients.map((c: any) => c.name).join(', ') : ''}
- New projects: ${recentProjects.length}${recentProjects.length > 0 ? ' — ' + recentProjects.map((p: any) => p.name).join(', ') : ''}
- Tasks completed: ${recentlyCompleted.length}${recentlyCompleted.length > 0 ? ' — ' + recentlyCompleted.slice(0, 3).map((t: any) => `"${t.title}"`).join(', ') : ''}
- Open flags: ${flags.length}

UPCOMING THIS WEEK:
${upcomingThisWeek.slice(0, 8).map((t: any) => `- "${t.title}" (${t.clientId ? resolveClient(t.clientId) : 'Personal'}) — due ${t.dueDate}`).join('\n') || 'Nothing upcoming'}

HUBSPOT ACTIVITY (last 24h):
- Total engagements: ${hubspot?.activitiesTotal ?? 0}${
      hubspot?.activitiesByType
        ? ' (' +
          Object.entries(hubspot.activitiesByType)
            .map(([type, n]) => `${String(type).toLowerCase()}: ${n}`)
            .join(', ') +
          ')'
        : ''
    }
- New contacts synced: ${hubspot?.newContactsCount ?? 0}${
      hubspot?.newContactNames && hubspot.newContactNames.length > 0
        ? ' — ' + hubspot.newContactNames.join(', ')
        : ''
    }
- New deals synced: ${hubspot?.newDealsCount ?? 0}${
      hubspot?.newDealNames && hubspot.newDealNames.length > 0
        ? ' — ' + hubspot.newDealNames.join(', ')
        : ''
    }
${
  hubspot?.notableActivities && hubspot.notableActivities.length > 0
    ? '\nNotable engagements:\n' +
      hubspot.notableActivities
        .map(
          (a) =>
            `- [${a.type}]${a.ownerName ? ` ${a.ownerName}:` : ''} ${a.subject || a.preview || '(no subject)'}`,
        )
        .join('\n')
    : ''
}
`;

    const scopeLine =
      scope === 'organization'
        ? 'This is an ORGANIZATION-WIDE brief. Frame observations across the whole team — "the team", "across clients".'
        : 'This is a PERSONAL brief for the signed-in user. Frame observations in the first/second person — "you", "your day".';

    const systemPrompt = `You are a daily briefing assistant for a UK property finance team. Generate a structured daily brief from the data provided.

${scopeLine}

Respond with ONLY a JSON object (no markdown, no code fences) matching this exact structure:

{
  "summary": {
    "overdue": <number>,
    "dueToday": <number>,
    "meetings": <number>,
    "openFlags": <number>
  },
  "attentionNeeded": {
    "items": [
      {
        "type": "task" or "flag",
        "title": "Short descriptive title",
        "context": "Client/project · why it needs attention",
        "urgency": "high" or "medium"
      }
    ],
    "insight": "1-2 sentence AI observation connecting items or suggesting action"
  },
  "todaySchedule": {
    "items": [
      {
        "type": "event" or "task",
        "time": "09:00",
        "title": "Event or task title",
        "context": "Client/project · duration or detail"
      }
    ],
    "insight": "1-2 sentence observation about the day (e.g. connecting a meeting to an overdue item)"
  },
  "activityRecap": {
    "items": [
      {
        "type": "documents" or "clients" or "projects" or "messages" or "flags" or "tasks",
        "count": <number>,
        "summary": "Brief description of what happened"
      }
    ],
    "insight": "1-2 sentence observation about activity patterns"
  },
  "lookingAhead": {
    "items": [
      {
        "title": "Upcoming item description",
        "context": "Client/project · when it's due",
        "urgency": "high" or "medium" or "low"
      }
    ],
    "insight": "1-2 sentence observation about upcoming priorities"
  }
}

RULES:
- Keep items concise — one line each
- Maximum 5 items per section
- Insights should connect information across sections when possible
- Flag items that are at risk of becoming problems
- If there are no items for a section, return an empty items array with a positive insight like "All clear — nothing urgent"
- Sort attention items by urgency (high first)
- Sort schedule items chronologically
- Only include activity recap items with count > 0
- If the input begins with a ⚠️ GOOGLE CALENDAR DISCONNECTED block, include a
  high-urgency item in attentionNeeded.items with type "flag", title
  "Reconnect Google Calendar", context "Calendar sync is paused · reconnect
  in Settings", and urgency "high". Lead the attentionNeeded.insight with a
  reminder to reconnect before the day's meetings drift out of sync.`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: dataContext }],
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON — handle possible markdown fencing
    let jsonStr = text.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const briefContent = JSON.parse(jsonStr);

    return NextResponse.json(
      { success: true, brief: briefContent, date: todayStr },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error('[mobile/daily-brief/generate] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
