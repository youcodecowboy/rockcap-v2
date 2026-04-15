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
    const { messages, context }: { messages: TaskAgentMessage[]; context: TaskAgentContext } = body;

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

    const systemPrompt = `You are a task creation assistant for a UK property finance team. Your job is to parse natural language task descriptions into structured tasks.

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
7. Interpret relative dates: "tomorrow" = next day, "friday" = next Friday, "next week" = next Monday, etc. Today is ${new Date().toISOString().split('T')[0]}.
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
