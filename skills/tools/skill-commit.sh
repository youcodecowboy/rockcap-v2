#!/bin/sh
# skill-commit.sh — validate, commit, and push skill edits to main.
#
# This is the clean save path skill-forge calls at the end of every hardening.
# It enforces the hard gate (validate-skills.mjs) BEFORE anything reaches main,
# so a skill that references a non-existent tool can never be pushed.
#
# Usage:  sh tools/skill-commit.sh "skill-forge: harden lender-intel matching"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Not a git repo."; exit 1; }
cd "$ROOT" || exit 1
MSG="${1:-chore: update skills}"

if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to save — working tree is clean."
  exit 0
fi

# ── Hard gate ────────────────────────────────────────────────
echo "Validating skills before saving…"
if ! node tools/validate-skills.mjs; then
  echo "✗ Validation failed — NOT saving. Fix the errors above, then try again."
  exit 1
fi

# ── Commit + push ────────────────────────────────────────────
git add -A
git commit -m "$MSG" || exit 1
echo "↑ Pushing to main…"
git pull --rebase --autostash origin main >/dev/null 2>&1
if git push origin main; then
  echo "✓ Saved to GitHub. Everyone gets this on their next session."
else
  echo "⚠ Push failed. Your work is committed locally and safe; ask Claude to retry the push."
  exit 1
fi
exit 0
