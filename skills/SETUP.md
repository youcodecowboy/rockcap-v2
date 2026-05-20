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
git clone git@github.com:youcodecowboy/rockcap-v2.git ~/rockcap-v2
```

When the skills tree splits into its own repository (per `docs/BACKLOG.md` BL-8.5), you will clone that separately. Until then, the path you care about is `~/rockcap-v2/skills/`.

### 2. Get your MCP token

Claude Code talks to the RockCap MCP server (a set of Convex HTTP endpoints) using a per-user token. You mint your token through the web app:

1. Sign in to the RockCap web app.
2. Navigate to `/settings/mcp-token` (this page lands when BL-5.9 ships; today the route does not exist).
3. Click "Generate MCP token". The token is shown once; copy it somewhere safe (a password manager, not a text file in iCloud).
4. The token does not expire by default but can be revoked from the same page if it leaks.

If the token is ever exposed, revoke immediately and mint a fresh one. The token grants the same access as your Clerk session.

### 3. Configure Claude Code

Open Claude Code's config. The exact mechanism depends on your install:

- VS Code extension: open the Claude Code panel, click the gear, "Configure MCP servers".
- CLI: edit `~/.config/claude/settings.json`.
- Desktop app: Settings → Servers.

Add the RockCap MCP server entry:

```json
{
  "mcpServers": {
    "rockcap": {
      "url": "https://<your-convex-deployment>.convex.cloud/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN_HERE"
      }
    }
  }
}
```

Replace `<your-convex-deployment>` with the deployment URL the team uses (ask if you do not know). Replace `YOUR_MCP_TOKEN_HERE` with the token from step 2.

### 4. Point Claude Code at the skills directory

Claude Code reads skills from a configured path. Add the local skills location to the same settings file:

```json
{
  "skillsPath": "~/rockcap-v2/skills/skills"
}
```

Restart Claude Code. The Skills panel should show the available skills (today: `prospect-intel`, `qualify-and-draft`, `cadence-fire`, and growing).

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
- **Outputs not respecting voice rules**: re-read `~/rockcap-v2/skills/CONVENTIONS.md` and confirm the skill's SKILL.md links to it. If you find a skill that drifts from the rules, raise it on the team channel.

## What is not yet wired

This list is current as of the latest commit on `claude/audit-app-inventory-ngHuP`:

- **MCP server**: the Convex HTTP endpoints (BL-5.1) are not yet built. Today the skills exist as content; the MCP server is what makes them callable from Claude Code. Until BL-5.1 ships, the only way to operate skills is to read them and follow the workflows by calling the app's web UI by hand.
- **Per-user MCP token issuance** (BL-5.9): no `/settings/mcp-token` page exists. The token flow above describes the destination, not today's state.
- **Gmail send**: built behind a triple kill switch (BL-4.2 plus the send-gate UI). The kill switches are default-off until the OAuth client is configured.
- **Fireflies sync**: built and ready (BL-3.3); the global kill switch is default-off until a user pastes a personal token.

When BL-5.1 lands, this document gets updated to reflect the real connection URL and any final configuration steps.
