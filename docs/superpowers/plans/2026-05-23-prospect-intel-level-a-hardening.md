# Prospect-Intel Level A Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the substrate (`skillRuns` table, `skillRun.start`/`complete` MCP tools, `## Dedup` and `### Skill execution` doc additions), then drive one real `prospect-intel` run against a live prospect, then produce the cross-skill hardening playbook from the experience.

**Architecture:** Additive Convex schema + two new MCP tools alongside existing `approval.create` + two small markdown additions. The skill execution itself is operator-driven, with Claude calling `skillRun.start` before workflow execution and `skillRun.complete` at the end. Gaps surfaced during the run are dual-logged (structured in `gaps[]` on the row, operational in `.logbook/inbox.md`) and triaged into queued tasks after the session.

**Tech Stack:** Convex (schema, mutations, queries, HTTP actions), TypeScript, Next.js 16 (build target), MCP over JSON-RPC, markdown for skill content + playbook.

**Reference spec:** `docs/superpowers/specs/2026-05-23-prospect-intel-level-a-hardening-design.md`

---

## File Structure

**Created:**
- `model-testing-app/convex/skillRuns.ts` — internal mutations and queries for the `skillRuns` table (~80 lines)
- `skills/HARDENING-PLAYBOOK.md` — cross-skill hardening playbook seed (~80 lines)

**Modified:**
- `model-testing-app/convex/schema.ts` — add `skillRuns` table definition (~45 lines inserted before closing brace)
- `model-testing-app/convex/mcp.ts` — add `skillRun.start` and `skillRun.complete` to `TOOLS` array (~120 lines inserted before the closing `]`)
- `skills/skills/prospect-intel/SKILL.md` — add `## Dedup` section between `## Inputs` and `## Outputs` (~10 lines)
- `CLAUDE.md` (root) — add `### Skill execution` subsection under `## Workflow Rules` (~15 lines)

**Edited during/after the run (specifics emerge from session):**
- `skills/skills/prospect-intel/SKILL.md` (clarifications, edge cases)
- `skills/skills/prospect-intel/references/*.md` (thin-reference fixes)
- `.logbook/inbox.md` (gap entries via `/jot`)
- `.logbook/queued/2026-05-23_*.md` (triaged tasks)

**Verification surface:** Convex dashboard (`https://dashboard.convex.dev/d/incredible-kudu-562` → Data → skillRuns table) + `curl` calls to `https://incredible-kudu-562.convex.site/mcp` with the bearer token from `.mcp.json`.

---

# PHASE 1 — Substrate (~30 min)

### Task 1: Add `skillRuns` table to schema + internal mutations file

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (insert before final `});`)
- Create: `model-testing-app/convex/skillRuns.ts`

- [ ] **Step 1: Read schema.ts to confirm insertion point**

Run: `tail -20 model-testing-app/convex/schema.ts`

Expected: shows the last table definition followed by `});`. Note the line number of the closing `});`.

- [ ] **Step 2: Insert `skillRuns` table definition in `schema.ts`**

Insert the following directly before the closing `});` of the `defineSchema({` call:

```typescript
  skillRuns: defineTable({
    // Identity
    skillName: v.string(),
    userId: v.id("users"),

    // Input
    input: v.any(),
    trigger: v.optional(v.string()),

    // Dedup
    dedupKey: v.optional(v.string()),
    dedupWindowDays: v.optional(v.number()),

    // Status
    status: v.union(
      v.literal("running"),
      v.literal("complete"),
      v.literal("complete_with_gaps"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),

    // Output
    brief: v.optional(v.string()),

    // Linked entities (denormalised for quick UI render)
    linkedClientId: v.optional(v.id("clients")),
    linkedProjectId: v.optional(v.id("projects")),
    linkedApprovalIds: v.optional(v.array(v.id("approvals"))),

    // Gaps surfaced during the run (punch list)
    gaps: v.optional(v.array(v.object({
      kind: v.string(),
      description: v.string(),
      suggestedFix: v.optional(v.string()),
    }))),

    // Errors encountered
    errors: v.optional(v.array(v.object({
      step: v.string(),
      message: v.string(),
    }))),

    // Audit
    completedAt: v.optional(v.string()),
    durationMs: v.optional(v.number()),

    // Batch (future)
    parentBatchId: v.optional(v.id("bulkUploadBatches")),
  })
    .index("by_user", ["userId"])
    .index("by_skill_and_dedup_key", ["skillName", "dedupKey"])
    .index("by_status", ["status"])
    .index("by_skill_and_user", ["skillName", "userId"]),
```

- [ ] **Step 3: Create `convex/skillRuns.ts` with internal mutations and query**

Create the new file with this content (complete, no placeholders):

