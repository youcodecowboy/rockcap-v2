# Prospect-Intel Level A Hardening — Design

**Date**: 2026-05-23
**Status**: Approved, awaiting implementation plan
**Author**: Brainstormed in Claude Code session
**Related**: `docs/BACKLOG.md` (WS-6 skills, BL-5.1 MCP server, BL-8.5 repo split), `skills/skills/prospect-intel/SKILL.md`, `skills/CONVENTIONS.md`

## Context

The RockCap MCP server (BL-5.1) and per-user token issuance (BL-5.9) shipped on 2026-05-20. The skills tree has 14 SKILL.md files authored (WS-6 22/23 done) but the substrate they sit on is only just now callable from Claude Code. Per the skills/README.md authoring strategy ("depth varies; per-skill references get fleshed out as we discover patterns from operator use"), the intended next move is to drive each skill end-to-end against real data, hardening it through use rather than speculation.

This spec covers the **first such hardening session**: `prospect-intel`, the step-1 skill of the deal lifecycle, run against one real prospect. The session is bounded to **Level A** (operator-driven, gap-tolerant): Claude does as much as today's MCP allows, the operator stays in the loop, and gaps become structured backlog rather than blockers.

The session has three intended yields:
1. A working end-to-end run of `prospect-intel`, with the resulting brief persisted in Convex.
2. The seed of a cross-skill **hardening playbook** that future skill sessions reuse.
3. The first CLAUDE.md additions binding skill execution to MCP-side discipline.

The session also forces the first commitment to **Convex-as-system-of-record for skill outputs**: today the only place a skill's narrative brief can live is Claude's chat history, which is ephemeral and not visible to teammates. This spec adds the missing substrate (a `skillRuns` table and two MCP tools) so the brief, the audit trail, and the gap list all become first-class app records.

---

## 1. Goal and Success Criteria

### Goal

Drive `prospect-intel` end-to-end against one real prospect, using Claude Code talking to the live `rockcap-mcp` server, producing the first canonical `skillRuns` row, a punch list of app gaps, and the seed of the cross-skill hardening playbook plus CLAUDE.md operator guidance.

### Success Criteria

The session is complete when all five are true:

1. **One real `skillRuns` row exists** for the prospect, with `status` of `complete` or `complete_with_gaps`, a non-empty `brief` field, and links to whatever entities were created or updated.
2. **The brief is a record, not a chat artifact.** A teammate opening the row in Convex can read what Claude concluded without access to the original Claude Code session.
3. **A punch list exists** (in `.logbook/inbox.md` or as queued tasks) of every MCP tool prospect-intel needed but didn't have, every reference that proved thin, every app UI gap surfaced.
4. **A playbook seed doc exists** at `skills/HARDENING-PLAYBOOK.md`, ≤ 1 page, capturing the rhythm: what worked, what to repeat for the next skill, what's reusable across the remaining 13.
5. **Root `CLAUDE.md` has its first skill-related additions**, at minimum the meta-rule about honouring `## Dedup` sections and the rule about always calling `skillRun.start` at the beginning of a skill workflow.

### Explicitly NOT Success Criteria

- Zero gaps remaining. Gaps are the point of the exercise.
- Autonomous end-to-end. That is Level B, scoped out.
- Prospect actually contacted. Skills stage approvals; humans approve and execute.
- Any of the other 13 skills touched.
- A `/skill-runs` UI page in the app. That is the "Yes-B" option, deferred.

### Done Condition

All 5 success criteria met, or a written reason in the commit message or `gaps[]` array for any deferred item.

---

## 2. Architecture Additions

Four small additive changes land before the run can start. Each is independently reversible.

### 2.1 `skillRuns` Table (new, `convex/schema.ts`)

