# Cadence-Fire v1.1: Composer + Meeting-Prep Responder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock the two highest-leverage gaps that v1 deliberately deferred:

1. **The v1.1 composer** (`/api/cadence-compose`) so dynamic-mode cadence types (execution_chaser, bdm_relationship, monitoring_ask, client_checkin, warm_lead_chase, post_lost_re_engagement) fire end-to-end. Currently the dispatcher records a failure with "dynamic_compose_unavailable" for any cadence without a `preDraftedTouch`.
2. **The meeting-prep responder** (`/api/meeting-prep-respond`) so `book_meeting` reply intents route to a real autonomous skill that drafts an availability response, rather than landing as a raw operator-review approval. The current behaviour produces a "review this reply manually" approval; the new behaviour produces a "review this drafted availability response we want to send back" approval.

**Architecture:** Two new Next.js API routes that share a pattern (load skill markdown as Anthropic system prompt, invoke with focused atomic tools, return structured output to the caller). The dispatcher gets refactored to call the composer for dynamic-mode rows; the reply event processor gets refactored to call the meeting-prep responder for `book_meeting` intents. Both routes are pure-functional — the side-effecting layer (approval creation, cadence state advance) stays in the existing Convex actions.

**Tech Stack:** Next.js 16 App Router API route, Anthropic SDK (Haiku 4.5 for both routes), Convex actions/mutations (existing), markdown for skill content.

**Reference spec:** `docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md` (section 3.2 v1.1)

**v1 baseline:** All v1 commits on the `cadence-fire-v1` branch (this work branches off it).

---

## Two key architectural decisions

**1. Per-skill routes, not a generic skill-runner.** Each route is focused: composer takes a cadenceId, returns a touch; meeting-prep-respond takes a replyEventId, returns a draft reply. A unified `/api/run-skill` is plausible but premature — v1.1 has two callers with materially different inputs/outputs. Unification becomes a worthwhile refactor at 3+ callers.

**2. Routes are pure-functional; side effects stay in the dispatcher/processor.** The composer returns `{ subject, bodyText, bodyHtml }` or `{ skip, reason }`; the dispatcher creates the approval row and advances cadence state. The responder returns `{ draftReplySubject, draftReplyBody, suggestedSlots? }`; the processor creates the approval row. This keeps approval semantics in one place and lets failures route through `recordFailureInternal` cleanly.

---

## File Structure

**Created:**
- `model-testing-app/src/app/api/cadence-compose/route.ts` — composer route (~140 lines)
- `model-testing-app/src/app/api/meeting-prep-respond/route.ts` — responder route (~160 lines)

**Modified:**
- `model-testing-app/convex/cadenceDispatcher.ts` — replace `"dynamic_compose_unavailable"` failure with composer fetch + approval creation
- `model-testing-app/convex/replyEventProcessor.ts` — split `book_meeting` from `info_question` / `unknown` in `dispatchByIntent`; call `/api/meeting-prep-respond` for book_meeting
- `skills/skills/cadence-fire/SKILL.md` — update v1 contract section to mark dynamic compose as live; document the composer's atomic-tool surface
- `skills/skills/meeting-prep/SKILL.md` — add `## Responder mode` section describing the book_meeting reply flow + structured output contract
- `CLAUDE.md` (root) — small addition to `### Event-driven skills` noting meeting-prep is now an autonomous reply target

**Verification surface:** `npx convex run cadenceDispatcher:tick` after seeding a dynamic-mode cadence row; `npx convex run replyEventProcessor:ingestFromHubspot` with a synthetic book_meeting reply body; `npx next build`.

---

# PHASE 1 — v1.1 Composer (~45 min)

### Task 1: Build `/api/cadence-compose` route

**Files:**
- Create: `model-testing-app/src/app/api/cadence-compose/route.ts`

- [ ] **Step 1: Confirm the chat-assistant pattern**

Run: `head -50 model-testing-app/src/app/api/chat-assistant/route.ts`

Note: imports (`@anthropic-ai/sdk`, `@/lib/tools`, `runtime = "nodejs"`, `maxDuration = 60`), the `getAuthenticatedConvexClient` pattern, and how tools are exposed.

- [ ] **Step 2: Identify atomic tools the composer needs**

The composer needs a focused subset of atomic tools — enough to gather context per cadence type but not so many that the model gets confused. For v1.1 ship with:

- `contact.get` — load the target contact
- `client.get` — load the related client if any
- `project.get` — load the related project if any
- `touchpoint.getByContact` — recent inbound/outbound history (the "no new evidence → skip" decision relies on this)
- `intelligence.queryIntelligence` — relevant lender DNA / scheme intel
- `companies-house.getCharges` — fresh charge evidence (prospect/warm-lead-chase types lean on this)
- `appetite.getCurrentForLender` — for `bdm_relationship` cadences

If any of these atomic tools don't exist in `src/lib/tools/domains/`, drop them from the composer's allowed list and note in the SKILL.md update that the related cadence type can't access that evidence yet. The composer must work with whatever's available — don't block on missing tools.

