#!/bin/sh
# hook-stop.sh — safety net so skill edits never sit only on one laptop.
#
# Wired as a Stop hook in .claude/settings.json. Fires when Claude finishes a
# turn. If the working tree is dirty (someone edited a file but it wasn't saved
# through skill-forge), this validates and pushes it. The intentional, clean
# commits come from skill-commit.sh; this is purely the backstop.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT" || exit 0
[ -z "$(git status --porcelain)" ] && exit 0   # clean → nothing to do

echo "Found unsaved skill changes — saving them to GitHub so nothing is lost…"
sh tools/skill-commit.sh "chore: autosave skill edits"
exit 0
