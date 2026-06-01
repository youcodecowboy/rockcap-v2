#!/bin/sh
# hook-session-start.sh — runs automatically when Claude Code opens the skills
# repo. Pulls the latest skills from main so overnight work from teammates in
# other timezones is already here before anyone edits anything.
#
# Wired as a SessionStart hook in .claude/settings.json. Output is shown to the
# user and added to Claude's context.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT" || exit 0
git remote get-url origin >/dev/null 2>&1 || exit 0   # no remote yet → nothing to sync

echo "↻ Syncing skills with GitHub (pulling latest from main)…"
if git pull --rebase --autostash origin main 2>/tmp/rc-pull.log; then
  echo "✓ Up to date with main. Safe to edit."
else
  echo "⚠ Could not cleanly pull from main — aborting the rebase to keep your repo safe."
  git rebase --abort 2>/dev/null
  echo "  This is rare (it means two people edited the same file). Ask Claude for help"
  echo "  or ping an admin BEFORE making changes, so nothing gets lost."
fi
exit 0