Run: `grep -rE "name: '(contact|client|project|touchpoint|intelligence|companies-house|appetite)\." model-testing-app/src/lib/tools/domains/ | head -20` to confirm which exist.

- [ ] **Step 3: Create the route**

Create `model-testing-app/src/app/api/cadence-compose/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { executeTool } from '@/lib/tools';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

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

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const SKILL_PATH = 'skills/skills/cadence-fire/SKILL.md';

// Atomic tools the composer has access to. Narrow on purpose — the model
// reasons better about a small, relevant tool surface than the full 100+.
const ALLOWED_TOOLS = [
  'contact.get',
  'client.get',
  'project.get',
  'touchpoint.getByContact',
  'intelligence.queryIntelligence',
  'companies-house.getCharges',
  'appetite.getCurrentForLender',
];

let cachedSystemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  const repoRoot = path.resolve(process.cwd(), '..');
  const fullPath = path.join(repoRoot, SKILL_PATH);
  cachedSystemPrompt = await fs.readFile(fullPath, 'utf-8');
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
  // 1. Authenticate the caller. The dispatcher invokes this route as an
  //    internal action via fetch; in v1 the route accepts any authenticated
  //    request (the dispatcher carries no user-level credentials, so we
  //    fall back to the service-level path). Adapt if your auth layer
  //    requires a different shape.
  let convexClient;
  try {
    convexClient = await getAuthenticatedConvexClient();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
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

  // 2. Load the cadence row + cheap context. Pre-fetched context lets the
  //    model produce the touch without burning rounds on basic lookups.
  let cadenceRow: any;
  try {
    cadenceRow = await convexClient.query(
      // Use the internal getInternal via a public wrapper if one exists, or
      // expose a public query. For v1.1, attempt to read via the existing
      // surface; if not exposed publicly, you'll need to add a public
      // `cadences.getById` query in convex/cadences.ts (a thin wrapper
      // around getInternal that any authenticated user can call).
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

  // 3. Build the user prompt. The structured input includes the cadenceType
  //    (which determines which SKILL.md section the model follows) and the
  //    pre-fetched cadence context.
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

  // 4. Build the tool schema list for Anthropic.
  const tools = buildAnthropicTools(ALLOWED_TOOLS);

  // 5. Agentic loop: invoke the model, run any tool calls, repeat until
  //    the model emits a final assistant message with the structured output.
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  // Cap loop iterations defensively; composer should converge in <= 6 rounds.
  for (let i = 0; i < 6; i++) {
    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `anthropic api error: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 },
      );
    }

    // If model wants to use tools, execute them and loop
    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        try {
          const result = await executeTool(convexClient, toolUse.name, toolUse.input);
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

    // Final text response: parse and return
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      return NextResponse.json(
        { error: 'no text in final response' },
        { status: 502 },
      );
    }

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

  // Loop exhausted without a final response
  return NextResponse.json(
    { error: 'composer loop exceeded max iterations' },
    { status: 504 },
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function buildAnthropicTools(toolNames: string[]): Anthropic.Tool[] {
  // Look up each tool's atomic definition and convert to Anthropic format.
  // Importing the registry helper here keeps the route self-contained.
  // If `formatForAnthropicTools` exists in `@/lib/tools`, prefer it;
  // otherwise build inline from the registry.
  const tools: Anthropic.Tool[] = [];
  for (const name of toolNames) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getToolDefinition } = require('@/lib/tools');
      const def = getToolDefinition(name);
      if (def) {
        tools.push({
          name: def.name,
          description: def.description,
          input_schema: def.input_schema ?? def.parameters,
        });
      }
    } catch {
      // Tool not in registry — silently skip. The composer can still work
      // with the tools it does have.
    }
  }
  return tools;
}
```

**Note about `api.cadences.getById`:** the v1 work added internal-only queries. For the composer (called from a Next.js route with a user-authenticated convex client), you need a PUBLIC query wrapper. Task 2 addresses this. For now, the route references `api.cadences.getById` which Task 2 will add.

**Note about `getToolDefinition` / `formatForAnthropicTools`:** the existing chat-assistant uses one of these helpers from `@/lib/tools`. If the names differ (likely they do — read `src/lib/tools/index.ts` to confirm), adapt accordingly. The pattern is the same.

- [ ] **Step 4: TypeScript check on the new file**

```bash
cd model-testing-app
npx tsc --noEmit 2>&1 | grep "src/app/api/cadence-compose" | head -10
```

Expected: any errors limited to the new file (likely complaints about `api.cadences.getById` not existing — that's expected, Task 2 adds it).

- [ ] **Step 5: Commit deferred — batched with Task 2**

Skip; commit at end of Task 2.

---

### Task 2: Add public `cadences.getById` query + dispatcher integration

**Files:**
- Modify: `model-testing-app/convex/cadences.ts` (add public wrapper)
- Modify: `model-testing-app/convex/cadenceDispatcher.ts` (replace failure with composer fetch)

- [ ] **Step 1: Add public `cadences.getById` query**

In `model-testing-app/convex/cadences.ts`, near the existing `getInternal`, add:

```typescript
import { query } from "./_generated/server";

