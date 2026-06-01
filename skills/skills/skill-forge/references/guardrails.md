# skill-forge guardrails

The hard rules. These exist so a non-technical operator can improve skills
freely without breaking the connection between skills and the app.

## 1. Only reference tools that exist

Every tool a skill tells Claude to call must be in `tools-manifest.json`
(refreshed live from `meta.listTools`). Before adding or changing any tool
reference, refresh the manifest. If you're not certain a tool exists, check the
manifest or call `meta.listTools` — never guess a tool name.

The validator (`tools/validate-skills.mjs`) enforces this on every commit. A
skill that invokes `something.thatDoesntExist(...)` cannot be saved. When the
validator suggests "closest real tools," pick from that list.

## 2. Never edit the wiring

These files connect skills to the app. A non-technical operator must **not**
change them through skill-forge — changing them breaks the integration for the
whole team:

- `.mcp.json` — the MCP server URL + auth token
- the MCP server URL anywhere it appears
- `.claude/settings.json` — the hooks that automate sync/validation
- anything under `tools/` — the validator and git scripts
- `tools-manifest.json` — only changes via a manifest refresh, never by hand

If an improvement genuinely seems to need one of these, that's an admin task.
Surface it; don't do it.

## 3. Keep the skill structure intact

When hardening a `SKILL.md`, keep the v2 template sections (Trigger, Inputs,
Dedup, Cadence package, Outputs, High-level workflow, Style rules, Tool
dependencies, What goes wrong, References). Model new skills on an existing v2
skill (e.g. `prospect-intel`, `lender-intel`); don't invent a new layout.

## 4. Edit skills, not client data

skill-forge changes the markdown that *defines* skills. It does not run
workflows against the book and does not call client-data tools. The only MCP
tool it uses is `meta.listTools`.

## 5. Small, described, pushed

Prefer small commits with clear messages. Every save goes to `main` immediately
via `tools/skill-commit.sh` so nothing lives only on one laptop. Never leave
edits uncommitted at the end of a session.
