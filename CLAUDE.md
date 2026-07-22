# CLAUDE.md

## Workflow Rules

### Task tracking
- **All task tracking goes through the logbook MCP server** (`logbook`, items ref'd `LOG-N`) — see the "Task Tracking" section below for the workflow. The old `.logbook/` markdown system and its `/jot`/`/triage` commands are retired; never write new entries there.

### Plan Execution
- When executing any plan, the **last step** must always be:
  1. Run `npx next build` from `model-testing-app/` (the Next.js app lives there, not repo root) to check for build issues and fix any errors
  2. Commit changes and push to GitHub

### Pull requests
- When authoring a PR, open the description with a **"Problems this PR solves"** bullet list — one short bullet per problem, in plain language, before the implementation detail. It gives the reviewer the *why* at a glance so the rest of the description reads faster. Keep the bullets about the problem (the pain / gap / bug), not the solution; the solution is what the rest of the PR body covers.

### Repo layout
- `model-testing-app/` — Next.js 16 web app (Convex, Clerk, Anthropic SDK)
- `mobile-app/` — Expo / React Native app
- `hubspot-cli-temp/` — HubSpot CLI scratch
- `docs/` — project docs, specs, audits
- `.logbook/` — task tracking (see below)

### Where to look first

When working in this repo + considering MCP tool selection or skill invocation, start at these three files in order:

1. **`skills/CATALOGUE.md`** — every MCP tool (188 across 31 domains) with grouping, "when to use" guidance, and common-pattern cookbooks. This is the canonical reference for tool selection. The 4 most-used tools across all workflows are documented prominently: `prospect.getDeepContext` / `client.getDeepContext` / `project.getDeepContext` / `lender.getDeepContext` + `lender.matchForDeal`.
2. **`skills/skills/README.md`** — the skill index. Lists all 35 skills with maturity status (v2-hardened vs skeleton) + deal-lifecycle mapping. Use when figuring out which skill to invoke for a given operator ask. For the prospect flow specifically (intel → accept → draft → approve), see **`skills/skills/prospect-pipeline-gates.md`** — the four-gate guide for `prospect-intel` (intel-only) → operator accept → `outreach-draft` → approve.
3. **`skills/CONVENTIONS.md`** — cross-skill voice, style, and operating rules. Every skill follows these.

**Maintain discoverability:** when adding or removing an MCP tool, update `CATALOGUE.md` in the same commit. When creating or hardening a skill, update `skills/skills/README.md` status table in the same commit. At 188 tools and 35 skills, Claude Code can only pick well if the documentation is accurate. The cost of staying disciplined is a one-line edit per change.

**Skills are co-maintained with the RockCap-MCP repo** (`~/rockcap/rockcap-mcp`, github `youcodecowboy/RockCap-MCP`): collaborators without access to this repo edit skills there, so that repo is the canonical editing home for skill/sub-skill content and its `tools-manifest.json` is refreshed from the live `meta.listTools`. Sync direction is mcp → here (`skills/` ⇄ `skills/skills/`, `CATALOGUE.md` ⇄ `skills/CATALOGUE.md`); when auditing drift, run `node tools/audit-tool-refs.mjs` in that repo — it flags skill references to MCP tools that don't exist on the app side.

### Skill execution

When invoking a skill from `skills/skills/`:

1. **Always call `skillRun.start` first** with `skillName`, `input`, `trigger` (if known), and (if the skill's `SKILL.md` has a `## Dedup` section) `dedupKey` plus `dedupWindowDays`. Use the returned `runId` for the rest of the workflow.
2. **Honour the dedup response.** On `status: "duplicate_found"`, surface the prior brief to the operator and ask before continuing.
3. **Always call `skillRun.complete` at the end** with status, brief, and links to created or updated entities. Never leave a run in `status: "running"`.
4. **Log gaps as you find them.** On any gap surfaced during the run (see the `kind` enum on `skillRun.complete`), capture the entry in the `gaps` array and (in parallel) file it as a logbook MCP item (`create_item`, with the problem stated) for triage.

### Event-driven skills

Some skills are not invoked by an operator; they are triggered by events (a cron tick, an inbound reply webhook, a state change). These skills follow a different runtime contract:

1. **Skills that produce cadences** (today: prospect-intel; coming: qualify-and-draft, meeting-prep, lender-intel) must include a `## Cadence package` section in their SKILL.md analogous to the `## Dedup` section pattern. The section specifies the package shape, the cadence types used, the send-date offsets, and any dynamicVars the dispatcher may refresh.

2. **The dispatcher fires pre-drafted touches autonomously.** v1 supports `preDraftedTouch` only. Skills that need fire-time composition (dynamic content based on fresh evidence) must wait for v1.1's `/api/cadence-compose` route. Until then, document the intended dynamic behaviour in SKILL.md but produce pre-drafted touches at queue time.

3. **Reply events cancel cadences.** Any inbound reply from a contact with active cadences automatically cancels those cadences and routes to the intent classifier. Skills do not need to handle this directly. The classifier dispatches to the right next skill (or to an operator-review approval if the destination skill is not yet hardened).

4. **No autonomous external action.** Every output that leaves the system (Gmail send, HubSpot write, lender outreach) routes through an `approvals` row. The operator approves before the action fires. This rule does not change as autonomy increases; the approval is the trust gate.

---

## Task Tracking — Logbook MCP ("RockCap App" project)

Task tracking lives in the hosted logbook at `https://logbook.gvy.ai`, connected as the `logbook` MCP server (project-scoped; added via `claude mcp add`). Items are refs like `LOG-12`.

Core workflow:

- **Session start:** call `briefing` (unread inbox + your assigned items + team scoreboard in one call).
- **Pick up work:** `pull_item` (single, pass `claim: true` to assign yourself + set in_progress) or `pull_items` for a cluster.
- **File work:** `create_item` / `create_items` — always state the **problem**, not just the task. Labels must exist (`list_labels` / `create_label`). Attach PRs/branches/files via `links`; long-form specs via `attach_document`.
- **Finish:** `update_item` with `status: "done"` and ALWAYS a `resolution` (what actually changed — these accumulate into project documentation).
- Merged PRs auto-close linked items via the GitHub webhook on `youcodecowboy/rockcap-v2` — link the PR to the item (`add_links`) so the webhook can match it.

**Disambiguation with `TodoWrite`:** logbook items are for task-level work that must survive across sessions; `TodoWrite` is for ephemeral within-session tactical tracking. The two should not duplicate each other.

**Legacy:** the previous `.logbook/` markdown system (logbook Claude Code plugin: `/jot`, `/triage`, folder state machine) was retired 2026-07-18. All open items were migrated to the MCP logbook as LOG-1…LOG-26 (see `.logbook/MIGRATED.md` for the mapping); the directory is kept for historical reference only — do not add new entries there. `BL5`–`BL12` items from the even older `.backlog/` protocol are archived in `docs/superpowers/specs/2026-04-15-mobile-app-refinement-backlog.md`.
