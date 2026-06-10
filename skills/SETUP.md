# Operator Setup

How to run the RockCap skills tree locally with Claude Code, point it at the MCP server, and start using skills against your data.

## What you need before you start

- A laptop with Claude Code installed. Get it from [https://claude.ai/download](https://claude.ai/download) or your preferred install path.
- A RockCap account (you should already have Clerk credentials for the web app).
- This repository cloned somewhere stable on your laptop (your home directory is fine).

## One-time setup

### 1. Clone the skills repo

The skills tree lives in the `skills/` directory of `rockcap-v2`. While the skills are still in the monorepo, clone the whole thing:

```bash
git clone git@github.com:youcodecowboy/RockCap-MCP.git ~/RockCap-MCP
```

When the skills tree splits into its own repository (per `docs/BACKLOG.md` BL-8.5), you will clone that separately. Until then, the path you care about is `~/RockCap-MCP/`.

### 2. Get your MCP token

Claude Code talks to the RockCap MCP server (a set of Convex HTTP endpoints) using a per-user token. You mint your token through the web app:

1. Sign in to the RockCap web app.
2. Navigate to `/settings/mcp-token`.
3. Click "Generate MCP token". The token is shown once (it is stored only as a hash, so it cannot be recovered later); copy it somewhere safe (a password manager, not a text file in iCloud).
4. The token does not expire by default but can be rotated or revoked from the same page if it leaks.

If the token is ever exposed, revoke immediately and mint a fresh one. The token grants the same access as your Clerk session.

### 3. Configure Claude Code

This repository already ships a project-scoped `.mcp.json` at the repo root, so Claude Code picks up the RockCap MCP server automatically when you open the repo. The entry looks like this:

```json
{
  "mcpServers": {
    "rockcap-mcp": {
      "type": "http",
      "url": "https://incredible-kudu-562.convex.site/mcp",
      "headers": {
        "Authorization": "Bearer ${ROCKCAP_MCP_TOKEN:-<shared team token>}"
      }
    }
  }
}
```

The committed file falls back to a shared team token, so the integration works out of the box with no configuration. To use your own per-user token instead (recommended, so usage and revocation are scoped to you), set the `ROCKCAP_MCP_TOKEN` environment variable to the token you minted in step 2 — Claude Code expands `${VAR:-default}` in `.mcp.json` at session start, so your token overrides the shared one whenever the variable is set.

- **Laptop:** export it from your shell profile (`export ROCKCAP_MCP_TOKEN=rcp_...` in `~/.zshrc`).
- **Claude Code cloud environment:** add `ROCKCAP_MCP_TOKEN` to the environment variables in the environment's settings. Nothing else is needed; the committed `.mcp.json` picks it up on boot.

Note the endpoint is on the `.convex.site` domain, not `.convex.cloud`. Convex serves custom HTTP actions (like `/mcp`) from `.convex.site`; the reactive query/mutation API lives on `.convex.cloud`.

### 4. Point Claude Code at the skills directory

Claude Code reads skills from a configured path. Add the local skills location to the same settings file:

```json
{
  "skillsPath": "~/RockCap-MCP/skills"
}
```

Restart Claude Code. The Skills panel should show the available skills. Eight are v2-hardened today (`prospect-intel`, `outreach-draft`, `client-context-capture`, `qualify-and-draft`, `meeting-prep`, `meeting-capture`, `lender-intel`, `deal-intake`); see `skills/skills/README.md` for the full list and maturity status.

### 5. Test the connection

In a new Claude Code conversation, type:

```
List the active clients.
```

Claude should call `client.list` through the MCP server and return your real data. If you see an auth error, your token is wrong. If you see "tool not found", your MCP server URL is wrong or the skills path is misconfigured.

## Day-to-day use

Open a new Claude Code conversation when you want to do work. Skills load automatically based on what you ask for:

- "Run prospect intel on {Borrower Co.}" loads `prospect-intel`.
- "Draft a reply to Sarah at {Developer Co.}, she wrote back about the {Scheme}" loads `qualify-and-draft`.
- "Add a note to {Borrower Co.}'s file: they're shifting to commercial" calls the `note.add` tool directly without loading a workflow skill.

Drafts that send email, write to HubSpot, or publish documents land in the `/approvals` queue in the web app. Review them there before they go anywhere.

## Updating the skills

The skills repo is git. Pull updates:

```bash
cd ~/rockcap-v2
git pull origin main
```

Most updates do not require restarting Claude Code; skills are re-read at the start of each conversation. Updates that change the MCP server URL or add new tool families do require a Claude Code restart.

When the skills repo splits (BL-8.5), the pull command changes to whatever the new repo is called. Notification will come via the team channel; the configuration update is one path swap.

## Troubleshooting

- **Token rejected (401)**: regenerate from `/settings/mcp-token`.
- **Tool not found**: the MCP server may be deploying. Wait 60 seconds and retry. If persistent, check the deployment URL.
- **Skill not loading**: confirm the path in `skillsPath` is absolute and the directory contains the skill subdirectory (`prospect-intel/SKILL.md` etc.).
- **Approvals queue not updating**: the page is real-time via Convex live queries; if it sticks, refresh the page. If the underlying mutation is failing, check `/approvals` for an `execution_failed` row with the error.
- **Outputs not respecting voice rules**: re-read `~/RockCap-MCP/CONVENTIONS.md` and confirm the skill's SKILL.md links to it. If you find a skill that drifts from the rules, raise it on the team channel.

## What is live, and what is still gated

This list is current as of 2026-06-01.

**Live and working end to end:**

- **MCP server** (BL-5.1): served from Convex HTTP actions at `https://incredible-kudu-562.convex.site/mcp`. 135 tools across 27 domains; see `skills/CATALOGUE.md` for the full list. Verify with the canary in step 5.
- **Per-user MCP token issuance** (BL-5.9): the `/settings/mcp-token` page mints, rotates, and revokes tokens. Tokens are stored only as a hash; auth is validated per request against the per-user token table.
- **Operational skills**: 9 of 22 skills are v2-hardened and executable against the live tool surface (`prospect-intel`, `outreach-draft`, `client-context-capture`, `qualify-and-draft`, `meeting-prep`, `meeting-capture`, `lender-intel`, `deal-intake`, `client-decision-capture`). `cadence-fire` is event-driven substrate, `document-author` is docgen substrate (v1), and `skill-forge` is the meta skill for editing skills (v1); the remaining 8 are skeletons. See `skills/skills/README.md` for the full maturity table.

**Built but gated (default-off kill switches):**

- **Gmail send**: built behind a triple kill switch (BL-4.2 plus the send-gate UI). The kill switches are default-off until the OAuth client is configured.
- **Fireflies sync**: built and ready (BL-3.3); the global kill switch is default-off until a user pastes a personal token.