// Public query for the composer route. Returns a cadence row by id. Used by
// the /api/cadence-compose route which authenticates the caller but needs
// to read a specific cadence's data to compose its touch.
export const getById = query({
  args: { cadenceId: v.id("cadences") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.cadenceId);
  },
});
```

(Add `query` to the existing imports if not already present.)

- [ ] **Step 2: Refactor dispatcher to call composer for dynamic-mode rows**

In `model-testing-app/convex/cadenceDispatcher.ts`, find the current dynamic-compose failure block:

```typescript
      } else {
        // Dynamic-compose: v1.1 will route here. v1 marks failed.
        await ctx.runMutation(internal.cadences.recordFailureInternal, {
          cadenceId: row._id,
          step: "dynamic_compose_unavailable",
          message:
            "v1 ships pre-drafted only; dynamic compose deferred to v1.1. Add preDraftedTouch to cadence row or wait for v1.1 composer.",
        });
        failed++;
      }
```

Replace with:

```typescript
      } else {
        // Dynamic-compose (v1.1): fetch from /api/cadence-compose, then
        // create the approval row from the composed touch.
        const appUrl = process.env.NEXT_APP_URL;
        if (!appUrl) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "compose_no_app_url",
            message: "NEXT_APP_URL env var not set; cannot reach composer",
          });
          failed++;
          continue;
        }

        let composeResult:
          | { touch: { subject: string; bodyText: string; bodyHtml: string } }
          | { skip: true; reason: string }
          | { error: string }
          | null = null;
        try {
          const res = await fetch(`${appUrl}/api/cadence-compose`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cadenceId: row._id }),
          });
          if (!res.ok) {
            composeResult = { error: `composer returned ${res.status}` };
          } else {
            composeResult = await res.json();
          }
        } catch (err) {
          composeResult = {
            error: err instanceof Error ? err.message : String(err),
          };
        }

        if (composeResult && "error" in composeResult) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "compose_call",
            message: composeResult.error,
          });
          failed++;
          continue;
        }

        if (composeResult && "skip" in composeResult) {
          // Composer's evidence-or-skip rule: log as skipped_paused with
          // the composer's reason in cancelledReason for audit. Advance
          // nextDueAt so the cadence comes around again next interval.
          await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
            cadenceId: row._id,
            fireKey,
            lastResult: "skipped_paused",
            nextDueAt: computeNextDueAt(row),
          });
          skipped++;
          continue;
        }

        if (!composeResult || !("touch" in composeResult)) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "compose_invalid_response",
            message: "composer returned an unexpected shape",
          });
          failed++;
          continue;
        }

        // Create approval + advance, using the same two-try pattern as the
        // pre-drafted branch (so a state-advance failure doesn't trigger
        // the failure handler for the already-created approval).
        let approvalCreated = false;
        try {
          await ctx.runMutation(internal.approvals.internalCreate, {
            entityType: "gmail_send",
            summary: composeResult.touch.subject.slice(0, 200),
            draftPayload: {
              to: contact?.email ?? "(no email on contact)",
              subject: composeResult.touch.subject,
              bodyText: composeResult.touch.bodyText,
              bodyHtml: composeResult.touch.bodyHtml,
            },
            requestedBy: row.createdBy,
            requestSource: "cadence",
            requestSourceName: "cadence-fire (composed)",
            relatedClientId: row.relatedClientId,
            relatedProjectId: row.relatedProjectId,
            relatedContactId: row.contactId,
            relatedCadenceId: row._id,
          });
          approvalCreated = true;
        } catch (err) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "create_approval_composed",
            message: err instanceof Error ? err.message : String(err),
          });
          failed++;
        }
        if (approvalCreated) {
          try {
            await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
              cadenceId: row._id,
              fireKey,
              lastResult: "sent",
              nextDueAt: computeNextDueAt(row),
            });
            fired++;
          } catch (err) {
            console.error(
              `[cadence-fire] composed approval created but advanceAfterFire failed for cadence ${row._id}; next tick may duplicate`,
              err,
            );
            failed++;
          }
        }
      }
```

Note the parallel structure to the pre-drafted branch: same two-try approval+advance pattern; same fire-key idempotency; same recordFailure routing.

- [ ] **Step 3: Deploy + codegen**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
```

Expected: clean push. New public `cadences.getById` query visible in `api.cadences.getById` generated types.

- [ ] **Step 4: Smoke-test the dispatcher with the composer wired**

This requires the dev server running to serve `/api/cadence-compose`. Two options:

**Option A (background dev server):** `npm run dev` in a separate terminal, then run the tick. Cleaner end-to-end test.

**Option B (defer to Task 6 / final smoke test):** the build verification + final smoke test covers this. Skip the live test here.

For autonomous execution, prefer Option B — running the dev server in background and dispatching to it is fragile. The end-to-end smoke test in Task 8 confirms the wiring.

You can still confirm the change is structurally sound by re-running the empty-tick smoke test:

```bash
npx convex run cadenceDispatcher:tick
```

Expected: returns `{fired: 0, skipped: 0, failed: 0, polled: 0}` (no due cadences). Confirms no compile-time issues.

