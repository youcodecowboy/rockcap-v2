# Monorepo Discipline Audit

The brief specifies hard rules for the temporary monorepo so that the eventual split into separate app and skills repositories is cheap. This document records the current state against each rule and flags the work needed to close gaps.

## Current repository layout

```
rockcap-v2/                          (repo root)
├── README.md                        (missing; should be the app-runner README per brief)
├── CLAUDE.md                        (workflow rules; references model-testing-app for build)
├── .gitignore                       (covers Node, Next, Convex artifacts)
├── .claude/                         (Claude Code project settings)
├── .logbook/                        (task tracking plugin state)
│
├── model-testing-app/               (Next.js 16 + Convex; this is the "app")
│   ├── package.json
│   ├── tsconfig.json                (include: **/*.ts, **/*.tsx; exclude: node_modules)
│   ├── next.config.ts
│   ├── convex/                      (84-table schema, ~80 backend files)
│   ├── src/                         (Next.js app router, lib, agents, v4)
│   ├── public/, scripts/, docs/
│   ├── .claude/                     (project-local Claude config)
│   ├── .agents/                     (frontend-design skill mounted here)
│   └── skills-lock.json             (lockfile for skills installed into this app)
│
├── mobile-app/                      (Expo / React Native client of the same Convex)
├── hubspot-cli-temp/                (HubSpot CLI scratch)
├── hubspot-webhook-app/             (HubSpot webhook side project)
├── docs/                            (project docs, plans, audits)
└── skills/                          (this directory; created by this task)
    ├── README.md
    └── inventory/                   (this audit)
```

The Next.js app is in `model-testing-app/`, **not** at the repo root as the brief assumes. This is a happy accident for the boundary discipline: `skills/` at the repo root sits naturally outside both `model-testing-app/` and `mobile-app/`.

## Per-rule audit

### Rule 1: Skills never import from app code

**Status: enforceable today; not yet codified.**

The skills tree contains only markdown files in this directory. There is no JavaScript or TypeScript yet. No imports exist to violate the rule.

When skills are added (per the brief, `SKILL.md` files plus references and corpora), the rule should be enforced by:

- Tooling: a simple grep-based pre-commit hook that fails if anything under `skills/` contains an `import` line referencing `model-testing-app/`, `mobile-app/`, `convex/`, or `src/`.
- Convention: skills are markdown; if a skill needs to invoke app behaviour, it does so by naming a tool the MCP server will dispatch.

### Rule 2: App code never imports from skills

**Status: clean today; not yet codified.**

`grep` for `from ['"].*skills/` and `from ['"]\.\.?/.*skills` across `model-testing-app/` and `mobile-app/` returns zero hits.

The current `tsconfig.json` (at `model-testing-app/tsconfig.json`) uses `include` patterns relative to its own directory (`**/*.ts`, `**/*.tsx`, `next-env.d.ts`, `.next/types/**/*.ts`, `.next/dev/types/**/*.ts`, `**/*.mts`). Because `skills/` is at the repo root, not inside `model-testing-app/`, it is structurally invisible to the app's TypeScript compiler. No exclude entry is needed.

