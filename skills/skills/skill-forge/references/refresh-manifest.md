# Refreshing the tool manifest

`tools-manifest.json` is the skills repo's copy of "which MCP tools exist in the
app right now." The app and this repo live separately, so the manifest is how a
skill here can be checked against the real tool surface there.

## When to refresh

- At the start of any skill-forge session that will add or change a tool
  reference.
- Whenever a new tool was added to the app (the app team will mention it).
- If the validator's tool list looks out of date.

## How to refresh

1. Call the MCP tool `meta.listTools` (no arguments needed; optional `domain`
   filter). It returns:

   ```json
   {
     "toolCount": 108,
     "domainCount": 22,
     "domains": ["apollo", "approval", "..."],
     "tools": [
       { "name": "lender.matchForDeal", "domain": "lender", "description": "...", "inputSchema": { } }
     ]
   }
   ```

2. Write that result to `tools-manifest.json` at the repo root, preserving the
   shape the validator expects: top-level `toolCount`, `domainCount`, `domains`,
   and `tools` (each with at least `name` and `domain`). Keep the `tools` array
   sorted by `name`.

3. Confirm the counts changed as expected and mention them to the operator
   ("the app now exposes 108 tools across 22 domains").

## Why `meta.listTools` is the source of truth

It is generated from the app's own tool array — it cannot drift from what the
server actually serves. The committed `tools-manifest.json` is just the most
recent snapshot; refreshing it keeps the separate repo honest without any manual
sync between the two codebases.