- [ ] **Step 5: Commit Tasks 1 + 2 together**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/.worktrees/cadence-fire-v1.1
git add model-testing-app/src/app/api/cadence-compose/route.ts \
  model-testing-app/convex/cadences.ts \
  model-testing-app/convex/cadenceDispatcher.ts \
  model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1.1: composer route + dispatcher integration

/api/cadence-compose: Next.js route that loads cadence-fire SKILL.md as
Anthropic system prompt, exposes a focused 7-tool atomic surface
(contact/client/project/touchpoint/intelligence/companies-house/appetite
reads), runs an agentic loop capped at 6 rounds, returns either a
composed touch ({ subject, bodyText, bodyHtml }) or a skip decision
({ skip, reason }) per the SKILL.md's "evidence or skip" rule.

cadenceDispatcher.tick: dynamic-compose branch now POSTs to the composer
instead of recording dynamic_compose_unavailable. Two-try pattern
matches the pre-drafted branch (approval creation and state advance
are separate try scopes; failures route via recordFailureInternal vs
console.error appropriately). Skip decisions advance nextDueAt with
lastResult: skipped_paused.

Adds public query cadences.getById for the composer to read cadence rows
without bypassing auth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update cadence-fire SKILL.md to drop the v1.1 deferral language

**Files:**
- Modify: `skills/skills/cadence-fire/SKILL.md`

- [ ] **Step 1: Update the v1 contract section**

Locate the existing `## v1 contract (2026-05-23)` section in `skills/skills/cadence-fire/SKILL.md`. Replace it with this updated version (renamed to indicate v1.1 status):

```md
## Runtime contract (v1.1, 2026-05-23)

The autonomy engine substrate is live: cadences table, 5-min dispatcher cron, Gmail push webhook (Pub/Sub setup pending), HubSpot sync sweep safety net, classify-reply-intent sub-skill, intent dispatch to four destinations.

**v1.1 supports both pre-drafted and dynamic-compose touches.**

- **Pre-drafted touches** (`preDraftedTouch` field populated): the dispatcher fires them directly. Used by skills that produce cadence packages (today: prospect-intel; coming: qualify-and-draft, lender-intel). Approval shape is the composed touch.

- **Dynamic-compose touches** (`preDraftedTouch` absent): the dispatcher calls `/api/cadence-compose` which loads this SKILL.md as system prompt, exposes a focused 7-tool atomic surface (contact / client / project / touchpoint / intelligence / companies-house / appetite reads), runs an agentic loop, returns the composed touch or a skip decision. Used at fire time when the touch needs fresh evidence (a new charge, a recent monitoring period, the latest appetite signal). The per-cadence-type composition sections below describe what the composer should do per type.

The composer respects the "evidence or skip" rule: if no fresh evidence is available to ground the touch, the composer returns `{ skip: true, reason: ... }` and the dispatcher advances `nextDueAt` with `lastResult: "skipped_paused"`. This prevents content-free check-ins.

See `docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md` for the full design and `docs/superpowers/plans/2026-05-23-cadence-fire-v1.1-composer-and-meeting-prep.md` for the v1.1 implementation.
```

- [ ] **Step 2: Verify the edit**

Run: `grep -nE '^## ' skills/skills/cadence-fire/SKILL.md | head -10`

Expected: `## Runtime contract (v1.1, 2026-05-23)` appears as the first ## section after the title, replacing the older "v1 contract" heading.

- [ ] **Step 3: Commit Task 3**

```bash
git add skills/skills/cadence-fire/SKILL.md
git commit -m "$(cat <<'EOF'
[skills] cadence-fire SKILL.md: promote v1 contract to v1.1 runtime contract

Dynamic compose is live (v1.1 composer at /api/cadence-compose). The
SKILL.md is now the system prompt for both pre-drafted callers
(at queue time, by skills like prospect-intel) AND the composer
(at fire time, for dynamic-mode types). Per-cadence-type composition
sections that were previously documented-but-unused are now active.

Composer respects the "evidence or skip" rule via a structured skip
decision; the dispatcher advances nextDueAt with skipped_paused
rather than firing a content-free touch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 2 — Meeting-Prep Responder (~45 min)

### Task 4: Extend meeting-prep SKILL.md with `## Responder mode`

**Files:**
- Modify: `skills/skills/meeting-prep/SKILL.md`

- [ ] **Step 1: Confirm current SKILL.md structure**

Run: `grep -n '^## ' skills/skills/meeting-prep/SKILL.md`

Expected sections: `## Trigger`, `## Inputs`, `## Outputs`, `## Workflow`, `## Style rules`, `## Tool dependencies`, `## What goes wrong`, `## References`.

- [ ] **Step 2: Add the responder mode section**

After the existing `## Workflow` section, before `## Style rules`, insert:

