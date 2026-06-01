# How sync + save works (so you can explain it)

The goal: **GitHub is the central brain.** Every skill improvement lives on
`main` on GitHub, never only on someone's laptop. The team works across
timezones, so the rule is *pull before you touch anything, push the moment
you're done.* The operator never types a git command — it's all automatic.

## What happens, and when

| Moment | What runs | Why |
|---|---|---|
| You open the skills repo | `tools/hook-session-start.sh` (SessionStart hook) | Pulls the latest from `main` with `--rebase --autostash`, so overnight work from teammates is already here. |
| Claude is about to `git commit` | `tools/hook-pre-commit-guard.sh` (PreToolUse hook) | Runs the validator; blocks the commit if a skill references a tool that doesn't exist. |
| skill-forge saves a change | `tools/skill-commit.sh` | Validates → commits with a clear message → pushes to `main`. |
| Claude finishes a turn with unsaved edits | `tools/hook-stop.sh` (Stop hook) | Safety net: validates and pushes anything still uncommitted, so nothing is left behind. |
| A commit typed in a terminal | `.githooks/pre-commit` (after `sh tools/setup.sh`) | Same hard gate for the rare manual commit. |

## How to explain it to the operator

> "When you open this folder I grab everyone's latest changes first. When you're
> happy with an edit, I check it doesn't break anything and push it straight to
> GitHub, so the rest of the team gets it next time they open it. You don't have
> to do anything with git — just tell me what to improve."

## When something goes wrong

- **Pull conflict on start** (rare — two people edited the same file): the sync
  aborts cleanly and tells you to get help. Do **not** edit on top of it.
- **Push rejected** (someone pushed while you worked): `skill-commit.sh` rebases
  and retries automatically. If it still fails, the work is committed locally
  and safe — just retry the push; never redo the edit.

Because skills are markdown and saves are small and frequent, real conflicts are
very rare. Frequent pushing is what keeps them rare.
