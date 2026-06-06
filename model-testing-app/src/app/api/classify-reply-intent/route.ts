import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { CLASSIFY_REPLY_INTENT_PROMPT } from "@/lib/skillPrompts.generated";
import { extractJsonObject } from "@/lib/extractJsonObject";

// Classify-reply-intent API (cadence-fire v1).
//
// Called by Convex action replyEventProcessor.processReplyEvent. Loads the
// classify-reply-intent sub-skill as system prompt, sends the reply body +
// context as user message, parses the model's JSON response.
//
// Pattern parallels /api/chat-assistant: Anthropic SDK (new Anthropic() — SDK
// reads ANTHROPIC_API_KEY from env), server-side execution, no Convex direct
// calls (Convex calls us via fetch).

export const runtime = "nodejs"; // need fs access for sub-skill loading
export const maxDuration = 30;

const SUB_SKILL_PATH = "skills/sub-skills/classify-reply-intent.md";
const MODEL = "claude-haiku-4-5-20251001"; // cheap + fast; classifier is a small decision
const MAX_TOKENS = 256;

let cachedSystemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  // Path relative to monorepo root; model-testing-app runs from its own cwd
  // so we go one level up to reach the repo root where skills/ lives. On
  // Vercel ../skills/ is outside the project root and absent from the
  // function bundle, so fall back to the embedded copy (regenerated via
  // scripts/embed-skill-prompts.mjs).
  try {
    const repoRoot = path.resolve(process.cwd(), "..");
    const fullPath = path.join(repoRoot, SUB_SKILL_PATH);
    cachedSystemPrompt = await fs.readFile(fullPath, "utf-8");
  } catch {
    cachedSystemPrompt = CLASSIFY_REPLY_INTENT_PROMPT;
  }
  return cachedSystemPrompt;
}

interface ClassifyRequest {
  replyBody: string;
  replySubject?: string;
  contactId: string;
  cancelledCadenceIds: string[];
}

interface ClassifyResponse {
  intent: string;
  confidence: number;
  evidence?: string;
}

export async function POST(request: NextRequest) {
  // Server-to-server auth: same x-convex-internal-secret pattern as
  // cadence-compose / meeting-prep-respond. The route is on the Clerk
  // middleware public list (Clerk would otherwise 404 the cookie-less
  // Convex fetch before it reached us), so this check is the only gate
  // between the public internet and a Claude API call.
  const internalSecret = request.headers.get("x-convex-internal-secret");
  const secretOk =
    !!process.env.CONVEX_INTERNAL_SECRET &&
    internalSecret === process.env.CONVEX_INTERNAL_SECRET;
  if (!secretOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ClassifyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.replyBody) {
    return NextResponse.json({ error: "replyBody required" }, { status: 400 });
  }

  const systemPrompt = await getSystemPrompt().catch((err) => {
    console.error("[classify-reply-intent] failed to load sub-skill:", err);
    return null;
  });

  if (!systemPrompt) {
    return NextResponse.json(
      { error: "failed to load classifier sub-skill" },
      { status: 500 },
    );
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  const userMessage = [
    `Subject: ${body.replySubject ?? "(no subject)"}`,
    "",
    "Reply body:",
    body.replyBody,
    "",
    `Cancelled cadence count: ${body.cancelledCadenceIds.length}`,
    "",
    "Return only the JSON object per the output contract. No prose.",
  ].join("\n");

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    console.error("[classify-reply-intent] anthropic api error:", err);
    return NextResponse.json(
      {
        error: `anthropic api error: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 },
    );
  }

  // Extract the text content block
  const textBlock = response.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;

  if (!textBlock) {
    return NextResponse.json(
      { error: "no text in response" },
      { status: 502 },
    );
  }

  // Strip code fence if model wraps response, then parse JSON
  let parsed: ClassifyResponse;
  try {
    // Prose/fence-tolerant extraction — see extractJsonObject.
    const cleaned = extractJsonObject(textBlock.text) ?? textBlock.text.trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(
      "[classify-reply-intent] model response was not valid JSON:",
      textBlock.text,
    );
    return NextResponse.json(
      { error: "model response was not valid JSON", raw: textBlock.text },
      { status: 502 },
    );
  }

  return NextResponse.json(parsed);
}