```typescript
skillRuns: defineTable({
  // Identity
  skillName: v.string(),                          // "prospect-intel"
  userId: v.id("users"),                          // from MCP token validation

  // Input
  input: v.any(),                                 // raw args the skill received
  trigger: v.optional(v.string()),                // free-form, e.g., "planning hit on Mulberry"

  // Dedup
  dedupKey: v.optional(v.string()),               // normalised identifier (e.g., resolved CH number)
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
  brief: v.optional(v.string()),                  // the narrative summary

  // Linked entities (denormalised for quick UI render)
  linkedClientId: v.optional(v.id("clients")),
  linkedProjectId: v.optional(v.id("projects")),
  linkedApprovalIds: v.optional(v.array(v.id("approvals"))),

  // Gaps surfaced during the run (the punch list)
  gaps: v.optional(v.array(v.object({
    kind: v.string(),                             // "missing_tool" | "thin_reference" | "ui_gap" | "schema_gap"
    description: v.string(),
    suggestedFix: v.optional(v.string()),
  }))),

  // Errors encountered
  errors: v.optional(v.array(v.object({
    step: v.string(),
    message: v.string(),
  }))),

  // Audit
  completedAt: v.optional(v.string()),            // ISO; startedAt = _creationTime
  durationMs: v.optional(v.number()),

  // Batch (future, for the batch-10 vision; nullable today)
  parentBatchId: v.optional(v.id("bulkUploadBatches")),
})
  .index("by_user", ["userId"])
  .index("by_skill_and_dedup_key", ["skillName", "dedupKey"])
  .index("by_status", ["status"])
  .index("by_skill_and_user", ["skillName", "userId"]),
```

Migration risk is low: purely additive new table, no existing row touched. Rollback is dropping the table.

Indexing rationale:
- `by_skill_and_dedup_key` makes the dedup lookup O(log n). Called at the start of every skill invocation; without it, batch-10 runs 10 table scans on `skillRuns`.
- `by_user` and `by_skill_and_user` support the eventual `/skill-runs` UI page (Yes-B, deferred).
- `by_status` supports cleanup jobs (find stale `running` rows, surface failures).

### 2.2 Two New MCP Tools (`convex/mcp.ts`)

Added to the `TOOLS` array alongside `approval.create`.

**`skillRun.start`**

Input:
```typescript
{
  skillName: string,
  input: object,
  trigger?: string,
  dedupKey?: string,
  dedupWindowDays?: number,
}
```

Returns one of:
- `{ status: "created", runId: string }` — fresh row written with `status: "running"`
- `{ status: "duplicate_found", priorRunId, priorRunBrief, priorRunAgeHours }` — prior `complete` or `complete_with_gaps` row exists within the window

Handler logic: if `dedupKey` and `dedupWindowDays` are supplied, query the `by_skill_and_dedup_key` index, filter on `status in ["complete", "complete_with_gaps"]` and `_creationTime >= now - windowMs`. Return the prior row if found; otherwise create a new row with `status: "running"` and return its `_id`.

**`skillRun.complete`**

Input:
```typescript
{
  runId: string,
  status: "complete" | "complete_with_gaps" | "failed" | "cancelled",
  brief?: string,
  linkedClientId?: string,
  linkedProjectId?: string,
  linkedApprovalIds?: string[],
  gaps?: Array<{ kind, description, suggestedFix? }>,
  errors?: Array<{ step, message }>,
}
```

Returns: `{ ok: true, durationMs }`

Handler logic: look up by `runId`, verify the row's `userId` matches the calling token's user (security), set `completedAt = now`, compute `durationMs = completedAt - _creationTime`, patch the row with the provided fields.

### 2.3 `## Dedup` Section in `prospect-intel/SKILL.md`

Inserted after `## Inputs`, before `## Outputs`:

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

Rationale for resolving CH number before calling `skillRun.start`: the operator might type "Acme Bricks Ltd", "ACME BRICKS LTD", or "12345678". All should dedup to the same prior run. Step 1 produces the canonical identifier, so `skillRun.start` is called *after* step 1, not before. The pre-resolution work is treated as "skill prologue".

### 2.4 Root `CLAUDE.md` Addition

