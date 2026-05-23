# CLAUDE.md

## Workflow Rules

### Plan Execution
- When executing any plan, the **last step** must always be:
  1. Run `npx next build` from `model-testing-app/` (the Next.js app lives there, not repo root) to check for build issues and fix any errors
  2. Commit changes and push to GitHub

### Repo layout
- `model-testing-app/` — Next.js 16 web app (Convex, Clerk, Anthropic SDK)
- `mobile-app/` — Expo / React Native app
- `hubspot-cli-temp/` — HubSpot CLI scratch
- `docs/` — project docs, specs, audits
- `.logbook/` — task tracking (see below)

### Skill execution

When invoking a skill from `skills/skills/`:

1. **Always call `skillRun.start` first** with `skillName`, `input`, `trigger` (if known), and (if the skill's `SKILL.md` has a `## Dedup` section) `dedupKey` plus `dedupWindowDays`. Use the returned `runId` for the rest of the workflow.
2. **Honour the dedup response.** On `status: "duplicate_found"`, surface the prior brief to the operator and ask before continuing.
3. **Always call `skillRun.complete` at the end** with status, brief, and links to created or updated entities. Never leave a run in `status: "running"`.
4. **Log gaps as you find them.** Missing MCP tools, thin references, app UI gaps: capture in the `gaps` array on `skillRun.complete` and (in parallel) `/jot` them into the logbook for triage.

---

## Task Tracking — Logbook Plugin

Task tracking lives in `.logbook/` and is managed by the [logbook](https://github.com/youcodecowboy/logbook) Claude Code plugin.

- `/jot <note>` — append to inbox
- `/triage` — group inbox into structured queued tasks
- `/status` — dashboard of all states
- `/logbook <task>` — explicitly start a tracked task

Folder state machine: `inbox → queued → active → done` (plus `paused/`, `abandoned/`). The main `logbook` skill auto-triggers on multi-step work (feature, bug fix, refactor) and logs progress step-by-step.

**Disambiguation with `TodoWrite`:** use the logbook Plan for task-level steps that must survive across sessions or context compaction. Use `TodoWrite` for ephemeral within-session tactical tracking. The two should not duplicate each other.

**Legacy:** `BL5`–`BL12` items from the previous `.backlog/` protocol are archived in `docs/superpowers/specs/2026-04-15-mobile-app-refinement-backlog.md` for historical reference.