```typescript
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Internal API for the skillRuns table. Exposed via MCP through convex/mcp.ts
// (skillRun.start, skillRun.complete). Not directly callable by the chat
// assistant or other in-app code.

// ── Create a new run row (called by skillRun.start MCP tool) ─────────

export const createInternal = internalMutation({
  args: {
    skillName: v.string(),
    userId: v.id("users"),
    input: v.any(),
    trigger: v.optional(v.string()),
    dedupKey: v.optional(v.string()),
    dedupWindowDays: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("complete"),
      v.literal("complete_with_gaps"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("skillRuns", args);
  },
});

// ── Find a recent prior run for dedup check ──────────────────────────
//
// Returns the most recent complete or complete_with_gaps run for the given
// skill+dedupKey within the window, or null if none.

export const findRecentByDedupKeyInternal = internalQuery({
  args: {
    skillName: v.string(),
    dedupKey: v.string(),
    cutoffMs: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("skillRuns")
      .withIndex("by_skill_and_dedup_key", (q) =>
        q.eq("skillName", args.skillName).eq("dedupKey", args.dedupKey),
      )
      .order("desc")
      .take(20);
    for (const row of rows) {
      if (row._creationTime < args.cutoffMs) break;
      if (row.status === "complete" || row.status === "complete_with_gaps") {
        return row;
      }
    }
    return null;
  },
});

// ── Get one run by id ────────────────────────────────────────────────

export const getInternal = internalQuery({
  args: { runId: v.id("skillRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

// ── Complete a run (called by skillRun.complete MCP tool) ────────────

export const completeInternal = internalMutation({
  args: {
    runId: v.id("skillRuns"),
    userId: v.id("users"),
    status: v.union(
      v.literal("complete"),
      v.literal("complete_with_gaps"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    brief: v.optional(v.string()),
    linkedClientId: v.optional(v.id("clients")),
    linkedProjectId: v.optional(v.id("projects")),
    linkedApprovalIds: v.optional(v.array(v.id("approvals"))),
    gaps: v.optional(v.array(v.object({
      kind: v.string(),
      description: v.string(),
      suggestedFix: v.optional(v.string()),
    }))),
    errors: v.optional(v.array(v.object({
      step: v.string(),
      message: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error(`skillRun not found: ${args.runId}`);
    if (run.userId !== args.userId) {
      throw new Error(`skillRun ${args.runId} does not belong to caller`);
    }
    const completedAtIso = new Date().toISOString();
    const durationMs = Date.now() - run._creationTime;
    await ctx.db.patch(args.runId, {
      status: args.status,
      brief: args.brief,
      linkedClientId: args.linkedClientId,
      linkedProjectId: args.linkedProjectId,
      linkedApprovalIds: args.linkedApprovalIds,
      gaps: args.gaps,
      errors: args.errors,
      completedAt: completedAtIso,
      durationMs,
    });
    return { ok: true, durationMs };
  },
});
```

- [ ] **Step 4: Deploy schema + new file to Convex**

Run (from `model-testing-app/`): `npx convex dev --once`

Expected output: includes lines like `Pushed code to ...` and confirms a schema change was detected. No errors about ambiguous types or missing indexes. If the existing dev process is already running, the change will be picked up automatically; one-shot mode is safer in case it isn't.

- [ ] **Step 5: Verify the table exists in the deployment**

Run: `npx convex run skillRuns:getInternal '{"runId":"nonsense"}'`

Expected: errors with something like `Validator error: Expected ID for table "skillRuns"` — confirms the table exists and the internal query is registered. (We're not actually fetching anything; this is a smoke test that the schema + module deployed.)

- [ ] **Step 6: Commit Phase 1 substrate so far**

Run:
```bash
git add model-testing-app/convex/schema.ts model-testing-app/convex/skillRuns.ts
git commit -m "$(cat <<'EOF'
[app] add skillRuns table + internal mutations for skill execution audit trail

Additive new table per spec docs/superpowers/specs/2026-05-23-prospect-intel-level-a-hardening-design.md
Internal mutations: createInternal, completeInternal
Internal queries: findRecentByDedupKeyInternal, getInternal
Indexes: by_user, by_skill_and_dedup_key, by_status, by_skill_and_user

MCP tool surface (skillRun.start, skillRun.complete) lands in next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds, no pre-commit hook failures.

---

### Task 2: Add `skillRun.start` MCP tool

**Files:**
- Modify: `model-testing-app/convex/mcp.ts` (insert in `TOOLS` array, after `approval.create` tool definition near line 403)

- [ ] **Step 1: Confirm the bearer token + endpoint for manual MCP calls**

Run: `cat /Users/cowboy/rockcap/rockcap-v2/.mcp.json`

Expected output shows `"url": "https://incredible-kudu-562.convex.site/mcp"` and `"Authorization": "Bearer rcp_..."`. Capture both for the verification calls below.

- [ ] **Step 2: Write the manual verification call (red phase)**

Save the following as a one-liner you can re-run. Substitute the real token from Step 1 for `<TOKEN>`:

```bash
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"skillRun.start","arguments":{"skillName":"prospect-intel","input":{"companyName":"Test Co"},"trigger":"plan verification","dedupKey":"TEST-12345678","dedupWindowDays":7}}}'
```

Run it now (before adding the tool). Expected response: JSON-RPC error `{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"Tool not found: skillRun.start"}}`. This is the red phase — the tool is correctly absent.

- [ ] **Step 3: Insert `skillRun.start` tool definition in `mcp.ts`**

Insert the following inside the `TOOLS` array, after the `approval.create` block and before the closing `]` (around line 403 of the current `mcp.ts`):

```typescript
  // Skill execution lifecycle (BL-5.x; see spec
  // docs/superpowers/specs/2026-05-23-prospect-intel-level-a-hardening-design.md)
  {
    name: "skillRun.start",
    description:
      "Begin a skill execution. Creates a skillRuns row, returns runId. If dedupKey + dedupWindowDays are provided and a prior complete/complete_with_gaps run exists within the window for the same skill+dedupKey, returns status=duplicate_found with the prior run summary so the caller can surface it to the operator before continuing.",
    inputSchema: {
      type: "object",
      properties: {
        skillName: { type: "string", description: "e.g., 'prospect-intel'" },
        input: { type: "object", description: "Raw args the skill received" },
        trigger: { type: "string", description: "Free-form context, e.g., 'planning hit on Mulberry'" },
        dedupKey: { type: "string", description: "Normalised identifier per the skill's ## Dedup section (e.g., a resolved Companies House number)" },
        dedupWindowDays: { type: "number" },
      },
      required: ["skillName", "input"],
    },
    handler: async (ctx, userId, args) => {
      // Dedup check (only if both key + window supplied)
      if (args.dedupKey && args.dedupWindowDays) {
        const windowMs = args.dedupWindowDays * 24 * 60 * 60 * 1000;
        const cutoffMs = Date.now() - windowMs;
        const priorRun = await ctx.runQuery(internal.skillRuns.findRecentByDedupKeyInternal, {
          skillName: args.skillName,
          dedupKey: args.dedupKey,
          cutoffMs,
        });
        if (priorRun) {
          const ageHours = (Date.now() - priorRun._creationTime) / (1000 * 60 * 60);
          return asText({
            status: "duplicate_found",
            priorRunId: priorRun._id,
            priorRunBrief: priorRun.brief ?? "",
            priorRunAgeHours: Math.round(ageHours * 10) / 10,
          });
        }
      }
      const runId = await ctx.runMutation(internal.skillRuns.createInternal, {
        skillName: args.skillName,
        userId,
        input: args.input,
        trigger: args.trigger,
        dedupKey: args.dedupKey,
        dedupWindowDays: args.dedupWindowDays,
        status: "running",
      });
      return asText({ status: "created", runId });
    },
  },