Inserted under `## Workflow Rules` as a new subsection:

```md
### Skill execution

When invoking a skill from `skills/skills/`:

1. **Always call `skillRun.start` first** with `skillName`, `input`, `trigger`
   (if known), and (if the skill's `SKILL.md` has a `## Dedup` section)
   `dedupKey` plus `dedupWindowDays`. Use the returned `runId` for the rest
   of the workflow.
2. **Honour the dedup response.** On `status: "duplicate_found"`, surface the
   prior brief to the operator and ask before continuing.
3. **Always call `skillRun.complete` at the end** with status, brief, and links
   to created or updated entities. Never leave a run in `status: "running"`.
4. **Log gaps as you find them.** Missing MCP tools, thin references, app UI
   gaps — capture in the `gaps` array on `skillRun.complete` and (in parallel)
   `/jot` them into the logbook for triage.
```

### Build Order

1. Edit `convex/schema.ts` → add `skillRuns` definition → `npx convex dev` to deploy.
2. Edit `convex/mcp.ts` → add the two tools to the `TOOLS` array → deploy.
3. Edit `skills/skills/prospect-intel/SKILL.md` → add `## Dedup` section.
4. Edit root `CLAUDE.md` → add `### Skill execution` subsection.

Estimated touch: ~80 lines across 4 files. Roughly 30 minutes of one Claude Code session.

---

## 3. Session Flow

### 3.1 Pre-run Checks (operator, ~5 min)

1. Confirm the four Section 2 changes built and deployed: `npx next build` from `model-testing-app/`, confirm Convex schema accepted, verify `claude mcp list` still shows `rockcap-mcp ✓ Connected`.
2. **Pick the prospect.** Ideally one already in Convex so the run doesn't pure-block on the missing Companies House MCP tools. Two candidate sources: an existing `clients` row with `status: "prospect"`, or an existing active developer treated *as if* it were a fresh prospect.
3. Note the trigger context in one sentence (planning hit, cold referral, charge filing, etc.).

### 3.2 Run Kickoff (Claude, first ~30 sec)

Operator opens a fresh Claude Code session and types something like:

> *"Run prospect intel on Bayfield Homes. Trigger: smoke-test prospect for hardening the skill."*

Claude's first moves:

1. Load `skills/skills/prospect-intel/SKILL.md` (auto-loaded via `skillsPath`).
2. Execute SKILL.md step 1 (resolve the company). If the prospect is already in `clients`, use the existing record's CH number. If not, hit the gap (no `companies-house.searchCompanies` on MCP yet), ask the operator to paste the CH number.
3. **Call `skillRun.start`** with `skillName: "prospect-intel"`, `input: { companyName, companiesHouseNumber, trigger }`, `dedupKey: companiesHouseNumber`, `dedupWindowDays: 7`. Receive `runId`.
4. On `status: "duplicate_found"` (will not happen today, the first run ever, but the code path is exercised), surface the prior brief and ask the operator before proceeding.

### 3.3 Per-step Execution (Claude + operator, ~30–60 min)

Claude walks SKILL.md steps 2 through 7. For each step, one of three things happens:

