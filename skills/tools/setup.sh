#!/bin/sh
# setup.sh — one-time, per-machine setup for the RockCap skills repo.
# Safe to run more than once.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Run this from inside the skills repo."; exit 1; }
cd "$ROOT" || exit 1

echo "Setting up the RockCap skills repo on this machine…"

# Point git at the committed hooks so the hard gate runs on manual commits too.
git config core.hooksPath .githooks
chmod +x .githooks/* tools/*.sh 2>/dev/null

# Sanity check: Node present (needed by the validator).
if ! command -v node >/dev/null 2>&1; then
  echo "⚠ Node.js not found. The skill validator needs it. Install Node, then re-run."
else
  echo "✓ Node.js found."
fi

# Sanity check: the validator runs.
if node tools/validate-skills.mjs >/dev/null 2>&1; then
  echo "✓ Skill validator works."
else
  echo "! Validator reported issues — run 'node tools/validate-skills.mjs' to see them."
fi

# Advisory handover-readiness audit (never blocks).
echo "Handover audit:"
node tools/audit-tool-refs.mjs | tail -2

echo "✓ Setup complete. You can now edit skills; Claude handles syncing with GitHub."