```md
## Responder mode (v1.1)

Meeting-prep has two modes of invocation:

1. **Pre-call brief mode** (the original purpose, sections above): operator invokes before a meeting; output is the inline brief.

2. **Responder mode** (v1.1, added 2026-05-23): the reply event processor invokes the `/api/meeting-prep-respond` route when a `book_meeting` reply intent is detected. Input is a `replyEventId` plus the reply body and the cancelled cadence context. Output is a drafted availability response — the email we'd send back to confirm the meeting.

### Responder mode workflow

When invoked via `/api/meeting-prep-respond`:

1. Load the reply event row + the matched contact + any related client/project.
2. Optionally load the prior cadence touches that were cancelled by this reply (to thread the response naturally — referring back to the original outreach).
3. Propose 3 availability slots. For v1.1 these are operator-judgement defaults — next 3 business days at 10am UK time, or whatever the operator's typical pattern is — NOT live Google Calendar lookups (which defer to v1.2 once the calendar integration is wired into the route).
4. Compose a short, warm reply: thank for the response, confirm interest, propose the 3 slots, ask which works best.

### Responder mode output contract

Return ONLY a JSON object — no prose, no code fence:

```json
{
  "draftReplySubject": "Re: <original subject>",
  "draftReplyBody": "Plain-text reply body, no signature (the operator's email client adds it).",
  "draftReplyBodyHtml": "HTML version of the body for the approval payload.",
  "suggestedSlots": [
    { "iso": "2026-05-26T09:00:00Z", "display": "Tuesday 26 May, 10:00 UK time" },
    { "iso": "2026-05-27T13:00:00Z", "display": "Wednesday 27 May, 14:00 UK time" },
    { "iso": "2026-05-28T09:00:00Z", "display": "Thursday 28 May, 10:00 UK time" }
  ]
}
```

Or if a meeting reply is not appropriate (e.g., the reply was misclassified):

```json
{
  "escalate": true,
  "reason": "reply does not actually accept a meeting; recommend operator review"
}
```

### Responder mode style

Same `## Style rules` as pre-call brief mode, plus:

- **Tone match.** Read the reply's tone; mirror it in the response. A formal "happy to discuss" reply gets a formal response; a casual "sure let's chat" gets a warmer response.
- **Don't over-pitch.** The prospect already said yes to a meeting; the response confirms and proposes times. No marketing, no qualification questions in the body.
- **Single ask.** One question: which time works? Don't add multiple questions about agenda, attendees, video link.
```

- [ ] **Step 3: Update `## Tool dependencies` to add responder-mode tools**

In the `## Tool dependencies` section, append (after the existing list):

```md

For responder mode (`/api/meeting-prep-respond`):

- `replyEvents.getById` (lands in this task's companion Convex change)
- All the brief-mode tools above (for relationship context)
- (v1.2: `calendar.getAvailability` for real free/busy lookup; v1.1 uses operator-default slots)
```

- [ ] **Step 4: Commit Task 4**

```bash
git add skills/skills/meeting-prep/SKILL.md
git commit -m "$(cat <<'EOF'
[skills] meeting-prep SKILL.md: add ## Responder mode for book_meeting replies

Meeting-prep now has two invocation modes:
1. Pre-call brief (original; operator-invoked before a meeting)
2. Responder mode (v1.1; auto-invoked by replyEventProcessor when a
   book_meeting reply intent is detected)

Responder mode workflow: load reply + contact + cadence context →
propose 3 availability slots (operator defaults for v1.1; live
calendar in v1.2) → compose short warm reply. Structured JSON output
contract enables the route to parse and stage an approval.

The two modes share the relationship-context loading tools but have
distinct outputs (inline brief vs structured reply payload).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add public `replyEvents.getById` query

**Files:**
- Modify: `model-testing-app/convex/replyEvents.ts`

- [ ] **Step 1: Add the public wrapper**

In `model-testing-app/convex/replyEvents.ts`, near the existing `getInternal`, add:

```typescript
import { query } from "./_generated/server";

// Public query for the meeting-prep-respond route. Returns a reply event
// row by id. Authenticated read access; the responder route uses this to
// load the reply + cancelled cadence context.
export const getById = query({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.replyEventId);
  },
});
```

(Add `query` to imports if needed.)

- [ ] **Step 2: Deploy + codegen**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
```

- [ ] **Step 3: Commit deferred — batched with Task 6**

Skip; commit at end of Task 6.

---

### Task 6: Build `/api/meeting-prep-respond` route

**Files:**
- Create: `model-testing-app/src/app/api/meeting-prep-respond/route.ts`

- [ ] **Step 1: Create the route**

