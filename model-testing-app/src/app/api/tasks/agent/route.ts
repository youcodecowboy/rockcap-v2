import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';

const MODEL = 'claude-haiku-4-5-20251001';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface TaskAgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TaskAgentContext {
  userId: string;
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId?: string }[];
  users: { id: string; name: string }[];
}

export async function POST(request: NextRequest) {
  try {
    const client = await getAuthenticatedConvexClient();
    let currentUser: any;
    try {
      currentUser = await requireAuth(client);
    } catch {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { messages, context, mode = 'task' }: { messages: TaskAgentMessage[]; context: TaskAgentContext; mode?: string } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const anthropic = new Anthropic({ apiKey });

    const clientList = context.clients.map(c => `- ${c.name} (ID: ${c.id})`).join('\n') || 'None';
    const projectList = context.projects.map(p => `- ${p.name} (ID: ${p.id})`).join('\n') || 'None';
    const userList = context.users.map(u => `- ${u.name} (ID: ${u.id})`).join('\n') || 'None';
    const currentUserName = currentUser.name || currentUser.email;

    const taskSystemPrompt = `You are a task creation assistant for a UK property finance team. Your job is to parse natural language task descriptions into structured tasks.

CURRENT USER: ${currentUserName} (ID: ${context.userId})

AVAILABLE CLIENTS:
${clientList}

AVAILABLE PROJECTS:
${projectList}

TEAM MEMBERS:
${userList}

INSTRUCTIONS:
1. Parse the user's message to extract: title, description, due date, priority, assignees, client, and project.
2. Be smart about matching — "bayfield" matches "Bayfield Homes", "alex" matches "Alex Smith", etc.
3. If you are confident you have enough information (at minimum: a clear title), respond with a JSON task object.
4. If critical information is missing or ambiguous, ask ONE targeted follow-up question.
5. Default priority to "medium" if not mentioned.
6. If the user says "me" or "myself" for assignment, use their ID: ${context.userId}
7. Interpret relative dates: "tomorrow" = next day, "friday" = next Friday, "next week" = next Monday, etc. Today is ${new Date().toISOString().split('T')[0]}. The user's timezone is ${context.timeZone || 'Europe/London'}. All times should be interpreted in that timezone.
8. Tasks do NOT need to be linked to a client — they can be personal/general tasks. If the task clearly relates to a client, match it. If it's unclear whether the task is client-related or personal, ask: "Is this a personal task or related to a specific client?" Do NOT guess a client — only assign one when you're confident.

RESPONSE FORMAT:
When you have enough info, respond with ONLY a JSON block (no other text):
\`\`\`json
{
  "type": "task",
  "task": {
    "title": "Clear, concise task title",
    "description": "Optional longer description",
    "dueDate": "2026-04-11T17:00:00.000Z",
    "priority": "low" | "medium" | "high",
    "assignedTo": ["user-id-1", "user-id-2"],
    "clientId": "client-id or omit if personal task",
    "projectId": "project-id or omit if not applicable"
  }
}
\`\`\`

When you need more info, respond with ONLY a JSON block:
\`\`\`json
{
  "type": "message",
  "content": "Your follow-up question here"
}
\`\`\`

ALWAYS respond with a JSON block. Never respond with plain text.`;

    const meetingSystemPrompt = `You are a meeting/event creation assistant for a UK property finance team. Your job is to parse natural language descriptions into structured calendar events.

CURRENT USER: ${currentUserName} (ID: ${context.userId})

AVAILABLE CLIENTS:
${clientList}

AVAILABLE PROJECTS:
${projectList}

TEAM MEMBERS (potential attendees):
${userList}

INSTRUCTIONS:
1. Parse the user's message to extract: title, start date/time, end date/time or duration, location, description, attendees, client, project, reminders, recurrence, and video link.
2. Be smart about matching names — "bayfield" matches "Bayfield Homes", "john" matches team members.
3. Default duration to 1 hour if not specified.
4. If the user specifies a time, set start and end. If only a date, make it a 1-hour meeting at 10:00.
5. Interpret relative dates: "tomorrow" = next day, "friday" = next Friday. Today is ${new Date().toISOString().split('T')[0]}. Current time is ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: context.timeZone || 'Europe/London' })} in ${context.timeZone || 'Europe/London'} timezone.
6. IMPORTANT: All times should be in the user's timezone (${context.timeZone || 'Europe/London'}). When the user says "3pm", they mean 15:00 in their local timezone. Output ISO timestamps adjusted for their timezone offset.
7. For recurrence, use simple descriptions: "weekly", "daily", "monthly", "every Tuesday".
8. For reminders, default to 30 minutes popup if not specified.
9. Attendees should be matched to team member IDs when possible.

RESPONSE FORMAT:
When you have enough info, respond with ONLY a JSON block:
\`\`\`json
{
  "type": "event",
  "event": {
    "title": "Meeting title",
    "description": "Optional description",
    "startTime": "2026-04-11T14:00:00.000Z",
    "endTime": "2026-04-11T15:00:00.000Z",
    "duration": 60,
    "location": "42 High St or omit",
    "attendees": ["user-id-1"],
    "clientId": "client-id or omit",
    "projectId": "project-id or omit",
    "reminders": [{"method": "popup", "minutes": 30}],
    "recurrence": "weekly or omit",
    "videoLink": "url or omit"
  }
}
\`\`\`

When you need more info:
\`\`\`json
{
  "type": "message",
  "content": "Your follow-up question"
}
\`\`\`

ALWAYS respond with a JSON block. Never respond with plain text.`;

    const systemPrompt = mode === 'meeting' ? meetingSystemPrompt : taskSystemPrompt;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Extract JSON from response
    let jsonContent = content.text.trim();
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    const result = JSON.parse(jsonContent);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in task agent:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process task' },
      { status: 500 }
    );
  }
}
