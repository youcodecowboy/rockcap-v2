# RockCap App Inventory

This directory is the audit of the existing RockCap NextJS + Convex application at `model-testing-app/`. It is the substrate the skills tree will sit on top of. It exists to settle facts before any skill is written.

## Audit context

- **Branch**: `claude/audit-app-inventory-ngHuP`
- **Date**: 2026-05-19
- **Scope**: read-only audit of `model-testing-app/` (the Next.js + Convex app), `mobile-app/` (Expo client), and supporting docs. No code was modified.
- **Method**: parallel exploration agents per slice (atomic tools, Convex schema, Convex backend modules, integrations, in-app Claude logic), synthesised into the documents below.

## Files

| File | Contents |
|---|---|
| [`01-atomic-tools.md`](./01-atomic-tools.md) | The full atomic-tool catalogue (`src/lib/tools/domains/*.tools.ts`), 18 domains, 150 tools, with names, actions, parameters, Convex mappings, confirmation requirements. |
| [`02-convex-schema.md`](./02-convex-schema.md) | All 84 Convex tables grouped by logical area, plus the gap analysis against the target entity list from the brief (Person, Organisation, Role, LenderApproach, InformationRequest, Milestone, Cadence, LenderProfile, AppetiteSignal, Touchpoint, Approval). |
| [`03-convex-backend.md`](./03-convex-backend.md) | All 863 exported Convex queries, mutations, actions, internal variants, and crons across 80+ top-level files and the `hubspotSync/` subdirectory. |
| [`04-integrations.md`](./04-integrations.md) | Eight integrations (5 active, 1 passive, 2 stubs) with wiring, direction, invocation, credential handling, sync model, entities touched, quirks. Full env var list and third-party SDK list. |
| [`05-in-app-claude-logic.md`](./05-in-app-claude-logic.md) | The in-app agents, skills, API routes, and significant prompts. Dual-track V3 (Together.ai + OpenAI multi-stage) and V4 (Claude-native) pipelines documented. Each agent classified as deterministic / judgement-carrying / hybrid. |
| [`06-monorepo-discipline.md`](./06-monorepo-discipline.md) | The current state of the boundary between app and skills, gaps versus the hard rules in the brief, recommendations. |

## Executive summary

**Repository layout differs from the brief.** The brief assumed the Next.js app at repo root with `convex/`, `app/`, `components/`, `lib/` at the top level. The actual layout has the Next.js app nested in `model-testing-app/` and a separate `mobile-app/` Expo project. This is a happy accident for the boundary discipline because `skills/` at the repo root sits naturally outside both subprojects.

**The atomic-tool count is roughly double the brief's estimate.** The brief mentions "roughly 75 atomic tools". The actual catalogue at `model-testing-app/src/lib/tools/domains/*.tools.ts` is **150 tools across 18 domains**. The tool-description-audit step in the brief is correspondingly larger work than the brief budgeted for, and the conversational-mode tool surface is already richer than the brief described.

**Convex backend is larger and broader than the brief suggested.** 863 exported functions across roughly 80 top-level Convex files, plus the `hubspotSync/` subdirectory (14 files, 47 exports). Many backend functions are not surfaced as atomic tools, so the conversational-mode surface is a real subset of the Convex surface, not the whole of it.

**The schema already covers most of the target entities but with naming and structure mismatches.** Of the brief's 14 target entities (Person, Organisation, Role, Deal, LenderApproach, InformationRequest, Milestone, Document, Meeting, Cadence, LenderProfile, AppetiteSignal, Touchpoint, Approval): three are clearly present under different names (Deal as `deals`, Document as `documents`, Meeting as `meetings`), four are partially present (Organisation split across `companies` + `clients` + `companiesHouseCompanies`; Role embedded in `contacts.role`; Touchpoint embedded in `activities`; LenderProfile embedded in `clientIntelligence.lenderProfile`), and seven are missing entirely (Person as a unified table, LenderApproach, InformationRequest as graded checklist, Milestone with dependency graph, Cadence, AppetiteSignal with provenance, Approval). The Deal-versus-Project duality (`deals` from HubSpot prospecting versus `projects` for internal financings) is the most consequential structural question the schema gap analysis raises.

**The AI pipeline is mid-migration.** A V3 stack using Together.ai Llama 70B for summary/classification/checklist/verification stages and OpenAI GPT-4o as a conditional critic still runs the legacy bulk-analyze and queue paths. A V4 stack using Anthropic Claude (Haiku 4.5 for real-time work, Opus/Sonnet for batch classification) with prompt caching and the Anthropic Agent Skills pattern handles new chat, deep extraction, meeting extraction, and the modern batch pipeline. Some routes overlap and could be consolidated; some V3 routes appear unused.

