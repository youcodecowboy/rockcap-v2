import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { executeTool, getToolRegistry } from '@/lib/tools';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { QUALIFY_AND_DRAFT_SKILL_PROMPT } from '@/lib/skillPrompts.generated';
import { extractJsonObject } from '@/lib/extractJsonObject';

// Reply-draft composer — reply lifecycle.
//
// Called by the replyEventProcessor Convex action when an inbound reply has been
// classified as `info_question` or `positive`. Loads the qualify-and-draft
// SKILL.md as the system prompt, exposes a focused atomic-tool surface
// (getContact, getClient, getProject, getClientIntelligence) for grounded
// answers, runs an agentic loop, and returns a structured draft reply.
//
// Returns one of:
//   { draftReplySubject, draftReplyBody, draftReplyBodyHtml, reasoning }
//   { escalate: true, reason: string }
//
// Pure-functional: this route does NOT write to Convex. The caller
// (replyEventProcessor) stages the email_reply approval from the returned
// response — approval semantics stay owned by the processor (one place), exactly
// like the meeting-prep-respond contract.
//
// Auth: called by a Convex action (no user session). Uses the same
// x-convex-internal-secret / CONVEX_INTERNAL_SECRET env pattern as
// /api/meeting-prep-respond and /api/classify-reply-intent. The route must be on
// the Clerk public-route allowlist (see middleware) so the cookie-less
// server-to-server POST isn't 404'd by middleware.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const SKILL_PATH = 'skills/skills/qualify-and-draft/SKILL.md';

// Narrow tool surface — the responder needs relationship + intel context to
// answer a question / acknowledge a positive reply, nothing more.
const ALLOWED_TOOL_NAMES = [
  'getContact',
  'getClient',
  'getProject',
  'getClientIntelligence',
];

let cachedSystemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  // ../skills/ is absent from the Vercel function bundle (outside the project
  // root) — fall back to the embedded copy, regenerated via
  // scripts/embed-skill-prompts.mjs.
  try {
    const repoRoot = path.resolve(process.cwd(), '..');
    const fullPath = path.join(repoRoot, SKILL_PATH);
    cachedSystemPrompt = await fs.readFile(fullPath, 'utf-8');
  } catch {
    cachedSystemPrompt = QUALIFY_AND_DRAFT_SKILL_PROMPT;
  }
  return cachedSystemPrompt;
}

interface DraftRequest {
  replyEventId: string;
}

interface DraftReply {
  draftReplySubject: string;
  draftReplyBody: string;
  draftReplyBodyHtml: string;
  reasoning: string;
}

interface EscalateDecision {
  escalate: true;
  reason: string;
}

type DraftResult = DraftReply | EscalateDecision;

export async function POST(request: NextRequest) {
  // Auth: accept calls from Convex actions (no Clerk session available).
  const internalSecret = request.headers.get('x-convex-internal-secret');
  const isInternalCall =
    !!process.env.CONVEX_INTERNAL_SECRET &&
    internalSecret === process.env.CONVEX_INTERNAL_SECRET;

  if (!isInternalCall) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: DraftRequest;
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

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || '';
  if (!convexUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_CONVEX_URL not configured' },
      { status: 500 },
    );
  }
  const convexClient = new ConvexHttpClient(convexUrl);

  // Load the reply event row. api.replyEvents.getById is a public query.
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

  // Pre-fetch the inbound context into the user prompt so the model can draft
  // without burning an extra round on a lookup.
  const userMessage = [
    'AUTO-DRAFT INVOCATION (reply lifecycle).',
    '',
    'You are drafting a reply to an inbound message from a prospect/contact.',
    'Follow the qualify-and-draft SKILL.md workflow (compose step). Do NOT',
    're-classify — the inbound has already been routed here.',
    '',
    `Reply event id: ${body.replyEventId}`,
    `Contact id: ${replyEvent.contactId ?? '(unknown)'}`,
    `Linked client id: ${replyEvent.linkedClientId ?? '(unknown)'}`,
    `Classified intent: ${replyEvent.classifiedIntent ?? '(unknown)'}`,
    `Classifier evidence: ${replyEvent.classifierEvidence ?? '(none)'}`,
    '',
    `Inbound subject: ${replyEvent.replySubject ?? '(no subject)'}`,
    'Inbound body:',
    replyEvent.replyBodyText ?? '(body not captured)',
    '',
    'Use the available tools to load the contact and any related client/project',
    'plus client intelligence for grounded specifics.',
    '',
    'Compose a short, personalised reply per the SKILL.md style rules:',
    '- Open by acknowledging the SPECIFIC thing they wrote (cite a phrase).',
    '- For an info_question: answer it grounded in our intel; ask at most the',
    '  three highest-leverage qualification gaps; propose a call as the close.',
    '- For a positive reply: acknowledge, advance the relationship, propose a',
    '  next step (a call or a request for the next piece of information).',
    '- Match the register of the inbound. Sign off with a placeholder for the',
    '  operator name if unknown.',
    '',
    'Return ONLY a JSON object — no prose, no code fence.',
    '',
    'If the inbound is a complaint / opt-out / not actually answerable',
    '(misclassified), return:',
    '  { "escalate": true, "reason": "<brief reason>" }',
    '',
    'Otherwise:',
    '  {',
    '    "draftReplySubject": "...",',
    '    "draftReplyBody": "... (plain text)",',
    '    "draftReplyBodyHtml": "... (html version)",',
    '    "reasoning": "1-2 sentence summary for the operator quick-review"',
    '  }',
  ].join('\n');

  // Build Anthropic tool list from the registry.
  const registry = getToolRegistry();
  const atomicTools = ALLOWED_TOOL_NAMES
    .map((name) => registry.getTool(name))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);
  const anthropicTools = registry.formatForAnthropicTools(atomicTools) as Anthropic.Tool[];

  // Agentic loop: invoke the model, run any tool calls, repeat until the model
  // emits a final text response with the structured JSON output. Capped at 6
  // rounds — converges quickly with a narrow tool set.
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

    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        try {
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

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    if (!textBlock) {
      return NextResponse.json(
        { error: 'no text in final response' },
        { status: 502 },
      );
    }

    const cleaned = extractJsonObject(textBlock.text) ?? textBlock.text.trim();

    let parsed: DraftResult;
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

  return NextResponse.json(
    { error: 'reply-draft loop exceeded max iterations' },
    { status: 504 },
  );
}
