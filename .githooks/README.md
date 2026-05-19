# Git Hooks

Project-tracked git hooks. Run from any local clone via:

```
git config core.hooksPath .githooks
```

Run once per local clone. Idempotent.

## Hooks

### pre-commit

Enforces:

1. **Skills boundary**: nothing under `skills/` may import from `model-testing-app/`, `mobile-app/`, or app library paths (`convex/`, `src/lib/`, `src/v4/`). Skills are markdown; if they need app behaviour, they call it through the MCP server.
2. **No env files**: any `.env`, `.env.*`, or `*.env` staged file blocks the commit.
3. **Secret pattern scan**: blocks (with override) on obvious secret patterns (`sk_live_`, `pk_live_`, `sk-proj-`, `sk-ant-`, `hubspot-private-app-`).

Override (for legitimate placeholder templates) with `git commit --no-verify`.

## Why hooks are tracked in the repo

Local hooks (`.git/hooks/`) are not tracked by git, so every contributor would have to install them manually. Tracking them under `.githooks/` and setting `core.hooksPath` means every clone gets the same enforcement after a one-line setup.

## Adding a new hook

1. Add the executable script under `.githooks/{hook-name}` (no extension).
2. Make it executable: `chmod +x .githooks/{hook-name}`.
3. Document the rules in this README.
4. The hook runs automatically on the next git operation that triggers it.