```

- [ ] **Step 4: Deploy**

Run (from `model-testing-app/`): `npx convex dev --once`

Expected: no errors. The `mcp.ts` HTTP action is re-pushed.

- [ ] **Step 5: Re-run the verification call (green phase, create path)**

Re-run the curl from Step 2. Expected response: `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\n  \"status\": \"created\",\n  \"runId\": \"...\"\n}"}]}}`. Note the returned `runId` — paste it somewhere; it's used in Task 3 verification.

- [ ] **Step 6: Verify the dedup path**

Run the same curl again (same dedupKey, within 7 days). Expected response now: `status: "duplicate_found"`, `priorRunId` matches the runId from Step 5, `priorRunBrief` empty (no brief yet — run is still `running`).

*Edge case caught here:* the dedup query filters on `status in [complete, complete_with_gaps]`, but our prior row is `running`. So we should NOT see duplicate_found. If we do, the filter logic in `findRecentByDedupKeyInternal` is wrong; fix it.

Expected actual response: `status: "created"` again with a *new* runId (because the previous one is still running, not complete). Good — the dedup logic correctly ignores in-flight runs.

- [ ] **Step 7: Commit Task 2**

Run:
```bash
git add model-testing-app/convex/mcp.ts
git commit -m "$(cat <<'EOF'
[app] add skillRun.start MCP tool with dedup-aware lookup

Tool flow: if dedupKey + dedupWindowDays supplied, query for a recent
complete/complete_with_gaps run on the same (skillName, dedupKey).
If found within the window, return status=duplicate_found with prior brief.
Otherwise create a skillRuns row with status=running, return its id.

Verified end-to-end via curl against the live MCP endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add `skillRun.complete` MCP tool

**Files:**
- Modify: `model-testing-app/convex/mcp.ts` (insert after `skillRun.start` in the `TOOLS` array)

- [ ] **Step 1: Write the verification call (red phase)**

Substitute `<TOKEN>` and `<RUN_ID>` (the runId returned from Task 2, Step 5):

```bash
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"skillRun.complete","arguments":{"runId":"<RUN_ID>","status":"complete","brief":"plan-verification close — this row is a smoke test, safe to delete","gaps":[{"kind":"missing_tool","description":"placeholder gap for verification","suggestedFix":"none"}]}}}'
```

Run it before adding the tool. Expected: `error.message: "Tool not found: skillRun.complete"`.

- [ ] **Step 2: Insert `skillRun.complete` tool definition in `mcp.ts`**

Directly after the `skillRun.start` block from Task 2, insert:

```typescript
  {
    name: "skillRun.complete",
    description:
      "Close a skill execution. Sets status (complete / complete_with_gaps / failed / cancelled), persists the narrative brief, records linked entities and the structured gaps + errors arrays. Sets completedAt and computes durationMs. Validates that the runId belongs to the calling user.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "The runId returned by skillRun.start" },
        status: {
          type: "string",
          description: "complete / complete_with_gaps / failed / cancelled",
        },
        brief: { type: "string", description: "Two-paragraph narrative summary, per CONVENTIONS voice rules" },
        linkedClientId: { type: "string" },
        linkedProjectId: { type: "string" },
        linkedApprovalIds: { type: "array", items: { type: "string" } },
        gaps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", description: "missing_tool / thin_reference / ui_gap / schema_gap / other" },
              description: { type: "string" },
              suggestedFix: { type: "string" },
            },
            required: ["kind", "description"],
          },
        },
        errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              step: { type: "string" },
              message: { type: "string" },
            },
            required: ["step", "message"],
          },
        },
      },
      required: ["runId", "status"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.skillRuns.completeInternal, {
        runId: args.runId,
        userId,
        status: args.status,
        brief: args.brief,
        linkedClientId: args.linkedClientId,
        linkedProjectId: args.linkedProjectId,
        linkedApprovalIds: args.linkedApprovalIds,
        gaps: args.gaps,
        errors: args.errors,
      });
      return asText(result);
    },
  },
```