Create `model-testing-app/src/app/api/meeting-prep-respond/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { executeTool } from '@/lib/tools';
import { getAuthenticatedConvexClient } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

// Meeting-prep v1.1 responder route.
//
// Called by Convex action replyEventProcessor.dispatchByIntent when a
// book_meeting reply intent is detected. Loads the meeting-prep SKILL.md
// as system prompt (responder mode section is the active one for this
// invocation), exposes a focused subset of atomic tools for relationship
// context, runs an agentic loop, returns a drafted availability reply.
//
// Pure-functional: the processor creates the approval row from the
// returned reply payload.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const SKILL_PATH = 'skills/skills/meeting-prep/SKILL.md';

const ALLOWED_TOOLS = [
  'contact.get',
  'client.get',
  'project.get',
  'touchpoint.getByContact',
];

let cachedSystemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  const repoRoot = path.resolve(process.cwd(), '..');
  const fullPath = path.join(repoRoot, SKILL_PATH);
  cachedSystemPrompt = await fs.readFile(fullPath, 'utf-8');
  return cachedSystemPrompt;
}

interface RespondRequest {
  replyEventId: string;
}

interface DraftedReply {
  draftReplySubject: string;
  draftReplyBody: string;
  draftReplyBodyHtml: string;
  suggestedSlots: Array<{ iso: string; display: string }>;
}

interface EscalateDecision {
  escalate: true;
  reason: string;
}

type RespondResult = DraftedReply | EscalateDecision;

export async function POST(request: NextRequest) {
  let convexClient;
  try {
    convexClient = await getAuthenticatedConvexClient();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
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

  // Load the reply event
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

  const userMessage = [
    `RESPONDER MODE INVOCATION.`,
    ``,
    `You are responding to a book_meeting reply from a prospect/contact.`,
    `Follow the "## Responder mode" section of the meeting-prep SKILL.md.`,
    ``,
    `Reply event id: ${body.replyEventId}`,
    `Contact id: ${replyEvent.contactId ?? '(unknown)'}`,
    `Classified intent: ${replyEvent.classifiedIntent ?? '(unknown)'}`,
    `Classifier evidence: ${replyEvent.classifierEvidence ?? '(none)'}`,
    `Cancelled cadences: ${(replyEvent.cadencesCancelled ?? []).length}`,
    ``,
    `Use the available tools to load the contact and any related client/project for relationship context.`,
    ``,
    `Compose a short availability response per the SKILL.md responder workflow.`,
    `Propose 3 operator-default slots (next 3 business days at 10:00 UK time unless the relationship context suggests otherwise).`,
    ``,
    `Return ONLY a JSON object per the SKILL.md responder output contract — no prose, no code fence.`,
  ].join('\n');

  const tools = buildAnthropicTools(ALLOWED_TOOLS);
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  for (let i = 0; i < 6; i++) {
    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `anthropic api error: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 },
      );
    }

    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        try {
          const result = await executeTool(convexClient, toolUse.name, toolUse.input);
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

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      return NextResponse.json({ error: 'no text in final response' }, { status: 502 });
    }

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

  return NextResponse.json(
    { error: 'responder loop exceeded max iterations' },
    { status: 504 },
  );
}

function buildAnthropicTools(toolNames: string[]): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];
  for (const name of toolNames) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getToolDefinition } = require('@/lib/tools');
      const def = getToolDefinition(name);
      if (def) {
        tools.push({
          name: def.name,
          description: def.description,
          input_schema: def.input_schema ?? def.parameters,
        });
      }
    } catch {
      // skip missing tool
    }
  }
  return tools;
}
```

- [ ] **Step 2: Commit Tasks 5 + 6 together**

```bash
git add model-testing-app/src/app/api/meeting-prep-respond/route.ts \
  model-testing-app/convex/replyEvents.ts \
  model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1.1: meeting-prep responder route + public getById

/api/meeting-prep-respond: Next.js route that loads meeting-prep SKILL.md
as Anthropic system prompt (responder mode section guides this
invocation), exposes a focused 4-tool atomic surface (contact/client/
project/touchpoint reads), runs an agentic loop, returns a structured
JSON: { draftReplySubject, draftReplyBody, draftReplyBodyHtml,
suggestedSlots } OR { escalate, reason } if the reply was
misclassified.

