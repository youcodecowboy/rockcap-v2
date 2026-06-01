#!/bin/sh
# hook-pre-commit-guard.sh — PreToolUse(Bash) guard.
#
# Wired in .claude/settings.json as a PreToolUse hook on the Bash tool. It reads
# the tool input on stdin; if Claude is about to run `git commit`, it runs the
# validator first and BLOCKS the commit (exit 2) if any skill references a tool
# that doesn't exist. This makes the hard gate work out-of-the-box, with no
# one-time `git config` step required.
#
# (The committed .githooks/pre-commit covers commits typed manually in a
# terminal, once a teammate runs the one-time setup in tools/setup.sh.)

input="$(cat)"
case "$input" in
  *"git commit"*) : ;;   # it's a commit — check it
  *) exit 0 ;;           # not a commit — allow through
esac

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT" || exit 0

if ! node tools/validate-skills.mjs >/tmp/rc-validate.log 2>&1; then
  cat /tmp/rc-validate.log >&2
  echo "" >&2
  echo "BLOCKED: a skill references a tool that doesn't exist (see above)." >&2
  echo "Fix the tool name, then commit again." >&2
  exit 2   # exit 2 → Claude Code blocks the tool call and feeds stderr back
fi
exit 0
