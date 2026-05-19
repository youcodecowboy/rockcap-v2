# Contributing

This document captures the project-wide conventions every contributor follows. The conventions exist for two reasons: keeping the eventual split of the skills library into its own repository cheap, and protecting the app from accidental damage as the skills layer is built up around it.

## Commit prefix convention

Every commit's summary line is prefixed with one of three tags:

| Prefix | Use when |
|---|---|
| `[app]` | Changes are entirely within `model-testing-app/` or `mobile-app/`. |
| `[skills]` | Changes are entirely within `skills/`. |
| `[both]` | Changes span both (root README, repo-wide docs, configuration, this file). |

Example:

```
[app] add LenderApproach table (BL-1.4)

Adds the per-lender-per-deal child entity. Additive only.
Rollback: revert this commit; no data migration involved.
```

When in doubt, lean towards `[app]` or `[skills]` over `[both]`. Mixed commits are valid but should be rare. If a single conceptual change splits cleanly into one app-side commit and one skills-side commit, prefer two commits.

PR titles follow the same convention.

## Pre-commit hook

A pre-commit hook lives in `.githooks/pre-commit`. It enforces two rules:

1. **Skills tree cannot import from app code.** Anything under `skills/` that contains `import.*model-testing-app`, `import.*convex`, or `import.*src/` fails the commit. Skills are markdown files; if a skill needs to invoke app behaviour, it does so through the MCP server, not through a code import.
2. **No env files committed.** Anything matching `.env`, `.env.*`, `*.env`, or containing obvious secret patterns (`sk_live_`, `pk_live_`, `eyJ...`-shaped JWTs longer than 100 chars) blocks the commit. Override only if you are intentionally committing a placeholder template.

To install (one-time, per local clone):

```
git config core.hooksPath .githooks
```

The hook is small and dependency-free; it runs in a few milliseconds.

## What never gets auto-edited

These files capture durable user intent. They are touched only through explicit user request, never as a side effect of another task:

- `CLAUDE.md` (root and any nested copies)
- `.claude/settings.json`
- `.claude/settings.local.json`
- Any file at `model-testing-app/.env*` or `model-testing-app/.env.local`

If you find yourself wanting to edit one of these in passing, stop. Ask first.

## Rollback expectations

Every PR for risky work (anything beyond pure-additive schema changes or pure-additive new routes) includes a `Rollback:` section in the description. State what to do if the change breaks production. If the rollback is "revert the commit", say so explicitly so the next operator does not have to infer it.

Risky work includes:

- V3-to-V4 pipeline migrations
- Schema deletions or field type changes (additive changes are not risky)
- Integration cutovers (e.g., switching the Fireflies pattern detector off)
- Any change to authentication flows
- Any change to cron schedules or webhook handlers

## Environment variables

Never commit env files. The canonical list of env vars is in `docs/ENV_VARS.md` with sensitivity grades. When you introduce a new env var:

1. Add it to `docs/ENV_VARS.md` in the same PR.
2. Set the sensitivity grade.
3. Set the variable in the Vercel and Convex env configs separately. Do not assume "I set it once" means it propagated.

## Build verification

`npx next build` from `model-testing-app/` is the basic regression check. CLAUDE.md mandates it as the last step of any plan. The build needs Clerk and Convex env vars set to complete the prerender stage; if you are running it in a sandbox without those, the compile step (the bit that catches code errors) still runs and is what matters.
