# CLAUDE.md — RockCap Skills Repo

This repository is the RockCap **skills library**: the markdown that teaches
Claude Code how to do RockCap's work (prospecting, outreach, deal intake, lender
matching, document generation) and how to talk to the RockCap app through its
MCP tools.

It is edited by the RockCap team — including people who don't use GitHub. The
rules below exist so anyone can improve a skill safely without breaking the
connection to the app or losing work. **These rules override default behaviour.**

## The one skill that edits skills: `skill-forge`

When someone wants to **improve, harden, or create a skill**, add or refine a
**template**, or turn **feedback on an output** into a durable change — use the
`skill-forge` skill (`skills/skill-forge/SKILL.md`). It owns the safe loop:
sync → refresh the tool list → edit → validate → push. Don't hand-edit skills
outside that loop unless you're doing repo maintenance.

## GitHub is the central brain — git is automatic

No one types git commands. The hooks in `.claude/settings.json` handle it:

1. **On session start**, the latest is pulled from `main` (`--rebase
   --autostash`) so overnight work from other timezones is already here. Never
   edit on stale skills. If the pull reports a conflict it couldn't resolve,
   **stop and get help** — do not force.
2. **Every skill change is pushed to `main` immediately** via
   `tools/skill-commit.sh`. Nothing is left sitting uncommitted on a laptop.
3. A **Stop-hook safety net** pushes any stray uncommitted edits at end of turn.

Explain this to the operator in plain terms when relevant — they should trust
that saving happens for them.

## Hard guardrails (never break these)

1. **Only reference tools that exist.** Every tool a skill invokes must be in
   `tools-manifest.json` (refresh it from `meta.listTools` before changing tool
   references). The validator (`tools/validate-skills.mjs`) blocks any commit
   that invokes a tool that doesn't exist — this is enforced, not optional. For a
   handover-readiness sweep (all tool-like references, not just invocations) run
   the advisory `tools/audit-tool-refs.mjs` — it must report **0 dangerous
   phantoms**. A planned/not-yet-built tool may be referenced only if its line
   explicitly marks it deferred (gap / planned / future).
2. **Never edit the wiring.** Do not change `.mcp.json`, the MCP server URL,
   `.claude/settings.json`, anything under `tools/`, or `tools-manifest.json` by
   hand. These connect skills to the app; changing them breaks everyone. If a
   change seems to need this, it's an admin task — surface it.
3. **Keep the skill structure.** Hardened skills follow the v2 template (see
   `skills/README.md`). Model new skills on an existing v2 skill.
4. **Edit skills, not the book.** This repo's skills are markdown definitions.
   `skill-forge` itself only ever calls one MCP tool: `meta.listTools`.

## Where to look first

1. **`CATALOGUE.md`** — every MCP tool (123 across 24 domains), grouped by
   domain, with "when to use" guidance. Start here for tool discovery.
2. **`skills/README.md`** — the skill index: all skills + maturity status +
   deal-lifecycle map.
3. **`CONVENTIONS.md`** — cross-skill voice + style rules. Every skill follows
   these.
4. **`GUIDE.md`** — plain-language how-to for non-technical editors.
5. **`SETUP.md`** — first-time environment + MCP token setup.

## Teaching voice

Many editors are non-technical. Explain *why* as you go ("I pulled the latest
first so you get the overnight change"; "that tool doesn't exist — the closest
real one is `X`"). Surfacing the reasoning is part of the job, not noise.

## First-time machine setup

Run once per laptop: `sh tools/setup.sh` (points git at the committed hooks and
checks Node is present). After that, just talk to Claude about skills.
