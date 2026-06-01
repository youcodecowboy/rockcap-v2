# RockCap Skills Library

Skills, sub-skills, references, corpora, and templates that power the RockCap Claude Code workflows. Lives inside the app monorepo temporarily, per the project brief, but is conceptually a separate system destined for its own repository.

## Where to look first

If you're an operator-agent (Claude Code) figuring out where to start:

1. **`CATALOGUE.md`** — every MCP tool (117 across 23 domains), grouped by domain, with "when to use" guidance and common-pattern cookbooks. **Start here for tool discovery.**
2. **`skills/README.md`** — the skill index. Lists all 21 skills with maturity status (v2-hardened vs skeleton) and lifecycle mapping.
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

The cost of staying disciplined is small (a one-line edit per change). The cost of letting it drift compounds — at 117 tools and 21 skills, Claude Code can already only pick well if the documentation is accurate. (This is now also enforced mechanically: `tools/validate-skills.mjs` blocks any commit that references a non-existent tool — see `CLAUDE.md` + `skill-forge`.)

## Version timeline

- **v1.0** (initial): skills tree scaffolded; 16 skill skeletons authored
- **v1.1**: cadence-fire substrate + meeting-prep responder mode + reply event processor
- **v1.2**: prospects CRM substrate + MCP server (~25 tools) + prospect-intel hardened to v3
- **v1.3 Sprints A-F**: reply visibility + deep-context tools (prospect/client/project/lender) + qualify-and-draft + meeting flow + cadence flexibility + documents/checklists + lender substrate. 68 MCP tools. 5 skills v2-hardened.
- **v1.3 Sprint G**: wire 4 deferred MCP writers — `intelligence.addKnowledgeItem`, `task.create`, `document.createFromGeneration`, `project.addLenderRole`. 72 MCP tools / 19 domains. qualify-and-draft + meeting-capture SKILL.md gap-fallback language removed (tools now in workflow directly).
- **v1.4 Sprint H**: misclassification fixer MCP tools — `document.updateClassification`, `checklist.linkDocument`, `checklist.unlinkDocument`. 75 MCP tools / 19 domains. Substrate prerequisite for deal-intake hardening (skill needs to be able to correct V4 ingestion misfires it observes during the workflow).
- **v1.4 Sprint I**: deal-intake skill v2-hardened. 5 reference files (deal-type-and-phase-detection, document-vocabulary-catalogue, filename-extraction-patterns, misclassification-audit-playbook with 6 checks, spv-structure-canon as shared). New corrections corpus (`corpora/document-classification-corrections.md`) with 5 real entries + feedback-loop design. 2 new MCP tools (`client.activate`, `project.create`) closing the lifecycle-transition substrate gap. 77 MCP tools / 19 domains. The skill is the lynchpin moment: prospect → active client + project creation + intelligence + audit. 6 skills now v2-hardened.
- **v1.4 Sprint K**: lender substrate prep for terms-package-build. New shared canon `shared-references/lender-submission-requirements-canon.md` defines the per-lender Submission Requirements doc structure (8 sections: Identity, Submission preferences, Content emphasis, Credit committee, Appetite envelope, Submission history, Past wins/losses, Provenance). 2 new MCP tools (`lender.setSubmissionRequirements`, `lender.getSubmissionRequirements`) wrapping `document.createFromGeneration` + `document.getByClient`. 79 MCP tools / 19 domains. Phase 2 (operator-driven): seed 3+ real lenders (Shawbrook, Octane, Falco etc.) from production HoTs evidence + operator domain knowledge to populate substrate that downstream skills (terms-package-build, terms-comparison, ic-paper-drafter, info-request-grader, monitoring-watcher) depend on.
- **post-Sprint-K consolidation (2026-06-01, pre-skill-forge)**: corporate-group + Companies House surface (`companies.searchCompaniesHouse` / `getOfficerAppointments` / `getGroupCharges` / `getProspectSchemes` / `upsertProspectScheme` / `getLenderTierConflict` / `mapGroup`), contact CRUD (`contact.create` / `update`), corporate-structure rendering (`structure.renderChart`), docgen surface (`document.generate` / `generateBrief` / `generateComps`), outreach-ready gate (`client.markOutreachReady` / `clearOutreachReady` / `listOutreachReady`), client-context-capture lane (`intelligence.appendContext` + `note.create` / `update` / `listByClient` / `listByProject`), and the knowledge surface (`intelligence.getKnowledgeItemsByClient` / `updateClientIntelligence`; `prospect.getDeepContext` now returns `knowledgeItems`). New skills: `outreach-draft`, `client-context-capture`, `corporate-structure`, `document-author`. **107 MCP tools / 21 domains. 20 skills (8 v2-hardened).**
- **skill-forge + self-service editing (2026-06-01)**: `skill-forge` skill (the skill that edits skills, with hard guardrails) + `meta.listTools` MCP tool (self-describing catalogue) + `tools-manifest.json` + `tools/validate-skills.mjs` hard gate (blocks any commit referencing a non-existent tool) + git automation hooks (`.claude/settings.json`: pull-on-start, validate-on-commit, push-on-save) + `CLAUDE.md` + `GUIDE.md` for non-technical editors. GitHub becomes the central brain; non-technical operators improve skills without touching git. **108 MCP tools / 22 domains. 21 skills.**
- **close-the-loop MCP writes (2026-06-01)**: from an early-lifecycle audit (a fresh MCP-only user could draft everything but *send* nothing and *ingest* nothing). Added the highest-leverage tools — **outbound:** `approval.approve` / `approval.reject` (actually fire/discard a staged action — unblocks 5 stages), `cadence.approvePackage` / `cadence.denyPackage` (fire/discard a cold-outreach sequence); **onboarding:** `client.create` (seed a net-new borrower/developer prospect — counterpart to `lender.create`); **inbound document ingestion:** `document.requestUpload` (pre-signed Convex upload URL) + `document.analyze` (storageId → V4 classifier → filed documents row). The "drop docs → analyzed → filed" path now works MCP-only — bytes go machine→Convex directly (never through model context), mirroring `convex/bulkBackgroundProcessor.ts`. All wrap existing backend; new code: `approvals.approveInternal`. **115 MCP tools / 22 domains.** Still open from the audit (lower priority): `bulkUpload.getBatchItems` + `checklist.initializeForProject` (remove last CLI fallbacks), calendar write-back for real meeting booking, spreadsheet content extraction.
- **v1.4+ (pending)**: terms-package-build + ic-paper-drafter hardening; xlsx content extraction MCP; behavioural lender signal cron; substrate cleanups jotted in `.logbook/inbox.md` (frontend-vs-MCP divergence on `client.list`, empty `projectIntelligence` rows from legacy table, vocabulary drift, userId-optional internal mutations for skill contexts).