- [ ] **Step 3: Deploy**

Run (from `model-testing-app/`): `npx convex dev --once`

Expected: no errors.

- [ ] **Step 4: Re-run the verification call (green phase)**

Re-run the curl from Step 1 with a valid `<RUN_ID>`. Expected response: `{"ok": true, "durationMs": <number>}`.

- [ ] **Step 5: Verify in the Convex dashboard**

Open `https://dashboard.convex.dev/d/incredible-kudu-562` → Data → `skillRuns`. Confirm the row shows: `status: "complete"`, `brief` populated, `completedAt` set, `durationMs` non-null, `gaps` array with the one placeholder gap.

- [ ] **Step 6: Test the ownership guard (red path)**

To verify the security check (a user can't close another user's run): there's no second user to easily impersonate, so confirm the guard is present in the code by re-reading `skillRuns.ts:completeInternal` (Task 1, Step 3). The line `if (run.userId !== args.userId) throw new Error(...)` should be present.

If this guard is missing, add it.

- [ ] **Step 7: Commit Task 3**

```bash
git add model-testing-app/convex/mcp.ts
git commit -m "$(cat <<'EOF'
[app] add skillRun.complete MCP tool

Closes a skill execution: sets status, persists brief, captures linked
entities and structured gaps + errors, computes durationMs. Verifies
the run belongs to the caller (user-isolation guard in the internal
mutation).

Together with skillRun.start (prior commit), this completes the
substrate that lets skills persist their full execution as a first-class
app record. Surface in /skill-runs UI is deferred (Yes-B in spec).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add `## Dedup` section to `prospect-intel/SKILL.md`

**Files:**
- Modify: `skills/skills/prospect-intel/SKILL.md` (insert between `## Inputs` and `## Outputs`)

- [ ] **Step 1: Read the current SKILL.md to confirm insertion point**

Run: `grep -n '^## ' /Users/cowboy/rockcap/rockcap-v2/skills/skills/prospect-intel/SKILL.md`

Expected output includes (in order): `## Trigger`, `## Inputs`, `## Outputs`, `## High-level workflow`, `## Style rules`, `## Tool dependencies`, `## What goes wrong`, `## References`.

The `## Dedup` section goes between `## Inputs` and `## Outputs`.

- [ ] **Step 2: Insert the `## Dedup` section**

Find the line ending the `## Inputs` section (the line directly before `## Outputs`). Insert the following block between them, with a blank line above and below:

```md
## Dedup

- **dedupKey**: the resolved `companiesHouseNumber` (set after step 1 of the workflow).
- **dedupWindowDays**: 7
- **On duplicate**: surface the prior run's brief and ask the operator
  "refresh (re-run from scratch) or open prior?". Default action is "open prior"
  unless the operator explicitly asks for a refresh.
- **Why 7 days**: Companies House charge filings can land any day; a new filing
  often justifies a fresh DNA analysis. Shorter than 7 risks blocking legitimate
  refreshes; longer leaves stale conclusions live.
```

- [ ] **Step 3: Verify the edit**

Run: `grep -A 1 '^## ' /Users/cowboy/rockcap/rockcap-v2/skills/skills/prospect-intel/SKILL.md | head -10`

Expected: `## Dedup` appears between `## Inputs` and `## Outputs` in the section list.

- [ ] **Step 4: Update the workflow step 1 reference (consistency)**

In SKILL.md, locate step 1 of `## High-level workflow` ("Resolve the company"). At the end of that step's paragraph, add a sentence:

```
At this point the canonical `companiesHouseNumber` is available; call `skillRun.start` with `dedupKey: companiesHouseNumber`, `dedupWindowDays: 7` per the `## Dedup` section above. If the response is `duplicate_found`, surface the prior brief and ask the operator before continuing.
```

This binds the dedup policy to the workflow's actual entry point.

- [ ] **Step 5: Commit (no code change, will batch with Task 5)**

Skip — commit batched with Task 5.

---

### Task 5: Add `### Skill execution` subsection to root `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (root of repo)

- [ ] **Step 1: Read the current CLAUDE.md structure**

Run: `grep -n '^#' /Users/cowboy/rockcap/rockcap-v2/CLAUDE.md`

Expected: `# CLAUDE.md`, `## Workflow Rules`, `### Plan Execution`, `### Repo layout`, `## Task Tracking — Logbook Plugin`.

`### Skill execution` goes under `## Workflow Rules`, after `### Repo layout` and before `## Task Tracking`.

- [ ] **Step 2: Insert the `### Skill execution` subsection**

After the `### Repo layout` block and before the `---` separator (or before `## Task Tracking` if no separator), insert:

