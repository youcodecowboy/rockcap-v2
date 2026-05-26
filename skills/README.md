# RockCap Skills Library

Skills, sub-skills, references, corpora, and templates that power the RockCap Claude Code workflows. Lives inside the app monorepo temporarily, per the project brief, but is conceptually a separate system destined for its own repository.

## Where to look first

If you're an operator-agent (Claude Code) figuring out where to start:

1. **`CATALOGUE.md`** — every MCP tool (68 across 18 domains), grouped by domain, with "when to use" guidance and common-pattern cookbooks. **Start here for tool discovery.**
2. **`skills/README.md`** — the skill index. Lists all 16 skills with maturity status (v2-hardened vs skeleton) and lifecycle mapping.
3. **`CONVENTIONS.md`** — cross-skill voice, style, and operating rules. Every skill follows these.
4. **`SETUP.md`** — initial environment + integration setup.

The 4 most-used tools across all skills:

- `prospect.getDeepContext` / `client.getDeepContext` — one-shot snapshot for any prospect/client question
- `project.getDeepContext` — one-shot snapshot for any project/scheme question
- `lender.getDeepContext` + `lender.matchForDeal` — for lender-side queries + deal-to-lender matching
- `skillRun.start` + `skillRun.complete` — the envelope every skill execution lives inside

## Layout

```
skills/
├── README.md                 (this file)
├── CATALOGUE.md              (MCP tool catalogue — start here)
├── CONVENTIONS.md            (cross-skill voice + style rules)
├── SETUP.md                  (initial setup)
├── skills/                   (workflow-mode SKILL.md files)
│   └── README.md             (skill index — status table + lifecycle map)
├── sub-skills/               (Claude-side primitives reused across skills)
├── corpora/                  (anonymised exemplars per skill)
├── templates/                (XLSX/DOCX/PDF templates)
├── shared-references/        (cross-skill references)
└── inventory/                (app-side audit: tables, integrations, etc.)
```

## Boundary rules (still in force)

These rules apply from the first commit and are non-negotiable:

1. **Skills never import from app code.** Skills are markdown files; they have no imports. App access goes through the MCP server.
2. **App code never imports from skills.** The MCP server authenticates the user and dispatches the tool; it has no awareness of the calling skill.
3. **No shared utility code straddles the boundary.** If something is needed by both, it lives in the app and is exposed via MCP.
4. **The app build ignores this directory.** The Next.js app lives in `model-testing-app/`, so `skills/` is already outside its tsconfig include scope. See `inventory/06-monorepo-discipline.md`.
5. **CI triggers are path-based.** Changes touching only `skills/` should not redeploy the app. (Flagged as a gap in the discipline doc.)
6. **Commit messages prefix** with `[app]`, `[skills]`, `[skill]`, or `[both]`. Pure-skills and pure-app commits will split cleanly at separation time.

## Maintaining discoverability (critical)

The catalogue + skill index are the operator-agent's primary discovery surface. They drift fast if not maintained.

**When you add or remove an MCP tool:** update `CATALOGUE.md` in the same commit. Drift between the live tool list and the catalogue silently degrades Claude Code's tool selection.

**When you create or harden a skill:** update `skills/README.md` status table + lifecycle map in the same commit.

**When you add a reference file under a skill's `references/`:** add it to that SKILL.md's References section in the same commit.

The cost of staying disciplined is small (a one-line edit per change). The cost of letting it drift compounds — at 68 tools and 16 skills, Claude Code can already only pick well if the documentation is accurate.

## Version timeline

- **v1.0** (initial): skills tree scaffolded; 16 skill skeletons authored
- **v1.1**: cadence-fire substrate + meeting-prep responder mode + reply event processor
- **v1.2**: prospects CRM substrate + MCP server (~25 tools) + prospect-intel hardened to v3
- **v1.3 Sprints A-F**: reply visibility + deep-context tools (prospect/client/project/lender) + qualify-and-draft + meeting flow + cadence flexibility + documents/checklists + lender substrate. 68 MCP tools. 5 skills v2-hardened.
- **v1.3 Sprint G**: wire 4 deferred MCP writers — `intelligence.addKnowledgeItem`, `task.create`, `document.createFromGeneration`, `project.addLenderRole`. 72 MCP tools / 19 domains. qualify-and-draft + meeting-capture SKILL.md gap-fallback language removed (tools now in workflow directly).
- **v1.4 Sprint H**: misclassification fixer MCP tools — `document.updateClassification`, `checklist.linkDocument`, `checklist.unlinkDocument`. 75 MCP tools / 19 domains. Substrate prerequisite for deal-intake hardening (skill needs to be able to correct V4 ingestion misfires it observes during the workflow).
- **v1.4 Sprint I**: deal-intake skill v2-hardened. 5 reference files (deal-type-and-phase-detection, document-vocabulary-catalogue, filename-extraction-patterns, misclassification-audit-playbook with 6 checks, spv-structure-canon as shared). New corrections corpus (`corpora/document-classification-corrections.md`) with 5 real entries + feedback-loop design. 2 new MCP tools (`client.activate`, `project.create`) closing the lifecycle-transition substrate gap. 77 MCP tools / 19 domains. The skill is the lynchpin moment: prospect → active client + project creation + intelligence + audit. 6 skills now v2-hardened.
- **v1.4+ (pending)**: terms-package-build + ic-paper-drafter hardening; xlsx content extraction MCP; behavioural lender signal cron; substrate cleanups jotted in `.logbook/inbox.md` (frontend-vs-MCP divergence on `client.list`, empty `projectIntelligence` rows from legacy table, folder-validation bug, vocabulary drift).