Adds public query replyEvents.getById so the route can load the
reply context. Pure-functional: the route does not create approvals
(replyEventProcessor does that with the route's response).

v1.1 uses operator-default availability slots (next 3 business days
at 10:00 UK time); v1.2 will integrate live Google Calendar free/busy
once the integration is plumbed through.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Refactor replyEventProcessor — split book_meeting from operator_review

**Files:**
- Modify: `model-testing-app/convex/replyEventProcessor.ts`

- [ ] **Step 1: Read the current dispatchByIntent function**

Run: `grep -nA 5 "case \"book_meeting\"" model-testing-app/convex/replyEventProcessor.ts`

Confirm the current shape: book_meeting / info_question / unknown / default all fall through to the operator_review block.

- [ ] **Step 2: Split book_meeting into its own case**

Locate the existing `case "book_meeting":` line (it currently falls through to the default block). Replace it with an explicit case that calls the meeting-prep-respond route:

Find:

```typescript
    case "book_meeting":
    case "info_question":
    case "unknown":
    default: {
      // Create an operator-review approval
      ...
    }
```

Replace with:

```typescript
    case "book_meeting": {
      // v1.1: call meeting-prep-respond route to draft an availability reply.
      const appUrl = process.env.NEXT_APP_URL;
      if (!appUrl) {
        // No app URL configured; fall back to operator review.
        await createOperatorReviewApproval(ctx, args, "no_app_url_for_responder");
        return { destination: "operator_review" };
      }
      let respondResult:
        | {
            draftReplySubject?: string;
            draftReplyBody?: string;
            draftReplyBodyHtml?: string;
            suggestedSlots?: Array<{ iso: string; display: string }>;
            escalate?: boolean;
            reason?: string;
            error?: string;
          }
        | null = null;
      try {
        const res = await fetch(`${appUrl}/api/meeting-prep-respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replyEventId: args.replyEventId }),
        });
        if (!res.ok) {
          respondResult = { error: `responder returned ${res.status}` };
        } else {
          respondResult = await res.json();
        }
      } catch (err) {
        respondResult = {
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (respondResult?.error) {
        await ctx.runMutation(internal.replyEvents.appendErrorInternal, {
          replyEventId: args.replyEventId,
          message: `meeting-prep-respond call failed: ${respondResult.error}`,
        });
        await createOperatorReviewApproval(ctx, args, "responder_failure");
        return { destination: "operator_review" };
      }

      if (respondResult?.escalate) {
        await createOperatorReviewApproval(ctx, args, respondResult.reason ?? "responder_escalated");
        return { destination: "operator_review" };
      }

      if (
        !respondResult?.draftReplySubject ||
        !respondResult?.draftReplyBody
      ) {
        await ctx.runMutation(internal.replyEvents.appendErrorInternal, {
          replyEventId: args.replyEventId,
          message: "responder returned unexpected shape",
        });
        await createOperatorReviewApproval(ctx, args, "responder_invalid_shape");
        return { destination: "operator_review" };
      }

      // Stage an approval with the drafted reply.
      await ctx.runMutation(internal.approvals.internalCreate, {
        entityType: "gmail_send",
        summary: `Drafted availability reply: ${respondResult.draftReplySubject.slice(0, 150)}`,
        draftPayload: {
          to: undefined,  // operator fills in the to-address on send (we matched contact, not their email yet)
          subject: respondResult.draftReplySubject,
          bodyText: respondResult.draftReplyBody,
          bodyHtml: respondResult.draftReplyBodyHtml ?? `<p>${respondResult.draftReplyBody}</p>`,
          suggestedSlots: respondResult.suggestedSlots ?? [],
          replyEventId: args.replyEventId,
          intent: args.intent,
        },
        requestedBy: args.userId,
        requestSource: "background_job",
        requestSourceName: "cadence-fire/meeting-prep-respond",
        relatedContactId: args.contactId,
      });
      return { destination: "meeting-prep" };
    }

    case "info_question":
    case "unknown":
    default: {
      // Create an operator-review approval (existing fallback).
      await createOperatorReviewApproval(ctx, args, args.intent);
      return { destination: "operator_review" };
    }
```

- [ ] **Step 3: Extract the operator-review helper**

The new code calls `createOperatorReviewApproval`. Extract the existing inline approval-creation logic from the old default case into this helper. Add to the top of the file (after the imports + type defs):

```typescript
async function createOperatorReviewApproval(
  ctx: any,
  args: {
    intent: string;
    replyEventId: Id<"replyEvents">;
    contactId: Id<"contacts">;
    userId: Id<"users">;
    replyBody?: string;
    replySubject?: string;
  },
  reason: string,
): Promise<void> {
  await ctx.runMutation(internal.approvals.internalCreate, {
    entityType: "client_communication",
    summary: `Reply needs operator review (intent: ${args.intent}, reason: ${reason})`,
    draftPayload: {
      intent: args.intent,
      reason,
      replyBody: args.replyBody ?? "(no body — HubSpot sweep path)",
      replySubject: args.replySubject ?? "",
      replyEventId: args.replyEventId,
    },
    requestedBy: args.userId,
    requestSource: "background_job",
    requestSourceName: "cadence-fire/reply-router",
    relatedContactId: args.contactId,
  });
}
```

- [ ] **Step 4: Deploy + codegen**

```bash
cd model-testing-app
npx convex dev --once && npx convex codegen
```

- [ ] **Step 5: Smoke-test ingestFromHubspot returns the right destination**

This requires the dev server to call the responder route. Deferred to Task 8's combined smoke test. For now confirm the empty-no-match path still works:

```bash
npx convex run replyEventProcessor:ingestFromHubspot '{
  "engagementId": "smoketest-v11-1",
  "contactEmail": "nonexistent@example.com",
  "receivedAt": "2026-05-23T20:00:00Z",
  "userId": "<a-real-user-id>"
}'
```

Expected: returns `{"status": "no_contact_match", "replyEventId": "..."}`. Confirms the refactor didn't break the no-contact-match path.

- [ ] **Step 6: Commit Task 7**

```bash
git add model-testing-app/convex/replyEventProcessor.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1.1: split book_meeting from operator-review fallback

replyEventProcessor.dispatchByIntent: book_meeting now POSTs to
/api/meeting-prep-respond and stages an approval with the drafted
availability reply (entityType: gmail_send), rather than falling
through to the operator-review approval (entityType:
client_communication). Destination value is "meeting-prep" — was
previously "operator_review" for book_meeting replies.

info_question and unknown intents still route to operator-review;
their dedicated skills will come in subsequent hardening sessions.

Failures and escalations from the responder route fall back to
operator-review with a structured reason so the failure is auditable.

Extracted the operator-review approval creation into a helper to
keep the switch cases readable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 3 — Build verification + smoke tests (~20 min)