If the app ever moves to repo root (the brief's assumed layout) the discipline becomes more fragile and an explicit `"exclude": ["skills"]` line would be needed.

### Rule 3: No shared utility code straddling the boundary

**Status: clean today.**

No shared `lib/` or `utils/` directory exists at repo root that both subtrees consume. Each subtree has its own.

### Rule 4: Skills are excluded from the build entirely

**Status: satisfied de facto by the app being nested.**

- Next.js build runs from `model-testing-app/` per CLAUDE.md (`cd model-testing-app/ && npx next build`). It cannot see `skills/` at all.
- Convex deploy runs from `model-testing-app/convex/`. Same story.
- Expo bundling for `mobile-app/` is similarly scoped.

If any future build process runs from repo root, this rule will need re-checking.

### Rule 5: Path-based CI triggers

**Status: not configured; gap.**

No `.github/workflows/` directory exists at repo root. No `vercel.json` at repo root either (the existing one is at `model-testing-app/vercel.json`).

If CI is wanted, the workflow files should include `paths-ignore: ['skills/**']` on the app pipelines and `paths: ['skills/**']` on any skills-validation pipeline. This is a future task; today there is nothing to gate.

Vercel deploy at `model-testing-app/vercel.json` already scopes to that directory (Vercel monorepo support). When a Vercel preview is built from a PR that touches only `skills/`, no Vercel build should be triggered for `model-testing-app/`. Verify the project-level Vercel settings reflect this.

### Rule 6: Commit hygiene

**Status: not adopted; gap.**

The existing git log uses freeform messages with no `[app]` / `[skills]` / `[both]` prefix. Adopting the convention is a documentation and discipline change, not a tooling change. Worth adopting immediately. A commit-msg hook could enforce the prefix.

The first commit of this branch (the inventory commit) is a `[skills]`-only change and should be tagged accordingly.

### Rule 7: Two READMEs, two intents

**Status: partial.**

- `skills/README.md` exists (created by this task) and addresses the skills library.
- `model-testing-app/README.md` exists and is the app runner README.
- There is no root `README.md`. The brief envisages the root README being the app runner README. With the app nested, the root README would either be a meta-readme pointing at both subprojects, or remain absent.

Recommendation: add a thin `README.md` at the repo root that explains the layout and points at `model-testing-app/README.md` for the app and `skills/README.md` for the skills tree. This avoids confusion when someone clones the repo.

## Concrete gaps and recommendations

In rough priority order:

1. **Add a root README.md** that explains the monorepo layout and links to the two subproject READMEs. Five minutes of work, removes a perennial confusion source.
2. **Adopt the `[app]` / `[skills]` / `[both]` commit prefix.** Document in `skills/README.md` (or a top-level `CONTRIBUTING.md`) and start using it. No tooling needed initially.
3. **Add a pre-commit lint (optional)** that fails if anything under `skills/` matches an `import` line referencing app paths. This becomes useful when skills/ has TypeScript or JavaScript content (it does not yet).
4. **Add a CI workflow file with path-based triggers** when CI is wired. Today nothing runs in CI for this repo, so this is deferred.
5. **Confirm Vercel monorepo settings** for `model-testing-app/`. The `model-testing-app/vercel.json` is in place; check that the Vercel project's root-directory and ignored-build-step settings exclude pure-skills changes.
6. **Document the Convex deploy boundary.** Convex deploys from `model-testing-app/convex/`. Make this explicit in the root README so a future contributor does not accidentally place Convex code outside that directory.
7. **Watch the `.claude/` directories.** Both `rockcap-v2/.claude/` and `model-testing-app/.claude/` exist; both `rockcap-v2/.claude/` and `model-testing-app/.claude/` will be loaded depending on where Claude Code is invoked from. Document expectations and avoid having them diverge.

## Brief assumptions that need restating against the actual layout

The brief's "Hard rules to keep the split cheap" section assumes the app is at repo root. Restated for the actual layout:

| Brief rule (verbatim assumption) | Restated for this repo |
|---|---|
| "tsconfig.json excludes skills/" | The Next.js app's tsconfig is at `model-testing-app/tsconfig.json` and its include scope is contained within that directory. `skills/` at repo root is naturally outside. No exclude entry is needed today. |
| "the Next build, the Convex deploy, and any other production pipeline ignores the directory" | Satisfied because the Next build runs from `model-testing-app/` and the Convex deploy runs from `model-testing-app/convex/`. Verify the Vercel project root-directory setting matches. |
| "Path-based CI triggers" | No CI exists yet. When added, configure paths-ignore on app pipelines and paths on skill pipelines. |
| "Two READMEs, two intents" | The app README is at `model-testing-app/README.md`. `skills/README.md` exists. A root README is missing and worth adding. |

## What changes when the split happens

Per the brief, the split is a `git subtree split` plus a user-side config change. With the current layout:

- The split moves `skills/` to a new repo. Done.
- Users update their MCP/Claude Code config to clone `rockcap-skills` (or whatever the new repo is called) instead of pulling `skills/` from the monorepo.
- The MCP endpoint they connect to does not change.
- Nothing in `model-testing-app/` or `mobile-app/` needs to move.

Because the layout is already nested by accident, the split is trivial. The boundary work is mostly about discipline, not refactoring.