```md
### Skill execution

When invoking a skill from `skills/skills/`:

1. **Always call `skillRun.start` first** with `skillName`, `input`, `trigger` (if known), and (if the skill's `SKILL.md` has a `## Dedup` section) `dedupKey` plus `dedupWindowDays`. Use the returned `runId` for the rest of the workflow.
2. **Honour the dedup response.** On `status: "duplicate_found"`, surface the prior brief to the operator and ask before continuing.
3. **Always call `skillRun.complete` at the end** with status, brief, and links to created or updated entities. Never leave a run in `status: "running"`.
4. **Log gaps as you find them.** Missing MCP tools, thin references, app UI gaps: capture in the `gaps` array on `skillRun.complete` and (in parallel) `/jot` them into the logbook for triage.
```

(Note: the spec used an em-dash in item 4; replaced with colon here per CONVENTIONS voice rules, since this text gets read by Claude on every session.)

- [ ] **Step 3: Verify the edit**

Run: `grep -n '^### Skill execution' /Users/cowboy/rockcap/rockcap-v2/CLAUDE.md`

Expected: one match, in the right position relative to the surrounding headers.

- [ ] **Step 4: Commit Tasks 4 + 5 together**

```bash
git add skills/skills/prospect-intel/SKILL.md CLAUDE.md
git commit -m "$(cat <<'EOF'
[both] prospect-intel ## Dedup section + CLAUDE.md ### Skill execution rules

Binds the skillRun.start/complete substrate (prior commits) into the
operator-facing instructions:
- prospect-intel SKILL.md declares dedupKey=companiesHouseNumber,
  dedupWindowDays=7, and references the call site in workflow step 1
- root CLAUDE.md adds a 4-rule Skill execution subsection under Workflow Rules

First skill-aware addition to CLAUDE.md. Pattern will be reused as other
skills are hardened per the playbook (skills/HARDENING-PLAYBOOK.md, TBD).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final substrate build check

**Files:** none modified; verification only.

- [ ] **Step 1: Run the Next.js build from the app directory**

Run (from `model-testing-app/`): `npx next build`

Expected: build completes successfully. Look out for any Convex codegen warnings about the new `skillRuns` table or its index names.

If the build fails on Convex types (e.g., `internal.skillRuns.createInternal` not in the generated API), run `npx convex codegen` from `model-testing-app/` first, then retry the build.

- [ ] **Step 2: Confirm MCP tools are visible via tools/list**

Run (substitute `<TOKEN>`):

```bash
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}' | grep -oE '"name":"[^"]*"'
```

Expected: includes `"name":"skillRun.start"` and `"name":"skillRun.complete"` alongside the existing tools.

- [ ] **Step 3: Delete the smoke-test row created during Task 2 + Task 3 verification**

Open `https://dashboard.convex.dev/d/incredible-kudu-562` → Data → `skillRuns`. Delete any rows with `input.companyName == "Test Co"` or `dedupKey == "TEST-12345678"`. Keep the table empty before the real run.

