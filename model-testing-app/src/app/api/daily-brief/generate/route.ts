import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';

const anthropic = new Anthropic();
const MODEL = 'claude-haiku-4-5-20251001';

export const maxDuration = 60;

export async function POST() {
  try {
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);

    // Gather all data in parallel
    const [tasks, metrics, events, flags, notifications, recentDocs, clients, projects] = await Promise.all([
      convex.query(api.tasks.getByUser, { includeCreated: true, includeAssigned: true }),
      convex.query(api.tasks.getMetrics, {}),
      convex.query(api.events.getUpcoming, { days: 1 }),
      convex.query(api.flags.getMyFlags, { status: 'open' as const }),
      convex.query(api.notifications.getRecent, { limit: 20, includeRead: false }),
      convex.query(api.documents.getRecent, { limit: 10 }),
      convex.query(api.clients.list, {}),
      convex.query(api.projects.list, {}),
    ]);

    // Build context for Claude
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const overdueTasks = (tasks || []).filter((t: any) =>
      t.status !== 'completed' && t.status !== 'cancelled' &&
      t.dueDate && new Date(t.dueDate) < now
    );

    const dueTodayTasks = (tasks || []).filter((t: any) =>
      t.status !== 'completed' && t.status !== 'cancelled' &&
      t.dueDate && t.dueDate.startsWith(todayStr)
    );

    const inProgressTasks = (tasks || []).filter((t: any) => t.status === 'in_progress');

    const recentlyCompleted = (tasks || []).filter((t: any) =>
      t.status === 'completed' && t.updatedAt && t.updatedAt > yesterday
    );

    const upcomingThisWeek = (tasks || []).filter((t: any) => {
      if (t.status === 'completed' || t.status === 'cancelled' || !t.dueDate) return false;
      const due = new Date(t.dueDate);
      const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return due > now && due <= weekOut && !t.dueDate.startsWith(todayStr);
    });

    const recentDocsLast24h = (recentDocs || []).filter((d: any) =>
      d.uploadedAt && d.uploadedAt > yesterday
    );

    const recentClients = (clients || []).filter((c: any) =>
      c._creationTime && new Date(c._creationTime) > new Date(yesterday)
    );

    const recentProjects = (projects || []).filter((p: any) =>
      p._creationTime && new Date(p._creationTime) > new Date(yesterday)
    );

    // Build client name lookup
    const clientMap = new Map((clients || []).map((c: any) => [c._id, c.name]));
    const resolveClient = (id: string) => clientMap.get(id) || 'Unknown';

    const dataContext = `
TODAY: ${todayStr}

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
${(events || []).map((e: any) => {
  const start = new Date(e.startTime);
  const end = new Date(e.endTime);
  const time = e.allDay ? 'All day' : `${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return `- ${time}: "${e.title}" (${e.location || 'No location'})${e.syncStatus === 'synced' ? ' [Google Calendar]' : ''}`;
}).join('\n') || 'No events today'}

OPEN FLAGS:
${(flags || []).slice(0, 5).map((f: any) => `- "${f.note || 'Flag'}" (${f.entityType || 'unknown'}) — priority: ${f.priority || 'normal'}, created ${f.createdAt}`).join('\n') || 'None'}

UNREAD NOTIFICATIONS (last 24h):
${(notifications || []).slice(0, 5).map((n: any) => `- [${n.type}] ${n.title}`).join('\n') || 'None'}
Total unread: ${(notifications || []).length}

ACTIVITY SINCE YESTERDAY:
- New documents filed: ${recentDocsLast24h.length}${recentDocsLast24h.length > 0 ? ' — ' + recentDocsLast24h.slice(0, 3).map((d: any) => `"${d.displayName || d.fileName}" (${d.clientName || 'Unassigned'})`).join(', ') : ''}
- New clients: ${recentClients.length}${recentClients.length > 0 ? ' — ' + recentClients.map((c: any) => c.name).join(', ') : ''}
- New projects: ${recentProjects.length}${recentProjects.length > 0 ? ' — ' + recentProjects.map((p: any) => p.name).join(', ') : ''}
- Tasks completed: ${recentlyCompleted.length}${recentlyCompleted.length > 0 ? ' — ' + recentlyCompleted.slice(0, 3).map((t: any) => `"${t.title}"`).join(', ') : ''}
- Open flags: ${(flags || []).length}

UPCOMING THIS WEEK:
${upcomingThisWeek.slice(0, 8).map((t: any) => `- "${t.title}" (${t.clientId ? resolveClient(t.clientId) : 'Personal'}) — due ${t.dueDate}`).join('\n') || 'Nothing upcoming'}
`;

    const systemPrompt = `You are a daily briefing assistant for a UK property finance team. Generate a structured daily brief from the data provided.

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
- Only include activity recap items with count > 0`;

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

    // Store in Convex
    await convex.mutation(api.dailyBriefs.save, {
      date: todayStr,
      content: briefContent,
      generatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, brief: briefContent });
  } catch (error) {
    console.error('Brief generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
