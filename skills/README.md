# RockCap Skills Library

This directory is the future home of the RockCap Claude skills tree. It lives inside the app monorepo temporarily, per the project brief, but is conceptually a separate system destined for its own repository.

## Current state

The skills tree has not been populated yet. The only content here today is `inventory/`, the audit of the existing RockCap NextJS + Convex application that has to land before any skills are written. Read `inventory/README.md` for the entry point.

## Boundary rules in force

These rules apply from the first commit and are documented in the project brief:

1. Skills never import from app code. Skills are markdown files; they have no imports. App access goes through the MCP server.
2. App code never imports from skills. The MCP server authenticates the user and dispatches the tool; it has no awareness of the calling skill.
3. No shared utility code straddles the boundary. If something is needed by both, it lives in the app and is exposed via MCP.
4. The app build ignores this directory. The Next.js app lives in `model-testing-app/`, so `skills/` is already outside its tsconfig include scope. See `inventory/06-monorepo-discipline.md` for the current discipline status.
5. CI triggers should be path-based: changes touching only `skills/` should not redeploy the app. This is flagged as a gap in the discipline doc.
6. Commit messages prefix with `[app]`, `[skills]`, or `[both]`. Pure-skills and pure-app commits will split cleanly at separation time.

## Layout, once populated

```
skills/
├── README.md
├── CONVENTIONS.md              (cross-skill style and rules, not yet written)
├── inventory/                  (the audit, populated by this task)
├── skills/                     (workflow-mode SKILL.md files, not yet written)
├── sub-skills/                 (Claude-side primitives, not yet written)
├── corpora/                    (anonymised exemplars, not yet written)
├── templates/                  (XLSX/DOCX/PDF templates, not yet written)
└── shared-references/          (cross-skill style and rules, not yet written)
```

## Why the inventory comes first

The brief assumes a particular shape for the existing app (75 atomic tools, a particular schema, a particular set of integrations). The actual codebase is larger and more heterogeneous than the brief presumed, with a dual-track AI pipeline mid-migration. Building skills on top of a misread substrate would be wasted work. The inventory is the substrate read.
