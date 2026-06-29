import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { executeTool, getToolRegistry } from '@/lib/tools';
import { ConvexHttpClient } from 'convex/browser';

// Intel-revalidate (mode 2) — the cheap, diff-focused freshness engine.
//
// Called by the Convex action intelRevalidate.runRevalidateInternal when a
// prospect needs a quick "has anything materially changed since the last full
// intel?" check (Trigger B 30-day cadence gap, or an operator quick re-check).
//
// Modelled closely on /api/cadence-compose: nodejs runtime,
// x-convex-internal-secret auth, a Haiku 4.5 agentic loop over a NARROW
// subset of atomic tools. Pure-functional — this route does NOT write to
// Convex; convex/intelRevalidate.ts owns persistence (the skillRuns row +
// client freshness stamps), matching the cadence-compose split.
//
// FAIL-OPEN: any error returns still_valid (the caller treats it as a gap and
// fires anyway) so a flaky CH/Anthropic call never silently blocks outreach.
// We bias the prompt hard toward still_valid unless there is concrete new
// evidence, so a held send always carries an auditable, evidence-cited reason.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const SKILL_PATH = 'skills/skills/intel-revalidate/SKILL.md';

// Narrow tool surface. Only registry-resident tools are included — the model
// reasons better about a small relevant set, and a missing tool would error
// the loop. CH-charge and web-search tools are not in the registry today, so
// the diff leans on the structured intelligence we already hold plus the
// charge-holder lookup; document this limitation in SKILL.md.
const ALLOWED_TOOL_NAMES = [
  'getClient',
  'getClientIntelligence',
  'queryIntelligence',
  'searchChargeholders',
];

// Inline fallback prompt used when ../skills/ is absent from the Vercel bundle.
// (The richer canonical guidance lives in skills/skills/intel-revalidate/SKILL.md;
//  the embed step can later replace this with INTEL_REVALIDATE_SKILL_PROMPT.)
const FALLBACK_SYSTEM_PROMPT = [
  'You are the intel-revalidate pass for a UK property-finance prospecting CRM.',
  'A full intel report already exists for this prospect. Your ONLY job is to decide',
  'whether anything MATERIAL has changed since the given `sinceIso` date.',
  '',
  'Material changes are: a new Companies House charge, a satisfied/released charge,',
  'a company-status change (e.g. active → liquidation), new planning or scheme',
  'activity, or significant news. Cosmetic or unchanged data is NOT material.',
  '',
  'Use the available tools to load the prospect and its intelligence and to look up',
  'current charge-holder data. Bias HARD toward still_valid: only return',
  'materially_changed when you can cite concrete new evidence (a charge id, a',
  'planning ref, a status, a URL). When in doubt, return still_valid.',
  '',
  'Return ONLY a JSON object — no prose, no code fence:',
  '  { "result": "still_valid" | "materially_changed",',
  '    "summary": "one or two sentences",',
  '    "findings": [ { "kind": "new_charge"|"satisfied_charge"|"status_change"|"planning"|"news", "detail": "...", "sourceUrl": "..."? } ] }',
].join('\n');

let cachedSystemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  try {
    const repoRoot = path.resolve(process.cwd(), '..');
    const fullPath = path.join(repoRoot, SKILL_PATH);
    cachedSystemPrompt = await fs.readFile(fullPath, 'utf-8');
  } catch {
    cachedSystemPrompt = FALLBACK_SYSTEM_PROMPT;
  }
  return cachedSystemPrompt;
}

interface RevalidateRequest {
  clientId: string;
  companyNumber?: string;
  sinceIso?: string;
  reason?: string;
}

interface RevalidateResult {
  result: 'still_valid' | 'materially_changed';
  summary: string;
  findings: Array<{ kind: string; detail: string; sourceUrl?: string }>;
}

// Fail-open helper — always 200 with a still_valid verdict so the caller never
// blocks outreach on a transport/LLM error. The note is surfaced to the
// operator via the skillRun errors[] the caller records.
function failOpen(note: string): NextResponse {
  return NextResponse.json({
    result: 'still_valid',
    summary: `Revalidate unavailable (${note}); treated as still_valid.`,
    findings: [],
    failedOpen: true,
  } satisfies RevalidateResult & { failedOpen: true });
}

export async function POST(request: NextRequest) {
  const internalSecret = request.headers.get('x-convex-internal-secret');
  const isInternalCall =
    !!process.env.CONVEX_INTERNAL_SECRET &&
    internalSecret === process.env.CONVEX_INTERNAL_SECRET;

  if (!isInternalCall) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: RevalidateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return failOpen('ANTHROPIC_API_KEY not configured');

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || '';
  if (!convexUrl) return failOpen('NEXT_PUBLIC_CONVEX_URL not configured');
  const convexClient = new ConvexHttpClient(convexUrl);

  const systemPrompt = await getSystemPrompt();

  const userMessage = [
    `Re-validate the intel for clientId: ${body.clientId}`,
    `Companies House number: ${body.companyNumber ?? '(unknown — resolve via getClient)'}`,
    `Last full intel date (sinceIso): ${body.sinceIso ?? '(unknown)'}`,
    `Reason for this check: ${body.reason ?? 'manual_recheck'}`,
    ``,
    `Load the prospect + its intelligence, look up current charge-holder data,`,
    `and decide whether anything MATERIAL has changed since ${body.sinceIso ?? 'the last full intel'}.`,
    ``,
    `Bias toward still_valid. Only return materially_changed with concrete, cited evidence.`,
    ``,
    `Return ONLY the JSON object specified in your instructions — no prose, no code fence.`,
  ].join('\n');

  const registry = getToolRegistry();
  const atomicTools = ALLOWED_TOOL_NAMES
    .map((name) => registry.getTool(name))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);
  const anthropicTools = registry.formatForAnthropicTools(atomicTools) as Anthropic.Tool[];

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  // Agentic loop, capped at 6 rounds (matches cadence-compose).
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
      return failOpen(`anthropic api error: ${err instanceof Error ? err.message : String(err)}`);
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
    if (!textBlock) return failOpen('no text in final response');

    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    let parsed: Partial<RevalidateResult>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return failOpen('model response was not valid JSON');
    }

    if (parsed.result !== 'still_valid' && parsed.result !== 'materially_changed') {
      return failOpen('model returned an unexpected result value');
    }

    return NextResponse.json({
      result: parsed.result,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    } satisfies RevalidateResult);
  }

  return failOpen('revalidate loop exceeded max iterations');
}