**Five integrations are live, one is passive, two are stubs.** Active: HubSpot (bidirectional, 6h cron + webhooks), Google Calendar (read-only, 30min cron + push channels), Companies House (read-only, on-demand), Fireflies (passive content-based detection of transcripts within HubSpot notes, no direct API), Anthropic (on-demand, prompt-cached). Passive: Beauhurst is display-only from HubSpot custom properties; no direct API integration despite being in the brief. Stubs: HM Land & Property Data API client exists but is uninvoked; `together-ai` and `openai` SDKs are installed but not actively wired beyond the V3 pipeline noted above.

**Boundary discipline is in good shape de facto, but not codified.** The `skills/` tree at repo root sits outside both `model-testing-app/tsconfig.json`'s include scope and `mobile-app/`'s. There is no path-based CI gating, no commit-message-prefix convention in the existing git log, and no documented rule. The brief's hard rules can be adopted now with minimal change. See `06-monorepo-discipline.md`.

## What this audit deliberately does not do

- It does not refactor anything. The brief is explicit on this point.
- It does not propose new tool names, new schema, or new skill scaffolding. Those are downstream steps (steps 2, 4, 5 in the brief's priority list). The findings here feed those steps.
- It does not run the application or its tests. The audit is a code read.
- It does not exhaustively review every line of every file. It enumerates exports, schemas, integrations, and routes; per-tool description quality (step 2 of the brief) is a separate exercise that will use this catalogue as input.

## Contradictions and corrections to the brief

These are the points where reality refines what the brief assumed. They are catalogued here so the next round of design conversation starts from the actual codebase, not the synthesised picture.

1. **Atomic-tool count**: brief says ~75, actual is 150. Step 2 of the brief (tool description audit) is twice the work budgeted.
2. **App location**: brief assumes repo-root Next.js, actual is `model-testing-app/`. Boundary discipline rules need to be restated against the real layout. Specifically: the brief's rule "tsconfig.json excludes skills/" is satisfied by the app being nested rather than by an exclude entry.
3. **HubSpot integration scope**: brief says "full read/write permissions". Actual writes back are limited (linked IDs, archive timestamps, sync state) rather than full bidirectional CRUD. Closer to "read-heavy with thin write-back" than "bidirectional".
4. **Beauhurst integration**: brief lists Beauhurst as an integrated source. Actually no direct Beauhurst API calls exist. Data arrives via HubSpot custom properties populated by an external Beauhurst ↔ HubSpot integration. Treat Beauhurst as a HubSpot-mediated read-through, not an integration in its own right, until the architecture chooses otherwise.
5. **Fireflies integration**: brief lists Fireflies as an integration. Actually a passive content-based detector running against HubSpot note bodies, not a direct Fireflies API integration. Works today, fragile if the Fireflies HTML template changes.
6. **Deal as a single transaction attempt**: brief defines Deal this way, with `predecessor_deal_id` for re-engagement. The current `deals` table is the HubSpot deals projection, used during prospecting; `projects` is the internal financing-tracking table used after a deal becomes real. The brief's "Deal" concept maps closer to `projects` than to `deals`. The naming will need resolving before LenderApproach, InformationRequest, and Milestone tables hang off it.
7. **Prospect-intel skill as canonical**: the brief refers to an existing `prospect-intel` SKILL.md as the canonical pattern. No such file exists in this repo. Either it lives elsewhere (in a separate skills repo, an external scratch), or the brief is forward-looking. The skill scaffolding step (step 5 of the brief) will need a real canonical pattern to follow.
8. **75 atomic tools versus 863 Convex exports**: the conversational-mode tool surface is a designed subset of the backend, not a mirror. The 150 tools in the registry expose roughly 17% of the backend surface area. That is fine but worth being explicit about: any conversational request that hits an unexposed Convex function will fail. The tool-description audit (step 2) should be paired with a coverage check against the routes Convex queries.

## Where to go next

In the order the brief proposes:

1. **Tool description audit** (`01-atomic-tools.md` is the input). For each of the 150 tools, decide name predictability, namespace, description quality, parameter schema tightness. The biggest namespace question is whether to keep `client` and `project` as separate domains or unify them under `deal` once the Deal/Project naming is resolved.
2. **Skill-vs-tool boundary decisions** (`05-in-app-claude-logic.md` is the input). The Critic Agent (judgement-carrying) is a clear skill candidate. The Filename Matcher and Deterministic Verifier are clearly tools. The V4 pipeline is the harder call: it carries judgement but is currently invoked as one big API call. Most likely it splits, with the orchestration moving to a skill and the per-stage primitives staying in the app.
3. **Target schema gap analysis** (`02-convex-schema.md` is the input). Seven missing entities, four partials, three structural questions to resolve. Person and the Deal/Project naming dominate.
4. **Cross-cutting primitives** (`03-convex-backend.md` and `05-in-app-claude-logic.md` are the inputs). Coarse-grained `deal.get_full_context`, parameterised `document.extract`, parameterised `template.populate`, cadence scheduling engine, approval queue surface. Each of these may already be partly built; the inventory shows which.
5. **Monorepo discipline codification** (`06-monorepo-discipline.md` is the input). Add path-based CI triggers, commit-message convention, lint check that nothing in `skills/` imports app code.
