// Mobile-friendly task/event AI parser.
// Unlike /api/tasks/agent, this endpoint does not require Next.js cookie auth — the mobile app
// authenticates with Convex separately via Clerk Expo. This endpoint only does AI text parsing
// (no DB access, no PII exposure beyond what's already passed in by the client).
//
// The mobile app passes its full context (current user, clients, projects, users) in the body.
// The Anthropic API key stays server-side.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

export const runtime = 'nodejs';
export const maxDuration = 30;

// CORS headers — mobile app (web preview at :8081, native apps from any origin)
// can call this endpoint. The endpoint itself is harmless (just AI text parsing,
// no DB access), so a permissive CORS policy is acceptable here.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentContext {
  userId: string;
  userName?: string;
  clients?: { id: string; name: string }[];
  projects?: { id: string; name: string; clientId?: string }[];
  users?: { id: string; name: string }[];
  timeZone?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, context, mode = 'task' }: {
      messages: AgentMessage[];
      context: AgentContext;
      mode?: string;
    } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400, headers: corsHeaders });
    }
    if (!context?.userId) {
      return NextResponse.json({ error: 'context.userId is required' }, { status: 400, headers: corsHeaders });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Server is missing ANTHROPIC_API_KEY' }, { status: 500, headers: corsHeaders });
    }

    const anthropic = new Anthropic({ apiKey });

    const clients = context.clients || [];
    const projects = context.projects || [];
    const users = context.users || [];
    const tz = context.timeZone || 'Europe/London';
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });

    const clientList = clients.map(c => `- ${c.name} (ID: ${c.id})`).join('\n') || 'None';
    const projectList = projects.map(p => `- ${p.name} (ID: ${p.id})`).join('\n') || 'None';
    const userList = users.map(u => `- ${u.name} (ID: ${u.id})`).join('\n') || 'None';
    const currentUserName = context.userName || 'User';

    const taskPrompt = `You are a task creation assistant for a UK property finance team. Parse natural language into structured tasks.

CURRENT USER: ${currentUserName} (ID: ${context.userId})
TODAY: ${today} | NOW: ${now} | TIMEZONE: ${tz}

CLIENTS:
${clientList}

PROJECTS:
${projectList}

TEAM:
${userList}

INSTRUCTIONS:
1. Extract: title, description, due date, priority, assignees, client, project.
2. Match fuzzy names ("bayfield" → "Bayfield Homes").
3. If "me" or "myself" → use ID ${context.userId}.
4. Default priority "medium".
5. Tasks don't need a client. Don't guess a client unless confident.
6. If you have at minimum a clear title, return JSON. Otherwise ask ONE follow-up question.

Respond with ONLY a JSON code block:

When you have enough info:
\`\`\`json
{ "type": "task", "task": { "title": "...", "description": "...", "dueDate": "ISO or omit", "priority": "low|medium|high", "assignedTo": ["id"], "clientId": "id or omit", "projectId": "id or omit" } }
\`\`\`

When you need info:
\`\`\`json
{ "type": "message", "content": "Your follow-up question" }
\`\`\``;

    const meetingPrompt = `You are a meeting/event creation assistant for a UK property finance team. Parse natural language into structured calendar events.

CURRENT USER: ${currentUserName} (ID: ${context.userId})
TODAY: ${today} | NOW: ${now} | TIMEZONE: ${tz}

CLIENTS:
${clientList}

PROJECTS:
${projectList}

TEAM:
${userList}

INSTRUCTIONS:
1. Extract: title, start/end time, location, description, attendees, client, project.
2. Default duration 1 hour. Date-only → 10:00 start.
3. Times in ${tz} timezone.
4. Match fuzzy names.

Respond with ONLY a JSON code block:

When ready:
\`\`\`json
{ "type": "event", "event": { "title": "...", "description": "...", "startTime": "ISO", "endTime": "ISO", "location": "...", "attendees": ["id"], "clientId": "id or omit", "projectId": "id or omit" } }
\`\`\`

When you need info:
\`\`\`json
{ "type": "message", "content": "Your follow-up question" }
\`\`\``;

    const systemPrompt = mode === 'meeting' ? meetingPrompt : taskPrompt;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response type' }, { status: 500, headers: corsHeaders });
    }

    let jsonContent = content.text.trim();
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonContent = jsonMatch[1].trim();

    try {
      const result = JSON.parse(jsonContent);
      return NextResponse.json(result, { headers: corsHeaders });
    } catch {
      return NextResponse.json({ type: 'message', content: content.text }, { headers: corsHeaders });
    }
  } catch (error) {
    console.error('Mobile task parse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process' },
      { status: 500, headers: corsHeaders }
    );
  }
}