| Outcome | What Claude does |
|---|---|
| Happy path (tool exists, returns data) | Execute, continue to next step. |
| Missing tool | Log to internal gap list: `{ kind: "missing_tool", description, suggestedFix }`. Ask operator: "I can't fetch X directly. Options: (a) you query in the app and paste results, (b) skip and log as a gap, (c) cancel". Operator picks. |
| Thin reference (loaded reference doesn't answer the actual question) | Log: `{ kind: "thin_reference", description, suggestedFix }`. Continue with operator's expert input. |
| Schema or UI gap (Claude wants to write something the schema doesn't model, or the app has no surface to view what's written) | Log: `{ kind: "schema_gap" \| "ui_gap", description, suggestedFix }`. Proceed by writing to nearest fit and flag in the brief. |

In parallel with each gap, Claude `/jot`s the same gap into `.logbook/inbox.md` for later `/triage`. The CLAUDE.md rule from Section 2.4 enforces this.

### 3.4 Composing the Brief and Closing the Run (Claude, ~5 min)

Per SKILL.md, the brief is **two paragraphs maximum**, covering what we found and what we recommend doing about it. The brief must reference the linked entities (client row, intelligence row, staged approval) so a reader can navigate from the run to the underlying records.

Claude calls `skillRun.complete` with:
- `status`: `complete` if every step succeeded, `complete_with_gaps` if any gap was logged, `failed` if a hard error stopped the workflow
- `brief`: the two-paragraph summary
- `linkedClientId`, `linkedApprovalIds` etc. where applicable
- `gaps[]`: the full punch list
- `errors[]`: if any

Final action: Claude surfaces a short close message to the operator. "Run complete. Brief saved, X gaps logged, Y approval staged." with Convex IDs for navigation.

### 3.5 Post-run Debrief (operator, ~15–30 min)

1. Open the `skillRuns` row in the Convex dashboard (no UI page yet; Yes-B deferred). Confirm `brief` is non-empty, `gaps[]` populated, links resolve.
2. Open `.logbook/inbox.md`. Run `/triage` to group the gaps into queued tasks.
3. Draft `skills/HARDENING-PLAYBOOK.md` capturing the session rhythm (see Section 4.2 for the structure).
4. Add observations about *how Claude actually used CLAUDE.md*: was the dedup rule honoured? Did Claude know to call `skillRun.start` without prompting? Note these in the playbook's "CLAUDE.md candidates" section.
5. `npx next build` from `model-testing-app/`. Commit.

### Failure Modes Acknowledged (Deferred Fixes)

These are not solved in this session but are visible:

- **Claude Code crashes mid-run**: row sits in `status: "running"` forever. Acceptable for now; future cleanup job or operator-driven `skillRun.complete({ status: "cancelled" })` resolves.
- **Concurrent runs on same prospect by two operators**: both `skillRun.start` calls may return `status: "created"` (race condition on the dedup query). Acceptable today (single-operator); revisit when team grows.
- **Token usage and latency capture**: not recorded today. The `durationMs` field gives wall-clock; cost and tokens deferred.

---

## 4. Artifacts Produced

### 4.1 Direct Outputs (Persisted Artefacts)

| Artifact | Location | Format | Owner |
|---|---|---|---|
| The run record | Convex `skillRuns:{runId}` | Row (status, brief, gaps, links, audit) | Claude (auto via `skillRun.complete`) |
| The brief | `skillRuns.brief` field | 2-paragraph narrative | Claude (composed at run close) |
| Staged approval (if reachout was appropriate) | Convex `approvals:{approvalId}` | Row with `entityType: "client_communication"` | Claude via `approval.create`; surfaced at `/approvals` in app |
| Created or updated client + intelligence | Convex `clients`, `clientIntelligence`, `knowledgeItems` rows | Depends on which tools end up exposed during the run | Claude where MCP allows; operator manually where it doesn't |
| Punch list, structured | `skillRuns.gaps[]` array | `{ kind, description, suggestedFix }` per gap | Claude (collected during run, written at close) |
| Punch list, operational | `.logbook/inbox.md` entries | One `/jot` per gap | Claude (in parallel with structured logging) |

### 4.2 Repo Additions (Committed at End of Session)

#### `skills/HARDENING-PLAYBOOK.md` (NEW, ≤ 1 page)

Structure (section headings are load-bearing — they're the artifact checklist):

```md
# Skill Hardening Playbook (Level A)

How to drive a single skill from "scaffolded" to "production-usable against real data".
The worked example is prospect-intel; see
docs/superpowers/specs/2026-05-23-prospect-intel-level-a-hardening-design.md.

## Pre-session checklist
- Schema migrations deployed; `skillRuns` table accessible
- `skillRun.start` and `skillRun.complete` MCP tools live
- Skill has a `## Dedup` section (or a documented reason it doesn't need one)
- Test prospect/deal/contact chosen, ideally already in Convex

## The session rhythm (30-90 min depending on skill complexity)
1. Pre-run: build, deploy, mcp list, pick subject. ~5 min.
2. Kickoff: invoke skill, call skillRun.start, claim runId. ~30s.
3. Execution: walk SKILL.md steps; for each tool-or-reference gap,
   log structured + /jot. ~30-60 min.
4. Close: compose brief, skillRun.complete, surface gaps to operator.
5. Debrief: triage gaps, update playbook lessons, commit.

## The 5 artifacts you must have at the end
(reference the success criteria from Section 1 of the spec)

## CLAUDE.md candidates from observation
A running list of cross-skill rules surfaced during hardening sessions.
Promote to real CLAUDE.md only after the same pattern recurs in 2+ skills.

- [today] candidate: "skills should write to clientIntelligence using sourceType='skill'
  to distinguish from human edits"
- [pending]

## Decisions and trade-offs (running log)
- 2026-05-23 (prospect-intel): dedupWindowDays = 7 chosen because charge filings
  can land any day; revisit per skill.
```

The playbook is structured by *artifact-produced*, not by *step*. Steps vary per skill; the artifact checklist is the constant.

#### `prospect-intel/SKILL.md` Updates

Inline edits where the run revealed:
- A workflow step was wrong, missing, or out of order
- A reference name should change
- A new edge case to add under `## What goes wrong`
- A clarification under `## Inputs` or `## Outputs`

These edits are the primary work product of the session. The SKILL.md after the run is what makes the *next* run smoother.

#### Reference File Updates

`prospect-intel/references/lender-dna-from-charges.md`, `bridging-vs-developer.md`, `template-mapped-reachout.md` get patched where the run found them thin. Likely additions: edge cases observed, decision rubrics that weren't explicit, real examples (anonymised) drawn from the actual prospect.

#### Root `CLAUDE.md` (Already Specified in Section 2.4)

The skill-execution rules. Probably no further edits today unless the run reveals an obvious cross-skill pattern.

### 4.3 Logbook State (Worked Queue)

After `/triage` of the inbox at session end, expect new entries in `.logbook/queued/`. Most likely groupings:

- `2026-05-23_expose-companies-house-tools-on-mcp.md` (5 tools)
- `2026-05-23_expose-intelligence-write-tools-on-mcp.md` (2 tools)
- `2026-05-23_expose-client-create-and-checkexists-on-mcp.md` (2 tools)
- `2026-05-23_deepen-lender-dna-reference.md`
- Possibly: `2026-05-23_add-ui-for-{X}` where X is whatever UI surfaced as missing

These are the next sessions' work. Each is sized small (one PR's worth) and prioritisable independently.

### 4.4 The Spec Itself

This document at `docs/superpowers/specs/2026-05-23-prospect-intel-level-a-hardening-design.md`, committed at the end of the brainstorm. The reference for any future "how did we decide that?" question.

---

## 5. Definition of Done and Out of Scope

### 5.1 Definition of Done (Session-level)

The session is done when all of the following are true (or each false item has a written reason in the run's `gaps[]` or in the commit message):

1. The 4 Section 2 architecture additions are deployed and verified (`skillRuns` table live, both MCP tools callable, `## Dedup` in `prospect-intel/SKILL.md`, `### Skill execution` in root `CLAUDE.md`).
2. One real `skillRuns` row exists with `status` in `{complete, complete_with_gaps}` and a non-empty `brief` field.
3. `gaps[]` on that row is populated (probably non-empty given current MCP coverage).
4. `.logbook/inbox.md` has matching gap entries (`/jot`-style), triaged into `.logbook/queued/` tasks by end of session.
5. `skills/HARDENING-PLAYBOOK.md` exists, ≤ 1 page, with the 5 named sections from Section 4.2.
6. `prospect-intel/SKILL.md` has been edited where the run revealed thinness.
7. `npx next build` from `model-testing-app/` passes.
8. Commits pushed with appropriate prefixes (`[app]` for schema + MCP; `[skills]` for SKILL.md + playbook; `[both]` only if a single commit truly spans both).

### 5.2 Out of Scope (This Session)

Explicitly NOT in this session. Log if encountered; do not act on:

- Closing every gap surfaced. Gaps go to logbook for next sessions.
- Other 13 skills. Even if a fix in `prospect-intel` "would obviously help" another.
- `batch-10` orchestration. No multi-prospect runs today.
- `/skill-runs` UI page (Yes-B). Convex dashboard is the read surface for now.
- Companies House MCP tools, intelligence write MCP tools, `client.create`. These *will* surface as gaps; that's the right outcome.
- Crash recovery, concurrency handling, token/cost capture. Deferred per Question 4 of the brainstorm.
- Repo split (BL-8.5). Independent project.
- `SETUP.md` update. Likely a follow-on session once the operator experience is known.

### 5.3 Anti-scope-creep Rules

| Temptation | Correct action |
|---|---|
| "I see a missing MCP tool, let me just add it" | Log to `gaps[]` + `/jot` to logbook. Do NOT add it. |
| "The other skills are similar, let's harden two today" | No. The discipline is the value. One skill, one session. |
| "Let's make it autonomous since we're 80% there" | No. That's Level B. Operator stays in the loop. |
| "I should add a `/skill-runs` UI while I'm in there" | No. Yes-B is deferred. Convex dashboard suffices. |
| "Let me draft a CLAUDE.md update for that pattern" | Add to "CLAUDE.md candidates" in the playbook. Promote later, after 2-3 skills confirm the pattern. |
| "Why don't I also fix this unrelated thing I noticed" | `/jot` to logbook. Move on. |

### 5.4 Next-session Preview (Likely, in Priority Order)

After today, the queue most likely looks like:

1. Expose the highest-leverage missing MCP tools, probably the intelligence write tools and `client.create`, since they block `prospect-intel` from completing on its own next time.
2. Re-run `prospect-intel` against the same prospect to verify the dedup logic fires correctly and that the closed gaps actually unlocked the workflow.
3. Run `prospect-intel` against a *fresh* prospect to confirm hardening generalises.
4. Start hardening skill #2: `qualify-and-draft` is the natural next step in the lifecycle.
5. Update `SETUP.md` to reflect post-MCP reality.
6. Decide whether the Yes-B `/skill-runs` UI lands before or after another skill or two.

These are previews, not commitments. The actual order is set by what today's run surfaces.

---

## 6. Open Considerations (Acknowledged, Deferred)

These were raised and consciously deferred during the brainstorm (Question 4):

- **Error handling and failure recovery.** What happens if Claude Code disconnects mid-run? Today the row sits in `status: "running"`. A future session will add a heartbeat or cleanup job.
- **Multi-operator concurrency.** Race condition between two simultaneous `skillRun.start` calls for the same `dedupKey`. Not handled today; team is single-operator.
- **Costs and observability.** No token-usage or model-cost capture per run. Useful for trust-building with the team ("this took 47 seconds and cost 3 cents") but not blocking.

If any of these become urgent before the next session, they get their own spec.

---

## 7. References

- `skills/skills/prospect-intel/SKILL.md` — the skill being hardened
- `skills/CONVENTIONS.md` — voice and output rules (UK English, no em-dashes, no rule-of-three)
- `skills/shared-references/approval-payload-shapes.md` — for the staged reachout approval shape
- `model-testing-app/convex/schema.ts` — where `skillRuns` is added (line ~3500, after existing tables)
- `model-testing-app/convex/mcp.ts` — where the two MCP tools are added (in the `TOOLS` array)
- `docs/BACKLOG.md` — relates to WS-6 (skills), BL-5.1 (MCP), BL-8.5 (repo split)
- Root `CLAUDE.md` — where the `### Skill execution` subsection is added under `## Workflow Rules`