(Alternatively: leave them — they're tagged so future operators understand they're smoke tests. Operator's call.)

**Phase 1 done. Substrate is live. Move to Phase 2.**

---

# PHASE 2 — The Session (~30–60 min)

### Task 7: Pre-run checks and prospect selection

**Files:** none modified; preparation only.

- [ ] **Step 1: Choose the prospect**

Run: `curl -s -X POST https://incredible-kudu-562.convex.site/mcp -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"client.list","arguments":{"status":"prospect"}}}'`

Expected: returns an array of clients with `status: "prospect"`.

If empty (no prospects in DB today), fall back: pick an existing `active` developer client (we listed 9 earlier; **Bayfield Homes** is a reasonable smoke-test target as the most recently accessed). Treat it *as if* it were a fresh prospect for the run.

Capture: `companyName`, `companiesHouseNumber` (if available — look it up in Convex dashboard if not on the row), one-sentence `trigger`.

- [ ] **Step 2: Verify MCP connectivity is healthy**

Run: `claude mcp list | grep rockcap-mcp`

Expected: `rockcap-mcp: https://incredible-kudu-562.convex.site/mcp (HTTP) - ✓ Connected`.

- [ ] **Step 3: Confirm `prospect-intel` is visible to Claude Code**

In a *new* Claude Code session (separate from the implementation session), type: `which skills do you see for prospect/intel work?`

Expected: Claude lists `prospect-intel` from `skills/skills/`. If not, check that `skillsPath` in Claude Code settings still points at `~/rockcap/rockcap-v2/skills/skills/` (per SETUP.md). Fix if needed; do NOT proceed until the skill loads.

Close that session.

---

### Task 8: Execute the prospect-intel run (operator-driven session)

**Files:** none modified directly; outputs land in Convex (`skillRuns`, `clients`, `clientIntelligence`, `approvals`) and `.logbook/inbox.md`.

This is the discovery task. Procedure, not code.

- [ ] **Step 1: Open a fresh Claude Code session**

Operator: open a new Claude Code window/session, ideally in a directory other than this repo so the implementation context doesn't leak in.

- [ ] **Step 2: Trigger the skill**

Type (substituting the captured values):

> *"Run prospect intel on {companyName}. Trigger: {one-sentence trigger}."*

Claude should respond by loading `prospect-intel/SKILL.md` and following its workflow.

- [ ] **Step 3: Verify Claude calls `skillRun.start` after step 1 resolution**

Watch Claude's tool calls. After Claude resolves the company (step 1) and *before* it executes step 2, it should call `skillRun.start` with `skillName: "prospect-intel"`, `dedupKey: <resolved CH number>`, `dedupWindowDays: 7`.

If Claude does NOT call `skillRun.start` at this point: it means the CLAUDE.md rule from Task 5 isn't being honoured. Surface this to the operator as the **first gap** of the session — log to `.logbook/inbox.md` immediately. Then *prompt* Claude: "Per CLAUDE.md, you should call skillRun.start before continuing." This is itself a finding (the CLAUDE.md rule needs strengthening or relocation).

- [ ] **Step 4: Walk through workflow steps 2-7, logging gaps as they surface**

For each step, expect one of three outcomes (per spec Section 3.3):

| Outcome | Operator action |
|---|---|
| Happy path (tool works) | Let Claude proceed |
| Missing tool | Confirm Claude added a `gap` entry (`{kind:"missing_tool", description, suggestedFix}`). Confirm Claude also `/jot`s to `.logbook/inbox.md`. Pick one of the offered alternatives (paste manual result / skip and log / cancel). |
| Thin reference | Confirm Claude logged `kind:"thin_reference"`. Provide expert input to keep the workflow going. |
| Schema/UI gap | Confirm Claude logged `kind:"schema_gap"` or `"ui_gap"`. Proceed with nearest-fit write and a flag in the brief. |

**Operator's primary job in this task: stay in the loop, answer Claude's questions, do manual steps when asked. Do NOT fix any gap during the run — log it, move on. This is the anti-scope-creep rule from spec Section 5.3.**

- [ ] **Step 5: Verify Claude composes the brief and calls `skillRun.complete`**

At the end of the workflow, Claude should:
1. Compose a two-paragraph brief covering "what we found, what we recommend"
2. Call `skillRun.complete` with `status`, `brief`, `linkedClientId`, `linkedApprovalIds` (if reachout was staged), `gaps` array, `errors` array
3. Surface a short close message with the runId and any linked entity ids

If Claude skips `skillRun.complete`: prompt explicitly. If it leaves the run in `status: "running"` forever, that's a CLAUDE.md rule failure — log as a gap.

- [ ] **Step 6: Capture the runId**

Note the runId from Claude's close message. Used for verification in Task 9.

---

### Task 9: Verify the run was recorded correctly

**Files:** none modified; verification only.

- [ ] **Step 1: Open the run row in the Convex dashboard**

Open `https://dashboard.convex.dev/d/incredible-kudu-562` → Data → `skillRuns`. Filter or scroll to the runId from Task 8 Step 6.

- [ ] **Step 2: Check each field**

Verify:
- `status` is `complete` or `complete_with_gaps`
- `brief` is non-empty and reads as two coherent paragraphs (not a stub)
- `linkedClientId` resolves to a real client row
- `linkedApprovalIds` (if non-empty) resolve to real approval rows in `/approvals`
- `gaps` array contains the issues you saw surfaced during the run
- `completedAt` and `durationMs` are populated
- `userId` matches your user row

If any field is wrong, this is a gap in either the MCP tool implementation (Tasks 2/3) or in how Claude used it. Document specifically and decide whether it's a "fix now" (rare, only if the schema/tool is broken) or "log and continue" (everything else).

- [ ] **Step 3: Confirm `.logbook/inbox.md` mirrors the gaps**

Run: `cat /Users/cowboy/rockcap/rockcap-v2/.logbook/inbox.md`

Expected: one entry per `gaps[]` entry in the row (Claude should have `/jot`-ed in parallel). If `gaps[]` has 5 entries but `inbox.md` has 0 or 2, that's a CLAUDE.md rule compliance gap.

**Phase 2 done. The run produced an audit record + a gap list. Move to Phase 3.**

---

# PHASE 3 — Post-run Artifacts (~30 min)

### Task 10: Triage `.logbook/inbox.md` into queued tasks

**Files:**
- Modify: `.logbook/inbox.md` (entries removed as they're triaged)
- Create: `.logbook/queued/2026-05-23_*.md` (one per triaged task)

- [ ] **Step 1: Invoke the logbook triage skill**

In a Claude Code session, type: `/triage`

The logbook skill groups inbox entries into discrete queued tasks. Most likely groupings (per spec Section 4.3):

- `expose-companies-house-tools-on-mcp` (the 5 CH tools `prospect-intel` listed but the MCP doesn't have)
- `expose-intelligence-write-tools-on-mcp` (updateClientIntelligence, addKnowledgeItem)
- `expose-client-create-and-checkexists-on-mcp`
- `deepen-{reference-name}-reference` (per thin_reference gap)
- `add-ui-for-{discovered-surface}` (per ui_gap)

Adjust groupings to match what actually surfaced.

- [ ] **Step 2: Verify queued tasks exist**

Run: `ls -la /Users/cowboy/rockcap/rockcap-v2/.logbook/queued/`

Expected: one new `2026-05-23_*.md` file per triaged group.

- [ ] **Step 3: Verify inbox is empty (or contains only items you decided not to action)**

Run: `cat /Users/cowboy/rockcap/rockcap-v2/.logbook/inbox.md`

Expected: empty or contains explicit "not actionable / decided to skip" entries.

---

### Task 11: Apply learnings to `prospect-intel/SKILL.md` and references

**Files:**
- Modify: `skills/skills/prospect-intel/SKILL.md` (inline edits per session findings)
- Modify: `skills/skills/prospect-intel/references/lender-dna-from-charges.md` (and others, per gaps)

- [ ] **Step 1: Read the `gaps[]` array from the run row**

In the Convex dashboard, copy the `gaps[]` array as JSON. Group by `kind`:
- `thin_reference` → likely edits to the referenced .md file
- `missing_tool` → already triaged to logbook, no SKILL.md edit needed unless the workflow step itself was wrong
- `schema_gap` / `ui_gap` → log only; the SKILL.md doesn't need to change (the underlying app does)

- [ ] **Step 2: For each `thin_reference` gap, apply the `suggestedFix` to the named reference file**

Example: if `gaps[0]` is `{kind:"thin_reference", description:"lender-dna-from-charges.md doesn't cover the case of three undated charges to the same security agent", suggestedFix:"add 'security agent disambiguation' subsection"}`, then:

1. Open `skills/skills/prospect-intel/references/lender-dna-from-charges.md`
2. Add a new subsection titled "Security agent disambiguation" capturing the rule you applied during the run (from your expert input or what Claude inferred)
3. Save

Repeat for each `thin_reference` gap.

- [ ] **Step 3: For workflow-level errors (Claude got the order wrong, skipped a step, asked the wrong question), edit the relevant section of `prospect-intel/SKILL.md` directly**

If the run revealed that step 4 ("Run Lender DNA analysis") should actually happen *before* step 3 ("Check for existing prospect"), reorder them and explain in the section text why the order changed.

If the run added a new failure mode not in `## What goes wrong`, add it.

- [ ] **Step 4: Verify edits with grep + read**

Run: `grep -c '^## ' /Users/cowboy/rockcap/rockcap-v2/skills/skills/prospect-intel/SKILL.md`

Expected: same section count as before (you only added/edited content, not new top-level sections, unless you specifically intended to).

---

### Task 12: Create `skills/HARDENING-PLAYBOOK.md`

**Files:**
- Create: `skills/HARDENING-PLAYBOOK.md`

- [ ] **Step 1: Write the playbook (≤ 1 page)**

Create the file with the following structure. The five sections are load-bearing (they're the artifact checklist that future skill-hardening sessions follow). Inline content drawn from this session goes in the marked spots.

```md
# Skill Hardening Playbook (Level A)

How to drive a single skill from "scaffolded" to "production-usable against real
data". The worked example is prospect-intel; see
docs/superpowers/specs/2026-05-23-prospect-intel-level-a-hardening-design.md
and docs/superpowers/plans/2026-05-23-prospect-intel-level-a-hardening.md.

## Pre-session checklist
- Schema migrations deployed; `skillRuns` table accessible
- `skillRun.start` and `skillRun.complete` MCP tools live (verify via `claude mcp list` + tools/list call)
- Skill has a `## Dedup` section (or a documented reason it doesn't need one)
- Test subject (prospect/deal/contact/meeting) chosen, ideally already in Convex
- `npx next build` from `model-testing-app/` passes before kickoff

## The session rhythm (30-90 min depending on skill complexity)
1. Pre-run: build, deploy, mcp list, pick subject. ~5 min.
2. Kickoff: invoke skill in fresh Claude Code session. Watch for skillRun.start call.
3. Execution: walk SKILL.md steps; for each gap, dual-log (structured in gaps[], operational via /jot). ~30-60 min.
4. Close: confirm skillRun.complete fires with brief, links, gaps, errors.
5. Debrief: verify row in Convex, triage logbook, edit SKILL.md + references per gaps[], commit.

## The 5 artifacts you must have at the end
1. One `skillRuns` row with status complete/complete_with_gaps and non-empty brief
2. The brief lives in Convex, not just chat (teammate-readable)
3. Punch list mirrored: gaps[] on row + /jot entries in .logbook/inbox.md
4. This playbook still ≤ 1 page (don't grow it; promote patterns to CLAUDE.md instead)
5. CLAUDE.md updates (only patterns confirmed across 2+ skills)

## CLAUDE.md candidates from observation
A running list of cross-skill rules surfaced during hardening sessions.
Promote to real CLAUDE.md only after the same pattern recurs in 2+ skills.

- [2026-05-23] from prospect-intel: <fill in observation from this session, e.g.,
  "skills should write to clientIntelligence with sourceType='skill' to
  distinguish from human edits"; or "blank if no candidates surfaced">
- [pending] from next skill hardening

## Decisions and trade-offs (running log)
- 2026-05-23 (prospect-intel): dedupWindowDays = 7 chosen because charge filings
  can land any day; revisit per skill.
- <add any deferred decisions from this session>

## Anti-scope-creep reminders (read at minute 47)
- "I see a missing MCP tool, let me just add it" → No. Log to gaps + /jot.
- "Let me also harden skill #2 today" → No. One skill, one session.
- "Let's make it autonomous" → No. That's Level B.
- "I'll draft a CLAUDE.md update for this pattern" → Add to "candidates" list above.
  Promote only after the pattern recurs.
```

- [ ] **Step 2: Replace the `<fill in observation>` placeholders with real observations from the session**

Read the run's `gaps[]` + your own notes from Task 8. Pick the 1-3 most important cross-skill observations (things that aren't prospect-intel-specific) and write them in the "CLAUDE.md candidates" section.

If you can't think of any cross-skill observations, write "no candidates surfaced this session" — that's an honest signal and prevents bad CLAUDE.md additions.

- [ ] **Step 3: Verify the file is ≤ 1 page**

Run: `wc -l /Users/cowboy/rockcap/rockcap-v2/skills/HARDENING-PLAYBOOK.md`

Expected: under ~80 lines (rough proxy for one page). If over, cut the verbose sections — the playbook is a shortcut, not the spec.

---

### Task 13: Final build + Phase 3 commit

**Files:** none additional modified; verification + commit.

- [ ] **Step 1: Run the build to catch any latent issues**

Run (from `model-testing-app/`): `npx next build`

Expected: build passes. (The text-only edits in Phase 3 shouldn't break the build, but the spec's Section 5.1 done-condition #7 requires this check.)

- [ ] **Step 2: Stage and commit Phase 3 artifacts**

```bash
git add skills/HARDENING-PLAYBOOK.md skills/skills/prospect-intel/SKILL.md skills/skills/prospect-intel/references/ .logbook/
git status   # eyeball what's staged
```

Confirm only intended files are staged (no `.env`, no `node_modules`, no `_generated`).

```bash
git commit -m "$(cat <<'EOF'
[skills] prospect-intel hardening playbook seed + post-run reference patches

Outputs of the first Level A skill-hardening session:
- skills/HARDENING-PLAYBOOK.md (NEW): cross-skill playbook capturing the
  rhythm, the 5-artifact done-checklist, anti-scope-creep reminders,
  and the running CLAUDE.md-candidates list
- prospect-intel/SKILL.md: clarifications/edits per session findings
- prospect-intel/references/*: thin-reference patches per gaps[] from the run
- .logbook/queued/: gap triage from the session

Run record + brief persisted in Convex skillRuns table (per the substrate
landed in commits 94bc63b..HEAD~1). See spec section 4 for the artifact map.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify the session's done conditions (spec Section 5.1)**

Walk the 8-item checklist from the spec:

1. ✅ 4 architecture additions deployed (Tasks 1-5 confirmed Phase 1)
2. ✅ `skillRuns` row exists with status + brief (Task 9)
3. ✅ `gaps[]` populated (Task 9)
4. ✅ `.logbook/inbox.md` triaged (Task 10)
5. ✅ `skills/HARDENING-PLAYBOOK.md` exists ≤ 1 page (Task 12)
6. ✅ `prospect-intel/SKILL.md` edited per learnings (Task 11)
7. ✅ `npx next build` passes (Task 6 + Task 13 Step 1)
8. ✅ Commits pushed with `[app]` / `[skills]` / `[both]` prefixes (Tasks 1, 2, 3, 5, 13)

If any item is ❌, document the deferral reason in the commit body or in a follow-up commit before declaring done.

- [ ] **Step 4: Hand off**

Surface a summary to the user:
- runId of the hardening session's run
- Count of gaps logged + names of triaged tasks in `.logbook/queued/`
- Most consequential CLAUDE.md candidate (if any)
- Suggested next session (likely: pick the highest-leverage gap from queued, OR re-run prospect-intel on the same prospect to verify dedup fires)

**Plan complete.**

---

## Plan Self-Review

**Spec coverage:**

| Spec section | Plan task(s) |
|---|---|
| 1. Goal & Success Criteria | Task 13 Step 3 (done-condition checklist) |
| 2.1 `skillRuns` table | Task 1 |
| 2.2 `skillRun.start` MCP tool | Task 2 |
| 2.2 `skillRun.complete` MCP tool | Task 3 |
| 2.3 `## Dedup` in SKILL.md | Task 4 |
| 2.4 `### Skill execution` in CLAUDE.md | Task 5 |
| Build order in Section 2 | Tasks 1→6 sequenced exactly per spec |
| 3.1 Pre-run checks | Task 7 |
| 3.2 Run kickoff | Task 8 Steps 1-3 |
| 3.3 Per-step execution | Task 8 Step 4 |
| 3.4 Brief + close | Task 8 Step 5, Task 9 |
| 3.5 Post-run debrief | Tasks 10-12 |
| 4.1 Direct outputs | Task 9 verification |
| 4.2 Playbook + SKILL.md + refs | Tasks 11, 12 |
| 4.3 Logbook state | Task 10 |
| 5.1 Definition of done | Task 13 Step 3 |
| 5.2-5.4 Out of scope / anti-creep / next-session | Embedded in Task 8 Step 4 (anti-creep enforcement) and Task 13 Step 4 (next-session preview) |

**Placeholder scan:** Searched for "TBD", "TODO", "fill in details", "similar to". Found one intentional `<fill in observation>` marker in Task 12 Step 1 (playbook content drawn from real session, not a plan-failure placeholder; Task 12 Step 2 explicitly resolves it). No other placeholders.

**Type consistency:** `skillRun.start` returns `runId` (string in the JSON-RPC text response, `Id<"skillRuns">` in the internal mutation). `skillRun.complete` accepts the same `runId`. Field names match across schema definition (Task 1 Step 2), internal mutations (Task 1 Step 3), MCP tool inputSchema (Tasks 2-3 Step 2), and verification curls. `linkedApprovalIds` is consistently an array of strings/IDs everywhere.

**Spec-to-plan gap check:** Spec Section 6 (Open Considerations) deliberately lists crash recovery, concurrency, observability as deferred. Plan does not implement them; correctly out of scope.

No fixes needed; plan is internally consistent and covers the spec.
