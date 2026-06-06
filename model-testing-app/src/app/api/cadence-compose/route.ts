import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { executeTool, getToolRegistry } from '@/lib/tools';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { CADENCE_FIRE_SKILL_PROMPT } from '@/lib/skillPrompts.generated';

// Cadence-fire v1.1 composer.
//
// Called by Convex action cadenceDispatcher.tick when a due cadence row has
// no preDraftedTouch (dynamic-compose mode). Loads the cadence-fire SKILL.md
// as system prompt, exposes a focused subset of atomic tools, invokes
// Anthropic to compose the touch per the SKILL.md's per-cadence-type
// composition guidance, returns the composed touch (or a skip decision).
//
// Pure-functional: this route does not write to Convex. The dispatcher
// creates the approval row from the returned touch and advances cadence
// state. Keeps approval semantics owned by the dispatcher (one place).
//
// Auth: called by the Convex dispatcher (no user session). Uses
// x-convex-internal-secret header + CONVEX_INTERNAL_SECRET env var,
// matching the existing bulk-analyze route pattern.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const SKILL_PATH = 'skills/skills/cadence-fire/SKILL.md';

// Atomic tools the composer has access to. Narrow on purpose — the model
// reasons better about a small, relevant tool surface than the full 100+.
// Only tools that actually exist in the registry are included.
// Dropped from the plan's initial list (not in registry):
//   - touchpoint.getByContact (no touchpoint domain)
//   - companies-house.getCharges (no companies-house domain tools in registry)
//   - appetite.getCurrentForLender (no appetite domain)
// Available via registry:
const ALLOWED_TOOL_NAMES = [
  'getContact',
  'getClient',
  'getProject',
  'queryIntelligence',
  'getClientIntelligence',
  'getProjectIntelligence',
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
    cachedSystemPrompt = CADENCE_FIRE_SKILL_PROMPT;
  }
  return cachedSystemPrompt;
}

interface ComposeRequest {
  cadenceId: string;
}

interface ComposedTouch {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

interface SkipDecision {
  skip: true;
  reason: string;
}

type ComposeResult = { touch: ComposedTouch } | SkipDecision;

export async function POST(request: NextRequest) {
  // Auth: accept calls from the Convex dispatcher (no Clerk session available).
  // Follows the same pattern as /api/bulk-analyze for internal-called routes.
  const internalSecret = request.headers.get('x-convex-internal-secret');
  const isInternalCall =
    !!process.env.CONVEX_INTERNAL_SECRET &&
    internalSecret === process.env.CONVEX_INTERNAL_SECRET;

  if (!isInternalCall) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: ComposeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.cadenceId) {
    return NextResponse.json({ error: 'cadenceId required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 },
    );
  }

  // Use an unauthenticated Convex client — the cadences.getById public query
  // is accessible without user auth (Convex public queries are open).
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || '';
  if (!convexUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_CONVEX_URL not configured' },
      { status: 500 },
    );
  }
  const convexClient = new ConvexHttpClient(convexUrl);

  // Load the cadence row. api.cadences.getById is added in Task 2.
  let cadenceRow: any;
  try {
    cadenceRow = await convexClient.query(
      api.cadences.getById,
      { cadenceId: body.cadenceId as Id<'cadences'> },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `failed to load cadence: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  if (!cadenceRow) {
    return NextResponse.json({ error: 'cadence not found' }, { status: 404 });
  }

  const systemPrompt = await getSystemPrompt();

  // Build the user prompt with pre-fetched cadence context so the model can
  // produce the touch without burning an extra round on the cadence lookup.
  const userMessage = [
    `You are composing a touch for cadenceId: ${body.cadenceId}`,
    ``,
    `Cadence type: ${cadenceRow.cadenceType}`,
    `Contact id: ${cadenceRow.contactId}`,
    `Related client id: ${cadenceRow.relatedClientId ?? '(none)'}`,
    `Related project id: ${cadenceRow.relatedProjectId ?? '(none)'}`,
    ``,
    `Follow the "## Per-cadence-type composition" section of the cadence-fire SKILL.md for the ${cadenceRow.cadenceType} type.`,
    ``,
    `Use the available tools to load the contact, the relationship context, and any per-type evidence required.`,
    ``,
    `Compose the touch per the SKILL.md's voice rules: short, evidence-grounded, two paragraphs maximum.`,
    ``,
    `Return ONLY a JSON object — no prose, no code fence:`,
    `  { "touch": { "subject": "...", "bodyText": "...", "bodyHtml": "..." } }`,
    `OR if the cadence should skip (per the SKILL.md's "evidence or skip" rule):`,
    `  { "skip": true, "reason": "no_new_evidence" | "stale_relationship" | "..." }`,
  ].join('\n');

  // Build Anthropic tool list from the registry.
  // getToolRegistry().getTool(name) looks up each atomic tool by name.
  // formatForAnthropicTools([tools]) converts AtomicTool[] to Anthropic format.
  const registry = getToolRegistry();
  const atomicTools = ALLOWED_TOOL_NAMES
    .map((name) => registry.getTool(name))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);
  const anthropicTools = registry.formatForAnthropicTools(atomicTools) as Anthropic.Tool[];

  // Agentic loop: invoke the model, run any tool calls, repeat until the
  // model emits a final text response with the structured JSON output.
  // Capped at 6 rounds — composer should converge well within this.
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

    let parsed: ComposeResult;
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
    { error: 'composer loop exceeded max iterations' },
    { status: 504 },
  );
}
