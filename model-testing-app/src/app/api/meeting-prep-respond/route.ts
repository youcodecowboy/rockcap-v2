import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { executeTool, getToolRegistry } from '@/lib/tools';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { MEETING_PREP_SKILL_PROMPT } from '@/lib/skillPrompts.generated';

// Meeting-prep responder — v1.1
//
// Called by the replyEventProcessor Convex action when a reply has been
// classified as `book_meeting`. Loads the meeting-prep SKILL.md as system
// prompt (responder mode section governs this invocation), exposes a focused
// 3-tool atomic surface (getContact, getClient, getProject) for relationship
// context, runs an agentic loop, and returns a structured response.
//
// Returns one of:
//   { draftReplySubject, draftReplyBody, draftReplyBodyHtml, suggestedSlots }
//   { escalate: true, reason: string }
//
// Pure-functional: this route does NOT write to Convex. The caller
// (replyEventProcessor in Group F) creates the approval row from the returned
// response. Approval semantics stay owned by the processor (one place).
//
// Auth: called by Convex action (no user session). Uses the same
// x-convex-internal-secret / CONVEX_INTERNAL_SECRET env var pattern as
// /api/cadence-compose and /api/bulk-analyze.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const SKILL_PATH = 'skills/skills/meeting-prep/SKILL.md';

// Narrow tool surface — meeting-prep responder only needs relationship context.
// Intelligence query tools are not needed; we just need to know who this
// contact is and what project/client they're associated with.
const ALLOWED_TOOL_NAMES = [
  'getContact',
  'getClient',
  'getProject',
];

let cachedSystemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  // ../skills/ is absent from the Vercel function bundle (outside the
  // project root) — fall back to the embedded copy, regenerated via
  // scripts/embed-skill-prompts.mjs.
  try {
    const repoRoot = path.resolve(process.cwd(), '..');
    const fullPath = path.join(repoRoot, SKILL_PATH);
    cachedSystemPrompt = await fs.readFile(fullPath, 'utf-8');
  } catch {
    cachedSystemPrompt = MEETING_PREP_SKILL_PROMPT;
  }
  return cachedSystemPrompt;
}

interface RespondRequest {
  replyEventId: string;
}

interface SuggestedSlot {
  startIso: string;
  label: string;
}

interface DraftReply {
  draftReplySubject: string;
  draftReplyBody: string;
  draftReplyBodyHtml: string;
  suggestedSlots: SuggestedSlot[];
}

interface EscalateDecision {
  escalate: true;
  reason: string;
}

type RespondResult = DraftReply | EscalateDecision;

export async function POST(request: NextRequest) {
  // Auth: accept calls from Convex actions (no Clerk session available).
  // Follows the same pattern as /api/cadence-compose and /api/bulk-analyze.
  const internalSecret = request.headers.get('x-convex-internal-secret');
  const isInternalCall =
    !!process.env.CONVEX_INTERNAL_SECRET &&
    internalSecret === process.env.CONVEX_INTERNAL_SECRET;

  if (!isInternalCall) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: RespondRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.replyEventId) {
    return NextResponse.json({ error: 'replyEventId required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 },
    );
  }

  // Use an unauthenticated Convex client — api.replyEvents.getById is a
  // public query accessible without user auth.
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || '';
  if (!convexUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_CONVEX_URL not configured' },
      { status: 500 },
    );
  }
  const convexClient = new ConvexHttpClient(convexUrl);

  // Load the reply event row. api.replyEvents.getById is added in Task 5.
  let replyEvent: any;
  try {
    replyEvent = await convexClient.query(
      api.replyEvents.getById,
      { replyEventId: body.replyEventId as Id<'replyEvents'> },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `failed to load replyEvent: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  if (!replyEvent) {
    return NextResponse.json({ error: 'replyEvent not found' }, { status: 404 });
  }

  const systemPrompt = await getSystemPrompt();

  // Build the user prompt with pre-fetched reply context so the model can
  // produce the draft without burning an extra round on a lookup.
  const userMessage = [
    'RESPONDER MODE INVOCATION.',
    '',
    'You are responding to a book_meeting reply from a prospect/contact.',
    'Follow the "## Responder mode" section of the meeting-prep SKILL.md.',
    '',
    `Reply event id: ${body.replyEventId}`,
    `Contact id: ${replyEvent.contactId ?? '(unknown)'}`,
    `Classified intent: ${replyEvent.classifiedIntent ?? '(unknown)'}`,
    `Classifier evidence: ${replyEvent.classifierEvidence ?? '(none)'}`,
    `Cancelled cadences: ${(replyEvent.cadencesCancelled ?? []).length}`,
    '',
    'Use the available tools to load the contact and any related client/project for relationship context.',
    '',
    'Compose a short availability response per the SKILL.md responder workflow.',
    'Propose 3 operator-default slots (next 3 business days at 10:00 UK time unless the relationship context suggests otherwise).',
    '',
    'Return ONLY a JSON object per the SKILL.md responder output contract — no prose, no code fence.',
    '',
    'If the reply was misclassified as book_meeting (contact is not actually requesting a meeting):',
    '  { "escalate": true, "reason": "<brief reason>" }',
    '',
    'Otherwise:',
    '  {',
    '    "draftReplySubject": "...",',
    '    "draftReplyBody": "... (plain text)",',
    '    "draftReplyBodyHtml": "... (html version)",',
    '    "suggestedSlots": [',
    '      { "startIso": "2026-01-15T10:00:00Z", "label": "Wednesday 15 Jan at 10:00 UK" },',
    '      ...',
    '    ]',
    '  }',
  ].join('\n');

  // Build Anthropic tool list from the registry.
  // getToolRegistry().getTool(name) looks up each atomic tool by name.
  // registry.formatForAnthropicTools([tools]) converts AtomicTool[] to Anthropic format.
  const registry = getToolRegistry();
  const atomicTools = ALLOWED_TOOL_NAMES
    .map((name) => registry.getTool(name))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);
  const anthropicTools = registry.formatForAnthropicTools(atomicTools) as Anthropic.Tool[];

  // Agentic loop: invoke the model, run any tool calls, repeat until the
  // model emits a final text response with the structured JSON output.
  // Capped at 6 rounds — responder should converge quickly with a narrow tool set.
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  for (let i = 0; i < 6; i++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools: anthropicTools,
        messages,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `anthropic api error: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 },
      );
    }

    // If the model wants to use tools, execute them and loop.
    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        try {
          // executeTool signature: (toolName, params, convexClient?)
          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, any>,
            convexClient,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Final response: extract text, parse JSON, return.
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    if (!textBlock) {
      return NextResponse.json(
        { error: 'no text in final response' },
        { status: 502 },
      );
    }

    // Strip any accidental code fences the model may have added.
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    let parsed: RespondResult;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: 'model response was not valid JSON', raw: textBlock.text },
        { status: 502 },
      );
    }

    return NextResponse.json(parsed);
  }

  // Loop exhausted without a final response.
  return NextResponse.json(
    { error: 'responder loop exceeded max iterations' },
    { status: 504 },
  );
}