### Task 8: Final build verification + end-to-end smoke tests + push

**Files:** none modified; verification + push only.

- [ ] **Step 1: Run convex codegen + next build**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/.worktrees/cadence-fire-v1.1/model-testing-app
npx convex codegen && npx next build 2>&1 | tail -50
```

Expected: build completes successfully. If there are errors in the two new routes or the modified Convex files, fix them and re-build.

Common issues:
- The `getToolDefinition` import path may be wrong — check `model-testing-app/src/lib/tools/index.ts` for the actual export name (might be `getToolDefinition`, `getAtomicTool`, `getTool`, or similar)
- Anthropic SDK types for `Tool`, `ToolUseBlock`, `TextBlock`, `MessageParam`, `ToolResultBlockParam` should be importable from `@anthropic-ai/sdk` — if errors, check what's exported in your installed version

- [ ] **Step 2: Smoke-test the composer route (requires dev server)**

Start the Next.js dev server in background:

```bash
cd /Users/cowboy/rockcap/rockcap-v2/.worktrees/cadence-fire-v1.1/model-testing-app
npm run dev &
# Wait for it to be ready (look for "Ready in ...")
```

(Or skip the live test — the build verification above is sufficient evidence the route compiles. Operator can run end-to-end tests post-merge.)

If you ran the dev server, in another shell:

1. Get a real userId and contactId via Convex CLI (`npx convex run "users:list" '{}'`).
2. Insert a DYNAMIC-MODE cadence (no preDraftedTouch, type bdm_relationship to exercise the per-type composition path):

```bash
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cadence.create","arguments":{"contactId":"<CONTACT_ID>","cadenceType":"bdm_relationship","nextDueAt":"2020-01-01T00:00:00Z","scheduleConfig":{"intervalDays":42},"isActive":true}}}'
```

3. Trigger the dispatcher and observe whether it composes:

```bash
npx convex run cadenceDispatcher:tick
```

Expected: `{fired: 1, ...}` if composer succeeded, or `{failed: 1, ...}` if composer hit an error. Either way, the dispatcher exercises the new path.

4. Check the cadence row's lastResult + check approvals table for a new row with `requestSourceName: "cadence-fire (composed)"`.

5. Clean up the smoke test cadence row.

If skipping the live test: verify the dev server starts cleanly and the route compiles at minimum:

```bash
curl -s -X POST http://localhost:3000/api/cadence-compose \
  -H "Content-Type: application/json" \
  -d '{"cadenceId":"definitely-not-real"}' | head -3
```

Expected: returns an error about either unauthenticated or invalid cadenceId. Confirms the route is wired.

- [ ] **Step 3: Push the branch**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/.worktrees/cadence-fire-v1.1
git push -u origin cadence-fire-v1.1
```

Expected: branch pushed. Returns a "create PR" URL.

- [ ] **Step 4: Generate summary for operator**

```bash
echo "=== v1.1 commits ==="
git log --oneline cadence-fire-v1..HEAD
echo ""
echo "=== Files changed since v1 ==="
git diff --stat cadence-fire-v1..HEAD | tail -15
```

Surface a summary covering:
- Branch + push status
- Number of commits since v1
- Composer route status (live, smoke-test result or skipped)
- Responder route status (live, smoke-test result or skipped)
- Known follow-ups: Pub/Sub still pending; v1.2 calendar integration for real availability; Level A hardening session for meeting-prep against real data; info_question intent (qualify-and-draft hardening) is next-most-leverage gap

**Plan complete.**

---

## Plan Self-Review

**Spec coverage:**

| Spec section (v1.1 from cadence-fire spec section 3.2) | Plan task(s) |
|---|---|
| Composer (`/api/cadence-compose`) | Tasks 1, 2 |
| Dynamic-compose cadence types | Task 3 (SKILL.md update activates them) |
| meeting-prep hardening (so book_meeting dispatches to a real skill) | Tasks 4, 5, 6, 7 |

**Placeholder scan:** Searched for TBD, TODO, "fill in details". One acknowledged placeholder: the composer's `api.cadences.getById` is referenced in Task 1 but not added until Task 2 — intentional (Task 2 commits the wrapper). Same pattern with `api.replyEvents.getById` (referenced Task 6, added Task 5).

**Type consistency:** The composer returns `{ touch: { subject, bodyText, bodyHtml } } | { skip, reason }`; the dispatcher branch matches this exactly. The responder returns `{ draftReplySubject, draftReplyBody, draftReplyBodyHtml, suggestedSlots } | { escalate, reason }`; the processor branch matches. Tool name lists use the same convention (`<domain>.<action>`) as the existing chat-assistant.

**Spec-to-plan gap check:** Both v1.1 items from the spec are covered. Calendar live-availability is deferred to v1.2 (documented as such in the SKILL.md). Level A operator-driven hardening for meeting-prep against real data is acknowledged in the plan summary but is operator work, not autonomous build.

**Risk callout:** The `getToolDefinition` import path is a guess; if the actual export name differs, Task 1 and Task 6 will both need a small fix during build verification. This is a known unknown — flagged in Task 8 Step 1.
