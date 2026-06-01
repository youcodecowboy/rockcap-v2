# GUIDE — Improving skills (no GitHub knowledge needed)

This is for the RockCap team members who want to make the skills better but
don't use GitHub. You don't need to. You talk to Claude; Claude handles the
rest. This guide explains what's happening so you can trust it.

## The one rule

**Just describe what you want changed.** Claude pulls the latest version, makes
the change safely, checks it won't break anything, and saves it to GitHub for
the whole team. You never touch git.

## How to do the common things

### Improve a skill
> "Improve the lender-intel skill so it always checks appetite history before
> recommending a lender."

Claude opens `skill-forge`, edits the skill, validates it, and saves it.

### Fix something that came out wrong
> "This brief was too formal — here's what it produced. Change the skill so it
> doesn't do that again." *(paste the output)*

Claude finds *why* the skill produced that, fixes the cause (so it improves every
time, not just once), and saves it.

### Add or refine a template
> "Add a template for a development monitoring summary."
> "The comps template should include a price-per-square-foot column."

### Create a new skill
> "Create a skill for chasing outstanding documents on a deal."

Claude builds it on the same pattern as the existing skills and registers it.

## What Claude does behind the scenes (and why)

- **Gets everyone's latest changes first.** Your teammates work in different
  timezones. Before you edit anything, Claude pulls the newest version from
  GitHub so you're never working on something out of date.
- **Checks every change.** A built-in check makes sure a skill never points at a
  tool the app doesn't actually have. If it would, the save is blocked and Claude
  tells you the closest real tool. This is the main thing that keeps skills from
  breaking.
- **Saves to GitHub immediately.** As soon as a change is good, it goes to
  GitHub. Nothing is ever stuck on just your laptop. The team gets it next time
  they open the skills.

## What you should NOT ask Claude to change

Some files are the "wiring" that connects skills to the RockCap app. Changing
them breaks things for everyone, so Claude won't edit them through the normal
flow:

- the connection settings (`.mcp.json`, the server address)
- the automatic-save and checking machinery (`tools/`, `.claude/settings.json`)

If you think one of these needs changing, tell an admin — it's a developer task.

## First time on a new laptop

Once, in the skills folder, run: `sh tools/setup.sh`. After that you're set.

## If something looks stuck

- "It says there's a conflict it couldn't resolve." Two people edited the same
  thing at once. Don't force it — ask an admin. (This is rare.)
- "It says a tool doesn't exist." Good — that's the safety check working. Use the
  tool name Claude suggests instead.

That's it. Describe the improvement; Claude does the careful part.
